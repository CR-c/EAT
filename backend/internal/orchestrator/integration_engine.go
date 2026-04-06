package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	integrationRunStatusQueued         = "QUEUED"
	integrationRunStatusRunning        = "RUNNING"
	integrationRunStatusCompleted      = "COMPLETED"
	integrationRunStatusActionRequired = "ACTION_REQUIRED"

	integrationQueueItemStatusQueued     = "QUEUED"
	integrationQueueItemStatusMerged     = "MERGED"
	integrationQueueItemStatusFailed     = "FAILED"
	integrationQueueItemStatusDequeued   = "DEQUEUED"
	integrationQueueItemStatusReleased   = "RELEASED"
	integrationQueueItemStatusRolledBack = "ROLLED_BACK"

	defaultIntegrationPollInterval = 5 * time.Second
)

var errIntegrationRunRoutedToActionRequired = errors.New("integration run routed to action required")

// IntegrationRunRecord is the minimal integration run shape required by the engine.
type IntegrationRunRecord struct {
	ID                string
	TaskID            string
	IntegrationBranch string
	Status            string
	StartedAt         *string
	EndedAt           *string
	CreatedAt         string
	UpdatedAt         string
}

// IntegrationQueueItemRecord is the minimal queue item shape required by the engine.
type IntegrationQueueItemRecord struct {
	ID               string
	IntegrationRunID string
	SubTaskID        string
	QueueOrder       int64
	Status           string
	MergedCommitSHA  *string
	CreatedAt        string
	UpdatedAt        string
}

type UpdateIntegrationRunInput struct {
	Status       *string
	StartedAt    *string
	SetStartedAt bool
	EndedAt      *string
	SetEndedAt   bool
}

type UpdateIntegrationQueueItemInput struct {
	Status          *string
	MergedCommitSHA *string
	SetMergedCommit bool
}

type CreateGateResultInput struct {
	IntegrationRunID string
	GateType         string
	Status           string
	Summary          string
	DetailsJSON      map[string]any
}

// IntegrationRuntimeRepository defines the integration runtime operations needed by the engine.
type IntegrationRuntimeRepository interface {
	ListIntegrationRunsByStatuses(ctx context.Context, statuses []string, limit int) ([]IntegrationRunRecord, error)
	ListIntegrationQueueItemsByIntegrationRunID(ctx context.Context, integrationRunID string) ([]IntegrationQueueItemRecord, error)
	UpdateIntegrationRun(ctx context.Context, integrationRunID string, input UpdateIntegrationRunInput) (*IntegrationRunRecord, error)
	UpdateIntegrationQueueItem(ctx context.Context, integrationQueueItemID string, input UpdateIntegrationQueueItemInput) (*IntegrationQueueItemRecord, error)
	CreateGateResult(ctx context.Context, input CreateGateResultInput) error

	FindTaskByID(ctx context.Context, taskID string) (*TaskRecord, error)
	FindSubTaskByID(ctx context.Context, subTaskID string) (*SubTaskRecord, error)
	UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) error
	UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) error
	CreateMessage(ctx context.Context, input CreateMessageInput) error
}

// IntegrationRuntimeSnapshot captures the latest queue processing view.
type IntegrationRuntimeSnapshot struct {
	LastTickAtUTC       string `json:"lastTickAtUtc"`
	ProcessedRuns       int    `json:"processedRuns"`
	QueuedRuns          int    `json:"queuedRuns"`
	RunningRuns         int    `json:"runningRuns"`
	LastError           string `json:"lastError,omitempty"`
	InFlightRunCount    int    `json:"inFlightRunCount"`
	PollIntervalSeconds int    `json:"pollIntervalSeconds"`
}

// IntegrationEngine consumes integration runs and advances queue/run state.
type IntegrationEngine struct {
	pollInterval time.Duration

	mu       sync.Mutex
	inFlight map[string]struct{}
	snapshot IntegrationRuntimeSnapshot
}

func NewIntegrationEngine(pollInterval time.Duration) *IntegrationEngine {
	if pollInterval <= 0 {
		pollInterval = defaultIntegrationPollInterval
	}
	return &IntegrationEngine{
		pollInterval: pollInterval,
		inFlight:     make(map[string]struct{}),
		snapshot: IntegrationRuntimeSnapshot{
			PollIntervalSeconds: int(pollInterval / time.Second),
		},
	}
}

func (ie *IntegrationEngine) PollInterval() time.Duration {
	return ie.pollInterval
}

func (ie *IntegrationEngine) Snapshot() IntegrationRuntimeSnapshot {
	ie.mu.Lock()
	defer ie.mu.Unlock()
	return ie.snapshot
}

func (ie *IntegrationEngine) Tick(ctx context.Context, repo IntegrationRuntimeRepository, publish func(taskID, eventName string, data map[string]any)) {
	if repo == nil {
		return
	}

	statuses := []string{integrationRunStatusQueued, integrationRunStatusRunning}
	runs, err := repo.ListIntegrationRunsByStatuses(ctx, statuses, 32)
	if err != nil {
		ie.recordSnapshot(len(runs), 0, 0, err.Error(), 0)
		return
	}

	queuedRuns := 0
	runningRuns := 0
	for _, run := range runs {
		switch run.Status {
		case integrationRunStatusQueued:
			queuedRuns++
		case integrationRunStatusRunning:
			runningRuns++
		}
	}

	processed := 0
	lastErr := ""
	for _, run := range runs {
		if !ie.claimRun(run.ID) {
			continue
		}

		if processErr := ie.processRun(ctx, repo, run, publish); processErr != nil {
			if errors.Is(processErr, errIntegrationRunRoutedToActionRequired) {
				processed++
			} else {
				lastErr = processErr.Error()
			}
		} else {
			processed++
		}
		ie.releaseRun(run.ID)
	}

	ie.recordSnapshot(queuedRuns, runningRuns, processed, lastErr, ie.inFlightCount())
}

func (ie *IntegrationEngine) processRun(ctx context.Context, repo IntegrationRuntimeRepository, run IntegrationRunRecord, publish func(taskID, eventName string, data map[string]any)) error {
	taskRecord, err := repo.FindTaskByID(ctx, run.TaskID)
	if err != nil {
		return fmt.Errorf("find task %s: %w", run.TaskID, err)
	}
	if taskRecord == nil {
		return nil
	}
	if taskRecord.Status != "MERGING" && taskRecord.Status != "ACTION_REQUIRED" {
		return nil
	}

	activeRun := run
	if run.Status == integrationRunStatusQueued {
		startedAt := time.Now().UTC().Format(time.RFC3339Nano)
		runningStatus := integrationRunStatusRunning
		updatedRun, updateErr := repo.UpdateIntegrationRun(ctx, run.ID, UpdateIntegrationRunInput{
			Status:       &runningStatus,
			StartedAt:    &startedAt,
			SetStartedAt: true,
		})
		if updateErr != nil {
			return fmt.Errorf("set integration run %s running: %w", run.ID, updateErr)
		}
		if updatedRun != nil {
			activeRun = *updatedRun
		}
		publish(run.TaskID, "integration:started", map[string]any{
			"integrationRunId": run.ID,
			"status":           integrationRunStatusRunning,
			"taskId":           run.TaskID,
		})
	}

	queueItems, err := repo.ListIntegrationQueueItemsByIntegrationRunID(ctx, run.ID)
	if err != nil {
		return fmt.Errorf("list integration queue items for run %s: %w", run.ID, err)
	}

	for _, item := range queueItems {
		switch item.Status {
		case integrationQueueItemStatusDequeued, integrationQueueItemStatusRolledBack, integrationQueueItemStatusReleased:
			continue
		case integrationQueueItemStatusMerged:
			continue
		case integrationQueueItemStatusQueued:
			if itemErr := ie.processQueueItem(ctx, repo, activeRun, item, taskRecord, publish); itemErr != nil {
				return itemErr
			}
		default:
			return ie.failRun(ctx, repo, activeRun, item.ID, fmt.Sprintf("Queue item %s entered unsupported status %s during integration run.", item.ID, item.Status), publish)
		}
	}

	refreshedItems, err := repo.ListIntegrationQueueItemsByIntegrationRunID(ctx, run.ID)
	if err != nil {
		return fmt.Errorf("reload integration queue items for run %s: %w", run.ID, err)
	}
	for _, item := range refreshedItems {
		switch item.Status {
		case integrationQueueItemStatusMerged:
			releasedStatus := integrationQueueItemStatusReleased
			if _, updateErr := repo.UpdateIntegrationQueueItem(ctx, item.ID, UpdateIntegrationQueueItemInput{
				Status: &releasedStatus,
			}); updateErr != nil {
				return fmt.Errorf("release integration queue item %s: %w", item.ID, updateErr)
			}
		case integrationQueueItemStatusFailed:
			return ie.failRun(ctx, repo, activeRun, item.ID, fmt.Sprintf("Queue item %s failed during integration run.", item.ID), publish)
		}
	}

	completedStatus := integrationRunStatusCompleted
	endedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := repo.UpdateIntegrationRun(ctx, run.ID, UpdateIntegrationRunInput{
		Status:     &completedStatus,
		EndedAt:    &endedAt,
		SetEndedAt: true,
	}); err != nil {
		return fmt.Errorf("set integration run %s completed: %w", run.ID, err)
	}
	if err := ie.recordGateResult(ctx, repo, CreateGateResultInput{
		IntegrationRunID: run.ID,
		GateType:         "INTEGRATION_QUEUE",
		Status:           "PASSED",
		Summary:          "Integration queue merged and released successfully.",
		DetailsJSON: map[string]any{
			"integrationBranch": activeRun.IntegrationBranch,
			"queueItemCount":    len(refreshedItems),
			"taskId":            run.TaskID,
		},
	}); err != nil {
		return err
	}

	publish(run.TaskID, "integration:gate-result", map[string]any{
		"gateType":         "INTEGRATION_QUEUE",
		"integrationRunId": run.ID,
		"status":           "PASSED",
		"summary":          "Integration queue merged and released successfully.",
		"taskId":           run.TaskID,
	})
	publish(run.TaskID, "integration:completed", map[string]any{
		"integrationRunId": run.ID,
		"status":           integrationRunStatusCompleted,
		"taskId":           run.TaskID,
	})

	completedTaskStatus := "COMPLETED"
	if err := repo.UpdateTask(ctx, run.TaskID, UpdateTaskInput{
		Status:    stringPointer(completedTaskStatus),
		LastError: nil,
	}); err != nil {
		return fmt.Errorf("set task %s completed after integration run: %w", run.TaskID, err)
	}
	publish(run.TaskID, "task:status", map[string]any{
		"status": completedTaskStatus,
		"taskId": run.TaskID,
	})

	return nil
}

func (ie *IntegrationEngine) processQueueItem(ctx context.Context, repo IntegrationRuntimeRepository, run IntegrationRunRecord, item IntegrationQueueItemRecord, taskRecord *TaskRecord, publish func(taskID, eventName string, data map[string]any)) error {
	subTask, err := repo.FindSubTaskByID(ctx, item.SubTaskID)
	if err != nil {
		return fmt.Errorf("find subtask %s for integration queue item %s: %w", item.SubTaskID, item.ID, err)
	}
	if subTask == nil {
		return ie.failRun(ctx, repo, run, item.ID, fmt.Sprintf("Subtask %s no longer exists for integration queue item %s.", item.SubTaskID, item.ID), publish)
	}

	eligible := subTask.Status == "ACCEPTED" || subTask.Status == "MERGED" || subTask.Status == "COMPLETED"
	if !eligible {
		return ie.failRun(ctx, repo, run, item.ID, fmt.Sprintf("Subtask %s is not ready for integration (status=%s).", subTask.ID, subTask.Status), publish)
	}

	mergedStatus := integrationQueueItemStatusMerged
	if _, err := repo.UpdateIntegrationQueueItem(ctx, item.ID, UpdateIntegrationQueueItemInput{
		Status: &mergedStatus,
	}); err != nil {
		return fmt.Errorf("mark integration queue item %s as merged: %w", item.ID, err)
	}

	if subTask.Status != "MERGED" {
		if err := repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
			Status: stringPointer("MERGED"),
		}); err != nil {
			return fmt.Errorf("mark subtask %s as merged: %w", subTask.ID, err)
		}
		publish(taskRecord.ID, "subtask:status", map[string]any{
			"status":    "MERGED",
			"subTaskId": subTask.ID,
			"taskId":    taskRecord.ID,
		})
	}

	return nil
}

func (ie *IntegrationEngine) failRun(ctx context.Context, repo IntegrationRuntimeRepository, run IntegrationRunRecord, queueItemID string, reason string, publish func(taskID, eventName string, data map[string]any)) error {
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		trimmedReason = "Integration runtime failed."
	}

	if queueItemID != "" {
		failedStatus := integrationQueueItemStatusFailed
		if _, err := repo.UpdateIntegrationQueueItem(ctx, queueItemID, UpdateIntegrationQueueItemInput{
			Status: &failedStatus,
		}); err != nil {
			return fmt.Errorf("mark integration queue item %s failed: %w", queueItemID, err)
		}
	}

	endedAt := time.Now().UTC().Format(time.RFC3339Nano)
	actionRequiredStatus := integrationRunStatusActionRequired
	if _, err := repo.UpdateIntegrationRun(ctx, run.ID, UpdateIntegrationRunInput{
		Status:     &actionRequiredStatus,
		EndedAt:    &endedAt,
		SetEndedAt: true,
	}); err != nil {
		return fmt.Errorf("mark integration run %s action required: %w", run.ID, err)
	}

	taskStatus := "ACTION_REQUIRED"
	if err := repo.UpdateTask(ctx, run.TaskID, UpdateTaskInput{
		Status:    stringPointer(taskStatus),
		LastError: &trimmedReason,
	}); err != nil {
		return fmt.Errorf("set task %s action required after integration failure: %w", run.TaskID, err)
	}

	_ = repo.CreateMessage(ctx, CreateMessageInput{
		TaskID:    run.TaskID,
		Role:      "SYSTEM",
		Content:   "Integration runtime: " + trimmedReason,
		SubTaskID: "",
	})
	if err := ie.recordGateResult(ctx, repo, CreateGateResultInput{
		IntegrationRunID: run.ID,
		GateType:         "INTEGRATION_QUEUE",
		Status:           "FAILED",
		Summary:          trimmedReason,
		DetailsJSON: map[string]any{
			"queueItemId": queueItemID,
			"reason":      trimmedReason,
			"taskId":      run.TaskID,
		},
	}); err != nil {
		return err
	}

	publish(run.TaskID, "integration:gate-result", map[string]any{
		"gateType":         "INTEGRATION_QUEUE",
		"integrationRunId": run.ID,
		"status":           "FAILED",
		"summary":          trimmedReason,
		"taskId":           run.TaskID,
	})
	publish(run.TaskID, "integration:failed", map[string]any{
		"integrationRunId": run.ID,
		"reason":           trimmedReason,
		"status":           actionRequiredStatus,
		"taskId":           run.TaskID,
	})
	publish(run.TaskID, "task:status", map[string]any{
		"status": taskStatus,
		"taskId": run.TaskID,
	})

	return errIntegrationRunRoutedToActionRequired
}

func (ie *IntegrationEngine) recordGateResult(ctx context.Context, repo IntegrationRuntimeRepository, input CreateGateResultInput) error {
	if err := repo.CreateGateResult(ctx, input); err != nil {
		return fmt.Errorf("persist gate result for integration run %s: %w", input.IntegrationRunID, err)
	}
	return nil
}

func stringPointer(value string) *string {
	return &value
}

func (ie *IntegrationEngine) claimRun(runID string) bool {
	ie.mu.Lock()
	defer ie.mu.Unlock()
	if _, exists := ie.inFlight[runID]; exists {
		return false
	}
	ie.inFlight[runID] = struct{}{}
	return true
}

func (ie *IntegrationEngine) releaseRun(runID string) {
	ie.mu.Lock()
	defer ie.mu.Unlock()
	delete(ie.inFlight, runID)
}

func (ie *IntegrationEngine) inFlightCount() int {
	ie.mu.Lock()
	defer ie.mu.Unlock()
	return len(ie.inFlight)
}

func (ie *IntegrationEngine) recordSnapshot(queued, running, processed int, lastErr string, inFlight int) {
	ie.mu.Lock()
	defer ie.mu.Unlock()
	ie.snapshot = IntegrationRuntimeSnapshot{
		LastTickAtUTC:       time.Now().UTC().Format(time.RFC3339Nano),
		ProcessedRuns:       processed,
		QueuedRuns:          queued,
		RunningRuns:         running,
		LastError:           strings.TrimSpace(lastErr),
		InFlightRunCount:    inFlight,
		PollIntervalSeconds: int(ie.pollInterval / time.Second),
	}
}

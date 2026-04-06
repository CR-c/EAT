package orchestrator

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

type integrationEvent struct {
	Data   map[string]any
	Name   string
	TaskID string
}

type fakeIntegrationRepo struct {
	mu sync.Mutex

	gateResults []CreateGateResultInput
	messages    []CreateMessageInput
	queueItems  map[string]*IntegrationQueueItemRecord
	runs        map[string]*IntegrationRunRecord
	subTaskErr  map[string]*string
	subTasks    map[string]*SubTaskRecord
	taskErr     map[string]*string
	tasks       map[string]*TaskRecord
}

func newFakeIntegrationRepo() *fakeIntegrationRepo {
	return &fakeIntegrationRepo{
		queueItems: make(map[string]*IntegrationQueueItemRecord),
		runs:       make(map[string]*IntegrationRunRecord),
		subTaskErr: make(map[string]*string),
		subTasks:   make(map[string]*SubTaskRecord),
		taskErr:    make(map[string]*string),
		tasks:      make(map[string]*TaskRecord),
	}
}

func (r *fakeIntegrationRepo) ListIntegrationRunsByStatuses(ctx context.Context, statuses []string, limit int) ([]IntegrationRunRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	allowed := make(map[string]struct{}, len(statuses))
	for _, status := range statuses {
		allowed[status] = struct{}{}
	}

	items := make([]IntegrationRunRecord, 0, len(r.runs))
	for _, run := range r.runs {
		if _, ok := allowed[run.Status]; !ok {
			continue
		}
		items = append(items, *run)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt == items[j].CreatedAt {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt < items[j].CreatedAt
	})
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

func (r *fakeIntegrationRepo) ListIntegrationQueueItemsByIntegrationRunID(ctx context.Context, integrationRunID string) ([]IntegrationQueueItemRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	items := make([]IntegrationQueueItemRecord, 0)
	for _, item := range r.queueItems {
		if item.IntegrationRunID != integrationRunID {
			continue
		}
		items = append(items, *item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].QueueOrder == items[j].QueueOrder {
			return items[i].ID < items[j].ID
		}
		return items[i].QueueOrder < items[j].QueueOrder
	})
	return items, nil
}

func (r *fakeIntegrationRepo) UpdateIntegrationRun(ctx context.Context, integrationRunID string, input UpdateIntegrationRunInput) (*IntegrationRunRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	run, ok := r.runs[integrationRunID]
	if !ok {
		return nil, nil
	}
	if input.Status != nil {
		run.Status = *input.Status
	}
	if input.SetStartedAt {
		run.StartedAt = input.StartedAt
	}
	if input.SetEndedAt {
		run.EndedAt = input.EndedAt
	}
	run.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	copied := *run
	return &copied, nil
}

func (r *fakeIntegrationRepo) UpdateIntegrationQueueItem(ctx context.Context, integrationQueueItemID string, input UpdateIntegrationQueueItemInput) (*IntegrationQueueItemRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	item, ok := r.queueItems[integrationQueueItemID]
	if !ok {
		return nil, nil
	}
	if input.Status != nil {
		item.Status = *input.Status
	}
	if input.SetMergedCommit {
		item.MergedCommitSHA = input.MergedCommitSHA
	}
	item.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	copied := *item
	return &copied, nil
}

func (r *fakeIntegrationRepo) FindTaskByID(ctx context.Context, taskID string) (*TaskRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return nil, nil
	}
	copied := *task
	return &copied, nil
}

func (r *fakeIntegrationRepo) FindSubTaskByID(ctx context.Context, subTaskID string) (*SubTaskRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	subTask, ok := r.subTasks[subTaskID]
	if !ok {
		return nil, nil
	}
	copied := *subTask
	return &copied, nil
}

func (r *fakeIntegrationRepo) UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return nil
	}
	if input.Status != nil {
		task.Status = *input.Status
	}
	if input.LastError != nil {
		value := *input.LastError
		r.taskErr[taskID] = &value
	} else {
		delete(r.taskErr, taskID)
	}
	return nil
}

func (r *fakeIntegrationRepo) UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	subTask, ok := r.subTasks[subTaskID]
	if !ok {
		return nil
	}
	if input.Status != nil {
		subTask.Status = *input.Status
	}
	if input.LastError != nil {
		value := *input.LastError
		r.subTaskErr[subTaskID] = &value
	} else {
		delete(r.subTaskErr, subTaskID)
	}
	return nil
}

func (r *fakeIntegrationRepo) CreateMessage(ctx context.Context, input CreateMessageInput) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.messages = append(r.messages, input)
	return nil
}

func (r *fakeIntegrationRepo) CreateGateResult(ctx context.Context, input CreateGateResultInput) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gateResults = append(r.gateResults, input)
	return nil
}

func (r *fakeIntegrationRepo) runStatus(runID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.runs[runID].Status
}

func (r *fakeIntegrationRepo) queueStatus(itemID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.queueItems[itemID].Status
}

func (r *fakeIntegrationRepo) taskStatus(taskID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.tasks[taskID].Status
}

func (r *fakeIntegrationRepo) taskError(taskID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if value, ok := r.taskErr[taskID]; ok && value != nil {
		return *value
	}
	return ""
}

func (r *fakeIntegrationRepo) subTaskStatus(subTaskID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.subTasks[subTaskID].Status
}

func (r *fakeIntegrationRepo) messageCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.messages)
}

func (r *fakeIntegrationRepo) gateResultsForRun(runID string) []CreateGateResultInput {
	r.mu.Lock()
	defer r.mu.Unlock()

	results := make([]CreateGateResultInput, 0, len(r.gateResults))
	for _, item := range r.gateResults {
		if item.IntegrationRunID == runID {
			results = append(results, item)
		}
	}
	return results
}

func TestIntegrationEngineTickCompletesQueuedRun(t *testing.T) {
	repo := newFakeIntegrationRepo()
	repo.tasks["task-1"] = &TaskRecord{ID: "task-1", Status: "MERGING"}
	repo.subTasks["sub-1"] = &SubTaskRecord{ID: "sub-1", TaskID: "task-1", Status: "ACCEPTED"}
	repo.subTasks["sub-2"] = &SubTaskRecord{ID: "sub-2", TaskID: "task-1", Status: "MERGED"}
	repo.runs["run-1"] = &IntegrationRunRecord{
		ID:        "run-1",
		TaskID:    "task-1",
		Status:    integrationRunStatusQueued,
		CreatedAt: "2026-04-06T00:00:00Z",
		UpdatedAt: "2026-04-06T00:00:00Z",
	}
	repo.queueItems["item-1"] = &IntegrationQueueItemRecord{
		ID:               "item-1",
		IntegrationRunID: "run-1",
		SubTaskID:        "sub-1",
		QueueOrder:       1,
		Status:           integrationQueueItemStatusQueued,
		CreatedAt:        "2026-04-06T00:00:01Z",
		UpdatedAt:        "2026-04-06T00:00:01Z",
	}
	repo.queueItems["item-2"] = &IntegrationQueueItemRecord{
		ID:               "item-2",
		IntegrationRunID: "run-1",
		SubTaskID:        "sub-2",
		QueueOrder:       2,
		Status:           integrationQueueItemStatusQueued,
		CreatedAt:        "2026-04-06T00:00:02Z",
		UpdatedAt:        "2026-04-06T00:00:02Z",
	}

	engine := NewIntegrationEngine(time.Second)
	events := make([]integrationEvent, 0)
	engine.Tick(context.Background(), repo, func(taskID, eventName string, data map[string]any) {
		payload := make(map[string]any, len(data))
		for key, value := range data {
			payload[key] = value
		}
		events = append(events, integrationEvent{TaskID: taskID, Name: eventName, Data: payload})
	})

	if got := repo.runStatus("run-1"); got != integrationRunStatusCompleted {
		t.Fatalf("expected run to be COMPLETED, got %s", got)
	}
	if got := repo.queueStatus("item-1"); got != integrationQueueItemStatusReleased {
		t.Fatalf("expected item-1 RELEASED, got %s", got)
	}
	if got := repo.queueStatus("item-2"); got != integrationQueueItemStatusReleased {
		t.Fatalf("expected item-2 RELEASED, got %s", got)
	}
	if got := repo.subTaskStatus("sub-1"); got != "MERGED" {
		t.Fatalf("expected sub-1 MERGED, got %s", got)
	}
	if got := repo.taskStatus("task-1"); got != "COMPLETED" {
		t.Fatalf("expected task-1 COMPLETED, got %s", got)
	}
	gateResults := repo.gateResultsForRun("run-1")
	if len(gateResults) != 1 {
		t.Fatalf("expected 1 gate result for run-1, got %d", len(gateResults))
	}
	if gateResults[0].Status != "PASSED" {
		t.Fatalf("expected PASSED gate result, got %s", gateResults[0].Status)
	}
	if gateResults[0].GateType != "INTEGRATION_QUEUE" {
		t.Fatalf("expected integration queue gate type, got %s", gateResults[0].GateType)
	}
	if gateResults[0].DetailsJSON["taskId"] != "task-1" {
		t.Fatalf("expected taskId detail on gate result, got %#v", gateResults[0].DetailsJSON)
	}

	expectEvent(t, events, "integration:started")
	expectEvent(t, events, "integration:gate-result")
	expectEvent(t, events, "integration:completed")
	expectEvent(t, events, "task:status")

	snapshot := engine.Snapshot()
	if snapshot.ProcessedRuns != 1 {
		t.Fatalf("expected ProcessedRuns=1, got %d", snapshot.ProcessedRuns)
	}
	if snapshot.QueuedRuns != 1 {
		t.Fatalf("expected QueuedRuns=1, got %d", snapshot.QueuedRuns)
	}
}

func TestIntegrationEngineTickRoutesRunToActionRequiredOnQueueFailure(t *testing.T) {
	repo := newFakeIntegrationRepo()
	repo.tasks["task-2"] = &TaskRecord{ID: "task-2", Status: "MERGING"}
	repo.subTasks["sub-failed"] = &SubTaskRecord{ID: "sub-failed", TaskID: "task-2", Status: "REWORK_REQUIRED"}
	repo.runs["run-2"] = &IntegrationRunRecord{
		ID:        "run-2",
		TaskID:    "task-2",
		Status:    integrationRunStatusQueued,
		CreatedAt: "2026-04-06T00:00:00Z",
		UpdatedAt: "2026-04-06T00:00:00Z",
	}
	repo.queueItems["item-failed"] = &IntegrationQueueItemRecord{
		ID:               "item-failed",
		IntegrationRunID: "run-2",
		SubTaskID:        "sub-failed",
		QueueOrder:       1,
		Status:           integrationQueueItemStatusQueued,
		CreatedAt:        "2026-04-06T00:00:01Z",
		UpdatedAt:        "2026-04-06T00:00:01Z",
	}

	engine := NewIntegrationEngine(time.Second)
	events := make([]integrationEvent, 0)
	engine.Tick(context.Background(), repo, func(taskID, eventName string, data map[string]any) {
		payload := make(map[string]any, len(data))
		for key, value := range data {
			payload[key] = value
		}
		events = append(events, integrationEvent{TaskID: taskID, Name: eventName, Data: payload})
	})

	if got := repo.runStatus("run-2"); got != integrationRunStatusActionRequired {
		t.Fatalf("expected run-2 ACTION_REQUIRED, got %s", got)
	}
	if got := repo.queueStatus("item-failed"); got != integrationQueueItemStatusFailed {
		t.Fatalf("expected item-failed FAILED, got %s", got)
	}
	if got := repo.taskStatus("task-2"); got != "ACTION_REQUIRED" {
		t.Fatalf("expected task-2 ACTION_REQUIRED, got %s", got)
	}
	if errText := repo.taskError("task-2"); !strings.Contains(errText, "not ready for integration") {
		t.Fatalf("expected actionable task error, got %q", errText)
	}
	if repo.messageCount() != 1 {
		t.Fatalf("expected one integration failure message, got %d", repo.messageCount())
	}
	gateResults := repo.gateResultsForRun("run-2")
	if len(gateResults) != 1 {
		t.Fatalf("expected 1 gate result for run-2, got %d", len(gateResults))
	}
	if gateResults[0].Status != "FAILED" {
		t.Fatalf("expected FAILED gate result, got %s", gateResults[0].Status)
	}
	if gateResults[0].DetailsJSON["queueItemId"] != "item-failed" {
		t.Fatalf("expected queueItemId detail on gate result, got %#v", gateResults[0].DetailsJSON)
	}

	expectEvent(t, events, "integration:failed")
	expectEvent(t, events, "integration:gate-result")
	expectEventWithStatus(t, events, "task:status", "ACTION_REQUIRED")
}

func expectEvent(t *testing.T, events []integrationEvent, name string) {
	t.Helper()
	for _, event := range events {
		if event.Name == name {
			return
		}
	}
	t.Fatalf("expected event %s, got %v", name, eventNames(events))
}

func expectEventWithStatus(t *testing.T, events []integrationEvent, name, status string) {
	t.Helper()
	for _, event := range events {
		if event.Name != name {
			continue
		}
		if eventStatus, ok := event.Data["status"].(string); ok && eventStatus == status {
			return
		}
	}
	t.Fatalf("expected event %s with status %s, got %v", name, status, events)
}

func eventNames(events []integrationEvent) []string {
	names := make([]string, 0, len(events))
	for _, event := range events {
		names = append(names, event.Name)
	}
	return names
}

func (e integrationEvent) String() string {
	return fmt.Sprintf("%s(%s)", e.Name, e.TaskID)
}

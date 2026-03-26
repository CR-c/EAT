package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/git"
	"eat/backend/internal/sandbox"
)

const (
	MaxConcurrentWorkers = 6
	WatchdogInterval     = 60 * time.Second
	WorkerIdleThreshold  = 5 * time.Minute
	WorkerHardTimeout    = 30 * time.Minute
	MaxAutoRetries       = 2
)

// TaskRepository is the interface the orchestrator needs from the task layer.
type TaskRepository interface {
	FindTaskByID(ctx context.Context, taskID string) (*TaskRecord, error)
	FindSubTaskByID(ctx context.Context, subTaskID string) (*SubTaskRecord, error)
	ListSubTasksByTaskID(ctx context.Context, taskID string) ([]SubTaskRecord, error)
	FindProjectByID(ctx context.Context, projectID string) (*ProjectRecord, error)
	UpdateSession(ctx context.Context, sessionID string, input UpdateSessionInput) error
	UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) error
	UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) error
	CreateMessage(ctx context.Context, input CreateMessageInput) error
	AppendSessionOutput(ctx context.Context, sessionID string, chunk string) error
	AtomicClaimRetry(ctx context.Context, subTaskID string, maxRetries int) (bool, error)
}

// Minimal record types the orchestrator needs.
type TaskRecord struct {
	ID             string
	ProjectID      string
	Title          string
	Status         string
	BaseCommitSha  string
	BaseBranch     string
	TaskBranchName string
}

type SubTaskRecord struct {
	ID                       string
	TaskID                   string
	BranchSuffix             string
	BranchName               string
	WorktreePath             string
	AgentType                string
	Status                   string
	Description              string
	RetryCount               int
	DependencyBranchSuffixes []string
}

type ProjectRecord struct {
	ID   string
	Path string
}

type UpdateSessionInput struct {
	Status      string
	ContainerID string
	PID         int
	StartedAt   string
	EndedAt     string
	ExitCode    *int
}

type UpdateSubTaskInput struct {
	Status    string
	LastError *string
}

type UpdateTaskInput struct {
	Status    string
	LastError *string
}

type CreateMessageInput struct {
	TaskID    string
	SubTaskID string
	Role      string
	Content   string
}

// WorkerHandle tracks a running worker.
type WorkerHandle struct {
	Runtime      *sandbox.ContainerRuntime
	SessionID    string
	TaskID       string
	SubTaskID    string
	StartedAt    time.Time
	LastOutputAt time.Time
	mu           sync.Mutex
}

func (h *WorkerHandle) touchOutput() {
	h.mu.Lock()
	h.LastOutputAt = time.Now()
	h.mu.Unlock()
}

func (h *WorkerHandle) idleDuration() time.Duration {
	h.mu.Lock()
	defer h.mu.Unlock()
	return time.Since(h.LastOutputAt)
}

func (h *WorkerHandle) totalDuration() time.Duration {
	return time.Since(h.StartedAt)
}

// Orchestrator manages the full worker lifecycle.
type Orchestrator struct {
	repo     TaskRepository
	agents   *agent.Service
	sandbox  *sandbox.Manager
	eventBus *eventbus.Bus

	mu       sync.Mutex
	workers  map[string]*WorkerHandle // subTaskID -> handle
	closed   bool
	stopOnce sync.Once
	stopCh   chan struct{}

	cancelledSessions sync.Map // sessionID -> bool

	reviewEngine *ReviewEngine
	mergeEngine  *MergeEngine
}

func New(repo TaskRepository, agents *agent.Service, sbx *sandbox.Manager, bus *eventbus.Bus) *Orchestrator {
	return &Orchestrator{
		repo:         repo,
		agents:       agents,
		sandbox:      sbx,
		eventBus:     bus,
		workers:      make(map[string]*WorkerHandle),
		stopCh:       make(chan struct{}),
		reviewEngine: &ReviewEngine{},
		mergeEngine:  &MergeEngine{},
	}
}

// Start begins the watchdog scan loop.
func (o *Orchestrator) Start() {
	go o.watchdogLoop()
}

// GracefulStop stops the orchestrator and kills all running workers.
func (o *Orchestrator) GracefulStop(ctx context.Context) error {
	o.stopOnce.Do(func() {
		o.mu.Lock()
		o.closed = true
		close(o.stopCh)
		// Copy workers to kill
		handles := make([]*WorkerHandle, 0, len(o.workers))
		for _, h := range o.workers {
			handles = append(handles, h)
		}
		o.mu.Unlock()

		for _, h := range handles {
			_ = h.Runtime.Kill()
		}
	})
	return nil
}

// LaunchApprovedSubTasks finds PENDING subtasks with satisfied dependencies and launches them.
func (o *Orchestrator) LaunchApprovedSubTasks(ctx context.Context, taskID string) {
	if o.closed {
		return
	}

	task, err := o.repo.FindTaskByID(ctx, taskID)
	if err != nil || task == nil || task.Status != "EXECUTING" {
		return
	}

	subTasks, err := o.repo.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return
	}

	// Count running workers
	o.mu.Lock()
	runningCount := len(o.workers)
	o.mu.Unlock()

	available := MaxConcurrentWorkers - runningCount
	if available <= 0 {
		return
	}

	launched := 0
	for _, st := range subTasks {
		if launched >= available {
			break
		}
		if st.Status != "PENDING" {
			continue
		}
		if !areDependenciesSatisfied(st, subTasks) {
			continue
		}

		// Check not already running
		o.mu.Lock()
		_, alreadyRunning := o.workers[st.ID]
		o.mu.Unlock()
		if alreadyRunning {
			continue
		}

		go o.launchSubTask(ctx, task, st)
		launched++
	}
}

func (o *Orchestrator) launchSubTask(ctx context.Context, task *TaskRecord, subTask SubTaskRecord) {
	project, err := o.repo.FindProjectByID(ctx, task.ProjectID)
	if err != nil || project == nil {
		o.failSubTaskLaunch(ctx, task, subTask, "Project not found.")
		return
	}

	// === Prepare workspace: branch + worktree ===
	prepared, prepErr := o.prepareSubTaskWorkspace(ctx, task, project, &subTask)
	if prepErr != nil {
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Workspace preparation failed: %s", prepErr.Error()))
		return
	}
	subTask = *prepared

	// Check agent health
	healthMap := o.agents.GetHealth(ctx)
	agentHealth, ok := healthMap[subTask.AgentType]
	if !ok || !agentHealth.Available {
		msg := "Agent unavailable"
		if agentHealth.FailureReason != nil {
			msg = agentHealth.FailureReason.Message
		}
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Agent %s unavailable: %s", subTask.AgentType, msg))
		return
	}

	// Build prompt
	prompt := buildWorkerPrompt(task, &subTask)

	// Spawn agent session
	runtime, err := o.agents.SpawnSession(ctx, subTask.AgentType, agent.SpawnConfig{
		Prompt:     prompt,
		WorkDir:    subTask.WorktreePath,
		BranchName: subTask.BranchName,
	})
	if err != nil {
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Failed to spawn worker: %s", err.Error()))
		return
	}

	now := time.Now()
	handle := &WorkerHandle{
		Runtime:      runtime,
		SessionID:    runtime.SessionID,
		TaskID:       task.ID,
		SubTaskID:    subTask.ID,
		StartedAt:    now,
		LastOutputAt: now,
	}

	// Update session to RUNNING
	_ = o.repo.UpdateSession(ctx, runtime.SessionID, UpdateSessionInput{
		Status:      "RUNNING",
		ContainerID: runtime.ContainerID,
		PID:         runtime.PID,
		StartedAt:   now.Format(time.RFC3339),
	})

	// Update subtask to RUNNING
	_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
		Status: "RUNNING",
	})

	// Register with worker map
	o.mu.Lock()
	o.workers[subTask.ID] = handle
	o.mu.Unlock()

	// Publish events
	o.publish(task.ID, "subtask:status", map[string]any{
		"subTaskId": subTask.ID,
		"status":    "RUNNING",
		"taskId":    task.ID,
	})
	o.publish(task.ID, "session:started", map[string]any{
		"sessionId":   runtime.SessionID,
		"containerId": runtime.ContainerID,
		"subTaskId":   subTask.ID,
		"taskId":      task.ID,
	})

	// Wire output callback
	runtime.OnOutput(func(chunk string) {
		handle.touchOutput()
		_ = o.repo.AppendSessionOutput(ctx, runtime.SessionID, chunk)
		o.publish(task.ID, "session:output", map[string]any{
			"chunk":     chunk,
			"sessionId": runtime.SessionID,
			"subTaskId": subTask.ID,
			"taskId":    task.ID,
		})
	})

	// Wire exit callback
	runtime.OnExit(func(exitCode int) {
		o.handleWorkerExit(ctx, task.ID, subTask.ID, runtime.SessionID, exitCode)
	})
}

func (o *Orchestrator) handleWorkerExit(ctx context.Context, taskID, subTaskID, sessionID string, exitCode int) {
	if o.closed {
		return
	}

	o.mu.Lock()
	delete(o.workers, subTaskID)
	o.mu.Unlock()

	_, wasCancelled := o.cancelledSessions.LoadAndDelete(sessionID)

	var sessionStatus string
	var subTaskStatus string
	var lastError *string

	if wasCancelled {
		sessionStatus = "CANCELLED"
		subTaskStatus = "CANCELLED"
	} else if exitCode == 0 {
		sessionStatus = "COMPLETED"
		subTaskStatus = "REVIEW_PENDING"
	} else {
		sessionStatus = "FAILED"
		subTaskStatus = "FAILED"
		errMsg := fmt.Sprintf("Worker exited with code %d.", exitCode)
		lastError = &errMsg
	}

	endedAt := time.Now().Format(time.RFC3339)
	exitCodePtr := &exitCode
	if wasCancelled {
		exitCodePtr = nil
	}
	_ = o.repo.UpdateSession(ctx, sessionID, UpdateSessionInput{
		Status:   sessionStatus,
		EndedAt:  endedAt,
		ExitCode: exitCodePtr,
	})
	_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
		Status:    subTaskStatus,
		LastError: lastError,
	})

	o.publish(taskID, "session:ended", map[string]any{
		"sessionId": sessionID,
		"exitCode":  exitCode,
		"status":    sessionStatus,
		"subTaskId": subTaskID,
		"taskId":    taskID,
	})
	o.publish(taskID, "subtask:status", map[string]any{
		"subTaskId": subTaskID,
		"status":    subTaskStatus,
		"taskId":    taskID,
	})

	if wasCancelled {
		o.progressDependencySchedule(ctx, taskID)
		o.maybeStartFinalReview(ctx, taskID)
		return
	}

	if exitCode == 0 {
		// Successful exit: sync subtask branch into task mainline
		o.syncSubTaskIntoMainline(ctx, taskID, subTaskID)
	}

	// Progress dependency schedule - launch more subtasks if deps satisfied
	o.progressDependencySchedule(ctx, taskID)
	o.maybeStartFinalReview(ctx, taskID)
}

func (o *Orchestrator) progressDependencySchedule(ctx context.Context, taskID string) {
	if o.closed {
		return
	}

	task, err := o.repo.FindTaskByID(ctx, taskID)
	if err != nil || task == nil {
		return
	}
	if task.Status != "EXECUTING" && task.Status != "ACTION_REQUIRED" {
		return
	}

	subTasks, err := o.repo.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return
	}

	// Release blocked subtasks whose deps are now satisfied
	for _, st := range subTasks {
		if st.Status != "BLOCKED" {
			continue
		}
		if !areDependenciesSatisfied(st, subTasks) {
			continue
		}
		_ = o.repo.UpdateSubTask(ctx, st.ID, UpdateSubTaskInput{Status: "PENDING"})
		o.publish(taskID, "subtask:status", map[string]any{
			"subTaskId": st.ID,
			"status":    "PENDING",
			"taskId":    taskID,
		})
	}

	if task.Status == "EXECUTING" {
		o.LaunchApprovedSubTasks(ctx, taskID)
	}
}

func (o *Orchestrator) failSubTaskLaunch(ctx context.Context, task *TaskRecord, subTask SubTaskRecord, message string) {
	errMsg := message
	_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
		Status:    "FAILED",
		LastError: &errMsg,
	})
	_ = o.repo.CreateMessage(ctx, CreateMessageInput{
		TaskID:    task.ID,
		SubTaskID: subTask.ID,
		Role:      "SYSTEM",
		Content:   fmt.Sprintf("Worker launch failed: %s", message),
	})
	o.publish(task.ID, "subtask:status", map[string]any{
		"subTaskId": subTask.ID,
		"status":    "FAILED",
		"taskId":    task.ID,
	})

	// Set task to ACTION_REQUIRED
	_ = o.repo.UpdateTask(ctx, task.ID, UpdateTaskInput{
		Status:    "ACTION_REQUIRED",
		LastError: &errMsg,
	})
	o.publish(task.ID, "task:status", map[string]any{
		"taskId": task.ID,
		"status": "ACTION_REQUIRED",
	})
}

// watchdogLoop periodically scans for timed-out workers.
func (o *Orchestrator) watchdogLoop() {
	ticker := time.NewTicker(WatchdogInterval)
	defer ticker.Stop()

	for {
		select {
		case <-o.stopCh:
			return
		case <-ticker.C:
			o.runWatchdogScan()
		}
	}
}

func (o *Orchestrator) runWatchdogScan() {
	o.mu.Lock()
	var expired []*WorkerHandle
	for _, h := range o.workers {
		if h.totalDuration() >= WorkerHardTimeout {
			expired = append(expired, h)
		} else if h.idleDuration() >= WorkerIdleThreshold {
			expired = append(expired, h)
		}
	}
	o.mu.Unlock()

	ctx := context.Background()
	for _, h := range expired {
		reason := fmt.Sprintf("Worker hard timeout after %dm.", int(h.totalDuration().Minutes()))
		if h.idleDuration() >= WorkerIdleThreshold && h.totalDuration() < WorkerHardTimeout {
			reason = fmt.Sprintf("Worker idle for %dm with no output.", int(h.idleDuration().Minutes()))
		}
		o.killAndRetryWorker(ctx, h, reason)
	}
}

func (o *Orchestrator) killAndRetryWorker(ctx context.Context, h *WorkerHandle, reason string) {
	// Mark session as cancelled so exit handler knows
	o.cancelledSessions.Store(h.SessionID, true)

	// Force kill
	_ = h.Runtime.Kill()

	// Remove from worker map
	o.mu.Lock()
	delete(o.workers, h.SubTaskID)
	o.mu.Unlock()

	// Update session to FAILED
	endedAt := time.Now().Format(time.RFC3339)
	_ = o.repo.UpdateSession(ctx, h.SessionID, UpdateSessionInput{
		Status:  "FAILED",
		EndedAt: endedAt,
	})

	// Log watchdog event
	_ = o.repo.CreateMessage(ctx, CreateMessageInput{
		TaskID:    h.TaskID,
		SubTaskID: h.SubTaskID,
		Role:      "SYSTEM",
		Content:   fmt.Sprintf("Watchdog: %s", reason),
	})

	o.publish(h.TaskID, "watchdog:timeout", map[string]any{
		"reason":    reason,
		"subTaskId": h.SubTaskID,
		"taskId":    h.TaskID,
	})

	// Auto-retry if within limit
	claimed, err := o.repo.AtomicClaimRetry(ctx, h.SubTaskID, MaxAutoRetries)
	if err == nil && claimed {
		_ = o.repo.UpdateSubTask(ctx, h.SubTaskID, UpdateSubTaskInput{Status: "PENDING"})
		o.publish(h.TaskID, "subtask:status", map[string]any{
			"subTaskId": h.SubTaskID,
			"status":    "PENDING",
			"taskId":    h.TaskID,
		})
		o.LaunchApprovedSubTasks(ctx, h.TaskID)
	} else {
		errMsg := reason
		_ = o.repo.UpdateSubTask(ctx, h.SubTaskID, UpdateSubTaskInput{
			Status:    "FAILED",
			LastError: &errMsg,
		})
		o.publish(h.TaskID, "subtask:status", map[string]any{
			"subTaskId": h.SubTaskID,
			"status":    "FAILED",
			"taskId":    h.TaskID,
		})
		o.progressDependencySchedule(ctx, h.TaskID)
	}
}

func (o *Orchestrator) publish(taskID, eventName string, data map[string]any) {
	if o.eventBus == nil {
		return
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		return
	}
	o.eventBus.Publish(fmt.Sprintf("task:%s", taskID), eventbus.Event{
		Name: eventName,
		Data: encoded,
	})
}

// areDependenciesSatisfied checks if all dependency subtasks are in a terminal state.
func areDependenciesSatisfied(st SubTaskRecord, allSubTasks []SubTaskRecord) bool {
	if len(st.DependencyBranchSuffixes) == 0 {
		return true
	}

	suffixIndex := make(map[string]*SubTaskRecord, len(allSubTasks))
	for i := range allSubTasks {
		suffixIndex[allSubTasks[i].BranchSuffix] = &allSubTasks[i]
	}

	for _, depSuffix := range st.DependencyBranchSuffixes {
		dep, ok := suffixIndex[depSuffix]
		if !ok {
			return false
		}
		switch dep.Status {
		case "COMPLETED", "MERGED", "REVIEW_PENDING":
			continue
		default:
			return false
		}
	}
	return true
}

// prepareSubTaskWorkspace creates the git branch and worktree for a subtask before spawning.
func (o *Orchestrator) prepareSubTaskWorkspace(ctx context.Context, task *TaskRecord, project *ProjectRecord, subTask *SubTaskRecord) (*SubTaskRecord, error) {
	repoPath := project.Path

	// Ensure branch exists
	if subTask.BranchName == "" {
		desiredName := git.ComputeDeterministicBranchName(task.ID, subTask.BranchSuffix)
		resolvedName, err := git.ResolveUniqueBranchName(ctx, repoPath, desiredName)
		if err != nil {
			return nil, fmt.Errorf("resolve branch name: %w", err)
		}

		baseSHA := task.BaseCommitSha
		if baseSHA == "" {
			var resolveErr error
			baseSHA, resolveErr = git.ResolveRevision(ctx, repoPath, "HEAD")
			if resolveErr != nil {
				return nil, fmt.Errorf("resolve HEAD: %w", resolveErr)
			}
		}

		if err := git.EnsureBranchExists(ctx, repoPath, resolvedName, baseSHA); err != nil {
			return nil, fmt.Errorf("create branch: %w", err)
		}

		subTask.BranchName = resolvedName
		_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
			Status:    subTask.Status,
			LastError: nil,
		})
	} else {
		baseSHA := task.BaseCommitSha
		if baseSHA == "" {
			baseSHA = "HEAD"
		}
		if err := git.EnsureBranchExists(ctx, repoPath, subTask.BranchName, baseSHA); err != nil {
			return nil, fmt.Errorf("ensure branch: %w", err)
		}
	}

	// Ensure worktree exists
	if subTask.WorktreePath == "" {
		worktreePath, err := git.ResolveWorktreePath(repoPath, task.ID, subTask.BranchSuffix)
		if err != nil {
			return nil, fmt.Errorf("resolve worktree path: %w", err)
		}
		if err := git.EnsureWorktree(ctx, repoPath, worktreePath, subTask.BranchName); err != nil {
			return nil, fmt.Errorf("create worktree: %w", err)
		}
		subTask.WorktreePath = worktreePath
	} else {
		if err := git.EnsureWorktree(ctx, repoPath, subTask.WorktreePath, subTask.BranchName); err != nil {
			return nil, fmt.Errorf("ensure worktree: %w", err)
		}
	}

	return subTask, nil
}

// syncSubTaskIntoMainline merges a completed subtask's branch into the task mainline.
func (o *Orchestrator) syncSubTaskIntoMainline(ctx context.Context, taskID, subTaskID string) {
	task, err := o.repo.FindTaskByID(ctx, taskID)
	if err != nil || task == nil {
		return
	}
	subTask, err := o.repo.FindSubTaskByID(ctx, subTaskID)
	if err != nil || subTask == nil {
		return
	}
	project, err := o.repo.FindProjectByID(ctx, task.ProjectID)
	if err != nil || project == nil {
		return
	}

	if subTask.BranchName == "" {
		return
	}

	repoPath := project.Path
	taskBranch := task.TaskBranchName
	if taskBranch == "" {
		taskBranch = task.BaseBranch
	}
	if taskBranch == "" {
		return
	}

	// Check if already merged
	if git.BranchMergedInto(ctx, repoPath, subTask.BranchName, taskBranch) {
		_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{Status: "MERGED"})
		o.publish(taskID, "subtask:status", map[string]any{
			"subTaskId": subTaskID,
			"status":    "MERGED",
			"taskId":    taskID,
		})
		return
	}

	// Merge subtask branch into task mainline
	// Use merge engine lock to prevent concurrent merges on same project
	o.mergeEngine.getProjectLock(repoPath).Lock()
	defer o.mergeEngine.getProjectLock(repoPath).Unlock()

	// Checkout task mainline branch in a temporary worktree for the merge
	mergeResult := git.MergeBranch(ctx, repoPath, subTask.BranchName)
	if !mergeResult.OK {
		// Merge conflict - abort and mark for action
		_ = git.AbortMerge(ctx, repoPath)
		errMsg := fmt.Sprintf("Merge conflict merging %s into %s: %s", subTask.BranchName, taskBranch, mergeResult.Stderr)
		_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
			Status:    "FAILED",
			LastError: &errMsg,
		})
		_ = o.repo.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:    "ACTION_REQUIRED",
			LastError: &errMsg,
		})
		o.publish(taskID, "subtask:status", map[string]any{
			"subTaskId": subTaskID,
			"status":    "FAILED",
			"taskId":    taskID,
		})
		return
	}

	// Mark as merged
	_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{Status: "MERGED"})
	o.publish(taskID, "subtask:status", map[string]any{
		"subTaskId": subTaskID,
		"status":    "MERGED",
		"taskId":    taskID,
	})
	o.publish(taskID, "task:mainline-updated", map[string]any{
		"taskId":    taskID,
		"subTaskId": subTaskID,
		"branch":    subTask.BranchName,
	})
}

// maybeStartFinalReview checks if all subtasks are done and triggers final review.
func (o *Orchestrator) maybeStartFinalReview(ctx context.Context, taskID string) {
	subTasks, err := o.repo.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return
	}

	allDone := true
	for _, st := range subTasks {
		switch st.Status {
		case "MERGED", "COMPLETED", "CANCELLED":
			continue
		default:
			allDone = false
		}
	}

	if !allDone {
		return
	}

	// All subtasks are in terminal state - trigger final review
	o.reviewEngine.MaybeStart(taskID, func() {
		task, err := o.repo.FindTaskByID(ctx, taskID)
		if err != nil || task == nil {
			return
		}
		if task.Status != "EXECUTING" {
			return
		}

		// Transition to REVIEWING
		_ = o.repo.UpdateTask(ctx, taskID, UpdateTaskInput{Status: "REVIEWING"})
		o.publish(taskID, "task:status", map[string]any{
			"taskId": taskID,
			"status": "REVIEWING",
		})

		// For now, auto-approve final review (real implementation would run a review agent)
		_ = o.repo.UpdateTask(ctx, taskID, UpdateTaskInput{Status: "DONE"})
		o.publish(taskID, "task:status", map[string]any{
			"taskId": taskID,
			"status": "DONE",
		})
	})
}

// buildWorkerPrompt constructs a detailed prompt for the worker agent.
func buildWorkerPrompt(task *TaskRecord, subTask *SubTaskRecord) string {
	parts := []string{
		fmt.Sprintf("# Task: %s", task.Title),
		"",
		fmt.Sprintf("## Your Assignment: %s", subTask.BranchSuffix),
	}

	if subTask.Description != "" {
		parts = append(parts, "", subTask.Description)
	}

	parts = append(parts, "",
		fmt.Sprintf("Branch: %s", subTask.BranchName),
		fmt.Sprintf("Working directory: %s", subTask.WorktreePath),
	)

	if len(subTask.DependencyBranchSuffixes) > 0 {
		parts = append(parts, "",
			fmt.Sprintf("Dependencies: %s", fmt.Sprintf("%v", subTask.DependencyBranchSuffixes)),
			"The dependency branches have already been merged into the mainline. Your branch is up to date.",
		)
	}

	parts = append(parts, "",
		"## Instructions",
		"- Complete your assigned work on the branch provided.",
		"- Commit all changes with clear, descriptive commit messages.",
		"- Do not modify files outside the scope of your assignment.",
		"- Exit with code 0 on success.",
	)

	return strings.Join(parts, "\n")
}

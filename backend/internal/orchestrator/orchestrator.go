package orchestrator

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"eat/backend/internal/agent"
	"eat/backend/internal/domain"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/git"
	"eat/backend/internal/tokenusage"
	"eat/backend/internal/workerbackend"
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
	ListSessionsBySubTaskID(ctx context.Context, subTaskID string) ([]SessionRecord, error)
	FindSessionByID(ctx context.Context, sessionID string) (*SessionRecord, error)
	ListAttachmentsByTaskID(ctx context.Context, taskID string) ([]AttachmentRecord, error)
	ListMailboxMessagesForSubTask(ctx context.Context, taskID string, subTaskID string) ([]MailboxMessageRecord, error)
	FindProjectByID(ctx context.Context, projectID string) (*ProjectRecord, error)
	AccumulateSessionTokenUsage(ctx context.Context, input tokenusage.SessionInput) error
	UpdateSession(ctx context.Context, sessionID string, input UpdateSessionInput) error
	UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) error
	UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) error
	CreateMessage(ctx context.Context, input CreateMessageInput) error
	CreateMailboxMessage(ctx context.Context, input CreateMailboxMessageInput) (*MailboxMessageRecord, error)
	AppendSessionOutput(ctx context.Context, sessionID string, chunk string) error
	ClaimSessionMailboxBlock(ctx context.Context, sessionID string, fingerprint string) (bool, error)
	AtomicClaimRetry(ctx context.Context, subTaskID string, maxRetries int) (bool, error)
}

// Minimal record types the orchestrator needs.
type TaskRecord struct {
	ID               string
	ProjectID        string
	Title            string
	Status           string
	BaseCommitSha    string
	BaseBranch       string
	TaskBranchName   string
	ExecutionProfile string
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

type AttachmentRecord struct {
	ID       string
	FileName string
	FilePath string
	FileType string
}

type SessionRecord struct {
	ID           string
	SandboxType  string
	Status       string
	LogPath      *string
	OutputBuffer string
	CreatedAt    string
}

type MailboxMessageRecord struct {
	ID              string
	TaskID          string
	SenderType      string
	SenderSubTaskID *string
	TargetType      string
	TargetSubTaskID *string
	MessageType     string
	ArtifactRefs    []string
	FileRefs        []string
	BranchRef       *string
	SchemaJSON      map[string]any
	RequiresAck     bool
	Content         string
	CreatedAt       string
}

type UpdateSessionInput struct {
	Status               *string
	ContainerID          *string
	PID                  *int64
	StartedAt            *string
	LogPath              *string
	FirstOutputAt        *string
	OutputBufferMaxBytes *int64
	EndedAt              *string
	ExitCode             *int
	SetExitCode          bool
}

type UpdateSubTaskInput struct {
	Status         *string
	LastError      *string
	BranchName     *string
	StartCommitSHA *string
	WorktreePath   *string
}

type UpdateTaskInput struct {
	Status    *string
	LastError *string
}

type CreateMessageInput struct {
	TaskID    string
	SubTaskID string
	Role      string
	Content   string
}

type CreateMailboxMessageInput struct {
	TaskID          string
	SenderType      string
	SenderSubTaskID *string
	TargetType      string
	TargetSubTaskID *string
	MessageType     string
	ArtifactRefs    []string
	FileRefs        []string
	BranchRef       *string
	SchemaJSON      map[string]any
	RequiresAck     bool
	Content         string
}

// WorkerHandle tracks a running worker.
type WorkerHandle struct {
	Runtime      workerbackend.RuntimeSession
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
	eventBus *eventbus.Bus

	mu       sync.Mutex
	workers  map[string]*WorkerHandle // subTaskID -> handle
	closed   bool
	stopOnce sync.Once
	stopCh   chan struct{}

	cancelledSessions sync.Map // sessionID -> bool

	reviewEngine      *ReviewEngine
	mergeEngine       *MergeEngine
	integrationEngine *IntegrationEngine
}

func New(repo TaskRepository, agents *agent.Service, bus *eventbus.Bus) *Orchestrator {
	return &Orchestrator{
		repo:         repo,
		agents:       agents,
		eventBus:     bus,
		workers:      make(map[string]*WorkerHandle),
		stopCh:       make(chan struct{}),
		reviewEngine: &ReviewEngine{},
		mergeEngine:  &MergeEngine{},
		integrationEngine: NewIntegrationEngine(
			defaultIntegrationPollInterval,
		),
	}
}

// Start begins the watchdog scan loop.
func (o *Orchestrator) Start() {
	go o.watchdogLoop()
	go o.integrationLoop()
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

func (o *Orchestrator) IntegrationSnapshot() IntegrationRuntimeSnapshot {
	if o.integrationEngine == nil {
		return IntegrationRuntimeSnapshot{}
	}
	return o.integrationEngine.Snapshot()
}

func (o *Orchestrator) WorkerStats() map[string]int {
	o.mu.Lock()
	defer o.mu.Unlock()

	return map[string]int{
		"running":   len(o.workers),
		"pool_size": MaxConcurrentWorkers,
	}
}

func (o *Orchestrator) resolveLaunchSession(ctx context.Context, subTaskID string) (*SessionRecord, error) {
	sessions, err := o.repo.ListSessionsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return nil, err
	}

	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.Status == "PENDING" {
			return &session, nil
		}
	}

	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.Status == "" {
			return &session, nil
		}
	}

	return nil, nil
}

func normalizeBackendKindFromSandboxType(sandboxType string) string {
	kind := workerbackend.KindFromSessionSandboxType(sandboxType)
	if strings.TrimSpace(kind) == "" {
		return workerbackend.KindDocker
	}
	return kind
}

func (o *Orchestrator) integrationLoop() {
	integrationRepo, ok := any(o.repo).(IntegrationRuntimeRepository)
	if !ok || o.integrationEngine == nil {
		return
	}

	ticker := time.NewTicker(o.integrationEngine.PollInterval())
	defer ticker.Stop()

	for {
		select {
		case <-o.stopCh:
			return
		case <-ticker.C:
			o.integrationEngine.Tick(context.Background(), integrationRepo, o.publish)
		}
	}
}

func (o *Orchestrator) TriggerIntegrationTick(ctx context.Context) {
	integrationRepo, ok := any(o.repo).(IntegrationRuntimeRepository)
	if !ok || o.integrationEngine == nil {
		return
	}
	o.integrationEngine.Tick(ctx, integrationRepo, o.publish)
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
	if !ok || !agentHealth.ExecutionAvailable {
		msg := "Agent execution backend unavailable"
		failureReason := agentHealth.ExecutionFailureReason
		if failureReason == nil {
			failureReason = agentHealth.FailureReason
		}
		if failureReason != nil {
			msg = failureReason.Message
		}
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Agent %s unavailable: %s", subTask.AgentType, msg))
		return
	}

	attachments, err := o.repo.ListAttachmentsByTaskID(ctx, task.ID)
	if err != nil {
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Attachments read failed: %s", err.Error()))
		return
	}

	// Mailbox handoffs are advisory prompt context, not a launch precondition.
	// A transient read failure must not fail the whole subtask launch.
	mailboxMessages, err := o.repo.ListMailboxMessagesForSubTask(ctx, task.ID, subTask.ID)
	if err != nil {
		log.Printf("orchestrator: mailbox handoff read failed, launching without handoffs: task=%s subtask=%s err=%v", task.ID, subTask.ID, err)
		mailboxMessages = nil
	}

	// Build prompt
	prompt := buildWorkerPrompt(task, &subTask, attachments, mailboxMessages)

	launchSession, err := o.resolveLaunchSession(ctx, subTask.ID)
	if err != nil {
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Failed to resolve worker session: %s", err.Error()))
		return
	}
	if launchSession == nil {
		o.failSubTaskLaunch(ctx, task, subTask, "No pending worker session is available for launch.")
		return
	}
	sessionID := launchSession.ID
	backendKind := normalizeBackendKindFromSandboxType(launchSession.SandboxType)

	// Spawn agent session
	runtime, err := o.agents.SpawnSession(ctx, subTask.AgentType, agent.SpawnConfig{
		BackendKind:      backendKind,
		ExecutionProfile: task.ExecutionProfile,
		Prompt:           prompt,
		WorkDir:          subTask.WorktreePath,
		BranchName:       subTask.BranchName,
		Attachments:      toAttachmentRefs(attachments),
	})
	if err != nil {
		o.failSubTaskLaunch(ctx, task, subTask, fmt.Sprintf("Failed to spawn worker: %s", err.Error()))
		return
	}

	now := time.Now()
	handle := &WorkerHandle{
		Runtime:      runtime,
		SessionID:    sessionID,
		TaskID:       task.ID,
		SubTaskID:    subTask.ID,
		StartedAt:    now,
		LastOutputAt: now,
	}

	// Update session to RUNNING
	startedAt := now.UTC().Format(time.RFC3339Nano)
	runtimeMeta := runtime.Metadata()
	var containerIDPtr *string
	if strings.TrimSpace(runtimeMeta.ContainerID) != "" {
		containerID := runtimeMeta.ContainerID
		containerIDPtr = &containerID
	}
	var pidPtr *int64
	if runtimeMeta.PID > 0 {
		pid := int64(runtimeMeta.PID)
		pidPtr = &pid
	}
	logPath, logPathErr := ensureWorkerSessionLogPath(sessionID)
	if logPathErr != nil {
		log.Printf("orchestrator: create worker session log failed: task=%s subtask=%s session=%s err=%v", task.ID, subTask.ID, sessionID, logPathErr)
	}

	_ = o.repo.UpdateSession(ctx, sessionID, UpdateSessionInput{
		Status:      stringPointer("RUNNING"),
		ContainerID: containerIDPtr,
		PID:         pidPtr,
		StartedAt:   &startedAt,
		LogPath:     logPath,
	})

	// Update subtask to RUNNING
	_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
		Status: stringPointer("RUNNING"),
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
		"sessionId":   sessionID,
		"containerId": runtimeMeta.ContainerID,
		"subTaskId":   subTask.ID,
		"taskId":      task.ID,
	})

	// Wire output callback
	runtime.OnOutput(func(chunk string) {
		handle.touchOutput()
		if err := o.appendWorkerSessionOutput(ctx, sessionID, chunk, logPath); err != nil {
			log.Printf("orchestrator: append worker output failed: task=%s subtask=%s session=%s err=%v", task.ID, subTask.ID, sessionID, err)
		}
		for _, usage := range collectSessionTokenUsage(chunk) {
			usage.SessionID = sessionID
			usage.TaskID = task.ID
			usage.ProjectID = task.ProjectID
			usage.SubTaskID = &subTask.ID
			usage.AgentType = subTask.AgentType
			_ = o.repo.AccumulateSessionTokenUsage(ctx, usage)
		}
		o.publish(task.ID, "session:output", map[string]any{
			"chunk":     chunk,
			"sessionId": sessionID,
			"subTaskId": subTask.ID,
			"taskId":    task.ID,
		})
	})

	// Wire exit callback
	runtime.OnExit(func(exitCode int) {
		o.handleWorkerExit(ctx, task.ID, subTask.ID, sessionID, exitCode)
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
	o.collectMailboxMessagesFromWorkerOutput(ctx, taskID, subTaskID, sessionID)

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
	endedAtValue := endedAt
	_ = o.repo.UpdateSession(ctx, sessionID, UpdateSessionInput{
		Status:      &sessionStatus,
		EndedAt:     &endedAtValue,
		ExitCode:    exitCodePtr,
		SetExitCode: true,
	})
	_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
		Status:    &subTaskStatus,
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

func (o *Orchestrator) collectMailboxMessagesFromWorkerOutput(ctx context.Context, taskID, subTaskID, sessionID string) {
	session, err := o.repo.FindSessionByID(ctx, sessionID)
	if err != nil || session == nil {
		if err != nil {
			log.Printf("orchestrator: read worker output for mailbox extraction failed: task=%s subtask=%s session=%s err=%v", taskID, subTaskID, sessionID, err)
		}
		return
	}

	output := session.OutputBuffer
	if session.LogPath != nil && strings.TrimSpace(*session.LogPath) != "" {
		if data, readErr := os.ReadFile(*session.LogPath); readErr == nil {
			output = string(data)
		} else {
			log.Printf("orchestrator: read worker full log for mailbox extraction failed, falling back to output buffer: task=%s subtask=%s session=%s path=%s err=%v", taskID, subTaskID, sessionID, *session.LogPath, readErr)
		}
	}
	if strings.TrimSpace(output) == "" {
		return
	}

	blocks := parseMailboxBlocksFromOutput(output)
	for _, block := range blocks {
		fingerprint := mailboxBlockFingerprint(block.Raw)
		claimed, claimErr := o.repo.ClaimSessionMailboxBlock(ctx, sessionID, fingerprint)
		if claimErr != nil {
			log.Printf("orchestrator: mailbox block idempotency claim failed: task=%s subtask=%s session=%s fingerprint=%s err=%v", taskID, subTaskID, sessionID, fingerprint, claimErr)
			continue
		}
		if !claimed {
			continue
		}

		input, ok := mailboxBlockToCreateInput(ctx, o.repo, taskID, subTaskID, block.Payload, sessionID, fingerprint)
		if !ok {
			continue
		}
		message, createErr := o.repo.CreateMailboxMessage(ctx, input)
		if createErr != nil {
			log.Printf("orchestrator: create mailbox message failed: task=%s subtask=%s session=%s fingerprint=%s err=%v", taskID, subTaskID, sessionID, fingerprint, createErr)
			continue
		}
		o.publishMailboxMessage(taskID, message)
	}
}

var mailboxBlockPattern = regexp.MustCompile("(?s)```eat:mailbox\\s*(.*?)\\s*```")

type mailboxBlock struct {
	Raw     string
	Payload string
}

type workerMailboxPayload struct {
	Type            string         `json:"type"`
	TargetType      string         `json:"targetType"`
	TargetSubTaskID string         `json:"targetSubTaskId"`
	Content         string         `json:"content"`
	BranchRef       string         `json:"branchRef"`
	ArtifactRefs    []string       `json:"artifactRefs"`
	FileRefs        []string       `json:"fileRefs"`
	SchemaJSON      map[string]any `json:"schemaJson"`
	RequiresAck     bool           `json:"requiresAck"`
}

func parseMailboxMessagesFromOutput(output string, taskID string, senderSubTaskID string) []CreateMailboxMessageInput {
	blocks := parseMailboxBlocksFromOutput(output)
	result := make([]CreateMailboxMessageInput, 0, len(blocks))
	for _, block := range blocks {
		input, ok := parseMailboxBlockPayload(taskID, senderSubTaskID, block.Payload)
		if ok {
			result = append(result, input)
		}
	}
	return result
}

func parseMailboxBlocksFromOutput(output string) []mailboxBlock {
	matches := mailboxBlockPattern.FindAllStringSubmatch(output, -1)
	if len(matches) == 0 {
		return nil
	}
	result := make([]mailboxBlock, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		result = append(result, mailboxBlock{
			Raw:     match[0],
			Payload: match[1],
		})
	}
	return result
}

func parseMailboxBlockPayload(taskID string, senderSubTaskID string, rawPayload string) (CreateMailboxMessageInput, bool) {
	var payload workerMailboxPayload
	if err := json.Unmarshal([]byte(strings.TrimSpace(rawPayload)), &payload); err != nil {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=json_parse err=%v", err)
		return CreateMailboxMessageInput{}, false
	}

	content := strings.TrimSpace(payload.Content)
	if content == "" {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=empty_content")
		return CreateMailboxMessageInput{}, false
	}

	messageType := strings.ToUpper(strings.TrimSpace(payload.Type))
	if messageType == "" {
		messageType = "NOTE"
	}
	targetType := strings.ToUpper(strings.TrimSpace(payload.TargetType))
	if targetType == "" {
		targetType = "LEAD"
	}

	sender := senderSubTaskID
	return CreateMailboxMessageInput{
		TaskID:          taskID,
		SenderType:      "SUBTASK",
		SenderSubTaskID: &sender,
		TargetType:      targetType,
		TargetSubTaskID: stringPointerValue(strings.TrimSpace(payload.TargetSubTaskID)),
		MessageType:     messageType,
		ArtifactRefs:    append([]string(nil), payload.ArtifactRefs...),
		FileRefs:        append([]string(nil), payload.FileRefs...),
		BranchRef:       stringPointerValue(strings.TrimSpace(payload.BranchRef)),
		SchemaJSON:      cloneJSONMap(payload.SchemaJSON),
		RequiresAck:     payload.RequiresAck,
		Content:         content,
	}, true
}

func mailboxBlockToCreateInput(ctx context.Context, repo TaskRepository, taskID string, senderSubTaskID string, rawPayload string, sessionID string, fingerprint string) (CreateMailboxMessageInput, bool) {
	input, ok := parseMailboxBlockPayload(taskID, senderSubTaskID, rawPayload)
	if !ok {
		return CreateMailboxMessageInput{}, false
	}
	if !isAllowedMailboxMessageType(input.MessageType) {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=invalid_message_type task=%s subtask=%s session=%s fingerprint=%s messageType=%s", taskID, senderSubTaskID, sessionID, fingerprint, input.MessageType)
		return CreateMailboxMessageInput{}, false
	}
	if !isAllowedMailboxTargetType(input.TargetType) {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=invalid_target_type task=%s subtask=%s session=%s fingerprint=%s targetType=%s", taskID, senderSubTaskID, sessionID, fingerprint, input.TargetType)
		return CreateMailboxMessageInput{}, false
	}
	if input.SenderSubTaskID == nil || strings.TrimSpace(*input.SenderSubTaskID) == "" {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=missing_sender task=%s session=%s fingerprint=%s", taskID, sessionID, fingerprint)
		return CreateMailboxMessageInput{}, false
	}
	senderSubTask, err := repo.FindSubTaskByID(ctx, *input.SenderSubTaskID)
	if err != nil {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=sender_read_failed task=%s subtask=%s session=%s fingerprint=%s err=%v", taskID, senderSubTaskID, sessionID, fingerprint, err)
		return CreateMailboxMessageInput{}, false
	}
	if senderSubTask == nil || senderSubTask.TaskID != taskID {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=sender_not_found task=%s subtask=%s session=%s fingerprint=%s", taskID, senderSubTaskID, sessionID, fingerprint)
		return CreateMailboxMessageInput{}, false
	}
	if input.TargetType == "LEAD" {
		input.TargetSubTaskID = nil
		return input, true
	}
	if input.TargetSubTaskID == nil || strings.TrimSpace(*input.TargetSubTaskID) == "" {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=missing_target_subtask task=%s subtask=%s session=%s fingerprint=%s", taskID, senderSubTaskID, sessionID, fingerprint)
		return CreateMailboxMessageInput{}, false
	}
	targetSubTask, err := repo.FindSubTaskByID(ctx, *input.TargetSubTaskID)
	if err != nil {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=target_read_failed task=%s subtask=%s session=%s fingerprint=%s targetSubTaskId=%s err=%v", taskID, senderSubTaskID, sessionID, fingerprint, *input.TargetSubTaskID, err)
		return CreateMailboxMessageInput{}, false
	}
	if targetSubTask == nil || targetSubTask.TaskID != taskID {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=target_not_found task=%s subtask=%s session=%s fingerprint=%s targetSubTaskId=%s", taskID, senderSubTaskID, sessionID, fingerprint, *input.TargetSubTaskID)
		return CreateMailboxMessageInput{}, false
	}
	if targetSubTask.ID == senderSubTask.ID {
		log.Printf("orchestrator: skip invalid eat:mailbox block: reason=self_target task=%s subtask=%s session=%s fingerprint=%s", taskID, senderSubTaskID, sessionID, fingerprint)
		return CreateMailboxMessageInput{}, false
	}
	return input, true
}

func isAllowedMailboxTargetType(value string) bool {
	switch value {
	case "LEAD", "SUBTASK":
		return true
	default:
		return false
	}
}

func isAllowedMailboxMessageType(value string) bool {
	switch value {
	case "NOTE", "BLOCKER", "DELIVERABLE_READY", "TEST_REQUEST", "REVIEW_REQUEST", "API_CONTRACT", "DB_CONTRACT":
		return true
	default:
		return false
	}
}

func mailboxBlockFingerprint(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func ensureWorkerSessionLogPath(sessionID string) (*string, error) {
	root := strings.TrimSpace(os.Getenv("EAT_SESSION_LOG_ROOT"))
	if root == "" {
		root = filepath.Join(os.TempDir(), "eat-session-logs")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(root, sessionID+".log")
	return &path, nil
}

func (o *Orchestrator) appendWorkerSessionOutput(ctx context.Context, sessionID string, chunk string, logPath *string) error {
	if logPath != nil && strings.TrimSpace(*logPath) != "" {
		path := strings.TrimSpace(*logPath)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		if _, err := file.WriteString(chunk); err != nil {
			_ = file.Close()
			return err
		}
		if err := file.Close(); err != nil {
			return err
		}
	}
	return o.repo.AppendSessionOutput(ctx, sessionID, chunk)
}

func (o *Orchestrator) publishMailboxMessage(taskID string, message *MailboxMessageRecord) {
	if message == nil {
		return
	}
	eventMessage := domain.MailboxEventMessage{
		ID:              message.ID,
		TaskID:          message.TaskID,
		TargetSubTaskID: message.TargetSubTaskID,
		SenderSubTaskID: message.SenderSubTaskID,
		MessageType:     message.MessageType,
		Content:         message.Content,
		CreatedAt:       message.CreatedAt,
	}
	o.publish(taskID, "mailbox:message", domain.MailboxMessageEventPayload(taskID, message))
	o.publish(taskID, "board:activity", domain.MailboxBoardActivityPayload(taskID, eventMessage))
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
		_ = o.repo.UpdateSubTask(ctx, st.ID, UpdateSubTaskInput{Status: stringPointer("PENDING")})
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
	if session, err := o.resolveLaunchSession(ctx, subTask.ID); err == nil && session != nil {
		endedAt := time.Now().UTC().Format(time.RFC3339Nano)
		_ = o.repo.UpdateSession(ctx, session.ID, UpdateSessionInput{
			Status:  stringPointer("FAILED"),
			EndedAt: &endedAt,
		})
	}
	_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
		Status:    stringPointer("FAILED"),
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
		Status:    stringPointer("ACTION_REQUIRED"),
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
	endedAtValue := endedAt
	_ = o.repo.UpdateSession(ctx, h.SessionID, UpdateSessionInput{
		Status:  stringPointer("FAILED"),
		EndedAt: &endedAtValue,
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
		_ = o.repo.UpdateSubTask(ctx, h.SubTaskID, UpdateSubTaskInput{Status: stringPointer("PENDING")})
		o.publish(h.TaskID, "subtask:status", map[string]any{
			"subTaskId": h.SubTaskID,
			"status":    "PENDING",
			"taskId":    h.TaskID,
		})
		o.LaunchApprovedSubTasks(ctx, h.TaskID)
	} else {
		errMsg := reason
		_ = o.repo.UpdateSubTask(ctx, h.SubTaskID, UpdateSubTaskInput{
			Status:    stringPointer("FAILED"),
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
			Status:     &subTask.Status,
			LastError:  nil,
			BranchName: &subTask.BranchName,
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
		startCommitSHA, resolveErr := git.ResolveRevision(ctx, worktreePath, "HEAD")
		if resolveErr == nil {
			_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
				Status:         &subTask.Status,
				LastError:      nil,
				BranchName:     &subTask.BranchName,
				StartCommitSHA: &startCommitSHA,
				WorktreePath:   &subTask.WorktreePath,
			})
		} else {
			_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
				Status:       &subTask.Status,
				LastError:    nil,
				BranchName:   &subTask.BranchName,
				WorktreePath: &subTask.WorktreePath,
			})
		}
	} else {
		if err := git.EnsureWorktree(ctx, repoPath, subTask.WorktreePath, subTask.BranchName); err != nil {
			return nil, fmt.Errorf("ensure worktree: %w", err)
		}
		startCommitSHA, resolveErr := git.ResolveRevision(ctx, subTask.WorktreePath, "HEAD")
		if resolveErr == nil {
			_ = o.repo.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
				Status:         &subTask.Status,
				LastError:      nil,
				BranchName:     &subTask.BranchName,
				StartCommitSHA: &startCommitSHA,
				WorktreePath:   &subTask.WorktreePath,
			})
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
		_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{Status: stringPointer("MERGED")})
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
			Status:    stringPointer("FAILED"),
			LastError: &errMsg,
		})
		_ = o.repo.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:    stringPointer("ACTION_REQUIRED"),
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
	_ = o.repo.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{Status: stringPointer("MERGED")})
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

		// Move the task into merge-time handling once all worker branches are terminal.
		_ = o.repo.UpdateTask(ctx, taskID, UpdateTaskInput{Status: stringPointer("MERGING")})
		o.publish(taskID, "task:status", map[string]any{
			"taskId": taskID,
			"status": "MERGING",
		})
	})
}

// buildWorkerPrompt constructs a detailed prompt for the worker agent.
func buildWorkerPrompt(task *TaskRecord, subTask *SubTaskRecord, attachments []AttachmentRecord, mailboxMessages []MailboxMessageRecord) string {
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

	if len(attachments) > 0 {
		parts = append(parts, "", "Attachments available to you (mounted read-only):")
		for _, attachment := range attachments {
			parts = append(parts, fmt.Sprintf("- %s (%s) -> %s", attachment.FileName, attachment.FileType, attachment.FilePath))
		}
	}

	if len(mailboxMessages) > 0 {
		parts = append(parts, "", "## Team Handoffs (read before you start)")
		for _, message := range mailboxMessages {
			parts = append(parts, formatMailboxPromptLine(message))
		}
	}

	parts = append(parts, "",
		"## Instructions",
		"- Complete your assigned work on the branch provided.",
		"- Commit all changes with clear, descriptive commit messages.",
		"- Do not modify files outside the scope of your assignment.",
		"- Treat mounted attachments as read-only reference material unless the operator explicitly asks you to rewrite them.",
		"- If you need to hand off API/DB contracts, blockers, or delivery readiness to the Lead or another subtask, write an `eat:mailbox` JSON block to stdout with schema: type, targetType, targetSubTaskId, content, branchRef.",
		"- Exit with code 0 on success.",
	)

	return strings.Join(parts, "\n")
}

func formatMailboxPromptLine(message MailboxMessageRecord) string {
	messageType := strings.TrimSpace(message.MessageType)
	if messageType == "" {
		messageType = "NOTE"
	}

	sender := "Lead"
	if message.SenderSubTaskID != nil && strings.TrimSpace(*message.SenderSubTaskID) != "" {
		sender = strings.TrimSpace(*message.SenderSubTaskID)
	}
	targetSuffix := ""
	if message.TargetType == "SUBTASK" && message.TargetSubTaskID != nil {
		targetSuffix = " -> you"
	}

	line := fmt.Sprintf("- [%s from %s%s] %s", messageType, sender, targetSuffix, strings.TrimSpace(message.Content))
	if message.BranchRef != nil && strings.TrimSpace(*message.BranchRef) != "" {
		line += fmt.Sprintf(" (branch: %s)", strings.TrimSpace(*message.BranchRef))
	}
	return line
}

func toAttachmentRefs(attachments []AttachmentRecord) []agent.AttachmentRef {
	if len(attachments) == 0 {
		return nil
	}
	result := make([]agent.AttachmentRef, 0, len(attachments))
	for _, attachment := range attachments {
		result = append(result, agent.AttachmentRef{
			AttachmentID: attachment.ID,
			FileName:     attachment.FileName,
			FilePath:     attachment.FilePath,
			FileType:     attachment.FileType,
		})
	}
	return result
}

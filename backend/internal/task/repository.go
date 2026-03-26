package task

import (
	"context"
	"database/sql"
	"encoding/json"
)

type Task struct {
	ID                  string  `json:"id"`
	ProjectID           string  `json:"projectId"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	LeadAgentType       string  `json:"leadAgentType"`
	BaseBranch          string  `json:"baseBranch"`
	BaseCommitSHA       string  `json:"baseCommitSha"`
	TaskBranchName      *string `json:"taskBranchName"`
	Status              string  `json:"status"`
	WorkspaceStage      string  `json:"workspaceStage,omitempty"`
	WorkspaceStageLabel string  `json:"workspaceStageLabel,omitempty"`
	PlanVersion         int64   `json:"planVersion"`
	CurrentPlanJSON     *string `json:"currentPlanJson"`
	ApprovedPlanJSON    *string `json:"approvedPlanJson"`
	LastError           *string `json:"lastError"`
	ArchivedAt          *string `json:"archivedAt"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
	Version             int64   `json:"version"`
}

type Message struct {
	ID        string  `json:"id"`
	TaskID    string  `json:"taskId"`
	SubTaskID *string `json:"subTaskId"`
	Role      string  `json:"role"`
	Content   string  `json:"content"`
	CreatedAt string  `json:"createdAt"`
}

type Attachment struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	FileName  string `json:"fileName"`
	FilePath  string `json:"filePath"`
	FileType  string `json:"fileType"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"createdAt"`
}

type Session struct {
	ID                   string  `json:"id"`
	TaskID               string  `json:"taskId"`
	SubTaskID            *string `json:"subTaskId"`
	AgentType            string  `json:"agentType"`
	SessionType          string  `json:"sessionType"`
	SandboxType          string  `json:"sandboxType"`
	ContainerID          *string `json:"containerId"`
	Status               string  `json:"status"`
	PID                  *int64  `json:"pid"`
	StartedAt            *string `json:"startedAt"`
	EndedAt              *string `json:"endedAt"`
	ExitCode             *int64  `json:"exitCode"`
	LogPath              *string `json:"logPath"`
	FirstOutputAt        *string `json:"firstOutputAt"`
	OutputBuffer         string  `json:"outputBuffer"`
	OutputBufferMaxBytes int64   `json:"outputBufferMaxBytes"`
	CreatedAt            string  `json:"createdAt"`
	UpdatedAt            string  `json:"updatedAt"`
}

type SubTask struct {
	ID                       string   `json:"id"`
	TaskID                   string   `json:"taskId"`
	Title                    string   `json:"title"`
	Description              string   `json:"description"`
	BranchSuffix             string   `json:"branchSuffix"`
	DependencyBranchSuffixes []string `json:"dependencyBranchSuffixes"`
	BranchName               *string  `json:"branchName"`
	StartCommitSHA           *string  `json:"startCommitSha"`
	WorktreePath             *string  `json:"worktreePath"`
	AgentType                string   `json:"agentType"`
	Status                   string   `json:"status"`
	AutoAssigned             bool     `json:"autoAssigned"`
	RetryCount               int64    `json:"retryCount"`
	LastError                *string  `json:"lastError"`
	LatestReviewDecision     *string  `json:"latestReviewDecision"`
	LatestReviewPhase        *string  `json:"latestReviewPhase"`
	LatestReviewSummary      *string  `json:"latestReviewSummary"`
	Role                     *string  `json:"role"`
	DisplayName              *string  `json:"displayName"`
	ExecutionOrder           *int64   `json:"executionOrder"`
	AssignmentSource         *string  `json:"assignmentSource"`
	RunSummary               *string  `json:"runSummary"`
	Version                  int64    `json:"version"`
	CreatedAt                string   `json:"createdAt"`
	UpdatedAt                string   `json:"updatedAt"`
}

type PlanSnapshot struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	Version   int64  `json:"version"`
	Source    string `json:"source"`
	Payload   string `json:"payload"`
	CreatedAt string `json:"createdAt"`
}

type MergeRecord struct {
	ID              string  `json:"id"`
	SubTaskID       string  `json:"subTaskId"`
	AttemptNumber   int64   `json:"attemptNumber"`
	Operation       string  `json:"operation"`
	SourceBranch    string  `json:"sourceBranch"`
	TargetBranch    string  `json:"targetBranch"`
	Status          string  `json:"status"`
	ResultCommitSHA *string `json:"resultCommitSha"`
	ConflictSummary *string `json:"conflictSummary"`
	CompletedAt     *string `json:"completedAt"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
}

type MailboxMessage struct {
	ID              string         `json:"id"`
	TaskID          string         `json:"taskId"`
	SenderType      string         `json:"senderType"`
	SenderSubTaskID *string        `json:"senderSubTaskId"`
	TargetType      string         `json:"targetType"`
	TargetSubTaskID *string        `json:"targetSubTaskId"`
	MessageType     string         `json:"messageType"`
	ArtifactRefs    []string       `json:"artifactRefs"`
	FileRefs        []string       `json:"fileRefs"`
	BranchRef       *string        `json:"branchRef"`
	SchemaJSON      map[string]any `json:"schemaJson"`
	RequiresAck     bool           `json:"requiresAck"`
	Content         string         `json:"content"`
	CreatedAt       string         `json:"createdAt"`
}

type IntegrationRun struct {
	ID                string  `json:"id"`
	TaskID            string  `json:"taskId"`
	IntegrationBranch string  `json:"integrationBranch"`
	Status            string  `json:"status"`
	StartedAt         *string `json:"startedAt"`
	EndedAt           *string `json:"endedAt"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type IntegrationQueueItem struct {
	ID               string  `json:"id"`
	IntegrationRunID string  `json:"integrationRunId"`
	SubTaskID        string  `json:"subTaskId"`
	QueueOrder       int64   `json:"queueOrder"`
	Status           string  `json:"status"`
	MergedCommitSHA  *string `json:"mergedCommitSha"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

type GateResult struct {
	ID               string         `json:"id"`
	IntegrationRunID string         `json:"integrationRunId"`
	GateType         string         `json:"gateType"`
	Status           string         `json:"status"`
	Summary          string         `json:"summary"`
	DetailsJSON      map[string]any `json:"detailsJson"`
	CreatedAt        string         `json:"createdAt"`
}

type Repository struct {
	db *sql.DB
	tx *sql.Tx
}

type UpdateTaskInput struct {
	Status              *string
	PlanVersion         *int64
	CurrentPlanJSON     *string
	SetCurrentPlanJSON  bool
	ApprovedPlanJSON    *string
	SetApprovedPlanJSON bool
	LastError           *string
	SetLastError        bool
	ArchivedAt          *string
	SetArchivedAt       bool
}

type CreatePlanSnapshotInput struct {
	TaskID  string
	Version int64
	Source  string
	Payload string
}

type CreateMessageInput struct {
	ID        string
	TaskID    string
	SubTaskID *string
	Role      string
	Content   string
	CreatedAt string
}

type CreateSessionInput struct {
	ID                   string
	TaskID               string
	SubTaskID            *string
	AgentType            string
	SessionType          string
	SandboxType          string
	ContainerID          *string
	Status               string
	PID                  *int64
	StartedAt            *string
	EndedAt              *string
	ExitCode             *int64
	LogPath              *string
	FirstOutputAt        *string
	OutputBuffer         string
	OutputBufferMaxBytes int64
	CreatedAt            string
	UpdatedAt            string
}

type UpdateSessionInput struct {
	Status        *string
	SetStatus     bool
	EndedAt       *string
	SetEndedAt    bool
	ExitCode      *int64
	SetExitCode   bool
	OutputBuffer  *string
	SetOutputBuff bool
	UpdatedAt     *string
}

type CreateMailboxMessageInput struct {
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

type UpdateSubTaskInput struct {
	Description             *string
	SetDescription          bool
	BranchName              *string
	SetBranchName           bool
	StartCommitSHA          *string
	SetStartCommitSHA       bool
	WorktreePath            *string
	SetWorktreePath         bool
	AgentType               *string
	Status                  *string
	AutoAssigned            *bool
	RetryCount              *int64
	LastError               *string
	SetLastError            bool
	LatestReviewDecision    *string
	SetLatestReviewDecision bool
	LatestReviewPhase       *string
	SetLatestReviewPhase    bool
	LatestReviewSummary     *string
	SetLatestReviewSummary  bool
	AssignmentSource        *string
	SetAssignmentSource     bool
	RunSummary              *string
	SetRunSummary           bool
}

type CreateIntegrationRunInput struct {
	ID                string
	TaskID            string
	IntegrationBranch string
	Status            string
	StartedAt         *string
	EndedAt           *string
	CreatedAt         string
	UpdatedAt         string
}

type UpdateIntegrationRunInput struct {
	IntegrationBranch *string
	Status            *string
	StartedAt         *string
	SetStartedAt      bool
	EndedAt           *string
	SetEndedAt        bool
}

type CreateIntegrationQueueItemInput struct {
	ID               string
	IntegrationRunID string
	SubTaskID        string
	QueueOrder       int64
	Status           string
	MergedCommitSHA  *string
	CreatedAt        string
	UpdatedAt        string
}

type UpdateIntegrationQueueItemInput struct {
	QueueOrder      *int64
	Status          *string
	MergedCommitSHA *string
	SetMergedCommit bool
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

type queryExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (r *Repository) RunInTransaction(ctx context.Context, fn func(*Repository) error) error {
	if r.db == nil {
		return fn(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	transactionalRepository := &Repository{db: r.db, tx: tx}
	if err := fn(transactionalRepository); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (r *Repository) exec() queryExecutor {
	if r.tx != nil {
		return r.tx
	}
	return r.db
}

func derefOr(current string, next *string) string {
	if next == nil {
		return current
	}
	return *next
}

func normalizeStringSlice(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := value
		if trimmed == "" {
			continue
		}
		if seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		result = append(result, trimmed)
	}
	return result
}

func cloneJSONObject(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	cloned := make(map[string]any, len(value))
	for key, item := range value {
		cloned[key] = item
	}
	return cloned
}

func parseStringSliceJSON(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var parsed []string
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []string{}
	}
	return normalizeStringSlice(parsed)
}

func parseJSONObjectJSON(raw *string) map[string]any {
	if raw == nil || *raw == "" {
		return nil
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(*raw), &parsed); err != nil {
		return nil
	}
	return parsed
}

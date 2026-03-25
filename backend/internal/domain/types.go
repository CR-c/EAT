package domain

type TaskStatus string
type SubTaskStatus string
type SessionStatus string
type SessionType string
type ReviewPhase string
type MergeStatus string
type MergeOperation string
type IntegrationRunStatus string

const (
	TaskStatusActionRequired TaskStatus = "ACTION_REQUIRED"
	TaskStatusCancelled      TaskStatus = "CANCELLED"
	TaskStatusClarifying     TaskStatus = "CLARIFYING"
	TaskStatusCompleted      TaskStatus = "COMPLETED"
	TaskStatusDraft          TaskStatus = "DRAFT"
	TaskStatusExecuting      TaskStatus = "EXECUTING"
	TaskStatusFailed         TaskStatus = "FAILED"
	TaskStatusMerging        TaskStatus = "MERGING"
	TaskStatusPlanning       TaskStatus = "PLANNING"
	TaskStatusPlanReview     TaskStatus = "PLAN_REVIEW"
	TaskStatusReviewing      TaskStatus = "REVIEWING"
)

const (
	SubTaskStatusAccepted       SubTaskStatus = "ACCEPTED"
	SubTaskStatusBlocked        SubTaskStatus = "BLOCKED"
	SubTaskStatusCancelled      SubTaskStatus = "CANCELLED"
	SubTaskStatusDiscarded      SubTaskStatus = "DISCARDED"
	SubTaskStatusDiscardPending SubTaskStatus = "DISCARD_PENDING"
	SubTaskStatusFailed         SubTaskStatus = "FAILED"
	SubTaskStatusMerged         SubTaskStatus = "MERGED"
	SubTaskStatusPending        SubTaskStatus = "PENDING"
	SubTaskStatusReady          SubTaskStatus = "READY"
	SubTaskStatusReviewPending  SubTaskStatus = "REVIEW_PENDING"
	SubTaskStatusReworkRequired SubTaskStatus = "REWORK_REQUIRED"
	SubTaskStatusRunning        SubTaskStatus = "RUNNING"
)

const (
	SessionStatusCancelled SessionStatus = "CANCELLED"
	SessionStatusCompleted SessionStatus = "COMPLETED"
	SessionStatusFailed    SessionStatus = "FAILED"
	SessionStatusPending   SessionStatus = "PENDING"
	SessionStatusRunning   SessionStatus = "RUNNING"
	SessionStatusStarting  SessionStatus = "STARTING"
	SessionStatusStopping  SessionStatus = "STOPPING"
)

const (
	SessionTypeLead   SessionType = "LEAD"
	SessionTypeWorker SessionType = "WORKER"
)

const (
	ReviewPhaseFinal       ReviewPhase = "FINAL"
	ReviewPhaseIncremental ReviewPhase = "INCREMENTAL"
)

const (
	MergeStatusAborted   MergeStatus = "ABORTED"
	MergeStatusConflict  MergeStatus = "CONFLICT"
	MergeStatusPending   MergeStatus = "PENDING"
	MergeStatusSucceeded MergeStatus = "SUCCEEDED"
)

const (
	MergeOperationMerge  MergeOperation = "MERGE"
	MergeOperationRebase MergeOperation = "REBASE"
)

const (
	IntegrationRunStatusActionRequired IntegrationRunStatus = "ACTION_REQUIRED"
	IntegrationRunStatusCompleted      IntegrationRunStatus = "COMPLETED"
	IntegrationRunStatusFailed         IntegrationRunStatus = "FAILED"
	IntegrationRunStatusQueued         IntegrationRunStatus = "QUEUED"
	IntegrationRunStatusRolledBack     IntegrationRunStatus = "ROLLED_BACK"
	IntegrationRunStatusRunning        IntegrationRunStatus = "RUNNING"
)

type Task struct {
	ID             string     `json:"id"`
	ProjectID      string     `json:"projectId"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	LeadAgentType  string     `json:"leadAgentType"`
	BaseBranch     string     `json:"baseBranch"`
	BaseCommitSHA  string     `json:"baseCommitSha"`
	TaskBranchName *string    `json:"taskBranchName,omitempty"`
	Status         TaskStatus `json:"status"`
	PlanVersion    int64      `json:"planVersion"`
}

type SubTask struct {
	ID                       string        `json:"id"`
	TaskID                   string        `json:"taskId"`
	Title                    string        `json:"title"`
	Description              string        `json:"description"`
	BranchSuffix             string        `json:"branchSuffix"`
	DependencyBranchSuffixes []string      `json:"dependencyBranchSuffixes"`
	BranchName               *string       `json:"branchName,omitempty"`
	WorktreePath             *string       `json:"worktreePath,omitempty"`
	AgentType                string        `json:"agentType"`
	Status                   SubTaskStatus `json:"status"`
	RetryCount               int64         `json:"retryCount"`
}

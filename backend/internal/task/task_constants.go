package task

const maxAttachmentBytes = 10 * 1024 * 1024

const (
	planSnapshotSourceLeadGenerated       = "LEAD_GENERATED"
	planSnapshotSourceApproved            = "APPROVED"
	planSnapshotSourceRestoredFromHistory = "RESTORED_FROM_HISTORY"
	planSnapshotSourceReplanRequest       = "REPLAN_REQUEST"
)

const (
	subTaskAssignmentSourceLead = "LEAD"
	subTaskStatusBlocked        = "BLOCKED"
	subTaskStatusPending        = "PENDING"
)

const taskPausedReasonPrefix = "Paused by operator from "

const (
	taskStatusActionRequired = "ACTION_REQUIRED"
	taskStatusClarifying     = "CLARIFYING"
	taskStatusExecuting      = "EXECUTING"
	taskStatusMerging        = "MERGING"
	taskStatusPlanning       = "PLANNING"
	taskStatusReviewing      = "REVIEWING"
)

const (
	sessionSandboxDocker   = "DOCKER"
	sessionSandboxHost     = "HOST"
	sessionStatusCancelled = "CANCELLED"
	sessionStatusRunning   = "RUNNING"
	sessionTypeLead        = "LEAD"
	sessionTypeWorker      = "WORKER"
)

const (
	messageRoleSystem = "SYSTEM"
	messageRoleUser   = "USER"
)

const (
	mailboxParticipantLead    = "LEAD"
	mailboxParticipantSubTask = "SUBTASK"
	mailboxTargetLead         = "LEAD"
	mailboxTargetSubTask      = "SUBTASK"
)

const (
	mailboxMessageTypeNote             = "NOTE"
	mailboxMessageTypeBlocker          = "BLOCKER"
	mailboxMessageTypeDeliverableReady = "DELIVERABLE_READY"
	mailboxMessageTypeTestRequest      = "TEST_REQUEST"
	mailboxMessageTypeReviewRequest    = "REVIEW_REQUEST"
	mailboxMessageTypeAPIContract      = "API_CONTRACT"
	mailboxMessageTypeDBContract       = "DB_CONTRACT"
)

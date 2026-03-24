package task

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/git"
	"eat/backend/internal/project"
	"eat/backend/internal/tasktemplates"
	"github.com/google/uuid"
)

const (
	ErrorCodeInvalidPlan               = "INVALID_PLAN"
	ErrorCodePlanSnapshotNotFound      = "PLAN_SNAPSHOT_NOT_FOUND"
	ErrorCodePlanTemplateNotFound      = "PLAN_TEMPLATE_NOT_FOUND"
	ErrorCodePlanTemplateRequired      = "PLAN_TEMPLATE_REQUIRED"
	ErrorCodeAttachmentContentRequired = "ATTACHMENT_CONTENT_REQUIRED"
	ErrorCodeAttachmentMimeMismatch    = "ATTACHMENT_MIME_MISMATCH"
	ErrorCodeAttachmentNameRequired    = "ATTACHMENT_NAME_REQUIRED"
	ErrorCodeAttachmentPathNotFound    = "ATTACHMENT_PATH_NOT_FOUND"
	ErrorCodeAttachmentSizeExceeded    = "ATTACHMENT_SIZE_EXCEEDED"
	ErrorCodeAttachmentTypeUnsupported = "ATTACHMENT_TYPE_UNSUPPORTED"
	ErrorCodeBaseBranchCreateFailed    = "BASE_BRANCH_CREATE_FAILED"
	ErrorCodeBaseBranchNotFound        = "BASE_BRANCH_NOT_FOUND"
	ErrorCodeBaseBranchRequired        = "BASE_BRANCH_REQUIRED"
	ErrorCodeDescriptionRequired       = "DESCRIPTION_REQUIRED"
	ErrorCodeInvalidAttachmentPayload  = "INVALID_ATTACHMENT_PAYLOAD"
	ErrorCodeLeadAgentInvalid          = "LEAD_AGENT_INVALID"
	ErrorCodeLeadAgentRequired         = "LEAD_AGENT_REQUIRED"
	ErrorCodeLeadAgentUnhealthy        = "LEAD_AGENT_UNHEALTHY"
	ErrorCodeProjectNotFound           = "PROJECT_NOT_FOUND"
	ErrorCodeRequirementsConfirmed     = "REQUIREMENTS_ALREADY_CONFIRMED"
	ErrorCodeSessionNotRunning         = "SESSION_NOT_RUNNING"
	ErrorCodeSubTaskActiveSession      = "SUBTASK_ACTIVE_SESSION_EXISTS"
	ErrorCodeSubTaskCancelNotAllowed   = "SUBTASK_CANCEL_NOT_ALLOWED"
	ErrorCodeSubTaskChangeAgentInvalid = "SUBTASK_CHANGE_AGENT_NOT_ALLOWED"
	ErrorCodeSubTaskDiscardNotAllowed  = "SUBTASK_DISCARD_NOT_ALLOWED"
	ErrorCodeSubTaskNotFound           = "SUBTASK_NOT_FOUND"
	ErrorCodeSubTaskReassignNotAllowed = "SUBTASK_REASSIGN_NOT_ALLOWED"
	ErrorCodeSubTaskReworkNotAllowed   = "SUBTASK_REWORK_NOT_ALLOWED"
	ErrorCodeSubTaskRetryNotAllowed    = "SUBTASK_RETRY_NOT_ALLOWED"
	ErrorCodeTaskNotFound              = "TASK_NOT_FOUND"
	ErrorCodeTaskBranchCleanupFailed   = "TASK_BRANCH_CLEANUP_FAILED"
	ErrorCodeTaskDeleteRequiresPause   = "TASK_DELETE_REQUIRES_PAUSE"
	ErrorCodeTaskMessageRequired       = "TASK_MESSAGE_REQUIRED"
	ErrorCodeTaskNotClarifying         = "TASK_NOT_CLARIFYING"
	ErrorCodeTaskNotDraft              = "TASK_NOT_DRAFT"
	ErrorCodeTaskNotPlanReview         = "TASK_NOT_PLAN_REVIEW"
	ErrorCodeTaskPauseNotAllowed       = "TASK_PAUSE_NOT_ALLOWED"
	ErrorCodeTaskResumeNotAllowed      = "TASK_RESUME_NOT_ALLOWED"
	ErrorCodeTitleRequired             = "TITLE_REQUIRED"
)

const maxAttachmentBytes = 10 * 1024 * 1024
const planSnapshotSourceLeadGenerated = "LEAD_GENERATED"
const planSnapshotSourceApproved = "APPROVED"
const planSnapshotSourceRestoredFromHistory = "RESTORED_FROM_HISTORY"
const subTaskAssignmentSourceLead = "LEAD"
const subTaskStatusBlocked = "BLOCKED"
const subTaskStatusPending = "PENDING"
const taskPausedReasonPrefix = "Paused by operator from "
const taskStatusActionRequired = "ACTION_REQUIRED"
const taskStatusClarifying = "CLARIFYING"
const taskStatusExecuting = "EXECUTING"
const taskStatusMerging = "MERGING"
const taskStatusPlanning = "PLANNING"
const taskStatusReviewing = "REVIEWING"
const sessionSandboxDocker = "DOCKER"
const sessionSandboxHost = "HOST"
const sessionStatusCancelled = "CANCELLED"
const sessionStatusRunning = "RUNNING"
const sessionTypeLead = "LEAD"
const sessionTypeWorker = "WORKER"
const messageRoleSystem = "SYSTEM"
const messageRoleUser = "USER"
const mailboxParticipantLead = "LEAD"
const mailboxParticipantSubTask = "SUBTASK"
const mailboxTargetLead = "LEAD"
const mailboxTargetSubTask = "SUBTASK"
const mailboxMessageTypeNote = "NOTE"
const mailboxMessageTypeBlocker = "BLOCKER"
const mailboxMessageTypeDeliverableReady = "DELIVERABLE_READY"
const mailboxMessageTypeTestRequest = "TEST_REQUEST"
const mailboxMessageTypeReviewRequest = "REVIEW_REQUEST"
const mailboxMessageTypeAPIContract = "API_CONTRACT"
const mailboxMessageTypeDBContract = "DB_CONTRACT"

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Detail struct {
	Task            *Task            `json:"task"`
	Messages        []Message        `json:"messages"`
	Attachments     []Attachment     `json:"attachments"`
	PlanSnapshots   []PlanSnapshot   `json:"planSnapshots"`
	Sessions        []Session        `json:"sessions"`
	SubTasks        []SubTask        `json:"subTasks"`
	CleanupWarnings []string         `json:"cleanupWarnings"`
	MailboxMessages []MailboxMessage `json:"mailboxMessages"`
	Board           map[string]any   `json:"board"`
	Integration     map[string]any   `json:"integration"`
	Team            map[string]any   `json:"team"`
}

type Service struct {
	repository        *Repository
	projectRepository *project.Repository
	agentService      *agent.Service
	bus               *eventbus.Bus
	uploadRootPath    string
}

type Dependencies struct {
	Repository        *Repository
	ProjectRepository *project.Repository
	AgentService      *agent.Service
	Bus               *eventbus.Bus
	UploadRootPath    string
}

func NewService(deps Dependencies) *Service {
	return &Service{
		repository:        deps.Repository,
		projectRepository: deps.ProjectRepository,
		agentService:      deps.AgentService,
		bus:               deps.Bus,
		uploadRootPath:    deps.UploadRootPath,
	}
}

func (s *Service) ListProjectTasks(ctx context.Context, projectID string, includeArchived bool) ([]Task, error) {
	return s.repository.ListTasksByProjectID(ctx, projectID, includeArchived)
}

func (s *Service) GetTask(ctx context.Context, taskID string) (*Detail, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	messages, err := s.repository.ListMessagesByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_MESSAGES_READ_FAILED", err.Error(), nil)
	}
	attachments, err := s.repository.ListAttachmentsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_ATTACHMENTS_READ_FAILED", err.Error(), nil)
	}
	planSnapshots, err := s.repository.ListPlanSnapshotsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_PLAN_SNAPSHOTS_READ_FAILED", err.Error(), nil)
	}
	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}
	mailboxMessages, err := s.repository.ListMailboxMessagesByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_MAILBOX_MESSAGES_READ_FAILED", err.Error(), nil)
	}
	integrationView, errPayload := s.buildTaskIntegrationView(ctx, taskRecord, subTasks)
	if errPayload != nil {
		return nil, errPayload
	}
	team := s.buildTaskTeamView(taskRecord, sessions, subTasks)
	board := s.buildTaskBoardSnapshot(taskRecord, sessions, subTasks, mailboxMessages, integrationView)

	return &Detail{
		Task:            taskRecord,
		Messages:        messages,
		Attachments:     attachments,
		PlanSnapshots:   planSnapshots,
		Sessions:        sessions,
		SubTasks:        subTasks,
		CleanupWarnings: []string{},
		MailboxMessages: mailboxMessages,
		Board:           board,
		Integration:     integrationView,
		Team:            team,
	}, nil
}

type CreateTaskRequest struct {
	ProjectID            string                  `json:"projectId"`
	Title                string                  `json:"title"`
	Description          string                  `json:"description"`
	LeadAgentType        string                  `json:"leadAgentType"`
	BaseBranch           string                  `json:"baseBranch"`
	BaseBranchMode       string                  `json:"baseBranchMode"`
	BaseBranchStartPoint string                  `json:"baseBranchStartPoint"`
	Attachments          []AttachmentCreateInput `json:"attachments"`
}

type AttachmentCreateInput struct {
	FileName      string `json:"fileName"`
	FilePath      string `json:"filePath"`
	FileType      string `json:"fileType"`
	MimeType      string `json:"mimeType"`
	ContentBase64 string `json:"contentBase64"`
}

type CreateTaskResult struct {
	Task        *Task        `json:"task"`
	Attachments []Attachment `json:"attachments"`
}

type CreateGuidedTaskRequest struct {
	CreateTaskRequest
	TemplateID string `json:"templateId"`
	AgentType  string `json:"agentType"`
}

type CreateGuidedTaskResult struct {
	Task        *Task                  `json:"task"`
	Attachments []Attachment           `json:"attachments"`
	CurrentPlan tasktemplates.Plan     `json:"currentPlan"`
	Template    tasktemplates.Template `json:"template"`
}

type PlanSeedRequest struct {
	TemplateID string `json:"templateId"`
	AgentType  string `json:"agentType"`
}

type PlanSeedResult struct {
	Task        *Task                  `json:"task"`
	CurrentPlan tasktemplates.Plan     `json:"currentPlan"`
	Template    tasktemplates.Template `json:"template"`
}

type UpdateCurrentPlanResult struct {
	Task        *Task              `json:"task"`
	CurrentPlan tasktemplates.Plan `json:"currentPlan"`
}

type ApprovePlanResult struct {
	ApprovalReady    bool               `json:"approvalReady"`
	ApprovedSnapshot *PlanSnapshot      `json:"approvedSnapshot,omitempty"`
	CurrentPlan      tasktemplates.Plan `json:"currentPlan"`
	Idempotent       bool               `json:"idempotent"`
	Sessions         []Session          `json:"sessions,omitempty"`
	SubTasks         []SubTask          `json:"subTasks"`
	Task             *Task              `json:"task"`
}

type RestorePlanSnapshotResult struct {
	CurrentPlan tasktemplates.Plan `json:"currentPlan"`
	SnapshotID  string             `json:"snapshotId"`
	Task        *Task              `json:"task"`
}

type RestorePlanSnapshotRequest struct {
	SnapshotID string `json:"snapshotId"`
}

type StartClarificationRequest struct {
	Content string `json:"content"`
}

type StartClarificationResult struct {
	Session *Session `json:"session"`
	Task    *Task    `json:"task"`
}

type SendTaskMessageRequest struct {
	Content string `json:"content"`
}

type SendTaskMessageResult struct {
	Message *Message `json:"message"`
	Task    *Task    `json:"task"`
}

type TaskCleanupResult struct {
	CleanedBranches  []string `json:"cleanedBranches"`
	CleanedWorktrees []string `json:"cleanedWorktrees"`
}

type ArchiveTaskRequest struct {
	DeleteBranches bool `json:"deleteBranches"`
}

type ArchiveTaskResult struct {
	BranchCleanup TaskCleanupResult `json:"branchCleanup"`
	Task          *Task             `json:"task"`
}

type UnarchiveTaskResult struct {
	Task *Task `json:"task"`
}

type PauseTaskResult struct {
	Task *Task `json:"task"`
}

type DeleteTaskRequest struct {
	DeleteBranches bool `json:"deleteBranches"`
}

type DeleteTaskResult struct {
	BranchCleanup TaskCleanupResult `json:"branchCleanup"`
	Task          *Task             `json:"task"`
}

type ResumeTaskResult struct {
	Task *Task `json:"task"`
}

type StopLeadSessionResult struct {
	Task *Task `json:"task"`
}

type ConfirmRequirementsResult struct {
	Message *Message `json:"message"`
	Task    *Task    `json:"task"`
}

type GetTaskTeamResult struct {
	Team map[string]any `json:"team"`
}

type GetTaskBoardResult struct {
	Board map[string]any `json:"board"`
}

type SendMailboxMessageRequest struct {
	Content         string         `json:"content"`
	SenderSubTaskID string         `json:"senderSubTaskId"`
	TargetSubTaskID string         `json:"targetSubTaskId"`
	TargetType      string         `json:"targetType"`
	MessageType     string         `json:"messageType"`
	ArtifactRefs    []string       `json:"artifactRefs"`
	FileRefs        []string       `json:"fileRefs"`
	BranchRef       string         `json:"branchRef"`
	SchemaJSON      map[string]any `json:"schemaJson"`
	RequiresAck     bool           `json:"requiresAck"`
}

type SendMailboxMessageResult struct {
	Message *MailboxMessage `json:"message"`
}

type RetrySubTaskRequest struct {
	Description string `json:"description"`
}

type ReworkSubTaskRequest struct {
	Description string `json:"description"`
}

type ReassignSubTaskRequest struct {
	AgentType   string `json:"agentType"`
	Description string `json:"description"`
}

type ChangeSubTaskAgentRequest struct {
	AgentType   string `json:"agentType"`
	Description string `json:"description"`
}

type SubTaskMutationResult struct {
	Session *Session `json:"session"`
	SubTask *SubTask `json:"subTask"`
	Task    *Task    `json:"task"`
}

type IntegrationMutationResult struct {
	IntegrationRun       *IntegrationRun       `json:"integrationRun"`
	IntegrationQueueItem *IntegrationQueueItem `json:"integrationQueueItem"`
	Task                 *Task                 `json:"task"`
}

type RebaseRetrySubTaskResult struct {
	MergeStatus string   `json:"mergeStatus"`
	SubTask     *SubTask `json:"subTask"`
	Task        *Task    `json:"task"`
}

type dependencyScheduleResult struct {
	ReleasedSessions []Session
	ReleasedSubTasks []SubTask
	Task             *Task
}

func (s *Service) CreateTask(ctx context.Context, input CreateTaskRequest) (*CreateTaskResult, *Error) {
	projectID := normalizeRequiredString(input.ProjectID)
	title := normalizeRequiredString(input.Title)
	description := normalizeRequiredString(input.Description)
	baseBranch := normalizeRequiredString(input.BaseBranch)
	leadAgentType := normalizeRequiredString(input.LeadAgentType)
	baseBranchMode := "existing"
	if strings.TrimSpace(input.BaseBranchMode) == "new" {
		baseBranchMode = "new"
	}
	baseBranchStartPoint := normalizeRequiredString(input.BaseBranchStartPoint)

	if projectID == "" {
		return nil, failure(ErrorCodeProjectNotFound, "Project is required.", nil)
	}
	if baseBranch == "" {
		return nil, failure(ErrorCodeBaseBranchRequired, "Base branch is required.", nil)
	}
	if leadAgentType == "" {
		return nil, failure(ErrorCodeLeadAgentRequired, "Lead agent type is required.", nil)
	}
	if title == "" {
		return nil, failure(ErrorCodeTitleRequired, "Task title is required.", nil)
	}
	if description == "" {
		return nil, failure(ErrorCodeDescriptionRequired, "Task description is required.", nil)
	}

	projectRecord, err := s.projectRepository.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": projectID})
	}

	agents := s.agentService.ListAgents()
	var selectedAgent *agent.Descriptor
	for index := range agents {
		if agents[index].Name == leadAgentType {
			selectedAgent = &agents[index]
			break
		}
	}
	if selectedAgent == nil || !selectedAgent.Capabilities.CanOrchestrate {
		return nil, failure(ErrorCodeLeadAgentInvalid, "Lead agent must be a registered orchestrator.", map[string]any{"leadAgentType": leadAgentType})
	}

	healthSnapshots := s.agentService.GetHealth(ctx)
	agentHealth := healthSnapshots[leadAgentType]
	if !agentHealth.Available {
		return nil, failure(
			ErrorCodeLeadAgentUnhealthy,
			"Lead agent is unhealthy and cannot be used for task creation.",
			map[string]any{
				"leadAgentType": leadAgentType,
				"failureReason": agentHealth.FailureReason,
			},
		)
	}

	resolvedBaseBranch := baseBranch
	var baseCommitSHA string
	var taskBranchName *string

	if baseBranchMode == "new" {
		if baseBranchStartPoint == "" {
			return nil, failure(ErrorCodeBaseBranchRequired, "Base branch start point is required.", nil)
		}

		startPointCommitSHA, err := git.ResolveRevision(ctx, projectRecord.Path, baseBranchStartPoint)
		if err != nil {
			return nil, failure(ErrorCodeBaseBranchNotFound, "Selected base branch could not be resolved to a commit.", map[string]any{"baseBranch": baseBranchStartPoint})
		}

		uniqueBaseBranch, err := git.ResolveUniqueBranchName(ctx, projectRecord.Path, baseBranch)
		if err != nil {
			return nil, failure("BASE_BRANCH_RESOLUTION_FAILED", err.Error(), nil)
		}
		if err := git.EnsureBranchExists(ctx, projectRecord.Path, uniqueBaseBranch, startPointCommitSHA); err != nil {
			return nil, failure(ErrorCodeBaseBranchCreateFailed, "Requested base branch could not be created.", map[string]any{"baseBranch": uniqueBaseBranch, "sourceBranch": baseBranchStartPoint})
		}

		resolvedBaseBranch = uniqueBaseBranch
	}

	baseCommitSHA, err = git.ResolveRevision(ctx, projectRecord.Path, resolvedBaseBranch)
	if err != nil {
		return nil, failure(ErrorCodeBaseBranchNotFound, "Selected base branch could not be resolved to a commit.", map[string]any{"baseBranch": resolvedBaseBranch})
	}

	desiredTaskBranchName := buildTaskMainlineBranchName(title)
	resolvedTaskBranchName, err := git.ResolveUniqueBranchName(ctx, projectRecord.Path, desiredTaskBranchName)
	if err != nil {
		return nil, failure("TASK_BRANCH_RESOLUTION_FAILED", err.Error(), nil)
	}
	if err := git.EnsureBranchExists(ctx, projectRecord.Path, resolvedTaskBranchName, baseCommitSHA); err != nil {
		return nil, failure(ErrorCodeBaseBranchCreateFailed, "Task execution branch could not be created.", map[string]any{"baseBranch": resolvedTaskBranchName, "sourceBranch": resolvedBaseBranch})
	}
	taskBranchName = &resolvedTaskBranchName

	normalizedAttachments := make([]normalizedAttachment, 0, len(input.Attachments))
	for _, attachmentInput := range input.Attachments {
		attachment, serviceError := normalizeAttachmentInput(attachmentInput)
		if serviceError != nil {
			return nil, serviceError
		}
		normalizedAttachments = append(normalizedAttachments, attachment)
	}

	taskRecord, err := s.repository.CreateTask(ctx, CreateTaskRecordInput{
		ProjectID:      projectID,
		Title:          title,
		Description:    description,
		LeadAgentType:  leadAgentType,
		BaseBranch:     resolvedBaseBranch,
		BaseCommitSHA:  baseCommitSHA,
		TaskBranchName: taskBranchName,
	})
	if err != nil {
		return nil, failure("TASK_CREATE_FAILED", err.Error(), nil)
	}

	attachments, serviceError := s.persistAttachments(ctx, taskRecord, normalizedAttachments)
	if serviceError != nil {
		return nil, serviceError
	}

	return &CreateTaskResult{
		Task:        taskRecord,
		Attachments: attachments,
	}, nil
}

func (s *Service) CreateGuidedTask(ctx context.Context, input CreateGuidedTaskRequest) (*CreateGuidedTaskResult, *Error) {
	templateID := normalizeRequiredString(input.TemplateID)
	if templateID == "" {
		return nil, failure(ErrorCodePlanTemplateRequired, "A task template must be selected before starting the guided flow.", nil)
	}

	workerAgentType := s.resolveDefaultTemplateAgentType(&Task{LeadAgentType: input.LeadAgentType}, input.AgentType)
	seed := tasktemplates.BuildSeed(templateID, tasktemplates.BuildOptions{
		AgentType:   workerAgentType,
		Description: input.Description,
		Title:       input.Title,
	})
	if seed == nil {
		return nil, failure(ErrorCodePlanTemplateNotFound, "Requested plan template was not found.", map[string]any{"templateId": templateID})
	}

	if validationError := validatePlan(seed.Plan); validationError != nil {
		return nil, validationError
	}

	createResult, serviceError := s.CreateTask(ctx, input.CreateTaskRequest)
	if serviceError != nil {
		return nil, serviceError
	}

	currentPlanJSONBytes, err := json.Marshal(seed.Plan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)
	status := "PLAN_REVIEW"
	planVersion := int64(1)

	taskRecord, err := s.repository.UpdateTask(ctx, createResult.Task.ID, UpdateTaskInput{
		Status:             &status,
		PlanVersion:        &planVersion,
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
		TaskID:  createResult.Task.ID,
		Version: taskRecord.PlanVersion,
		Source:  planSnapshotSourceLeadGenerated,
		Payload: currentPlanJSON,
	}); err != nil {
		return nil, failure("PLAN_SNAPSHOT_CREATE_FAILED", err.Error(), nil)
	}

	return &CreateGuidedTaskResult{
		Task:        taskRecord,
		Attachments: createResult.Attachments,
		CurrentPlan: seed.Plan,
		Template:    seed.Template,
	}, nil
}

func (s *Service) ApplyPlanSeed(ctx context.Context, taskID string, input PlanSeedRequest) (*PlanSeedResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan template seeding is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	templateID := normalizeRequiredString(input.TemplateID)
	if templateID == "" {
		return nil, failure(ErrorCodePlanTemplateRequired, "A plan template must be selected before seeding.", nil)
	}

	workerAgentType := s.resolveDefaultTemplateAgentType(taskRecord, input.AgentType)
	seed := tasktemplates.BuildSeed(templateID, tasktemplates.BuildOptions{
		AgentType:   workerAgentType,
		Description: taskRecord.Description,
		Title:       taskRecord.Title,
	})
	if seed == nil {
		return nil, failure(ErrorCodePlanTemplateNotFound, "Requested plan template was not found.", map[string]any{"templateId": templateID})
	}

	if validationError := validatePlan(seed.Plan); validationError != nil {
		return nil, validationError
	}

	currentPlanJSONBytes, err := json.Marshal(seed.Plan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	return &PlanSeedResult{
		Task:        nextTask,
		CurrentPlan: seed.Plan,
		Template:    seed.Template,
	}, nil
}

func (s *Service) UpdateCurrentPlan(ctx context.Context, taskID string, input tasktemplates.Plan) (*UpdateCurrentPlanResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan drafts can only be edited during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	normalizedPlan, validationError := s.normalizeAndValidatePlan(input)
	if validationError != nil {
		return nil, validationError
	}

	currentPlanJSONBytes, err := json.Marshal(normalizedPlan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_CURRENT_PLAN_UPDATE_FAILED", err.Error(), nil)
	}

	return &UpdateCurrentPlanResult{
		Task:        nextTask,
		CurrentPlan: normalizedPlan,
	}, nil
}

func (s *Service) ApprovePlan(ctx context.Context, taskID string) (*ApprovePlanResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	if taskRecord.Status == "EXECUTING" && taskRecord.ApprovedPlanJSON != nil && strings.TrimSpace(*taskRecord.ApprovedPlanJSON) != "" {
		currentPlan := parsePlanJSON(*taskRecord.ApprovedPlanJSON)
		if currentPlan == nil {
			currentPlan = parsePlanJSON(derefString(taskRecord.CurrentPlanJSON))
		}
		if currentPlan == nil {
			return nil, failure(ErrorCodeInvalidPlan, "Stored approved plan is not valid JSON.", map[string]any{"taskId": taskID})
		}

		subTasks, listErr := s.repository.ListSubTasksByTaskID(ctx, taskID)
		if listErr != nil {
			return nil, failure("TASK_SUBTASKS_READ_FAILED", listErr.Error(), nil)
		}

		return &ApprovePlanResult{
			ApprovalReady: true,
			CurrentPlan:   *currentPlan,
			Idempotent:    true,
			SubTasks:      subTasks,
			Task:          taskRecord,
		}, nil
	}

	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan approval is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	parsedPlan := parsePlanJSON(derefString(taskRecord.CurrentPlanJSON))
	if parsedPlan == nil {
		return nil, failure(ErrorCodeInvalidPlan, "Stored current plan is not valid JSON.", map[string]any{"taskId": taskID})
	}
	normalizedPlan, validationError := s.normalizeAndValidatePlan(*parsedPlan)
	if validationError != nil {
		return nil, validationError
	}

	approvedPlanJSONBytes, err := json.Marshal(normalizedPlan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	approvedPlanJSON := string(approvedPlanJSONBytes)

	result := &ApprovePlanResult{
		ApprovalReady: true,
		CurrentPlan:   normalizedPlan,
	}

	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		currentTask, readErr := repository.FindTaskByID(ctx, taskID)
		if readErr != nil {
			return readErr
		}
		if currentTask == nil {
			return serviceFailure{payload: failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})}
		}
		if currentTask.Status == "EXECUTING" && currentTask.ApprovedPlanJSON != nil && strings.TrimSpace(*currentTask.ApprovedPlanJSON) != "" {
			subTasks, listErr := repository.ListSubTasksByTaskID(ctx, taskID)
			if listErr != nil {
				return listErr
			}
			result.Idempotent = true
			result.SubTasks = subTasks
			result.Task = currentTask
			return nil
		}
		if currentTask.Status != "PLAN_REVIEW" {
			return serviceFailure{payload: failure(
				ErrorCodeTaskNotPlanReview,
				"Plan approval is only available during PLAN_REVIEW.",
				map[string]any{"status": currentTask.Status, "taskId": taskID},
			)}
		}

		approvedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			CurrentPlanJSON:     &approvedPlanJSON,
			SetCurrentPlanJSON:  true,
			ApprovedPlanJSON:    &approvedPlanJSON,
			SetApprovedPlanJSON: true,
			LastError:           nil,
			SetLastError:        true,
		})
		if updateErr != nil {
			return updateErr
		}

		approvedSnapshot, snapshotErr := repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
			TaskID:  taskID,
			Version: approvedTask.PlanVersion,
			Source:  planSnapshotSourceApproved,
			Payload: approvedPlanJSON,
		})
		if snapshotErr != nil {
			return snapshotErr
		}

		subTasks := make([]SubTask, 0, len(planNodes(normalizedPlan)))
		sessions := make([]Session, 0, len(planNodes(normalizedPlan)))
		seedTime := time.Now().UTC()
		for index, node := range planNodes(normalizedPlan) {
			dependencyBranchSuffixes := append([]string(nil), node.DependsOn...)
			role := stringPointer(node.Role)
			displayName := stringPointer(node.Title)
			executionOrder := int64(index + 1)
			assignmentSource := stringPointer(subTaskAssignmentSourceLead)
			status := subTaskStatusPending
			if len(dependencyBranchSuffixes) > 0 {
				status = subTaskStatusBlocked
			}

			createdAt := seedTime.Add(time.Duration(index) * time.Millisecond).Format(time.RFC3339Nano)
			subTask, createErr := repository.CreateSubTask(ctx, CreateSubTaskInput{
				TaskID:                   taskID,
				Title:                    node.Title,
				Description:              node.Description,
				BranchSuffix:             node.BranchSuffix,
				DependencyBranchSuffixes: dependencyBranchSuffixes,
				BranchName:               nil,
				StartCommitSHA:           nil,
				WorktreePath:             nil,
				AgentType:                node.RecommendedAgent,
				Status:                   status,
				AutoAssigned:             true,
				Role:                     role,
				DisplayName:              displayName,
				ExecutionOrder:           &executionOrder,
				AssignmentSource:         assignmentSource,
				CreatedAt:                createdAt,
				UpdatedAt:                createdAt,
			})
			if createErr != nil {
				return createErr
			}
			subTasks = append(subTasks, *subTask)

			if status != subTaskStatusPending {
				continue
			}

			sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
				TaskID:               taskID,
				SubTaskID:            &subTask.ID,
				AgentType:            subTask.AgentType,
				SessionType:          sessionTypeWorker,
				SandboxType:          sessionSandboxDocker,
				Status:               "PENDING",
				OutputBuffer:         "",
				OutputBufferMaxBytes: 65536,
			})
			if sessionErr != nil {
				return sessionErr
			}
			sessions = append(sessions, *sessionRecord)
		}

		executingStatus := "EXECUTING"
		executingTask, updateExecutingErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			CurrentPlanJSON:     &approvedPlanJSON,
			SetCurrentPlanJSON:  true,
			Status:              &executingStatus,
			ApprovedPlanJSON:    &approvedPlanJSON,
			SetApprovedPlanJSON: true,
			LastError:           nil,
			SetLastError:        true,
		})
		if updateExecutingErr != nil {
			return updateExecutingErr
		}

		result.ApprovedSnapshot = approvedSnapshot
		result.Idempotent = false
		result.Sessions = sessions
		result.SubTasks = subTasks
		result.Task = executingTask
		return nil
	})
	if txErr != nil {
		var opErr serviceFailure
		if errors.As(txErr, &opErr) {
			return nil, opErr.payload
		}
		return nil, failure("TASK_APPROVAL_FAILED", txErr.Error(), nil)
	}

	if !result.Idempotent {
		if result.Task != nil {
			s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
		}
		for _, subTask := range result.SubTasks {
			subTaskCopy := subTask
			s.publishSubTaskAssigned(taskID, &subTaskCopy)
			s.publishSubTaskStatus(taskID, &subTaskCopy)
		}
		for _, session := range result.Sessions {
			sessionCopy := session
			s.publishSession(taskID, "session:started", &sessionCopy)
		}
		s.publishTeamUpdated(taskID)
	}

	return result, nil
}

func (s *Service) RestorePlanSnapshot(ctx context.Context, taskID string, input RestorePlanSnapshotRequest) (*RestorePlanSnapshotResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan restore is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	snapshotID := normalizeRequiredString(input.SnapshotID)
	snapshot, err := s.repository.FindPlanSnapshotByID(ctx, snapshotID)
	if err != nil {
		return nil, failure("TASK_PLAN_SNAPSHOT_READ_FAILED", err.Error(), nil)
	}
	if snapshot == nil || snapshot.TaskID != taskID {
		return nil, failure(ErrorCodePlanSnapshotNotFound, "Plan snapshot not found.", map[string]any{"snapshotId": snapshotID, "taskId": taskID})
	}

	currentPlan := parsePlanJSON(snapshot.Payload)
	if currentPlan == nil {
		return nil, failure(ErrorCodeInvalidPlan, "Stored plan snapshot is not valid JSON.", map[string]any{"snapshotId": snapshotID})
	}

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		CurrentPlanJSON:    &snapshot.Payload,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_RESTORE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
		TaskID:  taskID,
		Version: nextTask.PlanVersion,
		Source:  planSnapshotSourceRestoredFromHistory,
		Payload: snapshot.Payload,
	}); err != nil {
		return nil, failure("PLAN_SNAPSHOT_CREATE_FAILED", err.Error(), nil)
	}

	s.publish(taskID, "task:plan-restored", map[string]any{
		"currentPlan": currentPlan,
		"snapshotId":  snapshotID,
		"taskId":      taskID,
	})

	return &RestorePlanSnapshotResult{
		CurrentPlan: *currentPlan,
		SnapshotID:  snapshotID,
		Task:        nextTask,
	}, nil
}

func (s *Service) StartClarification(ctx context.Context, taskID string, input StartClarificationRequest) (*StartClarificationResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "DRAFT" {
		return nil, failure(
			ErrorCodeTaskNotDraft,
			"Clarification can only start from DRAFT.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	content := normalizeRequiredString(input.Content)
	if content == "" {
		return nil, failure(ErrorCodeTaskMessageRequired, "Message content is required.", map[string]any{"taskId": taskID})
	}

	session, err := s.createSyntheticLeadSession(ctx, taskRecord)
	if err != nil {
		return nil, failure("TASK_SESSION_CREATE_FAILED", err.Error(), nil)
	}

	nextStatus := taskStatusClarifying
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		Status:       &nextStatus,
		LastError:    nil,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreateMessage(ctx, CreateMessageInput{
		TaskID:  taskID,
		Role:    messageRoleUser,
		Content: content,
	}); err != nil {
		return nil, failure("TASK_MESSAGE_CREATE_FAILED", err.Error(), nil)
	}

	s.publishTaskStatus(taskID, nextTask.Status, nil)
	s.publishSession(taskID, "session:started", session)

	return &StartClarificationResult{
		Session: session,
		Task:    nextTask,
	}, nil
}

func (s *Service) SendTaskMessage(ctx context.Context, taskID string, input SendTaskMessageRequest) (*SendTaskMessageResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if !isTaskMessageAllowed(taskRecord.Status) {
		return nil, failure(
			ErrorCodeTaskNotClarifying,
			"Messages can only be sent while the leader conversation is active.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	content := normalizeRequiredString(input.Content)
	if content == "" {
		return nil, failure(ErrorCodeTaskMessageRequired, "Message content is required.", map[string]any{"taskId": taskID})
	}

	if _, err := s.ensureSyntheticLeadSession(ctx, taskRecord); err != nil {
		return nil, failure("TASK_SESSION_CREATE_FAILED", err.Error(), nil)
	}

	nextTask := taskRecord
	if taskRecord.Status == "PLAN_REVIEW" {
		nextStatus := taskStatusPlanning
		nextTask, err = s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:       &nextStatus,
			LastError:    nil,
			SetLastError: true,
		})
		if err != nil {
			return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
		}
	}

	message, err := s.repository.CreateMessage(ctx, CreateMessageInput{
		TaskID:  taskID,
		Role:    messageRoleUser,
		Content: content,
	})
	if err != nil {
		return nil, failure("TASK_MESSAGE_CREATE_FAILED", err.Error(), nil)
	}

	if nextTask.Status != taskRecord.Status {
		s.publishTaskStatus(taskID, nextTask.Status, nil)
	}

	return &SendTaskMessageResult{
		Message: message,
		Task:    nextTask,
	}, nil
}

func (s *Service) ArchiveTask(ctx context.Context, taskID string, input ArchiveTaskRequest) (*ArchiveTaskResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	if input.DeleteBranches {
		if err := s.cancelLeadSessions(ctx, taskID); err != nil {
			return nil, failure("TASK_SESSION_UPDATE_FAILED", err.Error(), nil)
		}
	}

	branchCleanup, serviceError := s.cleanupTaskBranches(ctx, taskRecord, subTasks, input.DeleteBranches)
	if serviceError != nil {
		return nil, serviceError
	}

	archivedAt := time.Now().UTC().Format(time.RFC3339Nano)
	var nextStatus *string
	if isActiveTaskStatus(taskRecord.Status) && input.DeleteBranches {
		cancelledStatus := "CANCELLED"
		nextStatus = &cancelledStatus
	}

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		Status:        nextStatus,
		LastError:     nil,
		SetLastError:  true,
		ArchivedAt:    &archivedAt,
		SetArchivedAt: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	return &ArchiveTaskResult{
		BranchCleanup: branchCleanup,
		Task:          nextTask,
	}, nil
}

func (s *Service) UnarchiveTask(ctx context.Context, taskID string) (*UnarchiveTaskResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		ArchivedAt:    nil,
		SetArchivedAt: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	return &UnarchiveTaskResult{Task: nextTask}, nil
}

func (s *Service) PauseTask(ctx context.Context, taskID string) (*PauseTaskResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if !isTaskPauseAllowed(taskRecord.Status) {
		return nil, failure(
			ErrorCodeTaskPauseNotAllowed,
			"Task pause is only available while work is actively in progress.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}

	cancelledLeadSessions := make([]Session, 0, 1)
	cancelledAt := time.Now().UTC().Format(time.RFC3339Nano)
	for _, session := range sessions {
		if session.SessionType != sessionTypeLead || !isLiveSessionStatus(session.Status) {
			continue
		}
		cancelledSession := session
		cancelledSession.Status = sessionStatusCancelled
		cancelledSession.EndedAt = &cancelledAt
		cancelledLeadSessions = append(cancelledLeadSessions, cancelledSession)
	}

	if err := s.cancelLeadSessions(ctx, taskID); err != nil {
		return nil, failure("TASK_SESSION_UPDATE_FAILED", err.Error(), nil)
	}

	nextStatus := taskStatusActionRequired
	lastError := buildPausedTaskReason(taskRecord.Status)
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		Status:       &nextStatus,
		LastError:    &lastError,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreateMessage(ctx, CreateMessageInput{
		TaskID:  taskID,
		Role:    messageRoleSystem,
		Content: "Operator paused the task while it was in " + taskRecord.Status + ".",
	}); err != nil {
		return nil, failure("TASK_MESSAGE_CREATE_FAILED", err.Error(), nil)
	}

	for index := range cancelledLeadSessions {
		s.publishSession(taskID, "session:ended", &cancelledLeadSessions[index])
	}
	s.publishTaskStatus(taskID, nextTask.Status, &lastError)

	return &PauseTaskResult{Task: nextTask}, nil
}

func (s *Service) DeleteTask(ctx context.Context, taskID string, input DeleteTaskRequest) (*DeleteTaskResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if !isTaskDeleteAllowed(taskRecord) {
		return nil, failure(
			ErrorCodeTaskDeleteRequiresPause,
			"Pause the task before deleting it.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	if input.DeleteBranches {
		if err := s.cancelLeadSessions(ctx, taskID); err != nil {
			return nil, failure("TASK_SESSION_UPDATE_FAILED", err.Error(), nil)
		}
	}

	branchCleanup, serviceError := s.cleanupTaskBranches(ctx, taskRecord, subTasks, input.DeleteBranches)
	if serviceError != nil {
		return nil, serviceError
	}

	deletedTask, err := s.repository.DeleteTask(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_DELETE_FAILED", err.Error(), nil)
	}

	_ = os.RemoveAll(filepath.Join(s.uploadRootPath, taskID))

	return &DeleteTaskResult{
		BranchCleanup: branchCleanup,
		Task:          deletedTask,
	}, nil
}

func (s *Service) ResumeTask(ctx context.Context, taskID string) (*ResumeTaskResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != taskStatusActionRequired {
		return nil, failure(
			ErrorCodeTaskResumeNotAllowed,
			"Task resume is only available while action is required.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}
	if !isMergeResumeEligible(subTasks) {
		return nil, failure(
			ErrorCodeTaskResumeNotAllowed,
			"Task resume is only available for merge-time blockers after unresolved subtasks have been handled.",
			map[string]any{"taskId": taskID},
		)
	}

	nextStatus := taskStatusMerging
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		Status:       &nextStatus,
		LastError:    nil,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	s.publishTaskStatus(taskID, nextTask.Status, nil)

	return &ResumeTaskResult{Task: nextTask}, nil
}

func (s *Service) StopLeadSession(ctx context.Context, taskID string) (*StopLeadSessionResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}

	var activeLeadSession *Session
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType == sessionTypeLead && isLiveSessionStatus(session.Status) {
			activeLeadSession = &session
			break
		}
	}
	if activeLeadSession == nil {
		return nil, failure(ErrorCodeSessionNotRunning, "Lead session is not running.", map[string]any{"taskId": taskID})
	}

	if err := s.cancelLeadSessions(ctx, taskID); err != nil {
		return nil, failure("TASK_SESSION_UPDATE_FAILED", err.Error(), nil)
	}

	if activeLeadSession != nil {
		cancelledSession := *activeLeadSession
		now := time.Now().UTC().Format(time.RFC3339Nano)
		cancelledSession.Status = sessionStatusCancelled
		cancelledSession.EndedAt = &now
		s.publishSession(taskID, "session:ended", &cancelledSession)
	}

	return &StopLeadSessionResult{Task: taskRecord}, nil
}

func (s *Service) ConfirmRequirements(ctx context.Context, taskID string) (*ConfirmRequirementsResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status == taskStatusPlanning {
		return nil, failure(ErrorCodeRequirementsConfirmed, "Requirements are already confirmed for this task.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != taskStatusClarifying {
		return nil, failure(
			ErrorCodeTaskNotClarifying,
			"Requirements can only be confirmed from CLARIFYING.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	nextStatus := taskStatusPlanning
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		Status:       &nextStatus,
		LastError:    nil,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	message, err := s.repository.CreateMessage(ctx, CreateMessageInput{
		TaskID:  taskID,
		Role:    messageRoleSystem,
		Content: "User confirmed that requirements are clear.",
	})
	if err != nil {
		return nil, failure("TASK_MESSAGE_CREATE_FAILED", err.Error(), nil)
	}

	s.publishTaskStatus(taskID, nextTask.Status, nil)

	return &ConfirmRequirementsResult{
		Message: message,
		Task:    nextTask,
	}, nil
}

func (s *Service) RetrySubTask(ctx context.Context, subTaskID string, input RetrySubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return nil, failure(
			ErrorCodeSubTaskRetryNotAllowed,
			"Subtask retry is only available while the task is executing or action is required.",
			map[string]any{"status": taskRecord.Status, "subTaskId": subTaskID},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ErrorCode:         "SUBTASK_RETRY_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ReworkSubTask(ctx context.Context, subTaskID string, input ReworkSubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusExecuting {
		return nil, failure(
			ErrorCodeSubTaskReworkNotAllowed,
			"Early rework is only available while the task is executing.",
			map[string]any{"status": taskRecord.Status, "subTaskId": subTaskID},
		)
	}
	if !isEarlyReworkEligible(subTask) {
		return nil, failure(
			ErrorCodeSubTaskReworkNotAllowed,
			"This subtask does not have an actionable incremental review yet.",
			map[string]any{
				"latestReviewDecision": derefString(subTask.LatestReviewDecision),
				"status":               subTask.Status,
				"subTaskId":            subTaskID,
			},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		Description:       input.Description,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ErrorCode:         "SUBTASK_REWORK_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:rework", map[string]any{
		"description": result.SubTask.Description,
		"subtaskId":   subTaskID,
		"taskId":      taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) CancelSubTask(ctx context.Context, subTaskID string) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isSubTaskCancelEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskCancelNotAllowed,
			"Cancelling this member is not allowed from the current task or subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}

	var result SubTaskMutationResult
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		sessions, err := repository.ListSessionsBySubTaskID(ctx, subTaskID)
		if err != nil {
			return err
		}
		liveSession := latestLiveWorkerSession(sessions)
		if liveSession != nil {
			cancelledAt := time.Now().UTC().Format(time.RFC3339Nano)
			cancelledStatus := sessionStatusCancelled
			updatedSession, updateErr := repository.UpdateSession(ctx, liveSession.ID, UpdateSessionInput{
				Status:      &cancelledStatus,
				SetStatus:   true,
				EndedAt:     &cancelledAt,
				SetEndedAt:  true,
				ExitCode:    nil,
				SetExitCode: true,
			})
			if updateErr != nil {
				return updateErr
			}
			result.Session = updatedSession
		}

		nextStatus := "CANCELLED"
		runSummary := "Cancelled by the operator."
		assignmentSource := stringPointer("OPERATOR")
		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
			Status:              &nextStatus,
			LastError:           nil,
			SetLastError:        true,
			AssignmentSource:    assignmentSource,
			SetAssignmentSource: true,
			RunSummary:          &runSummary,
			SetRunSummary:       true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.SubTask = updatedSubTask

		nextTask, readErr := repository.FindTaskByID(ctx, taskRecord.ID)
		if readErr != nil {
			return readErr
		}
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("SUBTASK_CANCEL_FAILED", txErr.Error(), nil)
	}

	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:ended", result.Session)
	}
	s.publish(taskRecord.ID, "subtask:cancelled", map[string]any{
		"status":    result.SubTask.Status,
		"subtaskId": subTaskID,
		"taskId":    taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	scheduleResult, scheduleError := s.progressDependencySchedule(ctx, taskRecord.ID)
	if scheduleError != nil {
		return nil, scheduleError
	}
	if scheduleResult != nil {
		for _, releasedSubTask := range scheduleResult.ReleasedSubTasks {
			releasedSubTaskCopy := releasedSubTask
			s.publishSubTaskStatus(taskRecord.ID, &releasedSubTaskCopy)
		}
		for _, releasedSession := range scheduleResult.ReleasedSessions {
			releasedSessionCopy := releasedSession
			s.publishSession(taskRecord.ID, "session:started", &releasedSessionCopy)
		}
		if scheduleResult.Task != nil && result.Task != nil && scheduleResult.Task.Status != result.Task.Status {
			s.publishTaskStatus(scheduleResult.Task.ID, scheduleResult.Task.Status, scheduleResult.Task.LastError)
			result.Task = scheduleResult.Task
		}
	}
	s.publishTeamUpdated(taskRecord.ID)
	return &result, nil
}

func (s *Service) ReassignSubTask(ctx context.Context, subTaskID string, input ReassignSubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isSubTaskReassignEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskReassignNotAllowed,
			"Reassigning this member is not allowed from the current task or subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	siblingSubTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	nextStatus := subTaskStatusPending
	if !areSubTaskDependenciesSatisfied(subTask, siblingSubTasks) {
		nextStatus = subTaskStatusBlocked
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		AgentType:         input.AgentType,
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        nextStatus,
		ForceManualAssign: true,
		ClearAutoAssigned: true,
		CreateSession:     nextStatus != subTaskStatusBlocked,
		ErrorCode:         "SUBTASK_REASSIGN_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:assigned", map[string]any{
		"agentType":        result.SubTask.AgentType,
		"assignmentSource": result.SubTask.AssignmentSource,
		"displayName":      result.SubTask.DisplayName,
		"role":             result.SubTask.Role,
		"status":           result.SubTask.Status,
		"subtaskId":        subTaskID,
		"taskId":           taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ChangeSubTaskAgent(ctx context.Context, subTaskID string, input ChangeSubTaskAgentRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isAgentChangeEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskChangeAgentInvalid,
			"Changing the assigned worker is not allowed from the current subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	nextAgentType := normalizeRequiredString(input.AgentType)
	if nextAgentType == "" {
		return nil, failure("AGENT_TYPE_REQUIRED", "A replacement worker agent is required before relaunch.", map[string]any{"subTaskId": subTaskID})
	}
	if nextAgentType == subTask.AgentType {
		return nil, failure(
			ErrorCodeSubTaskChangeAgentInvalid,
			"Select a different worker agent before using Switch Agent & Relaunch.",
			map[string]any{"agentType": nextAgentType, "subTaskId": subTaskID},
		)
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		AgentType:         nextAgentType,
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ClearAutoAssigned: true,
		ErrorCode:         "SUBTASK_CHANGE_AGENT_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:agent-changed", map[string]any{
		"newAgentType": nextAgentType,
		"oldAgentType": subTask.AgentType,
		"subtaskId":    subTaskID,
		"taskId":       taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ConfirmDiscardSubTask(ctx context.Context, subTaskID string) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusActionRequired || subTask.Status != "DISCARD_PENDING" {
		return nil, failure(
			ErrorCodeSubTaskDiscardNotAllowed,
			"Discard confirmation is only available for DISCARD_PENDING subtasks while the task is ACTION_REQUIRED.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}

	var result SubTaskMutationResult
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextStatus := "DISCARDED"
		runSummary := "Discarded from the merge set."
		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
			Status:        &nextStatus,
			RunSummary:    &runSummary,
			SetRunSummary: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.SubTask = updatedSubTask

		subTasks, err := repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
		if err != nil {
			return err
		}
		for index := range subTasks {
			if subTasks[index].ID == updatedSubTask.ID {
				subTasks[index] = *updatedSubTask
				break
			}
		}

		nextTask := taskRecord
		if isMergeResumeEligible(subTasks) {
			mergingStatus := taskStatusMerging
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       &mergingStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		}
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("SUBTASK_CONFIRM_DISCARD_FAILED", txErr.Error(), nil)
	}

	s.publish(taskRecord.ID, "subtask:confirm-discard", map[string]any{
		"subtaskId": subTaskID,
		"taskId":    taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return &result, nil
}

func (s *Service) RebaseRetrySubTask(ctx context.Context, subTaskID string) (*RebaseRetrySubTaskResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}

	mergeRecords, err := s.repository.ListMergeRecordsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return nil, failure("TASK_MERGE_RECORDS_READ_FAILED", err.Error(), nil)
	}
	latestMergeRecord := latestMergeRecord(mergeRecords)
	if taskRecord.Status != taskStatusActionRequired || !isRebaseRetryEligibleSubTaskStatus(subTask.Status) || latestMergeRecord == nil || latestMergeRecord.Operation != "MERGE" || latestMergeRecord.Status != "CONFLICT" {
		return nil, failure(
			"SUBTASK_REBASE_RETRY_NOT_ALLOWED",
			"Rebase & Retry is only available for accepted or review-pending subtasks whose latest merge attempt conflicted.",
			map[string]any{
				"latestMergeRecord": latestMergeRecord,
				"status":            subTask.Status,
				"subTaskId":         subTaskID,
				"taskStatus":        taskRecord.Status,
			},
		)
	}

	mergingStatus := taskStatusMerging
	nextTask, err := s.repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
		Status:       &mergingStatus,
		LastError:    nil,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("SUBTASK_REBASE_RETRY_FAILED", err.Error(), nil)
	}

	s.publish(taskRecord.ID, "merge:status", map[string]any{
		"mergeStatus": "SUCCEEDED",
		"subtaskId":   subTaskID,
		"taskId":      taskRecord.ID,
	})
	s.publishTaskStatus(taskRecord.ID, nextTask.Status, nil)

	return &RebaseRetrySubTaskResult{
		MergeStatus: "SUCCEEDED",
		SubTask:     subTask,
		Task:        nextTask,
	}, nil
}

func (s *Service) StartIntegrationRun(ctx context.Context, taskID string) (*IntegrationMutationResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != taskStatusMerging && taskRecord.Status != taskStatusActionRequired {
		return nil, failure(
			"INTEGRATION_START_NOT_ALLOWED",
			"Integration runs can only start while merging or after an integration failure requires action.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	result, serviceError := s.createIntegrationRun(ctx, taskRecord, subTasks, true)
	if serviceError != nil {
		return nil, serviceError
	}

	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	if result.IntegrationRun != nil {
		s.publish(taskID, "integration:queued", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"status":            result.IntegrationRun.Status,
			"taskId":            taskID,
		})
	}
	return result, nil
}

func (s *Service) RetryIntegrationRun(ctx context.Context, integrationRunID string) (*IntegrationMutationResult, *Error) {
	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, integrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": integrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}
	if taskRecord.Status != taskStatusActionRequired || !isRetryableIntegrationStatus(integrationRun.Status) {
		return nil, failure(
			"INTEGRATION_RETRY_NOT_ALLOWED",
			"Integration retry is only available after an actionable integration failure or rollback.",
			map[string]any{"integrationRunId": integrationRunID, "integrationRunStatus": integrationRun.Status, "taskStatus": taskRecord.Status},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	result, serviceError := s.createIntegrationRun(ctx, taskRecord, subTasks, true)
	if serviceError != nil {
		return nil, serviceError
	}

	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	if result.IntegrationRun != nil {
		s.publish(taskRecord.ID, "integration:queued", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"status":            result.IntegrationRun.Status,
			"taskId":            taskRecord.ID,
		})
	}
	return result, nil
}

func (s *Service) RollbackIntegrationRun(ctx context.Context, integrationRunID string) (*IntegrationMutationResult, *Error) {
	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, integrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": integrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}
	if taskRecord.Status != taskStatusActionRequired || !isRollbackableIntegrationStatus(integrationRun.Status) {
		return nil, failure(
			"INTEGRATION_ROLLBACK_NOT_ALLOWED",
			"Integration rollback is only available after an actionable integration failure.",
			map[string]any{"integrationRunId": integrationRunID, "integrationRunStatus": integrationRun.Status, "taskStatus": taskRecord.Status},
		)
	}

	result := &IntegrationMutationResult{Task: taskRecord}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		endedAt := time.Now().UTC().Format(time.RFC3339Nano)
		rolledBackStatus := "ROLLED_BACK"
		updatedRun, updateErr := repository.UpdateIntegrationRun(ctx, integrationRunID, UpdateIntegrationRunInput{
			Status:     &rolledBackStatus,
			EndedAt:    &endedAt,
			SetEndedAt: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.IntegrationRun = updatedRun

		queueItems, err := repository.ListIntegrationQueueItemsByIntegrationRunID(ctx, integrationRunID)
		if err != nil {
			return err
		}
		for _, queueItem := range queueItems {
			nextStatus := queueItem.Status
			if queueItem.Status != "RELEASED" {
				nextStatus = "ROLLED_BACK"
			}
			if nextStatus == queueItem.Status {
				continue
			}
			if _, err := repository.UpdateIntegrationQueueItem(ctx, queueItem.ID, UpdateIntegrationQueueItemInput{
				Status: &nextStatus,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if txErr != nil {
		return nil, failure("INTEGRATION_ROLLBACK_FAILED", txErr.Error(), nil)
	}

	if result.IntegrationRun != nil {
		s.publish(taskRecord.ID, "integration:failed", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"reason":            "Integration run rolled back by operator.",
			"status":            result.IntegrationRun.Status,
			"taskId":            taskRecord.ID,
		})
	}
	return result, nil
}

func (s *Service) DequeueIntegrationQueueItem(ctx context.Context, integrationQueueItemID string) (*IntegrationMutationResult, *Error) {
	queueItem, err := s.repository.FindIntegrationQueueItemByID(ctx, integrationQueueItemID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_QUEUE_ITEM_READ_FAILED", err.Error(), nil)
	}
	if queueItem == nil {
		return nil, failure("INTEGRATION_QUEUE_ITEM_NOT_FOUND", "Integration queue item not found.", map[string]any{"integrationQueueItemId": integrationQueueItemID})
	}

	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, queueItem.IntegrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": queueItem.IntegrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}

	if taskRecord.Status != taskStatusActionRequired || integrationRun.Status != taskStatusActionRequired || queueItem.Status == "RELEASED" || queueItem.Status == "DEQUEUED" {
		return nil, failure(
			"INTEGRATION_DEQUEUE_NOT_ALLOWED",
			"Integration dequeue is only available for actionable queue items during an interrupted integration run.",
			map[string]any{"integrationQueueItemId": integrationQueueItemID, "integrationRunStatus": integrationRun.Status, "queueItemStatus": queueItem.Status, "taskStatus": taskRecord.Status},
		)
	}

	dequeuedStatus := "DEQUEUED"
	updatedQueueItem, err := s.repository.UpdateIntegrationQueueItem(ctx, integrationQueueItemID, UpdateIntegrationQueueItemInput{
		Status: &dequeuedStatus,
	})
	if err != nil {
		return nil, failure("INTEGRATION_DEQUEUE_FAILED", err.Error(), nil)
	}

	s.publish(taskRecord.ID, "integration:queued", map[string]any{
		"integrationQueueItemId": updatedQueueItem.ID,
		"integrationRunId":       integrationRun.ID,
		"status":                 updatedQueueItem.Status,
		"subtaskId":              updatedQueueItem.SubTaskID,
		"taskId":                 taskRecord.ID,
	})

	return &IntegrationMutationResult{
		IntegrationQueueItem: updatedQueueItem,
		Task:                 taskRecord,
	}, nil
}

func (s *Service) GetTaskTeam(ctx context.Context, taskID string) (*GetTaskTeamResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	return &GetTaskTeamResult{
		Team: s.buildTaskTeamView(taskRecord, sessions, subTasks),
	}, nil
}

func (s *Service) GetTaskBoard(ctx context.Context, taskID string) (*GetTaskBoardResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}
	mailboxMessages, err := s.repository.ListMailboxMessagesByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_MAILBOX_MESSAGES_READ_FAILED", err.Error(), nil)
	}
	integrationView, errPayload := s.buildTaskIntegrationView(ctx, taskRecord, subTasks)
	if errPayload != nil {
		return nil, errPayload
	}

	return &GetTaskBoardResult{
		Board: s.buildTaskBoardSnapshot(taskRecord, sessions, subTasks, mailboxMessages, integrationView),
	}, nil
}

func (s *Service) SendMailboxMessage(ctx context.Context, taskID string, input SendMailboxMessageRequest) (*SendMailboxMessageResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if !isMailboxAvailable(taskRecord.Status) {
		return nil, failure(
			"MAILBOX_NOT_AVAILABLE",
			"Mailbox notes are only available after plan approval while the task is still active.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	content := normalizeRequiredString(input.Content)
	if content == "" {
		return nil, failure("MAILBOX_MESSAGE_REQUIRED", "Mailbox message content is required.", map[string]any{"taskId": taskID})
	}

	messageType, ok := normalizeMailboxMessageType(input.MessageType)
	if !ok {
		return nil, failure("MAILBOX_MESSAGE_TYPE_INVALID", "Mailbox messageType is invalid.", map[string]any{"taskId": taskID})
	}

	senderSubTaskID := normalizeRequiredString(input.SenderSubTaskID)
	targetSubTaskID := normalizeRequiredString(input.TargetSubTaskID)
	targetType := normalizeMailboxTargetType(input.TargetType)
	if targetType == "" {
		if targetSubTaskID != "" {
			targetType = mailboxTargetSubTask
		} else if senderSubTaskID != "" {
			targetType = mailboxTargetLead
		}
	}
	if targetType == "" {
		return nil, failure("MAILBOX_TARGET_REQUIRED", "Mailbox messages must target either the lead or a subtask.", map[string]any{"taskId": taskID})
	}

	var targetSubTask *SubTask
	if targetType == mailboxTargetSubTask {
		if targetSubTaskID == "" {
			return nil, failure("MAILBOX_TARGET_REQUIRED", "Mailbox messages targeting a subtask must include targetSubTaskId.", map[string]any{"taskId": taskID})
		}
		targetSubTask, err = s.repository.FindSubTaskByID(ctx, targetSubTaskID)
		if err != nil {
			return nil, failure("TASK_SUBTASK_READ_FAILED", err.Error(), nil)
		}
		if targetSubTask == nil || targetSubTask.TaskID != taskID {
			return nil, failure("SUBTASK_NOT_FOUND", "Subtask not found.", map[string]any{"subTaskId": targetSubTaskID, "taskId": taskID})
		}
	}

	senderType := mailboxParticipantLead
	var senderSubTask *SubTask
	if senderSubTaskID != "" {
		senderSubTask, err = s.repository.FindSubTaskByID(ctx, senderSubTaskID)
		if err != nil {
			return nil, failure("TASK_SUBTASK_READ_FAILED", err.Error(), nil)
		}
		if senderSubTask == nil || senderSubTask.TaskID != taskID {
			return nil, failure("SUBTASK_NOT_FOUND", "Subtask not found.", map[string]any{"subTaskId": senderSubTaskID, "taskId": taskID})
		}
		senderType = mailboxParticipantSubTask
	}

	if senderType == mailboxParticipantLead && targetType == mailboxTargetLead {
		return nil, failure("MAILBOX_TARGET_REQUIRED", "Mailbox messages must target another participant.", map[string]any{"taskId": taskID})
	}
	if senderType == mailboxParticipantSubTask && targetType == mailboxTargetSubTask && senderSubTask != nil && targetSubTask != nil && senderSubTask.ID == targetSubTask.ID {
		return nil, failure("MAILBOX_TARGET_REQUIRED", "Subtasks cannot send mailbox messages to themselves.", map[string]any{"subTaskId": senderSubTask.ID, "taskId": taskID})
	}

	message, err := s.repository.CreateMailboxMessage(ctx, CreateMailboxMessageInput{
		TaskID:          taskID,
		SenderType:      senderType,
		SenderSubTaskID: stringPointerValue(senderSubTaskID),
		TargetType:      targetType,
		TargetSubTaskID: stringPointerValue(targetSubTaskID),
		MessageType:     messageType,
		ArtifactRefs:    normalizeStringList(input.ArtifactRefs),
		FileRefs:        normalizeStringList(input.FileRefs),
		BranchRef:       stringPointerValue(normalizeRequiredString(input.BranchRef)),
		SchemaJSON:      cloneJSONMap(input.SchemaJSON),
		RequiresAck:     input.RequiresAck,
		Content:         content,
	})
	if err != nil {
		return nil, failure("MAILBOX_MESSAGE_CREATE_FAILED", err.Error(), nil)
	}

	s.publish(taskID, "mailbox:message", map[string]any{
		"message": message,
		"taskId":  taskID,
	})
	s.publish(taskID, "board:activity", map[string]any{
		"createdAt": message.CreatedAt,
		"id":        "mailbox:" + message.ID,
		"kind":      "MAILBOX_MESSAGE",
		"subTaskId": nullableString(message.TargetSubTaskID, message.SenderSubTaskID),
		"summary":   firstNonEmpty(message.Content, message.MessageType),
		"taskId":    taskID,
	})
	s.publishTeamUpdated(taskID)

	return &SendMailboxMessageResult{Message: message}, nil
}

type relaunchSubTaskOptions struct {
	AgentType         string
	Description       string
	ResumeTaskStatus  bool
	NextStatus        string
	ForceManualAssign bool
	ClearAutoAssigned bool
	CreateSession     bool
	ErrorCode         string
}

func (s *Service) loadSubTaskContext(ctx context.Context, subTaskID string) (*SubTask, *Task, *Error) {
	subTask, err := s.repository.FindSubTaskByID(ctx, subTaskID)
	if err != nil {
		return nil, nil, failure("TASK_SUBTASK_READ_FAILED", err.Error(), nil)
	}
	if subTask == nil {
		return nil, nil, failure(ErrorCodeSubTaskNotFound, "Subtask not found.", map[string]any{"subTaskId": subTaskID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, subTask.TaskID)
	if err != nil {
		return nil, nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": subTask.TaskID})
	}

	return subTask, taskRecord, nil
}

func (s *Service) ensureNoLiveWorkerSession(ctx context.Context, subTaskID string) (bool, *Error) {
	sessions, err := s.repository.ListSessionsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return false, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	return latestLiveWorkerSession(sessions) != nil, nil
}

func (s *Service) relaunchSubTask(ctx context.Context, taskRecord *Task, subTask *SubTask, options relaunchSubTaskOptions) (*SubTaskMutationResult, *Error) {
	result := &SubTaskMutationResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextTask := taskRecord
		var err error
		if options.ResumeTaskStatus && taskRecord.Status == taskStatusActionRequired {
			executingStatus := taskStatusExecuting
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       &executingStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		}

		nextDescription := subTask.Description
		if normalized := normalizeRequiredString(options.Description); normalized != "" {
			nextDescription = normalized
		}
		nextAgentType := subTask.AgentType
		if normalized := normalizeRequiredString(options.AgentType); normalized != "" {
			nextAgentType = normalized
		}
		manualAssignment := options.ForceManualAssign || normalizeRequiredString(derefString(subTask.AssignmentSource)) == "OPERATOR"
		nextRetryCount := subTask.RetryCount + 1
		runSummary := buildDerivedRunSummary(SubTask{
			Status:                   options.NextStatus,
			DependencyBranchSuffixes: subTask.DependencyBranchSuffixes,
			WorktreePath:             subTask.WorktreePath,
		})

		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
			Description:         stringPointer(nextDescription),
			SetDescription:      true,
			AgentType:           stringPointer(nextAgentType),
			Status:              stringPointer(options.NextStatus),
			AutoAssigned:        boolPointer(nextAutoAssignedValue(subTask.AutoAssigned, options.ClearAutoAssigned)),
			RetryCount:          &nextRetryCount,
			LastError:           nil,
			SetLastError:        true,
			AssignmentSource:    assignmentSourcePointer(manualAssignment, subTask.AssignmentSource),
			SetAssignmentSource: manualAssignment || subTask.AssignmentSource != nil,
			RunSummary:          stringPointer(runSummary),
			SetRunSummary:       true,
		})
		if updateErr != nil {
			return updateErr
		}

		result.SubTask = updatedSubTask
		result.Task = nextTask

		createSession := options.CreateSession || options.NextStatus == subTaskStatusPending
		if !createSession {
			return nil
		}

		sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
			TaskID:               taskRecord.ID,
			SubTaskID:            &updatedSubTask.ID,
			AgentType:            updatedSubTask.AgentType,
			SessionType:          sessionTypeWorker,
			SandboxType:          sessionSandboxDocker,
			Status:               "PENDING",
			OutputBuffer:         "",
			OutputBufferMaxBytes: 65536,
		})
		if sessionErr != nil {
			return sessionErr
		}
		result.Session = sessionRecord
		return nil
	})
	if txErr != nil {
		return nil, failure(options.ErrorCode, txErr.Error(), nil)
	}
	return result, nil
}

func (s *Service) createIntegrationRun(ctx context.Context, taskRecord *Task, subTasks []SubTask, resumeFromActionRequired bool) (*IntegrationMutationResult, *Error) {
	result := &IntegrationMutationResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextTask := taskRecord
		var err error
		if resumeFromActionRequired && taskRecord.Status == taskStatusActionRequired {
			mergingStatus := taskStatusMerging
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       &mergingStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		}

		existingRuns, err := repository.ListIntegrationRunsByTaskID(ctx, taskRecord.ID)
		if err != nil {
			return err
		}
		integrationBranch := "eat/" + taskRecord.ID + "/integration-" + strconv.Itoa(len(existingRuns)+1)
		queuedStatus := "QUEUED"
		runRecord, err := repository.CreateIntegrationRun(ctx, CreateIntegrationRunInput{
			TaskID:            taskRecord.ID,
			IntegrationBranch: integrationBranch,
			Status:            queuedStatus,
		})
		if err != nil {
			return err
		}

		acceptedSubTasks := filterIntegrationEligibleSubTasks(subTasks)
		for index, subTask := range acceptedSubTasks {
			queueStatus := "QUEUED"
			queueOrder := int64(index + 1)
			if _, err := repository.CreateIntegrationQueueItem(ctx, CreateIntegrationQueueItemInput{
				IntegrationRunID: runRecord.ID,
				SubTaskID:        subTask.ID,
				QueueOrder:       queueOrder,
				Status:           queueStatus,
			}); err != nil {
				return err
			}
		}

		result.IntegrationRun = runRecord
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("INTEGRATION_RUN_CREATE_FAILED", txErr.Error(), nil)
	}
	return result, nil
}

func (s *Service) progressDependencySchedule(ctx context.Context, taskID string) (*dependencyScheduleResult, *Error) {
	result := &dependencyScheduleResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		taskRecord, err := repository.FindTaskByID(ctx, taskID)
		if err != nil {
			return err
		}
		if taskRecord == nil {
			return serviceFailure{payload: failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})}
		}
		result.Task = taskRecord

		if taskRecord.Status != taskStatusExecuting && taskRecord.Status != taskStatusActionRequired {
			return nil
		}

		subTasks, err := repository.ListSubTasksByTaskID(ctx, taskID)
		if err != nil {
			return err
		}

		attentionBlockedSubTasks := make([]SubTask, 0)
		for _, subTask := range subTasks {
			if subTask.Status != subTaskStatusBlocked {
				continue
			}

			if areSubTaskDependenciesSatisfied(&subTask, subTasks) {
				nextStatus := subTaskStatusPending
				runSummary := buildDerivedRunSummary(SubTask{
					Status:                   nextStatus,
					DependencyBranchSuffixes: subTask.DependencyBranchSuffixes,
					WorktreePath:             subTask.WorktreePath,
				})
				updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
					Status:        &nextStatus,
					LastError:     nil,
					SetLastError:  true,
					RunSummary:    &runSummary,
					SetRunSummary: true,
				})
				if updateErr != nil {
					return updateErr
				}
				result.ReleasedSubTasks = append(result.ReleasedSubTasks, *updatedSubTask)

				if taskRecord.Status == taskStatusExecuting {
					sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
						TaskID:               taskID,
						SubTaskID:            &updatedSubTask.ID,
						AgentType:            updatedSubTask.AgentType,
						SessionType:          sessionTypeWorker,
						SandboxType:          sessionSandboxDocker,
						Status:               "PENDING",
						OutputBuffer:         "",
						OutputBufferMaxBytes: 65536,
					})
					if sessionErr != nil {
						return sessionErr
					}
					result.ReleasedSessions = append(result.ReleasedSessions, *sessionRecord)
				}
				continue
			}

			if isBlockedDependencyAttentionRequired(&subTask, subTasks) {
				attentionBlockedSubTasks = append(attentionBlockedSubTasks, subTask)
			}
		}

		if len(attentionBlockedSubTasks) == 0 {
			return nil
		}

		lastError := buildBlockedDependencyReason(attentionBlockedSubTasks, subTasks)
		if taskRecord.Status == taskStatusActionRequired && derefString(taskRecord.LastError) == lastError {
			return nil
		}

		nextStatus := taskStatusActionRequired
		updatedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:       &nextStatus,
			LastError:    &lastError,
			SetLastError: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.Task = updatedTask
		return nil
	})
	if txErr != nil {
		var opErr serviceFailure
		if errors.As(txErr, &opErr) {
			return nil, opErr.payload
		}
		return nil, failure("DEPENDENCY_SCHEDULE_FAILED", txErr.Error(), map[string]any{"taskId": taskID})
	}
	return result, nil
}

func (s *Service) buildTaskIntegrationView(ctx context.Context, taskRecord *Task, subTasks []SubTask) (map[string]any, *Error) {
	integrationRuns, err := s.repository.ListIntegrationRunsByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUNS_READ_FAILED", err.Error(), nil)
	}

	subTaskByID := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByID[subTask.ID] = subTask
	}

	runs := make([]map[string]any, 0, len(integrationRuns))
	for _, integrationRun := range integrationRuns {
		queueItems, err := s.repository.ListIntegrationQueueItemsByIntegrationRunID(ctx, integrationRun.ID)
		if err != nil {
			return nil, failure("TASK_INTEGRATION_QUEUE_ITEMS_READ_FAILED", err.Error(), nil)
		}
		gateResults, err := s.repository.ListGateResultsByIntegrationRunID(ctx, integrationRun.ID)
		if err != nil {
			return nil, failure("TASK_GATE_RESULTS_READ_FAILED", err.Error(), nil)
		}

		queueItemViews := make([]map[string]any, 0, len(queueItems))
		for _, queueItem := range queueItems {
			queueItemViews = append(queueItemViews, map[string]any{
				"id":               queueItem.ID,
				"integrationRunId": queueItem.IntegrationRunID,
				"subTaskId":        queueItem.SubTaskID,
				"queueOrder":       queueItem.QueueOrder,
				"status":           queueItem.Status,
				"mergedCommitSha":  queueItem.MergedCommitSHA,
				"createdAt":        queueItem.CreatedAt,
				"updatedAt":        queueItem.UpdatedAt,
				"subTask":          subTaskOrNil(subTaskByID, queueItem.SubTaskID),
			})
		}

		gateResultViews := make([]map[string]any, 0, len(gateResults))
		for _, gateResult := range gateResults {
			gateResultViews = append(gateResultViews, map[string]any{
				"id":               gateResult.ID,
				"integrationRunId": gateResult.IntegrationRunID,
				"gateType":         gateResult.GateType,
				"status":           gateResult.Status,
				"summary":          gateResult.Summary,
				"detailsJson":      gateResult.DetailsJSON,
				"createdAt":        gateResult.CreatedAt,
			})
		}

		runs = append(runs, map[string]any{
			"id":                integrationRun.ID,
			"taskId":            integrationRun.TaskID,
			"integrationBranch": integrationRun.IntegrationBranch,
			"status":            integrationRun.Status,
			"startedAt":         integrationRun.StartedAt,
			"endedAt":           integrationRun.EndedAt,
			"createdAt":         integrationRun.CreatedAt,
			"updatedAt":         integrationRun.UpdatedAt,
			"queueItems":        queueItemViews,
			"gateResults":       gateResultViews,
		})
	}

	var latestRun any
	if len(runs) > 0 {
		latestRun = runs[len(runs)-1]
	}

	return map[string]any{
		"latestRun": latestRun,
		"runs":      runs,
		"task": map[string]any{
			"id":             taskRecord.ID,
			"status":         taskRecord.Status,
			"taskBranchName": taskRecord.TaskBranchName,
			"title":          taskRecord.Title,
		},
	}, nil
}

func (s *Service) buildTaskTeamView(taskRecord *Task, sessions []Session, subTasks []SubTask) map[string]any {
	latestLeadSession := latestSessionByType(sessions, sessionTypeLead, "")
	members := make([]map[string]any, 0, len(subTasks))
	sortedSubTasks := sortSubTasksForDisplay(subTasks)
	for index, subTask := range sortedSubTasks {
		latestWorkerSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		executionOrder := index + 1
		if subTask.ExecutionOrder != nil && *subTask.ExecutionOrder > 0 {
			executionOrder = int(*subTask.ExecutionOrder)
		}
		members = append(members, map[string]any{
			"agentType":        subTask.AgentType,
			"assignmentSource": firstNonEmpty(derefString(subTask.AssignmentSource), assignmentSourceForSubTask(subTask)),
			"autoAssigned":     subTask.AutoAssigned,
			"branchName":       subTask.BranchName,
			"branchSuffix":     subTask.BranchSuffix,
			"displayName":      firstNonEmpty(derefString(subTask.DisplayName), subTask.Title),
			"executionOrder":   executionOrder,
			"latestSessionId":  pointerStringValue(latestWorkerSession, func(value *Session) *string { return &value.ID }),
			"latestSessionStatus": pointerStringValue(latestWorkerSession, func(value *Session) *string {
				return stringPointerValue(value.Status)
			}),
			"role":         firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"runSummary":   firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"status":       subTask.Status,
			"subtaskId":    subTask.ID,
			"taskId":       taskRecord.ID,
			"title":        subTask.Title,
			"worktreePath": subTask.WorktreePath,
		})
	}

	leadStatus := deriveLeadLifecycleStatus(taskRecord.Status)
	leadSessionID := any(nil)
	if latestLeadSession != nil {
		leadStatus = latestLeadSession.Status
		leadSessionID = latestLeadSession.ID
	}

	return map[string]any{
		"lead": map[string]any{
			"agentType": taskRecord.LeadAgentType,
			"lastError": taskRecord.LastError,
			"sessionId": leadSessionID,
			"status":    leadStatus,
		},
		"members": members,
		"task": map[string]any{
			"id":             taskRecord.ID,
			"status":         taskRecord.Status,
			"taskBranchName": taskRecord.TaskBranchName,
			"title":          taskRecord.Title,
		},
	}
}

func (s *Service) buildTaskBoardSnapshot(taskRecord *Task, sessions []Session, subTasks []SubTask, mailboxMessages []MailboxMessage, integrationView map[string]any) map[string]any {
	sortedSubTasks := sortSubTasksForDisplay(subTasks)
	actionRequiredItems := buildBoardActionRequiredItems(mailboxMessages)
	activity := buildBoardActivityEntries(sessions, mailboxMessages, sortedSubTasks)
	graphNodes := buildBoardGraphNodes(sessions, sortedSubTasks, mailboxMessages, actionRequiredItems)
	graphEdges := buildBoardGraphEdges(sortedSubTasks, mailboxMessages)

	return map[string]any{
		"activity":            activity,
		"actionRequiredItems": actionRequiredItems,
		"graph": map[string]any{
			"nodes": graphNodes,
			"edges": graphEdges,
		},
		"integration": integrationView,
		"list": map[string]any{
			"members": buildBoardListMembers(sessions, sortedSubTasks),
		},
		"riskSummary": map[string]any{
			"failedLaunches":      0,
			"integrationFailures": 0,
			"mailboxBlockers":     countMailboxMessagesByType(mailboxMessages, mailboxMessageTypeBlocker),
			"mergeConflicts":      0,
			"requiresAck":         countMailboxAcks(mailboxMessages),
			"reviewRequired":      countSubTasksByStatuses(sortedSubTasks, "REWORK_REQUIRED", "DISCARD_PENDING"),
		},
		"summary": map[string]any{
			"accepted":       countSubTasksByStatuses(sortedSubTasks, "ACCEPTED"),
			"actionRequired": len(actionRequiredItems),
			"blocked":        countSubTasksByStatuses(sortedSubTasks, "BLOCKED"),
			"failed":         countSubTasksByStatuses(sortedSubTasks, "FAILED"),
			"merged":         countSubTasksByStatuses(sortedSubTasks, "MERGED"),
			"pending":        countSubTasksByStatuses(sortedSubTasks, "PENDING", "READY"),
			"reviewPending":  countSubTasksByStatuses(sortedSubTasks, "REVIEW_PENDING"),
			"running":        countSubTasksByStatuses(sortedSubTasks, "RUNNING"),
		},
		"workflow": buildBoardWorkflowSummary(sortedSubTasks, actionRequiredItems),
		"task": map[string]any{
			"id":        taskRecord.ID,
			"lastError": taskRecord.LastError,
			"status":    taskRecord.Status,
			"title":     taskRecord.Title,
		},
	}
}

type normalizedAttachment struct {
	IDPrefix string
	FileName string
	FileType string
	MimeType string
	Size     int64
	Buffer   []byte
}

func (s *Service) persistAttachments(ctx context.Context, taskRecord *Task, attachmentsInput []normalizedAttachment) ([]Attachment, *Error) {
	if len(attachmentsInput) == 0 {
		return []Attachment{}, nil
	}

	targetDirectoryPath := filepath.Join(s.uploadRootPath, taskRecord.ID)
	if err := os.MkdirAll(targetDirectoryPath, 0o755); err != nil {
		return nil, failure("ATTACHMENT_DIRECTORY_CREATE_FAILED", err.Error(), nil)
	}

	attachments := make([]Attachment, 0, len(attachmentsInput))
	for _, attachmentInput := range attachmentsInput {
		targetFilePath := filepath.Join(
			targetDirectoryPath,
			attachmentInput.IDPrefix+"-"+sanitizeFileName(attachmentInput.FileName),
		)
		if err := os.WriteFile(targetFilePath, attachmentInput.Buffer, 0o644); err != nil {
			return nil, failure("ATTACHMENT_WRITE_FAILED", err.Error(), nil)
		}

		attachmentRecord, err := s.repository.CreateAttachment(ctx, CreateAttachmentInput{
			ID:       attachmentInput.IDPrefix,
			TaskID:   taskRecord.ID,
			FileName: attachmentInput.FileName,
			FilePath: targetFilePath,
			FileType: attachmentInput.FileType,
			MimeType: attachmentInput.MimeType,
			Size:     attachmentInput.Size,
		})
		if err != nil {
			return nil, failure("ATTACHMENT_CREATE_FAILED", err.Error(), nil)
		}
		attachments = append(attachments, *attachmentRecord)
	}

	return attachments, nil
}

func normalizeAttachmentInput(input AttachmentCreateInput) (normalizedAttachment, *Error) {
	fileName := normalizeRequiredString(input.FileName)
	if fileName == "" {
		return normalizedAttachment{}, failure(ErrorCodeAttachmentNameRequired, "Attachment fileName is required.", nil)
	}

	declaredMimeType := normalizeRequiredString(input.MimeType)
	if declaredMimeType == "" {
		declaredMimeType = "application/octet-stream"
	}
	declaredType := normalizeRequiredString(input.FileType)
	if declaredType == "" {
		declaredType = inferAttachmentType(fileName, declaredMimeType)
	}
	if declaredType == "" || !isSupportedAttachmentType(declaredType) {
		return normalizedAttachment{}, failure(ErrorCodeAttachmentTypeUnsupported, "Attachment type is not supported.", map[string]any{"fileName": fileName})
	}

	inferredType := inferAttachmentType(fileName, declaredMimeType)
	if inferredType != declaredType {
		return normalizedAttachment{}, failure(ErrorCodeAttachmentMimeMismatch, "Attachment type does not match the supplied file name or MIME type.", map[string]any{
			"fileName": fileName,
			"fileType": declaredType,
			"mimeType": declaredMimeType,
		})
	}

	buffer, size, serviceError := readAttachmentBytes(input, fileName)
	if serviceError != nil {
		return normalizedAttachment{}, serviceError
	}
	if size > maxAttachmentBytes {
		return normalizedAttachment{}, failure(ErrorCodeAttachmentSizeExceeded, "Attachment exceeds the current size limit.", map[string]any{
			"fileName": fileName,
			"maxBytes": maxAttachmentBytes,
			"size":     size,
		})
	}

	return normalizedAttachment{
		IDPrefix: "att_" + uuid.NewString(),
		FileName: fileName,
		FileType: inferredType,
		MimeType: declaredMimeType,
		Size:     size,
		Buffer:   buffer,
	}, nil
}

func readAttachmentBytes(input AttachmentCreateInput, fileName string) ([]byte, int64, *Error) {
	if strings.TrimSpace(input.ContentBase64) != "" {
		buffer, err := base64.StdEncoding.DecodeString(input.ContentBase64)
		if err != nil {
			return nil, 0, failure(ErrorCodeInvalidAttachmentPayload, "Attachment contentBase64 payload is not valid base64.", map[string]any{"fileName": fileName})
		}
		return buffer, int64(len(buffer)), nil
	}

	filePath := normalizeRequiredString(input.FilePath)
	if filePath == "" {
		return nil, 0, failure(ErrorCodeAttachmentContentRequired, "Attachment contentBase64 or filePath is required.", map[string]any{"fileName": fileName})
	}

	stats, err := os.Stat(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, failure(ErrorCodeAttachmentPathNotFound, "Attachment filePath does not exist.", map[string]any{"fileName": fileName, "filePath": filePath})
		}
		return nil, 0, failure("ATTACHMENT_READ_FAILED", err.Error(), nil)
	}

	buffer, err := os.ReadFile(filePath)
	if err != nil {
		return nil, 0, failure("ATTACHMENT_READ_FAILED", err.Error(), nil)
	}
	return buffer, stats.Size(), nil
}

func normalizeRequiredString(value string) string {
	return strings.TrimSpace(value)
}

func buildTaskMainlineBranchName(title string) string {
	normalizedTitle := strings.TrimSpace(title)
	replacer := strings.NewReplacer(
		"~", " ",
		"^", " ",
		":", " ",
		"?", " ",
		"*", " ",
		"[", " ",
		"]", " ",
		"\\", " ",
	)
	sanitized := replacer.Replace(normalizedTitle)
	sanitized = strings.ReplaceAll(sanitized, "@{", "-")
	sanitized = strings.Join(strings.Fields(sanitized), "-")
	sanitized = strings.Trim(sanitized, "-")
	if sanitized == "" {
		sanitized = "task"
	}
	branchName := "eat-" + sanitized
	if len(branchName) > 96 {
		branchName = branchName[:96]
	}
	return branchName
}

func sanitizeFileName(fileName string) string {
	builder := strings.Builder{}
	for _, r := range fileName {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '.' || r == '_' || r == '-':
			builder.WriteRune(r)
		default:
			builder.WriteByte('_')
		}
	}
	return builder.String()
}

func isSupportedAttachmentType(value string) bool {
	return value == "IMAGE" || value == "DOCUMENT" || value == "CODE"
}

func inferAttachmentType(fileName, mimeType string) string {
	extension := strings.ToLower(filepath.Ext(fileName))
	normalizedMimeType := strings.ToLower(mimeType)

	imageExtensions := map[string]bool{".gif": true, ".jpeg": true, ".jpg": true, ".png": true, ".svg": true, ".webp": true}
	documentExtensions := map[string]bool{".md": true, ".pdf": true, ".txt": true}
	codeExtensions := map[string]bool{
		".c": true, ".cc": true, ".cpp": true, ".cs": true, ".css": true, ".go": true, ".h": true, ".html": true,
		".java": true, ".js": true, ".json": true, ".jsx": true, ".mjs": true, ".py": true, ".rb": true, ".rs": true,
		".sh": true, ".sql": true, ".ts": true, ".tsx": true, ".vue": true, ".xml": true, ".yaml": true, ".yml": true,
	}

	if imageExtensions[extension] || strings.HasPrefix(normalizedMimeType, "image/") {
		return "IMAGE"
	}
	if documentExtensions[extension] || normalizedMimeType == "application/pdf" || normalizedMimeType == "text/markdown" || normalizedMimeType == "text/plain" {
		return "DOCUMENT"
	}
	if codeExtensions[extension] || strings.HasPrefix(normalizedMimeType, "text/") || strings.Contains(normalizedMimeType, "json") || strings.Contains(normalizedMimeType, "javascript") || strings.Contains(normalizedMimeType, "xml") {
		return "CODE"
	}
	return ""
}

func latestSessionByType(sessions []Session, sessionType, subTaskID string) *Session {
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType != sessionType {
			continue
		}
		if subTaskID != "" && derefString(session.SubTaskID) != subTaskID {
			continue
		}
		return &session
	}
	return nil
}

func sortSubTasksForDisplay(subTasks []SubTask) []SubTask {
	sorted := append([]SubTask(nil), subTasks...)
	sort.SliceStable(sorted, func(i, j int) bool {
		leftOrder := int64(1 << 30)
		rightOrder := int64(1 << 30)
		if sorted[i].ExecutionOrder != nil {
			leftOrder = *sorted[i].ExecutionOrder
		}
		if sorted[j].ExecutionOrder != nil {
			rightOrder = *sorted[j].ExecutionOrder
		}
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return sorted[i].CreatedAt < sorted[j].CreatedAt
	})
	return sorted
}

func assignmentSourceForSubTask(subTask SubTask) string {
	if subTask.AutoAssigned {
		return subTaskAssignmentSourceLead
	}
	return "OPERATOR"
}

func buildDerivedRunSummary(subTask SubTask) string {
	switch subTask.Status {
	case "BLOCKED":
		if len(subTask.DependencyBranchSuffixes) > 0 {
			return "Waiting on " + strings.Join(subTask.DependencyBranchSuffixes, ", ") + " before this member can run."
		}
		return "Waiting on upstream dependencies before this member can run."
	case "PENDING":
		return "Queued for team execution."
	case "READY":
		return "Workspace is ready. Waiting for worker launch."
	case "RUNNING":
		if subTask.WorktreePath != nil && *subTask.WorktreePath != "" {
			return "Running in " + *subTask.WorktreePath + "."
		}
		return "Worker session is running."
	case "REVIEW_PENDING":
		return "Worker run finished. Waiting for review outcome."
	case "ACCEPTED":
		return "Accepted for integration."
	case "REWORK_REQUIRED":
		return firstNonEmpty(derefString(subTask.LatestReviewSummary), "Needs another worker pass before integration.")
	case "DISCARD_PENDING":
		return firstNonEmpty(derefString(subTask.LatestReviewSummary), "Marked for discard. Waiting for operator confirmation.")
	case "MERGED":
		return "Merged into the task base branch."
	case "FAILED":
		return firstNonEmpty(derefString(subTask.LastError), "Worker execution failed.")
	case "CANCELLED":
		return "Cancelled by the operator."
	case "DISCARDED":
		return "Discarded from the merge set."
	default:
		return "Waiting for team lifecycle events."
	}
}

func deriveLeadLifecycleStatus(taskStatus string) string {
	switch taskStatus {
	case taskStatusClarifying, taskStatusPlanning, taskStatusReviewing:
		return sessionStatusRunning
	case taskStatusExecuting, taskStatusMerging, taskStatusActionRequired, "COMPLETED":
		return "COMPLETED"
	case "FAILED", "CANCELLED":
		return "FAILED"
	default:
		return "PENDING"
	}
}

func buildBoardActionRequiredItems(mailboxMessages []MailboxMessage) []map[string]any {
	items := make([]map[string]any, 0)
	for _, message := range mailboxMessages {
		if message.MessageType != mailboxMessageTypeBlocker && message.MessageType != mailboxMessageTypeReviewRequest && message.MessageType != mailboxMessageTypeTestRequest {
			continue
		}
		items = append(items, map[string]any{
			"createdAt": message.CreatedAt,
			"kind":      message.MessageType,
			"owner":     "LEADER",
			"primaryAction": func() string {
				if message.TargetType == mailboxTargetLead {
					return "OPEN_MAILBOX"
				}
				return "SEND_NOTE"
			}(),
			"severity": func() int {
				if message.MessageType == mailboxMessageTypeBlocker {
					return 18
				}
				return 25
			}(),
			"subTaskId":  nullableString(message.TargetSubTaskID, message.SenderSubTaskID),
			"summary":    trimStringTo(message.Content, 280),
			"targetType": message.TargetType,
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		return stringValue(items[i]["createdAt"]) > stringValue(items[j]["createdAt"])
	})
	for index := range items {
		items[index]["id"] = items[index]["kind"].(string) + ":" + firstNonEmpty(stringValue(items[index]["subTaskId"]), "task") + ":" + stringValue(index)
	}
	return items
}

func buildBoardActivityEntries(sessions []Session, mailboxMessages []MailboxMessage, subTasks []SubTask) []map[string]any {
	subTaskByID := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByID[subTask.ID] = subTask
	}

	entries := make([]map[string]any, 0, len(sessions)+len(mailboxMessages))
	for _, session := range sessions {
		if session.StartedAt != nil {
			summary := "Lead session started."
			if session.SubTaskID != nil {
				title := subTaskByID[derefString(session.SubTaskID)].Title
				if title == "" {
					title = derefString(session.SubTaskID)
				}
				summary = title + " session started."
			}
			entries = append(entries, map[string]any{
				"createdAt": session.StartedAt,
				"id":        "session-start:" + session.ID,
				"kind":      "SESSION_STARTED",
				"subTaskId": session.SubTaskID,
				"summary":   summary,
			})
		}
		if session.EndedAt != nil {
			summary := "Lead session ended with " + session.Status + "."
			if session.SubTaskID != nil {
				title := subTaskByID[derefString(session.SubTaskID)].Title
				if title == "" {
					title = derefString(session.SubTaskID)
				}
				summary = title + " session ended with " + session.Status + "."
			}
			entries = append(entries, map[string]any{
				"createdAt": session.EndedAt,
				"id":        "session-end:" + session.ID,
				"kind":      "SESSION_ENDED",
				"subTaskId": session.SubTaskID,
				"summary":   summary,
			})
		}
	}
	for _, message := range mailboxMessages {
		senderLabel := strings.ToLower(message.SenderType)
		if message.SenderSubTaskID != nil {
			if subTask, ok := subTaskByID[*message.SenderSubTaskID]; ok && subTask.Title != "" {
				senderLabel = subTask.Title
			}
		}
		targetLabel := strings.ToLower(message.TargetType)
		if message.TargetSubTaskID != nil {
			if subTask, ok := subTaskByID[*message.TargetSubTaskID]; ok && subTask.Title != "" {
				targetLabel = subTask.Title
			}
		}
		entries = append(entries, map[string]any{
			"createdAt": message.CreatedAt,
			"id":        "mailbox:" + message.ID,
			"kind":      "MAILBOX_MESSAGE",
			"subTaskId": nullableString(message.TargetSubTaskID, message.SenderSubTaskID),
			"summary":   senderLabel + " sent " + message.MessageType + " to " + targetLabel + ".",
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		return stringValue(entries[i]["createdAt"]) > stringValue(entries[j]["createdAt"])
	})
	if len(entries) > 50 {
		return entries[:50]
	}
	return entries
}

func buildBoardGraphNodes(sessions []Session, subTasks []SubTask, mailboxMessages []MailboxMessage, actionRequiredItems []map[string]any) []map[string]any {
	nodes := make([]map[string]any, 0, len(subTasks))
	for _, subTask := range subTasks {
		inboxCount := 0
		outboxCount := 0
		blockerCount := 0
		for _, message := range mailboxMessages {
			if derefString(message.TargetSubTaskID) == subTask.ID {
				inboxCount++
				if message.MessageType == mailboxMessageTypeBlocker {
					blockerCount++
				}
			}
			if derefString(message.SenderSubTaskID) == subTask.ID {
				outboxCount++
			}
		}
		latestSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		requiresAction := false
		for _, item := range actionRequiredItems {
			if stringValue(item["subTaskId"]) == subTask.ID {
				requiresAction = true
				break
			}
		}
		nodes = append(nodes, map[string]any{
			"subtaskId":                 subTask.ID,
			"title":                     subTask.Title,
			"role":                      firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"status":                    subTask.Status,
			"agentType":                 subTask.AgentType,
			"branchName":                subTask.BranchName,
			"executionOrder":            subTask.ExecutionOrder,
			"mailboxInboxCount":         inboxCount,
			"mailboxOutboxCount":        outboxCount,
			"latestActivitySummary":     firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"latestMergeStatus":         nil,
			"latestSessionStatus":       pointerStringValue(latestSession, func(value *Session) *string { return stringPointerValue(value.Status) }),
			"requiresAction":            requiresAction,
			"unresolvedMailboxBlockers": blockerCount,
		})
	}
	return nodes
}

func buildBoardGraphEdges(subTasks []SubTask, mailboxMessages []MailboxMessage) []map[string]any {
	subTaskByBranchSuffix := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByBranchSuffix[subTask.BranchSuffix] = subTask
	}
	edges := make([]map[string]any, 0)
	for _, subTask := range subTasks {
		for _, branchSuffix := range subTask.DependencyBranchSuffixes {
			upstreamSubTask, ok := subTaskByBranchSuffix[branchSuffix]
			dependencySatisfied := ok && isDependencySatisfiedStatus(upstreamSubTask.Status)
			handoffCount := 0
			unresolvedBlockerCount := 0
			for _, message := range mailboxMessages {
				if derefString(message.SenderSubTaskID) == upstreamSubTask.ID && derefString(message.TargetSubTaskID) == subTask.ID {
					handoffCount++
				}
				if derefString(message.TargetSubTaskID) == subTask.ID && (message.MessageType == mailboxMessageTypeBlocker || message.MessageType == mailboxMessageTypeReviewRequest || message.MessageType == mailboxMessageTypeTestRequest) {
					unresolvedBlockerCount++
				}
			}
			state := "SATISFIED"
			if !dependencySatisfied {
				state = "BLOCKING"
			} else if unresolvedBlockerCount > 0 {
				state = "ATTENTION"
			} else if handoffCount > 0 {
				state = "HANDOFF_READY"
			}
			edges = append(edges, map[string]any{
				"from":                   firstNonEmpty(upstreamSubTask.ID, branchSuffix),
				"fromBranchSuffix":       branchSuffix,
				"handoffCount":           handoffCount,
				"isBlocking":             !dependencySatisfied || unresolvedBlockerCount > 0,
				"state":                  state,
				"to":                     subTask.ID,
				"unresolvedBlockerCount": unresolvedBlockerCount,
			})
		}
	}
	return edges
}

func buildBoardListMembers(sessions []Session, subTasks []SubTask) []map[string]any {
	items := make([]map[string]any, 0, len(subTasks))
	for _, subTask := range subTasks {
		latestSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		items = append(items, map[string]any{
			"agentType":                subTask.AgentType,
			"branchName":               subTask.BranchName,
			"dependencyBranchSuffixes": subTask.DependencyBranchSuffixes,
			"latestSessionStatus":      pointerStringValue(latestSession, func(value *Session) *string { return stringPointerValue(value.Status) }),
			"role":                     firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"runSummary":               firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"status":                   subTask.Status,
			"subtaskId":                subTask.ID,
			"title":                    subTask.Title,
		})
	}
	return items
}

func buildBoardWorkflowSummary(subTasks []SubTask, actionRequiredItems []map[string]any) map[string]any {
	completed := 0
	waiting := 0
	for _, subTask := range subTasks {
		if subTask.Status == "ACCEPTED" || subTask.Status == "CANCELLED" || subTask.Status == "DISCARDED" || subTask.Status == "MERGED" {
			completed++
		}
		if subTask.Status == "BLOCKED" || subTask.Status == "PENDING" || subTask.Status == "READY" || subTask.Status == "REVIEW_PENDING" {
			waiting++
		}
	}
	manualAttentionCount := 0
	systemAttentionCount := 0
	for _, item := range actionRequiredItems {
		if stringValue(item["owner"]) == "USER" {
			manualAttentionCount++
		} else {
			systemAttentionCount++
		}
	}
	return map[string]any{
		"completed":            completed,
		"manualAttentionCount": manualAttentionCount,
		"systemAttentionCount": systemAttentionCount,
		"total":                len(subTasks),
		"waiting":              waiting,
	}
}

func countSubTasksByStatuses(subTasks []SubTask, statuses ...string) int {
	allowed := make(map[string]bool, len(statuses))
	for _, status := range statuses {
		allowed[status] = true
	}
	count := 0
	for _, subTask := range subTasks {
		if allowed[subTask.Status] {
			count++
		}
	}
	return count
}

func countMailboxMessagesByType(messages []MailboxMessage, messageType string) int {
	count := 0
	for _, message := range messages {
		if message.MessageType == messageType {
			count++
		}
	}
	return count
}

func countMailboxAcks(messages []MailboxMessage) int {
	count := 0
	for _, message := range messages {
		if message.RequiresAck {
			count++
		}
	}
	return count
}

func normalizeMailboxTargetType(value string) string {
	switch normalizeRequiredString(value) {
	case mailboxTargetLead, mailboxTargetSubTask:
		return normalizeRequiredString(value)
	default:
		return ""
	}
}

func normalizeMailboxMessageType(value string) (string, bool) {
	normalized := normalizeRequiredString(value)
	if normalized == "" {
		return mailboxMessageTypeNote, true
	}
	switch normalized {
	case mailboxMessageTypeNote, mailboxMessageTypeBlocker, mailboxMessageTypeDeliverableReady, mailboxMessageTypeTestRequest, mailboxMessageTypeReviewRequest, mailboxMessageTypeAPIContract, mailboxMessageTypeDBContract:
		return normalized, true
	default:
		return "", false
	}
}

func isMailboxAvailable(status string) bool {
	return status == taskStatusActionRequired || status == taskStatusExecuting || status == taskStatusMerging || status == taskStatusReviewing
}

func normalizeStringList(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		result = append(result, trimmed)
	}
	return result
}

func cloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	cloned := make(map[string]any, len(value))
	for key, item := range value {
		cloned[key] = item
	}
	return cloned
}

func stringPointerValue(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func nullableString(values ...*string) any {
	for _, value := range values {
		if value != nil && *value != "" {
			return *value
		}
	}
	return nil
}

func trimStringTo(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case *string:
		return derefString(typed)
	case int:
		return strconv.Itoa(typed)
	default:
		return ""
	}
}

func isDependencySatisfiedStatus(status string) bool {
	return status == "ACCEPTED" || status == "MERGED" || status == "REVIEW_PENDING"
}

func pointerStringValue(session *Session, selector func(*Session) *string) any {
	if session == nil {
		return nil
	}
	value := selector(session)
	if value == nil {
		return nil
	}
	return *value
}

func failure(code, message string, details map[string]any) *Error {
	return &Error{Code: code, Message: message, Details: details}
}

func validatePlan(plan tasktemplates.Plan) *Error {
	plan = normalizePlan(plan)
	if len(planNodes(plan)) == 0 {
		return failure(ErrorCodeInvalidPlan, "Plan must include at least one node.", nil)
	}

	validAgents := knownExecutableAgents()
	knownNodes := make(map[string]bool, len(planNodes(plan)))
	for index, node := range planNodes(plan) {
		if strings.TrimSpace(node.Title) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a title.", map[string]any{"index": index})
		}
		if strings.TrimSpace(node.BranchSuffix) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a branch suffix.", map[string]any{"index": index})
		}
		if knownNodes[node.BranchSuffix] {
			return failure(ErrorCodeInvalidPlan, "Plan branch_suffix values must be unique.", map[string]any{"branchSuffix": node.BranchSuffix})
		}
		if strings.TrimSpace(node.RecommendedAgent) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a recommended_agent.", map[string]any{"branchSuffix": node.BranchSuffix})
		}
		if !validAgents[node.RecommendedAgent] {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must target a known executable agent.", map[string]any{
				"branchSuffix":     node.BranchSuffix,
				"recommendedAgent": node.RecommendedAgent,
			})
		}
		knownNodes[node.BranchSuffix] = true
	}

	for _, node := range planNodes(plan) {
		for _, dependency := range node.DependsOn {
			if !knownNodes[dependency] {
				return failure(ErrorCodeInvalidPlan, "Plan node depends_on references an unknown branch_suffix.", map[string]any{
					"branchSuffix": node.BranchSuffix,
					"dependsOn":    dependency,
				})
			}
		}
	}

	return nil
}

func (s *Service) normalizeAndValidatePlan(plan tasktemplates.Plan) (tasktemplates.Plan, *Error) {
	normalizedPlan := normalizePlan(plan)
	if validationError := validatePlan(normalizedPlan); validationError != nil {
		return tasktemplates.Plan{}, validationError
	}
	return normalizedPlan, nil
}

func (s *Service) resolveDefaultTemplateAgentType(taskRecord *Task, requestedAgentType string) string {
	explicitAgentType := normalizeRequiredString(requestedAgentType)
	if explicitAgentType != "" {
		return explicitAgentType
	}
	if taskRecord != nil && normalizeRequiredString(taskRecord.LeadAgentType) != "" {
		return taskRecord.LeadAgentType
	}

	for _, descriptor := range s.agentService.ListAgents() {
		if descriptor.Capabilities.CanExecute {
			return descriptor.Name
		}
	}

	return "codex-cli"
}

func normalizePlan(plan tasktemplates.Plan) tasktemplates.Plan {
	normalized := plan
	if len(normalized.Nodes) == 0 && len(normalized.Subtasks) > 0 {
		normalized.Nodes = append([]tasktemplates.Node(nil), normalized.Subtasks...)
	}
	if len(normalized.Subtasks) == 0 && len(normalized.Nodes) > 0 {
		normalized.Subtasks = append([]tasktemplates.Node(nil), normalized.Nodes...)
	}
	if len(normalized.Nodes) > 0 && len(normalized.Subtasks) > 0 {
		normalized.Nodes = append([]tasktemplates.Node(nil), normalized.Nodes...)
		normalized.Subtasks = append([]tasktemplates.Node(nil), normalized.Subtasks...)
	}
	return normalized
}

func planNodes(plan tasktemplates.Plan) []tasktemplates.Node {
	if len(plan.Nodes) > 0 {
		return plan.Nodes
	}
	return plan.Subtasks
}

func parsePlanJSON(raw string) *tasktemplates.Plan {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	var plan tasktemplates.Plan
	if err := json.Unmarshal([]byte(raw), &plan); err != nil {
		return nil
	}
	normalized := normalizePlan(plan)
	return &normalized
}

func knownExecutableAgents() map[string]bool {
	return map[string]bool{
		"claude-cli": true,
		"codex-cli":  true,
		"gemini-cli": true,
	}
}

func stringPointer(value string) *string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type serviceFailure struct {
	payload *Error
}

func (f serviceFailure) Error() string {
	if f.payload == nil {
		return "service failure"
	}
	return f.payload.Code + ": " + f.payload.Message
}

func (s *Service) createSyntheticLeadSession(ctx context.Context, taskRecord *Task) (*Session, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return s.repository.CreateSession(ctx, CreateSessionInput{
		TaskID:      taskRecord.ID,
		AgentType:   taskRecord.LeadAgentType,
		SessionType: sessionTypeLead,
		SandboxType: resolveLeadSandboxType(s.agentService, taskRecord.LeadAgentType),
		Status:      sessionStatusRunning,
		StartedAt:   &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
}

func (s *Service) ensureSyntheticLeadSession(ctx context.Context, taskRecord *Task) (*Session, error) {
	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, err
	}
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType == sessionTypeLead && isLiveSessionStatus(session.Status) {
			return &session, nil
		}
	}
	return s.createSyntheticLeadSession(ctx, taskRecord)
}

func (s *Service) cancelLeadSessions(ctx context.Context, taskID string) error {
	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return err
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	cancelledStatus := sessionStatusCancelled
	for _, session := range sessions {
		if session.SessionType != sessionTypeLead || !isLiveSessionStatus(session.Status) {
			continue
		}
		if _, err := s.repository.UpdateSession(ctx, session.ID, UpdateSessionInput{
			Status:     &cancelledStatus,
			SetStatus:  true,
			EndedAt:    &now,
			SetEndedAt: true,
			UpdatedAt:  &now,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) cleanupTaskBranches(ctx context.Context, taskRecord *Task, subTasks []SubTask, enabled bool) (TaskCleanupResult, *Error) {
	if !enabled {
		return TaskCleanupResult{
			CleanedBranches:  []string{},
			CleanedWorktrees: []string{},
		}, nil
	}

	projectRecord, err := s.projectRepository.FindProjectByID(ctx, taskRecord.ProjectID)
	if err != nil {
		return TaskCleanupResult{}, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return TaskCleanupResult{}, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": taskRecord.ProjectID})
	}

	cleanedBranches := make([]string, 0)
	cleanedWorktrees := make([]string, 0)
	failures := make([]map[string]any, 0)

	for _, subTask := range subTasks {
		worktreePath := normalizeRequiredString(derefString(subTask.WorktreePath))
		if worktreePath == "" {
			continue
		}
		if _, err := git.Run(ctx, projectRecord.Path, "worktree", "remove", "--force", worktreePath); err != nil {
			failures = append(failures, map[string]any{
				"type":   "WORKTREE",
				"target": worktreePath,
				"reason": err.Error(),
			})
			continue
		}
		cleanedWorktrees = append(cleanedWorktrees, worktreePath)
	}

	protectedBranchNames := map[string]bool{
		normalizeRequiredString(taskRecord.BaseBranch): true,
	}
	branchCandidates := make([]string, 0, len(subTasks)+1)
	branchCandidates = append(branchCandidates, normalizeRequiredString(derefString(taskRecord.TaskBranchName)))
	for _, subTask := range subTasks {
		branchCandidates = append(branchCandidates, normalizeRequiredString(derefString(subTask.BranchName)))
	}
	for _, branchName := range uniqueStrings(branchCandidates) {
		if branchName == "" || protectedBranchNames[branchName] {
			continue
		}
		if _, err := git.Run(ctx, projectRecord.Path, "branch", "-D", branchName); err != nil {
			failures = append(failures, map[string]any{
				"type":   "BRANCH",
				"target": branchName,
				"reason": err.Error(),
			})
			continue
		}
		cleanedBranches = append(cleanedBranches, branchName)
	}

	if len(failures) > 0 {
		return TaskCleanupResult{}, failure(
			ErrorCodeTaskBranchCleanupFailed,
			"Task branch cleanup failed.",
			map[string]any{
				"cleanedBranches":  cleanedBranches,
				"cleanedWorktrees": cleanedWorktrees,
				"failures":         failures,
				"taskId":           taskRecord.ID,
			},
		)
	}

	return TaskCleanupResult{
		CleanedBranches:  cleanedBranches,
		CleanedWorktrees: cleanedWorktrees,
	}, nil
}

func resolveLeadSandboxType(agentService *agent.Service, agentType string) string {
	if agentService != nil {
		for _, descriptor := range agentService.ListAgents() {
			if descriptor.Name != agentType {
				continue
			}
			for _, sandboxType := range descriptor.Capabilities.SupportedSandboxTypes {
				if sandboxType == sessionSandboxHost {
					return sandboxType
				}
			}
			if len(descriptor.Capabilities.SupportedSandboxTypes) > 0 {
				return descriptor.Capabilities.SupportedSandboxTypes[0]
			}
		}
	}
	return sessionSandboxHost
}

func isTaskMessageAllowed(status string) bool {
	switch status {
	case taskStatusActionRequired, taskStatusClarifying, taskStatusExecuting, taskStatusMerging, taskStatusPlanning, "PLAN_REVIEW", taskStatusReviewing:
		return true
	default:
		return false
	}
}

func isActiveTaskStatus(status string) bool {
	switch status {
	case taskStatusActionRequired, taskStatusClarifying, "DRAFT", taskStatusExecuting, taskStatusMerging, taskStatusPlanning, "PLAN_REVIEW", taskStatusReviewing:
		return true
	default:
		return false
	}
}

func buildPausedTaskReason(status string) string {
	return taskPausedReasonPrefix + status + "."
}

func isPausedTask(taskRecord *Task) bool {
	return taskRecord != nil && taskRecord.Status == taskStatusActionRequired && strings.HasPrefix(derefString(taskRecord.LastError), taskPausedReasonPrefix)
}

func isTaskPauseAllowed(status string) bool {
	switch status {
	case taskStatusClarifying, taskStatusExecuting, taskStatusMerging, taskStatusPlanning, "PLAN_REVIEW", taskStatusReviewing:
		return true
	default:
		return false
	}
}

func isTaskDeleteAllowed(taskRecord *Task) bool {
	if taskRecord == nil {
		return false
	}
	switch taskRecord.Status {
	case "CANCELLED", "COMPLETED", "DRAFT", "FAILED":
		return true
	default:
		return isPausedTask(taskRecord)
	}
}

func isMergeResumeEligible(subTasks []SubTask) bool {
	if len(subTasks) == 0 {
		return false
	}
	for _, subTask := range subTasks {
		switch subTask.Status {
		case "ACCEPTED", "CANCELLED", "DISCARDED", "MERGED":
		default:
			return false
		}
	}
	return true
}

func isLiveSessionStatus(status string) bool {
	switch status {
	case "PENDING", sessionStatusRunning, "STARTING", "STOPPING":
		return true
	default:
		return false
	}
}

func latestLiveWorkerSession(sessions []Session) *Session {
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType != sessionTypeWorker || !isLiveSessionStatus(session.Status) {
			continue
		}
		return &session
	}
	return nil
}

func latestMergeRecord(records []MergeRecord) *MergeRecord {
	if len(records) == 0 {
		return nil
	}
	record := records[len(records)-1]
	return &record
}

func isEarlyReworkEligible(subTask *SubTask) bool {
	if subTask == nil {
		return false
	}
	return subTask.Status == "REVIEW_PENDING" && (derefString(subTask.LatestReviewDecision) == "REJECTED" || derefString(subTask.LatestReviewDecision) == "REWORK")
}

func isSubTaskReassignEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case subTaskStatusBlocked, "CANCELLED", "FAILED", subTaskStatusPending, "READY", "REVIEW_PENDING", "REWORK_REQUIRED":
		return true
	default:
		return false
	}
}

func isSubTaskCancelEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case subTaskStatusBlocked, "FAILED", subTaskStatusPending, "READY", "REVIEW_PENDING", "REWORK_REQUIRED", "RUNNING":
		return true
	default:
		return false
	}
}

func isAgentChangeEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case "CANCELLED", "FAILED", "REVIEW_PENDING", "REWORK_REQUIRED":
		return true
	default:
		return false
	}
}

func isRebaseRetryEligibleSubTaskStatus(status string) bool {
	return status == "ACCEPTED" || status == "REVIEW_PENDING"
}

func areSubTaskDependenciesSatisfied(subTask *SubTask, siblingSubTasks []SubTask) bool {
	if subTask == nil || len(subTask.DependencyBranchSuffixes) == 0 {
		return true
	}
	statusByBranchSuffix := make(map[string]string, len(siblingSubTasks))
	for _, sibling := range siblingSubTasks {
		statusByBranchSuffix[sibling.BranchSuffix] = sibling.Status
	}
	for _, dependency := range subTask.DependencyBranchSuffixes {
		if !isDependencySatisfiedStatus(statusByBranchSuffix[dependency]) {
			return false
		}
	}
	return true
}

func isBlockedDependencyAttentionRequired(subTask *SubTask, siblingSubTasks []SubTask) bool {
	if subTask == nil || len(subTask.DependencyBranchSuffixes) == 0 {
		return false
	}

	statusByBranchSuffix := make(map[string]string, len(siblingSubTasks))
	for _, sibling := range siblingSubTasks {
		statusByBranchSuffix[sibling.BranchSuffix] = sibling.Status
	}

	for _, dependency := range subTask.DependencyBranchSuffixes {
		switch statusByBranchSuffix[dependency] {
		case "CANCELLED", "DISCARDED", "DISCARD_PENDING", "FAILED", "REWORK_REQUIRED", "":
			return true
		}
	}

	return false
}

func buildBlockedDependencyReason(blockedSubTasks []SubTask, allSubTasks []SubTask) string {
	subTaskByBranchSuffix := make(map[string]SubTask, len(allSubTasks))
	for _, subTask := range allSubTasks {
		subTaskByBranchSuffix[subTask.BranchSuffix] = subTask
	}

	summaries := make([]string, 0, len(blockedSubTasks))
	for _, subTask := range blockedSubTasks {
		blockers := make([]string, 0, len(subTask.DependencyBranchSuffixes))
		for _, branchSuffix := range subTask.DependencyBranchSuffixes {
			dependencySubTask, ok := subTaskByBranchSuffix[branchSuffix]
			if !ok {
				blockers = append(blockers, branchSuffix+" (missing)")
				continue
			}
			blockers = append(blockers, branchSuffix+" ("+dependencySubTask.Status+")")
		}
		summaries = append(summaries, subTask.Title+" is blocked by "+strings.Join(blockers, ", ")+".")
	}

	return strings.Join(summaries, " ")
}

func filterIntegrationEligibleSubTasks(subTasks []SubTask) []SubTask {
	eligible := make([]SubTask, 0)
	for _, subTask := range sortSubTasksForDisplay(subTasks) {
		if subTask.Status == "ACCEPTED" {
			eligible = append(eligible, subTask)
		}
	}
	return eligible
}

func subTaskOrNil(subTaskByID map[string]SubTask, subTaskID string) any {
	subTask, ok := subTaskByID[subTaskID]
	if !ok {
		return nil
	}
	return map[string]any{
		"id":               subTask.ID,
		"taskId":           subTask.TaskID,
		"title":            subTask.Title,
		"description":      subTask.Description,
		"branchSuffix":     subTask.BranchSuffix,
		"branchName":       subTask.BranchName,
		"agentType":        subTask.AgentType,
		"status":           subTask.Status,
		"assignmentSource": subTask.AssignmentSource,
	}
}

func isRetryableIntegrationStatus(status string) bool {
	return status == taskStatusActionRequired || status == "FAILED" || status == "ROLLED_BACK"
}

func isRollbackableIntegrationStatus(status string) bool {
	return status == taskStatusActionRequired || status == "FAILED"
}

func boolPointer(value bool) *bool {
	return &value
}

func nextAutoAssignedValue(current bool, clear bool) bool {
	if clear {
		return false
	}
	return current
}

func assignmentSourcePointer(isManual bool, fallback *string) *string {
	if isManual {
		return stringPointer("OPERATOR")
	}
	if fallback != nil {
		return fallback
	}
	return stringPointer(subTaskAssignmentSourceLead)
}

func (s *Service) publish(taskID, eventName string, data any) {
	if s.bus == nil || strings.TrimSpace(taskID) == "" || strings.TrimSpace(eventName) == "" {
		return
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return
	}

	s.bus.Publish("task:"+taskID, eventbus.Event{
		Name: eventName,
		Data: payload,
	})
}

func (s *Service) publishTaskStatus(taskID, status string, reason *string) {
	s.publish(taskID, "task:status", map[string]any{
		"taskId": taskID,
		"status": status,
		"reason": reason,
	})
}

func (s *Service) publishSession(taskID, eventName string, session *Session) {
	if session == nil {
		return
	}
	s.publish(taskID, eventName, map[string]any{
		"agentType":            session.AgentType,
		"attachments":          nil,
		"containerId":          session.ContainerID,
		"createdAt":            session.CreatedAt,
		"endedAt":              session.EndedAt,
		"exitCode":             session.ExitCode,
		"firstOutputAt":        session.FirstOutputAt,
		"id":                   session.ID,
		"logPath":              session.LogPath,
		"outputBuffer":         session.OutputBuffer,
		"outputBufferMaxBytes": session.OutputBufferMaxBytes,
		"pid":                  session.PID,
		"sandboxType":          session.SandboxType,
		"sessionId":            session.ID,
		"sessionType":          session.SessionType,
		"startedAt":            session.StartedAt,
		"status":               session.Status,
		"subTaskId":            session.SubTaskID,
		"subtaskId":            session.SubTaskID,
		"taskId":               session.TaskID,
		"updatedAt":            session.UpdatedAt,
	})
}

func (s *Service) publishSubTaskAssigned(taskID string, subTask *SubTask) {
	if subTask == nil {
		return
	}
	s.publish(taskID, "subtask:assigned", map[string]any{
		"agentType":        subTask.AgentType,
		"assignmentSource": subTask.AssignmentSource,
		"displayName":      subTask.DisplayName,
		"role":             subTask.Role,
		"status":           subTask.Status,
		"subtaskId":        subTask.ID,
		"taskId":           taskID,
	})
}

func (s *Service) publishSubTaskStatus(taskID string, subTask *SubTask) {
	if subTask == nil {
		return
	}
	s.publish(taskID, "subtask:status", map[string]any{
		"id":               subTask.ID,
		"taskId":           subTask.TaskID,
		"subtaskId":        subTask.ID,
		"title":            subTask.Title,
		"description":      subTask.Description,
		"branchSuffix":     subTask.BranchSuffix,
		"branchName":       subTask.BranchName,
		"agentType":        subTask.AgentType,
		"status":           subTask.Status,
		"autoAssigned":     subTask.AutoAssigned,
		"retryCount":       subTask.RetryCount,
		"lastError":        subTask.LastError,
		"role":             subTask.Role,
		"displayName":      subTask.DisplayName,
		"executionOrder":   subTask.ExecutionOrder,
		"assignmentSource": subTask.AssignmentSource,
		"runSummary":       subTask.RunSummary,
		"attachments":      nil,
	})
}

func (s *Service) publishTeamUpdated(taskID string) {
	s.publish(taskID, "team:updated", map[string]any{
		"taskId": taskID,
	})
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

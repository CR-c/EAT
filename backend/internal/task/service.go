package task

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"eat/backend/internal/agent"
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
	ErrorCodeTaskNotFound              = "TASK_NOT_FOUND"
	ErrorCodeTaskNotPlanReview         = "TASK_NOT_PLAN_REVIEW"
	ErrorCodeTitleRequired             = "TITLE_REQUIRED"
)

const maxAttachmentBytes = 10 * 1024 * 1024
const planSnapshotSourceLeadGenerated = "LEAD_GENERATED"
const planSnapshotSourceApproved = "APPROVED"
const planSnapshotSourceRestoredFromHistory = "RESTORED_FROM_HISTORY"
const subTaskAssignmentSourceLead = "LEAD"
const subTaskStatusBlocked = "BLOCKED"
const subTaskStatusPending = "PENDING"

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Detail struct {
	Task            *Task          `json:"task"`
	Messages        []Message      `json:"messages"`
	Attachments     []Attachment   `json:"attachments"`
	PlanSnapshots   []PlanSnapshot `json:"planSnapshots"`
	Sessions        []Session      `json:"sessions"`
	SubTasks        []SubTask      `json:"subTasks"`
	CleanupWarnings []string       `json:"cleanupWarnings"`
	MailboxMessages []any          `json:"mailboxMessages"`
	Board           map[string]any `json:"board"`
	Integration     map[string]any `json:"integration"`
	Team            map[string]any `json:"team"`
}

type Service struct {
	repository        *Repository
	projectRepository *project.Repository
	agentService      *agent.Service
	uploadRootPath    string
}

type Dependencies struct {
	Repository        *Repository
	ProjectRepository *project.Repository
	AgentService      *agent.Service
	UploadRootPath    string
}

func NewService(deps Dependencies) *Service {
	return &Service{
		repository:        deps.Repository,
		projectRepository: deps.ProjectRepository,
		agentService:      deps.AgentService,
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

	return &Detail{
		Task:            taskRecord,
		Messages:        messages,
		Attachments:     attachments,
		PlanSnapshots:   planSnapshots,
		Sessions:        sessions,
		SubTasks:        subTasks,
		CleanupWarnings: []string{},
		MailboxMessages: []any{},
		Board:           map[string]any{},
		Integration:     map[string]any{},
		Team:            map[string]any{},
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

	return &RestorePlanSnapshotResult{
		CurrentPlan: *currentPlan,
		SnapshotID:  snapshotID,
		Task:        nextTask,
	}, nil
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

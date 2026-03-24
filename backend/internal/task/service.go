package task

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"eat/backend/internal/agent"
	"eat/backend/internal/git"
	"eat/backend/internal/project"
	"eat/backend/internal/tasktemplates"
	"github.com/google/uuid"
)

const (
	ErrorCodeInvalidPlan               = "INVALID_PLAN"
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
	if len(plan.Nodes) == 0 {
		return failure(ErrorCodeInvalidPlan, "Plan must include at least one node.", nil)
	}

	knownNodes := make(map[string]bool, len(plan.Nodes))
	for index, node := range plan.Nodes {
		if strings.TrimSpace(node.Title) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a title.", map[string]any{"index": index})
		}
		if strings.TrimSpace(node.BranchSuffix) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a branch suffix.", map[string]any{"index": index})
		}
		if knownNodes[node.BranchSuffix] {
			return failure(ErrorCodeInvalidPlan, "Plan branch_suffix values must be unique.", map[string]any{"branchSuffix": node.BranchSuffix})
		}
		knownNodes[node.BranchSuffix] = true
	}

	for _, node := range plan.Nodes {
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

package task

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"eat/backend/internal/agent"
	"eat/backend/internal/git"
	"github.com/google/uuid"
)

func (s *Service) CreateTask(ctx context.Context, input CreateTaskRequest) (*CreateTaskResult, *Error) {
	projectID := normalizeRequiredString(input.ProjectID)
	title := normalizeRequiredString(input.Title)
	description := normalizeRequiredString(input.Description)
	baseBranch := normalizeRequiredString(input.BaseBranch)
	taskBranchNameInput := normalizeRequiredString(input.TaskBranchName)
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
	if taskBranchNameInput != "" {
		if err := git.ValidateBranchName(ctx, projectRecord.Path, taskBranchNameInput); err != nil {
			return nil, failure(ErrorCodeTaskBranchInvalid, "Task branch name is not a valid local git branch.", map[string]any{
				"taskBranchName": taskBranchNameInput,
				"reason":         err.Error(),
			})
		}
		desiredTaskBranchName = taskBranchNameInput
	}
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
		Task:        decorateTask(taskRecord),
		Attachments: attachments,
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

	leadReply, _, serviceError := s.runClarificationLeadTurn(ctx, taskRecord, content)
	if serviceError != nil {
		return nil, serviceError
	}

	nextStatus := taskStatusClarifying
	nextTask, session, sessionCreated, _, agentMessage, serviceError := s.persistClarificationTurn(
		ctx,
		taskRecord,
		content,
		leadReply.Response,
		leadReply.RawOutput,
		&nextStatus,
	)
	if serviceError != nil {
		return nil, serviceError
	}

	s.publishTaskStatus(taskID, nextTask.Status, nil)
	if sessionCreated {
		s.publishSession(taskID, "session:started", session)
	}
	s.publishSessionOutput(taskID, session, leadReply.Response)
	if agentMessage != nil {
		s.publishLeadMessage(taskID, agentMessage)
	}

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

	if taskRecord.Status == taskStatusClarifying {
		leadReply, _, serviceError := s.runClarificationLeadTurn(ctx, taskRecord, content)
		if serviceError != nil {
			return nil, serviceError
		}

		nextTask, session, sessionCreated, userMessage, agentMessage, serviceError := s.persistClarificationTurn(
			ctx,
			taskRecord,
			content,
			leadReply.Response,
			leadReply.RawOutput,
			nil,
		)
		if serviceError != nil {
			return nil, serviceError
		}

		if sessionCreated {
			s.publishSession(taskID, "session:started", session)
		}
		s.publishSessionOutput(taskID, session, leadReply.Response)
		if agentMessage != nil {
			s.publishLeadMessage(taskID, agentMessage)
		}

		return &SendTaskMessageResult{
			Message: userMessage,
			Task:    nextTask,
		}, nil
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

	seededPlan, serviceError := s.buildSeededPlanForTask(taskRecord)
	if serviceError != nil {
		return nil, serviceError
	}

	nextTask, _, serviceError := s.persistGeneratedPlan(ctx, taskID, *seededPlan)
	if serviceError != nil {
		return nil, serviceError
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

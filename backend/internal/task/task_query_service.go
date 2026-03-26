package task

import (
	"context"

	"eat/backend/internal/git"
)

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
	taskRecord = decorateTask(taskRecord)
	team := s.buildTaskTeamView(taskRecord, sessions, subTasks)
	board := s.buildTaskBoardSnapshot(taskRecord, sessions, subTasks, mailboxMessages, integrationView)
	runtime := s.buildTaskRuntimeView(taskRecord, sessions, subTasks)

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
		Runtime:         runtime,
		Team:            team,
	}, nil
}

func (s *Service) GetTaskRuntime(ctx context.Context, taskID string) (map[string]any, *Error) {
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

	return s.buildTaskRuntimeView(decorateTask(taskRecord), sessions, subTasks), nil
}

func (s *Service) GetTaskDiff(ctx context.Context, taskID string) (*DiffResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	projectRecord, err := s.projectRepository.FindProjectByID(ctx, taskRecord.ProjectID)
	if err != nil {
		return nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": taskRecord.ProjectID})
	}

	headRef := normalizeRequiredString(derefString(taskRecord.TaskBranchName))
	baseRef := normalizeRequiredString(taskRecord.BaseBranch)
	if baseRef == "" {
		baseRef = normalizeRequiredString(taskRecord.BaseCommitSHA)
	}
	result := &DiffResult{
		Task:      decorateTask(taskRecord),
		BaseRef:   baseRef,
		HeadRef:   headRef,
		Available: false,
		Summary: map[string]any{
			"additions":    0,
			"deletions":    0,
			"filesChanged": 0,
		},
		Files: []DiffFile{},
	}
	if headRef == "" {
		result.Reason = "Task branch is not available yet."
		return result, nil
	}
	if !git.BranchExists(ctx, projectRecord.Path, headRef) {
		result.Reason = "Task branch no longer exists in the repository."
		return result, nil
	}

	fileSummaries, err := git.DiffFiles(ctx, projectRecord.Path, baseRef, headRef, 24*1024)
	if err != nil {
		return nil, failure("TASK_DIFF_READ_FAILED", err.Error(), map[string]any{"taskId": taskID})
	}

	files := make([]DiffFile, 0, len(fileSummaries))
	var additions int64
	var deletions int64
	for _, fileSummary := range fileSummaries {
		additions += fileSummary.Additions
		deletions += fileSummary.Deletions
		files = append(files, DiffFile{
			Path:      fileSummary.Path,
			Previous:  fileSummary.Previous,
			Type:      fileSummary.Type,
			Additions: fileSummary.Additions,
			Deletions: fileSummary.Deletions,
			Patch:     fileSummary.Patch,
		})
	}

	result.Available = true
	result.Files = files
	result.Summary = map[string]any{
		"additions":    additions,
		"deletions":    deletions,
		"filesChanged": len(files),
	}
	return result, nil
}

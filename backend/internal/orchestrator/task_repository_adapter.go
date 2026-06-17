package orchestrator

import (
	"context"

	"eat/backend/internal/project"
	"eat/backend/internal/task"
	"eat/backend/internal/tokenusage"
)

// TaskRepositoryAdapter maps task/project repositories to orchestrator runtime interfaces.
type TaskRepositoryAdapter struct {
	taskRepository    *task.Repository
	projectRepository *project.Repository
}

func NewTaskRepositoryAdapter(taskRepository *task.Repository, projectRepository *project.Repository) *TaskRepositoryAdapter {
	return &TaskRepositoryAdapter{
		taskRepository:    taskRepository,
		projectRepository: projectRepository,
	}
}

func (a *TaskRepositoryAdapter) FindTaskByID(ctx context.Context, taskID string) (*TaskRecord, error) {
	record, err := a.taskRepository.FindTaskByID(ctx, taskID)
	if err != nil || record == nil {
		return nil, err
	}
	return &TaskRecord{
		ID:               record.ID,
		ProjectID:        record.ProjectID,
		Title:            record.Title,
		Status:           record.Status,
		BaseCommitSha:    record.BaseCommitSHA,
		BaseBranch:       record.BaseBranch,
		TaskBranchName:   derefString(record.TaskBranchName),
		ExecutionProfile: derefString(record.ExecutionProfile),
	}, nil
}

func (a *TaskRepositoryAdapter) FindSubTaskByID(ctx context.Context, subTaskID string) (*SubTaskRecord, error) {
	record, err := a.taskRepository.FindSubTaskByID(ctx, subTaskID)
	if err != nil || record == nil {
		return nil, err
	}
	return &SubTaskRecord{
		ID:                       record.ID,
		TaskID:                   record.TaskID,
		BranchSuffix:             record.BranchSuffix,
		BranchName:               derefString(record.BranchName),
		WorktreePath:             derefString(record.WorktreePath),
		AgentType:                record.AgentType,
		Status:                   record.Status,
		Description:              record.Description,
		RetryCount:               int(record.RetryCount),
		DependencyBranchSuffixes: append([]string(nil), record.DependencyBranchSuffixes...),
	}, nil
}

func (a *TaskRepositoryAdapter) ListSubTasksByTaskID(ctx context.Context, taskID string) ([]SubTaskRecord, error) {
	records, err := a.taskRepository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, err
	}

	result := make([]SubTaskRecord, 0, len(records))
	for _, record := range records {
		result = append(result, SubTaskRecord{
			ID:                       record.ID,
			TaskID:                   record.TaskID,
			BranchSuffix:             record.BranchSuffix,
			BranchName:               derefString(record.BranchName),
			WorktreePath:             derefString(record.WorktreePath),
			AgentType:                record.AgentType,
			Status:                   record.Status,
			Description:              record.Description,
			RetryCount:               int(record.RetryCount),
			DependencyBranchSuffixes: append([]string(nil), record.DependencyBranchSuffixes...),
		})
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) ListSessionsBySubTaskID(ctx context.Context, subTaskID string) ([]SessionRecord, error) {
	records, err := a.taskRepository.ListSessionsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return nil, err
	}
	result := make([]SessionRecord, 0, len(records))
	for _, record := range records {
		result = append(result, SessionRecord{
			ID:          record.ID,
			SandboxType: record.SandboxType,
			Status:      record.Status,
		})
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) FindSessionByID(ctx context.Context, sessionID string) (*SessionRecord, error) {
	record, err := a.taskRepository.FindSessionByID(ctx, sessionID)
	if err != nil || record == nil {
		return nil, err
	}
	return &SessionRecord{
		ID:           record.ID,
		SandboxType:  record.SandboxType,
		Status:       record.Status,
		LogPath:      record.LogPath,
		OutputBuffer: record.OutputBuffer,
		CreatedAt:    record.CreatedAt,
	}, nil
}

func (a *TaskRepositoryAdapter) ListAttachmentsByTaskID(ctx context.Context, taskID string) ([]AttachmentRecord, error) {
	records, err := a.taskRepository.ListAttachmentsByTaskID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	result := make([]AttachmentRecord, 0, len(records))
	for _, record := range records {
		result = append(result, AttachmentRecord{
			ID:       record.ID,
			FileName: record.FileName,
			FilePath: record.FilePath,
			FileType: record.FileType,
		})
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) ListMailboxMessagesForSubTask(ctx context.Context, taskID string, subTaskID string) ([]MailboxMessageRecord, error) {
	records, err := a.taskRepository.ListMailboxMessagesForSubTask(ctx, taskID, subTaskID)
	if err != nil {
		return nil, err
	}
	result := make([]MailboxMessageRecord, 0, len(records))
	for _, record := range records {
		result = append(result, toMailboxMessageRecord(record))
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) FindProjectByID(ctx context.Context, projectID string) (*ProjectRecord, error) {
	record, err := a.projectRepository.FindProjectByID(ctx, projectID)
	if err != nil || record == nil {
		return nil, err
	}
	return &ProjectRecord{
		ID:   record.ID,
		Path: record.Path,
	}, nil
}

func (a *TaskRepositoryAdapter) AccumulateSessionTokenUsage(ctx context.Context, input tokenusage.SessionInput) error {
	return a.taskRepository.AccumulateSessionTokenUsage(ctx, input)
}

func (a *TaskRepositoryAdapter) UpdateSession(ctx context.Context, sessionID string, input UpdateSessionInput) error {
	updateInput := task.UpdateSessionInput{}
	if input.Status != nil {
		updateInput.Status = input.Status
		updateInput.SetStatus = true
	}
	if input.ContainerID != nil {
		updateInput.ContainerID = input.ContainerID
		updateInput.SetContainerID = true
	}
	if input.PID != nil {
		updateInput.PID = input.PID
		updateInput.SetPID = true
	}
	if input.StartedAt != nil {
		updateInput.StartedAt = input.StartedAt
		updateInput.SetStartedAt = true
	}
	if input.LogPath != nil {
		updateInput.LogPath = input.LogPath
		updateInput.SetLogPath = true
	}
	if input.FirstOutputAt != nil {
		updateInput.FirstOutputAt = input.FirstOutputAt
		updateInput.SetFirstOutputAt = true
	}
	if input.OutputBufferMaxBytes != nil {
		updateInput.OutputBufferMaxBytes = input.OutputBufferMaxBytes
		updateInput.SetOutputBufferMaxBytes = true
	}
	if input.EndedAt != nil {
		updateInput.EndedAt = input.EndedAt
		updateInput.SetEndedAt = true
	}
	if input.SetExitCode || input.ExitCode != nil {
		updateInput.SetExitCode = true
	}
	if input.ExitCode != nil {
		exitCode := int64(*input.ExitCode)
		updateInput.ExitCode = &exitCode
	}

	_, err := a.taskRepository.UpdateSession(ctx, sessionID, updateInput)
	return err
}

func (a *TaskRepositoryAdapter) UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) error {
	updateInput := task.UpdateSubTaskInput{}
	if input.Status != nil {
		updateInput.Status = input.Status
	}
	updateInput.LastError = input.LastError
	updateInput.SetLastError = input.Status != nil || input.LastError != nil
	if input.BranchName != nil {
		updateInput.BranchName = input.BranchName
		updateInput.SetBranchName = true
	}
	if input.StartCommitSHA != nil {
		updateInput.StartCommitSHA = input.StartCommitSHA
		updateInput.SetStartCommitSHA = true
	}
	if input.WorktreePath != nil {
		updateInput.WorktreePath = input.WorktreePath
		updateInput.SetWorktreePath = true
	}
	_, err := a.taskRepository.UpdateSubTask(ctx, subTaskID, updateInput)
	return err
}

func (a *TaskRepositoryAdapter) UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) error {
	updateInput := task.UpdateTaskInput{
		Status: input.Status,
	}
	updateInput.LastError = input.LastError
	updateInput.SetLastError = input.Status != nil || input.LastError != nil
	_, err := a.taskRepository.UpdateTask(ctx, taskID, updateInput)
	return err
}

func (a *TaskRepositoryAdapter) CreateMessage(ctx context.Context, input CreateMessageInput) error {
	var subTaskID *string
	if input.SubTaskID != "" {
		value := input.SubTaskID
		subTaskID = &value
	}
	_, err := a.taskRepository.CreateMessage(ctx, task.CreateMessageInput{
		TaskID:    input.TaskID,
		SubTaskID: subTaskID,
		Role:      input.Role,
		Content:   input.Content,
	})
	return err
}

func (a *TaskRepositoryAdapter) CreateMailboxMessage(ctx context.Context, input CreateMailboxMessageInput) (*MailboxMessageRecord, error) {
	record, err := a.taskRepository.CreateMailboxMessage(ctx, task.CreateMailboxMessageInput{
		TaskID:          input.TaskID,
		SenderType:      input.SenderType,
		SenderSubTaskID: input.SenderSubTaskID,
		TargetType:      input.TargetType,
		TargetSubTaskID: input.TargetSubTaskID,
		MessageType:     input.MessageType,
		ArtifactRefs:    input.ArtifactRefs,
		FileRefs:        input.FileRefs,
		BranchRef:       input.BranchRef,
		SchemaJSON:      input.SchemaJSON,
		RequiresAck:     input.RequiresAck,
		Content:         input.Content,
	})
	if err != nil || record == nil {
		return nil, err
	}
	result := toMailboxMessageRecord(*record)
	return &result, nil
}

func (a *TaskRepositoryAdapter) AppendSessionOutput(ctx context.Context, sessionID string, chunk string) error {
	return a.taskRepository.AppendSessionOutput(ctx, sessionID, chunk)
}

func (a *TaskRepositoryAdapter) ClaimSessionMailboxBlock(ctx context.Context, sessionID string, fingerprint string) (bool, error) {
	return a.taskRepository.ClaimSessionMailboxBlock(ctx, sessionID, fingerprint)
}

func (a *TaskRepositoryAdapter) AtomicClaimRetry(ctx context.Context, subTaskID string, maxRetries int) (bool, error) {
	claimed := false
	err := a.taskRepository.RunInTransaction(ctx, func(repository *task.Repository) error {
		record, findErr := repository.FindSubTaskByID(ctx, subTaskID)
		if findErr != nil || record == nil {
			return findErr
		}
		if int(record.RetryCount) >= maxRetries {
			return nil
		}

		nextRetryCount := record.RetryCount + 1
		_, updateErr := repository.UpdateSubTask(ctx, subTaskID, task.UpdateSubTaskInput{
			RetryCount: &nextRetryCount,
		})
		if updateErr != nil {
			return updateErr
		}
		claimed = true
		return nil
	})
	return claimed, err
}

func (a *TaskRepositoryAdapter) ListIntegrationRunsByStatuses(ctx context.Context, statuses []string, limit int) ([]IntegrationRunRecord, error) {
	records, err := a.taskRepository.ListIntegrationRunsByStatuses(ctx, statuses, limit)
	if err != nil {
		return nil, err
	}
	result := make([]IntegrationRunRecord, 0, len(records))
	for _, record := range records {
		result = append(result, IntegrationRunRecord{
			ID:                record.ID,
			TaskID:            record.TaskID,
			IntegrationBranch: record.IntegrationBranch,
			Status:            record.Status,
			StartedAt:         record.StartedAt,
			EndedAt:           record.EndedAt,
			CreatedAt:         record.CreatedAt,
			UpdatedAt:         record.UpdatedAt,
		})
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) ListIntegrationQueueItemsByIntegrationRunID(ctx context.Context, integrationRunID string) ([]IntegrationQueueItemRecord, error) {
	records, err := a.taskRepository.ListIntegrationQueueItemsByIntegrationRunID(ctx, integrationRunID)
	if err != nil {
		return nil, err
	}
	result := make([]IntegrationQueueItemRecord, 0, len(records))
	for _, record := range records {
		result = append(result, IntegrationQueueItemRecord{
			ID:               record.ID,
			IntegrationRunID: record.IntegrationRunID,
			SubTaskID:        record.SubTaskID,
			QueueOrder:       record.QueueOrder,
			Status:           record.Status,
			MergedCommitSHA:  record.MergedCommitSHA,
			CreatedAt:        record.CreatedAt,
			UpdatedAt:        record.UpdatedAt,
		})
	}
	return result, nil
}

func (a *TaskRepositoryAdapter) UpdateIntegrationRun(ctx context.Context, integrationRunID string, input UpdateIntegrationRunInput) (*IntegrationRunRecord, error) {
	updated, err := a.taskRepository.UpdateIntegrationRun(ctx, integrationRunID, task.UpdateIntegrationRunInput{
		Status:       input.Status,
		StartedAt:    input.StartedAt,
		SetStartedAt: input.SetStartedAt,
		EndedAt:      input.EndedAt,
		SetEndedAt:   input.SetEndedAt,
	})
	if err != nil || updated == nil {
		return nil, err
	}
	return &IntegrationRunRecord{
		ID:                updated.ID,
		TaskID:            updated.TaskID,
		IntegrationBranch: updated.IntegrationBranch,
		Status:            updated.Status,
		StartedAt:         updated.StartedAt,
		EndedAt:           updated.EndedAt,
		CreatedAt:         updated.CreatedAt,
		UpdatedAt:         updated.UpdatedAt,
	}, nil
}

func (a *TaskRepositoryAdapter) UpdateIntegrationQueueItem(ctx context.Context, integrationQueueItemID string, input UpdateIntegrationQueueItemInput) (*IntegrationQueueItemRecord, error) {
	updated, err := a.taskRepository.UpdateIntegrationQueueItem(ctx, integrationQueueItemID, task.UpdateIntegrationQueueItemInput{
		Status:          input.Status,
		MergedCommitSHA: input.MergedCommitSHA,
		SetMergedCommit: input.SetMergedCommit,
	})
	if err != nil || updated == nil {
		return nil, err
	}
	return &IntegrationQueueItemRecord{
		ID:               updated.ID,
		IntegrationRunID: updated.IntegrationRunID,
		SubTaskID:        updated.SubTaskID,
		QueueOrder:       updated.QueueOrder,
		Status:           updated.Status,
		MergedCommitSHA:  updated.MergedCommitSHA,
		CreatedAt:        updated.CreatedAt,
		UpdatedAt:        updated.UpdatedAt,
	}, nil
}

func (a *TaskRepositoryAdapter) CreateGateResult(ctx context.Context, input CreateGateResultInput) error {
	_, err := a.taskRepository.CreateGateResult(ctx, task.CreateGateResultInput{
		IntegrationRunID: input.IntegrationRunID,
		GateType:         input.GateType,
		Status:           input.Status,
		Summary:          input.Summary,
		DetailsJSON:      input.DetailsJSON,
	})
	return err
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func toMailboxMessageRecord(record task.MailboxMessage) MailboxMessageRecord {
	return MailboxMessageRecord{
		ID:              record.ID,
		TaskID:          record.TaskID,
		SenderType:      record.SenderType,
		SenderSubTaskID: record.SenderSubTaskID,
		TargetType:      record.TargetType,
		TargetSubTaskID: record.TargetSubTaskID,
		MessageType:     record.MessageType,
		ArtifactRefs:    append([]string(nil), record.ArtifactRefs...),
		FileRefs:        append([]string(nil), record.FileRefs...),
		BranchRef:       record.BranchRef,
		SchemaJSON:      cloneJSONMap(record.SchemaJSON),
		RequiresAck:     record.RequiresAck,
		Content:         record.Content,
		CreatedAt:       record.CreatedAt,
	}
}

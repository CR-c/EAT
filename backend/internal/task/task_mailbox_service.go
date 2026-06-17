package task

import (
	"context"

	"eat/backend/internal/domain"
)

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

	eventMessage := domain.MailboxEventMessage{
		ID:              message.ID,
		TaskID:          message.TaskID,
		TargetSubTaskID: message.TargetSubTaskID,
		SenderSubTaskID: message.SenderSubTaskID,
		MessageType:     message.MessageType,
		Content:         message.Content,
		CreatedAt:       message.CreatedAt,
	}
	s.publish(taskID, "mailbox:message", domain.MailboxMessageEventPayload(taskID, message))
	s.publish(taskID, "board:activity", domain.MailboxBoardActivityPayload(taskID, eventMessage))
	s.publishTeamUpdated(taskID)

	return &SendMailboxMessageResult{Message: message}, nil
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

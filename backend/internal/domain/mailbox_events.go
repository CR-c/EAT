package domain

type MailboxEventMessage struct {
	ID              string
	TaskID          string
	TargetSubTaskID *string
	SenderSubTaskID *string
	MessageType     string
	Content         string
	CreatedAt       string
}

func MailboxMessageEventPayload(taskID string, message any) map[string]any {
	return map[string]any{
		"message": message,
		"taskId":  taskID,
	}
}

func MailboxBoardActivityPayload(taskID string, message MailboxEventMessage) map[string]any {
	return map[string]any{
		"createdAt": message.CreatedAt,
		"id":        "mailbox:" + message.ID,
		"kind":      "MAILBOX_MESSAGE",
		"subTaskId": NullableString(message.TargetSubTaskID, message.SenderSubTaskID),
		"summary":   FirstNonEmpty(message.Content, message.MessageType),
		"taskId":    taskID,
	}
}

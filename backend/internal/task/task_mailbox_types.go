package task

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

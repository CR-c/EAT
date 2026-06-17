package task

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

func (r *Repository) CreateMailboxMessage(ctx context.Context, input CreateMailboxMessageInput) (*MailboxMessage, error) {
	createdAt := input.CreatedAt
	if createdAt == "" {
		createdAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	messageType := input.MessageType
	if messageType == "" {
		messageType = "NOTE"
	}
	record := &MailboxMessage{
		ID:              input.ID,
		TaskID:          input.TaskID,
		SenderType:      input.SenderType,
		SenderSubTaskID: input.SenderSubTaskID,
		TargetType:      input.TargetType,
		TargetSubTaskID: input.TargetSubTaskID,
		MessageType:     messageType,
		ArtifactRefs:    normalizeStringSlice(input.ArtifactRefs),
		FileRefs:        normalizeStringSlice(input.FileRefs),
		BranchRef:       input.BranchRef,
		SchemaJSON:      cloneJSONObject(input.SchemaJSON),
		RequiresAck:     input.RequiresAck,
		Content:         input.Content,
		CreatedAt:       createdAt,
	}
	if record.ID == "" {
		record.ID = uuid.NewString()
	}

	artifactRefsJSON, err := json.Marshal(record.ArtifactRefs)
	if err != nil {
		return nil, err
	}
	fileRefsJSON, err := json.Marshal(record.FileRefs)
	if err != nil {
		return nil, err
	}
	var schemaJSON *string
	if record.SchemaJSON != nil {
		schemaBytes, marshalErr := json.Marshal(record.SchemaJSON)
		if marshalErr != nil {
			return nil, marshalErr
		}
		schemaValue := string(schemaBytes)
		schemaJSON = &schemaValue
	}

	requiresAckInt := int64(0)
	if record.RequiresAck {
		requiresAckInt = 1
	}

	_, err = r.exec().ExecContext(ctx, `
		INSERT INTO mailbox_messages (
			id, task_id, sender_type, sender_sub_task_id, target_type, target_sub_task_id,
			message_type, artifact_refs_json, file_refs_json, branch_ref, schema_json,
			requires_ack, content, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.SenderType,
		record.SenderSubTaskID,
		record.TargetType,
		record.TargetSubTaskID,
		record.MessageType,
		string(artifactRefsJSON),
		string(fileRefsJSON),
		record.BranchRef,
		schemaJSON,
		requiresAckInt,
		record.Content,
		record.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) ListMailboxMessagesByTaskID(ctx context.Context, taskID string) ([]MailboxMessage, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, sender_type, sender_sub_task_id, target_type, target_sub_task_id,
			message_type, artifact_refs_json, file_refs_json, branch_ref, schema_json,
			requires_ack, content, created_at
		FROM mailbox_messages
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]MailboxMessage, 0)
	for rows.Next() {
		var item MailboxMessage
		var artifactRefsJSON string
		var fileRefsJSON string
		var schemaJSONRaw *string
		var requiresAckInt int64
		if err := rows.Scan(
			&item.ID,
			&item.TaskID,
			&item.SenderType,
			&item.SenderSubTaskID,
			&item.TargetType,
			&item.TargetSubTaskID,
			&item.MessageType,
			&artifactRefsJSON,
			&fileRefsJSON,
			&item.BranchRef,
			&schemaJSONRaw,
			&requiresAckInt,
			&item.Content,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		item.ArtifactRefs = parseStringSliceJSON(artifactRefsJSON)
		item.FileRefs = parseStringSliceJSON(fileRefsJSON)
		item.SchemaJSON = parseJSONObjectJSON(schemaJSONRaw)
		item.RequiresAck = requiresAckInt == 1
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ListMailboxMessagesForSubTask(ctx context.Context, taskID string, subTaskID string) ([]MailboxMessage, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, sender_type, sender_sub_task_id, target_type, target_sub_task_id,
			message_type, artifact_refs_json, file_refs_json, branch_ref, schema_json,
			requires_ack, content, created_at
		FROM mailbox_messages
		WHERE task_id = ?
			AND (
				(target_type = 'SUBTASK' AND target_sub_task_id = ?)
				OR message_type IN ('API_CONTRACT', 'DB_CONTRACT')
				OR requires_ack = 1
			)
		ORDER BY created_at ASC, id ASC
	`, taskID, subTaskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]MailboxMessage, 0)
	for rows.Next() {
		var item MailboxMessage
		var artifactRefsJSON string
		var fileRefsJSON string
		var schemaJSONRaw *string
		var requiresAckInt int64
		if err := rows.Scan(
			&item.ID,
			&item.TaskID,
			&item.SenderType,
			&item.SenderSubTaskID,
			&item.TargetType,
			&item.TargetSubTaskID,
			&item.MessageType,
			&artifactRefsJSON,
			&fileRefsJSON,
			&item.BranchRef,
			&schemaJSONRaw,
			&requiresAckInt,
			&item.Content,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		item.ArtifactRefs = parseStringSliceJSON(artifactRefsJSON)
		item.FileRefs = parseStringSliceJSON(fileRefsJSON)
		item.SchemaJSON = parseJSONObjectJSON(schemaJSONRaw)
		item.RequiresAck = requiresAckInt == 1
		items = append(items, item)
	}
	return items, rows.Err()
}

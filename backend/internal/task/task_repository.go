package task

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

func (r *Repository) CreateTask(ctx context.Context, input CreateTaskRecordInput) (*Task, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	taskRecord := &Task{
		ID:               uuid.NewString(),
		ProjectID:        input.ProjectID,
		Title:            input.Title,
		Description:      input.Description,
		LeadAgentType:    input.LeadAgentType,
		BaseBranch:       input.BaseBranch,
		BaseCommitSHA:    input.BaseCommitSHA,
		TaskBranchName:   input.TaskBranchName,
		Status:           "DRAFT",
		PlanVersion:      0,
		CurrentPlanJSON:  nil,
		ApprovedPlanJSON: nil,
		LastError:        nil,
		ArchivedAt:       nil,
		CreatedAt:        now,
		UpdatedAt:        now,
		Version:          0,
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json,
			last_error, archived_at, created_at, updated_at, version
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		taskRecord.ID,
		taskRecord.ProjectID,
		taskRecord.Title,
		taskRecord.Description,
		taskRecord.LeadAgentType,
		taskRecord.BaseBranch,
		taskRecord.BaseCommitSHA,
		taskRecord.TaskBranchName,
		taskRecord.Status,
		taskRecord.PlanVersion,
		taskRecord.CurrentPlanJSON,
		taskRecord.ApprovedPlanJSON,
		taskRecord.LastError,
		taskRecord.ArchivedAt,
		taskRecord.CreatedAt,
		taskRecord.UpdatedAt,
		taskRecord.Version,
	)
	if err != nil {
		return nil, err
	}

	return taskRecord, nil
}

func (r *Repository) CreateAttachment(ctx context.Context, input CreateAttachmentInput) (*Attachment, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	attachment := &Attachment{
		ID:        input.ID,
		TaskID:    input.TaskID,
		FileName:  input.FileName,
		FilePath:  input.FilePath,
		FileType:  input.FileType,
		MimeType:  input.MimeType,
		Size:      input.Size,
		CreatedAt: now,
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO attachments (
			id, task_id, file_name, file_path, file_type, mime_type, size, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		attachment.ID,
		attachment.TaskID,
		attachment.FileName,
		attachment.FilePath,
		attachment.FileType,
		attachment.MimeType,
		attachment.Size,
		attachment.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return attachment, nil
}

type CreateTaskRecordInput struct {
	ProjectID      string
	Title          string
	Description    string
	LeadAgentType  string
	BaseBranch     string
	BaseCommitSHA  string
	TaskBranchName *string
}

type CreateAttachmentInput struct {
	ID       string
	TaskID   string
	FileName string
	FilePath string
	FileType string
	MimeType string
	Size     int64
}

func (r *Repository) FindTaskByID(ctx context.Context, taskID string) (*Task, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT
			id,
			project_id,
			title,
			description,
			lead_agent_type,
			base_branch,
			base_commit_sha,
			task_branch_name,
			status,
			plan_version,
			current_plan_json,
			approved_plan_json,
			last_error,
			archived_at,
			created_at,
			updated_at,
			version
		FROM tasks
		WHERE id = ?
	`, taskID)

	var task Task
	if err := row.Scan(
		&task.ID,
		&task.ProjectID,
		&task.Title,
		&task.Description,
		&task.LeadAgentType,
		&task.BaseBranch,
		&task.BaseCommitSHA,
		&task.TaskBranchName,
		&task.Status,
		&task.PlanVersion,
		&task.CurrentPlanJSON,
		&task.ApprovedPlanJSON,
		&task.LastError,
		&task.ArchivedAt,
		&task.CreatedAt,
		&task.UpdatedAt,
		&task.Version,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return r.attachSingleTaskTokenSummary(ctx, &task)
}

func (r *Repository) ListTasksByProjectID(ctx context.Context, projectID string, includeArchived bool) ([]Task, error) {
	query := `
		SELECT
			id,
			project_id,
			title,
			description,
			lead_agent_type,
			base_branch,
			base_commit_sha,
			task_branch_name,
			status,
			plan_version,
			current_plan_json,
			approved_plan_json,
			last_error,
			archived_at,
			created_at,
			updated_at,
			version
		FROM tasks
		WHERE project_id = ?
	`
	if !includeArchived {
		query += " AND archived_at IS NULL"
	}
	query += " ORDER BY created_at DESC, id DESC"

	rows, err := r.exec().QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]Task, 0)
	for rows.Next() {
		var task Task
		if err := rows.Scan(
			&task.ID,
			&task.ProjectID,
			&task.Title,
			&task.Description,
			&task.LeadAgentType,
			&task.BaseBranch,
			&task.BaseCommitSHA,
			&task.TaskBranchName,
			&task.Status,
			&task.PlanVersion,
			&task.CurrentPlanJSON,
			&task.ApprovedPlanJSON,
			&task.LastError,
			&task.ArchivedAt,
			&task.CreatedAt,
			&task.UpdatedAt,
			&task.Version,
		); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return r.attachTaskTokenSummaries(ctx, tasks)
}

func (r *Repository) ListMessagesByTaskID(ctx context.Context, taskID string) ([]Message, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT id, task_id, sub_task_id, role, content, created_at
		FROM messages
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Message, 0)
	for rows.Next() {
		var item Message
		if err := rows.Scan(&item.ID, &item.TaskID, &item.SubTaskID, &item.Role, &item.Content, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) CreateMessage(ctx context.Context, input CreateMessageInput) (*Message, error) {
	createdAt := input.CreatedAt
	if createdAt == "" {
		createdAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	record := &Message{
		ID:        input.ID,
		TaskID:    input.TaskID,
		SubTaskID: input.SubTaskID,
		Role:      input.Role,
		Content:   input.Content,
		CreatedAt: createdAt,
	}
	if record.ID == "" {
		record.ID = uuid.NewString()
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO messages (id, task_id, sub_task_id, role, content, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.SubTaskID,
		record.Role,
		record.Content,
		record.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) ListAttachmentsByTaskID(ctx context.Context, taskID string) ([]Attachment, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT id, task_id, file_name, file_path, file_type, mime_type, size, created_at
		FROM attachments
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Attachment, 0)
	for rows.Next() {
		var item Attachment
		if err := rows.Scan(&item.ID, &item.TaskID, &item.FileName, &item.FilePath, &item.FileType, &item.MimeType, &item.Size, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ListPlanSnapshotsByTaskID(ctx context.Context, taskID string) ([]PlanSnapshot, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT id, task_id, version, source, payload, created_at
		FROM plan_snapshots
		WHERE task_id = ?
		ORDER BY created_at DESC, id DESC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]PlanSnapshot, 0)
	for rows.Next() {
		var item PlanSnapshot
		if err := rows.Scan(&item.ID, &item.TaskID, &item.Version, &item.Source, &item.Payload, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) UpdateTask(ctx context.Context, taskID string, input UpdateTaskInput) (*Task, error) {
	currentTask, err := r.FindTaskByID(ctx, taskID)
	if err != nil || currentTask == nil {
		return currentTask, err
	}

	nextTask := *currentTask
	nextTask.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	nextTask.Version++

	if input.Status != nil {
		nextTask.Status = *input.Status
	}
	if input.PlanVersion != nil {
		nextTask.PlanVersion = *input.PlanVersion
	}
	if input.SetCurrentPlanJSON {
		nextTask.CurrentPlanJSON = input.CurrentPlanJSON
	}
	if input.SetApprovedPlanJSON {
		nextTask.ApprovedPlanJSON = input.ApprovedPlanJSON
	}
	if input.SetLastError {
		nextTask.LastError = input.LastError
	}
	if input.SetArchivedAt {
		nextTask.ArchivedAt = input.ArchivedAt
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE tasks
		SET
			status = ?,
			plan_version = ?,
			current_plan_json = ?,
			approved_plan_json = ?,
			last_error = ?,
			archived_at = ?,
			updated_at = ?,
			version = ?
		WHERE id = ?
	`,
		nextTask.Status,
		nextTask.PlanVersion,
		nextTask.CurrentPlanJSON,
		nextTask.ApprovedPlanJSON,
		nextTask.LastError,
		nextTask.ArchivedAt,
		nextTask.UpdatedAt,
		nextTask.Version,
		taskID,
	)
	if err != nil {
		return nil, err
	}

	return &nextTask, nil
}

func (r *Repository) DeleteTask(ctx context.Context, taskID string) (*Task, error) {
	currentTask, err := r.FindTaskByID(ctx, taskID)
	if err != nil || currentTask == nil {
		return currentTask, err
	}

	if _, err := r.exec().ExecContext(ctx, `DELETE FROM tasks WHERE id = ?`, taskID); err != nil {
		return nil, err
	}

	return currentTask, nil
}

func (r *Repository) CreatePlanSnapshot(ctx context.Context, input CreatePlanSnapshotInput) (*PlanSnapshot, error) {
	record := &PlanSnapshot{
		ID:        uuid.NewString(),
		TaskID:    input.TaskID,
		Version:   input.Version,
		Source:    input.Source,
		Payload:   input.Payload,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.Version,
		record.Source,
		record.Payload,
		record.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) FindPlanSnapshotByID(ctx context.Context, snapshotID string) (*PlanSnapshot, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT id, task_id, version, source, payload, created_at
		FROM plan_snapshots
		WHERE id = ?
	`, snapshotID)

	var snapshot PlanSnapshot
	if err := row.Scan(&snapshot.ID, &snapshot.TaskID, &snapshot.Version, &snapshot.Source, &snapshot.Payload, &snapshot.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &snapshot, nil
}

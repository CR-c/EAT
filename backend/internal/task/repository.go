package task

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Task struct {
	ID               string  `json:"id"`
	ProjectID        string  `json:"projectId"`
	Title            string  `json:"title"`
	Description      string  `json:"description"`
	LeadAgentType    string  `json:"leadAgentType"`
	BaseBranch       string  `json:"baseBranch"`
	BaseCommitSHA    string  `json:"baseCommitSha"`
	TaskBranchName   *string `json:"taskBranchName"`
	Status           string  `json:"status"`
	PlanVersion      int64   `json:"planVersion"`
	CurrentPlanJSON  *string `json:"currentPlanJson"`
	ApprovedPlanJSON *string `json:"approvedPlanJson"`
	LastError        *string `json:"lastError"`
	ArchivedAt       *string `json:"archivedAt"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
	Version          int64   `json:"version"`
}

type Message struct {
	ID        string  `json:"id"`
	TaskID    string  `json:"taskId"`
	SubTaskID *string `json:"subTaskId"`
	Role      string  `json:"role"`
	Content   string  `json:"content"`
	CreatedAt string  `json:"createdAt"`
}

type Attachment struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	FileName  string `json:"fileName"`
	FilePath  string `json:"filePath"`
	FileType  string `json:"fileType"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"createdAt"`
}

type Session struct {
	ID                   string  `json:"id"`
	TaskID               string  `json:"taskId"`
	SubTaskID            *string `json:"subTaskId"`
	AgentType            string  `json:"agentType"`
	SessionType          string  `json:"sessionType"`
	SandboxType          string  `json:"sandboxType"`
	ContainerID          *string `json:"containerId"`
	Status               string  `json:"status"`
	PID                  *int64  `json:"pid"`
	StartedAt            *string `json:"startedAt"`
	EndedAt              *string `json:"endedAt"`
	ExitCode             *int64  `json:"exitCode"`
	LogPath              *string `json:"logPath"`
	FirstOutputAt        *string `json:"firstOutputAt"`
	OutputBuffer         string  `json:"outputBuffer"`
	OutputBufferMaxBytes int64   `json:"outputBufferMaxBytes"`
	CreatedAt            string  `json:"createdAt"`
	UpdatedAt            string  `json:"updatedAt"`
}

type SubTask struct {
	ID                       string   `json:"id"`
	TaskID                   string   `json:"taskId"`
	Title                    string   `json:"title"`
	Description              string   `json:"description"`
	BranchSuffix             string   `json:"branchSuffix"`
	DependencyBranchSuffixes []string `json:"dependencyBranchSuffixes"`
	BranchName               *string  `json:"branchName"`
	StartCommitSHA           *string  `json:"startCommitSha"`
	WorktreePath             *string  `json:"worktreePath"`
	AgentType                string   `json:"agentType"`
	Status                   string   `json:"status"`
	AutoAssigned             bool     `json:"autoAssigned"`
	RetryCount               int64    `json:"retryCount"`
	LastError                *string  `json:"lastError"`
	LatestReviewDecision     *string  `json:"latestReviewDecision"`
	LatestReviewPhase        *string  `json:"latestReviewPhase"`
	LatestReviewSummary      *string  `json:"latestReviewSummary"`
	Role                     *string  `json:"role"`
	DisplayName              *string  `json:"displayName"`
	ExecutionOrder           *int64   `json:"executionOrder"`
	AssignmentSource         *string  `json:"assignmentSource"`
	RunSummary               *string  `json:"runSummary"`
	Version                  int64    `json:"version"`
	CreatedAt                string   `json:"createdAt"`
	UpdatedAt                string   `json:"updatedAt"`
}

type PlanSnapshot struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	Version   int64  `json:"version"`
	Source    string `json:"source"`
	Payload   string `json:"payload"`
	CreatedAt string `json:"createdAt"`
}

type Repository struct {
	db *sql.DB
	tx *sql.Tx
}

type UpdateTaskInput struct {
	Status              *string
	PlanVersion         *int64
	CurrentPlanJSON     *string
	SetCurrentPlanJSON  bool
	ApprovedPlanJSON    *string
	SetApprovedPlanJSON bool
	LastError           *string
	SetLastError        bool
	ArchivedAt          *string
	SetArchivedAt       bool
}

type CreatePlanSnapshotInput struct {
	TaskID  string
	Version int64
	Source  string
	Payload string
}

type CreateMessageInput struct {
	ID        string
	TaskID    string
	SubTaskID *string
	Role      string
	Content   string
	CreatedAt string
}

type CreateSessionInput struct {
	ID                   string
	TaskID               string
	SubTaskID            *string
	AgentType            string
	SessionType          string
	SandboxType          string
	ContainerID          *string
	Status               string
	PID                  *int64
	StartedAt            *string
	EndedAt              *string
	ExitCode             *int64
	LogPath              *string
	FirstOutputAt        *string
	OutputBuffer         string
	OutputBufferMaxBytes int64
	CreatedAt            string
	UpdatedAt            string
}

type UpdateSessionInput struct {
	Status        *string
	SetStatus     bool
	EndedAt       *string
	SetEndedAt    bool
	ExitCode      *int64
	SetExitCode   bool
	OutputBuffer  *string
	SetOutputBuff bool
	UpdatedAt     *string
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

type queryExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

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

	return &task, nil
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

	return tasks, rows.Err()
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

func (r *Repository) ListSessionsByTaskID(ctx context.Context, taskID string) ([]Session, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		FROM agent_sessions
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Session, 0)
	for rows.Next() {
		var item Session
		if err := rows.Scan(
			&item.ID,
			&item.TaskID,
			&item.SubTaskID,
			&item.AgentType,
			&item.SessionType,
			&item.SandboxType,
			&item.ContainerID,
			&item.Status,
			&item.PID,
			&item.StartedAt,
			&item.EndedAt,
			&item.ExitCode,
			&item.LogPath,
			&item.FirstOutputAt,
			&item.OutputBuffer,
			&item.OutputBufferMaxBytes,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ListSubTasksByTaskID(ctx context.Context, taskID string) ([]SubTask, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		FROM sub_tasks
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]SubTask, 0)
	for rows.Next() {
		var item SubTask
		var dependencyJSON string
		var autoAssignedInt int64
		if err := rows.Scan(
			&item.ID,
			&item.TaskID,
			&item.Title,
			&item.Description,
			&item.BranchSuffix,
			&dependencyJSON,
			&item.BranchName,
			&item.StartCommitSHA,
			&item.WorktreePath,
			&item.AgentType,
			&item.Status,
			&autoAssignedInt,
			&item.RetryCount,
			&item.LastError,
			&item.LatestReviewDecision,
			&item.LatestReviewPhase,
			&item.LatestReviewSummary,
			&item.Role,
			&item.DisplayName,
			&item.ExecutionOrder,
			&item.AssignmentSource,
			&item.RunSummary,
			&item.Version,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.AutoAssigned = autoAssignedInt == 1
		if dependencyJSON != "" {
			_ = json.Unmarshal([]byte(dependencyJSON), &item.DependencyBranchSuffixes)
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

type CreateSubTaskInput struct {
	TaskID                   string
	Title                    string
	Description              string
	BranchSuffix             string
	DependencyBranchSuffixes []string
	BranchName               *string
	StartCommitSHA           *string
	WorktreePath             *string
	AgentType                string
	Status                   string
	AutoAssigned             bool
	Role                     *string
	DisplayName              *string
	ExecutionOrder           *int64
	AssignmentSource         *string
	CreatedAt                string
	UpdatedAt                string
}

func (r *Repository) CreateSubTask(ctx context.Context, input CreateSubTaskInput) (*SubTask, error) {
	dependencyJSONBytes, err := json.Marshal(input.DependencyBranchSuffixes)
	if err != nil {
		return nil, err
	}

	autoAssignedInt := int64(0)
	if input.AutoAssigned {
		autoAssignedInt = 1
	}

	record := &SubTask{
		ID:                       uuid.NewString(),
		TaskID:                   input.TaskID,
		Title:                    input.Title,
		Description:              input.Description,
		BranchSuffix:             input.BranchSuffix,
		DependencyBranchSuffixes: append([]string(nil), input.DependencyBranchSuffixes...),
		BranchName:               input.BranchName,
		StartCommitSHA:           input.StartCommitSHA,
		WorktreePath:             input.WorktreePath,
		AgentType:                input.AgentType,
		Status:                   input.Status,
		AutoAssigned:             input.AutoAssigned,
		RetryCount:               0,
		LastError:                nil,
		LatestReviewDecision:     nil,
		LatestReviewPhase:        nil,
		LatestReviewSummary:      nil,
		Role:                     input.Role,
		DisplayName:              input.DisplayName,
		ExecutionOrder:           input.ExecutionOrder,
		AssignmentSource:         input.AssignmentSource,
		RunSummary:               nil,
		Version:                  0,
		CreatedAt:                input.CreatedAt,
		UpdatedAt:                input.UpdatedAt,
	}

	_, err = r.exec().ExecContext(ctx, `
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.Title,
		record.Description,
		record.BranchSuffix,
		string(dependencyJSONBytes),
		record.BranchName,
		record.StartCommitSHA,
		record.WorktreePath,
		record.AgentType,
		record.Status,
		autoAssignedInt,
		record.RetryCount,
		record.LastError,
		record.LatestReviewDecision,
		record.LatestReviewPhase,
		record.LatestReviewSummary,
		record.Role,
		record.DisplayName,
		record.ExecutionOrder,
		record.AssignmentSource,
		record.RunSummary,
		record.Version,
		record.CreatedAt,
		record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) CreateSession(ctx context.Context, input CreateSessionInput) (*Session, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	createdAt := input.CreatedAt
	if createdAt == "" {
		createdAt = now
	}
	updatedAt := input.UpdatedAt
	if updatedAt == "" {
		updatedAt = createdAt
	}
	outputBufferMaxBytes := input.OutputBufferMaxBytes
	if outputBufferMaxBytes == 0 {
		outputBufferMaxBytes = 65536
	}
	status := input.Status
	if status == "" {
		status = "PENDING"
	}

	record := &Session{
		ID:                   input.ID,
		TaskID:               input.TaskID,
		SubTaskID:            input.SubTaskID,
		AgentType:            input.AgentType,
		SessionType:          input.SessionType,
		SandboxType:          input.SandboxType,
		ContainerID:          input.ContainerID,
		Status:               status,
		PID:                  input.PID,
		StartedAt:            input.StartedAt,
		EndedAt:              input.EndedAt,
		ExitCode:             input.ExitCode,
		LogPath:              input.LogPath,
		FirstOutputAt:        input.FirstOutputAt,
		OutputBuffer:         input.OutputBuffer,
		OutputBufferMaxBytes: outputBufferMaxBytes,
		CreatedAt:            createdAt,
		UpdatedAt:            updatedAt,
	}
	if record.ID == "" {
		record.ID = uuid.NewString()
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO agent_sessions (
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.SubTaskID,
		record.AgentType,
		record.SessionType,
		record.SandboxType,
		record.ContainerID,
		record.Status,
		record.PID,
		record.StartedAt,
		record.EndedAt,
		record.ExitCode,
		record.LogPath,
		record.FirstOutputAt,
		record.OutputBuffer,
		record.OutputBufferMaxBytes,
		record.CreatedAt,
		record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) FindSessionByID(ctx context.Context, sessionID string) (*Session, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		FROM agent_sessions
		WHERE id = ?
	`, sessionID)

	var session Session
	if err := row.Scan(
		&session.ID,
		&session.TaskID,
		&session.SubTaskID,
		&session.AgentType,
		&session.SessionType,
		&session.SandboxType,
		&session.ContainerID,
		&session.Status,
		&session.PID,
		&session.StartedAt,
		&session.EndedAt,
		&session.ExitCode,
		&session.LogPath,
		&session.FirstOutputAt,
		&session.OutputBuffer,
		&session.OutputBufferMaxBytes,
		&session.CreatedAt,
		&session.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &session, nil
}

func (r *Repository) UpdateSession(ctx context.Context, sessionID string, input UpdateSessionInput) (*Session, error) {
	currentSession, err := r.FindSessionByID(ctx, sessionID)
	if err != nil || currentSession == nil {
		return currentSession, err
	}

	nextSession := *currentSession
	if input.SetStatus {
		nextSession.Status = derefOr(nextSession.Status, input.Status)
	}
	if input.SetEndedAt {
		nextSession.EndedAt = input.EndedAt
	}
	if input.SetExitCode {
		nextSession.ExitCode = input.ExitCode
	}
	if input.SetOutputBuff {
		nextSession.OutputBuffer = derefOr(nextSession.OutputBuffer, input.OutputBuffer)
	}
	if input.UpdatedAt != nil {
		nextSession.UpdatedAt = *input.UpdatedAt
	} else {
		nextSession.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE agent_sessions
		SET
			agent_type = ?,
			session_type = ?,
			sandbox_type = ?,
			container_id = ?,
			status = ?,
			pid = ?,
			started_at = ?,
			ended_at = ?,
			exit_code = ?,
			log_path = ?,
			first_output_at = ?,
			output_buffer = ?,
			output_buffer_max_bytes = ?,
			updated_at = ?
		WHERE id = ?
	`,
		nextSession.AgentType,
		nextSession.SessionType,
		nextSession.SandboxType,
		nextSession.ContainerID,
		nextSession.Status,
		nextSession.PID,
		nextSession.StartedAt,
		nextSession.EndedAt,
		nextSession.ExitCode,
		nextSession.LogPath,
		nextSession.FirstOutputAt,
		nextSession.OutputBuffer,
		nextSession.OutputBufferMaxBytes,
		nextSession.UpdatedAt,
		sessionID,
	)
	if err != nil {
		return nil, err
	}

	return &nextSession, nil
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

func (r *Repository) RunInTransaction(ctx context.Context, fn func(*Repository) error) error {
	if r.db == nil {
		return fn(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	transactionalRepository := &Repository{db: r.db, tx: tx}
	if err := fn(transactionalRepository); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (r *Repository) exec() queryExecutor {
	if r.tx != nil {
		return r.tx
	}
	return r.db
}

func derefOr(current string, next *string) string {
	if next == nil {
		return current
	}
	return *next
}

package task

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

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

func (r *Repository) ListSessionsBySubTaskID(ctx context.Context, subTaskID string) ([]Session, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		FROM agent_sessions
		WHERE sub_task_id = ?
		ORDER BY created_at ASC, id ASC
	`, subTaskID)
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

func (r *Repository) AppendSessionOutput(ctx context.Context, sessionID string, chunk string) error {
	if strings.TrimSpace(chunk) == "" {
		return nil
	}

	currentSession, err := r.FindSessionByID(ctx, sessionID)
	if err != nil || currentSession == nil {
		return err
	}

	nextOutput := currentSession.OutputBuffer + chunk
	maxBytes := currentSession.OutputBufferMaxBytes
	if maxBytes <= 0 {
		maxBytes = 65536
	}
	if int64(len(nextOutput)) > maxBytes {
		nextOutput = nextOutput[len(nextOutput)-int(maxBytes):]
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	firstOutputAt := currentSession.FirstOutputAt
	if firstOutputAt == nil {
		firstOutputAt = &now
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE agent_sessions
		SET
			first_output_at = ?,
			output_buffer = ?,
			updated_at = ?
		WHERE id = ?
	`,
		firstOutputAt,
		nextOutput,
		now,
		sessionID,
	)
	return err
}

package task

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

func (r *Repository) CreateIntegrationRun(ctx context.Context, input CreateIntegrationRunInput) (*IntegrationRun, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	record := &IntegrationRun{
		ID:                input.ID,
		TaskID:            input.TaskID,
		IntegrationBranch: input.IntegrationBranch,
		Status:            input.Status,
		StartedAt:         input.StartedAt,
		EndedAt:           input.EndedAt,
		CreatedAt:         input.CreatedAt,
		UpdatedAt:         input.UpdatedAt,
	}
	if record.ID == "" {
		record.ID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	if record.UpdatedAt == "" {
		record.UpdatedAt = record.CreatedAt
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO integration_runs (
			id, task_id, integration_branch, status, started_at, ended_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.TaskID,
		record.IntegrationBranch,
		record.Status,
		record.StartedAt,
		record.EndedAt,
		record.CreatedAt,
		record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) FindIntegrationRunByID(ctx context.Context, integrationRunID string) (*IntegrationRun, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT
			id, task_id, integration_branch, status, started_at, ended_at, created_at, updated_at
		FROM integration_runs
		WHERE id = ?
	`, integrationRunID)

	var record IntegrationRun
	if err := row.Scan(
		&record.ID,
		&record.TaskID,
		&record.IntegrationBranch,
		&record.Status,
		&record.StartedAt,
		&record.EndedAt,
		&record.CreatedAt,
		&record.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &record, nil
}

func (r *Repository) UpdateIntegrationRun(ctx context.Context, integrationRunID string, input UpdateIntegrationRunInput) (*IntegrationRun, error) {
	currentRun, err := r.FindIntegrationRunByID(ctx, integrationRunID)
	if err != nil || currentRun == nil {
		return currentRun, err
	}

	nextRun := *currentRun
	nextRun.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if input.IntegrationBranch != nil {
		nextRun.IntegrationBranch = *input.IntegrationBranch
	}
	if input.Status != nil {
		nextRun.Status = *input.Status
	}
	if input.SetStartedAt {
		nextRun.StartedAt = input.StartedAt
	}
	if input.SetEndedAt {
		nextRun.EndedAt = input.EndedAt
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE integration_runs
		SET
			integration_branch = ?,
			status = ?,
			started_at = ?,
			ended_at = ?,
			updated_at = ?
		WHERE id = ?
	`,
		nextRun.IntegrationBranch,
		nextRun.Status,
		nextRun.StartedAt,
		nextRun.EndedAt,
		nextRun.UpdatedAt,
		integrationRunID,
	)
	if err != nil {
		return nil, err
	}

	return &nextRun, nil
}

func (r *Repository) ListIntegrationRunsByTaskID(ctx context.Context, taskID string) ([]IntegrationRun, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, task_id, integration_branch, status, started_at, ended_at, created_at, updated_at
		FROM integration_runs
		WHERE task_id = ?
		ORDER BY created_at ASC, id ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]IntegrationRun, 0)
	for rows.Next() {
		var item IntegrationRun
		if err := rows.Scan(
			&item.ID,
			&item.TaskID,
			&item.IntegrationBranch,
			&item.Status,
			&item.StartedAt,
			&item.EndedAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) CreateIntegrationQueueItem(ctx context.Context, input CreateIntegrationQueueItemInput) (*IntegrationQueueItem, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	record := &IntegrationQueueItem{
		ID:               input.ID,
		IntegrationRunID: input.IntegrationRunID,
		SubTaskID:        input.SubTaskID,
		QueueOrder:       input.QueueOrder,
		Status:           input.Status,
		MergedCommitSHA:  input.MergedCommitSHA,
		CreatedAt:        input.CreatedAt,
		UpdatedAt:        input.UpdatedAt,
	}
	if record.ID == "" {
		record.ID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	if record.UpdatedAt == "" {
		record.UpdatedAt = record.CreatedAt
	}

	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO integration_queue_items (
			id, integration_run_id, sub_task_id, queue_order, status, merged_commit_sha, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		record.ID,
		record.IntegrationRunID,
		record.SubTaskID,
		record.QueueOrder,
		record.Status,
		record.MergedCommitSHA,
		record.CreatedAt,
		record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return record, nil
}

func (r *Repository) FindIntegrationQueueItemByID(ctx context.Context, integrationQueueItemID string) (*IntegrationQueueItem, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT
			id, integration_run_id, sub_task_id, queue_order, status, merged_commit_sha, created_at, updated_at
		FROM integration_queue_items
		WHERE id = ?
	`, integrationQueueItemID)

	var record IntegrationQueueItem
	if err := row.Scan(
		&record.ID,
		&record.IntegrationRunID,
		&record.SubTaskID,
		&record.QueueOrder,
		&record.Status,
		&record.MergedCommitSHA,
		&record.CreatedAt,
		&record.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &record, nil
}

func (r *Repository) UpdateIntegrationQueueItem(ctx context.Context, integrationQueueItemID string, input UpdateIntegrationQueueItemInput) (*IntegrationQueueItem, error) {
	currentItem, err := r.FindIntegrationQueueItemByID(ctx, integrationQueueItemID)
	if err != nil || currentItem == nil {
		return currentItem, err
	}

	nextItem := *currentItem
	nextItem.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if input.QueueOrder != nil {
		nextItem.QueueOrder = *input.QueueOrder
	}
	if input.Status != nil {
		nextItem.Status = *input.Status
	}
	if input.SetMergedCommit {
		nextItem.MergedCommitSHA = input.MergedCommitSHA
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE integration_queue_items
		SET
			queue_order = ?,
			status = ?,
			merged_commit_sha = ?,
			updated_at = ?
		WHERE id = ?
	`,
		nextItem.QueueOrder,
		nextItem.Status,
		nextItem.MergedCommitSHA,
		nextItem.UpdatedAt,
		integrationQueueItemID,
	)
	if err != nil {
		return nil, err
	}

	return &nextItem, nil
}

func (r *Repository) ListIntegrationQueueItemsByIntegrationRunID(ctx context.Context, integrationRunID string) ([]IntegrationQueueItem, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, integration_run_id, sub_task_id, queue_order, status, merged_commit_sha, created_at, updated_at
		FROM integration_queue_items
		WHERE integration_run_id = ?
		ORDER BY queue_order ASC, created_at ASC, id ASC
	`, integrationRunID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]IntegrationQueueItem, 0)
	for rows.Next() {
		var item IntegrationQueueItem
		if err := rows.Scan(
			&item.ID,
			&item.IntegrationRunID,
			&item.SubTaskID,
			&item.QueueOrder,
			&item.Status,
			&item.MergedCommitSHA,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ListGateResultsByIntegrationRunID(ctx context.Context, integrationRunID string) ([]GateResult, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, integration_run_id, gate_type, status, summary, details_json, created_at
		FROM gate_results
		WHERE integration_run_id = ?
		ORDER BY created_at ASC, id ASC
	`, integrationRunID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]GateResult, 0)
	for rows.Next() {
		var item GateResult
		var detailsJSONRaw *string
		if err := rows.Scan(
			&item.ID,
			&item.IntegrationRunID,
			&item.GateType,
			&item.Status,
			&item.Summary,
			&detailsJSONRaw,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		item.DetailsJSON = parseJSONObjectJSON(detailsJSONRaw)
		items = append(items, item)
	}
	return items, rows.Err()
}

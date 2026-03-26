package task

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

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

func (r *Repository) FindSubTaskByID(ctx context.Context, subTaskID string) (*SubTask, error) {
	row := r.exec().QueryRowContext(ctx, `
		SELECT
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		FROM sub_tasks
		WHERE id = ?
	`, subTaskID)

	var item SubTask
	var dependencyJSON string
	var autoAssignedInt int64
	if err := row.Scan(
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
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	item.AutoAssigned = autoAssignedInt == 1
	if dependencyJSON != "" {
		_ = json.Unmarshal([]byte(dependencyJSON), &item.DependencyBranchSuffixes)
	}

	return &item, nil
}

func (r *Repository) UpdateSubTask(ctx context.Context, subTaskID string, input UpdateSubTaskInput) (*SubTask, error) {
	currentSubTask, err := r.FindSubTaskByID(ctx, subTaskID)
	if err != nil || currentSubTask == nil {
		return currentSubTask, err
	}

	nextSubTask := *currentSubTask
	nextSubTask.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	nextSubTask.Version++

	if input.SetDescription {
		nextSubTask.Description = derefOr(nextSubTask.Description, input.Description)
	}
	if input.SetBranchName {
		nextSubTask.BranchName = input.BranchName
	}
	if input.SetStartCommitSHA {
		nextSubTask.StartCommitSHA = input.StartCommitSHA
	}
	if input.SetWorktreePath {
		nextSubTask.WorktreePath = input.WorktreePath
	}
	if input.AgentType != nil {
		nextSubTask.AgentType = *input.AgentType
	}
	if input.Status != nil {
		nextSubTask.Status = *input.Status
	}
	if input.AutoAssigned != nil {
		nextSubTask.AutoAssigned = *input.AutoAssigned
	}
	if input.RetryCount != nil {
		nextSubTask.RetryCount = *input.RetryCount
	}
	if input.SetLastError {
		nextSubTask.LastError = input.LastError
	}
	if input.SetLatestReviewDecision {
		nextSubTask.LatestReviewDecision = input.LatestReviewDecision
	}
	if input.SetLatestReviewPhase {
		nextSubTask.LatestReviewPhase = input.LatestReviewPhase
	}
	if input.SetLatestReviewSummary {
		nextSubTask.LatestReviewSummary = input.LatestReviewSummary
	}
	if input.SetAssignmentSource {
		nextSubTask.AssignmentSource = input.AssignmentSource
	}
	if input.SetRunSummary {
		nextSubTask.RunSummary = input.RunSummary
	}

	dependencyJSONBytes, err := json.Marshal(nextSubTask.DependencyBranchSuffixes)
	if err != nil {
		return nil, err
	}

	autoAssignedInt := int64(0)
	if nextSubTask.AutoAssigned {
		autoAssignedInt = 1
	}

	_, err = r.exec().ExecContext(ctx, `
		UPDATE sub_tasks
		SET
			title = ?,
			description = ?,
			branch_suffix = ?,
			dependency_branch_suffixes_json = ?,
			branch_name = ?,
			start_commit_sha = ?,
			worktree_path = ?,
			agent_type = ?,
			status = ?,
			auto_assigned = ?,
			retry_count = ?,
			last_error = ?,
			latest_review_decision = ?,
			latest_review_phase = ?,
			latest_review_summary = ?,
			role = ?,
			display_name = ?,
			execution_order = ?,
			assignment_source = ?,
			run_summary = ?,
			version = ?,
			updated_at = ?
		WHERE id = ?
	`,
		nextSubTask.Title,
		nextSubTask.Description,
		nextSubTask.BranchSuffix,
		string(dependencyJSONBytes),
		nextSubTask.BranchName,
		nextSubTask.StartCommitSHA,
		nextSubTask.WorktreePath,
		nextSubTask.AgentType,
		nextSubTask.Status,
		autoAssignedInt,
		nextSubTask.RetryCount,
		nextSubTask.LastError,
		nextSubTask.LatestReviewDecision,
		nextSubTask.LatestReviewPhase,
		nextSubTask.LatestReviewSummary,
		nextSubTask.Role,
		nextSubTask.DisplayName,
		nextSubTask.ExecutionOrder,
		nextSubTask.AssignmentSource,
		nextSubTask.RunSummary,
		nextSubTask.Version,
		nextSubTask.UpdatedAt,
		subTaskID,
	)
	if err != nil {
		return nil, err
	}

	return &nextSubTask, nil
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

func (r *Repository) ListMergeRecordsBySubTaskID(ctx context.Context, subTaskID string) ([]MergeRecord, error) {
	rows, err := r.exec().QueryContext(ctx, `
		SELECT
			id, sub_task_id, attempt_number, operation, source_branch, target_branch, status,
			result_commit_sha, conflict_summary, completed_at, created_at, updated_at
		FROM merge_records
		WHERE sub_task_id = ?
		ORDER BY created_at ASC, id ASC
	`, subTaskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]MergeRecord, 0)
	for rows.Next() {
		var item MergeRecord
		if err := rows.Scan(
			&item.ID,
			&item.SubTaskID,
			&item.AttemptNumber,
			&item.Operation,
			&item.SourceBranch,
			&item.TargetBranch,
			&item.Status,
			&item.ResultCommitSHA,
			&item.ConflictSummary,
			&item.CompletedAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

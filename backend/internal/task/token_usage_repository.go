package task

import (
	"context"
	"strings"
	"time"

	"eat/backend/internal/tokenusage"
	"github.com/google/uuid"
)

type AccumulateSessionTokenUsageInput struct {
	SessionID    string
	TaskID       string
	ProjectID    string
	SubTaskID    *string
	AgentType    string
	InputTokens  int64
	OutputTokens int64
}

func (r *Repository) AccumulateSessionTokenUsage(ctx context.Context, input tokenusage.SessionInput) error {
	sessionID := strings.TrimSpace(input.SessionID)
	taskID := strings.TrimSpace(input.TaskID)
	projectID := strings.TrimSpace(input.ProjectID)
	agentType := tokenusage.NormalizeAgentType(input.AgentType)
	if sessionID == "" || taskID == "" || projectID == "" || agentType == "" {
		return nil
	}

	totalTokens := input.InputTokens + input.OutputTokens
	if input.InputTokens == 0 && input.OutputTokens == 0 {
		return nil
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := r.exec().ExecContext(ctx, `
		INSERT INTO session_token_usage (
			id,
			session_id,
			task_id,
			project_id,
			sub_task_id,
			agent_type,
			input_tokens,
			output_tokens,
			total_tokens,
			turn_count,
			created_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			input_tokens = session_token_usage.input_tokens + excluded.input_tokens,
			output_tokens = session_token_usage.output_tokens + excluded.output_tokens,
			total_tokens = session_token_usage.total_tokens + excluded.total_tokens,
			turn_count = session_token_usage.turn_count + 1,
			updated_at = excluded.updated_at
	`,
		uuid.NewString(),
		sessionID,
		taskID,
		projectID,
		input.SubTaskID,
		agentType,
		input.InputTokens,
		input.OutputTokens,
		totalTokens,
		now,
		now,
	)
	return err
}

func (r *Repository) attachTaskTokenSummaries(ctx context.Context, tasks []Task) ([]Task, error) {
	if len(tasks) == 0 {
		return tasks, nil
	}

	taskIDs := make([]string, 0, len(tasks))
	for _, taskRecord := range tasks {
		taskIDs = append(taskIDs, taskRecord.ID)
	}

	summaries, err := r.loadTaskTokenSummaries(ctx, taskIDs)
	if err != nil {
		return nil, err
	}

	decorated := make([]Task, 0, len(tasks))
	for _, taskRecord := range tasks {
		item := taskRecord
		item.Tokens = summaries[item.ID].Clone()
		decorated = append(decorated, item)
	}

	return decorated, nil
}

func (r *Repository) attachSingleTaskTokenSummary(ctx context.Context, taskRecord *Task) (*Task, error) {
	if taskRecord == nil {
		return nil, nil
	}

	summaries, err := r.loadTaskTokenSummaries(ctx, []string{taskRecord.ID})
	if err != nil {
		return nil, err
	}

	decorated := *taskRecord
	decorated.Tokens = summaries[taskRecord.ID].Clone()
	return &decorated, nil
}

func (r *Repository) loadTaskTokenSummaries(ctx context.Context, taskIDs []string) (map[string]tokenusage.Summary, error) {
	if len(taskIDs) == 0 {
		return map[string]tokenusage.Summary{}, nil
	}

	placeholders := make([]string, 0, len(taskIDs))
	args := make([]any, 0, len(taskIDs))
	for _, taskID := range taskIDs {
		normalized := strings.TrimSpace(taskID)
		if normalized == "" {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, normalized)
	}
	if len(placeholders) == 0 {
		return map[string]tokenusage.Summary{}, nil
	}

	rows, err := r.exec().QueryContext(ctx, `
		SELECT task_id, agent_type, COALESCE(SUM(total_tokens), 0) AS total_tokens
		FROM session_token_usage
		WHERE task_id IN (`+strings.Join(placeholders, ", ")+`)
		GROUP BY task_id, agent_type
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := make(map[string]tokenusage.Summary, len(taskIDs))
	for rows.Next() {
		var taskID string
		var agentType string
		var totalTokens int64
		if err := rows.Scan(&taskID, &agentType, &totalTokens); err != nil {
			return nil, err
		}
		if summaries[taskID] == nil {
			summaries[taskID] = tokenusage.Summary{}
		}
		summaries[taskID].Add(agentType, totalTokens)
	}

	return summaries, rows.Err()
}

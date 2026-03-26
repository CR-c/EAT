package project

import (
	"context"
	"strings"

	"eat/backend/internal/tokenusage"
)

func (r *Repository) attachProjectTokenSummaries(ctx context.Context, projects []Project) ([]Project, error) {
	if len(projects) == 0 {
		return projects, nil
	}

	projectIDs := make([]string, 0, len(projects))
	for _, projectRecord := range projects {
		projectIDs = append(projectIDs, projectRecord.ID)
	}

	summaries, err := r.loadProjectTokenSummaries(ctx, projectIDs)
	if err != nil {
		return nil, err
	}

	decorated := make([]Project, 0, len(projects))
	for _, projectRecord := range projects {
		item := projectRecord
		item.Tokens = summaries[item.ID].Clone()
		decorated = append(decorated, item)
	}

	return decorated, nil
}

func (r *Repository) attachSingleProjectTokenSummary(ctx context.Context, projectRecord *Project) (*Project, error) {
	if projectRecord == nil {
		return nil, nil
	}

	summaries, err := r.loadProjectTokenSummaries(ctx, []string{projectRecord.ID})
	if err != nil {
		return nil, err
	}

	decorated := *projectRecord
	decorated.Tokens = summaries[projectRecord.ID].Clone()
	return &decorated, nil
}

func (r *Repository) loadProjectTokenSummaries(ctx context.Context, projectIDs []string) (map[string]tokenusage.Summary, error) {
	if len(projectIDs) == 0 {
		return map[string]tokenusage.Summary{}, nil
	}

	placeholders := make([]string, 0, len(projectIDs))
	args := make([]any, 0, len(projectIDs))
	for _, projectID := range projectIDs {
		normalized := strings.TrimSpace(projectID)
		if normalized == "" {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, normalized)
	}
	if len(placeholders) == 0 {
		return map[string]tokenusage.Summary{}, nil
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT project_id, agent_type, COALESCE(SUM(total_tokens), 0) AS total_tokens
		FROM session_token_usage
		WHERE project_id IN (`+strings.Join(placeholders, ", ")+`)
		GROUP BY project_id, agent_type
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := make(map[string]tokenusage.Summary, len(projectIDs))
	for rows.Next() {
		var projectID string
		var agentType string
		var totalTokens int64
		if err := rows.Scan(&projectID, &agentType, &totalTokens); err != nil {
			return nil, err
		}
		if summaries[projectID] == nil {
			summaries[projectID] = tokenusage.Summary{}
		}
		summaries[projectID].Add(agentType, totalTokens)
	}

	return summaries, rows.Err()
}

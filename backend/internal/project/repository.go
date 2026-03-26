package project

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Project struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Path          string  `json:"path"`
	DefaultBranch string  `json:"defaultBranch"`
	Color         *string `json:"color,omitempty"`
	IsPinned      bool    `json:"isPinned"`
	PinnedOrder   *int64  `json:"pinnedOrder,omitempty"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			id,
			name,
			path,
			default_branch,
			color,
			is_pinned,
			pinned_order,
			created_at,
			updated_at
		FROM projects
		ORDER BY
			is_pinned DESC,
			CASE WHEN pinned_order IS NULL THEN 1 ELSE 0 END ASC,
			pinned_order ASC,
			name COLLATE NOCASE ASC,
			created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]Project, 0)
	for rows.Next() {
		var project Project
		if err := rows.Scan(
			&project.ID,
			&project.Name,
			&project.Path,
			&project.DefaultBranch,
			&project.Color,
			&project.IsPinned,
			&project.PinnedOrder,
			&project.CreatedAt,
			&project.UpdatedAt,
		); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (r *Repository) FindProjectByID(ctx context.Context, projectID string) (*Project, error) {
	return r.findOne(ctx, "WHERE id = ?", projectID)
}

func (r *Repository) FindProjectByPath(ctx context.Context, projectPath string) (*Project, error) {
	return r.findOne(ctx, "WHERE path = ?", projectPath)
}

func (r *Repository) CreateProject(ctx context.Context, input CreateProjectRecordInput) (*Project, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	project := &Project{
		ID:            uuid.NewString(),
		Name:          input.Name,
		Path:          input.Path,
		DefaultBranch: input.DefaultBranch,
		Color:         input.Color,
		IsPinned:      input.IsPinned,
		PinnedOrder:   input.PinnedOrder,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO projects (
			id,
			name,
			path,
			default_branch,
			color,
			is_pinned,
			pinned_order,
			created_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		project.ID,
		project.Name,
		project.Path,
		project.DefaultBranch,
		project.Color,
		project.IsPinned,
		project.PinnedOrder,
		project.CreatedAt,
		project.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return project, nil
}

type CreateProjectRecordInput struct {
	Name          string
	Path          string
	DefaultBranch string
	Color         *string
	IsPinned      bool
	PinnedOrder   *int64
}

type UpdateProjectPreferencesRecordInput struct {
	Color       *string
	SetColor    bool
	IsPinned    *bool
	PinnedOrder *int64
	SetPinned   bool
}

func (r *Repository) CountTasksByProjectID(ctx context.Context, projectID string) (int, error) {
	row := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE project_id = ?`, projectID)

	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func (r *Repository) CountTasksByProjectIDAndStatuses(ctx context.Context, projectID string, statuses []string) (int, error) {
	if len(statuses) == 0 {
		return 0, nil
	}

	placeholders := make([]string, 0, len(statuses))
	args := make([]any, 0, len(statuses)+1)
	args = append(args, projectID)
	for _, status := range statuses {
		placeholders = append(placeholders, "?")
		args = append(args, status)
	}

	query := `SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status IN (` + strings.Join(placeholders, ", ") + `)`
	row := r.db.QueryRowContext(ctx, query, args...)

	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func (r *Repository) CountActiveExecutionTasksByProjectID(ctx context.Context, projectID string, pausedReasonPrefix string) (int, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM tasks
		WHERE project_id = ?
		  AND (
			status IN ('EXECUTING', 'REVIEWING', 'MERGING')
			OR (status = 'ACTION_REQUIRED' AND (last_error IS NULL OR last_error NOT LIKE ?))
		  )
	`, projectID, pausedReasonPrefix+"%")

	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func (r *Repository) DeleteProject(ctx context.Context, projectID string) (*Project, error) {
	projectRecord, err := r.FindProjectByID(ctx, projectID)
	if err != nil || projectRecord == nil {
		return projectRecord, err
	}

	if _, err := r.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, projectID); err != nil {
		return nil, err
	}

	return projectRecord, nil
}

func (r *Repository) UpdateProjectPreferences(ctx context.Context, projectID string, input UpdateProjectPreferencesRecordInput) (*Project, error) {
	currentProject, err := r.FindProjectByID(ctx, projectID)
	if err != nil || currentProject == nil {
		return currentProject, err
	}

	nextProject := *currentProject
	nextProject.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if input.SetColor {
		nextProject.Color = input.Color
	}
	if input.SetPinned {
		if input.IsPinned != nil {
			nextProject.IsPinned = *input.IsPinned
		}
		nextProject.PinnedOrder = input.PinnedOrder
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE projects
		SET
			color = ?,
			is_pinned = ?,
			pinned_order = ?,
			updated_at = ?
		WHERE id = ?
	`,
		nextProject.Color,
		nextProject.IsPinned,
		nextProject.PinnedOrder,
		nextProject.UpdatedAt,
		projectID,
	)
	if err != nil {
		return nil, err
	}

	return &nextProject, nil
}

func (r *Repository) findOne(ctx context.Context, whereClause string, arg string) (*Project, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			id,
			name,
			path,
			default_branch,
			color,
			is_pinned,
			pinned_order,
			created_at,
			updated_at
		FROM projects
		`+whereClause,
		arg,
	)

	var project Project
	if err := row.Scan(
		&project.ID,
		&project.Name,
		&project.Path,
		&project.DefaultBranch,
		&project.Color,
		&project.IsPinned,
		&project.PinnedOrder,
		&project.CreatedAt,
		&project.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &project, nil
}

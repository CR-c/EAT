package project

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

type Project struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Path          string `json:"path"`
	DefaultBranch string `json:"defaultBranch"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
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
			created_at,
			updated_at
		FROM projects
		ORDER BY name COLLATE NOCASE ASC, created_at ASC
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

func (r *Repository) CreateProject(ctx context.Context, name, projectPath, defaultBranch string) (*Project, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	project := &Project{
		ID:            uuid.NewString(),
		Name:          name,
		Path:          projectPath,
		DefaultBranch: defaultBranch,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO projects (
			id,
			name,
			path,
			default_branch,
			created_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
	`,
		project.ID,
		project.Name,
		project.Path,
		project.DefaultBranch,
		project.CreatedAt,
		project.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return project, nil
}

func (r *Repository) findOne(ctx context.Context, whereClause string, arg string) (*Project, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			id,
			name,
			path,
			default_branch,
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

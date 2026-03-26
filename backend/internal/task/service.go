package task

import (
	"context"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/project"
)

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Service struct {
	repository        *Repository
	projectRepository *project.Repository
	agentService      *agent.Service
	bus               *eventbus.Bus
	uploadRootPath    string
	OnPlanApproved    func(ctx context.Context, taskID string) // Called after successful plan approval
}

type Dependencies struct {
	Repository        *Repository
	ProjectRepository *project.Repository
	AgentService      *agent.Service
	Bus               *eventbus.Bus
	UploadRootPath    string
}

func NewService(deps Dependencies) *Service {
	return &Service{
		repository:        deps.Repository,
		projectRepository: deps.ProjectRepository,
		agentService:      deps.AgentService,
		bus:               deps.Bus,
		uploadRootPath:    deps.UploadRootPath,
	}
}

func (s *Service) ListProjectTasks(ctx context.Context, projectID string, includeArchived bool) ([]Task, error) {
	tasks, err := s.repository.ListTasksByProjectID(ctx, projectID, includeArchived)
	if err != nil {
		return nil, err
	}
	return decorateTasks(tasks), nil
}

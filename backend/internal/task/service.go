package task

import (
	"context"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/project"
	"eat/backend/internal/sandbox"
)

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Service struct {
	repository          *Repository
	projectRepository   *project.Repository
	agentService        *agent.Service
	sandbox             *sandbox.Manager
	bus                 *eventbus.Bus
	uploadRootPath      string
	OnPlanApproved      func(ctx context.Context, taskID string) // Called after successful plan approval
	OnWorkerQueued      func(ctx context.Context, taskID string)
	OnIntegrationQueued func(ctx context.Context, taskID string)
}

type Dependencies struct {
	Repository        *Repository
	ProjectRepository *project.Repository
	AgentService      *agent.Service
	SandboxManager    *sandbox.Manager
	Bus               *eventbus.Bus
	UploadRootPath    string
}

func NewService(deps Dependencies) *Service {
	return &Service{
		repository:        deps.Repository,
		projectRepository: deps.ProjectRepository,
		agentService:      deps.AgentService,
		sandbox:           deps.SandboxManager,
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

func (s *Service) notifyWorkerQueued(taskID string) {
	if s.OnWorkerQueued == nil || taskID == "" {
		return
	}
	go s.OnWorkerQueued(context.Background(), taskID)
}

func (s *Service) notifyIntegrationQueued(taskID string) {
	if s.OnIntegrationQueued == nil || taskID == "" {
		return
	}
	go s.OnIntegrationQueued(context.Background(), taskID)
}

func (s *Service) defaultExecutionBackendStatus(ctx context.Context) sandbox.ExecutionBackendStatus {
	if s.sandbox == nil {
		return sandbox.ExecutionBackendStatus{
			Kind:         "docker",
			Available:    false,
			Default:      true,
			TrustLevel:   "SANDBOXED",
			Reason:       "worker backend is not configured",
			Dependencies: []string{"docker daemon"},
		}
	}
	backends := s.sandbox.ExecutionBackends(ctx)
	for _, backend := range backends {
		if backend.Default {
			return backend
		}
	}
	if len(backends) > 0 {
		return backends[0]
	}
	return sandbox.ExecutionBackendStatus{
		Kind:         "docker",
		Available:    false,
		Default:      true,
		TrustLevel:   "SANDBOXED",
		Reason:       "no execution backend is registered",
		Dependencies: []string{"docker daemon"},
	}
}

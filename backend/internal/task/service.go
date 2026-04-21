package task

import (
	"context"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/project"
	"eat/backend/internal/workerbackend"
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

func (s *Service) defaultExecutionBackendStatus(ctx context.Context) workerbackend.Status {
	backends := s.executionBackends(ctx)
	for _, backend := range backends {
		if backend.Default {
			return backend
		}
	}
	if len(backends) > 0 {
		return backends[0]
	}
	return workerbackend.Status{
		Kind:         workerbackend.KindDocker,
		Available:    false,
		Default:      true,
		TrustLevel:   "SANDBOXED",
		Reason:       "no execution backend is registered",
		Dependencies: []string{"docker daemon"},
	}
}

func (s *Service) executionBackends(ctx context.Context) []workerbackend.Status {
	if s == nil || s.agentService == nil {
		return nil
	}
	return s.agentService.ExecutionBackends(ctx)
}

func (s *Service) resolveTaskWorkerBackendKind(ctx context.Context, taskRecord *Task) string {
	if taskRecord != nil {
		if backendKind := workerbackend.NormalizeKind(derefString(taskRecord.WorkerBackendKind)); backendKind != "" {
			return backendKind
		}
	}
	backendKind := workerbackend.NormalizeKind(s.defaultExecutionBackendStatus(ctx).Kind)
	if backendKind == "" && s != nil && s.agentService != nil {
		backendKind = workerbackend.NormalizeKind(s.agentService.DefaultExecutionBackendKind())
	}
	if backendKind == "" {
		backendKind = workerbackend.KindDocker
	}
	return backendKind
}

func (s *Service) executionBackendStatusForTask(ctx context.Context, taskRecord *Task) workerbackend.Status {
	backendKind := s.resolveTaskWorkerBackendKind(ctx, taskRecord)
	for _, backend := range s.executionBackends(ctx) {
		if workerbackend.NormalizeKind(backend.Kind) == backendKind {
			return backend
		}
	}
	if backendKind == "" {
		return s.defaultExecutionBackendStatus(ctx)
	}
	return workerbackend.Status{
		Kind:      backendKind,
		Available: false,
		Reason:    "execution backend " + backendKind + " is not registered",
	}
}

func (s *Service) workerSessionSandboxTypeForTask(ctx context.Context, taskRecord *Task) string {
	backendKind := s.resolveTaskWorkerBackendKind(ctx, taskRecord)
	sandboxType := workerbackend.SessionSandboxTypeForKind(backendKind)
	if sandboxType == "" {
		return sessionSandboxDocker
	}
	return sandboxType
}

func (s *Service) defaultWorkerSessionSandboxType(ctx context.Context) string {
	return s.workerSessionSandboxTypeForTask(ctx, nil)
}

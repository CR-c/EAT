package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/project"
	"eat/backend/internal/sandbox"
	"eat/backend/internal/store"
	"eat/backend/internal/task"
)

type Dependencies struct {
	DB             *store.DB
	Bus            *eventbus.Bus
	UploadRootPath string
}

type Handler struct {
	db             *store.DB
	bus            *eventbus.Bus
	sandbox        *sandbox.Manager
	projectService *project.Service
	agentService   *agent.Service
	taskService    *task.Service
}

func NewHandler(deps Dependencies) *Handler {
	sandboxManager := sandbox.NewManager()
	uploadRootPath := filepath.Join(".", "uploads")
	if deps.UploadRootPath != "" {
		uploadRootPath = deps.UploadRootPath
	}

	return &Handler{
		db:             deps.DB,
		bus:            deps.Bus,
		sandbox:        sandboxManager,
		projectService: project.NewService(project.NewRepository(deps.DB.DB)),
		agentService:   agent.NewService(sandboxManager),
		taskService: task.NewService(task.Dependencies{
			Repository:        task.NewRepository(deps.DB.DB),
			ProjectRepository: project.NewRepository(deps.DB.DB),
			AgentService:      agent.NewService(sandboxManager),
			UploadRootPath:    uploadRootPath,
		}),
	}
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

func respondProjectError(w http.ResponseWriter, err *project.Error) {
	respondJSON(w, mapProjectErrorStatus(err.Code), map[string]any{
		"error": err,
	})
}

func respondTaskError(w http.ResponseWriter, err *task.Error) {
	respondJSON(w, mapTaskErrorStatus(err.Code), map[string]any{
		"error": err,
	})
}

func mapProjectErrorStatus(code string) int {
	switch code {
	case project.ErrorCodeProjectAlreadyRegistered:
		return http.StatusConflict
	case project.ErrorCodeProjectNotFound:
		return http.StatusNotFound
	case project.ErrorCodePathAccessDenied:
		return http.StatusForbidden
	default:
		return http.StatusBadRequest
	}
}

func mapTaskErrorStatus(code string) int {
	switch code {
	case task.ErrorCodeTaskNotFound:
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

func notImplemented(w http.ResponseWriter, scope string) {
	respondJSON(w, http.StatusNotImplemented, map[string]any{
		"error": map[string]any{
			"code":    "NOT_IMPLEMENTED",
			"message": scope + " is scaffolded in Go but not migrated yet.",
		},
	})
}

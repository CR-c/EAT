package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"eat/backend/internal/agent"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/metrics"
	"eat/backend/internal/preview"
	"eat/backend/internal/project"
	"eat/backend/internal/sandbox"
	"eat/backend/internal/store"
	"eat/backend/internal/task"
)

type Dependencies struct {
	DB             *store.DB
	Bus            *eventbus.Bus
	UploadRootPath string
	UIRootPath     string
	PreviewService *preview.Service
}

type Handler struct {
	db             *store.DB
	bus            *eventbus.Bus
	sandbox        *sandbox.Manager
	metricsService *metrics.Service
	previewService *preview.Service
	projectService *project.Service
	agentService   *agent.Service
	taskService    *task.Service
	uiRootPath     string
}

func NewHandler(deps Dependencies) *Handler {
	sandboxManager := sandbox.NewManager()
	uploadRootPath := filepath.Join(".", "uploads")
	if deps.UploadRootPath != "" {
		uploadRootPath = deps.UploadRootPath
	}
	uiRootPath := resolveUIRootPath(deps.UIRootPath)

	previewService := deps.PreviewService
	if previewService == nil {
		previewService = preview.NewService(preview.Dependencies{
			ProjectRepository: project.NewRepository(deps.DB.DB),
			TaskRepository:    task.NewRepository(deps.DB.DB),
			PreviewRootPath:   filepath.Join(".", ".eat-preview-worktrees"),
		})
	}

	return &Handler{
		db:             deps.DB,
		bus:            deps.Bus,
		sandbox:        sandboxManager,
		metricsService: metrics.NewService(deps.DB.DB),
		previewService: previewService,
		projectService: project.NewService(project.NewRepository(deps.DB.DB)),
		agentService:   agent.NewService(sandboxManager),
		uiRootPath:     uiRootPath,
		taskService: task.NewService(task.Dependencies{
			Repository:        task.NewRepository(deps.DB.DB),
			ProjectRepository: project.NewRepository(deps.DB.DB),
			AgentService:      agent.NewService(sandboxManager),
			Bus:               deps.Bus,
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

func decodeOptionalJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	err := json.NewDecoder(r.Body).Decode(target)
	if errors.Is(err, io.EOF) {
		return nil
	}
	return err
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

func respondPreviewError(w http.ResponseWriter, err *preview.Error) {
	respondJSON(w, mapPreviewErrorStatus(err.Code), map[string]any{
		"error": err,
	})
}

func mapProjectErrorStatus(code string) int {
	switch code {
	case project.ErrorCodeProjectAlreadyRegistered:
		return http.StatusConflict
	case project.ErrorCodeProjectHasTasksAttached:
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
	case task.ErrorCodeTaskNotFound, task.ErrorCodeProjectNotFound, task.ErrorCodePlanTemplateNotFound, task.ErrorCodeAttachmentPathNotFound, task.ErrorCodePlanSnapshotNotFound, task.ErrorCodeSubTaskNotFound, "INTEGRATION_RUN_NOT_FOUND", "INTEGRATION_QUEUE_ITEM_NOT_FOUND":
		return http.StatusNotFound
	case "TASK_APPROVAL_FAILED",
		"TASK_CREATE_FAILED",
		"TASK_CURRENT_PLAN_UPDATE_FAILED",
		"TASK_MESSAGES_READ_FAILED",
		"TASK_ATTACHMENTS_READ_FAILED",
		"TASK_GATE_RESULTS_READ_FAILED",
		"TASK_MERGE_RECORDS_READ_FAILED",
		"TASK_INTEGRATION_QUEUE_ITEM_READ_FAILED",
		"TASK_INTEGRATION_QUEUE_ITEMS_READ_FAILED",
		"TASK_INTEGRATION_RUN_READ_FAILED",
		"TASK_INTEGRATION_RUNS_READ_FAILED",
		"TASK_PLAN_SNAPSHOTS_READ_FAILED",
		"TASK_PLAN_SNAPSHOT_READ_FAILED",
		"TASK_READ_FAILED",
		"TASK_RESTORE_FAILED",
		"TASK_SESSIONS_READ_FAILED",
		"TASK_SESSION_UPDATE_FAILED",
		"TASK_SUBTASK_READ_FAILED",
		"TASK_SUBTASKS_READ_FAILED",
		"TASK_UPDATE_FAILED",
		"SUBTASK_CANCEL_FAILED",
		"SUBTASK_CHANGE_AGENT_FAILED",
		"SUBTASK_CONFIRM_DISCARD_FAILED",
		"SUBTASK_REASSIGN_FAILED",
		"SUBTASK_REBASE_RETRY_FAILED",
		"SUBTASK_RETRY_FAILED",
		"SUBTASK_REWORK_FAILED",
		"INTEGRATION_DEQUEUE_FAILED",
		"INTEGRATION_ROLLBACK_FAILED",
		"INTEGRATION_RUN_CREATE_FAILED",
		"PLAN_SERIALIZATION_FAILED",
		"PLAN_SNAPSHOT_CREATE_FAILED",
		"PROJECT_READ_FAILED":
		return http.StatusInternalServerError
	default:
		return http.StatusBadRequest
	}
}

func mapPreviewErrorStatus(code string) int {
	switch code {
	case preview.ErrorCodeTaskNotFound, preview.ErrorCodeProjectNotFound, preview.ErrorCodePreviewTargetNotFound:
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

func resolveUIRootPath(explicitPath string) string {
	candidates := make([]string, 0, 5)
	if explicitPath != "" {
		candidates = append(candidates, explicitPath)
	}
	candidates = append(candidates,
		filepath.Join(".", "..", "web", "dist"),
		filepath.Join("..", "web", "dist"),
		filepath.Join("..", "..", "web", "dist"),
		filepath.Join("..", "..", "..", "web", "dist"),
		filepath.Join(".", "src", "ui"),
		filepath.Join("..", "src", "ui"),
		filepath.Join("..", "..", "src", "ui"),
		filepath.Join("..", "..", "..", "src", "ui"),
	)

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
			return candidate
		}
	}

	return ""
}

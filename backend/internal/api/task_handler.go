package api

import (
	"net/http"

	"eat/backend/internal/task"
	"eat/backend/internal/tasktemplates"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) ListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"templates": tasktemplates.List(),
	})
}
func (h *Handler) CreateGuidedTask(w http.ResponseWriter, r *http.Request) {
	var input task.CreateGuidedTaskRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.CreateGuidedTask(r.Context(), input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	var input task.CreateTaskRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.CreateTask(r.Context(), input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}
func (h *Handler) ListProjectTasks(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	tasks, err := h.taskService.ListProjectTasks(r.Context(), projectID, r.URL.Query().Get("includeArchived") == "1")
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "TASK_LIST_FAILED",
				"message": err.Error(),
			},
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"tasks": tasks,
	})
}
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")
	detail, serviceError := h.taskService.GetTask(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}
	respondJSON(w, http.StatusOK, detail)
}
func (h *Handler) GetTaskTeam(w http.ResponseWriter, r *http.Request) { notImplemented(w, "task team") }
func (h *Handler) GetTaskBoard(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task board")
}
func (h *Handler) StartClarification(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "clarification start")
}
func (h *Handler) SendTaskMessage(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task messaging")
}
func (h *Handler) StopLeadSession(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "lead session stop")
}
func (h *Handler) ConfirmRequirements(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "requirements confirmation")
}
func (h *Handler) SendMailboxMessage(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "mailbox message")
}
func (h *Handler) UpdateCurrentPlan(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input tasktemplates.Plan
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.UpdateCurrentPlan(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) PlanSeed(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.PlanSeedRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.ApplyPlanSeed(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ApprovePlan(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.ApprovePlan(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ArchiveTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task archive")
}
func (h *Handler) UnarchiveTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task unarchive")
}
func (h *Handler) PauseTask(w http.ResponseWriter, r *http.Request) { notImplemented(w, "task pause") }
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task deletion")
}
func (h *Handler) ResumeTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task resume")
}
func (h *Handler) RestorePlanSnapshot(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.RestorePlanSnapshotRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.RestorePlanSnapshot(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}

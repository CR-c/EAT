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
func (h *Handler) GetTaskTeam(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.GetTaskTeam(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) GetTaskBoard(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.GetTaskBoard(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) StartClarification(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.StartClarificationRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.StartClarification(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) SendTaskMessage(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.SendTaskMessageRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.SendTaskMessage(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}
func (h *Handler) StopLeadSession(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.StopLeadSession(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ConfirmRequirements(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.ConfirmRequirements(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) SendMailboxMessage(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.SendMailboxMessageRequest
	if err := decodeJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.SendMailboxMessage(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
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
	taskID := chi.URLParam(r, "taskId")

	var input task.ArchiveTaskRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.ArchiveTask(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	if h.previewService != nil {
		_, _ = h.previewService.StopTaskPreview(r.Context(), taskID)
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) UnarchiveTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.UnarchiveTask(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) PauseTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.PauseTask(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	if h.previewService != nil {
		_, _ = h.previewService.StopTaskPreview(r.Context(), taskID)
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var input task.DeleteTaskRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.DeleteTask(r.Context(), taskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	if h.previewService != nil {
		_, _ = h.previewService.StopTaskPreview(r.Context(), taskID)
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ResumeTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.ResumeTask(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
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

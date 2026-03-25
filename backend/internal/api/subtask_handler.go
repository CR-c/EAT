package api

import (
	"net/http"

	"eat/backend/internal/task"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) RetrySubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	var input task.RetrySubTaskRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.RetrySubTask(r.Context(), subTaskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ReworkSubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	var input task.ReworkSubTaskRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.ReworkSubTask(r.Context(), subTaskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) CancelSubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	result, serviceError := h.taskService.CancelSubTask(r.Context(), subTaskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ReassignSubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	var input task.ReassignSubTaskRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.ReassignSubTask(r.Context(), subTaskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ChangeSubTaskAgent(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	var input task.ChangeSubTaskAgentRequest
	if err := decodeOptionalJSON(r, &input); err != nil {
		respondTaskError(w, &task.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}

	result, serviceError := h.taskService.ChangeSubTaskAgent(r.Context(), subTaskID, input)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) ConfirmDiscardSubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	result, serviceError := h.taskService.ConfirmDiscardSubTask(r.Context(), subTaskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) RebaseRetrySubTask(w http.ResponseWriter, r *http.Request) {
	subTaskID := chi.URLParam(r, "subTaskId")

	result, serviceError := h.taskService.RebaseRetrySubTask(r.Context(), subTaskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}

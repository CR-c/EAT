package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) StartIntegrationRun(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	result, serviceError := h.taskService.StartIntegrationRun(r.Context(), taskID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}
func (h *Handler) RetryIntegrationRun(w http.ResponseWriter, r *http.Request) {
	integrationRunID := chi.URLParam(r, "integrationRunId")

	result, serviceError := h.taskService.RetryIntegrationRun(r.Context(), integrationRunID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) RollbackIntegrationRun(w http.ResponseWriter, r *http.Request) {
	integrationRunID := chi.URLParam(r, "integrationRunId")

	result, serviceError := h.taskService.RollbackIntegrationRun(r.Context(), integrationRunID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) DequeueIntegrationQueueItem(w http.ResponseWriter, r *http.Request) {
	integrationQueueItemID := chi.URLParam(r, "integrationQueueItemId")

	result, serviceError := h.taskService.DequeueIntegrationQueueItem(r.Context(), integrationQueueItemID)
	if serviceError != nil {
		respondTaskError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}

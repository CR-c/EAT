package api

import (
	"net/http"

	"eat/backend/internal/preview"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetTaskPreview(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")
	result, serviceError := h.previewService.GetTaskPreview(r.Context(), taskID)
	if serviceError != nil {
		respondPreviewError(w, serviceError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *Handler) StartTaskPreview(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")
	var input preview.StartTaskPreviewRequest
	if err := decodeJSON(r, &input); err != nil {
		respondPreviewError(w, &preview.Error{
			Code:    "INVALID_REQUEST_BODY",
			Message: "Request body must be valid JSON.",
		})
		return
	}
	result, serviceError := h.previewService.StartTaskPreview(r.Context(), taskID, input)
	if serviceError != nil {
		respondPreviewError(w, serviceError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *Handler) StopTaskPreview(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")
	result, serviceError := h.previewService.StopTaskPreview(r.Context(), taskID)
	if serviceError != nil {
		respondPreviewError(w, serviceError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

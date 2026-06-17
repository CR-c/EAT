package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetSessionOutput(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	result, taskErr := h.taskService.GetSessionOutput(r.Context(), sessionID, r.URL.Query().Get("taskId"))
	if taskErr != nil {
		respondTaskError(w, taskErr)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"sessionId": result.SessionID,
		"output":    result.Output,
		"truncated": result.Truncated,
	})
}

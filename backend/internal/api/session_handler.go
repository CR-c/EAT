package api

import (
	"net/http"

	"eat/backend/internal/task"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetSessionOutput(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	repository := task.NewRepository(h.db.DB)
	session, err := repository.FindSessionByID(r.Context(), sessionID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "TASK_SESSIONS_READ_FAILED",
				"message": err.Error(),
			},
		})
		return
	}
	if session == nil {
		respondTaskError(w, &task.Error{
			Code:    "SESSION_NOT_FOUND",
			Message: "Session not found.",
			Details: map[string]any{
				"sessionId": sessionID,
			},
		})
		return
	}

	// Mirror AppendSessionOutput's default cap (session_repository.go): an unset
	// OutputBufferMaxBytes (<=0) is still trimmed to 64KiB, so the truncation
	// check must use the same effective cap rather than the raw column.
	effectiveMax := session.OutputBufferMaxBytes
	if effectiveMax <= 0 {
		effectiveMax = 65536
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"sessionId": session.ID,
		"output":    session.OutputBuffer,
		"truncated": int64(len(session.OutputBuffer)) >= effectiveMax,
	})
}

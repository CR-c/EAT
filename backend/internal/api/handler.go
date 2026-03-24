package api

import (
	"encoding/json"
	"net/http"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/sandbox"
	"eat/backend/internal/store"
)

type Dependencies struct {
	DB  *store.DB
	Bus *eventbus.Bus
}

type Handler struct {
	db      *store.DB
	bus     *eventbus.Bus
	sandbox *sandbox.Manager
}

func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		db:      deps.DB,
		bus:     deps.Bus,
		sandbox: sandbox.NewManager(),
	}
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func notImplemented(w http.ResponseWriter, scope string) {
	respondJSON(w, http.StatusNotImplemented, map[string]any{
		"error": map[string]any{
			"code":    "NOT_IMPLEMENTED",
			"message": scope + " is scaffolded in Go but not migrated yet.",
		},
	})
}

package api

import (
	"net/http"
	"runtime"
	"time"
)

func (h *Handler) HandleRoot(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"name":   "eat-backend",
		"status": "ok",
	})
}

func (h *Handler) SystemHealth(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"status":         "healthy",
		"db":             "ok",
		"uptime_seconds": 0,
		"goroutines":     runtime.NumGoroutine(),
		"checked_at":     time.Now().UTC().Format(time.RFC3339Nano),
		"workers": map[string]any{
			"running":   0,
			"pool_size": 0,
		},
		"docker": h.sandbox.DockerHealth(r.Context()),
	})
}

func (h *Handler) DockerHealth(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.sandbox.DockerHealth(r.Context()))
}

func (h *Handler) SandboxPolicy(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.sandbox.Policy())
}

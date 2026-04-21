package api

import (
	"net/http"
	"runtime"
	"time"

	"eat/backend/internal/workerbackend"
)

func (h *Handler) SystemHealth(w http.ResponseWriter, r *http.Request) {
	workerStats := map[string]int{
		"running":   0,
		"pool_size": 0,
	}
	if h.orchestrator != nil {
		workerStats = h.orchestrator.WorkerStats()
	}

	uptimeSeconds := int64(0)
	if !h.startedAt.IsZero() {
		uptimeSeconds = int64(time.Since(h.startedAt).Seconds())
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"status":         "healthy",
		"db":             "ok",
		"uptime_seconds": uptimeSeconds,
		"goroutines":     runtime.NumGoroutine(),
		"checked_at":     time.Now().UTC().Format(time.RFC3339Nano),
		"workers": map[string]any{
			"running":   workerStats["running"],
			"pool_size": workerStats["pool_size"],
		},
		"docker": h.sandbox.DockerHealth(r.Context()),
	})
}

func (h *Handler) DockerHealth(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.sandbox.DockerHealth(r.Context()))
}

func (h *Handler) ExecutionBackends(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"backends": h.agentService.ExecutionBackends(r.Context()),
	})
}

func (h *Handler) SandboxPolicy(w http.ResponseWriter, r *http.Request) {
	policy := h.sandbox.Policy()
	if h.agentService != nil {
		if sandboxType := workerbackend.SessionSandboxTypeForKind(h.agentService.DefaultExecutionBackendKind()); sandboxType != "" {
			policy.WorkerDefault = sandboxType
			policy.PreviewDefault = sandboxType
		}
	}
	respondJSON(w, http.StatusOK, policy)
}

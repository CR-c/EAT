package api

import (
	"net/http"
	"time"

	"eat/backend/internal/agent"
)

func (h *Handler) ListAgents(w http.ResponseWriter, r *http.Request) {
	descriptors := h.agentService.ListAgents()
	healthSnapshots := h.agentService.GetHealth(r.Context())
	checkedAt := time.Now().UTC().Format(time.RFC3339Nano)

	respondJSON(w, http.StatusOK, map[string]any{
		"agents":           descriptors,
		"checkedAt":        checkedAt,
		"leadCandidates":   buildSelectionCandidates(descriptors, healthSnapshots, true),
		"workerCandidates": buildSelectionCandidates(descriptors, healthSnapshots, false),
	})
}

func (h *Handler) AgentHealth(w http.ResponseWriter, r *http.Request) {
	descriptors := h.agentService.ListAgents()
	healthSnapshots := h.agentService.GetHealth(r.Context())
	checkedAt := time.Now().UTC().Format(time.RFC3339Nano)
	staleAt := time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339Nano)

	respondJSON(w, http.StatusOK, map[string]any{
		"agents":           healthSnapshots,
		"checkedAt":        checkedAt,
		"leadCandidates":   buildSelectionCandidates(descriptors, healthSnapshots, true),
		"staleAt":          staleAt,
		"ttlMs":            30_000,
		"workerCandidates": buildSelectionCandidates(descriptors, healthSnapshots, false),
	})
}

func buildSelectionCandidates(descriptors []agent.Descriptor, healthSnapshots map[string]agent.HealthSnapshot, lead bool) []map[string]any {
	result := make([]map[string]any, 0)
	for _, descriptor := range descriptors {
		if lead && !descriptor.Capabilities.CanOrchestrate {
			continue
		}
		if !lead && !descriptor.Capabilities.CanExecute {
			continue
		}

		health := healthSnapshots[descriptor.Name]
		result = append(result, map[string]any{
			"agentName":     descriptor.Name,
			"available":     health.Available,
			"capabilities":  descriptor.Capabilities,
			"failureReason": health.FailureReason,
			"runtimeMode":   health.RuntimeMode,
			"selectable":    health.Available && health.RuntimeMode != "STUB",
		})
	}

	return result
}

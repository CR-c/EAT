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
		roleAvailable := health.ExecutionAvailable
		roleFailureReason := health.ExecutionFailureReason
		if lead {
			roleAvailable = health.OrchestrationAvailable
			roleFailureReason = health.OrchestrationFailureReason
		}
		if roleFailureReason == nil {
			roleFailureReason = health.FailureReason
		}
		result = append(result, map[string]any{
			"agentName":              descriptor.Name,
			"available":              roleAvailable,
			"capabilities":           descriptor.Capabilities,
			"executionAvailable":     health.ExecutionAvailable,
			"failureReason":          roleFailureReason,
			"orchestrationAvailable": health.OrchestrationAvailable,
			"runtimeMode":            health.RuntimeMode,
			"selectable":             roleAvailable && health.RuntimeMode != "STUB",
		})
	}

	return result
}

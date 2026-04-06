package api

import (
	"context"
	"encoding/json"
	"testing"

	"eat/backend/internal/agent"
)

func newFakeLeadAgentService(t *testing.T, reply string) *agent.Service {
	t.Helper()

	service := agent.NewService(nil)
	service.SetLeadTurnRunner("codex-cli", func(ctx context.Context, config agent.LeadTurnConfig) (*agent.LeadTurnResult, error) {
		t.Helper()

		eventPayload, err := json.Marshal(map[string]any{
			"type": "item.completed",
			"item": map[string]any{
				"type": "agent_message",
				"text": reply,
			},
		})
		if err != nil {
			t.Fatalf("marshal fake lead payload: %v", err)
		}

		return &agent.LeadTurnResult{
			Response:  reply,
			RawOutput: string(eventPayload) + "\n",
		}, nil
	})

	return service
}

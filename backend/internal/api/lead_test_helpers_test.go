package api

import (
	"context"
	"encoding/json"
	"testing"

	"eat/backend/internal/agent"
	"eat/backend/internal/sandbox"
	"eat/backend/internal/workerbackend"
)

func newFakeLeadAgentService(t *testing.T, reply string) *agent.Service {
	return newFakeLeadAgentServiceWithSandbox(t, nil, reply)
}

func newFakeLeadAgentServiceWithSandbox(t *testing.T, sandboxManager *sandbox.Manager, reply string) *agent.Service {
	t.Helper()

	service := agent.NewService(sandboxManager)
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

func newUnavailableSandboxManager() *sandbox.Manager {
	manager := sandbox.NewManager()
	manager.WorkerImage = "eat/nonexistent:missing"
	return manager
}

type alwaysAvailableExecutionBackend struct{}

func (alwaysAvailableExecutionBackend) Kind() string { return workerbackend.KindDocker }

func (alwaysAvailableExecutionBackend) Status(context.Context) workerbackend.Status {
	return workerbackend.Status{
		Kind:       workerbackend.KindDocker,
		Available:  true,
		Default:    true,
		TrustLevel: "SANDBOXED",
	}
}

func (alwaysAvailableExecutionBackend) StartWorker(context.Context, workerbackend.StartWorkerInput) (workerbackend.RuntimeSession, error) {
	return nil, nil
}

package agent

import (
	"context"
	"testing"

	"eat/backend/internal/workerbackend"
)

type captureBackend struct {
	lastInput workerbackend.StartWorkerInput
}

func (b *captureBackend) Kind() string { return workerbackend.KindDocker }

func (b *captureBackend) Status(context.Context) workerbackend.Status {
	return workerbackend.Status{Kind: workerbackend.KindDocker, Available: true, Default: true, TrustLevel: "SANDBOXED"}
}

func (b *captureBackend) StartWorker(_ context.Context, input workerbackend.StartWorkerInput) (workerbackend.RuntimeSession, error) {
	b.lastInput = input
	return captureRuntime{}, nil
}

type captureRuntime struct{}

func (captureRuntime) OnOutput(func(string)) {}
func (captureRuntime) OnExit(func(int))      {}
func (captureRuntime) Stop() error           { return nil }
func (captureRuntime) Kill() error           { return nil }
func (captureRuntime) Metadata() workerbackend.RuntimeMetadata {
	return workerbackend.RuntimeMetadata{BackendKind: workerbackend.KindDocker}
}

func TestSpawnCodexWorkerPassesOpenAIAPIKeyToExecutionBackend(t *testing.T) {
	t.Setenv("EAT_CODEX_PACKAGE_PATH", t.TempDir())
	t.Setenv("EAT_CODEX_RUNTIME_ROOT", t.TempDir())
	t.Setenv("OPENAI_API_KEY", "test-openai-key")

	backend := &captureBackend{}
	runtime, err := spawnCodexWorker(context.Background(), backend, SpawnConfig{
		Prompt:  "test prompt",
		WorkDir: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("spawn codex worker: %v", err)
	}
	if runtime == nil {
		t.Fatal("expected runtime session")
	}
	if backend.lastInput.Env["OPENAI_API_KEY"] != "test-openai-key" {
		t.Fatalf("expected OPENAI_API_KEY to be forwarded, got %#v", backend.lastInput.Env)
	}
}

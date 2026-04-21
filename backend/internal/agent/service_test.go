package agent

import (
	"context"
	"os"
	"path/filepath"
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
		Prompt:           "test prompt",
		WorkDir:          t.TempDir(),
		ExecutionProfile: "internet",
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
	if backend.lastInput.NetworkProfile != "DEFAULT" {
		t.Fatalf("expected executionProfile=internet to map to DEFAULT network, got %#v", backend.lastInput.NetworkProfile)
	}
}

func TestCodexHealthRequiresWorkerPackageEntrypointForExecutionReadiness(t *testing.T) {
	binDir := t.TempDir()
	writeExecutable(t, filepath.Join(binDir, "codex"), "#!/bin/sh\nexit 0\n")
	writeExecutable(t, filepath.Join(binDir, "node"), "#!/bin/sh\nexit 0\n")
	t.Setenv("PATH", binDir)
	t.Setenv("OPENAI_API_KEY", "test-openai-key")
	t.Setenv("EAT_CODEX_PACKAGE_PATH", filepath.Join(t.TempDir(), "missing-codex-package"))

	snapshot := codexHealth(nil)
	if !snapshot.OrchestrationAvailable {
		t.Fatalf("expected codex orchestration to stay available, got %#v", snapshot)
	}
	if snapshot.ExecutionAvailable {
		t.Fatalf("expected codex execution to fail without package entrypoint, got %#v", snapshot)
	}
	if snapshot.ExecutionFailureReason == nil || snapshot.ExecutionFailureReason.Code != "RUNTIME_DEPENDENCY_MISSING" {
		t.Fatalf("unexpected execution failure reason: %#v", snapshot.ExecutionFailureReason)
	}
}

func TestClaudeHealthIgnoresWorkerCommandOverrideWithoutBinary(t *testing.T) {
	binDir := t.TempDir()
	t.Setenv("PATH", binDir)
	t.Setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
	t.Setenv("EAT_CLAUDE_WORKER_COMMAND", "claude")

	snapshot := claudeHealth(nil)
	if snapshot.OrchestrationAvailable || snapshot.ExecutionAvailable {
		t.Fatalf("expected claude health to fail without binary, got %#v", snapshot)
	}
	if snapshot.OrchestrationFailureReason == nil || snapshot.OrchestrationFailureReason.Code != "BINARY_MISSING" {
		t.Fatalf("unexpected orchestration failure reason: %#v", snapshot.OrchestrationFailureReason)
	}
}

func TestGeminiHealthRequiresWorkerPackageRootForExecutionReadiness(t *testing.T) {
	rootDir := t.TempDir()
	binDir := filepath.Join(rootDir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatalf("mkdir bin dir: %v", err)
	}
	writeExecutable(t, filepath.Join(binDir, "gemini"), "#!/bin/sh\nexit 0\n")
	writeExecutable(t, filepath.Join(binDir, "node"), "#!/bin/sh\nexit 0\n")
	t.Setenv("PATH", binDir)
	t.Setenv("GEMINI_API_KEY", "test-gemini-key")

	snapshot := geminiHealth(nil)
	if !snapshot.OrchestrationAvailable {
		t.Fatalf("expected gemini orchestration to stay available, got %#v", snapshot)
	}
	if snapshot.ExecutionAvailable {
		t.Fatalf("expected gemini execution to fail without package root, got %#v", snapshot)
	}
	if snapshot.ExecutionFailureReason == nil || snapshot.ExecutionFailureReason.Code != "RUNTIME_DEPENDENCY_MISSING" {
		t.Fatalf("unexpected execution failure reason: %#v", snapshot.ExecutionFailureReason)
	}
}

func writeExecutable(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write executable %s: %v", path, err)
	}
}

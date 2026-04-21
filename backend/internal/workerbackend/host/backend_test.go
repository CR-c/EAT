package host

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/workerbackend"
)

func TestStatusReflectsDisabledBackend(t *testing.T) {
	status := New(false).Status(context.Background())
	if status.Available {
		t.Fatalf("expected disabled host backend to be unavailable: %#v", status)
	}
	if status.TrustLevel != "REDUCED_ISOLATION" {
		t.Fatalf("unexpected trust level: %#v", status)
	}
}

func TestAllowedWorkDirDefaultsToEatWorktreesRoot(t *testing.T) {
	allowed := filepath.Join(os.TempDir(), defaultWorktreeRootName, "repo-a", "task-1")
	if err := os.MkdirAll(allowed, 0o755); err != nil {
		t.Fatalf("mkdir allowed workdir: %v", err)
	}
	if !isAllowedWorkDir(allowed) {
		t.Fatalf("expected workdir under default worktree root to be allowed: %s", allowed)
	}
}

func TestAllowedWorkDirHonorsExtraRootsEnv(t *testing.T) {
	extra := t.TempDir()
	t.Setenv(AllowedRootsEnvVar, extra)
	candidate := filepath.Join(extra, "nested")
	if err := os.MkdirAll(candidate, 0o755); err != nil {
		t.Fatalf("mkdir candidate: %v", err)
	}
	if !isAllowedWorkDir(candidate) {
		t.Fatalf("expected candidate under extra root to be allowed: %s", candidate)
	}
}

func TestStartWorkerRejectsWorkDirOutsideAllowedRoots(t *testing.T) {
	backend := New(true)
	workDir := t.TempDir()
	if strings.Contains(workDir, defaultWorktreeRootName) {
		t.Fatalf("temp dir unexpectedly under default worktree root: %s", workDir)
	}
	_, err := backend.StartWorker(context.Background(), workerbackend.StartWorkerInput{
		WorkDir: workDir,
		Command: []string{"/bin/sh", "-lc", "echo ok"},
	})
	if err == nil || !strings.Contains(err.Error(), "only allows workdirs under orchestrator-managed roots") {
		t.Fatalf("expected host backend to reject arbitrary workdir, got %v", err)
	}
}

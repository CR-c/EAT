package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCLIHealthClaudeRequiresAuth(t *testing.T) {
	home := t.TempDir()
	binDir := t.TempDir()
	writeFakeBinary(t, filepath.Join(binDir, "claude"))

	t.Setenv("HOME", home)
	t.Setenv("PATH", joinPath(binDir, os.Getenv("PATH")))
	t.Setenv("ANTHROPIC_API_KEY", "")

	snapshot := cliHealth("claude-cli", "claude", nil)
	if snapshot.Available {
		t.Fatalf("expected claude health to fail without auth")
	}
	if snapshot.FailureReason == nil || snapshot.FailureReason.Code != "AUTH_MISSING" {
		t.Fatalf("expected AUTH_MISSING failure, got %#v", snapshot.FailureReason)
	}
	if check := findHealthCheck(snapshot.Checks, "auth"); check == nil || check.Status != "FAIL" {
		t.Fatalf("expected auth check to fail, got %#v", snapshot.Checks)
	}
}

func TestCLIHealthGeminiAvailableWithAccountFile(t *testing.T) {
	home := t.TempDir()
	binDir := t.TempDir()
	writeFakeBinary(t, filepath.Join(binDir, "gemini"))

	accountPath := filepath.Join(home, ".gemini", "google_accounts.json")
	if err := os.MkdirAll(filepath.Dir(accountPath), 0o755); err != nil {
		t.Fatalf("mkdir auth dir: %v", err)
	}
	if err := os.WriteFile(accountPath, []byte(`{"accounts":[]}`), 0o600); err != nil {
		t.Fatalf("write auth file: %v", err)
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", joinPath(binDir, os.Getenv("PATH")))
	t.Setenv("GOOGLE_API_KEY", "")
	t.Setenv("GEMINI_API_KEY", "")

	snapshot := cliHealth("gemini-cli", "gemini", nil)
	if !snapshot.Available {
		t.Fatalf("expected gemini health to pass with auth file, got %#v", snapshot)
	}
	if check := findHealthCheck(snapshot.Checks, "auth"); check == nil || check.Status != "PASS" {
		t.Fatalf("expected auth check to pass, got %#v", snapshot.Checks)
	}
}

func TestResolveGeminiPackageRoot(t *testing.T) {
	root := t.TempDir()
	scriptPath := filepath.Join(root, "dist", "index.js")

	if err := os.MkdirAll(filepath.Dir(scriptPath), 0o755); err != nil {
		t.Fatalf("mkdir dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte(`{"name":"gemini-cli"}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
	if err := os.WriteFile(scriptPath, []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatalf("write script: %v", err)
	}

	packageRoot, err := resolveGeminiPackageRoot(scriptPath)
	if err != nil {
		t.Fatalf("resolve package root: %v", err)
	}
	if packageRoot != root {
		t.Fatalf("expected package root %s, got %s", root, packageRoot)
	}
}

func writeFakeBinary(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake binary %s: %v", path, err)
	}
}

func joinPath(prefix, existing string) string {
	if strings.TrimSpace(existing) == "" {
		return prefix
	}
	return prefix + string(os.PathListSeparator) + existing
}

func findHealthCheck(checks []HealthCheck, name string) *HealthCheck {
	for i := range checks {
		if checks[i].Name == name {
			return &checks[i]
		}
	}
	return nil
}

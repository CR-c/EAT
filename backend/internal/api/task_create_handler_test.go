package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestCreateTaskEndpointPersistsTaskAndAttachments(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "task-repo", "main")
	attachmentPath := filepath.Join(tempDir, "brief.md")
	if err := os.WriteFile(attachmentPath, []byte("# brief\n"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-1', 'Project One', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"projectId":     "project-1",
		"title":         "Lead clarification",
		"description":   "Clarify the implementation scope.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
		"attachments": []map[string]any{
			{
				"fileName": "brief.md",
				"filePath": attachmentPath,
				"fileType": "DOCUMENT",
				"mimeType": "text/markdown",
			},
		},
	})

	request := httptest.NewRequest(http.MethodPost, "/api/tasks", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected create task status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	taskPayload := payload["task"].(map[string]any)
	if taskPayload["status"] != "DRAFT" {
		t.Fatalf("unexpected task status: %#v", taskPayload["status"])
	}
	if len(payload["attachments"].([]any)) != 1 {
		t.Fatalf("unexpected attachments: %#v", payload["attachments"])
	}

	if _, err := exec.CommandContext(context.Background(), "git", "-C", repoPath, "rev-parse", "eat-Lead-clarification^{commit}").CombinedOutput(); err != nil {
		t.Fatalf("expected task branch to exist: %v", err)
	}
}

func TestCreateTaskEndpointAcceptsCustomTaskBranchName(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "task-custom-branch-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-custom-branch', 'Project Branch', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":      "project-custom-branch",
		"title":          "Branch override",
		"description":    "Use explicit task branch.",
		"leadAgentType":  "codex-cli",
		"baseBranch":     "main",
		"taskBranchName": "feature/task-override",
	})
	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected create task status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	taskPayload := payload["task"].(map[string]any)
	if taskPayload["taskBranchName"] != "feature/task-override" {
		t.Fatalf("unexpected taskBranchName: %#v", taskPayload["taskBranchName"])
	}
	if _, err := exec.CommandContext(context.Background(), "git", "-C", repoPath, "rev-parse", "feature/task-override^{commit}").CombinedOutput(); err != nil {
		t.Fatalf("expected custom task branch to exist: %v", err)
	}
}

func TestCreateTaskEndpointAllowsLeadOnlyModeWhenWorkerBackendIsUnavailable(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "task-lead-only-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-lead-only', 'Lead Only Project', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	sandboxManager := newUnavailableSandboxManager()
	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: sandboxManager,
		AgentService:   newFakeLeadAgentServiceWithSandbox(t, sandboxManager, "已收到。"),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":     "project-lead-only",
		"title":         "Lead only mode",
		"description":   "Allow task creation without a ready worker backend.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
	})
	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected create task status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["task"].(map[string]any)["status"] != "DRAFT" {
		t.Fatalf("unexpected task payload: %#v", payload["task"])
	}
}

func TestCreateTaskEndpointRejectsInvalidExecutionProfile(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "task-invalid-profile-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-invalid-profile', 'Invalid Profile Project', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":        "project-invalid-profile",
		"title":            "Invalid profile",
		"description":      "Should fail fast on unknown executionProfile.",
		"leadAgentType":    "codex-cli",
		"baseBranch":       "main",
		"executionProfile": "preview-default",
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["error"].(map[string]any)["code"] != "EXECUTION_PROFILE_INVALID" {
		t.Fatalf("unexpected error payload: %#v", payload)
	}
}

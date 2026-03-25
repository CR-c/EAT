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

func TestProjectEndpointsRegisterListAndProbe(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "registered-repo", "main")
	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	registerBody, _ := json.Marshal(map[string]any{"path": repoPath})
	registerRequest := httptest.NewRequest(http.MethodPost, "/api/projects", bytes.NewReader(registerBody))
	registerResponse := httptest.NewRecorder()
	router.ServeHTTP(registerResponse, registerRequest)

	if registerResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected register status: %d body=%s", registerResponse.Code, registerResponse.Body.String())
	}

	var registerPayload map[string]any
	if err := json.Unmarshal(registerResponse.Body.Bytes(), &registerPayload); err != nil {
		t.Fatalf("decode register response: %v", err)
	}

	projectPayload := registerPayload["project"].(map[string]any)
	projectID := projectPayload["id"].(string)

	listRequest := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("unexpected list status: %d", listResponse.Code)
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/projects/"+projectID, nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	statusRequest := httptest.NewRequest(http.MethodGet, "/api/projects/"+projectID+"/repo-status", nil)
	statusResponse := httptest.NewRecorder()
	router.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("unexpected repo status: %d body=%s", statusResponse.Code, statusResponse.Body.String())
	}
}

func TestProjectBrowseEndpoint(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	_ = createGitRepository(t, tempDir, "browse-repo", "main")
	if err := os.Mkdir(filepath.Join(tempDir, "plain-dir"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, ".hidden-dir"), 0o755); err != nil {
		t.Fatalf("mkdir hidden: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/projects/browse?path="+tempDir, nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected browse status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode browse response: %v", err)
	}

	entries := payload["entries"].([]any)
	if len(entries) != 2 {
		t.Fatalf("unexpected entries length: %d", len(entries))
	}
}

func TestProjectDeleteEndpointRemovesProjectWithoutTasks(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "delete-repo", "main")
	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	registerBody, _ := json.Marshal(map[string]any{"path": repoPath})
	registerRequest := httptest.NewRequest(http.MethodPost, "/api/projects", bytes.NewReader(registerBody))
	registerResponse := httptest.NewRecorder()
	router.ServeHTTP(registerResponse, registerRequest)
	if registerResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected register status: %d body=%s", registerResponse.Code, registerResponse.Body.String())
	}

	var registerPayload map[string]any
	if err := json.Unmarshal(registerResponse.Body.Bytes(), &registerPayload); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	projectID := registerPayload["project"].(map[string]any)["id"].(string)

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/projects/"+projectID, nil)
	deleteResponse := httptest.NewRecorder()
	router.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("unexpected delete status: %d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("unexpected list status: %d body=%s", listResponse.Code, listResponse.Body.String())
	}

	var listPayload map[string]any
	if err := json.Unmarshal(listResponse.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listPayload["projects"].([]any)) != 0 {
		t.Fatalf("expected project to be deleted, payload=%#v", listPayload["projects"])
	}
}

func TestProjectDeleteEndpointBlocksWhenTasksExist(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-delete-blocked', 'Blocked Project', '/tmp/project-delete-blocked', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert project: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-delete-blocked', 'project-delete-blocked', 'Task One', 'Attached task', 'codex-cli', 'main', 'abc123',
			'eat-task-one', 'EXECUTING', 1, '{}', '{}', NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/projects/project-delete-blocked", nil)
	deleteResponse := httptest.NewRecorder()
	router.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusConflict {
		t.Fatalf("unexpected delete status: %d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestProjectDeleteEndpointAllowsCompletedTasks(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-delete-completed', 'Completed Project', '/tmp/project-delete-completed', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert project: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-delete-completed', 'project-delete-completed', 'Completed Task', 'Historical task', 'codex-cli', 'main', 'abc123',
			'eat-task-completed', 'COMPLETED', 1, '{}', '{}', NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/projects/project-delete-completed", nil)
	deleteResponse := httptest.NewRecorder()
	router.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("unexpected delete status: %d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestProjectDeleteEndpointBlocksActionRequiredTasksUnlessPaused(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-action-required', 'Action Required Project', '/tmp/project-action-required', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert project: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-action-required', 'project-action-required', 'Action Task', 'Needs operator action', 'codex-cli', 'main', 'abc123',
			'eat-task-action', 'ACTION_REQUIRED', 1, '{}', '{}', 'Merge conflict needs resolution.', NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	blockedRequest := httptest.NewRequest(http.MethodDelete, "/api/projects/project-action-required", nil)
	blockedResponse := httptest.NewRecorder()
	router.ServeHTTP(blockedResponse, blockedRequest)
	if blockedResponse.Code != http.StatusConflict {
		t.Fatalf("unexpected blocked delete status: %d body=%s", blockedResponse.Code, blockedResponse.Body.String())
	}

	if _, err := db.Exec(`UPDATE tasks SET last_error = 'Paused by operator from EXECUTING.' WHERE id = 'task-action-required'`); err != nil {
		t.Fatalf("pause task: %v", err)
	}

	allowedRequest := httptest.NewRequest(http.MethodDelete, "/api/projects/project-action-required", nil)
	allowedResponse := httptest.NewRecorder()
	router.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("unexpected allowed delete status: %d body=%s", allowedResponse.Code, allowedResponse.Body.String())
	}
}

func createGitRepository(t *testing.T, rootPath, name, defaultBranch string) string {
	t.Helper()

	repoPath := filepath.Join(rootPath, name)
	runGit(t, rootPath, "init", "--initial-branch="+defaultBranch, repoPath)
	runGit(t, repoPath, "config", "user.name", "EAT Test")
	runGit(t, repoPath, "config", "user.email", "eat@example.com")

	if err := os.WriteFile(filepath.Join(repoPath, "README.md"), []byte("# seed\n"), 0o644); err != nil {
		t.Fatalf("write readme: %v", err)
	}

	runGit(t, repoPath, "add", "README.md")
	runGit(t, repoPath, "commit", "-m", "seed")
	return repoPath
}

func runGit(t *testing.T, cwd string, args ...string) {
	t.Helper()

	cmd := exec.CommandContext(context.Background(), "git", args...)
	cmd.Dir = cwd
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, string(output))
	}
}

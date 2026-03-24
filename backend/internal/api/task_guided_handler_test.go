package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestCreateGuidedTaskEndpointSeedsPlanReviewTask(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "guided-repo", "main")
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
		"title":         "Todo golden path",
		"description":   "Build a full-stack Todo app with auth, database, and React frontend.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
		"templateId":    "full-stack-web-app",
	})

	request := httptest.NewRequest(http.MethodPost, "/api/guided-tasks", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected guided task status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode guided task response: %v", err)
	}

	taskPayload := payload["task"].(map[string]any)
	if taskPayload["status"] != "PLAN_REVIEW" {
		t.Fatalf("unexpected task status: %#v", taskPayload["status"])
	}
	if taskPayload["planVersion"].(float64) != 1 {
		t.Fatalf("unexpected plan version: %#v", taskPayload["planVersion"])
	}

	currentPlan := payload["currentPlan"].(map[string]any)
	if currentPlan["template_id"] != "full-stack-web-app" {
		t.Fatalf("unexpected template id: %#v", currentPlan["template_id"])
	}
	nodes := currentPlan["nodes"].([]any)
	if len(nodes) != 6 {
		t.Fatalf("unexpected node count: %d", len(nodes))
	}
	if nodes[0].(map[string]any)["role"] != "architect" {
		t.Fatalf("unexpected first node: %#v", nodes[0])
	}
	if nodes[len(nodes)-1].(map[string]any)["branch_suffix"] != "integration" {
		t.Fatalf("unexpected last node: %#v", nodes[len(nodes)-1])
	}

	if _, err := exec.CommandContext(context.Background(), "git", "-C", repoPath, "rev-parse", "eat-Todo-golden-path^{commit}").CombinedOutput(); err != nil {
		t.Fatalf("expected task branch to exist: %v", err)
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/"+taskPayload["id"].(string), nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected task detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	var detailPayload map[string]any
	if err := json.Unmarshal(detailResponse.Body.Bytes(), &detailPayload); err != nil {
		t.Fatalf("decode task detail response: %v", err)
	}
	if len(detailPayload["planSnapshots"].([]any)) != 1 {
		t.Fatalf("unexpected plan snapshot count: %#v", detailPayload["planSnapshots"])
	}
	planSnapshot := detailPayload["planSnapshots"].([]any)[0].(map[string]any)
	if planSnapshot["source"] != "LEAD_GENERATED" {
		t.Fatalf("unexpected plan snapshot source: %#v", planSnapshot["source"])
	}
}

func TestPlanSeedEndpointUpdatesCurrentPlanForPlanReviewTasks(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-1', 'Project One', '/tmp/project-one', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-1', 'project-1', 'Clarify Todo flow', 'Seed a built-in plan', 'codex-cli', 'main', 'abc123',
			'eat-clarify-todo-flow', 'PLAN_REVIEW', 0, NULL, NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"templateId": "full-stack-web-app",
	})
	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/plan-seed", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected plan seed status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plan seed response: %v", err)
	}

	currentPlan := payload["currentPlan"].(map[string]any)
	if currentPlan["template_id"] != "full-stack-web-app" {
		t.Fatalf("unexpected template id: %#v", currentPlan["template_id"])
	}
	nodes := currentPlan["nodes"].([]any)
	if len(nodes) != 6 {
		t.Fatalf("unexpected node count: %d", len(nodes))
	}

	var persistedPlanJSON string
	if err := db.QueryRow(`SELECT current_plan_json FROM tasks WHERE id = 'task-1'`).Scan(&persistedPlanJSON); err != nil {
		t.Fatalf("read persisted plan json: %v", err)
	}
	if persistedPlanJSON == "" {
		t.Fatal("expected current_plan_json to be persisted")
	}
}

func TestPlanSeedEndpointRejectsNonPlanReviewTasks(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-1', 'Project One', '/tmp/project-one', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-2', 'project-1', 'Draft task', 'Still drafting', 'codex-cli', 'main', 'abc123',
			'eat-draft-task', 'DRAFT', 0, NULL, NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"templateId": "full-stack-web-app",
	})
	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-2/plan-seed", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("unexpected non plan review status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if payload["error"].(map[string]any)["code"] != "TASK_NOT_PLAN_REVIEW" {
		t.Fatalf("unexpected error payload: %#v", payload["error"])
	}
}

func TestCreateGuidedTaskEndpointRejectsUnknownTemplate(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "guided-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-1', 'Project One', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"projectId":     "project-1",
		"title":         "Todo golden path",
		"description":   "Build a full-stack Todo app with auth, database, and React frontend.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
		"templateId":    "does-not-exist",
	})

	request := httptest.NewRequest(http.MethodPost, "/api/guided-tasks", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("unexpected guided task status for missing template: %d body=%s", response.Code, response.Body.String())
	}

	var taskCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&taskCount); err != nil {
		t.Fatalf("count tasks: %v", err)
	}
	if taskCount != 0 {
		t.Fatalf("expected no tasks to be created for an unknown template, got %d", taskCount)
	}
}

package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestStartClarificationEndpointWorksWithoutExecutionBackend(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-clarify-lead-only", "task-clarify-lead-only", "DRAFT", 0, "")

	sandboxManager := newUnavailableSandboxManager()
	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: sandboxManager,
		AgentService:   newFakeLeadAgentServiceWithSandbox(t, sandboxManager, "当前约束已明确。"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarify-lead-only/clarification-sessions", map[string]any{
		"content": "先确认是否还能进入澄清。",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected clarification status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["task"].(map[string]any)["status"] != "CLARIFYING" {
		t.Fatalf("unexpected task payload: %#v", payload["task"])
	}
}

func TestApprovePlanEndpointBlocksWhenExecutionBackendIsUnavailable(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(
		t,
		db,
		"project-approve-lead-only",
		"task-approve-lead-only",
		"PLAN_REVIEW",
		1,
		`{"subtasks":[{"title":"Backend slice","description":"Independent work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"}]}`,
	)

	sandboxManager := newUnavailableSandboxManager()
	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: sandboxManager,
		AgentService:   newFakeLeadAgentServiceWithSandbox(t, sandboxManager, "当前约束已明确。"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-approve-lead-only/plan-approvals", nil)
	if response.Code != http.StatusConflict {
		t.Fatalf("unexpected approve status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	errorPayload := payload["error"].(map[string]any)
	if errorPayload["code"] != "EXECUTION_BACKEND_UNAVAILABLE" {
		t.Fatalf("unexpected error payload: %#v", errorPayload)
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-approve-lead-only", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	if detailPayload["task"].(map[string]any)["status"] != "PLAN_REVIEW" {
		t.Fatalf("expected task to stay in PLAN_REVIEW: %#v", detailPayload["task"])
	}
	if len(detailPayload["subTasks"].([]any)) != 0 {
		t.Fatalf("expected no subtasks to be created: %#v", detailPayload["subTasks"])
	}
	if len(detailPayload["sessions"].([]any)) != 0 {
		t.Fatalf("expected no sessions to be created: %#v", detailPayload["sessions"])
	}
}

func TestApprovePlanEndpointBlocksWhenPlannedWorkerAgentIsNotExecutionReady(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(
		t,
		db,
		"project-approve-agent-unready",
		"task-approve-agent-unready",
		"PLAN_REVIEW",
		1,
		`{"subtasks":[{"title":"Backend slice","description":"Independent work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"}]}`,
	)

	agentService := newFakeLeadAgentService(t, "当前约束已明确。")
	agentService.RegisterExecutionBackend(alwaysAvailableExecutionBackend{}, true)
	t.Setenv("EAT_CODEX_WORKER_COMMAND", "codex")
	t.Setenv("EAT_CODEX_AUTH_PATH", filepath.Join(tempDir, "missing-auth.json"))
	t.Setenv("OPENAI_API_KEY", "")

	router := NewRouter(NewHandler(Dependencies{
		DB:           db,
		Bus:          eventbus.New(),
		AgentService: agentService,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-approve-agent-unready/plan-approvals", nil)
	if response.Code != http.StatusConflict {
		t.Fatalf("unexpected approve status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	errorPayload := payload["error"].(map[string]any)
	if errorPayload["code"] != "EXECUTION_AGENT_UNAVAILABLE" {
		t.Fatalf("unexpected error payload: %#v", errorPayload)
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-approve-agent-unready", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	if detailPayload["task"].(map[string]any)["status"] != "PLAN_REVIEW" {
		t.Fatalf("expected task to stay in PLAN_REVIEW: %#v", detailPayload["task"])
	}
	if len(detailPayload["subTasks"].([]any)) != 0 {
		t.Fatalf("expected no subtasks to be created: %#v", detailPayload["subTasks"])
	}
	if len(detailPayload["sessions"].([]any)) != 0 {
		t.Fatalf("expected no sessions to be created: %#v", detailPayload["sessions"])
	}
}

func TestApprovePlanEndpointUsesTaskScopedBackendReadiness(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "task-scoped-backend-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-task-backend', 'Project Task Backend', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, worker_backend_kind, execution_profile, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-task-backend', 'project-task-backend', 'Task scoped backend', 'Should honor task backend over default backend.', 'codex-cli', 'main', 'abc123',
			'feature/task-backend', 'ghost', NULL, 'PLAN_REVIEW', 1,
			'{"subtasks":[{"title":"Backend slice","description":"Independent work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"}]}',
			NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	agentService := newFakeLeadAgentService(t, "当前约束已明确。")
	agentService.RegisterExecutionBackend(alwaysAvailableExecutionBackend{}, true)
	t.Setenv("EAT_CODEX_WORKER_COMMAND", "codex")

	router := NewRouter(NewHandler(Dependencies{
		DB:           db,
		Bus:          eventbus.New(),
		AgentService: agentService,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-task-backend/plan-approvals", nil)
	if response.Code != http.StatusConflict {
		t.Fatalf("unexpected approve status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	errorPayload := payload["error"].(map[string]any)
	if errorPayload["code"] != "EXECUTION_BACKEND_UNAVAILABLE" {
		t.Fatalf("unexpected error payload: %#v", errorPayload)
	}
	details := errorPayload["details"].(map[string]any)
	backend := details["backend"].(map[string]any)
	if backend["kind"] != "ghost" {
		t.Fatalf("expected task-scoped backend kind=ghost, payload=%#v", backend)
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-task-backend", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	taskPayload := detailPayload["task"].(map[string]any)
	if taskPayload["workerBackendKind"] != "ghost" {
		t.Fatalf("expected task detail workerBackendKind=ghost: %#v", taskPayload)
	}
	if len(detailPayload["subTasks"].([]any)) != 0 {
		t.Fatalf("expected no subtasks to be created: %#v", detailPayload["subTasks"])
	}
	if len(detailPayload["sessions"].([]any)) != 0 {
		t.Fatalf("expected no sessions to be created: %#v", detailPayload["sessions"])
	}
}

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

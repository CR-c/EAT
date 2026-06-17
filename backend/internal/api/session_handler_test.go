package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestSessionOutputEndpointReturnsPersistedOutputBuffer(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-session-output', 'Project One', '/tmp/project-one', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z');
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-session-output', 'project-session-output', 'Task Title', 'Task Description', 'codex-cli', 'main', 'abc123',
			'eat-task-title', 'EXECUTING', 1, NULL, NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		);
		INSERT INTO agent_sessions (
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		) VALUES (
			'session-output-1', 'task-session-output', NULL, 'codex-cli', 'WORKER', 'DOCKER', NULL,
			'RUNNING', NULL, '2026-03-24T00:00:03Z', NULL, NULL, NULL, '2026-03-24T00:00:03Z',
			'line 1\nline 2', 13, '2026-03-24T00:00:03Z', '2026-03-24T00:00:04Z'
		)
	`); err != nil {
		t.Fatalf("seed session: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodGet, "/api/sessions/session-output-1/output", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["sessionId"] != "session-output-1" || payload["output"] != `line 1\nline 2` || payload["truncated"] != true {
		t.Fatalf("unexpected session output payload: %#v", payload)
	}
}

func TestSessionOutputEndpointReturnsNotFound(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodGet, "/api/sessions/missing-session/output", nil)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["error"].(map[string]any)["code"] != "SESSION_NOT_FOUND" {
		t.Fatalf("unexpected error payload: %#v", payload)
	}
}

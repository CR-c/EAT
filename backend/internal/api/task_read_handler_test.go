package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestTaskReadEndpointsReturnPersistedTaskData(t *testing.T) {
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
			'task-1', 'project-1', 'Task One', 'Read side task', 'codex-cli', 'main', 'abc123',
			'eat-task-one', 'PLAN_REVIEW', 1, '{}', NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO attachments (id, task_id, file_name, file_path, file_type, mime_type, size, created_at)
		VALUES ('attachment-1', 'task-1', 'brief.md', '/tmp/brief.md', 'DOCUMENT', 'text/markdown', 8, '2026-03-24T00:00:03Z')
	`); err != nil {
		t.Fatalf("insert attachment: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO messages (id, task_id, role, content, created_at)
		VALUES ('message-1', 'task-1', 'USER', 'hello', '2026-03-24T00:00:04Z')
	`); err != nil {
		t.Fatalf("insert message: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES ('snapshot-1', 'task-1', 1, 'LEAD_GENERATED', '{}', '2026-03-24T00:00:05Z')
	`); err != nil {
		t.Fatalf("insert snapshot: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, created_at, updated_at, version
		) VALUES (
			'subtask-1', 'task-1', 'Backend Slice', 'Slice desc', 'backend', '[]',
			'eat/task-1/backend', 'abc123', '/tmp/worktree', 'codex-cli', 'PENDING', 1,
			0, '2026-03-24T00:00:06Z', '2026-03-24T00:00:07Z', 0
		)
	`); err != nil {
		t.Fatalf("insert subtask: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO agent_sessions (
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id, status, pid,
			started_at, ended_at, exit_code, log_path, first_output_at, output_buffer, output_buffer_max_bytes,
			created_at, updated_at
		) VALUES
			('session-usage-1', 'task-1', 'subtask-1', 'codex-cli', 'WORKER', 'DOCKER', NULL, 'COMPLETED', NULL,
			 '2026-03-24T00:00:08Z', '2026-03-24T00:00:09Z', 0, NULL, '2026-03-24T00:00:08Z', '', 65536,
			 '2026-03-24T00:00:08Z', '2026-03-24T00:00:09Z'),
			('session-usage-2', 'task-1', 'subtask-1', 'codex-cli', 'WORKER', 'DOCKER', NULL, 'COMPLETED', NULL,
			 '2026-03-24T00:00:10Z', '2026-03-24T00:00:11Z', 0, NULL, '2026-03-24T00:00:10Z', '', 65536,
			 '2026-03-24T00:00:10Z', '2026-03-24T00:00:11Z')
	`); err != nil {
		t.Fatalf("insert sessions: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO session_token_usage (
			id, session_id, task_id, project_id, sub_task_id, agent_type,
			input_tokens, output_tokens, total_tokens, turn_count, created_at, updated_at
		) VALUES
			('usage-task-1', 'session-usage-1', 'task-1', 'project-1', 'subtask-1', 'codex-cli',
			 500, 100, 600, 1, '2026-03-24T00:00:09Z', '2026-03-24T00:00:09Z'),
			('usage-task-2', 'session-usage-2', 'task-1', 'project-1', 'subtask-1', 'codex-cli',
			 1200, 200, 1400, 1, '2026-03-24T00:00:11Z', '2026-03-24T00:00:11Z')
	`); err != nil {
		t.Fatalf("insert usage: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	projectTasksRequest := httptest.NewRequest(http.MethodGet, "/api/projects/project-1/tasks", nil)
	projectTasksResponse := httptest.NewRecorder()
	router.ServeHTTP(projectTasksResponse, projectTasksRequest)
	if projectTasksResponse.Code != http.StatusOK {
		t.Fatalf("unexpected project tasks status: %d body=%s", projectTasksResponse.Code, projectTasksResponse.Body.String())
	}

	var projectTasksPayload map[string]any
	if err := json.Unmarshal(projectTasksResponse.Body.Bytes(), &projectTasksPayload); err != nil {
		t.Fatalf("decode project tasks response: %v", err)
	}
	if len(projectTasksPayload["tasks"].([]any)) != 1 {
		t.Fatalf("unexpected task count: %#v", projectTasksPayload["tasks"])
	}
	taskListTokens := projectTasksPayload["tasks"].([]any)[0].(map[string]any)["tokens"].(map[string]any)
	if taskListTokens["codex-cli"] != float64(2000) {
		t.Fatalf("unexpected task list tokens: %#v", taskListTokens)
	}

	taskRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/task-1", nil)
	taskResponse := httptest.NewRecorder()
	router.ServeHTTP(taskResponse, taskRequest)
	if taskResponse.Code != http.StatusOK {
		t.Fatalf("unexpected task detail status: %d body=%s", taskResponse.Code, taskResponse.Body.String())
	}

	var taskPayload map[string]any
	if err := json.Unmarshal(taskResponse.Body.Bytes(), &taskPayload); err != nil {
		t.Fatalf("decode task detail response: %v", err)
	}
	if taskPayload["task"].(map[string]any)["id"] != "task-1" {
		t.Fatalf("unexpected task payload: %#v", taskPayload["task"])
	}
	if len(taskPayload["attachments"].([]any)) != 1 {
		t.Fatalf("unexpected attachments payload: %#v", taskPayload["attachments"])
	}
	if len(taskPayload["subTasks"].([]any)) != 1 {
		t.Fatalf("unexpected subtasks payload: %#v", taskPayload["subTasks"])
	}
	taskTokens := taskPayload["task"].(map[string]any)["tokens"].(map[string]any)
	if taskTokens["codex-cli"] != float64(2000) {
		t.Fatalf("unexpected task detail tokens: %#v", taskTokens)
	}
}

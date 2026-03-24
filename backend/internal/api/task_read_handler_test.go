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
}

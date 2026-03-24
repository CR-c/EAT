package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestTaskTeamBoardAndMailboxEndpointsReturnPersistedReadModels(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-ops", "EXECUTING", 1, `{"subtasks":[{"title":"Backend contract","description":"Original","recommended_agent":"codex-cli","branch_suffix":"backend-contract"}]}`)

	if _, err := db.Exec(`
		INSERT INTO agent_sessions (
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		) VALUES (
			'lead-session-1', 'task-ops', NULL, 'codex-cli', 'LEAD', 'HOST', NULL,
			'RUNNING', NULL, '2026-03-24T00:00:03Z', NULL, NULL, NULL, NULL,
			'', 65536, '2026-03-24T00:00:03Z', '2026-03-24T00:00:03Z'
		),
		(
			'worker-session-1', 'task-ops', 'subtask-1', 'codex-cli', 'WORKER', 'DOCKER', NULL,
			'RUNNING', NULL, '2026-03-24T00:00:04Z', NULL, NULL, NULL, NULL,
			'', 65536, '2026-03-24T00:00:04Z', '2026-03-24T00:00:04Z'
		)
	`); err != nil {
		t.Fatalf("insert sessions: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		) VALUES (
			'subtask-1', 'task-ops', 'Backend contract', 'Define the API contract first.', 'backend-contract', '[]',
			'eat/task-ops/backend-contract', NULL, '/tmp/worktree/backend-contract', 'codex-cli', 'RUNNING', 1,
			0, NULL, NULL, NULL,
			NULL, 'architect', 'Backend contract', 1, 'LEAD',
			'Running in /tmp/worktree/backend-contract.', 0, '2026-03-24T00:00:05Z', '2026-03-24T00:00:05Z'
		),
		(
			'subtask-2', 'task-ops', 'Frontend implementation', 'Wait for the contract before building the UI.', 'frontend-ui', '["backend-contract"]',
			NULL, NULL, NULL, 'codex-cli', 'BLOCKED', 1,
			0, NULL, NULL, NULL,
			NULL, 'frontend', 'Frontend implementation', 2, 'LEAD',
			NULL, 0, '2026-03-24T00:00:06Z', '2026-03-24T00:00:06Z'
		)
	`); err != nil {
		t.Fatalf("insert subtasks: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO mailbox_messages (
			id, task_id, sender_type, sender_sub_task_id, target_type, target_sub_task_id,
			message_type, artifact_refs_json, file_refs_json, branch_ref, schema_json,
			requires_ack, content, created_at
		) VALUES (
			'mailbox-1', 'task-ops', 'LEAD', NULL, 'SUBTASK', 'subtask-2',
			'BLOCKER', '[]', '[]', NULL, NULL,
			0, 'Waiting for backend auth contract handoff.', '2026-03-24T00:00:07Z'
		)
	`); err != nil {
		t.Fatalf("insert mailbox message: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	teamResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-ops/team", nil)
	if teamResponse.Code != http.StatusOK {
		t.Fatalf("unexpected team status: %d body=%s", teamResponse.Code, teamResponse.Body.String())
	}
	teamPayload := decodeJSONMap(t, teamResponse.Body.Bytes())
	team := teamPayload["team"].(map[string]any)
	members := team["members"].([]any)
	if team["task"].(map[string]any)["id"] != "task-ops" {
		t.Fatalf("unexpected team task payload: %#v", team["task"])
	}
	if team["lead"].(map[string]any)["agentType"] != "codex-cli" {
		t.Fatalf("unexpected team lead payload: %#v", team["lead"])
	}
	if len(members) != 2 {
		t.Fatalf("unexpected team members payload: %#v", members)
	}
	if members[0].(map[string]any)["role"] != "architect" || members[0].(map[string]any)["executionOrder"].(float64) != 1 {
		t.Fatalf("unexpected first team member: %#v", members[0])
	}
	if members[1].(map[string]any)["status"] != "BLOCKED" {
		t.Fatalf("unexpected second team member: %#v", members[1])
	}

	boardResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-ops/board", nil)
	if boardResponse.Code != http.StatusOK {
		t.Fatalf("unexpected board status: %d body=%s", boardResponse.Code, boardResponse.Body.String())
	}
	boardPayload := decodeJSONMap(t, boardResponse.Body.Bytes())
	board := boardPayload["board"].(map[string]any)
	if board["task"].(map[string]any)["id"] != "task-ops" {
		t.Fatalf("unexpected board task payload: %#v", board["task"])
	}
	if board["summary"].(map[string]any)["running"].(float64) != 1 || board["summary"].(map[string]any)["blocked"].(float64) != 1 {
		t.Fatalf("unexpected board summary payload: %#v", board["summary"])
	}
	if len(board["actionRequiredItems"].([]any)) == 0 {
		t.Fatalf("expected board actionRequiredItems to be populated: %#v", board["actionRequiredItems"])
	}
	firstAction := board["actionRequiredItems"].([]any)[0].(map[string]any)
	if firstAction["kind"] != "BLOCKER" || firstAction["owner"] != "LEADER" || firstAction["subTaskId"] != "subtask-2" {
		t.Fatalf("unexpected first action item: %#v", firstAction)
	}
	nodes := board["graph"].(map[string]any)["nodes"].([]any)
	edges := board["graph"].(map[string]any)["edges"].([]any)
	if !containsNodeWithInbox(nodes, "subtask-2", 1) {
		t.Fatalf("expected blocked subtask node to include mailbox inbox count: %#v", nodes)
	}
	if !containsEdgeState(edges, "subtask-2", "BLOCKING") {
		t.Fatalf("expected dependency edge to remain blocking: %#v", edges)
	}

	mailboxResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-ops/mailbox", map[string]any{
		"content":         "Frontend can proceed once auth contract is merged.",
		"messageType":     "NOTE",
		"targetSubTaskId": "subtask-2",
		"targetType":      "SUBTASK",
		"artifactRefs":    []string{"contract:auth-api"},
		"fileRefs":        []string{"docs/contracts/auth-api.md"},
		"branchRef":       "eat/task-ops/backend-contract",
		"schemaJson": map[string]any{
			"contractVersion": 1,
		},
		"requiresAck": true,
	})
	if mailboxResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected mailbox status: %d body=%s", mailboxResponse.Code, mailboxResponse.Body.String())
	}
	mailboxPayload := decodeJSONMap(t, mailboxResponse.Body.Bytes())
	if mailboxPayload["message"].(map[string]any)["messageType"] != "NOTE" {
		t.Fatalf("unexpected mailbox payload: %#v", mailboxPayload["message"])
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-ops", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}
	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	if len(detailPayload["mailboxMessages"].([]any)) != 2 {
		t.Fatalf("unexpected detail mailbox payload: %#v", detailPayload["mailboxMessages"])
	}
	if len(detailPayload["team"].(map[string]any)["members"].([]any)) != 2 {
		t.Fatalf("unexpected detail team payload: %#v", detailPayload["team"])
	}
	if len(detailPayload["board"].(map[string]any)["activity"].([]any)) == 0 {
		t.Fatalf("unexpected detail board activity payload: %#v", detailPayload["board"])
	}
}

func containsNodeWithInbox(nodes []any, subTaskID string, inboxCount float64) bool {
	for _, entry := range nodes {
		node := entry.(map[string]any)
		if node["subtaskId"] == subTaskID && node["mailboxInboxCount"].(float64) == inboxCount {
			return true
		}
	}
	return false
}

func containsEdgeState(edges []any, targetSubTaskID, state string) bool {
	for _, entry := range edges {
		edge := entry.(map[string]any)
		if edge["to"] == targetSubTaskID && edge["state"] == state {
			return true
		}
	}
	return false
}

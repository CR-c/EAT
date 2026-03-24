package api

import (
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestSubTaskLifecycleEndpointsPersistOperatorMutations(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-retry", "task-retry", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Retry subtask","description":"Original","recommended_agent":"codex-cli","branch_suffix":"retry-subtask"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-retry",
		TaskID:           "task-retry",
		Title:            "Retry subtask",
		Description:      "Original retry description.",
		BranchSuffix:     "retry-subtask",
		AgentType:        "codex-cli",
		Status:           "FAILED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		CreatedAt:        "2026-03-24T00:00:10Z",
	})

	insertProjectTaskRecord(t, db, "project-rework", "task-rework", "EXECUTING", 1, `{"subtasks":[{"title":"Rework subtask","description":"Original","recommended_agent":"codex-cli","branch_suffix":"rework-subtask"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:                   "subtask-rework",
		TaskID:               "task-rework",
		Title:                "Rework subtask",
		Description:          "Original rework description.",
		BranchSuffix:         "rework-subtask",
		AgentType:            "codex-cli",
		Status:               "REVIEW_PENDING",
		AssignmentSource:     "LEAD",
		AutoAssigned:         true,
		LatestReviewDecision: "REWORK",
		CreatedAt:            "2026-03-24T00:00:20Z",
	})

	insertProjectTaskRecord(t, db, "project-change", "task-change", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Change agent","description":"Original","recommended_agent":"codex-cli","branch_suffix":"change-agent"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-change",
		TaskID:           "task-change",
		Title:            "Change agent",
		Description:      "Original change description.",
		BranchSuffix:     "change-agent",
		AgentType:        "codex-cli",
		Status:           "FAILED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		CreatedAt:        "2026-03-24T00:00:30Z",
	})

	insertProjectTaskRecord(t, db, "project-reassign", "task-reassign", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Backend prerequisite","description":"Original","recommended_agent":"codex-cli","branch_suffix":"backend"},{"title":"Blocked frontend","description":"Original","recommended_agent":"codex-cli","branch_suffix":"frontend","depends_on":["backend"]}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-dependency",
		TaskID:           "task-reassign",
		Title:            "Backend prerequisite",
		Description:      "Dependency still pending.",
		BranchSuffix:     "backend",
		AgentType:        "codex-cli",
		Status:           "PENDING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:00:40Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:                          "subtask-reassign",
		TaskID:                      "task-reassign",
		Title:                       "Blocked frontend",
		Description:                 "Original blocked description.",
		BranchSuffix:                "frontend",
		DependencyBranchSuffixesRaw: `["backend"]`,
		AgentType:                   "codex-cli",
		Status:                      "CANCELLED",
		AssignmentSource:            "LEAD",
		AutoAssigned:                true,
		ExecutionOrder:              2,
		CreatedAt:                   "2026-03-24T00:00:41Z",
	})

	insertProjectTaskRecord(t, db, "project-discard", "task-discard", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted slice","description":"Original","recommended_agent":"codex-cli","branch_suffix":"accepted-slice"},{"title":"Discarded slice","description":"Original","recommended_agent":"codex-cli","branch_suffix":"discarded-slice"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-accepted",
		TaskID:           "task-discard",
		Title:            "Accepted slice",
		Description:      "Already accepted.",
		BranchSuffix:     "accepted-slice",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:00:50Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-discard",
		TaskID:           "task-discard",
		Title:            "Discarded slice",
		Description:      "Awaiting operator confirmation.",
		BranchSuffix:     "discarded-slice",
		AgentType:        "codex-cli",
		Status:           "DISCARD_PENDING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   2,
		CreatedAt:        "2026-03-24T00:00:51Z",
	})

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	retryResponse := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-retry/retry", map[string]any{
		"description": "Retry with stricter logging.",
	})
	if retryResponse.Code != http.StatusOK {
		t.Fatalf("unexpected retry status: %d body=%s", retryResponse.Code, retryResponse.Body.String())
	}
	retryPayload := decodeJSONMap(t, retryResponse.Body.Bytes())
	if retryPayload["task"].(map[string]any)["status"] != "EXECUTING" {
		t.Fatalf("unexpected retry task payload: %#v", retryPayload["task"])
	}
	if retryPayload["subTask"].(map[string]any)["status"] != "PENDING" || retryPayload["subTask"].(map[string]any)["assignmentSource"] != "OPERATOR" {
		t.Fatalf("unexpected retry subtask payload: %#v", retryPayload["subTask"])
	}
	if retryPayload["session"].(map[string]any)["status"] != "PENDING" {
		t.Fatalf("unexpected retry session payload: %#v", retryPayload["session"])
	}

	reworkResponse := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-rework/rework", map[string]any{
		"description": "Tighten validation coverage and relaunch.",
	})
	if reworkResponse.Code != http.StatusOK {
		t.Fatalf("unexpected rework status: %d body=%s", reworkResponse.Code, reworkResponse.Body.String())
	}
	reworkPayload := decodeJSONMap(t, reworkResponse.Body.Bytes())
	if reworkPayload["subTask"].(map[string]any)["retryCount"].(float64) != 1 || reworkPayload["subTask"].(map[string]any)["description"] != "Tighten validation coverage and relaunch." {
		t.Fatalf("unexpected rework payload: %#v", reworkPayload["subTask"])
	}

	changeAgentResponse := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-change/change-agent", map[string]any{
		"agentType":   "claude-cli",
		"description": "Use a different worker for the rerun.",
	})
	if changeAgentResponse.Code != http.StatusOK {
		t.Fatalf("unexpected change-agent status: %d body=%s", changeAgentResponse.Code, changeAgentResponse.Body.String())
	}
	changeAgentPayload := decodeJSONMap(t, changeAgentResponse.Body.Bytes())
	if changeAgentPayload["task"].(map[string]any)["status"] != "EXECUTING" {
		t.Fatalf("unexpected change-agent task payload: %#v", changeAgentPayload["task"])
	}
	if changeAgentPayload["subTask"].(map[string]any)["agentType"] != "claude-cli" || changeAgentPayload["session"].(map[string]any)["agentType"] != "claude-cli" {
		t.Fatalf("unexpected change-agent payload: %#v", changeAgentPayload)
	}

	reassignResponse := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-reassign/reassign", map[string]any{
		"description": "Reassign after the dependency clears.",
	})
	if reassignResponse.Code != http.StatusOK {
		t.Fatalf("unexpected reassign status: %d body=%s", reassignResponse.Code, reassignResponse.Body.String())
	}
	reassignPayload := decodeJSONMap(t, reassignResponse.Body.Bytes())
	if reassignPayload["task"].(map[string]any)["status"] != "EXECUTING" {
		t.Fatalf("unexpected reassign task payload: %#v", reassignPayload["task"])
	}
	if reassignPayload["subTask"].(map[string]any)["status"] != "BLOCKED" || reassignPayload["session"] != nil {
		t.Fatalf("unexpected reassign payload: %#v", reassignPayload)
	}

	discardResponse := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-discard/confirm-discard", nil)
	if discardResponse.Code != http.StatusOK {
		t.Fatalf("unexpected confirm-discard status: %d body=%s", discardResponse.Code, discardResponse.Body.String())
	}
	discardPayload := decodeJSONMap(t, discardResponse.Body.Bytes())
	if discardPayload["task"].(map[string]any)["status"] != "MERGING" || discardPayload["subTask"].(map[string]any)["status"] != "DISCARDED" {
		t.Fatalf("unexpected confirm-discard payload: %#v", discardPayload)
	}
}

func TestCancelSubTaskEndpointCancelsLatestLiveWorkerSession(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-cancel", "task-cancel", "EXECUTING", 1, `{"subtasks":[{"title":"Cancelable subtask","description":"Original","recommended_agent":"codex-cli","branch_suffix":"cancelable-subtask"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-cancel",
		TaskID:           "task-cancel",
		Title:            "Cancelable subtask",
		Description:      "Running worker.",
		BranchSuffix:     "cancelable-subtask",
		AgentType:        "codex-cli",
		Status:           "RUNNING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		CreatedAt:        "2026-03-24T00:01:00Z",
	})
	insertWorkerSessionRecord(t, db, "worker-session-cancel", "task-cancel", "subtask-cancel", "RUNNING")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-cancel/cancel", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected cancel status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["subTask"].(map[string]any)["status"] != "CANCELLED" {
		t.Fatalf("unexpected cancelled subtask payload: %#v", payload["subTask"])
	}
	if payload["session"].(map[string]any)["status"] != "CANCELLED" || payload["session"].(map[string]any)["endedAt"] == nil {
		t.Fatalf("unexpected cancelled session payload: %#v", payload["session"])
	}
}

func TestCancelSubTaskEndpointRoutesTaskToActionRequiredWhenBlockedDependentsNeedAttention(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-cancel-blocked", "task-cancel-blocked", "EXECUTING", 1, `{"subtasks":[{"title":"Backend contract","description":"Original","recommended_agent":"codex-cli","branch_suffix":"backend-contract"},{"title":"Frontend consumer","description":"Waits on backend.","recommended_agent":"codex-cli","branch_suffix":"frontend-consumer","depends_on":["backend-contract"]}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-cancel-upstream",
		TaskID:           "task-cancel-blocked",
		Title:            "Backend contract",
		Description:      "Running worker.",
		BranchSuffix:     "backend-contract",
		AgentType:        "codex-cli",
		Status:           "RUNNING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:01:05Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:                          "subtask-cancel-downstream",
		TaskID:                      "task-cancel-blocked",
		Title:                       "Frontend consumer",
		Description:                 "Blocked on backend.",
		BranchSuffix:                "frontend-consumer",
		DependencyBranchSuffixesRaw: `["backend-contract"]`,
		AgentType:                   "codex-cli",
		Status:                      "BLOCKED",
		AssignmentSource:            "LEAD",
		AutoAssigned:                true,
		ExecutionOrder:              2,
		CreatedAt:                   "2026-03-24T00:01:06Z",
	})
	insertWorkerSessionRecord(t, db, "worker-session-cancel-blocked", "task-cancel-blocked", "subtask-cancel-upstream", "RUNNING")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-cancel-upstream/cancel", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected cancel status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	taskPayload := payload["task"].(map[string]any)
	if taskPayload["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected task payload: %#v", taskPayload)
	}
	lastError, _ := taskPayload["lastError"].(string)
	if !strings.Contains(lastError, "Frontend consumer is blocked by backend-contract (CANCELLED).") {
		t.Fatalf("unexpected action required reason: %#v", taskPayload["lastError"])
	}
}

func TestRebaseRetrySubTaskEndpointResumesMergingAfterConflict(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-rebase", "task-rebase", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Rebase conflict","description":"Original","recommended_agent":"codex-cli","branch_suffix":"rebase-conflict"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-rebase",
		TaskID:           "task-rebase",
		Title:            "Rebase conflict",
		Description:      "Ready to resume merging.",
		BranchSuffix:     "rebase-conflict",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		CreatedAt:        "2026-03-24T00:01:30Z",
	})
	insertMergeRecord(t, db, "merge-record-1", "subtask-rebase", 1, "MERGE", "CONFLICT")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-rebase/rebase-retry", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected rebase-retry status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["mergeStatus"] != "SUCCEEDED" || payload["task"].(map[string]any)["status"] != "MERGING" {
		t.Fatalf("unexpected rebase-retry payload: %#v", payload)
	}
}

type subTaskFixture struct {
	ID                          string
	TaskID                      string
	Title                       string
	Description                 string
	BranchSuffix                string
	DependencyBranchSuffixesRaw string
	AgentType                   string
	Status                      string
	AssignmentSource            string
	AutoAssigned                bool
	LatestReviewDecision        string
	ExecutionOrder              int
	CreatedAt                   string
}

func insertProjectTaskRecord(t *testing.T, db *store.DB, projectID, taskID, status string, planVersion int, currentPlanJSON string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES (?, 'Project One', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, projectID, "/tmp/"+projectID); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			?, ?, 'Task Title', 'Task Description', 'codex-cli', 'main', 'abc123',
			'eat-task-title', ?, ?, ?, NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`, taskID, projectID, status, planVersion, currentPlanJSON); err != nil {
		t.Fatalf("insert task: %v", err)
	}
}

func insertSubTaskRecord(t *testing.T, db *store.DB, fixture subTaskFixture) {
	t.Helper()

	dependenciesRaw := fixture.DependencyBranchSuffixesRaw
	if dependenciesRaw == "" {
		dependenciesRaw = "[]"
	}
	autoAssigned := 0
	if fixture.AutoAssigned {
		autoAssigned = 1
	}
	var latestReviewDecision any
	if fixture.LatestReviewDecision != "" {
		latestReviewDecision = fixture.LatestReviewDecision
	}
	var executionOrder any
	if fixture.ExecutionOrder > 0 {
		executionOrder = fixture.ExecutionOrder
	}

	if _, err := db.Exec(`
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		) VALUES (
			?, ?, ?, ?, ?, ?,
			NULL, NULL, NULL, ?, ?, ?,
			0, NULL, ?, NULL,
			NULL, NULL, NULL, ?, ?,
			NULL, 0, ?, ?
		)
	`,
		fixture.ID,
		fixture.TaskID,
		fixture.Title,
		fixture.Description,
		fixture.BranchSuffix,
		dependenciesRaw,
		fixture.AgentType,
		fixture.Status,
		autoAssigned,
		latestReviewDecision,
		executionOrder,
		fixture.AssignmentSource,
		fixture.CreatedAt,
		fixture.CreatedAt,
	); err != nil {
		t.Fatalf("insert subtask: %v", err)
	}
}

func insertWorkerSessionRecord(t *testing.T, db *store.DB, sessionID, taskID, subTaskID, status string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO agent_sessions (
			id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id,
			status, pid, started_at, ended_at, exit_code, log_path, first_output_at,
			output_buffer, output_buffer_max_bytes, created_at, updated_at
		) VALUES (
			?, ?, ?, 'codex-cli', 'WORKER', 'DOCKER', NULL,
			?, NULL, '2026-03-24T00:01:01Z', NULL, NULL, NULL, NULL,
			'', 65536, '2026-03-24T00:01:01Z', '2026-03-24T00:01:01Z'
		)
	`, sessionID, taskID, subTaskID, status); err != nil {
		t.Fatalf("insert worker session: %v", err)
	}
}

func insertMergeRecord(t *testing.T, db *store.DB, recordID, subTaskID string, attemptNumber int, operation, status string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO merge_records (
			id, sub_task_id, attempt_number, operation, source_branch, target_branch, status,
			result_commit_sha, conflict_summary, completed_at, created_at, updated_at
		) VALUES (
			?, ?, ?, ?, 'eat/source', 'eat/target', ?,
			NULL, 'Conflict summary', '2026-03-24T00:01:31Z', '2026-03-24T00:01:31Z', '2026-03-24T00:01:31Z'
		)
	`, recordID, subTaskID, attemptNumber, operation, status); err != nil {
		t.Fatalf("insert merge record: %v", err)
	}
}

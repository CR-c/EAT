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
	if taskPayload["currentPlanJson"] == nil {
		t.Fatalf("expected guided task to include currentPlanJson: %#v", taskPayload)
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
	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/plan-seeds", bytes.NewReader(requestBody))
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
	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-2/plan-seeds", bytes.NewReader(requestBody))
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

func TestUpdateCurrentPlanEndpointPersistsEditedDraft(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-plan-edit", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Original draft","description":"Original","recommended_agent":"codex-cli","branch_suffix":"original-draft"}]}`)

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"notes": "Edited operator draft.",
		"subtasks": []map[string]any{
			{
				"title":             "Edited backend slice",
				"description":       "Keep the server work parallel-safe after edits.",
				"recommended_agent": "codex-cli",
				"branch_suffix":     "edited-backend-slice",
			},
		},
	})

	request := httptest.NewRequest(http.MethodPut, "/api/tasks/task-plan-edit/plan", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected current plan update status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode current plan response: %v", err)
	}

	taskPayload := payload["task"].(map[string]any)
	if taskPayload["planVersion"].(float64) != 1 {
		t.Fatalf("unexpected plan version: %#v", taskPayload["planVersion"])
	}

	var currentPlan map[string]any
	if err := json.Unmarshal([]byte(taskPayload["currentPlanJson"].(string)), &currentPlan); err != nil {
		t.Fatalf("decode persisted current plan json: %v", err)
	}
	if currentPlan["notes"] != "Edited operator draft." {
		t.Fatalf("unexpected current plan notes: %#v", currentPlan["notes"])
	}
	if currentPlan["subtasks"].([]any)[0].(map[string]any)["branch_suffix"] != "edited-backend-slice" {
		t.Fatalf("unexpected persisted plan payload: %#v", currentPlan)
	}
}

func TestUpdateCurrentPlanEndpointRejectsInvalidPlan(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-invalid-plan", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Original draft","description":"Original","recommended_agent":"codex-cli","branch_suffix":"original-draft"}]}`)

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{
		"subtasks": []map[string]any{
			{
				"title":             "Broken duplicate one",
				"description":       "Invalid duplicate suffix.",
				"recommended_agent": "codex-cli",
				"branch_suffix":     "dup-suffix",
			},
			{
				"title":             "Broken duplicate two",
				"description":       "Still invalid duplicate suffix.",
				"recommended_agent": "codex-cli",
				"branch_suffix":     "dup-suffix",
			},
		},
	})

	request := httptest.NewRequest(http.MethodPut, "/api/tasks/task-invalid-plan/plan", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("unexpected invalid current plan status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid current plan response: %v", err)
	}
	if payload["error"].(map[string]any)["code"] != "INVALID_PLAN" {
		t.Fatalf("unexpected invalid plan payload: %#v", payload)
	}
}

func TestRestorePlanSnapshotEndpointRestoresPayloadAndAppendsAuditSnapshot(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-restore", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"User edited draft","description":"Will be replaced","recommended_agent":"codex-cli","branch_suffix":"user-edited-draft"}]}`)

	if _, err := db.Exec(`
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES (
			'snapshot-1', 'task-restore', 1, 'LEAD_GENERATED',
			'{"subtasks":[{"title":"Backend slice","description":"Restored","recommended_agent":"codex-cli","branch_suffix":"backend-slice"}]}',
			'2026-03-24T00:00:03Z'
		)
	`); err != nil {
		t.Fatalf("insert snapshot: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	requestBody, _ := json.Marshal(map[string]any{"snapshotId": "snapshot-1"})
	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-restore/plan-snapshot-restores", bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected restore snapshot status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode restore response: %v", err)
	}
	if payload["currentPlan"].(map[string]any)["subtasks"].([]any)[0].(map[string]any)["branch_suffix"] != "backend-slice" {
		t.Fatalf("unexpected restored payload: %#v", payload["currentPlan"])
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/task-restore", nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status after restore: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	var detailPayload map[string]any
	if err := json.Unmarshal(detailResponse.Body.Bytes(), &detailPayload); err != nil {
		t.Fatalf("decode detail response after restore: %v", err)
	}
	if len(detailPayload["planSnapshots"].([]any)) != 2 {
		t.Fatalf("unexpected plan snapshot count after restore: %#v", detailPayload["planSnapshots"])
	}
	if detailPayload["planSnapshots"].([]any)[0].(map[string]any)["source"] != "RESTORED_FROM_HISTORY" {
		t.Fatalf("unexpected latest plan snapshot source: %#v", detailPayload["planSnapshots"])
	}
}

func TestApprovePlanEndpointFreezesPlanAndMaterializesSubTasks(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-approve", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Plan backend slice","description":"Independent backend work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"},{"title":"Verify integration","description":"Depends on backend slice.","recommended_agent":"codex-cli","branch_suffix":"integration-verify","depends_on":["backend-slice"]}]}`)

	if _, err := db.Exec(`
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES (
			'snapshot-seed', 'task-approve', 1, 'LEAD_GENERATED',
			'{"subtasks":[{"title":"Plan backend slice","description":"Independent backend work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"},{"title":"Verify integration","description":"Depends on backend slice.","recommended_agent":"codex-cli","branch_suffix":"integration-verify","depends_on":["backend-slice"]}]}',
			'2026-03-24T00:00:03Z'
		)
	`); err != nil {
		t.Fatalf("insert seed snapshot: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-approve/plan-approvals", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected approve plan status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode approve response: %v", err)
	}

	if payload["approvedSnapshot"].(map[string]any)["source"] != "APPROVED" {
		t.Fatalf("unexpected approved snapshot: %#v", payload["approvedSnapshot"])
	}
	if payload["idempotent"].(bool) {
		t.Fatalf("expected first approval to be non-idempotent")
	}
	taskPayload := payload["task"].(map[string]any)
	if taskPayload["status"] != "EXECUTING" {
		t.Fatalf("unexpected task status after approval: %#v", taskPayload["status"])
	}
	if taskPayload["approvedPlanJson"] != taskPayload["currentPlanJson"] {
		t.Fatalf("expected approved plan json to match current plan json")
	}

	subTasks := payload["subTasks"].([]any)
	if len(subTasks) != 2 {
		t.Fatalf("unexpected subtask count: %#v", subTasks)
	}
	if subTasks[0].(map[string]any)["status"] != "PENDING" {
		t.Fatalf("unexpected first subtask status: %#v", subTasks[0])
	}
	if subTasks[1].(map[string]any)["status"] != "BLOCKED" {
		t.Fatalf("unexpected second subtask status: %#v", subTasks[1])
	}

	duplicateRequest := httptest.NewRequest(http.MethodPost, "/api/tasks/task-approve/plan-approvals", nil)
	duplicateResponse := httptest.NewRecorder()
	router.ServeHTTP(duplicateResponse, duplicateRequest)
	if duplicateResponse.Code != http.StatusOK {
		t.Fatalf("unexpected duplicate approve status: %d body=%s", duplicateResponse.Code, duplicateResponse.Body.String())
	}

	var duplicatePayload map[string]any
	if err := json.Unmarshal(duplicateResponse.Body.Bytes(), &duplicatePayload); err != nil {
		t.Fatalf("decode duplicate approve response: %v", err)
	}
	if !duplicatePayload["idempotent"].(bool) {
		t.Fatalf("expected duplicate approval to be idempotent")
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/task-approve", nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status after approval: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	var detailPayload map[string]any
	if err := json.Unmarshal(detailResponse.Body.Bytes(), &detailPayload); err != nil {
		t.Fatalf("decode detail response after approval: %v", err)
	}
	if detailPayload["planSnapshots"].([]any)[0].(map[string]any)["source"] != "APPROVED" {
		t.Fatalf("unexpected latest plan snapshot after approval: %#v", detailPayload["planSnapshots"])
	}
	if len(detailPayload["subTasks"].([]any)) != 2 {
		t.Fatalf("unexpected persisted subtasks after approval: %#v", detailPayload["subTasks"])
	}
	if len(detailPayload["sessions"].([]any)) != 1 {
		t.Fatalf("unexpected persisted sessions after approval: %#v", detailPayload["sessions"])
	}
	sessionPayload := detailPayload["sessions"].([]any)[0].(map[string]any)
	if sessionPayload["sessionType"] != "WORKER" || sessionPayload["status"] != "PENDING" {
		t.Fatalf("unexpected worker session payload after approval: %#v", sessionPayload)
	}
}

func TestApprovePlanEndpointCreatesWorkerSessionsForEachLaunchableRootSubTask(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-approve-parallel", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Backend slice","description":"Independent backend work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"},{"title":"Frontend slice","description":"Independent frontend work.","recommended_agent":"claude-cli","branch_suffix":"frontend-slice"},{"title":"Integration verify","description":"Depends on both roots.","recommended_agent":"codex-cli","branch_suffix":"integration-verify","depends_on":["backend-slice","frontend-slice"]}]}`)

	if _, err := db.Exec(`
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES (
			'snapshot-seed-parallel', 'task-approve-parallel', 1, 'LEAD_GENERATED',
			'{"subtasks":[{"title":"Backend slice","description":"Independent backend work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice"},{"title":"Frontend slice","description":"Independent frontend work.","recommended_agent":"claude-cli","branch_suffix":"frontend-slice"},{"title":"Integration verify","description":"Depends on both roots.","recommended_agent":"codex-cli","branch_suffix":"integration-verify","depends_on":["backend-slice","frontend-slice"]}]}',
			'2026-03-24T00:00:03Z'
		)
	`); err != nil {
		t.Fatalf("insert seed snapshot: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	request := httptest.NewRequest(http.MethodPost, "/api/tasks/task-approve-parallel/plan-approvals", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected approve plan status: %d body=%s", response.Code, response.Body.String())
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/tasks/task-approve-parallel", nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status after approval: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	var detailPayload map[string]any
	if err := json.Unmarshal(detailResponse.Body.Bytes(), &detailPayload); err != nil {
		t.Fatalf("decode detail response after approval: %v", err)
	}

	if len(detailPayload["subTasks"].([]any)) != 3 {
		t.Fatalf("unexpected persisted subtasks after approval: %#v", detailPayload["subTasks"])
	}
	if len(detailPayload["sessions"].([]any)) != 2 {
		t.Fatalf("unexpected persisted sessions after approval: %#v", detailPayload["sessions"])
	}

	seenSubTasks := map[string]bool{}
	for _, raw := range detailPayload["sessions"].([]any) {
		sessionPayload := raw.(map[string]any)
		if sessionPayload["sessionType"] != "WORKER" || sessionPayload["status"] != "PENDING" {
			t.Fatalf("unexpected worker session payload after parallel approval: %#v", sessionPayload)
		}
		subTaskID, _ := sessionPayload["subTaskId"].(string)
		if subTaskID == "" {
			t.Fatalf("expected session subTaskId after parallel approval: %#v", sessionPayload)
		}
		seenSubTasks[subTaskID] = true
	}
	if len(seenSubTasks) != 2 {
		t.Fatalf("expected two distinct launched subtasks, got: %#v", seenSubTasks)
	}
}

func insertProjectAndTask(t *testing.T, db *store.DB, projectID, taskID, status string, planVersion int, currentPlanJSON string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES (?, 'Project One', '/tmp/project-one', 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, projectID); err != nil {
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

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

func TestStartClarificationEndpointRequiresInitialMessage(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-draft", "DRAFT", 0, "")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-draft/start-clarification", nil)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["error"].(map[string]any)["code"] != "TASK_MESSAGE_REQUIRED" {
		t.Fatalf("unexpected error payload: %#v", payload["error"])
	}
}

func TestTaskMessagesEndpointTransitionsPlanReviewTaskToPlanningAndPersistsMessage(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-plan-review", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Original draft","description":"Original","recommended_agent":"codex-cli","branch_suffix":"original-draft"}]}`)

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-plan-review/messages", map[string]any{
		"content": "Please refine the plan into execution-ready slices.",
	})
	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["task"].(map[string]any)["status"] != "PLANNING" {
		t.Fatalf("unexpected task payload: %#v", payload["task"])
	}
	if payload["message"].(map[string]any)["role"] != "USER" {
		t.Fatalf("unexpected message payload: %#v", payload["message"])
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-plan-review", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	if len(detailPayload["messages"].([]any)) != 1 {
		t.Fatalf("unexpected messages payload: %#v", detailPayload["messages"])
	}
	sessions := detailPayload["sessions"].([]any)
	if len(sessions) != 1 {
		t.Fatalf("unexpected sessions payload: %#v", detailPayload["sessions"])
	}
	session := sessions[0].(map[string]any)
	if session["sessionType"] != "LEAD" || session["status"] != "RUNNING" {
		t.Fatalf("unexpected session payload: %#v", session)
	}
}

func TestArchiveUnarchiveDeleteEndpointsManageLifecycleAndBranchCleanup(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "archive-delete-repo", "main")
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

	createResponse := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":     "project-1",
		"title":         "Archive delete task",
		"description":   "Archive and delete flows should work.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
	})
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected create status: %d body=%s", createResponse.Code, createResponse.Body.String())
	}

	createPayload := decodeJSONMap(t, createResponse.Body.Bytes())
	taskID := createPayload["task"].(map[string]any)["id"].(string)
	taskBranchName := createPayload["task"].(map[string]any)["taskBranchName"].(string)

	archiveResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/"+taskID+"/archive", map[string]any{
		"deleteBranches": false,
	})
	if archiveResponse.Code != http.StatusOK {
		t.Fatalf("unexpected archive status: %d body=%s", archiveResponse.Code, archiveResponse.Body.String())
	}
	if decodeJSONMap(t, archiveResponse.Body.Bytes())["task"].(map[string]any)["archivedAt"] == nil {
		t.Fatal("expected archived task payload to include archivedAt")
	}

	projectTasksResponse := performJSONRequest(router, http.MethodGet, "/api/projects/project-1/tasks", nil)
	if projectTasksResponse.Code != http.StatusOK {
		t.Fatalf("unexpected project tasks status: %d body=%s", projectTasksResponse.Code, projectTasksResponse.Body.String())
	}
	if len(decodeJSONMap(t, projectTasksResponse.Body.Bytes())["tasks"].([]any)) != 0 {
		t.Fatal("expected archived task to be hidden from default task list")
	}

	archivedTasksResponse := performJSONRequest(router, http.MethodGet, "/api/projects/project-1/tasks?includeArchived=1", nil)
	if archivedTasksResponse.Code != http.StatusOK {
		t.Fatalf("unexpected archived tasks status: %d body=%s", archivedTasksResponse.Code, archivedTasksResponse.Body.String())
	}
	if len(decodeJSONMap(t, archivedTasksResponse.Body.Bytes())["tasks"].([]any)) != 1 {
		t.Fatal("expected archived task to appear in includeArchived list")
	}

	unarchiveResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/"+taskID+"/unarchive", nil)
	if unarchiveResponse.Code != http.StatusOK {
		t.Fatalf("unexpected unarchive status: %d body=%s", unarchiveResponse.Code, unarchiveResponse.Body.String())
	}
	if decodeJSONMap(t, unarchiveResponse.Body.Bytes())["task"].(map[string]any)["archivedAt"] != nil {
		t.Fatal("expected unarchive to clear archivedAt")
	}

	deleteResponse := performJSONRequest(router, http.MethodDelete, "/api/tasks/"+taskID, map[string]any{
		"deleteBranches": true,
	})
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("unexpected delete status: %d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}

	deletePayload := decodeJSONMap(t, deleteResponse.Body.Bytes())
	if !containsValue(deletePayload["branchCleanup"].(map[string]any)["cleanedBranches"].([]any), taskBranchName) {
		t.Fatalf("expected cleanedBranches to include task branch: %#v", deletePayload["branchCleanup"])
	}

	afterDeleteResponse := performJSONRequest(router, http.MethodGet, "/api/projects/project-1/tasks?includeArchived=1", nil)
	if afterDeleteResponse.Code != http.StatusOK {
		t.Fatalf("unexpected project tasks after delete status: %d body=%s", afterDeleteResponse.Code, afterDeleteResponse.Body.String())
	}
	if len(decodeJSONMap(t, afterDeleteResponse.Body.Bytes())["tasks"].([]any)) != 0 {
		t.Fatal("expected no tasks after delete")
	}

	if _, err := exec.CommandContext(context.Background(), "git", "-C", repoPath, "rev-parse", taskBranchName+"^{commit}").CombinedOutput(); err == nil {
		t.Fatalf("expected task branch %s to be deleted", taskBranchName)
	}
}

func TestPauseEndpointRequiresPauseBeforeDeleteAndCancelsLeadSession(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "pause-before-delete-repo", "main")
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

	createResponse := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":     "project-1",
		"title":         "Pause before delete",
		"description":   "Deleting an active task should require an explicit pause first.",
		"leadAgentType": "codex-cli",
		"baseBranch":    "main",
	})
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected create status: %d body=%s", createResponse.Code, createResponse.Body.String())
	}

	createPayload := decodeJSONMap(t, createResponse.Body.Bytes())
	taskID := createPayload["task"].(map[string]any)["id"].(string)

	startResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/"+taskID+"/start-clarification", map[string]any{
		"content": "Start a live clarification session.",
	})
	if startResponse.Code != http.StatusOK {
		t.Fatalf("unexpected start clarification status: %d body=%s", startResponse.Code, startResponse.Body.String())
	}
	if decodeJSONMap(t, startResponse.Body.Bytes())["task"].(map[string]any)["status"] != "CLARIFYING" {
		t.Fatal("expected task status to be CLARIFYING after clarification start")
	}

	blockedDeleteResponse := performJSONRequest(router, http.MethodDelete, "/api/tasks/"+taskID, map[string]any{
		"deleteBranches": false,
	})
	if blockedDeleteResponse.Code != http.StatusBadRequest {
		t.Fatalf("unexpected blocked delete status: %d body=%s", blockedDeleteResponse.Code, blockedDeleteResponse.Body.String())
	}
	if decodeJSONMap(t, blockedDeleteResponse.Body.Bytes())["error"].(map[string]any)["code"] != "TASK_DELETE_REQUIRES_PAUSE" {
		t.Fatalf("unexpected blocked delete payload: %s", blockedDeleteResponse.Body.String())
	}

	pauseResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/"+taskID+"/pause", nil)
	if pauseResponse.Code != http.StatusOK {
		t.Fatalf("unexpected pause status: %d body=%s", pauseResponse.Code, pauseResponse.Body.String())
	}
	pausePayload := decodeJSONMap(t, pauseResponse.Body.Bytes())
	if pausePayload["task"].(map[string]any)["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected paused task payload: %#v", pausePayload["task"])
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/"+taskID, nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}
	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	if detailPayload["task"].(map[string]any)["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected detail task payload: %#v", detailPayload["task"])
	}
	if !containsPrefix(detailPayload["task"].(map[string]any)["lastError"].(string), "Paused by operator from CLARIFYING.") {
		t.Fatalf("unexpected paused error: %#v", detailPayload["task"].(map[string]any)["lastError"])
	}
	sessions := detailPayload["sessions"].([]any)
	if len(sessions) == 0 || sessions[len(sessions)-1].(map[string]any)["status"] != "CANCELLED" {
		t.Fatalf("unexpected session payload after pause: %#v", detailPayload["sessions"])
	}

	deleteResponse := performJSONRequest(router, http.MethodDelete, "/api/tasks/"+taskID, map[string]any{
		"deleteBranches": false,
	})
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("unexpected delete status: %d body=%s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestResumeTaskEndpointReturnsTaskToMergingWhenSubtasksAreResolved(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-action-required", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Approved draft","description":"Original","recommended_agent":"codex-cli","branch_suffix":"approved-draft"}]}`)

	if _, err := db.Exec(`
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		) VALUES (
			'subtask-1', 'task-action-required', 'Backend Slice', 'Slice desc', 'backend', '[]',
			NULL, NULL, NULL, 'codex-cli', 'ACCEPTED', 1,
			0, NULL, NULL, NULL,
			NULL, 'backend', 'Backend Slice', 1, 'LEAD',
			NULL, 0, '2026-03-24T00:00:06Z', '2026-03-24T00:00:07Z'
		)
	`); err != nil {
		t.Fatalf("insert subtask: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-action-required/resume", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected resume status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["task"].(map[string]any)["status"] != "MERGING" {
		t.Fatalf("unexpected resumed task payload: %#v", payload["task"])
	}
}

func TestConfirmRequirementsAndStopLeadSessionEndpointsUseStaticLeadSessionState(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-clarifying", "DRAFT", 0, "")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	startResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarifying/start-clarification", map[string]any{
		"content": "Clarify the last missing operator constraints.",
	})
	if startResponse.Code != http.StatusOK {
		t.Fatalf("unexpected start status: %d body=%s", startResponse.Code, startResponse.Body.String())
	}

	stopResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarifying/stop-lead-session", nil)
	if stopResponse.Code != http.StatusOK {
		t.Fatalf("unexpected stop status: %d body=%s", stopResponse.Code, stopResponse.Body.String())
	}

	stoppedDetailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-clarifying", nil)
	if stoppedDetailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected stopped detail status: %d body=%s", stoppedDetailResponse.Code, stoppedDetailResponse.Body.String())
	}
	stoppedDetailPayload := decodeJSONMap(t, stoppedDetailResponse.Body.Bytes())
	stoppedSessions := stoppedDetailPayload["sessions"].([]any)
	if len(stoppedSessions) != 1 || stoppedSessions[0].(map[string]any)["status"] != "CANCELLED" {
		t.Fatalf("unexpected stopped session payload: %#v", stoppedDetailPayload["sessions"])
	}

	restartResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarifying/start-clarification", map[string]any{
		"content": "Clarify again after manual stop.",
	})
	if restartResponse.Code != http.StatusBadRequest {
		t.Fatalf("unexpected restart status: %d body=%s", restartResponse.Code, restartResponse.Body.String())
	}

	messageResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarifying/messages", map[string]any{
		"content": "Continue with the clarified task document.",
	})
	if messageResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected message status: %d body=%s", messageResponse.Code, messageResponse.Body.String())
	}

	confirmResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-clarifying/confirm-requirements", nil)
	if confirmResponse.Code != http.StatusOK {
		t.Fatalf("unexpected confirm status: %d body=%s", confirmResponse.Code, confirmResponse.Body.String())
	}

	confirmPayload := decodeJSONMap(t, confirmResponse.Body.Bytes())
	if confirmPayload["task"].(map[string]any)["status"] != "PLANNING" {
		t.Fatalf("unexpected confirmed task payload: %#v", confirmPayload["task"])
	}
	if confirmPayload["message"].(map[string]any)["role"] != "SYSTEM" {
		t.Fatalf("unexpected confirmation message payload: %#v", confirmPayload["message"])
	}
}

func performJSONRequest(router http.Handler, method, url string, body any) *httptest.ResponseRecorder {
	var requestBody *bytes.Reader
	if body == nil {
		requestBody = bytes.NewReader(nil)
	} else {
		encodedBody, _ := json.Marshal(body)
		requestBody = bytes.NewReader(encodedBody)
	}

	request := httptest.NewRequest(method, url, requestBody)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func decodeJSONMap(t *testing.T, raw []byte) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode json: %v body=%s", err, string(raw))
	}
	return payload
}

func containsValue(values []any, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func containsPrefix(value, prefix string) bool {
	return len(value) >= len(prefix) && value[:len(prefix)] == prefix
}

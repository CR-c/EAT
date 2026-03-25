package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestIntegrationEndpointsPersistQueuedRunsAndDetailView(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-integration", "task-integration", "MERGING", 1, `{"subtasks":[{"title":"Accepted alpha","description":"Original","recommended_agent":"codex-cli","branch_suffix":"alpha"},{"title":"Accepted beta","description":"Original","recommended_agent":"codex-cli","branch_suffix":"beta"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-alpha",
		TaskID:           "task-integration",
		Title:            "Accepted alpha",
		Description:      "Ready for integration.",
		BranchSuffix:     "alpha",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:02:00Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-beta",
		TaskID:           "task-integration",
		Title:            "Accepted beta",
		Description:      "Ready for integration.",
		BranchSuffix:     "beta",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   2,
		CreatedAt:        "2026-03-24T00:02:01Z",
	})

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	startResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-integration/integration-runs", nil)
	if startResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected integration start status: %d body=%s", startResponse.Code, startResponse.Body.String())
	}
	startPayload := decodeJSONMap(t, startResponse.Body.Bytes())
	if startPayload["integrationRun"].(map[string]any)["status"] != "QUEUED" {
		t.Fatalf("unexpected integration run payload: %#v", startPayload["integrationRun"])
	}

	detailResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/task-integration", nil)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected integration detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}
	detailPayload := decodeJSONMap(t, detailResponse.Body.Bytes())
	latestRun := detailPayload["integration"].(map[string]any)["latestRun"].(map[string]any)
	if latestRun["status"] != "QUEUED" || len(latestRun["queueItems"].([]any)) != 2 {
		t.Fatalf("unexpected integration detail payload: %#v", detailPayload["integration"])
	}
}

func TestIntegrationRetryRollbackAndDequeueEndpointsPersistUpdates(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-retry-integration", "task-retry-integration", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted alpha","description":"Original","recommended_agent":"codex-cli","branch_suffix":"alpha"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-retry-integration",
		TaskID:           "task-retry-integration",
		Title:            "Accepted alpha",
		Description:      "Ready for retry.",
		BranchSuffix:     "alpha",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:03:00Z",
	})
	insertIntegrationRunRecord(t, db, "integration-run-old", "task-retry-integration", "eat/task-retry-integration/integration-1", "ROLLED_BACK")

	insertProjectTaskRecord(t, db, "project-rollback-integration", "task-rollback-integration", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted rollback","description":"Original","recommended_agent":"codex-cli","branch_suffix":"rollback"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-rollback-integration",
		TaskID:           "task-rollback-integration",
		Title:            "Accepted rollback",
		Description:      "Ready for rollback.",
		BranchSuffix:     "rollback",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:03:10Z",
	})
	insertIntegrationRunRecord(t, db, "integration-run-rollback", "task-rollback-integration", "eat/task-rollback-integration/integration-1", "ACTION_REQUIRED")
	insertIntegrationQueueItemRecord(t, db, "integration-queue-rollback", "integration-run-rollback", "subtask-rollback-integration", 1, "QUEUED")

	insertProjectTaskRecord(t, db, "project-dequeue-integration", "task-dequeue-integration", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted dequeue","description":"Original","recommended_agent":"codex-cli","branch_suffix":"dequeue"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-dequeue-integration",
		TaskID:           "task-dequeue-integration",
		Title:            "Accepted dequeue",
		Description:      "Ready for dequeue.",
		BranchSuffix:     "dequeue",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:03:20Z",
	})
	insertIntegrationRunRecord(t, db, "integration-run-dequeue", "task-dequeue-integration", "eat/task-dequeue-integration/integration-1", "ACTION_REQUIRED")
	insertIntegrationQueueItemRecord(t, db, "integration-queue-dequeue", "integration-run-dequeue", "subtask-dequeue-integration", 1, "QUEUED")

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	retryResponse := performJSONRequest(router, http.MethodPost, "/api/integration-runs/integration-run-old/retry", nil)
	if retryResponse.Code != http.StatusOK {
		t.Fatalf("unexpected integration retry status: %d body=%s", retryResponse.Code, retryResponse.Body.String())
	}
	retryPayload := decodeJSONMap(t, retryResponse.Body.Bytes())
	if retryPayload["task"].(map[string]any)["status"] != "MERGING" || retryPayload["integrationRun"].(map[string]any)["status"] != "QUEUED" {
		t.Fatalf("unexpected integration retry payload: %#v", retryPayload)
	}

	rollbackResponse := performJSONRequest(router, http.MethodPost, "/api/integration-runs/integration-run-rollback/rollback", nil)
	if rollbackResponse.Code != http.StatusOK {
		t.Fatalf("unexpected integration rollback status: %d body=%s", rollbackResponse.Code, rollbackResponse.Body.String())
	}
	rollbackPayload := decodeJSONMap(t, rollbackResponse.Body.Bytes())
	if rollbackPayload["integrationRun"].(map[string]any)["status"] != "ROLLED_BACK" {
		t.Fatalf("unexpected integration rollback payload: %#v", rollbackPayload)
	}

	dequeueResponse := performJSONRequest(router, http.MethodPost, "/api/integration-queue-items/integration-queue-dequeue/dequeue", nil)
	if dequeueResponse.Code != http.StatusOK {
		t.Fatalf("unexpected integration dequeue status: %d body=%s", dequeueResponse.Code, dequeueResponse.Body.String())
	}
	dequeuePayload := decodeJSONMap(t, dequeueResponse.Body.Bytes())
	if dequeuePayload["integrationQueueItem"].(map[string]any)["status"] != "DEQUEUED" {
		t.Fatalf("unexpected integration dequeue payload: %#v", dequeuePayload)
	}
}

func insertIntegrationRunRecord(t *testing.T, db *store.DB, runID, taskID, branchName, status string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO integration_runs (
			id, task_id, integration_branch, status, started_at, ended_at, created_at, updated_at
		) VALUES (
			?, ?, ?, ?, NULL, NULL, '2026-03-24T00:03:30Z', '2026-03-24T00:03:30Z'
		)
	`, runID, taskID, branchName, status); err != nil {
		t.Fatalf("insert integration run: %v", err)
	}
}

func insertIntegrationQueueItemRecord(t *testing.T, db *store.DB, queueItemID, runID, subTaskID string, queueOrder int, status string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO integration_queue_items (
			id, integration_run_id, sub_task_id, queue_order, status, merged_commit_sha, created_at, updated_at
		) VALUES (
			?, ?, ?, ?, ?, NULL, '2026-03-24T00:03:31Z', '2026-03-24T00:03:31Z'
		)
	`, queueItemID, runID, subTaskID, queueOrder, status); err != nil {
		t.Fatalf("insert integration queue item: %v", err)
	}
}

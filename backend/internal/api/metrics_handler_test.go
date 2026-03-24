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

func TestMetricsEndpointsReportSummaryAndExportRows(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	seedMetricsDataset(t, db)

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	summaryRequest := httptest.NewRequest(http.MethodGet, "/api/metrics/summary", nil)
	summaryResponse := httptest.NewRecorder()
	router.ServeHTTP(summaryResponse, summaryRequest)
	if summaryResponse.Code != http.StatusOK {
		t.Fatalf("unexpected summary status: %d body=%s", summaryResponse.Code, summaryResponse.Body.String())
	}

	var summaryPayload map[string]any
	if err := json.Unmarshal(summaryResponse.Body.Bytes(), &summaryPayload); err != nil {
		t.Fatalf("decode summary response: %v", err)
	}

	summary := summaryPayload["summary"].(map[string]any)
	if summary["tasksEnteredExecuting"].(float64) != 2 {
		t.Fatalf("unexpected tasksEnteredExecuting: %#v", summary["tasksEnteredExecuting"])
	}
	if summary["tasksCompleted"].(float64) != 1 {
		t.Fatalf("unexpected tasksCompleted: %#v", summary["tasksCompleted"])
	}
	if summary["completionRateAfterPlanApproval"].(float64) != 0.5 {
		t.Fatalf("unexpected completion rate: %#v", summary["completionRateAfterPlanApproval"])
	}
	if summary["workerCrashDetectionRate"].(float64) != 1 {
		t.Fatalf("unexpected crash detection rate: %#v", summary["workerCrashDetectionRate"])
	}
	if summary["mergeConflictCount"].(float64) != 1 {
		t.Fatalf("unexpected merge conflict count: %#v", summary["mergeConflictCount"])
	}
	if summary["rebaseRetryCount"].(float64) != 1 {
		t.Fatalf("unexpected rebase retry count: %#v", summary["rebaseRetryCount"])
	}
	if summary["cleanupWarningCount"].(float64) != 1 {
		t.Fatalf("unexpected cleanup warning count: %#v", summary["cleanupWarningCount"])
	}
	if summary["sandboxLaunchFailureCount"].(float64) != 1 {
		t.Fatalf("unexpected sandbox launch failure count: %#v", summary["sandboxLaunchFailureCount"])
	}
	if summary["retryToReviewConversionRate"].(float64) != 1 {
		t.Fatalf("unexpected retry review conversion rate: %#v", summary["retryToReviewConversionRate"])
	}
	if summary["earlyReworkAdoptionRate"].(float64) != 1 {
		t.Fatalf("unexpected early rework adoption rate: %#v", summary["earlyReworkAdoptionRate"])
	}
	if summary["mergeConflictSurfacingAccuracy"].(float64) != 1 {
		t.Fatalf("unexpected merge conflict surfacing accuracy: %#v", summary["mergeConflictSurfacingAccuracy"])
	}
	if summary["medianPlanApprovalToFirstWorkerOutputMs"].(float64) != 6000 {
		t.Fatalf("unexpected median first output timing: %#v", summary["medianPlanApprovalToFirstWorkerOutputMs"])
	}
	unavailableMetrics := summary["unavailableMetrics"].([]any)
	if len(unavailableMetrics) != 1 {
		t.Fatalf("unexpected unavailable metrics: %#v", unavailableMetrics)
	}
	if unavailableMetrics[0].(map[string]any)["metric"] != "routingCorrectness" {
		t.Fatalf("unexpected unavailable metric payload: %#v", unavailableMetrics[0])
	}

	exportRequest := httptest.NewRequest(http.MethodGet, "/api/metrics/export", nil)
	exportResponse := httptest.NewRecorder()
	router.ServeHTTP(exportResponse, exportRequest)
	if exportResponse.Code != http.StatusOK {
		t.Fatalf("unexpected export status: %d body=%s", exportResponse.Code, exportResponse.Body.String())
	}

	var exportPayload map[string]any
	if err := json.Unmarshal(exportResponse.Body.Bytes(), &exportPayload); err != nil {
		t.Fatalf("decode export response: %v", err)
	}

	taskRows := exportPayload["tasks"].([]any)
	if len(taskRows) != 2 {
		t.Fatalf("unexpected task row count: %#v", taskRows)
	}

	var completedTask map[string]any
	var actionRequiredTask map[string]any
	for _, row := range taskRows {
		taskRow := row.(map[string]any)
		switch taskRow["status"] {
		case "COMPLETED":
			completedTask = taskRow
		case "ACTION_REQUIRED":
			actionRequiredTask = taskRow
		}
	}

	if completedTask == nil || actionRequiredTask == nil {
		t.Fatalf("missing expected task rows: %#v", taskRows)
	}
	if completedTask["retryCount"].(float64) != 1 {
		t.Fatalf("unexpected completed task retry count: %#v", completedTask["retryCount"])
	}
	if completedTask["mergeConflictCount"].(float64) != 1 {
		t.Fatalf("unexpected completed task merge conflict count: %#v", completedTask["mergeConflictCount"])
	}
	if completedTask["rebaseRetryCount"].(float64) != 1 {
		t.Fatalf("unexpected completed task rebase retry count: %#v", completedTask["rebaseRetryCount"])
	}
	if completedTask["cleanupWarningCount"].(float64) != 1 {
		t.Fatalf("unexpected completed task cleanup warning count: %#v", completedTask["cleanupWarningCount"])
	}
	if completedTask["sandboxLaunchFailureCount"].(float64) != 0 {
		t.Fatalf("unexpected completed task sandbox launch failure count: %#v", completedTask["sandboxLaunchFailureCount"])
	}
	if completedTask["failedWorkerSessionCount"].(float64) != 0 {
		t.Fatalf("unexpected completed task failed worker sessions: %#v", completedTask["failedWorkerSessionCount"])
	}

	if actionRequiredTask["mergeConflictCount"].(float64) != 0 {
		t.Fatalf("unexpected action-required task merge conflicts: %#v", actionRequiredTask["mergeConflictCount"])
	}
	if actionRequiredTask["cleanupWarningCount"].(float64) != 0 {
		t.Fatalf("unexpected action-required task cleanup warnings: %#v", actionRequiredTask["cleanupWarningCount"])
	}
	if actionRequiredTask["sandboxLaunchFailureCount"].(float64) != 1 {
		t.Fatalf("unexpected action-required launch failures: %#v", actionRequiredTask["sandboxLaunchFailureCount"])
	}
	if actionRequiredTask["failedWorkerSessionCount"].(float64) != 1 {
		t.Fatalf("unexpected action-required failed worker sessions: %#v", actionRequiredTask["failedWorkerSessionCount"])
	}
	if actionRequiredTask["firstWorkerOutputAt"] == nil {
		t.Fatalf("expected firstWorkerOutputAt in action-required task row")
	}
}

func seedMetricsDataset(t *testing.T, db *store.DB) {
	t.Helper()

	statements := []string{
		`INSERT INTO projects (id, name, path, default_branch, created_at, updated_at) VALUES ('project-1', 'Metrics Project', '/tmp/metrics-project', 'main', '2026-03-19T09:59:00Z', '2026-03-19T09:59:00Z')`,
		`INSERT INTO tasks (id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha, task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error, archived_at, created_at, updated_at, version) VALUES ('task-completed', 'project-1', 'Completed metrics task', 'Completed metrics task.', 'codex-cli', 'main', 'aaa111', 'eat-completed', 'COMPLETED', 1, '{}', '{}', NULL, NULL, '2026-03-19T10:00:00Z', '2026-03-19T10:30:00Z', 0)`,
		`INSERT INTO tasks (id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha, task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error, archived_at, created_at, updated_at, version) VALUES ('task-action', 'project-1', 'Action required metrics task', 'Action required metrics task.', 'codex-cli', 'main', 'bbb222', 'eat-action', 'ACTION_REQUIRED', 1, '{}', '{}', NULL, NULL, '2026-03-19T11:00:00Z', '2026-03-19T11:30:00Z', 0)`,
		`INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at) VALUES ('snapshot-completed', 'task-completed', 1, 'APPROVED', '{}', '2026-03-19T10:00:00.000Z')`,
		`INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at) VALUES ('snapshot-action', 'task-action', 1, 'APPROVED', '{}', '2026-03-19T11:00:00.000Z')`,
		`INSERT INTO sub_tasks (id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json, branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned, retry_count, last_error, latest_review_decision, latest_review_phase, latest_review_summary, role, display_name, execution_order, assignment_source, run_summary, version, created_at, updated_at) VALUES ('subtask-completed', 'task-completed', 'Completed subtask', 'Completed subtask.', 'completed-metrics', '[]', NULL, NULL, NULL, 'worker-agent', 'MERGED', 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, '2026-03-19T10:00:01.000Z', '2026-03-19T10:30:00.000Z')`,
		`INSERT INTO sub_tasks (id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json, branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned, retry_count, last_error, latest_review_decision, latest_review_phase, latest_review_summary, role, display_name, execution_order, assignment_source, run_summary, version, created_at, updated_at) VALUES ('subtask-action', 'task-action', 'Action required subtask', 'Action required subtask.', 'action-required-metrics', '[]', NULL, NULL, NULL, 'worker-agent', 'FAILED', 1, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, '2026-03-19T11:00:01.000Z', '2026-03-19T11:10:00.000Z')`,
		`INSERT INTO agent_sessions (id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id, status, pid, started_at, ended_at, exit_code, log_path, first_output_at, output_buffer, output_buffer_max_bytes, created_at, updated_at) VALUES ('session-completed-first', 'task-completed', 'subtask-completed', 'worker-agent', 'WORKER', 'DOCKER', NULL, 'COMPLETED', NULL, '2026-03-19T10:00:03.000Z', '2026-03-19T10:00:30.000Z', 0, NULL, '2026-03-19T10:00:04.000Z', 'first output', 65536, '2026-03-19T10:00:02.000Z', '2026-03-19T10:00:30.000Z')`,
		`INSERT INTO agent_sessions (id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id, status, pid, started_at, ended_at, exit_code, log_path, first_output_at, output_buffer, output_buffer_max_bytes, created_at, updated_at) VALUES ('session-completed-retry', 'task-completed', 'subtask-completed', 'worker-agent', 'WORKER', 'DOCKER', NULL, 'COMPLETED', NULL, '2026-03-19T10:05:03.000Z', '2026-03-19T10:05:30.000Z', 0, NULL, '2026-03-19T10:05:05.000Z', 'retry output', 65536, '2026-03-19T10:05:02.000Z', '2026-03-19T10:05:30.000Z')`,
		`INSERT INTO agent_sessions (id, task_id, sub_task_id, agent_type, session_type, sandbox_type, container_id, status, pid, started_at, ended_at, exit_code, log_path, first_output_at, output_buffer, output_buffer_max_bytes, created_at, updated_at) VALUES ('session-action-failed', 'task-action', 'subtask-action', 'worker-agent', 'WORKER', 'DOCKER', NULL, 'FAILED', NULL, '2026-03-19T11:00:03.000Z', '2026-03-19T11:00:40.000Z', 2, NULL, '2026-03-19T11:00:08.000Z', 'crash output', 65536, '2026-03-19T11:00:02.000Z', '2026-03-19T11:00:40.000Z')`,
		`INSERT INTO review_records (id, sub_task_id, session_id, phase, decision, summary, created_at) VALUES ('review-incremental', 'subtask-completed', 'session-completed-retry', 'INCREMENTAL', 'REWORK', 'Needs one more pass.', '2026-03-19T10:01:00.000Z')`,
		`INSERT INTO merge_records (id, sub_task_id, attempt_number, operation, source_branch, target_branch, status, result_commit_sha, conflict_summary, completed_at, created_at, updated_at) VALUES ('merge-conflict', 'subtask-completed', 1, 'MERGE', 'eat/task/subtask-completed', 'eat/task/mainline', 'CONFLICT', NULL, 'conflict summary', '2026-03-19T10:20:00.000Z', '2026-03-19T10:20:00.000Z', '2026-03-19T10:20:00.000Z')`,
		`INSERT INTO merge_records (id, sub_task_id, attempt_number, operation, source_branch, target_branch, status, result_commit_sha, conflict_summary, completed_at, created_at, updated_at) VALUES ('merge-rebase', 'subtask-completed', 2, 'REBASE', 'eat/task/subtask-completed', 'eat/task/mainline', 'SUCCEEDED', 'abc123', NULL, '2026-03-19T10:25:00.000Z', '2026-03-19T10:25:00.000Z', '2026-03-19T10:25:00.000Z')`,
		`INSERT INTO messages (id, task_id, sub_task_id, role, content, created_at) VALUES ('msg-cleanup', 'task-completed', NULL, 'SYSTEM', 'Cleanup warning: {"worktreePath":"/tmp/worktree-completed","reason":"cleanup failed"}', '2026-03-19T10:31:00.000Z')`,
		`INSERT INTO messages (id, task_id, sub_task_id, role, content, created_at) VALUES ('msg-launch', 'task-action', NULL, 'SYSTEM', 'Launch failure: {"kind":"SANDBOX_LAUNCH_FAILURE","reason":"docker unavailable","subTaskId":"subtask-action"}', '2026-03-19T11:05:00.000Z')`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed metrics dataset failed: %v\nstatement=%s", err, statement)
		}
	}
}

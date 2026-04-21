package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestCanonicalTaskRuntimeAndDiffEndpoints(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "runtime-diff-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-runtime-diff', 'Project Runtime Diff', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	createResponse := performJSONRequest(router, http.MethodPost, "/api/tasks", map[string]any{
		"projectId":         "project-runtime-diff",
		"title":             "Runtime Diff",
		"description":       "Exercise canonical runtime and diff endpoints.",
		"leadAgentType":     "codex-cli",
		"baseBranch":        "main",
		"taskBranchName":    "feature/runtime-diff",
		"workerBackendKind": "docker",
		"executionProfile":  "internet",
	})
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected create status: %d body=%s", createResponse.Code, createResponse.Body.String())
	}
	createPayload := decodeJSONMap(t, createResponse.Body.Bytes())
	taskPayload := createPayload["task"].(map[string]any)
	if taskPayload["workerBackendKind"] != "docker" {
		t.Fatalf("expected workerBackendKind=docker, payload=%#v", taskPayload)
	}
	if taskPayload["executionProfile"] != "internet" {
		t.Fatalf("expected executionProfile=internet, payload=%#v", taskPayload)
	}
	taskID := taskPayload["id"].(string)

	runGit(t, repoPath, "checkout", "feature/runtime-diff")
	if err := os.WriteFile(filepath.Join(repoPath, "runtime.txt"), []byte("runtime diff\n"), 0o644); err != nil {
		t.Fatalf("write diff file: %v", err)
	}
	runGit(t, repoPath, "add", "runtime.txt")
	runGit(t, repoPath, "commit", "-m", "add runtime diff")
	runGit(t, repoPath, "checkout", "main")

	runtimeResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/"+taskID+"/runtime", nil)
	if runtimeResponse.Code != http.StatusOK {
		t.Fatalf("unexpected runtime status: %d body=%s", runtimeResponse.Code, runtimeResponse.Body.String())
	}
	runtimePayload := decodeJSONMap(t, runtimeResponse.Body.Bytes())
	if runtimePayload["workspaceStage"] != "CLARIFYING" {
		t.Fatalf("unexpected runtime stage: %#v", runtimePayload["workspaceStage"])
	}
	if runtimePayload["workerBackendKind"] != "docker" {
		t.Fatalf("expected runtime workerBackendKind=docker, payload=%#v", runtimePayload)
	}
	if runtimePayload["executionProfile"] != "internet" {
		t.Fatalf("expected runtime executionProfile=internet, payload=%#v", runtimePayload)
	}
	if len(runtimePayload["nodes"].([]any)) == 0 {
		t.Fatalf("expected runtime nodes, payload=%#v", runtimePayload)
	}

	diffResponse := performJSONRequest(router, http.MethodGet, "/api/tasks/"+taskID+"/diff", nil)
	if diffResponse.Code != http.StatusOK {
		t.Fatalf("unexpected diff status: %d body=%s", diffResponse.Code, diffResponse.Body.String())
	}
	diffPayload := decodeJSONMap(t, diffResponse.Body.Bytes())
	if diffPayload["available"] != true {
		t.Fatalf("expected diff to be available, payload=%#v", diffPayload)
	}
	if diffPayload["summary"].(map[string]any)["filesChanged"] == float64(0) {
		t.Fatalf("expected diff filesChanged > 0, payload=%#v", diffPayload["summary"])
	}
}

func TestCanonicalTaskReplanEndpointPersistsStructuredFeedback(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "replan-repo", "main")
	if _, err := db.Exec(`
		INSERT INTO projects (id, name, path, default_branch, created_at, updated_at)
		VALUES ('project-replan', 'Project Replan', ?, 'main', '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z')
	`, repoPath); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	planJSON, _ := json.Marshal(map[string]any{
		"notes": "original",
		"nodes": []map[string]any{
			{
				"branch_suffix":     "backend",
				"description":       "Implement backend endpoint.",
				"recommended_agent": "codex-cli",
				"role":              "backend",
				"title":             "Build API",
			},
		},
	})
	if _, err := db.Exec(`
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, status, plan_version, current_plan_json, approved_plan_json, last_error,
			archived_at, created_at, updated_at, version
		) VALUES (
			'task-replan', 'project-replan', 'Need replan', 'Replan task', 'codex-cli', 'main', 'abc123',
			'feature/replan', 'PLAN_REVIEW', 1, ?, NULL, NULL, NULL,
			'2026-03-24T00:00:01Z', '2026-03-24T00:00:02Z', 0
		)
	`, string(planJSON)); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		UploadRootPath: filepath.Join(tempDir, "uploads"),
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-replan/replan-requests", map[string]any{
		"reason": "需要拆得更细",
		"annotations": []map[string]any{
			{
				"nodeId": "backend",
				"note":   "请再细化成接口和仓储两个节点。",
			},
		},
	})
	if response.Code != http.StatusCreated {
		t.Fatalf("unexpected replan status: %d body=%s", response.Code, response.Body.String())
	}

	payload := decodeJSONMap(t, response.Body.Bytes())
	if payload["planVersion"] != float64(1) {
		t.Fatalf("unexpected planVersion: %#v", payload["planVersion"])
	}
	currentPlan := payload["currentPlan"].(map[string]any)
	if currentPlan["notes"] == nil {
		t.Fatalf("expected currentPlan notes, payload=%#v", currentPlan)
	}
	if !containsSubstring(currentPlan["notes"].(string), "REPLAN_REQUEST") {
		t.Fatalf("expected replan notes block, notes=%s", currentPlan["notes"].(string))
	}
}

func containsSubstring(value, substring string) bool {
	return strings.Contains(value, substring)
}

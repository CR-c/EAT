package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestProjectEndpointsRegisterListAndProbe(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	repoPath := createGitRepository(t, tempDir, "registered-repo", "main")
	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	registerBody, _ := json.Marshal(map[string]any{"path": repoPath})
	registerRequest := httptest.NewRequest(http.MethodPost, "/api/projects", bytes.NewReader(registerBody))
	registerResponse := httptest.NewRecorder()
	router.ServeHTTP(registerResponse, registerRequest)

	if registerResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected register status: %d body=%s", registerResponse.Code, registerResponse.Body.String())
	}

	var registerPayload map[string]any
	if err := json.Unmarshal(registerResponse.Body.Bytes(), &registerPayload); err != nil {
		t.Fatalf("decode register response: %v", err)
	}

	projectPayload := registerPayload["project"].(map[string]any)
	projectID := projectPayload["id"].(string)

	listRequest := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("unexpected list status: %d", listResponse.Code)
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/projects/"+projectID, nil)
	detailResponse := httptest.NewRecorder()
	router.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("unexpected detail status: %d body=%s", detailResponse.Code, detailResponse.Body.String())
	}

	statusRequest := httptest.NewRequest(http.MethodGet, "/api/projects/"+projectID+"/repo-status", nil)
	statusResponse := httptest.NewRecorder()
	router.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("unexpected repo status: %d body=%s", statusResponse.Code, statusResponse.Body.String())
	}
}

func TestProjectBrowseEndpoint(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	_ = createGitRepository(t, tempDir, "browse-repo", "main")
	if err := os.Mkdir(filepath.Join(tempDir, "plain-dir"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, ".hidden-dir"), 0o755); err != nil {
		t.Fatalf("mkdir hidden: %v", err)
	}

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/projects/browse?path="+tempDir, nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected browse status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode browse response: %v", err)
	}

	entries := payload["entries"].([]any)
	if len(entries) != 2 {
		t.Fatalf("unexpected entries length: %d", len(entries))
	}
}

func createGitRepository(t *testing.T, rootPath, name, defaultBranch string) string {
	t.Helper()

	repoPath := filepath.Join(rootPath, name)
	runGit(t, rootPath, "init", "--initial-branch="+defaultBranch, repoPath)
	runGit(t, repoPath, "config", "user.name", "EAT Test")
	runGit(t, repoPath, "config", "user.email", "eat@example.com")

	if err := os.WriteFile(filepath.Join(repoPath, "README.md"), []byte("# seed\n"), 0o644); err != nil {
		t.Fatalf("write readme: %v", err)
	}

	runGit(t, repoPath, "add", "README.md")
	runGit(t, repoPath, "commit", "-m", "seed")
	return repoPath
}

func runGit(t *testing.T, cwd string, args ...string) {
	t.Helper()

	cmd := exec.CommandContext(context.Background(), "git", args...)
	cmd.Dir = cwd
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, string(output))
	}
}

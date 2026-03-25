package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/preview"
	"eat/backend/internal/project"
	"eat/backend/internal/task"
)

func TestPreviewEndpointsServePreviewServiceContract(t *testing.T) {
	repoPath := t.TempDir()
	previewRoot := t.TempDir()
	harness := &previewRunnerHarness{readyURLs: map[string]bool{}}

	service := preview.NewService(preview.Dependencies{
		ProjectRepository: apiPreviewProjectRepository{project: &project.Project{ID: "proj-1", Name: "Preview Repo", Path: repoPath}},
		TaskRepository: apiPreviewTaskRepository{
			task: &task.Task{ID: "task-1", ProjectID: "proj-1", BaseBranch: "main", TaskBranchName: stringPtr("eat/task-main")},
		},
		PreviewRootPath: previewRoot,
		Runner:          harness,
		RunCommand: func(ctx context.Context, binary string, args ...string) error {
			if strings.Contains(strings.Join(args, " "), " worktree add ") || contains(args, "add") {
				worktreePath := args[5]
				if err := os.MkdirAll(filepath.Join(worktreePath, "apps", "web"), 0o755); err != nil {
					return err
				}
				return os.WriteFile(filepath.Join(worktreePath, "apps", "web", "package.json"), []byte(`{"name":"preview-web","scripts":{"dev":"vite"},"dependencies":{"vite":"^5.0.0","react":"^18.0.0"},"packageManager":"pnpm@9.0.0"}`), 0o644)
			}
			if contains(args, "remove") {
				return os.RemoveAll(args[5])
			}
			return nil
		},
		FetchReady: func(url string) bool { return harness.readyURLs[url] },
	})

	router := NewRouter(&Handler{previewService: service})

	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, httptest.NewRequest(http.MethodGet, "/api/tasks/task-1/preview", nil))
	if getResponse.Code != http.StatusOK {
		t.Fatalf("unexpected get preview status: %d body=%s", getResponse.Code, getResponse.Body.String())
	}

	startBody, _ := json.Marshal(map[string]any{
		"appRoot":  "apps/web",
		"command":  "pnpm dev -- --host 0.0.0.0 --port 4173",
		"targetId": "task-mainline",
	})
	startResponse := httptest.NewRecorder()
	router.ServeHTTP(startResponse, httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/preview/start", bytes.NewReader(startBody)))
	if startResponse.Code != http.StatusOK {
		t.Fatalf("unexpected start preview status: %d body=%s", startResponse.Code, startResponse.Body.String())
	}

	stopResponse := httptest.NewRecorder()
	router.ServeHTTP(stopResponse, httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/preview/stop", nil))
	if stopResponse.Code != http.StatusOK {
		t.Fatalf("unexpected stop preview status: %d body=%s", stopResponse.Code, stopResponse.Body.String())
	}
}

func TestPreviewStartEndpointAcceptsEmptyBodyLikeNodeContract(t *testing.T) {
	repoPath := t.TempDir()
	previewRoot := t.TempDir()
	harness := &previewRunnerHarness{readyURLs: map[string]bool{}}

	service := preview.NewService(preview.Dependencies{
		ProjectRepository: apiPreviewProjectRepository{project: &project.Project{ID: "proj-1", Name: "Preview Repo", Path: repoPath}},
		TaskRepository: apiPreviewTaskRepository{
			task: &task.Task{ID: "task-1", ProjectID: "proj-1", BaseBranch: "main", TaskBranchName: stringPtr("eat/task-main")},
		},
		PreviewRootPath: previewRoot,
		Runner:          harness,
		RunCommand: func(ctx context.Context, binary string, args ...string) error {
			if strings.Contains(strings.Join(args, " "), " worktree add ") || contains(args, "add") {
				worktreePath := args[5]
				if err := os.MkdirAll(filepath.Join(worktreePath, "apps", "web"), 0o755); err != nil {
					return err
				}
				return os.WriteFile(filepath.Join(worktreePath, "apps", "web", "package.json"), []byte(`{"name":"preview-web","scripts":{"dev":"vite"},"dependencies":{"vite":"^5.0.0","react":"^18.0.0"},"packageManager":"pnpm@9.0.0"}`), 0o644)
			}
			if contains(args, "remove") {
				return os.RemoveAll(args[5])
			}
			return nil
		},
		FetchReady: func(url string) bool { return harness.readyURLs[url] },
	})

	router := NewRouter(&Handler{previewService: service})

	startResponse := httptest.NewRecorder()
	router.ServeHTTP(startResponse, httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/preview/start", nil))
	if startResponse.Code != http.StatusOK {
		t.Fatalf("unexpected start preview status with empty body: %d body=%s", startResponse.Code, startResponse.Body.String())
	}
}

type apiPreviewProjectRepository struct {
	project *project.Project
}

func (r apiPreviewProjectRepository) FindProjectByID(context.Context, string) (*project.Project, error) {
	return r.project, nil
}

type apiPreviewTaskRepository struct {
	task *task.Task
}

func (r apiPreviewTaskRepository) FindTaskByID(context.Context, string) (*task.Task, error) {
	return r.task, nil
}

func (r apiPreviewTaskRepository) ListSubTasksByTaskID(context.Context, string) ([]task.SubTask, error) {
	return []task.SubTask{}, nil
}

type previewRunnerHarness struct {
	readyURLs map[string]bool
}

func (h *previewRunnerHarness) Start(context.Context, preview.RuntimeInput) (preview.RuntimeSession, error) {
	return &previewRuntimeSessionHarness{}, nil
}

type previewRuntimeSessionHarness struct{}

func (h *previewRuntimeSessionHarness) OnExit(func(int))      {}
func (h *previewRuntimeSessionHarness) OnOutput(func(string)) {}
func (h *previewRuntimeSessionHarness) Stop() error           { return nil }

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func stringPtr(value string) *string {
	return &value
}

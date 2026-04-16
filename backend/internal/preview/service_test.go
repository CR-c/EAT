package preview

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"eat/backend/internal/project"
	"eat/backend/internal/task"
	"eat/backend/internal/workerbackend"
)

func TestGetTaskPreviewBuildsTargetsAndAppRoots(t *testing.T) {
	fixturePath := t.TempDir()
	if err := os.WriteFile(filepath.Join(fixturePath, "package.json"), []byte(`{"name":"preview-root","scripts":{"dev":"vite"},"dependencies":{"vite":"^5.0.0","react":"^18.0.0"}}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	service := NewService(Dependencies{
		ProjectRepository: previewProjectRepository{project: &project.Project{ID: "proj-1", Name: "Preview Repo", Path: fixturePath}},
		TaskRepository: previewTaskRepository{
			task: &task.Task{ID: "task-1", ProjectID: "proj-1", BaseBranch: "main", TaskBranchName: stringPtr("eat/task-mainline")},
			subTasks: []task.SubTask{
				{ID: "sub-1", Title: "Member UI", Status: "ACCEPTED", BranchName: stringPtr("eat/task/member-ui")},
			},
			integrationRuns: []IntegrationRun{
				{ID: "run-1", IntegrationBranch: "eat/integration/task-1"},
			},
		},
		Runner: nil,
	})

	response, serviceError := service.GetTaskPreview(context.Background(), "task-1")
	if serviceError != nil {
		t.Fatalf("get task preview failed: %#v", serviceError)
	}

	if !response.Preview.Available {
		t.Fatalf("expected preview to be available")
	}
	if response.Preview.Defaults["targetType"] != "INTEGRATION_RUN" {
		t.Fatalf("unexpected default target type: %#v", response.Preview.Defaults["targetType"])
	}
	if len(response.Preview.Targets) < 3 {
		t.Fatalf("unexpected targets: %#v", response.Preview.Targets)
	}
	if len(response.Preview.AppRoots) < 1 {
		t.Fatalf("expected at least one app root")
	}
	if response.Preview.AppRoots[0].Path != "." {
		t.Fatalf("unexpected app root path: %#v", response.Preview.AppRoots[0].Path)
	}
	if !strings.Contains(response.Preview.AppRoots[0].Command, "run dev") {
		t.Fatalf("unexpected app root command: %#v", response.Preview.AppRoots[0].Command)
	}
	if response.Preview.Session != nil {
		t.Fatalf("expected no session")
	}
}

func TestStartAndStopPreviewSession(t *testing.T) {
	fixturePath := t.TempDir()
	previewRoot := t.TempDir()
	harness := &runtimeHarness{readyURLs: map[string]bool{}}
	gitCommands := make([][]string, 0)

	service := NewService(Dependencies{
		ProjectRepository: previewProjectRepository{project: &project.Project{ID: "proj-1", Name: "Preview Repo", Path: fixturePath}},
		TaskRepository: previewTaskRepository{
			task: &task.Task{ID: "task-1", ProjectID: "proj-1", BaseBranch: "main", TaskBranchName: stringPtr("eat/task-mainline")},
			subTasks: []task.SubTask{
				{ID: "sub-1", Title: "Member UI", Status: "ACCEPTED", BranchName: stringPtr("eat/task/member-ui")},
			},
		},
		PreviewRootPath: previewRoot,
		Runner:          harness,
		RunCommand: func(ctx context.Context, binary string, args ...string) error {
			if binary != "git" {
				t.Fatalf("unexpected binary: %s", binary)
			}
			gitCommands = append(gitCommands, append([]string(nil), args...))
			if slicesContain(args, "add") {
				worktreePath := args[5]
				if err := os.MkdirAll(filepath.Join(worktreePath, "apps", "web"), 0o755); err != nil {
					return err
				}
				return os.WriteFile(filepath.Join(worktreePath, "apps", "web", "package.json"), []byte(`{"name":"preview-web","scripts":{"dev":"vite"},"dependencies":{"vite":"^5.0.0","react":"^18.0.0"},"packageManager":"pnpm@9.0.0"}`), 0o644)
			}
			if slicesContain(args, "remove") {
				return os.RemoveAll(args[5])
			}
			return nil
		},
		FetchReady:      func(url string) bool { return harness.isReady(url) },
		ReadyIntervalMS: 5,
		ReadyTimeoutMS:  80,
		Sleep: func(duration time.Duration) {
			time.Sleep(duration)
		},
	})

	response, serviceError := service.StartTaskPreview(context.Background(), "task-1", StartTaskPreviewRequest{
		TargetID: "sub-1",
		AppRoot:  "apps/web",
		Port:     5123,
	})
	if serviceError != nil {
		t.Fatalf("start task preview failed: %#v", serviceError)
	}
	if response.Preview.Session == nil {
		t.Fatalf("expected preview session")
	}
	if response.Preview.Session.BranchName != "eat/task/member-ui" {
		t.Fatalf("unexpected branch name: %#v", response.Preview.Session.BranchName)
	}
	if response.Preview.Session.Port != 5123 {
		t.Fatalf("unexpected port: %#v", response.Preview.Session.Port)
	}
	if !strings.Contains(response.Preview.Session.Command, "pnpm run dev") {
		t.Fatalf("unexpected command: %#v", response.Preview.Session.Command)
	}
	if !strings.HasSuffix(strings.ReplaceAll(response.Preview.Session.AppRoot, "\\", "/"), "apps/web") {
		t.Fatalf("unexpected app root: %#v", response.Preview.Session.AppRoot)
	}
	if !strings.HasPrefix(harness.lastRuntimeInput().WorktreePath, previewRoot) {
		t.Fatalf("unexpected worktree path: %#v", harness.lastRuntimeInput().WorktreePath)
	}

	harness.emitOutput("ready at http://127.0.0.1:5123/\n")
	harness.markReady("http://127.0.0.1:5123/")
	time.Sleep(20 * time.Millisecond)

	running, serviceError := service.GetTaskPreview(context.Background(), "task-1")
	if serviceError != nil {
		t.Fatalf("get running preview failed: %#v", serviceError)
	}
	if running.Preview.Session == nil || running.Preview.Session.Status != SessionStatusRunning {
		t.Fatalf("unexpected running preview session: %#v", running.Preview.Session)
	}
	if !strings.Contains(running.Preview.Session.Logs, "ready at") {
		t.Fatalf("unexpected preview logs: %#v", running.Preview.Session.Logs)
	}

	stopped, serviceError := service.StopTaskPreview(context.Background(), "task-1")
	if serviceError != nil {
		t.Fatalf("stop task preview failed: %#v", serviceError)
	}
	if stopped.Preview.Session == nil || stopped.Preview.Session.Status != SessionStatusStopped {
		t.Fatalf("unexpected stopped preview session: %#v", stopped.Preview.Session)
	}
	if !strings.Contains(stopped.Preview.Session.Note, "Stopped by operator") {
		t.Fatalf("unexpected stop note: %#v", stopped.Preview.Session.Note)
	}
	if !harness.stopped() {
		t.Fatalf("expected runner stop to be called")
	}
	if !containsArgs(gitCommands, "add") || !containsArgs(gitCommands, "remove") {
		t.Fatalf("unexpected git commands: %#v", gitCommands)
	}
}

func TestStartPreviewReturnsTargetNotFound(t *testing.T) {
	service := NewService(Dependencies{
		ProjectRepository: previewProjectRepository{project: &project.Project{ID: "proj-1", Name: "repo", Path: "/tmp/repo"}},
		TaskRepository: previewTaskRepository{
			task: &task.Task{ID: "task-1", ProjectID: "proj-1", BaseBranch: "main", TaskBranchName: stringPtr("eat/task-mainline")},
		},
		Runner: &runtimeHarness{},
	})

	_, serviceError := service.StartTaskPreview(context.Background(), "task-1", StartTaskPreviewRequest{TargetID: "missing"})
	if serviceError == nil || serviceError.Code != ErrorCodePreviewTargetNotFound {
		t.Fatalf("unexpected error: %#v", serviceError)
	}
}

type previewProjectRepository struct {
	project *project.Project
}

func (r previewProjectRepository) FindProjectByID(context.Context, string) (*project.Project, error) {
	return r.project, nil
}

type previewTaskRepository struct {
	task            *task.Task
	subTasks        []task.SubTask
	integrationRuns []IntegrationRun
}

func (r previewTaskRepository) FindTaskByID(context.Context, string) (*task.Task, error) {
	return r.task, nil
}

func (r previewTaskRepository) ListSubTasksByTaskID(context.Context, string) ([]task.SubTask, error) {
	return r.subTasks, nil
}

func (r previewTaskRepository) ListIntegrationRunsByTaskID(context.Context, string) ([]IntegrationRun, error) {
	return r.integrationRuns, nil
}

type runtimeHarness struct {
	mu         sync.Mutex
	lastInput  RuntimeInput
	stopCalled bool
	readyURLs  map[string]bool
	onOutputs  []func(string)
	onExits    []func(int)
}

func (h *runtimeHarness) Start(_ context.Context, input RuntimeInput) (RuntimeSession, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.lastInput = input
	return h, nil
}

func (h *runtimeHarness) OnExit(callback func(int)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onExits = append(h.onExits, callback)
}

func (h *runtimeHarness) OnOutput(callback func(string)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onOutputs = append(h.onOutputs, callback)
}

func (h *runtimeHarness) Stop() error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.stopCalled = true
	return nil
}

func (h *runtimeHarness) Kill() error {
	return h.Stop()
}

func (h *runtimeHarness) Metadata() workerbackend.RuntimeMetadata {
	return workerbackend.RuntimeMetadata{BackendKind: workerbackend.KindDocker}
}

func (h *runtimeHarness) emitOutput(chunk string) {
	h.mu.Lock()
	callbacks := append([]func(string){}, h.onOutputs...)
	h.mu.Unlock()
	for _, callback := range callbacks {
		callback(chunk)
	}
}

func (h *runtimeHarness) markReady(url string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.readyURLs[url] = true
}

func (h *runtimeHarness) isReady(url string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.readyURLs[url]
}

func (h *runtimeHarness) stopped() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.stopCalled
}

func (h *runtimeHarness) lastRuntimeInput() RuntimeInput {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.lastInput
}

func stringPtr(value string) *string {
	return &value
}

func containsArgs(commands [][]string, match string) bool {
	for _, args := range commands {
		if slicesContain(args, match) {
			return true
		}
	}
	return false
}

func slicesContain(values []string, match string) bool {
	for _, value := range values {
		if value == match {
			return true
		}
	}
	return false
}

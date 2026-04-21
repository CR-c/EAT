package preview

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"eat/backend/internal/project"
	"eat/backend/internal/sandbox"
	"eat/backend/internal/task"
	"eat/backend/internal/workerbackend"
	dockerbackend "eat/backend/internal/workerbackend/docker"
)

const (
	ErrorCodeAppRootNotFound           = "APP_ROOT_NOT_FOUND"
	ErrorCodePreviewCommandRequired    = "PREVIEW_COMMAND_REQUIRED"
	ErrorCodePreviewSandboxUnavailable = "PREVIEW_SANDBOX_UNAVAILABLE"
	ErrorCodePreviewStartFailed        = "PREVIEW_START_FAILED"
	ErrorCodePreviewStopFailed         = "PREVIEW_STOP_FAILED"
	ErrorCodePreviewTargetNotFound     = "PREVIEW_TARGET_NOT_FOUND"
	ErrorCodeProjectNotFound           = "PROJECT_NOT_FOUND"
	ErrorCodeTaskNotFound              = "TASK_NOT_FOUND"
)

const (
	TargetTypeBaseBranch   = "BASE_BRANCH"
	TargetTypeSubTask      = "SUBTASK"
	TargetTypeTaskMainline = "TASK_MAINLINE"
	SessionStatusFailed    = "FAILED"
	SessionStatusRunning   = "RUNNING"
	SessionStatusStarting  = "STARTING"
	SessionStatusStopped   = "STOPPED"
	defaultPreviewHost     = "127.0.0.1"
	defaultPreviewPath     = "/"
	defaultPreviewPort     = 4173
	defaultReadyIntervalMS = 1000
	defaultReadyTimeoutMS  = 30000
	previewLogMaxChars     = 24000
	defaultPreviewImage    = "eat/worker-base:latest"
)

var startableSubTaskStatuses = map[string]bool{
	"ACCEPTED":       true,
	"MERGED":         true,
	"REVIEW_PENDING": true,
	"RUNNING":        true,
}

var candidateIgnoreDirectories = map[string]bool{
	".git": true, ".next": true, ".nuxt": true, ".output": true, ".svelte-kit": true,
	".turbo": true, ".vercel": true, "build": true, "coverage": true, "dist": true,
	"node_modules": true, "out": true,
}

var packageManagerLockfiles = map[string][]string{
	"bun":  []string{"bun.lockb", "bun.lock"},
	"npm":  []string{"package-lock.json", "npm-shrinkwrap.json"},
	"pnpm": []string{"pnpm-lock.yaml"},
	"yarn": []string{"yarn.lock"},
}

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Session struct {
	AppRoot      string `json:"appRoot"`
	BranchName   string `json:"branchName"`
	Command      string `json:"command"`
	ExitCode     *int   `json:"exitCode"`
	Logs         string `json:"logs"`
	Note         string `json:"note"`
	Port         int    `json:"port"`
	StartedAt    string `json:"startedAt"`
	Status       string `json:"status"`
	TargetID     string `json:"targetId"`
	TargetLabel  string `json:"targetLabel"`
	TargetType   string `json:"targetType"`
	UpdatedAt    string `json:"updatedAt"`
	URL          string `json:"url"`
	WorktreePath string `json:"worktreePath"`

	closed   bool
	repoPath string
	runtime  RuntimeSession
}

type Target struct {
	Type        string `json:"type"`
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	BranchName  string `json:"branchName"`
	Recommended bool   `json:"recommended"`
}

type AppRoot struct {
	Command        string `json:"command"`
	Framework      string `json:"framework"`
	Label          string `json:"label"`
	PackageManager string `json:"packageManager"`
	Path           string `json:"path"`
	Recommended    bool   `json:"recommended"`
	absolutePath   string
	score          int
}

type Preview struct {
	AppRoots       []AppRoot      `json:"appRoots"`
	Available      bool           `json:"available"`
	Defaults       map[string]any `json:"defaults"`
	Recommendation map[string]any `json:"recommendation"`
	Session        *Session       `json:"session"`
	Targets        []Target       `json:"targets"`
}

type GetTaskPreviewResult struct {
	Preview Preview `json:"preview"`
}

type StartTaskPreviewRequest struct {
	AppRoot  string `json:"appRoot"`
	Command  string `json:"command"`
	Path     string `json:"path"`
	Port     int    `json:"port"`
	TargetID string `json:"targetId"`
}

type StopTaskPreviewResult = GetTaskPreviewResult

type ProjectRepository interface {
	FindProjectByID(context.Context, string) (*project.Project, error)
}

type TaskRepository interface {
	FindTaskByID(context.Context, string) (*task.Task, error)
	ListSubTasksByTaskID(context.Context, string) ([]task.SubTask, error)
}

type IntegrationRunLister interface {
	ListIntegrationRunsByTaskID(context.Context, string) ([]IntegrationRun, error)
}

type IntegrationRun struct {
	ID                string
	IntegrationBranch string
	Status            string
}

type RuntimeInput struct {
	AppRoot      string
	Command      string
	Port         int
	SessionLabel string
	WorktreePath string
}

type RuntimeSession = workerbackend.RuntimeSession

type RuntimeRunner interface {
	Start(context.Context, RuntimeInput) (RuntimeSession, error)
}

type Dependencies struct {
	ProjectRepository ProjectRepository
	TaskRepository    TaskRepository
	Runner            RuntimeRunner
	ExecutionBackend  workerbackend.Backend
	PreviewRootPath   string
	RunCommand        func(context.Context, string, ...string) error
	FetchReady        func(string) bool
	Now               func() string
	ReadyIntervalMS   int
	ReadyTimeoutMS    int
	Sleep             func(time.Duration)
}

type Service struct {
	projectRepository ProjectRepository
	taskRepository    TaskRepository
	runner            RuntimeRunner
	previewRootPath   string
	runCommand        func(context.Context, string, ...string) error
	fetchReady        func(string) bool
	now               func() string
	readyInterval     time.Duration
	readyTimeout      time.Duration
	sleep             func(time.Duration)

	mu               sync.Mutex
	sessionsByTaskID map[string]*Session
	repoLocks        map[string]*sync.Mutex
}

func NewService(deps Dependencies) *Service {
	previewRootPath := deps.PreviewRootPath
	if strings.TrimSpace(previewRootPath) == "" {
		previewRootPath = filepath.Join(os.TempDir(), ".eat-preview-worktrees")
	}

	runCommand := deps.RunCommand
	if runCommand == nil {
		runCommand = func(ctx context.Context, binary string, args ...string) error {
			cmd := exec.CommandContext(ctx, binary, args...)
			output, err := cmd.CombinedOutput()
			if err != nil {
				return fmt.Errorf("%s %v failed: %w: %s", binary, args, err, strings.TrimSpace(string(output)))
			}
			return nil
		}
	}

	now := deps.Now
	if now == nil {
		now = func() string { return time.Now().UTC().Format(time.RFC3339Nano) }
	}

	sleep := deps.Sleep
	if sleep == nil {
		sleep = func(duration time.Duration) { time.Sleep(duration) }
	}

	readyInterval := time.Duration(defaultReadyIntervalMS) * time.Millisecond
	if deps.ReadyIntervalMS > 0 {
		readyInterval = time.Duration(deps.ReadyIntervalMS) * time.Millisecond
	}
	readyTimeout := time.Duration(defaultReadyTimeoutMS) * time.Millisecond
	if deps.ReadyTimeoutMS > 0 {
		readyTimeout = time.Duration(deps.ReadyTimeoutMS) * time.Millisecond
	}

	runner := deps.Runner
	if runner == nil {
		executionBackend := deps.ExecutionBackend
		if executionBackend == nil {
			executionBackend = dockerbackend.New(sandbox.NewManager())
		}
		runner = &BackendRunner{Backend: executionBackend}
	}

	return &Service{
		projectRepository: deps.ProjectRepository,
		taskRepository:    deps.TaskRepository,
		runner:            runner,
		previewRootPath:   previewRootPath,
		runCommand:        runCommand,
		fetchReady:        deps.FetchReady,
		now:               now,
		readyInterval:     readyInterval,
		readyTimeout:      readyTimeout,
		sleep:             sleep,
		sessionsByTaskID:  make(map[string]*Session),
		repoLocks:         make(map[string]*sync.Mutex),
	}
}

func (s *Service) GetTaskPreview(ctx context.Context, taskID string) (*GetTaskPreviewResult, *Error) {
	taskContext, serviceError := s.loadTaskContext(ctx, taskID)
	if serviceError != nil {
		return nil, serviceError
	}

	appRoots, _ := discoverPreviewAppRoots(taskContext.project.Path)
	recommendation := recommendedTarget(taskContext.targets)
	defaultAppRoot := recommendedAppRoot(appRoots)

	s.mu.Lock()
	session := cloneSession(s.sessionsByTaskID[taskID])
	s.mu.Unlock()

	var recommendationPayload map[string]any
	if recommendation != nil {
		recommendationPayload = map[string]any{
			"label":      recommendation.Label,
			"targetId":   recommendation.ID,
			"targetType": recommendation.Type,
		}
	}

	return &GetTaskPreviewResult{
		Preview: Preview{
			AppRoots:  appRoots,
			Available: true,
			Defaults: map[string]any{
				"appRoot":    appRootPath(defaultAppRoot),
				"command":    appRootCommand(defaultAppRoot),
				"path":       defaultPreviewPath,
				"port":       defaultPreviewPort,
				"targetId":   targetID(recommendation),
				"targetType": targetType(recommendation),
			},
			Recommendation: recommendationPayload,
			Session:        session,
			Targets:        taskContext.targets,
		},
	}, nil
}

func (s *Service) StartTaskPreview(ctx context.Context, taskID string, input StartTaskPreviewRequest) (*GetTaskPreviewResult, *Error) {
	taskContext, serviceError := s.loadTaskContext(ctx, taskID)
	if serviceError != nil {
		return nil, serviceError
	}

	if s.runner == nil {
		return nil, failure(ErrorCodePreviewSandboxUnavailable, "Docker sandbox is required before starting a built-in preview.", nil)
	}

	lock := s.repoLock(taskContext.project.Path)
	lock.Lock()
	defer lock.Unlock()

	target := selectTarget(taskContext.targets, strings.TrimSpace(input.TargetID))
	if target == nil {
		return nil, failure(ErrorCodePreviewTargetNotFound, "No preview target is available for this task yet.", nil)
	}

	_ = s.stopPreviewSession(ctx, taskID, taskContext.project.Path, false)

	projectSegment := sanitizePathSegment(taskContext.project.Name)
	if projectSegment == "" {
		projectSegment = sanitizePathSegment(filepath.Base(taskContext.project.Path))
	}
	baseDir := filepath.Join(s.previewRootPath, projectSegment, taskID)
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, failure(ErrorCodePreviewStartFailed, err.Error(), nil)
	}

	worktreePath, err := os.MkdirTemp(baseDir, "session-")
	if err != nil {
		return nil, failure(ErrorCodePreviewStartFailed, err.Error(), nil)
	}

	if err := s.ensureDetachedWorktree(ctx, taskContext.project.Path, target.BranchName, worktreePath); err != nil {
		_ = s.removeDetachedWorktree(ctx, taskContext.project.Path, worktreePath)
		return nil, failure(ErrorCodePreviewTargetNotFound, fmt.Sprintf("Preview target %s is unavailable.", target.BranchName), map[string]any{"targetId": target.ID})
	}

	appRoots, _ := discoverPreviewAppRoots(worktreePath)
	appRootPath, serviceError := resolvePreviewAppRoot(worktreePath, appRoots, strings.TrimSpace(input.AppRoot))
	if serviceError != nil {
		_ = s.removeDetachedWorktree(ctx, taskContext.project.Path, worktreePath)
		return nil, serviceError
	}

	port := normalizePreviewPort(input.Port, defaultPreviewPort)
	command := strings.TrimSpace(input.Command)
	if command == "" {
		command = resolvePreviewCommand(appRoots, appRootPath, port)
	}
	if command == "" {
		_ = s.removeDetachedWorktree(ctx, taskContext.project.Path, worktreePath)
		return nil, failure(ErrorCodePreviewCommandRequired, "No preview command was detected. Choose an app root or provide a custom command.", map[string]any{"appRoot": relativePath(worktreePath, appRootPath)})
	}

	url := fmt.Sprintf("http://%s:%d%s", defaultPreviewHost, port, normalizePreviewPath(defaultPreviewPath))
	session := &Session{
		AppRoot:      relativePath(worktreePath, appRootPath),
		BranchName:   target.BranchName,
		Command:      command,
		Logs:         "",
		Note:         "Starting preview process.",
		Port:         port,
		StartedAt:    s.now(),
		Status:       SessionStatusStarting,
		TargetID:     target.ID,
		TargetLabel:  target.Label,
		TargetType:   target.Type,
		UpdatedAt:    s.now(),
		URL:          url,
		WorktreePath: worktreePath,
		repoPath:     taskContext.project.Path,
	}

	runtime, err := s.runner.Start(ctx, RuntimeInput{
		AppRoot:      appRootPath,
		Command:      command,
		Port:         port,
		SessionLabel: "eat-preview-" + taskID,
		WorktreePath: worktreePath,
	})
	if err != nil {
		_ = s.removeDetachedWorktree(ctx, taskContext.project.Path, worktreePath)
		return nil, failure(ErrorCodePreviewStartFailed, err.Error(), nil)
	}

	session.runtime = runtime
	runtime.OnOutput(func(chunk string) {
		s.mu.Lock()
		defer s.mu.Unlock()
		current := s.sessionsByTaskID[taskID]
		if current == nil || current != session {
			return
		}
		current.Logs = trimPreviewLog(current.Logs + chunk)
		current.UpdatedAt = s.now()
	})
	runtime.OnExit(func(code int) {
		s.mu.Lock()
		defer s.mu.Unlock()
		current := s.sessionsByTaskID[taskID]
		if current == nil || current != session || current.closed {
			return
		}
		current.ExitCode = &code
		current.UpdatedAt = s.now()
		if current.Status == SessionStatusStopped {
			return
		}
		if code == 0 {
			current.Status = SessionStatusStopped
			current.Note = "Preview process exited."
		} else {
			current.Status = SessionStatusFailed
			current.Note = fmt.Sprintf("Preview process exited with code %d.", code)
		}
	})

	s.mu.Lock()
	s.sessionsByTaskID[taskID] = session
	s.mu.Unlock()

	go s.watchPreviewReadiness(taskID, session)
	return s.GetTaskPreview(ctx, taskID)
}

func (s *Service) StopTaskPreview(ctx context.Context, taskID string) (*GetTaskPreviewResult, *Error) {
	taskContext, serviceError := s.loadTaskContext(ctx, taskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if err := s.stopPreviewSession(ctx, taskID, taskContext.project.Path, true); err != nil {
		return nil, failure(ErrorCodePreviewStopFailed, err.Error(), nil)
	}
	return s.GetTaskPreview(ctx, taskID)
}

type taskContext struct {
	task    *task.Task
	project *project.Project
	targets []Target
}

func (s *Service) loadTaskContext(ctx context.Context, taskID string) (*taskContext, *Error) {
	taskRecord, err := s.taskRepository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	projectRecord, err := s.projectRepository.FindProjectByID(ctx, taskRecord.ProjectID)
	if err != nil {
		return nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"taskId": taskID})
	}

	subTasks, err := s.taskRepository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	var integrationRuns []IntegrationRun
	if lister, ok := s.taskRepository.(IntegrationRunLister); ok {
		integrationRuns, _ = lister.ListIntegrationRunsByTaskID(ctx, taskID)
	}

	return &taskContext{
		task:    taskRecord,
		project: projectRecord,
		targets: buildPreviewTargets(taskRecord, subTasks, integrationRuns),
	}, nil
}

func buildPreviewTargets(taskRecord *task.Task, subTasks []task.SubTask, integrationRuns []IntegrationRun) []Target {
	targets := make([]Target, 0)

	var latestIntegration *IntegrationRun
	for index := range integrationRuns {
		record := integrationRuns[index]
		if strings.TrimSpace(record.IntegrationBranch) == "" || record.Status == "ROLLED_BACK" {
			continue
		}
		latestIntegration = &record
	}
	if latestIntegration != nil {
		targets = append(targets, Target{
			Type:        "INTEGRATION_RUN",
			ID:          latestIntegration.ID,
			Label:       fmt.Sprintf("Integration branch (%s)", latestIntegration.IntegrationBranch),
			Description: "Preview the latest integration branch candidate.",
			BranchName:  latestIntegration.IntegrationBranch,
			Recommended: true,
		})
	}

	if taskRecord.TaskBranchName != nil && strings.TrimSpace(*taskRecord.TaskBranchName) != "" {
		targets = append(targets, Target{
			Type:        TargetTypeTaskMainline,
			ID:          "task-mainline",
			Label:       fmt.Sprintf("Task mainline (%s)", *taskRecord.TaskBranchName),
			Description: "Preview the task mainline branch with accumulated accepted changes.",
			BranchName:  *taskRecord.TaskBranchName,
			Recommended: len(targets) == 0,
		})
	}

	if strings.TrimSpace(taskRecord.BaseBranch) != "" {
		targets = append(targets, Target{
			Type:        TargetTypeBaseBranch,
			ID:          "base-branch",
			Label:       fmt.Sprintf("Base branch (%s)", taskRecord.BaseBranch),
			Description: "Preview the task base branch.",
			BranchName:  taskRecord.BaseBranch,
			Recommended: len(targets) == 0,
		})
	}

	for _, subTaskRecord := range subTasks {
		if subTaskRecord.BranchName == nil || strings.TrimSpace(*subTaskRecord.BranchName) == "" {
			continue
		}
		if !startableSubTaskStatuses[strings.TrimSpace(subTaskRecord.Status)] {
			continue
		}

		labelName := subTaskRecord.Title
		if subTaskRecord.DisplayName != nil && strings.TrimSpace(*subTaskRecord.DisplayName) != "" {
			labelName = *subTaskRecord.DisplayName
		}
		targets = append(targets, Target{
			Type:        TargetTypeSubTask,
			ID:          subTaskRecord.ID,
			Label:       fmt.Sprintf("Subtask (%s)", labelName),
			Description: fmt.Sprintf("Preview branch produced by subtask %s.", subTaskRecord.Title),
			BranchName:  *subTaskRecord.BranchName,
			Recommended: false,
		})
	}

	return targets
}

func discoverPreviewAppRoots(rootPath string) ([]AppRoot, error) {
	type queueEntry struct {
		targetPath string
		depth      int
	}

	queue := []queueEntry{{targetPath: rootPath}}
	visited := map[string]bool{}
	candidates := make([]AppRoot, 0)

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if visited[current.targetPath] {
			continue
		}
		visited[current.targetPath] = true
		if current.depth > 4 {
			continue
		}

		packageJSONPath := filepath.Join(current.targetPath, "package.json")
		if fileExists(packageJSONPath) {
			candidate, err := buildPackagePreviewCandidate(rootPath, current.targetPath, packageJSONPath)
			if err == nil && candidate != nil {
				candidates = append(candidates, *candidate)
			}
		}

		entries, err := os.ReadDir(current.targetPath)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() || candidateIgnoreDirectories[entry.Name()] {
				continue
			}
			queue = append(queue, queueEntry{targetPath: filepath.Join(current.targetPath, entry.Name()), depth: current.depth + 1})
		}
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].Path < candidates[j].Path
		}
		return candidates[i].score > candidates[j].score
	})
	for index := range candidates {
		candidates[index].Recommended = index == 0
	}
	return candidates, nil
}

func buildPackagePreviewCandidate(rootPath, targetPath, packageJSONPath string) (*AppRoot, error) {
	buffer, err := os.ReadFile(packageJSONPath)
	if err != nil {
		return nil, err
	}

	var pkg struct {
		PackageManager  string            `json:"packageManager"`
		Scripts         map[string]string `json:"scripts"`
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(buffer, &pkg); err != nil {
		return nil, err
	}
	if pkg.Scripts["dev"] == "" && pkg.Scripts["preview"] == "" && pkg.Scripts["start"] == "" {
		return nil, nil
	}

	dependencies := map[string]string{}
	for key, value := range pkg.Dependencies {
		dependencies[key] = value
	}
	for key, value := range pkg.DevDependencies {
		dependencies[key] = value
	}

	framework := detectFramework(dependencies)
	packageManager := detectPackageManager(targetPath, strings.TrimSpace(pkg.PackageManager))
	relative := relativePath(rootPath, targetPath)
	command := buildDetectedCommand(framework, packageManager, pkg.Scripts)
	if command == "" {
		return nil, nil
	}

	label := relative
	if label == "." {
		label = fmt.Sprintf("Repository root (%s)", framework)
	} else {
		label = fmt.Sprintf("%s (%s)", relative, framework)
	}

	return &AppRoot{
		Command:        command,
		Framework:      framework,
		Label:          label,
		PackageManager: packageManager,
		Path:           relative,
		absolutePath:   targetPath,
		score:          scorePreviewCandidate(framework, relative, pkg.Scripts),
	}, nil
}

func resolvePreviewAppRoot(worktreePath string, candidates []AppRoot, requested string) (string, *Error) {
	if strings.TrimSpace(requested) != "" {
		for _, candidate := range candidates {
			if candidate.absolutePath == requested || candidate.Path == requested {
				return candidate.absolutePath, nil
			}
		}
		appRoot := filepath.Clean(filepath.Join(worktreePath, requested))
		if inside(appRoot, worktreePath) && fileExists(appRoot) {
			return appRoot, nil
		}
		return "", failure(ErrorCodeAppRootNotFound, fmt.Sprintf("Preview app root %s was not found inside the detached worktree.", requested), map[string]any{"appRoot": requested})
	}

	if candidate := recommendedAppRoot(candidates); candidate != nil && inside(candidate.absolutePath, worktreePath) && fileExists(candidate.absolutePath) {
		return candidate.absolutePath, nil
	}
	if fileExists(worktreePath) {
		return worktreePath, nil
	}
	return "", failure(ErrorCodeAppRootNotFound, "No valid preview app root was found for this task.", nil)
}

func resolvePreviewCommand(candidates []AppRoot, appRoot string, port int) string {
	for _, candidate := range candidates {
		if candidate.absolutePath == appRoot {
			return strings.ReplaceAll(candidate.Command, strconv.Itoa(defaultPreviewPort), strconv.Itoa(port))
		}
	}
	return ""
}

func (s *Service) ensureDetachedWorktree(ctx context.Context, repoPath, revision, worktreePath string) error {
	return s.runCommand(ctx, "git", "-C", repoPath, "worktree", "add", "--detach", worktreePath, revision)
}

func (s *Service) removeDetachedWorktree(ctx context.Context, repoPath, worktreePath string) error {
	_ = s.runCommand(ctx, "git", "-C", repoPath, "worktree", "remove", "--force", worktreePath)
	return os.RemoveAll(worktreePath)
}

func (s *Service) stopPreviewSession(ctx context.Context, taskID, repoPath string, preserve bool) error {
	s.mu.Lock()
	session := s.sessionsByTaskID[taskID]
	s.mu.Unlock()
	if session == nil {
		return nil
	}

	session.closed = true
	session.Status = SessionStatusStopped
	session.UpdatedAt = s.now()
	session.Note = "Stopped by operator."
	if session.runtime != nil {
		_ = session.runtime.Stop()
	}
	if repoPath != "" && session.WorktreePath != "" {
		_ = s.removeDetachedWorktree(ctx, repoPath, session.WorktreePath)
	}
	if !preserve {
		s.mu.Lock()
		delete(s.sessionsByTaskID, taskID)
		s.mu.Unlock()
	}
	return nil
}

func (s *Service) watchPreviewReadiness(taskID string, session *Session) {
	deadline := time.Now().Add(s.readyTimeout)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		current := s.sessionsByTaskID[taskID]
		if current == nil || current != session || current.closed || current.ExitCode != nil || current.Status == SessionStatusStopped || current.Status == SessionStatusFailed {
			s.mu.Unlock()
			return
		}
		s.mu.Unlock()

		if s.fetchReady == nil {
			s.mu.Lock()
			if current := s.sessionsByTaskID[taskID]; current != nil && current == session {
				current.Status = SessionStatusRunning
				current.Note = "Preview process started. Automatic readiness checks are unavailable in this environment."
				current.UpdatedAt = s.now()
			}
			s.mu.Unlock()
			return
		}

		if s.fetchReady(session.URL) {
			s.mu.Lock()
			if current := s.sessionsByTaskID[taskID]; current != nil && current == session {
				current.Status = SessionStatusRunning
				current.Note = fmt.Sprintf("Preview is reachable at %s.", session.URL)
				current.UpdatedAt = s.now()
			}
			s.mu.Unlock()
			return
		}

		s.mu.Lock()
		if current := s.sessionsByTaskID[taskID]; current != nil && current == session {
			current.Note = fmt.Sprintf("Preview process is still running, but %s is not reachable yet.", session.URL)
			current.UpdatedAt = s.now()
		}
		s.mu.Unlock()
		s.sleep(s.readyInterval)
	}

	s.mu.Lock()
	if current := s.sessionsByTaskID[taskID]; current != nil && current == session && !current.closed && current.Status == SessionStatusStarting {
		current.Status = SessionStatusFailed
		current.Note = "Preview did not become reachable before the readiness timeout."
		current.UpdatedAt = s.now()
	}
	s.mu.Unlock()
}

func (s *Service) repoLock(repoPath string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	lock, ok := s.repoLocks[repoPath]
	if !ok {
		lock = &sync.Mutex{}
		s.repoLocks[repoPath] = lock
	}
	return lock
}

type BackendRunner struct {
	Backend workerbackend.Backend
}

func (r *BackendRunner) Start(ctx context.Context, input RuntimeInput) (RuntimeSession, error) {
	if r == nil || r.Backend == nil {
		return nil, fmt.Errorf("preview execution backend is not configured")
	}
	return r.Backend.StartWorker(ctx, workerbackend.StartWorkerInput{
		WorkDir:         input.WorktreePath,
		Command:         []string{"/bin/bash", "-lc", buildPreviewLaunchCommand(input.AppRoot, input.Command)},
		NetworkProfile:  "DEFAULT",
		ReadwriteMounts: []string{input.WorktreePath},
		PublishedPorts: []workerbackend.PortMapping{{
			HostPort:      input.Port,
			ContainerPort: input.Port,
		}},
	})
}

func buildPreviewLaunchCommand(appRoot, command string) string {
	return fmt.Sprintf("cd %s && %s", shellEscape(appRoot), command)
}

func detectPackageManager(targetPath, declared string) string {
	switch {
	case strings.HasPrefix(declared, "pnpm"):
		return "pnpm"
	case strings.HasPrefix(declared, "yarn"):
		return "yarn"
	case strings.HasPrefix(declared, "bun"):
		return "bun"
	case strings.HasPrefix(declared, "npm"):
		return "npm"
	}
	for manager, lockfiles := range packageManagerLockfiles {
		for _, lockfile := range lockfiles {
			if fileExists(filepath.Join(targetPath, lockfile)) {
				return manager
			}
		}
	}
	return "npm"
}

func detectFramework(dependencies map[string]string) string {
	switch {
	case dependencies["next"] != "":
		return "next"
	case dependencies["nuxt"] != "" || dependencies["nuxt-edge"] != "":
		return "nuxt"
	case dependencies["react-scripts"] != "":
		return "react-scripts"
	case dependencies["@sveltejs/kit"] != "":
		return "sveltekit"
	case dependencies["vite"] != "":
		if dependencies["react"] != "" {
			return "vite-react"
		}
		return "vite"
	case dependencies["vue"] != "":
		return "vue"
	case dependencies["react"] != "":
		return "react"
	case dependencies["express"] != "" || dependencies["fastify"] != "" || dependencies["koa"] != "":
		return "node"
	default:
		return "web"
	}
}

func buildDetectedCommand(framework, packageManager string, scripts map[string]string) string {
	runner := map[string]string{"yarn": "yarn", "pnpm": "pnpm", "bun": "bun"}[packageManager]
	if runner == "" {
		runner = "npm"
	}

	if scripts["preview"] != "" {
		if framework == "next" {
			return fmt.Sprintf("%s run preview -- --hostname 0.0.0.0 --port %d", runner, defaultPreviewPort)
		}
		return fmt.Sprintf("%s run preview -- --host 0.0.0.0 --port %d", runner, defaultPreviewPort)
	}
	if scripts["dev"] != "" {
		switch framework {
		case "next":
			return fmt.Sprintf("%s run dev -- --hostname 0.0.0.0 --port %d", runner, defaultPreviewPort)
		case "react-scripts":
			if runner == "npm" {
				return fmt.Sprintf("HOST=0.0.0.0 PORT=%d BROWSER=none npm run start", defaultPreviewPort)
			}
			return fmt.Sprintf("HOST=0.0.0.0 PORT=%d BROWSER=none %s start", defaultPreviewPort, runner)
		case "node":
			if runner == "npm" {
				return "npm run dev"
			}
			return runner + " dev"
		default:
			return fmt.Sprintf("%s run dev -- --host 0.0.0.0 --port %d", runner, defaultPreviewPort)
		}
	}
	if scripts["start"] != "" {
		if framework == "react-scripts" {
			if runner == "npm" {
				return fmt.Sprintf("HOST=0.0.0.0 PORT=%d BROWSER=none npm run start", defaultPreviewPort)
			}
			return fmt.Sprintf("HOST=0.0.0.0 PORT=%d BROWSER=none %s start", defaultPreviewPort, runner)
		}
		if runner == "npm" {
			return "npm run start"
		}
		return runner + " start"
	}
	return ""
}

func scorePreviewCandidate(framework, relativePath string, scripts map[string]string) int {
	score := 0
	if scripts["preview"] != "" {
		score += 6
	}
	if scripts["dev"] != "" {
		score += 5
	}
	if scripts["start"] != "" {
		score += 2
	}
	switch {
	case relativePath == "." || relativePath == "apps/web" || strings.HasSuffix(relativePath, "/web"):
		score += 4
	case strings.HasPrefix(relativePath, "apps/"):
		score += 3
	}
	if framework == "next" || framework == "react" || framework == "vite-react" || framework == "vite" || framework == "vue" || framework == "sveltekit" || framework == "nuxt" {
		score += 2
	}
	return score
}

func normalizePreviewPort(value, fallback int) int {
	if value >= 1000 && value <= 65535 {
		return value
	}
	return fallback
}

func normalizePreviewPath(value string) string {
	if strings.TrimSpace(value) == "" {
		return defaultPreviewPath
	}
	if strings.HasPrefix(value, "/") {
		return value
	}
	return "/" + value
}

func trimPreviewLog(text string) string {
	if len(text) > previewLogMaxChars {
		return text[len(text)-previewLogMaxChars:]
	}
	return text
}

func shellEscape(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func sanitizePathSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "preview"
	}
	builder := strings.Builder{}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('-')
		}
	}
	result := strings.Trim(builder.String(), "-")
	if result == "" {
		return "preview"
	}
	return result
}

func fileExists(targetPath string) bool {
	_, err := os.Stat(targetPath)
	return err == nil
}

func inside(targetPath, rootPath string) bool {
	target := filepath.Clean(targetPath)
	root := filepath.Clean(rootPath)
	return target == root || strings.HasPrefix(target, root+string(os.PathSeparator))
}

func relativePath(rootPath, targetPath string) string {
	relative, err := filepath.Rel(rootPath, targetPath)
	if err != nil || strings.TrimSpace(relative) == "" {
		return "."
	}
	return filepath.ToSlash(relative)
}

func recommendedTarget(targets []Target) *Target {
	for index := range targets {
		if targets[index].Recommended {
			return &targets[index]
		}
	}
	if len(targets) == 0 {
		return nil
	}
	return &targets[0]
}

func recommendedAppRoot(appRoots []AppRoot) *AppRoot {
	for index := range appRoots {
		if appRoots[index].Recommended {
			return &appRoots[index]
		}
	}
	if len(appRoots) == 0 {
		return nil
	}
	return &appRoots[0]
}

func selectTarget(targets []Target, requestedID string) *Target {
	if requestedID != "" {
		for index := range targets {
			if targets[index].ID == requestedID {
				return &targets[index]
			}
		}
		return nil
	}
	return recommendedTarget(targets)
}

func targetID(target *Target) string {
	if target == nil {
		return ""
	}
	return target.ID
}

func targetType(target *Target) string {
	if target == nil {
		return ""
	}
	return target.Type
}

func appRootPath(appRoot *AppRoot) string {
	if appRoot == nil {
		return ""
	}
	return appRoot.Path
}

func appRootCommand(appRoot *AppRoot) string {
	if appRoot == nil {
		return ""
	}
	return appRoot.Command
}

func cloneSession(session *Session) *Session {
	if session == nil {
		return nil
	}
	copy := *session
	copy.runtime = nil
	return &copy
}

func failure(code, message string, details map[string]any) *Error {
	return &Error{Code: code, Message: message, Details: details}
}

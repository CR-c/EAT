package host

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"eat/backend/internal/workerbackend"
)

const (
	EnableEnvVar            = "EAT_ENABLE_TRUSTED_HOST_BACKEND"
	AllowedRootsEnvVar      = "EAT_TRUSTED_HOST_ALLOWED_ROOTS"
	defaultTrustLevel       = "REDUCED_ISOLATION"
	gracefulStopWindow      = 3 * time.Second
	defaultWorktreeRootName = ".eat-worktrees"
)

type Backend struct {
	enabled bool
}

func New(enabled bool) *Backend {
	return &Backend{enabled: enabled}
}

func EnabledFromEnv() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(EnableEnvVar)))
	switch value {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func (b *Backend) Kind() string {
	return workerbackend.KindHost
}

func (b *Backend) Status(context.Context) workerbackend.Status {
	status := workerbackend.Status{
		Kind:       workerbackend.KindHost,
		Available:  b != nil && b.enabled,
		TrustLevel: defaultTrustLevel,
		Dependencies: []string{
			EnableEnvVar,
			AllowedRootsEnvVar,
			filepath.Join(os.TempDir(), defaultWorktreeRootName),
			"trusted local machine",
		},
	}
	if !status.Available {
		status.Reason = fmt.Sprintf("trusted host backend is disabled; set %s=1 to enable reduced-isolation execution", EnableEnvVar)
	}
	return status
}

func (b *Backend) StartWorker(ctx context.Context, input workerbackend.StartWorkerInput) (workerbackend.RuntimeSession, error) {
	if b == nil || !b.enabled {
		return nil, fmt.Errorf("trusted host backend is disabled")
	}
	if len(input.Command) == 0 {
		return nil, fmt.Errorf("trusted host backend requires a command")
	}
	workDir := strings.TrimSpace(input.WorkDir)
	if workDir == "" {
		return nil, fmt.Errorf("trusted host backend requires a working directory")
	}
	if stat, err := os.Stat(workDir); err != nil || !stat.IsDir() {
		return nil, fmt.Errorf("trusted host backend workdir %s is not available", workDir)
	}
	if !isAllowedWorkDir(workDir) {
		return nil, fmt.Errorf("trusted host backend only allows workdirs under orchestrator-managed roots; rejected %s", workDir)
	}

	runCtx, cancel := context.WithCancel(ctx)
	cmd := exec.CommandContext(runCtx, input.Command[0], input.Command[1:]...)
	cmd.Dir = workDir
	cmd.Env = mergeEnv(os.Environ(), input.Env)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("open stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("open stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start host worker: %w", err)
	}

	session := &runtimeSession{
		cancel: cancel,
		cmd:    cmd,
		metadata: workerbackend.RuntimeMetadata{
			BackendKind: workerbackend.KindHost,
			PID:         cmd.Process.Pid,
		},
	}
	go session.captureOutput(stdout)
	go session.captureOutput(stderr)
	go session.wait()
	return session, nil
}

type runtimeSession struct {
	mu       sync.Mutex
	cancel   context.CancelFunc
	cmd      *exec.Cmd
	metadata workerbackend.RuntimeMetadata
	onExit   []func(int)
	onOutput []func(string)
	exited   bool
}

func (s *runtimeSession) OnOutput(callback func(string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onOutput = append(s.onOutput, callback)
}

func (s *runtimeSession) OnExit(callback func(int)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onExit = append(s.onExit, callback)
}

func (s *runtimeSession) Stop() error {
	s.mu.Lock()
	cmd := s.cmd
	exited := s.exited
	s.mu.Unlock()
	if exited || cmd == nil || cmd.Process == nil {
		return nil
	}
	if goruntime.GOOS == "windows" {
		return s.Kill()
	}
	if err := cmd.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	go func(process *os.Process) {
		time.Sleep(gracefulStopWindow)
		_ = process.Kill()
	}(cmd.Process)
	return nil
}

func (s *runtimeSession) Kill() error {
	s.mu.Lock()
	cmd := s.cmd
	exited := s.exited
	s.mu.Unlock()
	if exited || cmd == nil || cmd.Process == nil {
		return nil
	}
	if err := cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return nil
}

func (s *runtimeSession) Metadata() workerbackend.RuntimeMetadata {
	return s.metadata
}

func (s *runtimeSession) captureOutput(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		s.dispatchOutput(scanner.Text() + "\n")
	}
}

func (s *runtimeSession) wait() {
	exitCode := 0
	if err := s.cmd.Wait(); err != nil {
		exitCode = 1
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() >= 0 {
			exitCode = exitErr.ExitCode()
		}
	}
	s.cancel()
	s.dispatchExit(exitCode)
}

func (s *runtimeSession) dispatchOutput(chunk string) {
	s.mu.Lock()
	callbacks := append([]func(string){}, s.onOutput...)
	s.mu.Unlock()
	for _, callback := range callbacks {
		callback(chunk)
	}
}

func (s *runtimeSession) dispatchExit(code int) {
	s.mu.Lock()
	if s.exited {
		s.mu.Unlock()
		return
	}
	s.exited = true
	callbacks := append([]func(int){}, s.onExit...)
	s.mu.Unlock()
	for _, callback := range callbacks {
		callback(code)
	}
}

func mergeEnv(base []string, extra map[string]string) []string {
	merged := make(map[string]string, len(base)+len(extra))
	for _, entry := range base {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) != 2 {
			continue
		}
		merged[parts[0]] = parts[1]
	}
	for key, value := range extra {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		merged[key] = value
	}
	result := make([]string, 0, len(merged))
	for key, value := range merged {
		result = append(result, key+"="+value)
	}
	return result
}

func allowedRoots() []string {
	roots := []string{filepath.Join(os.TempDir(), defaultWorktreeRootName)}
	if raw := strings.TrimSpace(os.Getenv(AllowedRootsEnvVar)); raw != "" {
		for _, item := range strings.Split(raw, string(os.PathListSeparator)) {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			roots = append(roots, item)
		}
	}
	return normalizeRoots(roots)
}

func normalizeRoots(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		cleaned, err := filepath.Abs(strings.TrimSpace(value))
		if err != nil || cleaned == "" {
			continue
		}
		cleaned = filepath.Clean(cleaned)
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		result = append(result, cleaned)
	}
	return result
}

func isAllowedWorkDir(workDir string) bool {
	candidate, err := filepath.Abs(strings.TrimSpace(workDir))
	if err != nil || candidate == "" {
		return false
	}
	candidate = filepath.Clean(candidate)
	for _, root := range allowedRoots() {
		if candidate == root {
			return true
		}
		prefix := root + string(os.PathSeparator)
		if strings.HasPrefix(candidate, prefix) {
			return true
		}
	}
	return false
}

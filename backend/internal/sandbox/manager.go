package sandbox

import (
	"bufio"
	"context"
	"eat/backend/internal/workerbackend"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
)

// Health represents Docker daemon health status.
type Health struct {
	Available     bool   `json:"available"`
	Reason        string `json:"reason,omitempty"`
	ServerVersion string `json:"serverVersion,omitempty"`
	ImageReady    bool   `json:"imageReady,omitempty"`
}

// Policy represents sandbox defaults.
type Policy struct {
	WorkerDefault  string `json:"workerDefault"`
	PreviewDefault string `json:"previewDefault"`
}

// SandboxConfig holds validated container launch parameters.
type SandboxConfig struct {
	ContainerImage  string
	ContainerUser   string
	NetworkProfile  string // "ISOLATED", "HOST", "DEFAULT"
	ReadwriteMounts []string
	ReadonlyMounts  []string
	PublishedPorts  []PortMapping
	WorkDir         string
}

// PortMapping maps host to container port.
type PortMapping struct {
	HostPort      int
	ContainerPort int
}

// ContainerRuntime is the handle returned after spawning a container.
type ContainerRuntime struct {
	ContainerID string
	PID         int
	SessionID   string

	mu              sync.Mutex
	outputListeners []func(string)
	exitListeners   []func(int)
	cmd             *exec.Cmd
	stdin           io.WriteCloser
	done            chan struct{}
	exitCode        int
	manager         *Manager
}

// OnOutput registers a callback for stdout/stderr output.
func (r *ContainerRuntime) OnOutput(fn func(string)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.outputListeners = append(r.outputListeners, fn)
}

// OnExit registers a callback for process exit.
func (r *ContainerRuntime) OnExit(fn func(int)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.exitListeners = append(r.exitListeners, fn)
}

func (r *ContainerRuntime) emitOutput(text string) {
	r.mu.Lock()
	listeners := make([]func(string), len(r.outputListeners))
	copy(listeners, r.outputListeners)
	r.mu.Unlock()
	for _, fn := range listeners {
		fn(text)
	}
}

func (r *ContainerRuntime) emitExit(code int) {
	r.mu.Lock()
	listeners := make([]func(int), len(r.exitListeners))
	copy(listeners, r.exitListeners)
	r.mu.Unlock()
	for _, fn := range listeners {
		fn(code)
	}
}

// Kill forcefully terminates the container.
func (r *ContainerRuntime) Kill() error {
	if r.cmd != nil && r.cmd.Process != nil {
		_ = r.cmd.Process.Kill()
	}
	return r.manager.removeContainer(context.Background(), r.ContainerID, true)
}

// Stop gracefully stops the container.
func (r *ContainerRuntime) Stop() error {
	if r.stdin != nil {
		_ = r.stdin.Close()
	}
	ctx := context.Background()
	if err := r.manager.stopContainer(ctx, r.ContainerID); err != nil {
		return err
	}
	return r.manager.removeContainer(ctx, r.ContainerID, false)
}

// SendInput writes data to the container's stdin.
func (r *ContainerRuntime) SendInput(message string) error {
	if r.stdin == nil {
		return fmt.Errorf("container stdin is not writable")
	}
	_, err := io.WriteString(r.stdin, message)
	return err
}

// Wait blocks until the container process exits.
func (r *ContainerRuntime) Wait() {
	<-r.done
}

// Metadata exposes Docker runtime details through the generic worker runtime contract.
func (r *ContainerRuntime) Metadata() workerbackend.RuntimeMetadata {
	if r == nil {
		return workerbackend.RuntimeMetadata{BackendKind: "docker"}
	}
	return workerbackend.RuntimeMetadata{
		BackendKind: "docker",
		ContainerID: r.ContainerID,
		PID:         r.PID,
	}
}

// Manager manages Docker sandbox containers.
type Manager struct {
	WorkerImage   string
	ContainerUser string
	WorktreeRoot  string
	UploadRoot    string
}

func NewManager() *Manager {
	workerImage := os.Getenv("EAT_WORKER_IMAGE")
	if workerImage == "" {
		workerImage = "eat/worker-base:latest"
	}
	containerUser := os.Getenv("EAT_WORKER_CONTAINER_USER")
	if containerUser == "" {
		containerUser = fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid())
	}
	worktreeRoot := os.Getenv("EAT_WORKTREE_ROOT")
	if worktreeRoot == "" {
		worktreeRoot = filepath.Join(os.TempDir(), ".eat-worktrees")
	}
	uploadRoot := os.Getenv("EAT_UPLOAD_ROOT")
	if uploadRoot == "" {
		cwd, _ := os.Getwd()
		uploadRoot = filepath.Join(cwd, "uploads")
	}
	return &Manager{
		WorkerImage:   workerImage,
		ContainerUser: containerUser,
		WorktreeRoot:  worktreeRoot,
		UploadRoot:    uploadRoot,
	}
}

// DockerHealth checks Docker daemon, image, and tooling availability.
func (m *Manager) DockerHealth(ctx context.Context) Health {
	if _, err := exec.LookPath("docker"); err != nil {
		return Health{Available: false, Reason: "docker executable not found"}
	}

	out, err := m.runDocker(ctx, "version", "--format", "{{.Server.Version}}")
	if err != nil {
		return Health{Available: false, Reason: "docker daemon unreachable: " + err.Error()}
	}
	serverVersion := strings.TrimSpace(out)

	_, err = m.runDocker(ctx, "image", "inspect", m.WorkerImage, "--format", "{{.Id}}")
	if err != nil {
		return Health{
			Available:     false,
			Reason:        fmt.Sprintf("worker image %s not available locally", m.WorkerImage),
			ServerVersion: serverVersion,
		}
	}

	return Health{Available: true, ServerVersion: serverVersion, ImageReady: true}
}

// Policy returns sandbox defaults.
func (m *Manager) Policy() Policy {
	return Policy{WorkerDefault: "DOCKER", PreviewDefault: "DOCKER"}
}

// ExecutionBackends reports the currently known worker execution backends.
func (m *Manager) ExecutionBackends(ctx context.Context) []workerbackend.Status {
	health := m.DockerHealth(ctx)
	backend := workerbackend.Status{
		Kind:       "docker",
		Available:  health.Available,
		Default:    true,
		TrustLevel: "SANDBOXED",
		Dependencies: []string{
			"docker daemon",
			m.WorkerImage,
		},
	}
	if !health.Available {
		backend.Reason = health.Reason
	}
	return []workerbackend.Status{backend}
}

// CreateWorkerSandboxConfig builds a validated sandbox configuration.
func (m *Manager) CreateWorkerSandboxConfig(worktreePath string, attachmentPaths []string) SandboxConfig {
	readonlyMounts := uniqueStrings(attachmentPaths)
	return SandboxConfig{
		ContainerImage:  m.WorkerImage,
		ContainerUser:   m.ContainerUser,
		NetworkProfile:  "ISOLATED",
		ReadwriteMounts: []string{worktreePath},
		ReadonlyMounts:  readonlyMounts,
		WorkDir:         worktreePath,
	}
}

// SpawnContainerSession creates and starts a Docker container, returning a runtime handle.
func (m *Manager) SpawnContainerSession(ctx context.Context, sandbox SandboxConfig, command []string, env map[string]string) (*ContainerRuntime, error) {
	health := m.DockerHealth(ctx)
	if !health.Available {
		return nil, fmt.Errorf("docker not ready: %s", health.Reason)
	}

	if len(command) == 0 {
		command = []string{"sh", "-lc", "printf 'No sandbox command was configured.\\n'"}
	}

	sessionLabel := fmt.Sprintf("eat-%s", uuid.New().String())

	// Build docker create args
	args := []string{
		"create",
		"--interactive",
		"--init",
		"--label", fmt.Sprintf("eat.session=%s", sessionLabel),
		"--user", sandbox.ContainerUser,
		"--workdir", sandbox.WorkDir,
	}

	switch sandbox.NetworkProfile {
	case "ISOLATED":
		args = append(args, "--network", "none")
	case "HOST":
		args = append(args, "--network", "host")
	}

	for k, v := range env {
		args = append(args, "--env", fmt.Sprintf("%s=%s", k, v))
	}

	for _, p := range sandbox.PublishedPorts {
		args = append(args, "--publish", fmt.Sprintf("127.0.0.1:%d:%d", p.HostPort, p.ContainerPort))
	}

	for _, mount := range sandbox.ReadwriteMounts {
		args = append(args, "--mount", fmt.Sprintf("type=bind,src=%s,dst=%s", mount, mount))
	}

	for _, mount := range sandbox.ReadonlyMounts {
		args = append(args, "--mount", fmt.Sprintf("type=bind,src=%s,dst=%s,readonly", mount, mount))
	}

	args = append(args, sandbox.ContainerImage)
	args = append(args, command...)

	// Create container
	containerID, err := m.runDocker(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("docker create failed: %w", err)
	}
	containerID = strings.TrimSpace(containerID)

	// Start and attach
	cmd := exec.CommandContext(ctx, "docker", "start", "--attach", "--interactive", containerID)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = m.removeContainer(ctx, containerID, true)
		return nil, fmt.Errorf("failed to get stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = m.removeContainer(ctx, containerID, true)
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = m.removeContainer(ctx, containerID, true)
		return nil, fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		_ = m.removeContainer(ctx, containerID, true)
		return nil, fmt.Errorf("docker start failed: %w", err)
	}

	runtime := &ContainerRuntime{
		ContainerID: containerID,
		PID:         cmd.Process.Pid,
		SessionID:   fmt.Sprintf("docker_%s", uuid.New().String()),
		cmd:         cmd,
		stdin:       stdin,
		done:        make(chan struct{}),
		manager:     m,
	}

	// Stream stdout and stderr to output listeners
	streamPipe := func(pipe io.Reader) {
		scanner := bufio.NewScanner(pipe)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			runtime.emitOutput(scanner.Text() + "\n")
		}
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); streamPipe(stdout) }()
	go func() { defer wg.Done(); streamPipe(stderr) }()

	// Wait for process exit in background
	go func() {
		wg.Wait()
		err := cmd.Wait()
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = -1
			}
		}
		runtime.exitCode = exitCode
		_ = m.removeContainer(context.Background(), containerID, true)
		runtime.emitExit(exitCode)
		close(runtime.done)
	}()

	return runtime, nil
}

func (m *Manager) runDocker(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return string(out), nil
}

func (m *Manager) stopContainer(ctx context.Context, containerID string) error {
	_, err := m.runDocker(ctx, "stop", containerID)
	return err
}

func (m *Manager) removeContainer(ctx context.Context, containerID string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, containerID)
	_, err := m.runDocker(ctx, args...)
	return err
}

func uniqueStrings(input []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(input))
	for _, s := range input {
		if !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}

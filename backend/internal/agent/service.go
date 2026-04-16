package agent

import (
	"bufio"
	"bytes"
	"context"
	"eat/backend/internal/workerbackend"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"eat/backend/internal/sandbox"

	"github.com/google/uuid"
)

// SpawnConfig holds parameters for spawning an agent session.
type SpawnConfig struct {
	Prompt      string
	WorkDir     string
	BranchName  string
	SessionType string // "WORKER" or "LEAD"
	Sandbox     *sandbox.SandboxConfig
	Attachments []AttachmentRef
}

// AttachmentRef is a reference to a task attachment.
type AttachmentRef struct {
	AttachmentID string
	FileName     string
	FilePath     string
	FileType     string
}

// Service manages agent definitions and spawning.
type Service struct {
	sandbox         *sandbox.Manager
	leadTurnRunners map[string]LeadTurnRunner
}

type LeadTurnConfig struct {
	Prompt  string
	WorkDir string
}

type LeadTurnResult struct {
	Response  string
	RawOutput string
}

type LeadTurnRunner func(ctx context.Context, config LeadTurnConfig) (*LeadTurnResult, error)

type CapabilitySet struct {
	CanOrchestrate           bool     `json:"canOrchestrate"`
	CanExecute               bool     `json:"canExecute"`
	Description              string   `json:"description"`
	SupportedSandboxTypes    []string `json:"supportedSandboxTypes"`
	SupportsInteractiveInput bool     `json:"supportsInteractiveInput"`
	SupportsVision           bool     `json:"supportsVision"`
}

type Descriptor struct {
	Name               string        `json:"name"`
	RuntimeMode        string        `json:"runtimeMode"`
	UsesSandboxManager bool          `json:"usesSandboxManager"`
	Capabilities       CapabilitySet `json:"capabilities"`
	Roles              struct {
		LeadCandidate   bool `json:"leadCandidate"`
		WorkerCandidate bool `json:"workerCandidate"`
	} `json:"roles"`
}

type HealthCheck struct {
	Name    string         `json:"name"`
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type FailureReason struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type HealthSnapshot struct {
	Available                  bool           `json:"available"`
	OrchestrationAvailable     bool           `json:"orchestrationAvailable"`
	ExecutionAvailable         bool           `json:"executionAvailable"`
	RuntimeMode                string         `json:"runtimeMode"`
	Version                    string         `json:"version,omitempty"`
	Checks                     []HealthCheck  `json:"checks"`
	FailureReason              *FailureReason `json:"failureReason,omitempty"`
	OrchestrationFailureReason *FailureReason `json:"orchestrationFailureReason,omitempty"`
	ExecutionFailureReason     *FailureReason `json:"executionFailureReason,omitempty"`
}

func NewService(sandboxManager *sandbox.Manager) *Service {
	return &Service{
		sandbox: sandboxManager,
		leadTurnRunners: map[string]LeadTurnRunner{
			"claude-cli": runClaudeLeadTurn,
			"codex-cli":  runCodexLeadTurn,
		},
	}
}

func (s *Service) SetLeadTurnRunner(agentType string, runner LeadTurnRunner) {
	if strings.TrimSpace(agentType) == "" {
		return
	}
	if s.leadTurnRunners == nil {
		s.leadTurnRunners = make(map[string]LeadTurnRunner)
	}
	s.leadTurnRunners[agentType] = runner
}

func (s *Service) RunLeadTurn(ctx context.Context, agentType string, config LeadTurnConfig) (*LeadTurnResult, error) {
	if strings.TrimSpace(agentType) == "" {
		return nil, fmt.Errorf("agent type is required")
	}
	if strings.TrimSpace(config.Prompt) == "" {
		return nil, fmt.Errorf("lead prompt is required")
	}
	if s.leadTurnRunners == nil {
		return nil, fmt.Errorf("no lead turn runners are configured")
	}
	runner := s.leadTurnRunners[agentType]
	if runner == nil {
		return nil, fmt.Errorf("agent %s does not support lead turns", agentType)
	}
	return runner(ctx, config)
}

func (s *Service) ListAgents() []Descriptor {
	definitions := builtInDefinitions()
	result := make([]Descriptor, 0, len(definitions))
	for _, definition := range definitions {
		descriptor := Descriptor{
			Name:               definition.Name,
			RuntimeMode:        definition.RuntimeMode,
			UsesSandboxManager: s.sandbox != nil,
			Capabilities:       definition.Capabilities,
		}
		descriptor.Roles.LeadCandidate = definition.Capabilities.CanOrchestrate
		descriptor.Roles.WorkerCandidate = definition.Capabilities.CanExecute
		result = append(result, descriptor)
	}
	return result
}

func (s *Service) GetHealth(context.Context) map[string]HealthSnapshot {
	definitions := builtInDefinitions()
	result := make(map[string]HealthSnapshot, len(definitions))
	for _, definition := range definitions {
		result[definition.Name] = definition.Health(s.sandbox)
	}
	return result
}

// SpawnSession spawns a worker session for the given agent type.
// Returns a generic worker runtime handle backed by the configured execution backend.
func (s *Service) SpawnSession(ctx context.Context, agentType string, config SpawnConfig) (workerbackend.RuntimeSession, error) {
	definitions := builtInDefinitions()
	var def *builtInDefinition
	for i := range definitions {
		if definitions[i].Name == agentType {
			def = &definitions[i]
			break
		}
	}
	if def == nil {
		return nil, fmt.Errorf("unknown agent type: %s", agentType)
	}
	if def.RuntimeMode == "STUB" {
		return nil, fmt.Errorf("agent %s is in STUB mode and cannot spawn sessions", agentType)
	}
	if !def.Capabilities.CanExecute {
		return nil, fmt.Errorf("agent %s does not support execution", agentType)
	}
	if def.Spawn == nil {
		return nil, fmt.Errorf("agent %s has no spawn implementation", agentType)
	}
	return def.Spawn(ctx, s.sandbox, config)
}

type builtInDefinition struct {
	Name         string
	RuntimeMode  string
	Capabilities CapabilitySet
	Health       func(*sandbox.Manager) HealthSnapshot
	Spawn        func(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (workerbackend.RuntimeSession, error)
}

func builtInDefinitions() []builtInDefinition {
	return []builtInDefinition{
		{
			Name:        "claude-cli",
			RuntimeMode: "REAL",
			Capabilities: CapabilitySet{
				CanOrchestrate:           true,
				CanExecute:               true,
				Description:              "Anthropic Claude Code for host-side lead flows and Docker-sandboxed worker execution.",
				SupportedSandboxTypes:    []string{"HOST", "DOCKER"},
				SupportsInteractiveInput: true,
				SupportsVision:           true,
			},
			Health: func(mgr *sandbox.Manager) HealthSnapshot { return cliHealth("claude-cli", "claude", mgr) },
			Spawn:  spawnClaudeWorker,
		},
		{
			Name:        "codex-cli",
			RuntimeMode: "REAL",
			Capabilities: CapabilitySet{
				CanOrchestrate:           true,
				CanExecute:               true,
				Description:              "OpenAI Codex CLI for host-side lead flows and Docker-sandboxed worker execution.",
				SupportedSandboxTypes:    []string{"HOST", "DOCKER"},
				SupportsInteractiveInput: true,
				SupportsVision:           false,
			},
			Health: codexHealth,
			Spawn:  spawnCodexWorker,
		},
		{
			Name:        "gemini-cli",
			RuntimeMode: "REAL",
			Capabilities: CapabilitySet{
				CanOrchestrate:           false,
				CanExecute:               true,
				Description:              "Google Gemini CLI for Docker-sandboxed worker execution.",
				SupportedSandboxTypes:    []string{"HOST", "DOCKER"},
				SupportsInteractiveInput: true,
				SupportsVision:           true,
			},
			Health: func(mgr *sandbox.Manager) HealthSnapshot { return cliHealth("gemini-cli", "gemini", mgr) },
			Spawn:  spawnGeminiWorker,
		},
	}
}

// spawnCodexWorker launches a Codex CLI worker inside a Docker container.
func spawnCodexWorker(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (workerbackend.RuntimeSession, error) {
	if mgr == nil {
		return nil, fmt.Errorf("docker sandbox manager is required for Codex worker sessions")
	}

	codexPackagePath := os.Getenv("EAT_CODEX_PACKAGE_PATH")
	if codexPackagePath == "" {
		codexPackagePath = "/usr/local/lib/node_modules/@openai/codex"
	}
	codexModel := os.Getenv("EAT_CODEX_MODEL")
	runtimeHomeRoot := os.Getenv("EAT_CODEX_RUNTIME_ROOT")
	if runtimeHomeRoot == "" {
		home, _ := os.UserHomeDir()
		runtimeHomeRoot = filepath.Join(home, ".eat-codex-runtime")
	}

	// Prepare runtime home for this session
	sessionID := uuid.New().String()
	runtimeHomePath := filepath.Join(runtimeHomeRoot, "session-"+sessionID)
	codexHomePath := filepath.Join(runtimeHomePath, ".codex")
	if err := os.MkdirAll(codexHomePath, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create codex runtime home: %w", err)
	}

	// Copy auth.json if exists
	authSrc := os.Getenv("EAT_CODEX_AUTH_PATH")
	if authSrc == "" {
		home, _ := os.UserHomeDir()
		authSrc = filepath.Join(home, ".codex", "auth.json")
	}
	if data, err := os.ReadFile(authSrc); err == nil {
		_ = os.WriteFile(filepath.Join(codexHomePath, "auth.json"), data, 0o600)
	}

	// Copy config.toml if exists
	configSrc := os.Getenv("EAT_CODEX_CONFIG_PATH")
	if configSrc == "" {
		home, _ := os.UserHomeDir()
		configSrc = filepath.Join(home, ".codex", "config.toml")
	}
	if data, err := os.ReadFile(configSrc); err == nil {
		// Rewrite localhost to 127.0.0.1 for container network
		rewritten := strings.ReplaceAll(string(data), "localhost", "127.0.0.1")
		_ = os.WriteFile(filepath.Join(codexHomePath, "config.toml"), []byte(rewritten), 0o600)
	}

	// Resolve git root for mount
	gitRoot := config.WorkDir
	if resolved, err := resolveGitRoot(config.WorkDir); err == nil {
		gitRoot = resolved
	}

	// Build prompt
	prompt := buildCodexPrompt(config)

	// Build codex command args
	command := []string{
		"node",
		filepath.Join(codexPackagePath, "bin", "codex.js"),
	}
	// Global args
	command = append(command, "--dangerously-bypass-approvals-and-sandbox")
	if config.WorkDir != "" {
		command = append(command, "--cd", config.WorkDir)
	}
	if codexModel != "" {
		command = append(command, "--model", codexModel)
	}
	// Exec args
	command = append(command,
		"exec",
		"--skip-git-repo-check",
		"--ephemeral",
		"--color", "never",
		"--json",
		prompt,
	)

	// Build sandbox config with extra mounts
	sandboxCfg := sandbox.SandboxConfig{
		ContainerImage:  mgr.WorkerImage,
		ContainerUser:   mgr.ContainerUser,
		NetworkProfile:  "ISOLATED",
		WorkDir:         config.WorkDir,
		ReadwriteMounts: uniqueStrings([]string{config.WorkDir, gitRoot, runtimeHomePath}),
		ReadonlyMounts:  uniqueStrings([]string{codexPackagePath, "/etc/ssl/certs"}),
	}

	env := map[string]string{
		"HOME":       runtimeHomePath,
		"CODEX_HOME": codexHomePath,
	}

	runtime, err := mgr.SpawnContainerSession(ctx, sandboxCfg, command, env)
	if err != nil {
		_ = os.RemoveAll(runtimeHomePath)
		return nil, err
	}

	// Register cleanup on exit
	runtime.OnExit(func(int) {
		_ = os.RemoveAll(runtimeHomePath)
	})

	return runtime, nil
}

func spawnClaudeWorker(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (workerbackend.RuntimeSession, error) {
	binaryPath, err := resolveCLIPath("claude")
	if err != nil {
		return nil, err
	}

	runtimeHomePath, cleanup, err := prepareRuntimeHome("claude", []copySpec{
		{src: filepath.Join(mustUserHomeDir(), ".claude"), dst: ".claude", dir: true},
		{src: filepath.Join(mustUserHomeDir(), ".claude.json"), dst: ".claude.json"},
	})
	if err != nil {
		return nil, err
	}

	command := []string{
		binaryPath,
		"-p",
		"--output-format", "stream-json",
		"--dangerously-skip-permissions",
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		command = append(command, "--add-dir", config.WorkDir)
	}
	if model := strings.TrimSpace(os.Getenv("EAT_CLAUDE_MODEL")); model != "" {
		command = append(command, "--model", model)
	}
	command = append(command, buildClaudePrompt(config))

	runtime, err := spawnSandboxedCLIWorker(ctx, mgr, config, runtimeHomePath, []string{binaryPath}, command, map[string]string{
		"HOME": runtimeHomePath,
	})
	if err != nil {
		cleanup()
		return nil, err
	}
	runtime.OnExit(func(int) { cleanup() })
	return runtime, nil
}

func spawnGeminiWorker(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (workerbackend.RuntimeSession, error) {
	scriptPath, err := resolveCLIPath("gemini")
	if err != nil {
		return nil, err
	}
	packageRoot, err := resolveGeminiPackageRoot(scriptPath)
	if err != nil {
		return nil, err
	}
	nodePath, err := resolveCLIPath("node")
	if err != nil {
		return nil, err
	}

	runtimeHomePath, cleanup, err := prepareRuntimeHome("gemini", []copySpec{
		{src: filepath.Join(mustUserHomeDir(), ".gemini"), dst: ".gemini", dir: true},
	})
	if err != nil {
		return nil, err
	}

	command := []string{
		nodePath,
		filepath.Join(packageRoot, "dist", "index.js"),
		"--prompt", buildGeminiPrompt(config),
		"--output-format", "stream-json",
		"--yolo",
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		command = append(command, "--include-directories", config.WorkDir)
	}
	if model := strings.TrimSpace(os.Getenv("EAT_GEMINI_MODEL")); model != "" {
		command = append(command, "--model", model)
	}

	runtime, err := spawnSandboxedCLIWorker(ctx, mgr, config, runtimeHomePath, []string{packageRoot, nodePath}, command, map[string]string{
		"HOME": runtimeHomePath,
	})
	if err != nil {
		cleanup()
		return nil, err
	}
	runtime.OnExit(func(int) { cleanup() })
	return runtime, nil
}

func runClaudeLeadTurn(ctx context.Context, config LeadTurnConfig) (*LeadTurnResult, error) {
	args := []string{
		"-p",
		"--output-format", "text",
		"--dangerously-skip-permissions",
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		args = append(args, "--add-dir", config.WorkDir)
	}
	if model := strings.TrimSpace(os.Getenv("EAT_CLAUDE_MODEL")); model != "" {
		args = append(args, "--model", model)
	}
	args = append(args, config.Prompt)

	cmd := exec.CommandContext(ctx, "claude", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" {
			errText = strings.TrimSpace(stdout.String())
		}
		if errText != "" {
			return nil, fmt.Errorf("claude lead turn failed: %w: %s", err, errText)
		}
		return nil, fmt.Errorf("claude lead turn failed: %w", err)
	}

	response := strings.TrimSpace(stdout.String())
	if response == "" {
		return nil, fmt.Errorf("claude lead turn produced no output")
	}

	return &LeadTurnResult{
		Response:  response,
		RawOutput: stdout.String(),
	}, nil
}

func runCodexLeadTurn(ctx context.Context, config LeadTurnConfig) (*LeadTurnResult, error) {
	args := []string{
		"exec",
		"--skip-git-repo-check",
		"--color", "never",
		"--json",
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		args = append(args, "--cd", config.WorkDir)
	}
	if model := strings.TrimSpace(os.Getenv("EAT_CODEX_MODEL")); model != "" {
		args = append(args, "--model", model)
	}
	args = append(args, config.Prompt)

	cmd := exec.CommandContext(ctx, "codex", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" {
			errText = strings.TrimSpace(stdout.String())
		}
		if errText != "" {
			return nil, fmt.Errorf("codex lead turn failed: %w: %s", err, errText)
		}
		return nil, fmt.Errorf("codex lead turn failed: %w", err)
	}

	response, parseErr := extractCodexLeadResponse(stdout.String())
	if parseErr != nil {
		return nil, parseErr
	}

	return &LeadTurnResult{
		Response:  response,
		RawOutput: stdout.String(),
	}, nil
}

func extractCodexLeadResponse(raw string) (string, error) {
	type codexItem struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	type codexEvent struct {
		Type string    `json:"type"`
		Item codexItem `json:"item"`
	}

	parts := make([]string, 0, 1)
	scanner := bufio.NewScanner(strings.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event codexEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		if event.Type != "item.completed" || event.Item.Type != "agent_message" {
			continue
		}
		text := strings.TrimSpace(event.Item.Text)
		if text != "" {
			parts = append(parts, text)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}

	response := strings.TrimSpace(strings.Join(parts, "\n\n"))
	if response == "" {
		return "", fmt.Errorf("codex lead turn produced no agent message")
	}
	return response, nil
}

func buildCodexPrompt(config SpawnConfig) string {
	parts := []string{}
	if config.Prompt != "" {
		parts = append(parts, config.Prompt)
	}
	if config.BranchName != "" {
		parts = append(parts, fmt.Sprintf("Current branch: %s", config.BranchName))
	}
	if config.WorkDir != "" {
		parts = append(parts, fmt.Sprintf("Working directory: %s", config.WorkDir))
	}
	return strings.Join(parts, "\n")
}

func resolveGitRoot(dir string) (string, error) {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

type copySpec struct {
	src string
	dst string
	dir bool
}

func spawnSandboxedCLIWorker(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig, runtimeHomePath string, executablePaths []string, command []string, env map[string]string) (workerbackend.RuntimeSession, error) {
	if mgr == nil {
		return nil, fmt.Errorf("docker sandbox manager is required for worker sessions")
	}

	gitRoot := config.WorkDir
	if resolved, err := resolveGitRoot(config.WorkDir); err == nil {
		gitRoot = resolved
	}

	readonlyMounts := []string{"/etc/ssl/certs"}
	for _, executablePath := range executablePaths {
		if executablePath == "" {
			continue
		}
		readonlyMounts = append(readonlyMounts, executablePath)
		if resolved, err := filepath.EvalSymlinks(executablePath); err == nil && resolved != executablePath {
			readonlyMounts = append(readonlyMounts, resolved)
		}
	}

	sandboxCfg := sandbox.SandboxConfig{
		ContainerImage:  mgr.WorkerImage,
		ContainerUser:   mgr.ContainerUser,
		NetworkProfile:  "ISOLATED",
		WorkDir:         config.WorkDir,
		ReadwriteMounts: uniqueStrings([]string{config.WorkDir, gitRoot, runtimeHomePath}),
		ReadonlyMounts:  uniqueStrings(readonlyMounts),
	}

	return mgr.SpawnContainerSession(ctx, sandboxCfg, command, env)
}

func prepareRuntimeHome(prefix string, copies []copySpec) (string, func(), error) {
	home, _ := os.UserHomeDir()
	runtimeRoot := os.Getenv("EAT_" + strings.ToUpper(strings.ReplaceAll(prefix, "-", "_")) + "_RUNTIME_ROOT")
	if runtimeRoot == "" {
		runtimeRoot = filepath.Join(home, ".eat-"+prefix+"-runtime")
	}

	runtimeHomePath := filepath.Join(runtimeRoot, "session-"+uuid.NewString())
	if err := os.MkdirAll(runtimeHomePath, 0o755); err != nil {
		return "", nil, fmt.Errorf("create runtime home for %s: %w", prefix, err)
	}

	for _, spec := range copies {
		if spec.src == "" {
			continue
		}
		if err := copyIntoRuntime(runtimeHomePath, spec); err != nil {
			_ = os.RemoveAll(runtimeHomePath)
			return "", nil, err
		}
	}

	return runtimeHomePath, func() { _ = os.RemoveAll(runtimeHomePath) }, nil
}

func copyIntoRuntime(runtimeHomePath string, spec copySpec) error {
	info, err := os.Stat(spec.src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("inspect auth source %s: %w", spec.src, err)
	}

	dstPath := filepath.Join(runtimeHomePath, spec.dst)
	if spec.dir || info.IsDir() {
		return copyDir(spec.src, dstPath)
	}
	return copyFile(spec.src, dstPath, info.Mode())
}

func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return fmt.Errorf("create dir %s: %w", dst, err)
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return fmt.Errorf("read dir %s: %w", src, err)
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("read info for %s: %w", srcPath, err)
		}
		if err := copyFile(srcPath, dstPath, info.Mode()); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("create parent dir for %s: %w", dst, err)
	}
	input, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open %s: %w", src, err)
	}
	defer input.Close()

	output, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode.Perm())
	if err != nil {
		return fmt.Errorf("create %s: %w", dst, err)
	}
	defer output.Close()

	if _, err := io.Copy(output, input); err != nil {
		return fmt.Errorf("copy %s -> %s: %w", src, dst, err)
	}
	return nil
}

func resolveCLIPath(binary string) (string, error) {
	path, err := exec.LookPath(binary)
	if err != nil {
		return "", fmt.Errorf("%s is not installed or not available on PATH", binary)
	}
	if resolved, resolveErr := filepath.EvalSymlinks(path); resolveErr == nil {
		return resolved, nil
	}
	return path, nil
}

func resolveGeminiPackageRoot(scriptPath string) (string, error) {
	start := scriptPath
	info, err := os.Stat(start)
	if err != nil {
		return "", fmt.Errorf("inspect gemini cli path %s: %w", scriptPath, err)
	}
	if !info.IsDir() {
		start = filepath.Dir(start)
	}

	for current := start; current != "" && current != filepath.Dir(current); current = filepath.Dir(current) {
		packageJSON := filepath.Join(current, "package.json")
		if stat, statErr := os.Stat(packageJSON); statErr == nil && !stat.IsDir() {
			return current, nil
		}
	}

	return "", fmt.Errorf("resolve gemini package root from %s: package.json not found", scriptPath)
}

func buildClaudePrompt(config SpawnConfig) string {
	return buildGenericWorkerPrompt(config)
}

func buildGeminiPrompt(config SpawnConfig) string {
	return buildGenericWorkerPrompt(config)
}

func buildGenericWorkerPrompt(config SpawnConfig) string {
	parts := []string{strings.TrimSpace(config.Prompt)}
	if strings.TrimSpace(config.BranchName) != "" {
		parts = append(parts, "Current branch: "+config.BranchName)
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		parts = append(parts, "Working directory: "+config.WorkDir)
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func mustUserHomeDir() string {
	home, _ := os.UserHomeDir()
	return home
}

func codexHealth(sandboxManager *sandbox.Manager) HealthSnapshot {
	return cliHealth("codex-cli", "codex", sandboxManager)
}

func cliHealth(adapterName, binary string, sandboxManager *sandbox.Manager) HealthSnapshot {
	snapshot := HealthSnapshot{
		Available:              true,
		OrchestrationAvailable: true,
		ExecutionAvailable:     true,
		RuntimeMode:            "REAL",
		Checks:                 []HealthCheck{},
	}

	commandEnvVar := fmt.Sprintf("EAT_%s_WORKER_COMMAND", strings.ToUpper(strings.ReplaceAll(strings.TrimSuffix(adapterName, "-cli"), "-", "_")))
	commandOverride := strings.TrimSpace(os.Getenv(commandEnvVar))
	if commandOverride != "" {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "runtime-command",
			Status:  "PASS",
			Message: fmt.Sprintf("%s is configured via %s.", adapterName, commandEnvVar),
		})
	} else if _, err := exec.LookPath(binary); err != nil {
		failureReason := &FailureReason{
			Code:    "BINARY_MISSING",
			Message: fmt.Sprintf("%s is not installed or not available on PATH.", binary),
		}
		return HealthSnapshot{
			Available:              false,
			OrchestrationAvailable: false,
			ExecutionAvailable:     false,
			RuntimeMode:            "REAL",
			Checks: []HealthCheck{
				{Name: "binary", Status: "FAIL", Message: fmt.Sprintf("%s is not installed or not available on PATH.", binary)},
			},
			FailureReason:              failureReason,
			OrchestrationFailureReason: failureReason,
			ExecutionFailureReason:     failureReason,
		}
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "binary",
			Status:  "PASS",
			Message: fmt.Sprintf("%s binary is available.", binary),
		})
	}

	if authCheck, failure := cliAuthCheck(adapterName); authCheck.Name != "" {
		snapshot.Checks = append(snapshot.Checks, authCheck)
		if failure != nil {
			snapshot.OrchestrationAvailable = false
			snapshot.ExecutionAvailable = false
			if snapshot.OrchestrationFailureReason == nil {
				snapshot.OrchestrationFailureReason = failure
			}
			if snapshot.ExecutionFailureReason == nil {
				snapshot.ExecutionFailureReason = failure
			}
		}
	}

	if sandboxManager != nil {
		dockerHealth := sandboxManager.DockerHealth(context.Background())
		if dockerHealth.Available {
			snapshot.Checks = append(snapshot.Checks, HealthCheck{
				Name:    "worker-sandbox",
				Status:  "PASS",
				Message: fmt.Sprintf("Docker worker sandbox is available for %s sessions.", adapterName),
			})
		} else {
			snapshot.ExecutionAvailable = false
			snapshot.Checks = append(snapshot.Checks, HealthCheck{
				Name:    "worker-sandbox",
				Status:  "FAIL",
				Message: dockerHealth.Reason,
			})
			if snapshot.ExecutionFailureReason == nil {
				snapshot.ExecutionFailureReason = &FailureReason{
					Code:    "DOCKER_UNAVAILABLE",
					Message: dockerHealth.Reason,
				}
			}
		}
	}

	snapshot.Available = snapshot.OrchestrationAvailable && snapshot.ExecutionAvailable
	if snapshot.FailureReason == nil {
		snapshot.FailureReason = primaryFailureReason(snapshot.OrchestrationFailureReason, snapshot.ExecutionFailureReason)
	}

	return snapshot
}

func primaryFailureReason(reasons ...*FailureReason) *FailureReason {
	for _, reason := range reasons {
		if reason != nil {
			return reason
		}
	}
	return nil
}

func cliAuthCheck(adapterName string) (HealthCheck, *FailureReason) {
	switch adapterName {
	case "claude-cli":
		if strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")) != "" {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Claude authentication is available via ANTHROPIC_API_KEY.",
			}, nil
		}
		authPath := filepath.Join(mustUserHomeDir(), ".claude.json")
		if pathExists(authPath) || pathExists(filepath.Join(mustUserHomeDir(), ".claude")) {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Claude authentication is available from the local Claude runtime directory.",
			}, nil
		}
		message := "Claude authentication is missing. Configure ~/.claude.json or ANTHROPIC_API_KEY."
		return HealthCheck{
				Name:    "auth",
				Status:  "FAIL",
				Message: message,
			}, &FailureReason{
				Code:    "AUTH_MISSING",
				Message: message,
			}
	case "gemini-cli":
		if strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")) != "" || strings.TrimSpace(os.Getenv("GEMINI_API_KEY")) != "" {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Gemini authentication is available via API key environment variables.",
			}, nil
		}
		authPath := filepath.Join(mustUserHomeDir(), ".gemini", "google_accounts.json")
		if pathExists(authPath) {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Gemini authentication is available from ~/.gemini/google_accounts.json.",
			}, nil
		}
		message := "Gemini authentication is missing. Configure ~/.gemini/google_accounts.json, GOOGLE_API_KEY, or GEMINI_API_KEY."
		return HealthCheck{
				Name:    "auth",
				Status:  "FAIL",
				Message: message,
			}, &FailureReason{
				Code:    "AUTH_MISSING",
				Message: message,
			}
	}

	return HealthCheck{}, nil
}

func pathExists(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

func uniqueStrings(input []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(input))
	for _, s := range input {
		if s != "" && !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}

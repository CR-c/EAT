package agent

import (
	"bufio"
	"bytes"
	"context"
	"eat/backend/internal/workerbackend"
	dockerbackend "eat/backend/internal/workerbackend/docker"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"eat/backend/internal/sandbox"

	"github.com/google/uuid"
)

// SpawnConfig holds parameters for spawning an agent session.
type SpawnConfig struct {
	BackendKind      string
	ExecutionProfile string
	Prompt           string
	WorkDir          string
	BranchName       string
	SessionType      string // "WORKER" or "LEAD"
	Sandbox          *sandbox.SandboxConfig
	Attachments      []AttachmentRef
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
	workerBackends  map[string]workerbackend.Backend
	defaultBackend  string
	healthOverrides map[string]HealthSnapshot
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
	service := &Service{
		sandbox:         sandboxManager,
		workerBackends:  map[string]workerbackend.Backend{},
		healthOverrides: map[string]HealthSnapshot{},
		leadTurnRunners: map[string]LeadTurnRunner{
			"claude-cli": runClaudeLeadTurn,
			"codex-cli":  runCodexLeadTurn,
		},
	}
	if sandboxManager != nil {
		service.RegisterExecutionBackend(dockerbackend.New(sandboxManager), true)
	}
	return service
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

func (s *Service) SetHealthSnapshot(agentType string, snapshot HealthSnapshot) {
	if s == nil || strings.TrimSpace(agentType) == "" {
		return
	}
	if s.healthOverrides == nil {
		s.healthOverrides = make(map[string]HealthSnapshot)
	}
	s.healthOverrides[agentType] = snapshot
}

func (s *Service) RegisterExecutionBackend(backend workerbackend.Backend, isDefault bool) {
	if s == nil || backend == nil {
		return
	}
	if s.workerBackends == nil {
		s.workerBackends = make(map[string]workerbackend.Backend)
	}
	kind := strings.TrimSpace(backend.Kind())
	if kind == "" {
		return
	}
	s.workerBackends[kind] = backend
	if isDefault || strings.TrimSpace(s.defaultBackend) == "" {
		s.defaultBackend = kind
	}
}

func (s *Service) DefaultExecutionBackendKind() string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(s.defaultBackend)
}

func (s *Service) DefaultExecutionBackend() workerbackend.Backend {
	if s == nil {
		return nil
	}
	backend, _ := s.resolveExecutionBackend("")
	return backend
}

func (s *Service) ExecutionBackends(ctx context.Context) []workerbackend.Status {
	if s == nil || len(s.workerBackends) == 0 {
		return nil
	}
	result := make([]workerbackend.Status, 0, len(s.workerBackends))
	for kind, backend := range s.workerBackends {
		status := backend.Status(ctx)
		if strings.TrimSpace(status.Kind) == "" {
			status.Kind = kind
		}
		if strings.TrimSpace(s.defaultBackend) != "" {
			status.Default = status.Kind == s.defaultBackend
		}
		result = append(result, status)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Default != result[j].Default {
			return result[i].Default
		}
		return result[i].Kind < result[j].Kind
	})
	return result
}

func (s *Service) resolveExecutionBackend(kind string) (workerbackend.Backend, error) {
	if s == nil || len(s.workerBackends) == 0 {
		return nil, fmt.Errorf("no execution backend is registered")
	}
	kind = strings.TrimSpace(kind)
	if kind == "" {
		kind = strings.TrimSpace(s.defaultBackend)
	}
	backend, ok := s.workerBackends[kind]
	if !ok {
		return nil, fmt.Errorf("execution backend %s is not registered", kind)
	}
	return backend, nil
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
		if s != nil && s.healthOverrides != nil {
			if snapshot, ok := s.healthOverrides[definition.Name]; ok {
				result[definition.Name] = snapshot
				continue
			}
		}
		result[definition.Name] = definition.Health(s)
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
	backend, err := s.resolveExecutionBackend(config.BackendKind)
	if err != nil {
		return nil, err
	}
	return def.Spawn(ctx, backend, config)
}

type builtInDefinition struct {
	Name         string
	RuntimeMode  string
	Capabilities CapabilitySet
	Health       func(*Service) HealthSnapshot
	Spawn        func(ctx context.Context, backend workerbackend.Backend, config SpawnConfig) (workerbackend.RuntimeSession, error)
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
			Health: claudeHealth,
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
			Health: geminiHealth,
			Spawn:  spawnGeminiWorker,
		},
	}
}

// spawnCodexWorker launches a Codex CLI worker inside a Docker container.
func spawnCodexWorker(ctx context.Context, backend workerbackend.Backend, config SpawnConfig) (workerbackend.RuntimeSession, error) {
	if backend == nil {
		return nil, fmt.Errorf("execution backend is required for Codex worker sessions")
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

	env := map[string]string{
		"HOME":       runtimeHomePath,
		"CODEX_HOME": codexHomePath,
	}
	if apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); apiKey != "" {
		env["OPENAI_API_KEY"] = apiKey
	}
	env = mergeEnvMaps(env, executionProfileEnv(config.ExecutionProfile))

	runtime, err := backend.StartWorker(ctx, workerbackend.StartWorkerInput{
		WorkDir:         config.WorkDir,
		Command:         command,
		Env:             env,
		NetworkProfile:  networkProfileForExecutionProfile(config.ExecutionProfile),
		ReadwriteMounts: uniqueStrings([]string{config.WorkDir, gitRoot, runtimeHomePath}),
		ReadonlyMounts:  uniqueStrings(append([]string{codexPackagePath, "/etc/ssl/certs"}, attachmentPaths(config.Attachments)...)),
		PublishedPorts:  executionProfilePublishedPorts(config.ExecutionProfile),
	})
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

func spawnClaudeWorker(ctx context.Context, backend workerbackend.Backend, config SpawnConfig) (workerbackend.RuntimeSession, error) {
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

	runtime, err := spawnSandboxedCLIWorker(ctx, backend, config, runtimeHomePath, []string{binaryPath}, command, map[string]string{
		"HOME":              runtimeHomePath,
		"ANTHROPIC_API_KEY": strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")),
	})
	if err != nil {
		cleanup()
		return nil, err
	}
	runtime.OnExit(func(int) { cleanup() })
	return runtime, nil
}

func spawnGeminiWorker(ctx context.Context, backend workerbackend.Backend, config SpawnConfig) (workerbackend.RuntimeSession, error) {
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

	env := map[string]string{
		"HOME": runtimeHomePath,
	}
	if apiKey := strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")); apiKey != "" {
		env["GOOGLE_API_KEY"] = apiKey
	}
	if apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY")); apiKey != "" {
		env["GEMINI_API_KEY"] = apiKey
	}

	runtime, err := spawnSandboxedCLIWorker(ctx, backend, config, runtimeHomePath, []string{packageRoot, nodePath}, command, env)
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

func spawnSandboxedCLIWorker(ctx context.Context, backend workerbackend.Backend, config SpawnConfig, runtimeHomePath string, executablePaths []string, command []string, env map[string]string) (workerbackend.RuntimeSession, error) {
	if backend == nil {
		return nil, fmt.Errorf("execution backend is required for worker sessions")
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
	readonlyMounts = append(readonlyMounts, attachmentPaths(config.Attachments)...)

	return backend.StartWorker(ctx, workerbackend.StartWorkerInput{
		WorkDir:         config.WorkDir,
		Command:         command,
		Env:             mergeEnvMaps(env, executionProfileEnv(config.ExecutionProfile)),
		NetworkProfile:  networkProfileForExecutionProfile(config.ExecutionProfile),
		ReadwriteMounts: uniqueStrings([]string{config.WorkDir, gitRoot, runtimeHomePath}),
		ReadonlyMounts:  uniqueStrings(readonlyMounts),
		PublishedPorts:  executionProfilePublishedPorts(config.ExecutionProfile),
	})
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
		// Resolve through symlinks so the runtime home gets a usable copy.
		// Skip entries that can't be resolved — e.g. a dangling symlink like
		// ~/.claude/debug/latest pointing at an already-rotated log file — so a
		// single broken link does not abort the whole worker runtime-home prep.
		info, err := os.Stat(srcPath)
		if err != nil {
			continue
		}
		if info.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
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
		// Tolerate a source that vanished between listing and copy (rotated
		// log, dangling symlink) rather than failing the whole runtime-home prep.
		if os.IsNotExist(err) {
			return nil
		}
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

func networkProfileForExecutionProfile(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "", "default", "isolated":
		return "ISOLATED"
	case "internet", "web-preview":
		return "DEFAULT"
	case "host-network", "web-preview-host":
		return "HOST"
	default:
		return "ISOLATED"
	}
}

func executionProfileEnv(value string) map[string]string {
	profile := strings.TrimSpace(strings.ToLower(value))
	env := map[string]string{}
	if profile != "" {
		env["EAT_EXECUTION_PROFILE"] = profile
		env["EAT_EXECUTION_NETWORK_PROFILE"] = networkProfileForExecutionProfile(profile)
	}
	switch profile {
	case "web-preview", "web-preview-host":
		env["PORT"] = "4173"
		env["HOST"] = "0.0.0.0"
		env["BROWSER"] = "none"
	}
	if len(env) == 0 {
		return nil
	}
	return env
}

func executionProfilePublishedPorts(value string) []workerbackend.PortMapping {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "web-preview":
		return []workerbackend.PortMapping{{HostPort: 4173, ContainerPort: 4173}}
	default:
		return nil
	}
}

func mergeEnvMaps(base map[string]string, extra map[string]string) map[string]string {
	if len(extra) == 0 {
		return base
	}
	merged := make(map[string]string, len(base)+len(extra))
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range extra {
		merged[key] = value
	}
	return merged
}

func attachmentPaths(attachments []AttachmentRef) []string {
	if len(attachments) == 0 {
		return nil
	}
	paths := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		if strings.TrimSpace(attachment.FilePath) == "" {
			continue
		}
		paths = append(paths, attachment.FilePath)
		if resolved, err := filepath.EvalSymlinks(attachment.FilePath); err == nil && resolved != attachment.FilePath {
			paths = append(paths, resolved)
		}
	}
	return uniqueStrings(paths)
}

func executionProfilePromptLines(value string) []string {
	profile := strings.TrimSpace(strings.ToLower(value))
	if profile == "" {
		return nil
	}
	lines := []string{
		"Execution profile: " + profile,
		"Worker network policy: " + networkProfileForExecutionProfile(profile),
	}
	switch profile {
	case "web-preview":
		lines = append(lines, "Published ports: 4173->4173", "If you start a preview/dev server, prefer HOST=0.0.0.0 and PORT=4173 (already injected).")
	case "web-preview-host":
		lines = append(lines, "If you start a preview/dev server, prefer HOST=0.0.0.0 and PORT=4173 (already injected).")
	}
	return lines
}

func buildGenericWorkerPrompt(config SpawnConfig) string {
	parts := []string{strings.TrimSpace(config.Prompt)}
	if strings.TrimSpace(config.BranchName) != "" {
		parts = append(parts, "Current branch: "+config.BranchName)
	}
	if strings.TrimSpace(config.WorkDir) != "" {
		parts = append(parts, "Working directory: "+config.WorkDir)
	}
	parts = append(parts, executionProfilePromptLines(config.ExecutionProfile)...)
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func mustUserHomeDir() string {
	home, _ := os.UserHomeDir()
	return home
}

func claudeHealth(service *Service) HealthSnapshot {
	snapshot := HealthSnapshot{
		Available:              true,
		OrchestrationAvailable: true,
		ExecutionAvailable:     true,
		RuntimeMode:            "REAL",
		Checks:                 []HealthCheck{},
	}

	if _, err := exec.LookPath("claude"); err != nil {
		failureReason := &FailureReason{Code: "BINARY_MISSING", Message: "claude is not installed or not available on PATH."}
		snapshot.OrchestrationAvailable = false
		snapshot.ExecutionAvailable = false
		snapshot.OrchestrationFailureReason = failureReason
		snapshot.ExecutionFailureReason = failureReason
		snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "binary", Status: "FAIL", Message: failureReason.Message})
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "binary", Status: "PASS", Message: "claude binary is available."})
	}

	if authCheck, failure := cliAuthCheck("claude-cli"); authCheck.Name != "" {
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

	applyExecutionBackendReadiness(service, "claude-cli", &snapshot)

	snapshot.Available = snapshot.OrchestrationAvailable && snapshot.ExecutionAvailable
	if snapshot.FailureReason == nil {
		snapshot.FailureReason = primaryFailureReason(snapshot.OrchestrationFailureReason, snapshot.ExecutionFailureReason)
	}
	return snapshot
}

func geminiHealth(service *Service) HealthSnapshot {
	snapshot := HealthSnapshot{
		Available:              true,
		OrchestrationAvailable: true,
		ExecutionAvailable:     true,
		RuntimeMode:            "REAL",
		Checks:                 []HealthCheck{},
	}

	scriptPath, err := resolveCLIPath("gemini")
	if err != nil {
		failureReason := &FailureReason{Code: "BINARY_MISSING", Message: "gemini is not installed or not available on PATH."}
		snapshot.OrchestrationAvailable = false
		snapshot.ExecutionAvailable = false
		snapshot.OrchestrationFailureReason = failureReason
		snapshot.ExecutionFailureReason = failureReason
		snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "binary", Status: "FAIL", Message: failureReason.Message})
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "binary", Status: "PASS", Message: "gemini binary is available."})
		if _, err := resolveCLIPath("node"); err != nil {
			failureReason := &FailureReason{Code: "RUNTIME_DEPENDENCY_MISSING", Message: "node is required for Gemini worker execution but is not available on PATH."}
			snapshot.ExecutionAvailable = false
			if snapshot.ExecutionFailureReason == nil {
				snapshot.ExecutionFailureReason = failureReason
			}
			snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "runtime-node", Status: "FAIL", Message: failureReason.Message})
		} else {
			snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "runtime-node", Status: "PASS", Message: "node runtime is available for Gemini worker execution."})
		}
		if packageRoot, packageErr := resolveGeminiPackageRoot(scriptPath); packageErr != nil {
			failureReason := &FailureReason{Code: "RUNTIME_DEPENDENCY_MISSING", Message: packageErr.Error()}
			snapshot.ExecutionAvailable = false
			if snapshot.ExecutionFailureReason == nil {
				snapshot.ExecutionFailureReason = failureReason
			}
			snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "runtime-package", Status: "FAIL", Message: failureReason.Message})
		} else {
			snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "runtime-package", Status: "PASS", Message: fmt.Sprintf("Gemini worker package root %s is available.", packageRoot)})
		}
	}

	if authCheck, failure := cliAuthCheck("gemini-cli"); authCheck.Name != "" {
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

	applyExecutionBackendReadiness(service, "gemini-cli", &snapshot)

	snapshot.Available = snapshot.OrchestrationAvailable && snapshot.ExecutionAvailable
	if snapshot.FailureReason == nil {
		snapshot.FailureReason = primaryFailureReason(snapshot.OrchestrationFailureReason, snapshot.ExecutionFailureReason)
	}
	return snapshot
}

func codexHealth(service *Service) HealthSnapshot {
	snapshot := HealthSnapshot{
		Available:              true,
		OrchestrationAvailable: true,
		ExecutionAvailable:     true,
		RuntimeMode:            "REAL",
		Checks:                 []HealthCheck{},
	}

	if _, err := exec.LookPath("codex"); err != nil {
		failureReason := &FailureReason{
			Code:    "BINARY_MISSING",
			Message: "codex is not installed or not available on PATH.",
		}
		snapshot.OrchestrationAvailable = false
		snapshot.OrchestrationFailureReason = failureReason
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "binary",
			Status:  "FAIL",
			Message: failureReason.Message,
		})
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "binary",
			Status:  "PASS",
			Message: "codex binary is available.",
		})
	}

	if _, err := resolveCLIPath("node"); err != nil {
		failureReason := &FailureReason{
			Code:    "RUNTIME_DEPENDENCY_MISSING",
			Message: "node is required for Codex worker execution but is not available on PATH.",
		}
		snapshot.ExecutionAvailable = false
		snapshot.ExecutionFailureReason = failureReason
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "runtime-node",
			Status:  "FAIL",
			Message: failureReason.Message,
		})
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "runtime-node",
			Status:  "PASS",
			Message: "node runtime is available for Codex worker execution.",
		})
	}

	codexPackagePath := strings.TrimSpace(os.Getenv("EAT_CODEX_PACKAGE_PATH"))
	if codexPackagePath == "" {
		codexPackagePath = "/usr/local/lib/node_modules/@openai/codex"
	}
	codexEntrypoint := filepath.Join(codexPackagePath, "bin", "codex.js")
	if stat, err := os.Stat(codexEntrypoint); err != nil || stat.IsDir() {
		failureReason := &FailureReason{
			Code:    "RUNTIME_DEPENDENCY_MISSING",
			Message: fmt.Sprintf("Codex worker package entrypoint %s is not available.", codexEntrypoint),
		}
		if snapshot.ExecutionFailureReason == nil {
			snapshot.ExecutionFailureReason = failureReason
		}
		snapshot.ExecutionAvailable = false
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "runtime-package",
			Status:  "FAIL",
			Message: failureReason.Message,
		})
	} else {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "runtime-package",
			Status:  "PASS",
			Message: fmt.Sprintf("Codex worker package entrypoint %s is available.", codexEntrypoint),
		})
	}

	if authCheck, failure := cliAuthCheck("codex-cli"); authCheck.Name != "" {
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

	applyExecutionBackendReadiness(service, "codex-cli", &snapshot)

	snapshot.Available = snapshot.OrchestrationAvailable && snapshot.ExecutionAvailable
	if snapshot.FailureReason == nil {
		snapshot.FailureReason = primaryFailureReason(snapshot.OrchestrationFailureReason, snapshot.ExecutionFailureReason)
	}
	return snapshot
}

func cliHealth(adapterName, binary string, service *Service) HealthSnapshot {
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

	applyExecutionBackendReadiness(service, adapterName, &snapshot)

	snapshot.Available = snapshot.OrchestrationAvailable && snapshot.ExecutionAvailable
	if snapshot.FailureReason == nil {
		snapshot.FailureReason = primaryFailureReason(snapshot.OrchestrationFailureReason, snapshot.ExecutionFailureReason)
	}

	return snapshot
}

func applyExecutionBackendReadiness(service *Service, adapterName string, snapshot *HealthSnapshot) {
	if snapshot == nil {
		return
	}
	statuses := []workerbackend.Status(nil)
	if service != nil {
		statuses = service.ExecutionBackends(context.Background())
	}
	if len(statuses) == 0 {
		reason := &FailureReason{Code: "EXECUTION_BACKEND_UNAVAILABLE", Message: "No execution backend is registered."}
		snapshot.ExecutionAvailable = false
		snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "worker-backend", Status: "FAIL", Message: reason.Message})
		if snapshot.ExecutionFailureReason == nil {
			snapshot.ExecutionFailureReason = reason
		}
		return
	}
	availableKinds := make([]string, 0, len(statuses))
	preferred := statuses[0]
	for _, status := range statuses {
		if status.Default {
			preferred = status
		}
		if status.Available {
			availableKinds = append(availableKinds, status.Kind)
		}
	}
	if len(availableKinds) > 0 {
		snapshot.Checks = append(snapshot.Checks, HealthCheck{
			Name:    "worker-backend",
			Status:  "PASS",
			Message: fmt.Sprintf("Execution backend(s) available for %s: %s.", adapterName, strings.Join(availableKinds, ", ")),
		})
		return
	}
	message := strings.TrimSpace(preferred.Reason)
	if message == "" {
		message = "No registered execution backend is currently available."
	}
	code := "EXECUTION_BACKEND_UNAVAILABLE"
	if workerbackend.NormalizeKind(preferred.Kind) == workerbackend.KindDocker {
		code = "DOCKER_UNAVAILABLE"
	}
	snapshot.ExecutionAvailable = false
	snapshot.Checks = append(snapshot.Checks, HealthCheck{Name: "worker-backend", Status: "FAIL", Message: message})
	if snapshot.ExecutionFailureReason == nil {
		snapshot.ExecutionFailureReason = &FailureReason{Code: code, Message: message}
	}
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
	case "codex-cli":
		if strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) != "" {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Codex authentication is available via OPENAI_API_KEY.",
			}, nil
		}
		authPath := strings.TrimSpace(os.Getenv("EAT_CODEX_AUTH_PATH"))
		if authPath == "" {
			authPath = filepath.Join(mustUserHomeDir(), ".codex", "auth.json")
		}
		if pathExists(authPath) {
			return HealthCheck{
				Name:    "auth",
				Status:  "PASS",
				Message: "Codex authentication is available from the local Codex auth file.",
			}, nil
		}
		message := "Codex authentication is missing. Configure ~/.codex/auth.json, EAT_CODEX_AUTH_PATH, or OPENAI_API_KEY."
		return HealthCheck{
				Name:    "auth",
				Status:  "FAIL",
				Message: message,
			}, &FailureReason{
				Code:    "AUTH_MISSING",
				Message: message,
			}
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

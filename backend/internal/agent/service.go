package agent

import (
	"context"
	"fmt"
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
	sandbox *sandbox.Manager
}

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
	Available     bool           `json:"available"`
	RuntimeMode   string         `json:"runtimeMode"`
	Version       string         `json:"version,omitempty"`
	Checks        []HealthCheck  `json:"checks"`
	FailureReason *FailureReason `json:"failureReason,omitempty"`
}

func NewService(sandboxManager *sandbox.Manager) *Service {
	return &Service{sandbox: sandboxManager}
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
// Returns a ContainerRuntime handle for Docker-sandboxed sessions.
func (s *Service) SpawnSession(ctx context.Context, agentType string, config SpawnConfig) (*sandbox.ContainerRuntime, error) {
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
	Spawn        func(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (*sandbox.ContainerRuntime, error)
}

func builtInDefinitions() []builtInDefinition {
	return []builtInDefinition{
		{
			Name:        "claude-cli",
			RuntimeMode: "STUB",
			Capabilities: CapabilitySet{
				CanOrchestrate:           true,
				CanExecute:               true,
				Description:              "Anthropic Claude CLI placeholder adapter until a documented real runtime is wired in.",
				SupportedSandboxTypes:    []string{"HOST", "DOCKER"},
				SupportsInteractiveInput: true,
				SupportsVision:           true,
			},
			Health: func(*sandbox.Manager) HealthSnapshot { return stubHealth("claude-cli") },
			Spawn:  nil,
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
			RuntimeMode: "STUB",
			Capabilities: CapabilitySet{
				CanOrchestrate:           false,
				CanExecute:               true,
				Description:              "Google Gemini CLI placeholder adapter until a documented real runtime is wired in.",
				SupportedSandboxTypes:    []string{"HOST"},
				SupportsInteractiveInput: true,
				SupportsVision:           true,
			},
			Health: func(*sandbox.Manager) HealthSnapshot { return stubHealth("gemini-cli") },
			Spawn:  nil,
		},
	}
}

// spawnCodexWorker launches a Codex CLI worker inside a Docker container.
func spawnCodexWorker(ctx context.Context, mgr *sandbox.Manager, config SpawnConfig) (*sandbox.ContainerRuntime, error) {
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

func codexHealth(sandboxManager *sandbox.Manager) HealthSnapshot {
	snapshot := HealthSnapshot{
		Available:   true,
		RuntimeMode: "REAL",
		Checks:      []HealthCheck{},
	}

	if _, err := exec.LookPath("codex"); err != nil {
		return HealthSnapshot{
			Available:   false,
			RuntimeMode: "REAL",
			Checks: []HealthCheck{
				{Name: "binary", Status: "FAIL", Message: "codex is not installed or not available on PATH."},
			},
			FailureReason: &FailureReason{
				Code:    "BINARY_MISSING",
				Message: "codex is not installed or not available on PATH.",
			},
		}
	}

	snapshot.Checks = append(snapshot.Checks, HealthCheck{
		Name:    "binary",
		Status:  "PASS",
		Message: "codex binary is available.",
	})

	if sandboxManager != nil {
		dockerHealth := sandboxManager.DockerHealth(context.Background())
		if dockerHealth.Available {
			snapshot.Checks = append(snapshot.Checks, HealthCheck{
				Name:    "worker-sandbox",
				Status:  "PASS",
				Message: "Docker worker sandbox is available for Codex worker sessions.",
			})
		} else {
			snapshot.Checks = append(snapshot.Checks, HealthCheck{
				Name:    "worker-sandbox",
				Status:  "WARN",
				Message: dockerHealth.Reason,
			})
		}
	}

	return snapshot
}

func stubHealth(name string) HealthSnapshot {
	return HealthSnapshot{
		Available:   false,
		RuntimeMode: "STUB",
		Version:     name + "@stub",
		Checks: []HealthCheck{
			{Name: "runtime", Status: "FAIL", Message: "This built-in adapter is still running in explicit stub mode and is not treated as a real CLI."},
			{Name: "binary", Status: "SKIP", Message: "Binary and auth checks are skipped until a real runtime is implemented."},
		},
		FailureReason: &FailureReason{
			Code:    "HEALTH_CHECK_FAILED",
			Message: "Stub adapter is not treated as a real CLI runtime.",
			Details: map[string]any{
				"adapter":     name,
				"runtimeMode": "STUB",
			},
		},
	}
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

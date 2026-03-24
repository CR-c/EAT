package agent

import (
	"context"
	"os/exec"

	"eat/backend/internal/sandbox"
)

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

type builtInDefinition struct {
	Name         string
	RuntimeMode  string
	Capabilities CapabilitySet
	Health       func(*sandbox.Manager) HealthSnapshot
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
		},
	}
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

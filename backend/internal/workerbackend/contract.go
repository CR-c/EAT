package workerbackend

import (
	"context"
	"strings"
)

const KindDocker = "docker"

// RuntimeMetadata captures backend-specific runtime details without leaking a
// concrete sandbox/container implementation to orchestrator consumers.
type RuntimeMetadata struct {
	BackendKind string
	ContainerID string
	PID         int
}

// RuntimeSession is the minimal worker runtime handle the orchestrator needs.
type RuntimeSession interface {
	OnOutput(func(string))
	OnExit(func(int))
	Stop() error
	Kill() error
	Metadata() RuntimeMetadata
}

// Status is the normalized readiness shape for an execution backend.
type Status struct {
	Kind         string   `json:"kind"`
	Available    bool     `json:"available"`
	Default      bool     `json:"default"`
	TrustLevel   string   `json:"trustLevel"`
	Reason       string   `json:"reason,omitempty"`
	Dependencies []string `json:"dependencies,omitempty"`
}

type PortMapping struct {
	HostPort      int
	ContainerPort int
}

// StartWorkerInput is the generic contract for launching a worker runtime.
type StartWorkerInput struct {
	WorkDir         string
	Command         []string
	Env             map[string]string
	NetworkProfile  string
	ReadwriteMounts []string
	ReadonlyMounts  []string
	PublishedPorts  []PortMapping
}

// Backend is the pluggable execution backend contract.
type Backend interface {
	Kind() string
	Status(context.Context) Status
	StartWorker(context.Context, StartWorkerInput) (RuntimeSession, error)
}

func NormalizeKind(kind string) string {
	return strings.ToLower(strings.TrimSpace(kind))
}

func SessionSandboxTypeForKind(kind string) string {
	normalized := NormalizeKind(kind)
	if normalized == "" {
		return ""
	}
	switch normalized {
	case KindDocker:
		return "DOCKER"
	default:
		return strings.ToUpper(normalized)
	}
}

func KindFromSessionSandboxType(value string) string {
	normalized := NormalizeKind(value)
	switch normalized {
	case "":
		return ""
	case "docker":
		return KindDocker
	default:
		return normalized
	}
}

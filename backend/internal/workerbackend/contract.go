package workerbackend

import "context"

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

// Health is the normalized readiness shape for an execution backend.
type Health struct {
	Available bool
	Reason    string
	Details   map[string]any
}

// StartWorkerInput is the minimal contract for launching a worker runtime.
type StartWorkerInput struct {
	WorkDir string
	Command []string
	Env     map[string]string
}

// Backend is the pluggable execution backend contract.
type Backend interface {
	Kind() string
	Health(context.Context) Health
	StartWorker(context.Context, StartWorkerInput) (RuntimeSession, error)
}

package agent

import (
	"context"

	"eat/backend/internal/workerbackend"
)

type SessionConfig struct {
	BranchName  string
	Prompt      string
	SessionType string
	WorkDir     string
}

// Runtime is kept as a backward-compatible alias for the generic worker runtime contract.
type Runtime = workerbackend.RuntimeSession

type Adapter interface {
	Name() string
	SpawnSession(context.Context, SessionConfig) (Runtime, error)
}

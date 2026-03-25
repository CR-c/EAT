package agent

import "context"

type SessionConfig struct {
	BranchName  string
	Prompt      string
	SessionType string
	WorkDir     string
}

type Runtime interface {
	Kill() error
}

type Adapter interface {
	Name() string
	SpawnSession(context.Context, SessionConfig) (Runtime, error)
}

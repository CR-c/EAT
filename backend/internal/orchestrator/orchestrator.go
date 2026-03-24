package orchestrator

import "context"

type Orchestrator struct{}

func New() *Orchestrator {
	return &Orchestrator{}
}

func (o *Orchestrator) GracefulStop(context.Context) error {
	return nil
}

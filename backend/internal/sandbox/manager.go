package sandbox

import (
	"context"
	"os/exec"
)

type Health struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

type Policy struct {
	WorkerDefault  string `json:"workerDefault"`
	PreviewDefault string `json:"previewDefault"`
}

type Manager struct{}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) DockerHealth(context.Context) Health {
	if _, err := exec.LookPath("docker"); err != nil {
		return Health{
			Available: false,
			Reason:    "docker executable not found",
		}
	}

	return Health{Available: true}
}

func (m *Manager) Policy() Policy {
	return Policy{
		WorkerDefault:  "DOCKER",
		PreviewDefault: "DOCKER",
	}
}

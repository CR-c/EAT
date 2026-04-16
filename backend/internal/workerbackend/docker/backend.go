package docker

import (
	"context"
	"fmt"
	"strings"

	"eat/backend/internal/sandbox"
	"eat/backend/internal/workerbackend"
)

const defaultTrustLevel = "SANDBOXED"

type Backend struct {
	manager *sandbox.Manager
}

func New(manager *sandbox.Manager) *Backend {
	return &Backend{manager: manager}
}

func (b *Backend) Kind() string {
	return workerbackend.KindDocker
}

func (b *Backend) Status(ctx context.Context) workerbackend.Status {
	if b == nil || b.manager == nil {
		return workerbackend.Status{
			Kind:         workerbackend.KindDocker,
			Available:    false,
			Default:      true,
			TrustLevel:   defaultTrustLevel,
			Reason:       "docker backend is not configured",
			Dependencies: []string{"docker daemon"},
		}
	}

	health := b.manager.DockerHealth(ctx)
	status := workerbackend.Status{
		Kind:       workerbackend.KindDocker,
		Available:  health.Available,
		Default:    true,
		TrustLevel: defaultTrustLevel,
		Dependencies: []string{
			"docker daemon",
			b.manager.WorkerImage,
		},
	}
	if !health.Available {
		status.Reason = health.Reason
	}
	return status
}

func (b *Backend) StartWorker(ctx context.Context, input workerbackend.StartWorkerInput) (workerbackend.RuntimeSession, error) {
	if b == nil || b.manager == nil {
		return nil, fmt.Errorf("docker backend is not configured")
	}

	networkProfile := strings.TrimSpace(input.NetworkProfile)
	if networkProfile == "" {
		networkProfile = "ISOLATED"
	}

	sandboxConfig := sandbox.SandboxConfig{
		ContainerImage:  b.manager.WorkerImage,
		ContainerUser:   b.manager.ContainerUser,
		NetworkProfile:  networkProfile,
		ReadwriteMounts: uniqueStrings(input.ReadwriteMounts),
		ReadonlyMounts:  uniqueStrings(input.ReadonlyMounts),
		WorkDir:         input.WorkDir,
	}

	return b.manager.SpawnContainerSession(ctx, sandboxConfig, input.Command, input.Env)
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

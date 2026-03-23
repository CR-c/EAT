# Phase 03 - Container Sandbox Manager And Docker Preflight

## Goal

Introduce the mandatory worker sandbox boundary so later execution phases never need to invent unsafe host-execution shortcuts.

## PRD Coverage

- `4.3 Worker 必须继续 Docker 沙箱化`
- `10.2 Agent Directory And Runtime`
- `11.1 运行时形态`
- `12.4 安全可见性`

## Preconditions

- Phase 02 complete

## Deliverables

- Container sandbox manager
- Docker preflight checks
- Session sandbox config builder
- Security defaults for worker containers

## Suggested Execution Order

1. Define sandbox config types and validation rules.
2. Implement Docker preflight probing.
3. Implement mount-policy builder and path allowlist enforcement.
4. Implement container launch/stop/cleanup helpers.
5. Expose sandbox health to the app.
6. Verify blocked-mount and daemon-failure cases.

## Schema And Persistence

- Land `AgentSession.sandboxType` and `AgentSession.containerId` now if migrations are being staged early.
- No task-level state should depend on container IDs yet.

## API And Event Surface

- Likely REST endpoints or internal handlers:
  - `GET /api/system/docker-health`
  - `GET /api/system/sandbox-policy`
- No end-user task websocket flow is required yet, but sandbox failures should already be serializable into future `task:status` reasons.

## Outputs For Next Phase

- Sandbox preflight status
- Launchable worker-sandbox abstraction
- Path validation utilities reusable by attachment and worktree phases

## Backend Tasks

- Implement a sandbox manager that can:
  - verify Docker availability
  - create per-session sandbox config
  - launch containerized processes
  - stop and tear down containers
- Enforce default mount policy:
  - subtask worktree read-write
  - attachments read-only
  - no host home or `.ssh` mount
- Define network profile handling for adapters.
- Persist `sandboxType` and `containerId` on `AgentSession`.

## Security Tasks

- Run worker containers as non-root by default.
- Reject `--privileged`.
- Reject undeclared host mounts.
- Reject unknown sandbox types unless the adapter explicitly supports them.
- Add guardrails so only app-owned paths can be mounted.

## Preflight Tasks

- Detect Docker daemon reachability.
- Detect image availability or pull strategy.
- Surface preflight failures as structured app errors, not raw daemon text.
- Add a startup health summary that phase 02 agent health UI can later incorporate.

## API Tasks

- Add endpoint or internal service for sandbox preflight status.
- Make worker-start code fail fast if Docker prerequisites are not met.

## UI Tasks

- Surface Docker availability in the agent/system health view.
- Show clear failure copy for:
  - Docker missing
  - daemon not running
  - unsupported adapter sandbox type

## Implementation Notes

- This phase should deliver the sandbox manager even if no real worker tasks are launched yet.
- Keep lead-session sandbox selection separate from worker-session sandbox policy.
- Do not bake Docker CLI strings into business logic; centralize command construction.

## Edge Cases

- Docker installed but daemon stopped
- Daemon reachable but image missing
- Adapter supports only `HOST`
- Mount path escapes project or upload roots

## Acceptance Checklist

- System can determine whether worker sandboxing is available before execution starts.
- Worker sandbox config is deterministic and auditable.
- No worker session path can mount host home or unrelated repos by default.
- Unsupported sandbox requests fail closed.

## Suggested Tests

- Unit tests for mount-policy validation
- Integration tests for Docker preflight parsing
- Manual verification that blocked mounts fail closed

## Out Of Scope

- Actual task clarification flow
- Worker orchestration lifecycle

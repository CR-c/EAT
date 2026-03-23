# Phase 02 - Agent Registry And Health Checks

## Goal

Create a stable adapter registry so the app knows which agents can orchestrate, execute, handle vision, and run in which sandbox types before any task flow begins.

## PRD Coverage

- `10.2 Agent Directory And Runtime`
- `7.1 当前产品内 / Agent 目录与运行时`
- `12.4 安全可见性`

## Preconditions

- Phase 01 complete

## Deliverables

- `AgentRegistry` implementation
- Adapter factory contract
- Health-check pipeline
- Agent health screen

## Suggested Execution Order

1. Implement adapter interfaces and capability types.
2. Build the in-memory registry and registration flow.
3. Add health-check execution and result normalization.
4. Expose agent and health data to the UI.
5. Build the agent health screen and selection helpers.

## Schema And Persistence

- No database schema is strictly required in this phase if the registry remains in-process.
- If health results are cached, document cache lifetime and invalidation policy clearly.

## API And Event Surface

- Likely REST endpoints:
  - `GET /api/agents`
  - `GET /api/agents/health`
- Optional websocket event:
  - `agent:health`

## Outputs For Next Phase

- Lead/worker candidate filtering
- Capability lookup for planning and attachment filtering
- Structured agent-health reasons reusable in task creation and execution UIs

## Backend Tasks

- Implement the adapter interfaces from the PRD.
- Create a registry that supports:
  - register
  - unregister
  - lookup by name
  - lead candidate list
  - worker candidate list
  - health-check-all
- Persist or cache health-check results carefully so the UI can poll without re-running expensive checks every render.
- Add capability metadata:
  - `canOrchestrate`
  - `canExecute`
  - `supportsVision`
  - `supportsInteractiveInput`
  - `supportedSandboxTypes`

## Adapter Tasks

- Implement at least one lead-capable adapter and one worker-capable adapter stub or real integration.
- Define a common error taxonomy for:
  - binary missing
  - auth missing
  - unsupported sandbox
  - unsupported capability

## API Tasks

- Add endpoint to list all registered agents and their capability metadata.
- Add endpoint or event to fetch health-check results.
- Ensure task creation and planning paths can validate agent health synchronously enough for UX needs.

## UI Tasks

- Build agent health view.
- Show capability badges.
- Show degraded/unavailable states with reason.
- Distinguish lead candidates from worker candidates.

## Implementation Notes

- Registry state is application state, not task state.
- Health checks should not mutate user repos.
- Keep health-check output structured; avoid making the UI parse strings.
- Sandbox support must be explicit. Do not assume every adapter can run in Docker.

## Edge Cases

- Agent binary installed but not authenticated
- Agent supports lead flows but not worker flows
- Agent supports host mode only
- Intermittent health-check failures

## Acceptance Checklist

- UI can list all agents and their health state.
- Task creation can block unhealthy lead-agent selection.
- Planning and worker assignment code can query capabilities without hard-coded provider names.
- Registry can represent adapters that support `HOST` only, `DOCKER` only, or both.

## Suggested Tests

- Registry unit tests
- Adapter capability filtering tests
- Health-check API integration tests

## Out Of Scope

- Live session spawning
- PTY output streaming

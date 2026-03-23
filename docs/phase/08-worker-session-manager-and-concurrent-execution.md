# Phase 08 - Worker Session Manager And Concurrent Execution

## Goal

Create isolated branches and worktrees, then run multiple worker sessions concurrently with clean session ownership and retry-safe persistence.

## PRD Coverage

- `4.3 Worker 必须继续 Docker 沙箱化`
- `10.6 Team Lifecycle And Worker Execution`
- `11.1 运行时形态`
- `12.4 安全可见性`
- task / subtask execution lifecycle rules

## Preconditions

- Phase 07 complete
- Phase 03 sandbox manager complete

## Deliverables

- Branch naming and collision handling
- Task-mainline branch-aware workspace preparation
- Worktree creation
- Worker `AgentSession` creation
- Concurrent execution orchestrator
- Retry support on the same subtask branch
- Attachment filtering at worker-launch time

## Suggested Execution Order

1. Implement branch-name computation and collision resolution.
2. Implement worktree creation from `baseCommitSha`.
3. Launch worker sessions through sandbox manager.
4. Wire session ownership and subtask state transitions.
5. Add retry path and attachment filtering.
6. Verify mixed-success branch-setup scenarios.

## Schema And Persistence

- Persist or update:
  - `SubTask.branchName`
  - `SubTask.startCommitSha`
  - `SubTask.worktreePath`
  - `SubTask.retryCount`
  - worker `AgentSession` rows
- Keep prior `AgentSession` records append-only across retries.

## API And Event Surface

- Client event:
  - `subtask:retry`
- Server events:
  - `branch:renamed`
  - `subtask:status`
  - `session:started`
  - `session:output`
  - `session:ended`

## Outputs For Next Phase

- Running or completed worker sessions with stable session IDs
- Included/excluded attachment launch metadata
- Reliable branch/worktree ownership per subtask

## Backend Tasks

- Compute deterministic branch names: `eat/{taskId}/{branchSuffix}`.
- Resolve collisions using numeric suffixes.
- Persist resolved branch names and emit rename events.
- Create one task-mainline branch per task and resolve its current head before first launching a subtask.
- Create one worktree per subtask from the current task-mainline head, not blindly from the original task `baseCommitSha`.
- Persist `SubTask.startCommitSha` so review and diff logic can recover the subtask's true starting point.
- Persist `worktreePath`.
- Create worker sessions with `taskId`, `subTaskId`, `sessionType = WORKER`.
- Filter task attachments per assigned agent capability before session spawn.
- Persist or log which attachments were included and excluded for the launched session.
- Transition subtask status:
  - `PENDING -> READY`
  - `READY -> RUNNING`
  - failure to start -> `FAILED`

## Concurrency Tasks

- Support multiple simultaneous workers of the same adapter type.
- Scope all controls and output by `sessionId`.
- Prevent duplicate live sessions for the same subtask unless retry/rework explicitly launches a new attempt after prior session ends or is cancelled.

## Retry Tasks

- Implement `subtask:retry`.
- Keep prior session records.
- Increment `retryCount`.
- Reuse same branch and worktree.
- Ensure retries re-evaluate attachment filtering for the currently assigned agent.

## API And Event Tasks

- Emit `branch:renamed`.
- Emit `subtask:status`.
- Emit session lifecycle events for worker sessions.
- Emit enough launch metadata for the UI to show included and excluded attachments.

## Implementation Notes

- Branch/worktree creation failure should move task to `ACTION_REQUIRED`, not silently skip subtasks.
- Do not reuse the user's active repo directory for execution.
- Downstream subtasks should inherit the accumulated task-mainline code state when dependencies have already landed.
- Retries must not create new branches by default.
- Branch-setup recovery should route through the generic `task:resume` flow after the underlying blocker is fixed.

## Edge Cases

- Existing branch collision
- Worktree path collision
- Adapter spawn succeeds but process exits immediately
- One subtask branch setup fails while others succeed
- Agent lacks vision capability for task-critical image attachment

## Acceptance Checklist

- System can run several worker sessions concurrently.
- At least two sessions of the same agent type can run at once.
- Retry relaunches a subtask on the same branch/worktree.
- Attachment filtering is applied per worker launch and surfaced for the UI.

## Suggested Tests

- Branch naming unit tests
- Worktree creation integration tests
- Concurrency tests with multiple worker sessions

## Out Of Scope

- Terminal rendering UX polish
- Review logic

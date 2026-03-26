# Phase 13 - Worktree Cleanup And Terminal Warnings

## Goal

Finish the task lifecycle cleanly by attempting worktree cleanup on terminal states while preserving warnings instead of reopening completed tasks.

## Current Baseline In Repo

- Worktree paths are already persisted on `SubTask`.
- Container cleanup already exists inside the sandbox manager for worker runtime teardown.
- Task terminal states and merge completion semantics are defined, but task-level worktree cleanup orchestration is not implemented yet.
- No structured cleanup warning persistence exists yet.

## PRD Coverage

- `9.1 Task 状态`
- `10.6 Team Lifecycle And Worker Execution`
- `11.1 运行时形态`
- `task:cleanup-warning`

## Preconditions

- Phase 12 complete

## Deliverables

- Cleanup executor for terminal tasks
- Warning persistence and surfacing
- Terminal-state safety around cleanup failures

## Suggested Execution Order

1. Detect terminal task transitions centrally in the orchestrator.
2. Invoke worktree cleanup after terminal-state resolution.
3. Capture cleanup failures as warnings.
4. Surface warnings in the UI without reopening the task.

## Schema And Persistence

- No new core table is required if warnings are surfaced through logs and task events.
- If the codebase already has structured warning storage, document and reuse it instead of inventing a second warning path.

## Likely Touch Points

- historical implementation: `src/services/task-service.js`, `src/services/git-workspace-service.js`, `src/repositories/task-repository.js`, `src/ui/*`
- current runtime equivalents usually live under:
  - `backend/internal/task/`
  - `backend/internal/git/`
  - `web/src/features/tasks/`
- cleanup-focused tests

## API And Event Surface

- Server event:
  - `task:cleanup-warning`
- Existing task detail endpoints should expose cleanup-warning context on reload.

## Outputs For Next Phase

- Clean or at least diagnosable terminal task footprints
- Warning signal reusable by observability and metrics code

## Backend Tasks

- Trigger cleanup as part of terminal-state processing for:
  - `COMPLETED`
  - `FAILED`
  - `CANCELLED`
- Remove all task worktrees on best-effort basis.
- Log cleanup failures without changing terminal task status.
- Emit `task:cleanup-warning` for failures.
- Avoid cleanup attempts while a live session still owns the relevant worktree.

## UI Tasks

- Show cleanup warnings after terminal transition.
- Keep task visibly terminal even when cleanup had partial failure.
- Make warning copy actionable enough for manual cleanup.
- Preserve warning visibility after full page reload.

## Implementation Notes

- Cleanup must never run while a session is still active.
- Cleanup failure is operational noise, not a state-machine rollback.
- Keep enough metadata in logs to identify stale worktree paths later.
- A task can be healthy from the workflow perspective even if manual filesystem cleanup is still needed.

## Edge Cases

- Locked files in worktree
- External process still using a worktree
- Worktree already deleted manually

## Acceptance Checklist

- Terminal tasks attempt cleanup automatically.
- Cleanup failures surface as warnings only.
- Completed tasks remain completed.
- Reloading the task view still shows cleanup warning context.
- Phase 14 can count cleanup warnings from persisted state instead of scraping free-form logs.

## Suggested Tests

- Cleanup service unit tests
- Manual verification with locked-worktree scenario

## Out Of Scope

- Metrics aggregation

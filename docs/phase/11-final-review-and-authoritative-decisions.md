# Phase 11 - Final Review And Authoritative Decisions

## Goal

Implement the task-level final review that converts advisory incremental signals into authoritative subtask outcomes used by merge and follow-up actions.

## Current Baseline In Repo

- The repository already reserves `TASK_STATUS.REVIEWING` and `TASK_STATUS.MERGING`.
- Phase 10 is expected to provide incremental review history and denormalized latest-review fields on `SubTask`.
- No final review aggregation or authoritative status writeback exists yet.
- The current UI has execution detail surfaces that can be extended instead of replaced.

## PRD Coverage

- `10.8 Review And Rework`
- `9.1 Task 状态`
- `9.2 SubTask 状态`
- `4.5 审查与合并历史必须 append-only`

## Preconditions

- Phase 10 complete

## Deliverables

- Task transition into `REVIEWING`
- Final review prompt construction
- Final `ReviewRecord` persistence
- Authoritative subtask state transitions
- `ACTION_REQUIRED` routing after final review

## Suggested Execution Order

1. Detect review-readiness across all subtasks.
2. Build final review aggregate input from approved plan, diffs, runs, and incremental history.
3. Persist final review records.
4. Apply authoritative subtask transitions.
5. Route task to `MERGING` or `ACTION_REQUIRED`.

## Schema And Persistence

- Reuse `ReviewRecord` with `phase = FINAL`.
- No new tables are required in this phase.
- Ensure final review records can be distinguished from incremental ones in queries and UI.

## Likely Touch Points

- historical implementation: `src/repositories/task-repository.js`, `src/services/task-service.js`, `src/services/git-workspace-service.js`, `src/ui/*`
- current runtime equivalents usually live under:
  - `backend/internal/task/`
  - `backend/internal/git/`
  - `web/src/features/tasks/`
- final-review integration tests

## API And Event Surface

- Server events:
  - `task:status`
  - `subtask:review`
  - `subtask:status`
- Client event reused later:
  - `subtask:confirm-discard`

## Outputs For Next Phase

- Authoritative merge set
- Explicit unresolved items requiring user action
- Final review history for audit/debugging

## Backend Tasks

- Detect when all subtasks are no longer running and task can enter `REVIEWING`.
- Build final review prompt including:
  - original task description
  - approved plan
  - per-subtask diff summary
  - latest successful session result
  - retry count
  - all incremental review records
- Persist one final `ReviewRecord` per reviewed subtask.
- Apply authoritative transitions:
  - `REVIEW_PENDING -> ACCEPTED`
  - `REVIEW_PENDING -> REWORK_REQUIRED`
  - `REVIEW_PENDING -> DISCARD_PENDING`
- Keep final-review decisions append-only even if later user action triggers another rework cycle.

## Action Routing Tasks

- If any subtask ends final review in:
  - `REWORK_REQUIRED`
  - `DISCARD_PENDING`
  - `FAILED`
  - `CANCELLED`
  move task to `ACTION_REQUIRED`.
- If all subtasks are resolved to:
  - `ACCEPTED`
  - `DISCARDED`
  - `CANCELLED`
  move task to `MERGING`.
- Record a clear task-level reason when routing to `ACTION_REQUIRED`.

## UI Tasks

- Show final review summaries distinctly from incremental summaries.
- Show discard confirmation UI.
- Show rework-required state clearly.
- Surface which subtasks are accepted and therefore eligible for merge next.

## Implementation Notes

- Final review must operate on the latest successful run of each subtask.
- If a subtask was early-reworked several times, only the latest completed run should be considered for final review inputs.
- Keep final review output append-only in history, even if later rework occurs.
- Do not let the UI or prompt wording imply that incremental review already settled the outcome.

## Edge Cases

- Some subtasks never reached `REVIEW_PENDING` because they failed
- Lead agent unavailable during final review
- One subtask was cancelled by user while others completed

## Acceptance Checklist

- Final review writes authoritative decisions.
- Task moves to either `MERGING` or `ACTION_REQUIRED` correctly.
- Discard confirmation is required before `DISCARDED`.
- Mixed outcomes across accepted, rework, failed, and cancelled subtasks are routed correctly.
- Phase 12 can start without re-deriving the merge set from ad hoc UI state.

## Suggested Tests

- Final-review state machine tests
- Mixed outcome integration tests
- Manual verification of discard confirmation flow

## Out Of Scope

- Actual merge execution

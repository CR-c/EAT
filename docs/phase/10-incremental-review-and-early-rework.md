# Phase 10 - Incremental Review And Early Rework

## Goal

Add fast post-run feedback for each completed subtask and unlock the efficiency win of user-driven early rework without violating the rule that final review remains authoritative.

## Current Baseline In Repo

- Successful worker exits already move subtasks to `REVIEW_PENDING`.
- `TASK_STATUS.REVIEWING` and `TASK_STATUS.MERGING` already exist in the repository constants but are not yet exercised.
- There is no `ReviewRecord` persistence yet, and the UI does not surface any advisory review state.
- Retry support already exists on the same branch and worktree, which this phase should reuse for early rework.

## PRD Coverage

- `10.8 Review And Rework`
- `4.1 人类监督优先`
- `4.5 审查与合并历史必须 append-only`
- `subtask:rework`
- `subtask:change-agent`

## Preconditions

- Phase 08 complete
- Phase 09 complete

## Deliverables

- Incremental review prompts
- `ReviewRecord` persistence with `INCREMENTAL`
- `latestReviewDecision` denormalization
- Early rework flow from `REVIEW_PENDING -> READY`

## Suggested Execution Order

1. Add `ReviewRecord` schema and subtask convenience fields if not already migrated.
2. Trigger incremental review on successful session completion.
3. Persist review records and convenience fields.
4. Implement `Rework Now` path and optional agent switching.
5. Verify multi-subtask execution where one subtask reworks early while others continue.

## Schema And Persistence

- Required persistence:
  - `ReviewRecord`
  - `SubTask.latestReviewDecision`
  - `SubTask.latestReviewPhase`
  - `SubTask.latestReviewSummary`
- Keep incremental review append-only even across repeated reworks.

## Likely Touch Points

- historical implementation: `src/repositories/task-repository.js`, `src/services/task-service.js`, `src/services/agent-service.js`, `src/ui/*`
- current runtime equivalents usually live under:
  - `backend/internal/task/`
  - `backend/internal/agent/`
  - `web/src/features/tasks/`
- review and execution integration tests

## API And Event Surface

- Client events:
  - `subtask:rework`
  - `subtask:change-agent`
- Server events:
  - `subtask:review`
  - `subtask:status`
  - `subtask:agent-changed`

## Outputs For Next Phase

- Advisory review history
- Efficient early rework path
- Updated subtask state ready for final-review aggregation

## Backend Tasks

- When a worker session exits successfully:
  - move subtask to `REVIEW_PENDING`
  - gather review inputs
  - send incremental review prompt to lead agent
- Persist one `ReviewRecord` with `phase = INCREMENTAL`.
- Update convenience fields on `SubTask`:
  - `latestReviewDecision`
  - `latestReviewPhase`
  - `latestReviewSummary`
- Reuse persisted logs and `outputBuffer` from Phase 09 instead of reconstructing output from transient memory.

## Early Rework Tasks

- Allow user-triggered `subtask:rework` when:
  - subtask status is `REVIEW_PENDING`
  - latest incremental decision is `REWORK` or `REJECTED`
- On confirmation:
  - optionally update description
  - optionally switch agent
  - move subtask back to `READY`
  - relaunch on same branch/worktree
- Keep task in `EXECUTING`.
- Re-run attachment filtering and health validation when the assigned agent changes.

## UI Tasks

- Show incremental review decision and summary per subtask.
- Show `Rework Now` only when valid.
- Show optional description edit before relaunch.
- Support `Switch Agent & Relaunch` from the same screen when useful.
- Keep incremental review visually distinct from final review to avoid implying authority.

## Implementation Notes

- Incremental review must not set `ACCEPTED`, `REWORK_REQUIRED`, or `DISCARD_PENDING` status directly.
- Early rework is a user shortcut, not an authoritative review transition.
- Preserve review history even if the subtask is reworked multiple times.
- Historical browser baseline was framework-free. In the current React frontend, keep the rework UI additive instead of introducing an unrelated second page flow.

## Edge Cases

- Lead agent unavailable when incremental review should run
- User triggers rework while another subtask is still running
- User changes agent to one that is now unhealthy
- Latest incremental review becomes stale because a new successful run completed later

## Acceptance Checklist

- Completed subtasks receive incremental review records.
- User can relaunch a bad subtask immediately without waiting for all subtasks.
- Status model remains consistent with final-review authority.
- Early rework does not incorrectly skip later final review.
- Task remains `EXECUTING` while early rework happens for one subtask and others continue.

## Suggested Tests

- Review-record persistence tests
- Early-rework state transition tests
- Agent-change relaunch tests
- Manual multi-subtask verification where one subtask finishes much earlier than others

## Out Of Scope

- Final authoritative review
- Merge decisions

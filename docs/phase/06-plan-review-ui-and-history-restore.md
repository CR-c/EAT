# Phase 06 - Plan Review UI And History Restore

## Goal

Give the user a safe editing surface for the current plan, including the ability to restore prior lead-generated plan snapshots before execution begins.

## PRD Coverage

- `4.4 计划与执行分离`
- `4.5 审查与合并历史必须 append-only`
- `10.5 Role-Aware DAG Planning`
- `12.1 Web-first`
- `task:restore-plan-snapshot`
- `task:plan-restored`

## Preconditions

- Phase 05 complete

## Deliverables

- `PLAN_REVIEW` UI
- Editable plan draft experience
- Restore-from-history flow
- Revalidation before approval

## Suggested Execution Order

1. Build editable client-side plan state from `currentPlanJson`.
2. Add server-side validation for edited drafts.
3. Implement restore-from-history action.
4. Add approval gating on validation success.
5. Verify history restore, edit, and re-edit loops.

## Schema And Persistence

- No new core tables are required if `PlanSnapshot` already exists from phase 05.
- Optional audit write:
  - `PlanSnapshot.source = RESTORED_FROM_HISTORY`

## API And Event Surface

- Client event:
  - `task:restore-plan-snapshot`
- Server event:
  - `task:plan-restored`
- Approval handoff:
  - `task:approve-plan`

## Outputs For Next Phase

- User-approved current draft ready for materialization
- Restoreable plan history with explicit current-vs-approved separation

## UI Tasks

- Build editable subtask list UI.
- Allow user to:
  - edit title
  - edit description
  - change worker agent
  - edit branch suffix
  - add subtask
  - remove subtask
- Show plan history sidebar or modal for prior lead-generated snapshots.
- Add restore confirmation UX.

## Backend Tasks

- Accept current-plan edits without mutating plan history.
- Revalidate edited plan before approval.
- On restore, set `currentPlanJson` from selected `PlanSnapshot`.
- Optionally write `RESTORED_FROM_HISTORY` snapshot for auditability.

## API Tasks

- Implement `task:restore-plan-snapshot`.
- Emit `task:plan-restored`.
- Make `task:approve-plan` consume the edited plan payload or server-stored current draft deterministically.

## Implementation Notes

- User edits must not increment `planVersion`.
- Restored plans become the current draft; they are not automatically approved.
- Avoid coupling UI array order to execution order beyond stable display; dependency graph editing is introduced later in phase 15.

## Edge Cases

- Restoring a snapshot that references now-unhealthy agents
- User edits create duplicate branch suffixes
- Removing all subtasks
- Concurrent edits from multiple tabs on the same machine

## Acceptance Checklist

- User can edit and restore plans before approval.
- Restored snapshot is visible in the UI immediately.
- Invalid edited plan cannot be approved.
- Edited plan state survives common UI interactions without dropping unsaved fields accidentally.

## Suggested Tests

- Plan edit validation tests
- Restore-from-history integration tests
- Manual UX verification for add/remove/edit flows

## Out Of Scope

- Actual subtask branch creation
- Worker execution

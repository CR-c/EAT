# Phase 07 - Approved Plan Materialization

## Goal

Freeze the approved plan, create executable `SubTask` records from it, and prepare the task for worker execution without launching workers yet.

## PRD Coverage

- `4.4 计划与执行分离`
- `10.5 Role-Aware DAG Planning`
- `10.6 Team Lifecycle And Worker Execution`
- `8.1 Task 关键字段`
- `8.2 SubTask 关键字段`

## Preconditions

- Phase 06 complete

## Deliverables

- `approvedPlanJson`
- `PlanSnapshot` with `APPROVED`
- `Task.taskBranchName`
- `SubTask` records created from approved plan
- task transition into `EXECUTING`

## Suggested Execution Order

1. Add `SubTask` persistence if not already migrated.
2. Implement approval transaction boundaries.
3. Freeze approved plan and append approved snapshot.
4. Materialize subtasks from approved items.
5. Emit initial task/subtask status updates.

## Schema And Persistence

- Required persistence:
  - `Task.approvedPlanJson`
  - `Task.taskBranchName`
  - `SubTask`
- Materialized subtasks must start with:
  - `status = PENDING`
  - null `branchName`
  - null `worktreePath`

## API And Event Surface

- Client event:
  - `task:approve-plan`
- Server events:
  - `task:status`
  - `subtask:status`

## Outputs For Next Phase

- Frozen approved plan
- Materialized subtasks that execution code can own without re-reading plan JSON

## Backend Tasks

- Validate the final `currentPlanJson` one last time at approval time.
- Copy `currentPlanJson` to `approvedPlanJson`.
- Create one `PlanSnapshot` with `source = APPROVED`.
- Ensure the task has one task-mainline branch reserved for execution.
- Materialize one `SubTask` per approved plan item.
- Copy fields to `SubTask`:
  - title
  - description
  - branch suffix
  - assigned agent
  - auto-assignment flag if needed
- Keep `branchName` and `worktreePath` null until branch/worktree creation succeeds.

## State Tasks

- Move task from `PLAN_REVIEW` to `EXECUTING`.
- Ensure failure in materialization does not leave half-approved state with missing approved snapshot.

## API And Event Tasks

- Implement `task:approve-plan`.
- Emit `task:status`.
- Emit initial `subtask:status` events if the UI expects them immediately after materialization.

## Implementation Notes

- This phase is the last point where plan data is the source of truth.
- After materialization, execution should consume `SubTask` rows, not parse `approvedPlanJson` on every transition.
- Preserve the approved snapshot even if later execution mutates `SubTask` records.

## Edge Cases

- Approval race from multiple browser tabs
- Snapshot write succeeds but subtask creation fails
- Unknown agent type appears because registry changed after plan review

## Acceptance Checklist

- Approved plan is frozen and recoverable.
- Subtasks are created exactly once.
- Task enters `EXECUTING` with materialized subtasks.
- Duplicate approval requests cannot create duplicate subtasks.

## Suggested Tests

- Approval transaction tests
- Idempotency tests for duplicate approval attempts
- Snapshot/subtask consistency tests

## Out Of Scope

- Branch creation
- Session spawning

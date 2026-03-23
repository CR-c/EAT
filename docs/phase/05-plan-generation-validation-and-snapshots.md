# Phase 05 - Plan Generation, Validation, And Snapshots

## Goal

Turn clarification output into a valid editable plan draft, validate it rigorously, and persist plan history without creating executable subtasks yet.

## PRD Coverage

- `4.4 计划与执行分离`
- `4.5 审查与合并历史必须 append-only`
- `10.5 Role-Aware DAG Planning`
- `8.1 Task 关键字段`

## Preconditions

- Phase 04 complete

## Deliverables

- Lead planning prompt flow
- Plan JSON parser and validator
- `currentPlanJson`
- `planVersion`
- `PlanSnapshot` history for lead-generated plans

## Suggested Execution Order

1. Add plan-related task fields and `PlanSnapshot` schema.
2. Implement planning prompt trigger from requirement confirmation.
3. Build parser and validator.
4. Persist valid plan drafts and snapshot history.
5. Emit plan-generated events and render draft output.
6. Verify invalid regeneration loops and version semantics.

## Schema And Persistence

- Required persistence:
  - `Task.currentPlanJson`
  - `Task.planVersion`
  - `PlanSnapshot`
- `planVersion` must start at `0`.
- Lead-generated valid plans must append history without creating subtasks.

## API And Event Surface

- Server event:
  - `task:plan-generated`
- Internal service contract:
  - generate plan
  - validate plan
  - append snapshot

## Outputs For Next Phase

- Valid editable current plan
- Versioned lead-generated plan history
- Stable validation rules reusable by plan review and approval

## Backend Tasks

- Trigger planning instructions after requirement confirmation.
- Parse lead-agent JSON output safely.
- Validate:
  - parseable JSON
  - non-empty `subtasks`
  - non-empty title and description
  - healthy recommended agents
  - unique `branch_suffix`
  - slug-safe `branch_suffix`
- Persist valid payload into `currentPlanJson`.
- Increment `planVersion` only when a syntactically valid plan payload is produced.
- Write `PlanSnapshot` with `source = LEAD_GENERATED`.
- Keep task in `PLANNING` on validation failure and request regeneration.

## API And Event Tasks

- Emit `task:plan-generated` with `currentPlan` and `planVersion`.
- Add internal logging for validation errors.
- Ensure regenerated plans overwrite the current draft but append history.

## UI Tasks

- Show planning state and regeneration attempts.
- Render generated subtasks from `currentPlanJson`.
- Surface validation failures without exposing raw parser internals.

## Implementation Notes

- Treat lead output as untrusted text until validated.
- Avoid partial persistence of invalid subtasks.
- Snapshot history must preserve the original lead-generated payload even if the current plan later changes.

## Edge Cases

- Lead returns markdown-wrapped JSON
- Lead returns valid JSON with invalid shape
- Recommended agent exists but is unhealthy
- Duplicate or empty branch suffixes

## Acceptance Checklist

- Valid plan generation produces `currentPlanJson` and a `PlanSnapshot`.
- Invalid plans do not leave the task in `PLAN_REVIEW`.
- Regeneration increments `planVersion` correctly.
- Lead-generated history remains restorable even after several regenerations.

## Suggested Tests

- Parser and validator unit tests
- Integration tests for invalid-to-valid regeneration loop
- Snapshot history tests

## Out Of Scope

- User editing of plans
- Subtask creation

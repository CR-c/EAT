# Phase 15 - Dependent Subtask Scheduling

## Goal

Allow one approved plan to contain lightweight subtask dependencies so downstream work starts automatically only after its prerequisite subtasks complete execution.

## PRD Coverage

- `4.1 MVP In Scope`
- `4.3 MVP Guardrails`
- `6.2 Dependency Model`

## Preconditions

- Phases 01 to 14 complete

## Deliverables

- Plan schema support for `depends_on`
- Dependency validation
- `BLOCKED` subtask lifecycle state
- Automatic dependency release and launch
- UI visibility for dependency-constrained subtasks

## Suggested Execution Order

1. Extend the plan schema and validation rules.
2. Persist subtask dependency metadata.
3. Materialize dependent subtasks as `BLOCKED`.
4. Release blocked subtasks when prerequisites finish successfully.
5. Surface dependency metadata and blocked state in the UI.
6. Verify dependency-chain execution and blocked failure cases.

## Schema And Persistence

- Extend `SubTask` persistence with dependency branch suffix metadata.
- No destructive migration is required.

## API And Event Surface

- Existing task APIs should expose dependency metadata in plan payloads and materialized subtasks.
- Existing `subtask:status` events should surface `BLOCKED` and dependency metadata.

## Outputs For Next Phase

- Plans can express simple dependency chains.
- Worker scheduling can mix parallel roots and dependency-constrained downstream subtasks.

## Backend Tasks

- Extend validated plan payloads with optional `depends_on`.
- Require every dependency to reference an earlier `branch_suffix`.
- Reject invalid references and dependency cycles.
- Persist dependency metadata on each materialized subtask.
- Mark subtasks with unmet dependencies as `BLOCKED`.
- Automatically move blocked subtasks to `PENDING` once prerequisites are satisfied.
- Automatically launch newly released subtasks while the task is still executing.
- Route unresolved blocked subtasks to `ACTION_REQUIRED` when prerequisites fail or require intervention.

## UI Tasks

- Show `depends_on` in plan review.
- Allow editing dependency lists in the plan draft.
- Show `BLOCKED` as a first-class subtask status.

## Implementation Notes

- Use existing `subtask:status` events instead of introducing a dedicated dependency event.
- Keep merge orchestration unchanged unless dependency ordering requires deterministic merge order later.
- Do not introduce cross-task dependencies in this phase.

## Edge Cases

- Forward references in `depends_on`
- Duplicate dependencies
- Dependency target missing after user draft edits
- Upstream subtask fails while downstream subtask remains blocked
- User retries an upstream subtask and downstream subtasks become releasable afterward

## Acceptance Checklist

- Dependency-constrained plans validate correctly.
- Downstream subtasks do not start before prerequisites complete.
- Released subtasks start automatically without manual re-approval.
- Blocked downstream subtasks surface clearly in task detail and events.
- Failed prerequisites prevent final review from starting and route the task to `ACTION_REQUIRED`.

## Suggested Tests

- Plan validation tests for `depends_on`
- Repository persistence test for subtask dependency metadata
- Integration test for a two-stage dependency chain
- Integration test for blocked downstream subtasks after upstream failure

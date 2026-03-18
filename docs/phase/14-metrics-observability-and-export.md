# Phase 14 - Metrics, Observability, And Export

## Goal

Close the loop on reliability and product feedback by making task/session metrics queryable, exportable, and aligned with the PRD success metrics.

## PRD Coverage

- `13.4 Observability`
- Section 16 Success Metrics

## Preconditions

- Phases 01 to 13 complete enough to generate real data

## Deliverables

- Queryable metric summaries
- Export path or endpoint
- Operational counters for failures and retries
- Documentation for interpreting metrics

## Suggested Execution Order

1. Inventory all required metric inputs and confirm they already exist in persisted data.
2. Fill any missing persistence gaps before writing summary queries.
3. Implement deterministic SQL or repository queries for each metric.
4. Add export endpoint or CLI surface.
5. Validate results against known seeded task histories.

## Schema And Persistence

- Prefer reusing existing persisted fields.
- Add missing derived counters only if they cannot be queried reliably from existing history tables.
- Do not introduce a separate analytics pipeline in MVP.

## API And Event Surface

- Likely REST endpoints:
  - `GET /api/metrics/summary`
  - `GET /api/metrics/export`
- No websocket dependency is required in this phase.

## Outputs For Next Phase

- Final operator-facing insight layer
- Exportable metrics for PRD success tracking
- Baseline for future optimization or roadmap decisions

## Backend Tasks

- Ensure the database captures:
  - task creation timestamp
  - task completion timestamp
  - session exit status
  - retry count
  - merge conflict count
  - `completedAt` on merge/rebase records
  - final task outcome
  - cleanup warning count
  - sandbox launch failure count
  - rebase-retry attempt count
- Build metric-summary queries from persisted records only.
- Add export command or API endpoint.

## Product Analytics Tasks

- Define how to compute:
  - completion rate after plan approval
  - routing correctness
  - worker crash detection rate
  - retry-to-review conversion
  - merge conflict surfacing accuracy
  - median time to first worker output
  - early rework adoption

## UI And Ops Tasks

- Add a simple metrics summary screen or admin panel if needed.
- Document how operators can export and inspect summaries.

## Implementation Notes

- Do not add a separate analytics pipeline for MVP.
- Prefer deterministic SQL queries over ad hoc in-memory counters.
- Keep metric definitions in code comments or docs close to query logic.

## Edge Cases

- Tasks created before some counters existed
- Partial data from failed sessions
- Sessions with output but no successful completion

## Acceptance Checklist

- Metric summaries can be exported from persisted local data.
- Reported metrics align with PRD definitions.
- Missing data paths fail visibly instead of silently reporting wrong numbers.
- Queries remain correct across tasks with retries, reworks, conflicts, and cleanup warnings.

## Suggested Tests

- Query-level tests against seed data
- Export endpoint integration tests
- Manual validation against a few known task runs

## Out Of Scope

- External analytics services

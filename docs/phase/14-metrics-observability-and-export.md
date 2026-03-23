# Phase 14 - Metrics, Observability, And Export

## Goal

Close the loop on reliability and product feedback by making task/session metrics queryable, exportable, and aligned with the PRD success metrics.

## Current Baseline In Repo

- The repository already persists projects, tasks, plan snapshots, attachments, messages, sessions, and subtasks.
- Later phases are expected to add append-only review history, merge history, and cleanup-warning persistence.
- The current stack is a local Node server with SQLite-backed repositories and no external analytics pipeline.
- Metrics should therefore be derived from repository queries and exported locally.

## PRD Coverage

- `10.10 Preview, Metrics And Archive`
- `11.3 持久化要求`
- `13. 成功标准`

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

## Likely Touch Points

- repository query modules under `src/repositories/`
- `src/server/app.js`
- a dedicated metrics service under `src/services/`
- optional lightweight UI surface under `src/ui/`
- metrics integration and seeded-history tests

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
- Fail visibly when required persisted inputs are missing instead of silently returning misleading zeros.

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
- Keep the UI optional; the API or CLI export is the authoritative delivery surface.

## Implementation Notes

- Do not add a separate analytics pipeline for MVP.
- Prefer deterministic SQL queries over ad hoc in-memory counters.
- Keep metric definitions in code comments or docs close to query logic.
- Because this is local-first and single-user, favor inspectable exports over background telemetry.

## Edge Cases

- Tasks created before some counters existed
- Partial data from failed sessions
- Sessions with output but no successful completion

## Acceptance Checklist

- Metric summaries can be exported from persisted local data.
- Reported metrics align with PRD definitions.
- Missing data paths fail visibly instead of silently reporting wrong numbers.
- Queries remain correct across tasks with retries, reworks, conflicts, and cleanup warnings.
- Export output is stable enough to diff across seeded histories in tests.

## Suggested Tests

- Query-level tests against seed data
- Export endpoint integration tests
- Manual validation against a few known task runs

## Out Of Scope

- External analytics services

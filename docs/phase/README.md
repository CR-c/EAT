# EAT Development Phases

This folder breaks [PRD.md](/home/code/EAT/docs/PRD.md) into implementation phases. Each phase is intentionally narrow and maps to one step in the MVP delivery sequence.

## Ordering Rules

- Build phases in order unless a later phase explicitly says it can start in parallel.
- Do not skip schema or protocol work in earlier phases and "patch it in later".
- Treat each phase document as a delivery contract: code, tests, and operator-visible behavior must all be updated together.

## Phase List

1. [01-project-registration-and-repo-validation.md](/home/code/EAT/docs/phase/01-project-registration-and-repo-validation.md)
2. [02-agent-registry-and-health-checks.md](/home/code/EAT/docs/phase/02-agent-registry-and-health-checks.md)
3. [03-container-sandbox-manager-and-docker-preflight.md](/home/code/EAT/docs/phase/03-container-sandbox-manager-and-docker-preflight.md)
4. [04-lead-session-chat-flow.md](/home/code/EAT/docs/phase/04-lead-session-chat-flow.md)
5. [05-plan-generation-validation-and-snapshots.md](/home/code/EAT/docs/phase/05-plan-generation-validation-and-snapshots.md)
6. [06-plan-review-ui-and-history-restore.md](/home/code/EAT/docs/phase/06-plan-review-ui-and-history-restore.md)
7. [07-approved-plan-materialization.md](/home/code/EAT/docs/phase/07-approved-plan-materialization.md)
8. [08-worker-session-manager-and-concurrent-execution.md](/home/code/EAT/docs/phase/08-worker-session-manager-and-concurrent-execution.md)
9. [09-realtime-output-streaming-and-summary-ux.md](/home/code/EAT/docs/phase/09-realtime-output-streaming-and-summary-ux.md)
10. [10-incremental-review-and-early-rework.md](/home/code/EAT/docs/phase/10-incremental-review-and-early-rework.md)
11. [11-final-review-and-authoritative-decisions.md](/home/code/EAT/docs/phase/11-final-review-and-authoritative-decisions.md)
12. [12-merge-flow-and-rebase-retry.md](/home/code/EAT/docs/phase/12-merge-flow-and-rebase-retry.md)
13. [13-worktree-cleanup-and-terminal-warnings.md](/home/code/EAT/docs/phase/13-worktree-cleanup-and-terminal-warnings.md)
14. [14-metrics-observability-and-export.md](/home/code/EAT/docs/phase/14-metrics-observability-and-export.md)
15. [15-dependent-subtask-scheduling.md](/home/code/EAT/docs/phase/15-dependent-subtask-scheduling.md)
16. [16-agent-mailbox-and-web-handoff.md](/home/code/EAT/docs/phase/16-agent-mailbox-and-web-handoff.md)

## Supplementary Delivery Docs

- [CHECKLISTS.md](/home/code/EAT/docs/phase/CHECKLISTS.md)
- [PRISMA-MIGRATIONS.md](/home/code/EAT/docs/phase/PRISMA-MIGRATIONS.md)
- [API-EVENT-EXAMPLES.md](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)
- [ISSUE-WORKSPACE-PLAYBOOK.md](/home/code/EAT/docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md)
- [ISSUE-WORKSPACE-PLAYBOOK.zh-CN.md](/home/code/EAT/docs/phase/ISSUE-WORKSPACE-PLAYBOOK.zh-CN.md)

## Definition Of Done For Every Phase

- Required schema changes are implemented and migrated.
- Required server APIs and events are implemented.
- Required UI states are visible and testable.
- Negative-path behavior described in the phase is covered by tests or explicit manual verification steps.
- Logging and user-facing errors are good enough for debugging without attaching a debugger.

## Standard Phase Structure

Every phase document should be detailed enough for an engineer to start implementation without re-deriving scope from the PRD. The expected sections are:

- Goal
- PRD Coverage
- Preconditions
- Deliverables
- Suggested Execution Order
- Schema And Persistence
- API And Event Surface
- Outputs For Next Phase
- Backend, UI, and integration tasks
- Edge cases
- Acceptance checklist
- Suggested tests

If a phase has no schema or API changes, the document should say that explicitly instead of leaving the section implicit.

## Recommended Delivery Style

- Prefer one focused branch or PR per phase unless the codebase size makes smaller PRs necessary.
- If a phase spans backend and frontend, land the schema and server contracts first.
- Do not start later UI polish while core state transitions are still unstable.
- If a later phase depends on append-only history, land the history-preserving schema before writing orchestration logic.

## Recommended Tracking Fields

When executing a phase, track at least:

- owner
- start date
- target completion date
- blocking dependency
- implementation status
- verification status

## Cross-Cutting Constraints

- Worker execution must remain sandboxed by Docker after phase 3. Do not introduce host-executed shortcuts for workers.
- Task and subtask status transitions must be centralized in orchestrator logic.
- Session output must always remain scoped by `sessionId`.
- Keep plan drafts separate from executable subtasks.
- Keep merge and review history append-only wherever the PRD requires history preservation.

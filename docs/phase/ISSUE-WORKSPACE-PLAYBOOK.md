# EAT Issue And Workspace Playbook

This document explains how to use Vibe Kanban issues to implement EAT in the intended order.

## Current Operating Mode

The project now uses a parent-issue-only execution model for active development.

Use each parent issue together with:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/phase/PRISMA-MIGRATIONS.md`
4. `docs/phase/API-EVENT-EXAMPLES.md`
5. `docs/phase/CHECKLISTS.md`
6. The matching phase doc
7. The matching `/docs/me/CRC-*-phase-*.md` operator note

Reason:

- The parent issue tells the AI what to do in Vibe Kanban.
- The PRD remains the product source of truth.
- The phase docs define exact scope, contracts, and ordering.
- The `/docs/me` docs define the internal implementation order to use inside one parent workspace.

## Issue Roles

### Parent Issues

Parent issues are the active execution units:

- `CRC-7` to `CRC-21`

Use parent issues for:

- creating the implementation workspace
- executing the whole phase on one branch
- phase-level review, testing, cleanup, and merge

Default rule:

- one phase = one parent issue = one workspace = one branch

### Child Issues

Child issues remain in the board only as decomposition references:

- `CRC-22` and above

Use child issues for:

- understanding the intended internal implementation slices
- checking phase scope boundaries
- tracing earlier task decomposition if needed

Do not use child issues as the default place to create workspaces.

## Workspace Rules

### Parent Workspace

Create a workspace from the parent issue when:

- you are starting that phase
- `main` already contains the previous phase
- you will implement the whole phase in one branch

This is now the default and preferred path.

### Child Workspace

Do not create a child workspace unless the execution model is explicitly changed again later.

## Recommended Execution Flow

For each phase:

1. Open the parent issue and confirm the phase boundary.
2. Read the parent phase doc and the matching `/docs/me` note.
3. Create one workspace from the parent issue, targeting the latest `main`.
4. Implement the phase inside that single parent branch using the documented internal step order.
5. After each internal step, create a non-empty commit on the same parent branch.
6. Continue the next internal step from the current head of that same parent branch.
7. When all internal steps are done, perform integration, full verification, and small in-scope fixes on the same branch.
8. Review and merge the parent branch into `main`.
9. Delete the merged parent branch and push updated `main`.
10. Only then move to the next phase.

## Recommended Order

Build phases in this order:

1. `CRC-7` Phase 01 - Project Registration And Repo Validation
2. `CRC-9` Phase 02 - Agent Registry And Health Checks
3. `CRC-10` Phase 03 - Container Sandbox Manager And Docker Preflight
4. `CRC-11` Phase 04 - Lead Session Chat Flow
5. `CRC-12` Phase 05 - Plan Generation, Validation, And Snapshots
6. `CRC-13` Phase 06 - Plan Review UI And History Restore
7. `CRC-14` Phase 07 - Approved Plan Materialization
8. `CRC-15` Phase 08 - Worker Session Manager And Concurrent Execution
9. `CRC-16` Phase 09 - Realtime Output Streaming And Summary UX
10. `CRC-17` Phase 10 - Incremental Review And Early Rework
11. `CRC-18` Phase 11 - Final Review And Authoritative Decisions
12. `CRC-19` Phase 12 - Merge Flow And Rebase Retry
13. `CRC-20` Phase 13 - Worktree Cleanup And Terminal Warnings
14. `CRC-21` Phase 14 - Metrics, Observability, And Export

## Internal Step Order

The internal step order for phases 01 to 08 remains the same as the earlier child-issue split, but now all of it should be executed inside the parent workspace.

Use the `/docs/me/CRC-*-phase-*.md` files as the concrete step-by-step order.

## Parallelism Rules

Default rule:

- keep phases 01 to 08 serial
- keep internal steps inside the same phase serial

Only parallelize if the operating model is intentionally redesigned first.

Safe bias:

- schema first
- services and API second
- UI after contracts stabilize
- integration and polish last

## What To Read Before Starting A Parent Issue

Always read in this order:

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/phase/README.md`
4. `docs/phase/PRISMA-MIGRATIONS.md`
5. `docs/phase/API-EVENT-EXAMPLES.md`
6. `docs/phase/CHECKLISTS.md`
7. the matching phase doc
8. the parent issue description
9. the matching `/docs/me` phase note

## Parent Issue Prompt Template

Use this when creating a workspace from a parent issue and handing it to an AI agent.

```text
Implement parent issue {PARENT_ISSUE_ID} for project EAT in one workspace.

Repository: /home/code/EAT
Parent issue: {PARENT_ISSUE_ID} {PARENT_ISSUE_TITLE}
Phase doc: {PHASE_DOC_PATH}

Before coding, read in this order:
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. {PHASE_DOC_PATH}
8. the parent issue description
9. the matching /docs/me phase note

Execution rules:
- Implement the full phase in this parent workspace only.
- Do not create or rely on child workspaces.
- Follow the documented internal step order inside the parent branch.
- After each internal step, make a non-empty commit on the same parent branch.
- Keep all integration, fixes, and final verification on the same parent branch.
- Merge the parent branch to main only after the phase passes verification.
- After merge, delete the parent branch and push updated main.
- Do not implement later phases early unless this phase strictly requires a dependency.
- Preserve PRD names for states, fields, models, and events.

Before implementation, summarize:
- phase goal
- exact scope boundaries
- required schema changes
- required API or event changes
- required UI changes
- required tests
- internal implementation order

Then implement.

At the end, report:
- completed work
- changed files
- commits created on the parent branch
- tests run
- remaining risks or assumptions
- whether the repository is ready for the next phase
```

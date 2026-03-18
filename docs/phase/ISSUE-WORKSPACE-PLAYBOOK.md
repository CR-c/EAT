# EAT Issue And Workspace Playbook

This document explains how to use the phase issues and sub-issues in Vibe Kanban to drive implementation safely and in the intended order.

## Short Answer

Issue descriptions are useful, but they are not sufficient as the only source of truth.

Use each issue together with:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/phase/PRISMA-MIGRATIONS.md`
4. `docs/phase/API-EVENT-EXAMPLES.md`
5. `docs/phase/CHECKLISTS.md`
6. The matching phase doc

Reason:

- The issue describes the work slice, but not the full product constraints.
- The PRD defines authoritative behavior and state-machine rules.
- The migration and API docs define required schema and contract details.
- The phase README defines ordering and cross-cutting constraints.

## Issue Roles

### Parent Issues

Parent issues are the phase containers:

- `CRC-7` to `CRC-21`

Use parent issues for:

- understanding the phase scope
- tracking phase-level completion
- final integration and verification for the phase

Do not use parent issues as the default place for day-to-day implementation work.

### Child Issues

Child issues are the implementation units:

- `CRC-22` and above

Use child issues for:

- creating implementation workspaces
- assigning AI execution
- review, merge, and completion tracking

Default rule:

- one child issue = one implementation workspace

## Workspace Rules

### Child Workspace

Create a workspace from the child issue when:

- the child issue has a bounded implementation scope
- the work can be merged independently

This should be the default.

### Parent Workspace

Create a workspace from the parent issue only when:

- all child issues under the phase are complete
- you need final integration, end-to-end verification, cleanup, or small cross-slice fixes

Do not start a phase by opening a parent workspace and implementing multiple child slices inside it.

## Recommended Execution Flow

For each phase:

1. Open the parent issue and confirm the phase boundary.
2. Pick the first incomplete child issue under that parent.
3. Create a workspace from that child issue, targeting the latest `main`.
4. Ask the AI to implement only that child issue.
5. Review, test, and merge that child issue.
6. Repeat for the next child issue.
7. When all child issues are complete, optionally create one parent workspace for integration and final phase verification.
8. Close or mark complete the parent issue only after the phase-level acceptance criteria are satisfied.

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

### Child Order For Core Buildout

#### Phase 01

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`

#### Phase 02

1. `CRC-26`
2. `CRC-27`
3. `CRC-28`
4. `CRC-29`

#### Phase 03

1. `CRC-30`
2. `CRC-31`
3. `CRC-32`
4. `CRC-33`

#### Phase 04

1. `CRC-34`
2. `CRC-35`
3. `CRC-36`
4. `CRC-37`

#### Phase 05

1. `CRC-38`
2. `CRC-39`
3. `CRC-40`
4. `CRC-41`

#### Phase 06

1. `CRC-42`
2. `CRC-43`
3. `CRC-44`
4. `CRC-45`

#### Phase 07

1. `CRC-46`
2. `CRC-47`
3. `CRC-48`
4. `CRC-49`

#### Phase 08

1. `CRC-50`
2. `CRC-51`
3. `CRC-52`
4. `CRC-53`

## Parallelism Rules

Default rule:

- keep phases 01 to 05 serial

Only parallelize when both conditions are true:

- the write scopes are clearly disjoint
- the later child does not depend on contracts that the earlier child still defines

Safe bias:

- schema first
- service and API second
- UI after contracts stabilize

## What To Read Before Starting A Child Issue

Always read in this order:

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/phase/README.md`
4. `docs/phase/PRISMA-MIGRATIONS.md`
5. `docs/phase/API-EVENT-EXAMPLES.md`
6. `docs/phase/CHECKLISTS.md`
7. the matching phase doc
8. the parent issue
9. the child issue

## Child Issue Prompt Template

Use this when creating a workspace from a child issue and handing it to an AI agent.

```text
Implement child issue {CHILD_ISSUE_ID} for project EAT.

Repository: /home/code/EAT
Parent issue: {PARENT_ISSUE_ID} {PARENT_ISSUE_TITLE}
Child issue: {CHILD_ISSUE_ID} {CHILD_ISSUE_TITLE}

Before coding, read in this order:
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. {PHASE_DOC_PATH}
8. the parent issue description
9. the child issue description

Execution rules:
- Implement only the scope of this child issue.
- Do not implement later phases early unless this child issue strictly requires it.
- Preserve PRD names for states, fields, models, and events.
- Keep migrations additive where possible.
- Respect the documented Docker sandbox requirement for workers.

Before implementation, summarize:
- goal of this child issue
- exact scope boundaries
- required schema changes
- required API or event changes
- required UI changes
- required tests

Then implement.

At the end, report:
- completed work
- changed files
- tests run
- remaining risks or assumptions
- whether the next sibling child issue is now unblocked
```

## Parent Integration Prompt Template

Use this only after all child issues under a parent issue are complete.

```text
Perform phase integration and verification for parent issue {PARENT_ISSUE_ID} {PARENT_ISSUE_TITLE}.

Repository: /home/code/EAT
Phase doc: {PHASE_DOC_PATH}

Before coding, read:
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. {PHASE_DOC_PATH}
8. the parent issue description
9. all completed child issues under this parent

Goal:
- verify the phase as a whole
- fix small integration gaps
- complete missing acceptance items
- avoid starting unrelated later-phase work

At the end, report:
- completed integration fixes
- remaining unchecked checklist items
- test results
- blockers
- whether the repository is ready for the next phase
```

## Recommended Starting Point

If starting from zero, begin with:

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`

That completes the first phase in the intended contract order:

- schema
- repo probe service
- API
- UI

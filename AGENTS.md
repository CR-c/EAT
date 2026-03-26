# EAT Agent Instructions

This repository is developed against document-defined product and delivery rules. Do not improvise product behavior when the docs already define it.

## Purpose

This file is the repository-level operating guide for coding agents.

It should help you answer four questions quickly:

1. Which docs should be read first
2. Which source wins when docs or code disagree
3. Which product constraints must never be broken
4. How implementation work should be executed in this repository

## Start Here

Before making implementation decisions, read:

1. `AGENTS.md`
2. `docs/README.md`

Then branch into the smallest relevant document set for the current task.

## Task Routing

### A. Feature / Bugfix / UI / API / Refactor Work

Use this path by default for ordinary implementation tasks.

Read in this order:

1. `docs/PRD.md` only if the task affects product behavior, state machines, operator flows, or user-visible semantics
2. The directly relevant docs under `docs/`
3. For Go backend implementation work, `docs/GO-DEVELOPMENT-CONVENTIONS.md`
4. The current implementation files you are changing

Rules:

- Do not default to the earliest incomplete phase for ordinary bugfixes or localized feature work.
- Inspect the existing code before assuming scaffolding or behavior.
- Read only the phase docs that directly define the contract you are touching.

### B. Foundation Phase Work (`docs/phase/01-16`)

Use this path only when the user explicitly asks for phase delivery work, or the requested change is clearly defined as foundation-phase scope.

Read in this order:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/phase/PRISMA-MIGRATIONS.md`
4. `docs/phase/API-EVENT-EXAMPLES.md`
5. `docs/phase/CHECKLISTS.md`
6. The active phase doc in `docs/phase/`
7. If working from Vibe Kanban issues, `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

Before coding, summarize:

- phase goal
- scope boundaries
- required schema changes
- required API and event changes
- required UI changes
- required tests

### C. Extended Phase Work (`docs/v1.1/17-22`)

Use this path only when the user explicitly asks for extended-phase work, or the requested change is clearly defined there.

Read in this order:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/v1.1/README.md`
4. `docs/v1.1/PRISMA-MIGRATIONS.md`
5. `docs/v1.1/API-EVENT-EXAMPLES.md`
6. `docs/v1.1/CHECKLISTS.md`
7. The active phase doc in `docs/v1.1/`

Before coding, summarize:

- phase goal
- scope boundaries
- required schema changes
- required API and event changes
- required UI changes
- required tests

### D. Documentation Work

Read in this order:

1. `docs/PRD.md`
2. `docs/README.md`
3. The directly affected docs
4. Relevant implementation files when the docs describe runtime behavior

## Source Of Truth

If documents conflict:

- `docs/PRD.md` overrides phase docs
- phase docs override ad hoc assumptions
- implementation notes and guides do not override PRD or phase contracts
- preserve documented names for states, fields, events, models, and transitions

If code and docs conflict:

- for product intent, follow the docs
- for implementation-truth descriptions, verify the code and update docs deliberately
- do not silently change product behavior just because the current code drifted

## Product Constraints

These constraints are repository-wide and should be treated as hard guards unless the user explicitly asks to change the design docs first.

- This is a supervised local-first orchestration product, not a fully autonomous coding system.
- Worker execution must remain Docker-sandboxed after the sandbox phase lands.
- Do not replace documented worker sandboxing with unrestricted host execution.
- Keep editable plan drafts separate from materialized executable subtasks.
- Incremental review is advisory only.
- Final review is the only authoritative review phase.
- Review and merge history must remain append-only where the PRD requires history.
- Do not collapse one-to-many merge attempt history back into a single mutable merge record.
- Use the documented task and subtask state machines exactly unless the user asks to redesign them first.

## Engineering Rules

- Prefer implementing the requested scope directly instead of stopping at analysis when the task is actionable.
- Keep migrations additive where possible.
- If a documented field is required, do not silently weaken it to optional without updating the docs.
- If docs are incomplete, make the smallest defensible assumption and state it clearly in the final summary.
- Before coding, inspect the current repo state rather than assuming scaffolding already exists.
- If the user asks for review, prioritize bugs, regressions, risks, and missing tests.
- Do not solve localized implementation work by inventing broader product behavior that is not documented.

## Backend Implementation Rules

- For Go backend structure, package boundaries, API naming, interface usage, errors, testing, and migration rules, follow `docs/GO-DEVELOPMENT-CONVENTIONS.md`.
- Do not introduce a second conflicting backend style guide inside implementation PRs or ad hoc notes.

## UI And UX Rules

- Any meaningful UI or UX design, redesign, refactor, or polish work must use the `ui-ux-pro-max` skill.
- The default visual direction for new or rewritten UI in this repository is liquid-glass.
- UI implementation must use Tailwind CSS as the primary styling system.
- New or rewritten UI must preserve internationalization support for Simplified Chinese and English.
- The default interface locale must be Simplified Chinese (`zh-CN`), while keeping English (`en`) available from the UI.
- Do not ship UI-only rewrites that break existing operator flows, keyboard accessibility, or documented task-state visibility.

## Documentation Maintenance Rules

When rewriting or integrating docs:

- keep `docs/README.md` as the unified docs entrypoint
- keep `docs/PRD.md` as the only top-level product definition
- treat `docs/phase/` as foundation delivery contracts
- treat `docs/v1.1/` as extended delivery contracts, not a competing PRD
- if runtime behavior is described, verify against the current code before rewriting
- do not reintroduce obsolete `FR-*`, legacy MVP-era section references, or fake API paths
- if you change terminology in one core doc, propagate it through related indexes, checklists, and examples

## Expected Output

At the end of a phase-oriented implementation task, report:

- completed items
- changed files
- remaining unchecked items from the phase checklist
- test results
- blockers or assumptions
- whether the repository is ready for the next phase

At the end of a documentation task, report:

- which docs were integrated or rewritten
- whether terminology and cross-links were normalized
- whether runtime descriptions were verified against code
- whether tests were run

## Current Document Map

- Unified docs entry: `docs/README.md`
- Product spec: `docs/PRD.md`
- Foundation phase index: `docs/phase/README.md`
- Foundation phase tasks: `docs/phase/CHECKLISTS.md`
- Foundation schema rollout: `docs/phase/PRISMA-MIGRATIONS.md`
- Foundation API and event examples: `docs/phase/API-EVENT-EXAMPLES.md`
- Extended phase index: `docs/v1.1/README.md`
- Extended phase tasks: `docs/v1.1/CHECKLISTS.md`
- Extended schema rollout: `docs/v1.1/PRISMA-MIGRATIONS.md`
- Extended API and event examples: `docs/v1.1/API-EVENT-EXAMPLES.md`
- Runtime/implementation overview: `docs/ARCHITECTURE.md`
- Go backend conventions: `docs/GO-DEVELOPMENT-CONVENTIONS.md`
- User-facing guide: `docs/EAT-user-guide.md`
- Issue/workspace execution guide: `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

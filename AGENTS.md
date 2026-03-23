# EAT Agent Instructions

This repository is developed against document-defined product and delivery rules. Do not improvise product behavior if the docs already specify it.

## Start Here

Before making implementation decisions, start with:

1. `AGENTS.md`
2. `docs/README.md`

Then choose the matching reading path below.

## Source Of Truth By Task Type

### A. Foundation Phase Work (`docs/phase/01-16`)

Read in this order:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/phase/PRISMA-MIGRATIONS.md`
4. `docs/phase/API-EVENT-EXAMPLES.md`
5. `docs/phase/CHECKLISTS.md`
6. The active phase doc in `docs/phase/`
7. If working from Vibe Kanban issues, `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

### B. Extended Phase Work (`docs/v1.1/17-22`)

Read in this order:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/v1.1/README.md`
4. `docs/v1.1/PRISMA-MIGRATIONS.md`
5. `docs/v1.1/API-EVENT-EXAMPLES.md`
6. `docs/v1.1/CHECKLISTS.md`
7. The active phase doc in `docs/v1.1/`

### C. Documentation / Refactor / Review Work

Read in this order:

1. `docs/PRD.md`
2. `docs/README.md`
3. The directly affected docs
4. Relevant implementation files if the docs describe runtime behavior

## Conflict Resolution

If documents conflict:

- `docs/PRD.md` overrides phase docs
- phase docs override ad hoc assumptions
- implementation notes and guides do not override PRD or phase contracts
- preserve documented names for states, fields, events, models, and transitions

If code and docs conflict on current runtime behavior:

- For product intent, follow the docs
- For implementation-truth descriptions, verify the code and update docs deliberately
- Do not silently “fix” the product by drifting away from documented contracts

## Default Execution Model

Unless the user explicitly selects another phase:

- default to the earliest incomplete foundation phase in `docs/phase/`
- only jump to `docs/v1.1/` when the user explicitly asks for extended-phase work or the requested feature is defined there

When implementing a phase:

1. Read the phase doc
2. Read the matching checklist, migration notes, and API/event examples
3. Summarize:
   - phase goal
   - scope boundaries
   - required schema changes
   - required API and event changes
   - required UI changes
   - required tests
4. Then implement

## Product Constraints

- This is a supervised local-first orchestration product, not a fully autonomous coding system.
- Worker execution must remain Docker-sandboxed after the sandbox phase lands.
- Do not replace documented worker sandboxing with unrestricted host execution.
- Keep editable plan drafts separate from materialized executable subtasks.
- Incremental review is advisory only.
- Final review is the only authoritative review phase.
- Review and merge history must remain append-only where the PRD requires history.
- Do not collapse one-to-many merge attempt history back into a single mutable merge record.
- Use the documented task and subtask state machines exactly unless the user asks to change the design docs first.

## Engineering Rules

- Prefer implementing the current phase fully before moving on.
- Do not implement major later-phase features early unless required as a strict dependency.
- Keep migrations additive where possible.
- If a field is documented as required, do not silently weaken it to optional without updating docs.
- If docs are incomplete, make the smallest defensible assumption and state it clearly in the final summary.
- Before coding, inspect the current repo state rather than assuming scaffolding already exists.
- If the user asks for implementation, prefer making the code changes directly.
- If the user asks for review, prioritize bugs, risks, regressions, and missing tests.

## Documentation Maintenance Rules

When rewriting or integrating docs:

- keep `docs/README.md` as the unified docs entrypoint
- keep `docs/PRD.md` as the only top-level product definition
- treat `docs/phase/` as foundation delivery contracts
- treat `docs/v1.1/` as extended delivery contracts, not a competing PRD
- if runtime behavior is described, verify against the current code before rewriting
- do not reintroduce obsolete `FR-*`, legacy MVP-era section references, or fake API paths
- if you change terminology in one core doc, propagate it through related indexes, checklists, and examples

## UI And UX Rules

- Any meaningful UI or UX design, redesign, refactor, or polish work must use the `ui-ux-pro-max` skill.
- The default visual direction for new or rewritten UI in this repository is liquid-glass.
- UI implementation must use Tailwind CSS as the primary styling system.
- New or rewritten UI must preserve internationalization support for Simplified Chinese and English.
- The default interface locale must be Simplified Chinese (`zh-CN`), while keeping English (`en`) available from the UI.
- Do not ship UI-only rewrites that break existing operator flows, keyboard accessibility, or documented task-state visibility.

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
- User-facing guide: `docs/EAT-user-guide.md`
- Issue/workspace execution guide: `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

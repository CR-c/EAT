# EAT Agent Instructions

This repository is developed against document-defined product and delivery rules. Do not improvise product behavior if the docs already specify it.

## Source Of Truth

Read documents in this order before making implementation decisions:

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. `docs/phase/PRISMA-MIGRATIONS.md`
4. `docs/phase/API-EVENT-EXAMPLES.md`
5. `docs/phase/CHECKLISTS.md`
6. The currently active phase doc in `docs/phase/`
7. If working from Vibe Kanban issues, `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

If documents conflict:

- `docs/PRD.md` overrides phase docs
- phase docs override ad hoc assumptions
- preserve documented names for states, fields, events, and models

## Default Execution Model

Unless the user explicitly selects another phase, assume work starts from the earliest incomplete phase in `docs/phase/`.

When implementing a phase:

1. Read the phase doc
2. Read the matching items in:
   - `docs/phase/CHECKLISTS.md`
   - `docs/phase/PRISMA-MIGRATIONS.md`
   - `docs/phase/API-EVENT-EXAMPLES.md`
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
- If you must make a minimal assumption because docs are incomplete, state it clearly in your final summary.

## Expected Phase Output

At the end of a phase-oriented implementation task, report:

- completed items
- changed files
- remaining unchecked items from the phase checklist
- test results
- blockers or assumptions
- whether the repository is ready for the next phase

## Current Document Map

- Product spec: `docs/PRD.md`
- Phase index: `docs/phase/README.md`
- Phase tasks: `docs/phase/CHECKLISTS.md`
- Schema rollout: `docs/phase/PRISMA-MIGRATIONS.md`
- API and event examples: `docs/phase/API-EVENT-EXAMPLES.md`
- Issue/workspace execution guide: `docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md`

## Notes For Codex

- Before coding, inspect the current repo state rather than assuming scaffolding already exists.
- If the user asks for implementation, prefer making the code changes directly.
- If the user asks for review, prioritize bugs, risks, regressions, and missing tests.

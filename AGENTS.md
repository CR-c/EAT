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
3. The smallest relevant current doc under `docs/`

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

- Inspect the existing code before assuming scaffolding or behavior.
- Prefer current runtime docs over historical planning artifacts.

### B. Product Semantics Or State Machine Work

Use this path when the task changes product semantics, state machines, operator checkpoints, review authority, merge history, or user-visible task lifecycle behavior.

Read in this order:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/API-REFERENCE.md`
4. The relevant implementation files

Before coding, summarize:

- product goal
- scope boundaries
- required schema changes
- required API and event changes
- required UI changes
- required tests

### C. Documentation Work

Read in this order:

1. `docs/README.md`
2. `docs/PRD.md`
3. The directly affected docs
4. Relevant implementation files when the docs describe runtime behavior

## Source Of Truth

If documents conflict:

- `docs/PRD.md` overrides other repository docs for product intent
- current implementation docs do not override PRD
- implementation notes and guides do not override PRD
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
- keep `docs/API-REFERENCE.md` as the current human-readable API surface
- if runtime behavior is described, verify against the current code before rewriting
- do not reintroduce obsolete `FR-*`, legacy MVP-era section references, or fake API paths
- do not recreate large historical planning trees unless the user explicitly asks for them
- if you change terminology in one core doc, propagate it through related current docs

## Expected Output

At the end of a documentation task, report:

- which docs were integrated or rewritten
- whether terminology and cross-links were normalized
- whether runtime descriptions were verified against code
- whether tests were run

## Current Document Map

- Unified docs entry: `docs/README.md`
- Product spec: `docs/PRD.md`
- Runtime/implementation overview: `docs/ARCHITECTURE.md`
- Current API reference: `docs/API-REFERENCE.md`
- Go backend conventions: `docs/GO-DEVELOPMENT-CONVENTIONS.md`
- User-facing guide: `docs/EAT-user-guide.md`

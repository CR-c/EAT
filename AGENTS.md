# EAT Agent Instructions

This repository is designed for supervised, local-first agent orchestration. Do not treat it as a generic CRUD app or a fully autonomous coding product.

The goal of this file is to make coding agents effective in `/home/code/EAT` without relying on guesswork.

## What This File Must Answer

Before implementation, an agent should be able to answer:

1. Which docs to read first
2. Which source wins when docs and code disagree
3. Which product constraints are hard guards
4. Which commands are the real run/build/test/deploy entrypoints
5. Which local pitfalls commonly break "automatic" execution

## Start Here

Read in this order before making implementation decisions:

1. `AGENTS.md`
2. `README.md`
3. `docs/README.md`
4. `docs/HERMES-AUTONOMY-TRIAL.md` when the task is an autonomy trial, agent-evaluation run, or "let the agent do it automatically" exercise
5. The smallest relevant current doc under `docs/`
6. The implementation files you will actually change

Do not bulk-read the entire docs tree unless the task genuinely spans product semantics, backend, frontend, and deployment at the same time.

## Fast Routing

### Feature / Bugfix / UI / API / Refactor

Use this path for normal implementation work:

1. `README.md`
2. The smallest relevant current doc under `docs/`
3. `docs/GO-DEVELOPMENT-CONVENTIONS.md` for Go backend work
4. `docs/HERMES-AUTONOMY-TRIAL.md` only when the run is explicitly an autonomy experiment
5. The target implementation files

Rules:

- Inspect code before assuming scaffolding.
- Prefer current runtime docs over historical planning artifacts.
- Do not redesign product behavior when the task is local implementation work.

### Product Semantics / Workflow / State Machine Changes

Use this path when the task changes:

- task states
- subtask states
- review or merge authority
- lifecycle transitions
- operator-visible workflow semantics
- plan approval or execution contracts

Read in this order:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/API-REFERENCE.md`
4. Relevant code

Before coding, make sure you understand:

- product goal
- scope boundaries
- schema impact
- API/event impact
- UI impact
- test impact

### Documentation Work

Read in this order:

1. `docs/README.md`
2. `README.md`
3. The directly affected docs
4. Relevant code when describing runtime truth

## Source Of Truth

If documents conflict:

- `docs/PRD.md` wins for product intent
- `docs/ARCHITECTURE.md` wins for current implementation overview
- `docs/API-REFERENCE.md` wins for the intended current human-readable API surface
- `docs/GO-DEVELOPMENT-CONVENTIONS.md` wins for Go backend engineering style

If docs and code conflict:

- For product intent: follow docs, then update implementation deliberately
- For runtime-truth descriptions: verify code and update docs deliberately
- Do not silently change product behavior because the current code drifted

For runtime truth, prefer these concrete sources:

- API routes: `backend/internal/api/router.go`
- persistence shape: `prisma/migrations/` plus repository code
- runtime behavior: `backend/internal/task/`, `backend/internal/orchestrator/`, `backend/internal/api/`

Important:

- `prisma/schema.prisma` is not the complete runtime source of truth
- historical phase docs are not the same thing as the current code tree
- lowercase `agents.md` is not the authoritative instruction file; use `AGENTS.md`

## Hard Product Guards

These are repository-wide constraints unless the user explicitly asks to redesign them first:

- EAT is a supervised local-first orchestration workbench, not an unrestricted autonomous coding system
- Worker execution must remain Docker-sandboxed
- Do not replace documented worker sandboxing with unrestricted host execution
- Keep editable plan drafts separate from materialized executable subtasks
- Incremental review is advisory only
- Final review is the authoritative review phase
- Review and merge history must remain append-only where required
- Do not collapse one-to-many merge attempt history into a single mutable record
- Keep the documented task and subtask state machines unless the user explicitly changes the design
- Preserve task mainline branch semantics

## Repository Map

Use this as the default mental model:

- `backend/`
  Go backend, API, orchestration, persistence, runtime integration
- `web/`
  React + Vite frontend
- `docs/`
  current docs surface
- `prisma/`
  schema plus SQL migrations; migrations are more trustworthy than schema alone
- `deploy/`
  systemd and nginx deployment assets
- `scripts/`
  deployment and backup scripts
- `docker/worker-base/`
  worker sandbox image definition
- `agent.md`
  this server's deployment/runbook for EAT

## Real Commands

Use the repository's actual commands. Do not invent replacements.

### Install

```bash
npm install
cd web && pnpm install
```

### Run

Backend:

```bash
npm start
```

Equivalent:

```bash
cd backend && go run ./cmd/eat
```

Frontend dev:

```bash
cd web && pnpm dev
```

### Build

Build UI:

```bash
npm run build:ui
```

Build worker image:

```bash
npm run build:worker-image
```

### Test

Backend only:

```bash
cd backend && go test ./...
```

Frontend only:

```bash
cd web && pnpm lint && pnpm build
```

Full project:

```bash
npm test
```

## Critical Preflight For Autonomous Work

When working autonomously on this repository, do this before claiming success:

1. Check the current repo state and touched files
2. Read the smallest relevant docs
3. Inspect the target implementation files
4. Decide whether the task affects:
   - product semantics
   - API surface
   - schema/migrations
   - deployment/runtime env
   - frontend operator flow
5. Run the narrowest relevant validation first
6. Run broader validation before finishing if your changes cross subsystem boundaries

Do not skip validation just because the change "looks small" if it touches:

- API handlers
- task lifecycle logic
- orchestrator behavior
- repository queries
- Docker worker health checks
- project registration
- task creation

## Known Local Pitfalls

These are especially important for autonomous runs.

### 1. `npm test` currently depends on the worker image

The full test command will fail on plan-approval / execution related tests when the local Docker image is missing:

- required image: `eat/worker-base:latest`
- build command: `npm run build:worker-image`

Observed failure mode:

- plan approval endpoints return `EXECUTION_BACKEND_UNAVAILABLE` 或 `EXECUTION_AGENT_UNAVAILABLE`
- nested reason is usually still `DOCKER_UNAVAILABLE`

So:

- if plan approval / execution tests fail for worker backend reasons, build the worker image first
- do not misdiagnose this as an API regression until the image exists locally

### 2. Autonomy trials should read the dedicated trial guide

If the user is evaluating Hermes or another coding agent on this repo, also read:

- `docs/HERMES-AUTONOMY-TRIAL.md`

That document defines:

- recommended task sizing
- prompt structure
- success criteria
- what to treat as environment blockers versus code regressions

### 3. Prisma schema can lag runtime reality

If schema, migrations, and repository code disagree:

- trust migrations and runtime repository code over `prisma/schema.prisma`

### 4. Deployment truth is split across repo and host runbook

For deployment-sensitive tasks, read both:

- `README.md`
- `agent.md`

And if the task touches host deployment assets, inspect:

- `deploy/systemd/eat.env.example`
- `deploy/systemd/eat.service`
- `deploy/nginx/eat.conf`
- `scripts/deploy-release.sh`

## Backend Rules

For Go backend work:

- follow `docs/GO-DEVELOPMENT-CONVENTIONS.md`
- prefer real SQLite + real repositories + real handlers in tests
- keep functions and packages cohesive
- avoid speculative interfaces created only for mocking
- keep migrations additive when possible
- do not weaken documented required fields without updating docs deliberately

When changing backend behavior, consider whether you must also update:

- `docs/API-REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `README.md`

## Frontend Rules

For UI work:

- preserve `zh-CN` as default locale and keep English available
- do not break documented operator flows
- do not ship a visual rewrite that regresses accessibility or task-state visibility
- keep frontend API wrappers aligned with backend routes

If the task is meaningful UI/UX work rather than a tiny fix:

- use the `ui-ux-pro-max` skill

## Documentation Update Rules

Update docs when the change affects current truth.

You should update docs when you change:

- API routes or response semantics
- runtime state transitions
- environment variables
- deploy steps
- worker sandbox assumptions
- task creation prerequisites

Do not reintroduce large historical planning trees as if they were current docs.

## Autonomous Execution Contract

If the user is using this repository to test "full automatic" agent execution, the agent should still work in bounded milestones:

- restate the target briefly
- choose the smallest executable slice
- implement
- validate
- report remaining risk

Do not convert a vague large request into uncontrolled repo-wide churn.

For large requests, the preferred pattern is:

1. clarify acceptance criteria
2. change one subsystem at a time
3. run validation after each subsystem
4. update docs if runtime truth changed

## What A Good Final Report Must Include

At the end of work, report:

- what changed
- which commands were run
- what passed
- what failed
- whether failures are real regressions or environment/precondition issues
- whether docs were updated
- any assumptions that still need human confirmation

## Current Core Docs

- `README.md`
- `docs/README.md`
- `docs/HERMES-AUTONOMY-TRIAL.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/API-REFERENCE.md`
- `docs/GO-DEVELOPMENT-CONVENTIONS.md`
- `docs/EAT-user-guide.md`
- `agent.md`

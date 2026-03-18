# Phase 01 - Project Registration And Repo Validation

## Goal

Ship the minimum project-management slice that lets the app register a local git repository safely and display repo state needed by later task flows.

## PRD Coverage

- `FR-PM-01`
- `FR-PM-02`
- `FR-PM-03`
- `FR-PM-04`

## Preconditions

- App shell can run a persistent local Node.js server.
- SQLite and Prisma are available in the project.

## Deliverables

- `Project` persistence and CRUD
- Repo validation service
- Project list and project detail UI
- Safety banner for dirty working trees
- Follow-up task prompt contract for dirty repo reuse

## Suggested Execution Order

1. Define the `Project` schema and migration.
2. Implement repo probing helpers with deterministic git commands.
3. Add project registration and listing APIs.
4. Build project list/detail UI on top of those APIs.
5. Add dirty-repo warning and follow-up task prompt contract.
6. Verify behavior on clean, dirty, and invalid repos.

## Schema And Persistence

- Required new persistence:
  - `Project`
- Persist only durable metadata:
  - normalized repo path
  - user-visible project name
  - default branch
- Treat current branch, cleanliness, and recent branches as refreshable live probes unless the implementation has a clear cache policy.

## API And Event Surface

- Likely REST endpoints:
  - `POST /api/projects`
  - `GET /api/projects`
  - `GET /api/projects/:projectId`
  - `GET /api/projects/:projectId/repo-status`
- No websocket dependency is required in this phase.

## Outputs For Next Phase

- Stable `Project` records with unique normalized paths
- Reusable repo-status service for task creation
- UI shell for selecting a project later in task creation

## Backend Tasks

- Create the `Project` model and migration.
- Implement a project-registration service that validates:
  - absolute path
  - path existence
  - git repo presence
- Read and persist repo metadata:
  - repo name
  - current branch
  - default branch
  - working tree cleanliness
  - recent local branches
- Define a normalized repo-status shape that later task creation can reuse.
- Add refresh logic so project detail can re-read live repo state without re-registering the project.

## API Tasks

- Add endpoint to register a project.
- Add endpoint to list projects.
- Add endpoint to fetch one project with live repo status.
- Return structured validation failures instead of raw shell output.

## UI Tasks

- Build project list screen.
- Build project detail screen.
- Show current branch and working tree status.
- Show a dirty-repo warning banner before task creation starts.
- Define the UX copy and modal structure for:
  - `commit first`
  - `continue with a fresh task worktree`

## Implementation Notes

- Do not block project registration because of uncommitted changes.
- Separate persisted project metadata from live repo probes; some fields should be refreshed, not trusted forever.
- Prefer deterministic raw git commands over parsing human-readable git text.
- Normalize path handling early to avoid duplicate project rows caused by different path spellings.

## Edge Cases

- Non-existent path
- Path is a file, not a directory
- Directory exists but is not a git repo
- Bare repo
- Detached HEAD
- Repo with no configured remote default branch

## Acceptance Checklist

- User can register a valid local git repo.
- Project list shows registered repos.
- Project detail shows current branch and cleanliness.
- Dirty working tree warning is visible before task creation.
- Validation failures are actionable and readable.
- Duplicate registration of the same path is prevented.

## Suggested Tests

- Unit tests for repo validation and metadata parsing
- Integration test for project registration API
- Manual verification on:
  - clean repo
  - dirty repo
  - invalid path

## Out Of Scope

- Task creation itself
- Any agent interaction
- Worktree creation

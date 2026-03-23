# Phase 09 - Realtime Output Streaming And Summary UX

## Goal

Make execution observable in real time without overwhelming the user or the browser when many workers are active.

## Current Baseline In Repo

- `TaskService` already emits `session:started`, `session:output`, `session:ended`, and `subtask:status` through `TaskEventBus`.
- The server already exposes task-scoped SSE at `/api/tasks/:taskId/events`.
- `AgentSession.outputBuffer` and `outputBufferMaxBytes` already exist, but full log persistence to `logPath` is not yet wired.
- The current UI still refreshes task detail aggressively and does not maintain a true focused live execution view.

## PRD Coverage

- `10.6 Team Lifecycle And Worker Execution`
- `12.3 可解释性`
- `12.4 安全可见性`

## Preconditions

- Phase 08 complete

## Deliverables

- Live output streaming
- Persistent session logs
- `outputBuffer` tail behavior
- Summary-first execution board
- One focused terminal or console surface with ANSI-safe rendering

## Suggested Execution Order

1. Add server-side log persistence and output-buffer management.
2. Finish routing task-scoped SSE events to in-memory execution state instead of full-detail reloads.
3. Build summary cards and selected-session state on the client.
4. Mount one focused terminal or console surface only for the selected subtask/session.
5. Verify routing correctness under concurrent noisy output.

## Schema And Persistence

- Persist:
  - `AgentSession.logPath`
  - `AgentSession.outputBuffer`
  - `AgentSession.outputBufferMaxBytes`
- No new tables are required in this phase.

## API And Event Surface

- Transport:
  - task-scoped SSE via `/api/tasks/:taskId/events`
- Server events:
  - `session:started`
  - `session:output`
  - `session:ended`
  - `subtask:status`

## Outputs For Next Phase

- Stable execution monitoring UX
- Reliable session logs and tail previews reusable by review prompts

## Likely Touch Points

- `src/services/task-service.js`
- `src/repositories/task-repository.js`
- `src/server/app.js`
- `src/ui/app.js`
- `src/ui/index.html`
- `src/ui/app.css`
- execution integration tests and UI tests

## Backend Tasks

- Stream raw output per `sessionId`.
- Persist full logs to `logPath`.
- Maintain bounded `outputBuffer` tail storage.
- Record session end status and exit code.
- Keep log writes append-only and independent from UI rendering decisions.
- Ensure retries and restarts create new session records without corrupting prior log paths.

## UI Tasks

- Build summary card per subtask showing:
  - current status
  - assigned agent
  - retry count
  - latest session state
  - tail preview from `outputBuffer`
- Maintain selected subtask and selected session state in the browser.
- Mount a full terminal or console surface only for the selected subtask/session.
- Preserve ANSI rendering in the focused surface.
- Show session restarts cleanly when retries occur.
- Keep the default execution view useful even when no terminal is expanded.

## Performance Tasks

- Avoid mounting or re-rendering all terminals at once.
- Avoid full-log reads during normal render paths.
- Ensure fast updates even with five active sessions.
- Prefer incremental DOM updates or local execution-state updates over repeated full-detail fetches.

## API And Event Tasks

- Consume `session:started`
- Consume `session:output`
- Consume `session:ended`
- Consume `subtask:status` without losing session focus
- Ensure routing correctness by `taskId`, `subTaskId`, and `sessionId`

## Implementation Notes

- The UI should remain useful even if no terminal is expanded.
- Tail previews should be resilient to ANSI noise.
- Preserve raw output in logs even if the UI strips or formats escape sequences.
- Current stack is server-rendered static assets plus browser ES modules; do not assume a bundler or framework runtime exists.
- If a richer terminal dependency is introduced, it must be loaded lazily and kept optional to the default summary-first path.

## Edge Cases

- Very noisy worker flooding output
- Binary output or malformed ANSI sequences
- Fast session restart causing stale terminal view
- Session output arriving before the latest detail refresh completes
- Retry launch causing a subtask to have multiple historical sessions

## Acceptance Checklist

- User can monitor all subtasks without opening every terminal.
- Focused terminal shows full live stream for the selected subtask.
- Full logs are retained locally.
- Browser responsiveness remains acceptable with several noisy workers.
- SSE routing remains correct when multiple worker sessions emit concurrently.

## Suggested Tests

- Output-buffer truncation tests
- Log persistence tests
- SSE routing-correctness integration tests
- Manual performance verification with several noisy workers

## Out Of Scope

- Review decisions
- Merge flow

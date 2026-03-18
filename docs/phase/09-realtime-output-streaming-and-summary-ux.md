# Phase 09 - Realtime Output Streaming And Summary UX

## Goal

Make execution observable in real time without overwhelming the user or the browser when many workers are active.

## PRD Coverage

- `FR-EX-06`
- `13.1 Performance`
- `14.2 Required UX Signals` related to summary-first execution view

## Preconditions

- Phase 08 complete

## Deliverables

- Live output streaming
- Persistent session logs
- `outputBuffer` tail behavior
- Summary-first execution board
- Lazy `xterm.js` mounting

## Suggested Execution Order

1. Add server-side log persistence and output-buffer management.
2. Wire websocket streaming for worker sessions.
3. Build summary cards and selected-terminal state on the client.
4. Mount a single focused terminal instance.
5. Verify routing correctness under concurrent noisy output.

## Schema And Persistence

- Persist:
  - `AgentSession.logPath`
  - `AgentSession.outputBuffer`
  - `AgentSession.outputBufferMaxBytes`
- No new tables are required in this phase.

## API And Event Surface

- Server events:
  - `session:started`
  - `session:output`
  - `session:ended`
  - `subtask:status`

## Outputs For Next Phase

- Stable execution monitoring UX
- Reliable session logs and tail previews reusable by review prompts

## Backend Tasks

- Stream raw output per `sessionId`.
- Persist full logs to `logPath`.
- Maintain bounded `outputBuffer` tail storage.
- Record session end status and exit code.

## UI Tasks

- Build summary card per subtask showing:
  - current status
  - assigned agent
  - retry count
  - tail preview from `outputBuffer`
- Mount a full terminal only for the selected subtask.
- Preserve ANSI rendering in the focused terminal.
- Show session restarts cleanly when retries occur.

## Performance Tasks

- Avoid mounting all terminals at once.
- Avoid full-log reads during normal render paths.
- Ensure fast updates even with five active sessions.

## API And Event Tasks

- Consume `session:started`
- Consume `session:output`
- Consume `session:ended`
- Ensure routing correctness by `taskId`, `subTaskId`, and `sessionId`

## Implementation Notes

- The UI should remain useful even if no terminal is expanded.
- Tail previews should be resilient to ANSI noise.
- Preserve raw output in logs even if the UI strips or formats escape sequences.

## Edge Cases

- Very noisy worker flooding output
- Binary output or malformed ANSI sequences
- Fast session restart causing stale terminal view

## Acceptance Checklist

- User can monitor all subtasks without opening every terminal.
- Focused terminal shows full live stream for the selected subtask.
- Full logs are retained locally.
- Browser responsiveness remains acceptable with several noisy workers.

## Suggested Tests

- Output-buffer truncation tests
- Routing-correctness integration tests
- Manual performance verification with several noisy workers

## Out Of Scope

- Review decisions
- Merge flow

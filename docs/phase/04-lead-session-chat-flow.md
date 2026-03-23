# Phase 04 - Lead Session Chat Flow

## Goal

Implement the first end-to-end task slice: create a task, start clarification with a lead agent, persist the conversation, and gate planning behind explicit user confirmation.

## PRD Coverage

- `10.3 Task Creation And Guided Flow`
- `10.4 Clarification And Task Document`
- `4.1 人类监督优先`
- `task:start-clarification`
- `task:message`
- `task:confirm-requirements`

## Preconditions

- Phases 01 to 03 complete

## Deliverables

- `Task` creation flow
- Lead `AgentSession`
- Clarification chat persistence
- Real-time lead-agent messaging
- Task-scoped attachment persistence

## Suggested Execution Order

1. Add task, message, attachment, and minimal session schema.
2. Implement task creation and attachment persistence.
3. Implement lead-session spawn and message persistence.
4. Add clarification UI and explicit requirement confirmation.
5. Verify reload persistence and unhealthy-agent failures.

## Schema And Persistence

- Required persistence likely includes:
  - `Task`
  - `Message`
  - `Attachment`
  - `AgentSession`
- Required task fields at creation time:
  - `projectId`
  - `leadAgentType`
  - `baseBranch`
  - `baseCommitSha`
  - `title`
  - `description`
  - `status = DRAFT`

## API And Event Surface

- Client events:
  - `task:start-clarification`
  - `task:message`
  - `task:confirm-requirements`
- Server events:
  - `task:status`
  - `task:lead-message`
  - `session:started`
  - `session:output`
  - `session:ended`

## Outputs For Next Phase

- Persisted clarification transcript
- Task rows with stable `baseCommitSha`
- Task-scoped attachments available for later planning and execution

## Backend Tasks

- Implement `Task` creation with required fields:
  - project
  - base branch
  - lead agent
  - title
  - requirement description
  - optional attachments
- Snapshot `baseCommitSha` at task creation.
- Persist task attachments under the task-scoped upload path.
- Validate attachment metadata:
  - file name
  - MIME type
  - size
  - attachment type classification
- Create lead sessions with `sessionType = LEAD` and `subTaskId = null`.
- Persist all clarification messages in `Message`.
- Transition task state:
  - `DRAFT -> CLARIFYING`
  - `CLARIFYING -> PLANNING` after user confirmation

## Session Tasks

- Spawn a live lead session via adapter.
- Support sending follow-up user messages into the running lead session.
- Persist message ordering accurately enough to replay the conversation later.

## API And Event Tasks

- Implement `task:start-clarification`.
- Implement `task:message`.
- Implement `task:confirm-requirements`.
- Emit `task:lead-message`.
- Emit `task:status`.
- Emit `session:started`, `session:output`, and `session:ended` for the lead session if the UI relies on them.

## UI Tasks

- Build task creation form.
- Build clarification chat panel.
- Show lead agent health issues before start.
- Add explicit "requirements confirmed" action.
- Show attachments uploaded with the task.
- Show attachment upload validation errors before task creation completes.

## Implementation Notes

- `baseCommitSha` must come from the selected base branch, not the current working tree HEAD by assumption.
- Task creation should not materialize subtasks yet.
- Keep message persistence append-only.
- Do not advance to planning on prompt heuristics; require explicit user confirmation.

## Edge Cases

- Lead agent becomes unhealthy between task creation and clarification start
- Base branch deleted after task creation
- Empty user message
- Lead session exits unexpectedly during clarification
- Unsupported attachment type
- Oversized attachment

## Acceptance Checklist

- User can create a task and start clarification.
- Lead chat is persisted and survives page reload.
- User confirmation moves the task to `PLANNING`.
- Attachments are stored under the task and can be listed back in the UI.

## Suggested Tests

- Integration test for task creation and state transitions
- Session lifecycle tests for lead session
- Manual verification of reload persistence

## Out Of Scope

- Plan parsing
- Plan review UI

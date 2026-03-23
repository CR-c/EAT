# Phase 16 - Agent Mailbox And Web Handoff

## Goal

Add a minimal task-scoped mailbox so upstream context can flow to downstream subtasks and the user can control that flow from the web UI without shell commands.

## PRD Coverage

- `10.7 Structured Mailbox And Handoff`
- `4.5 审查与合并历史必须 append-only`
- `8.3 MailboxMessage 关键字段`
- `10.6 Team Lifecycle And Worker Execution`

## Preconditions

- Phases 01 to 15 complete

## Deliverables

- Append-only mailbox persistence
- Web API for posting directed handoff notes
- Realtime mailbox update events
- Automatic upstream-to-downstream handoff generation for dependency-linked subtasks
- Worker prompt injection of mailbox notes targeted to the launched subtask
- Web UI for viewing mailbox history and sending lead handoff notes

## Suggested Execution Order

1. Add mailbox persistence and migration.
2. Expose mailbox history in task detail APIs.
3. Add mailbox posting and realtime events.
4. Generate automatic handoff notes after successful prerequisite completion.
5. Inject downstream mailbox notes into worker prompts.
6. Build focused execution UI for mailbox history and lead note entry.
7. Verify prompt delivery and end-to-end dependency handoff behavior.

## Schema And Persistence

- Add a `mailbox_messages` table.
- Keep mailbox records append-only.
- Each mailbox message should store:
  - `task_id`
  - `sender_type`
  - `sender_sub_task_id?`
  - `target_type`
  - `target_sub_task_id?`
  - `content`
  - `created_at`

## API And Event Surface

- Task detail APIs should return mailbox history for the task.
- Add a task-scoped API for posting mailbox messages from the web UI.
- Emit a mailbox update event when a message is persisted.

## Outputs For Next Phase

- Dependency-linked downstream workers can start with upstream context already present in their prompt.
- Lead-driven coordination can happen fully from the web UI.

## Backend Tasks

- Persist mailbox messages and expose them through repository queries.
- Validate sender and target references against the current task.
- Allow lead-to-subtask mailbox posting from the web UI.
- Auto-generate subtask-to-subtask handoff notes for direct dependents after successful worker completion.
- Include targeted mailbox notes when building the worker prompt for a subtask.
- Reuse existing task events rather than inventing a second execution stream.

## UI Tasks

- Show mailbox history in the focused execution panel.
- Show sender and target labels clearly.
- Allow sending a lead handoff note to the currently focused subtask.
- Refresh mailbox state via task reload or realtime event handling.

## Implementation Notes

- Keep mailbox scope intentionally narrow for MVP. Do not build a general-purpose chat product.
- Targeted prompt injection should include only mailbox notes for the launched subtask.
- Automatic handoff generation should remain advisory and should not mutate plan or review decisions.

## Edge Cases

- Mailbox note targets a subtask that no longer exists
- A dependency completes successfully but incremental review is unavailable
- Multiple retries create multiple upstream handoff notes
- Manual lead note arrives after a worker is already running
- Task becomes terminal before a mailbox note is posted

## Acceptance Checklist

- Mailbox messages persist and reload with task detail.
- Downstream subtasks receive upstream handoff notes in their worker prompt.
- Automatic dependency handoff works without command-line intervention.
- Focused execution UI allows the user to send a lead note to a selected subtask.
- Mailbox behavior remains task-scoped and append-only.

## Suggested Tests

- Repository tests for mailbox persistence and ordering
- API test for posting a mailbox note and reloading task detail
- Integration test for automatic dependency handoff note creation
- Integration test for worker prompt injection of mailbox notes

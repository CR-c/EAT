# Phase 12 - Merge Flow And Rebase Retry

## Goal

Merge accepted subtasks deterministically, preserve merge-attempt history, and reduce manual intervention with controlled `Rebase & Retry`.

## PRD Coverage

- `FR-MG-01`
- `FR-MG-02`
- `FR-MG-03`
- `FR-MG-04`
- `FR-MG-05`
- `FR-MG-06`
- `subtask:rebase-retry`

## Preconditions

- Phase 11 complete

## Deliverables

- Sequential merge executor
- Append-only `MergeRecord` attempt history
- Conflict handling and `ACTION_REQUIRED`
- Rebase-and-retry flow
- Dirty-target-branch recovery via `task:resume`

## Suggested Execution Order

1. Add `MergeRecord` schema if not already migrated.
2. Implement merge executor with precondition checks.
3. Persist successful and conflicted merge attempts.
4. Implement `ACTION_REQUIRED` routing for conflict and dirty-target cases.
5. Implement `subtask:rebase-retry`.
6. Implement generic `task:resume` continuation after external resolution.

## Schema And Persistence

- Required persistence:
  - `MergeRecord`
- Every merge or rebase attempt must append a new row with:
  - `attemptNumber`
  - `operation`
  - `status`
  - `completedAt`
  - optional `resultCommitSha`
  - optional `conflictSummary`

## API And Event Surface

- Client events:
  - `subtask:rebase-retry`
  - `task:resume`
  - `subtask:confirm-discard`
- Server events:
  - `merge:status`
  - `task:status`
  - `subtask:status`

## Outputs For Next Phase

- Terminal merge history per subtask
- Reliable `ACTION_REQUIRED` recovery model for merge-time blockers
- Task completion preconditions ready for cleanup

## Backend Tasks

- Merge accepted subtasks in stable creation order.
- Use `--no-ff`.
- Before each merge, validate base-branch working tree safety.
- On success:
  - write `MergeRecord` with `operation = MERGE`
  - set `status = SUCCEEDED`
  - set `completedAt`
  - move subtask to `MERGED`
- On conflict:
  - write `MergeRecord` with `status = CONFLICT`
  - stop further automatic merges
  - move task to `ACTION_REQUIRED`

- If merge precondition fails because the target branch is dirty:
  - do not start the merge attempt
  - move task to `ACTION_REQUIRED`
  - record a user-visible reason

## Rebase Tasks

- Implement `subtask:rebase-retry` for conflicted subtasks.
- Run `git rebase {baseBranch}` on the subtask branch.
- Persist a new `MergeRecord` with `operation = REBASE`.
- If rebase succeeds:
  - mark rebase attempt `SUCCEEDED`
  - return task to `MERGING`
  - retry blocked merge path
- If rebase conflicts:
  - keep task in `ACTION_REQUIRED`
  - persist new conflict summary

## UI Tasks

- Show merge-attempt history per subtask.
- Show precise conflict reason when available.
- Show `Rebase & Retry` only when latest merge attempt conflicted.
- Offer discard/manual-resolution choices alongside rebase retry.
- Offer a generic resume action after the user has cleaned the target branch state.

## Implementation Notes

- `MergeRecord` is history, not current-state overwrite storage.
- Rebase success does not itself mark the subtask `MERGED`; the follow-up merge still has to succeed.
- Be careful with dirty base branch handling; this is separate from merge conflicts.
- `task:resume` should be the only generic continuation entry point after merge-related `ACTION_REQUIRED` states are resolved outside the app.

## Edge Cases

- Target branch becomes dirty between merges
- Multiple accepted subtasks conflict one after another
- Rebase succeeds but subsequent merge still conflicts
- User discards a conflicted accepted subtask

## Acceptance Checklist

- Accepted subtasks merge in order.
- Conflicts stop automation and move task to `ACTION_REQUIRED`.
- Rebase retry is recorded and can reduce manual conflict work.
- Dirty-target-branch blockers can resume without corrupting merge history.

## Suggested Tests

- Merge ordering tests
- Conflict-path integration tests
- Rebase-retry tests
- Manual verification with conflicting branches

## Out Of Scope

- Automatic conflict resolution by an agent

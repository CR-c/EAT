# EAT Prisma Migration Plan

This document maps schema work to delivery phases. It is intentionally conservative: prefer landing schema slightly earlier than the phase that first consumes it if that reduces migration churn.

## Migration Strategy

- Use additive migrations first. Avoid destructive renames unless the codebase already depends on the replacement field.
- Backfill nullable-to-required transitions only after server code can write the new field reliably.
- If multiple phases need the same table, migrate it at the earliest phase that makes the table unavoidable.
- Keep append-only history tables append-only in both schema design and application logic.

## Phase 01

### New Or Changed Models

- `Project`

### Fields

- `id`
- `name`
- `path @unique`
- `defaultBranch`
- `createdAt`
- `updatedAt`

### Notes

- If path normalization is not fully settled, still enforce one canonical stored path before writing rows.

## Phase 02

### New Or Changed Models

- No Prisma migration required by default

### Notes

- Agent registry can remain in-process configuration.
- If you later choose to persist health snapshots, add that as a separate optional migration, not a hidden requirement of phase 02.

## Phase 03

### New Or Changed Models

- `AgentSession` staged fields, if you want sandbox data available before lead-session work lands

### Fields

- `sandboxType`
- `containerId`

### Notes

- If `AgentSession` table is introduced only in phase 04, move these fields into that initial session migration instead of creating a separate migration now.

## Phase 04

### New Models

- `Task`
- `Message`
- `Attachment`
- `AgentSession`

### Key Fields

#### `Task`

- `projectId`
- `title`
- `description`
- `leadAgentType`
- `baseBranch`
- `baseCommitSha`
- `status`
- `createdAt`
- `updatedAt`

#### `Message`

- `taskId`
- `subTaskId?`
- `role`
- `content`
- `createdAt`

#### `Attachment`

- `taskId`
- `fileName`
- `filePath`
- `fileType`
- `mimeType`
- `size`
- `createdAt`

#### `AgentSession`

- `taskId`
- `subTaskId?`
- `agentType`
- `sessionType`
- `sandboxType`
- `containerId?`
- `status`
- `pid?`
- `startedAt?`
- `endedAt?`
- `exitCode?`
- `logPath?`
- `outputBuffer`
- `outputBufferMaxBytes`
- `createdAt`
- `updatedAt`

### Notes

- `baseCommitSha` should be required from the start if the server can always snapshot it at task creation.

## Phase 05

### New Or Changed Models

- `Task`
- `PlanSnapshot`

### Fields

#### `Task`

- `planVersion @default(0)`
- `currentPlanJson?`

#### `PlanSnapshot`

- `id`
- `taskId`
- `version`
- `source`
- `payload`
- `createdAt`

### Notes

- If `planVersion` was not introduced in phase 04, add it here.
- `PlanSnapshot` should be append-only.

## Phase 06

### New Or Changed Models

- No required new tables

### Optional Fields

- None, unless audit requirements require explicit restore markers beyond `PlanSnapshot.source`

### Notes

- `RESTORED_FROM_HISTORY` is a value-level change in `PlanSnapshotSource`, not necessarily a structural migration if the enum already exists and can be extended safely.

## Phase 07

### New Or Changed Models

- `Task`
- `SubTask`

### Fields

#### `Task`

- `approvedPlanJson?`
- `taskBranchName?`

#### `SubTask`

- `id`
- `taskId`
- `title`
- `description`
- `branchSuffix`
- `branchName?`
- `worktreePath?`
- `agentType`
- `status`
- `autoAssigned`
- `retryCount @default(0)`
- `lastError?`
- `createdAt`
- `updatedAt`

### Notes

- Keep `branchName` and `worktreePath` nullable until branch/worktree setup succeeds in phase 08.
- `taskBranchName` should point to the task-mainline branch reserved for execution.

## Phase 08

### New Or Changed Models

- `SubTask`
- `AgentSession`

### Fields

#### `SubTask`

- Ensure these fields exist before execution starts:
  - `branchName?`
  - `startCommitSha?`
  - `worktreePath?`
  - `retryCount`

#### `AgentSession`

- Ensure worker-session fields are present:
  - `subTaskId?`
  - `logPath?`
  - `outputBuffer`
  - `outputBufferMaxBytes`

### Notes

- This phase often needs no new migration if the model was created comprehensively in phase 04 and 07.

## Phase 09

### New Or Changed Models

- Usually no new migration

### Notes

- `logPath`, `outputBuffer`, and `outputBufferMaxBytes` should already exist by now.
- Avoid adding per-chunk log tables unless absolutely necessary; the PRD prefers filesystem logs plus tail buffer.

## Phase 15

### New Or Changed Models

- `SubTask`

### Fields

#### `SubTask`

- `dependencyBranchSuffixesJson @default('[]')`

### Notes

- Keep dependency metadata additive and append-only friendly.
- For MVP, storing dependency branch suffixes as JSON is sufficient; a normalized edge table can wait until later if needed.

## Phase 16

### New Or Changed Models

- `MailboxMessage`

### Fields

#### `MailboxMessage`

- `taskId`
- `senderType`
- `senderSubTaskId?`
- `targetType`
- `targetSubTaskId?`
- `content`
- `createdAt`

### Notes

- Keep mailbox records append-only.
- A single mailbox table is sufficient for MVP; read-state tracking can wait.

## Phase 10

### New Or Changed Models

- `ReviewRecord`
- `SubTask`
- `AgentSession` relation to reviews

### Fields

#### `ReviewRecord`

- `id`
- `subTaskId`
- `sessionId?`
- `phase`
- `decision`
- `summary`
- `createdAt`

#### `SubTask`

- `latestReviewDecision`
- `latestReviewPhase?`
- `latestReviewSummary?`

### Notes

- Land `ReviewRecord` as append-only.
- Do not try to compress incremental and final review into one mutable row.

## Phase 11

### New Or Changed Models

- No new tables required if `ReviewRecord` and `SubTask` review convenience fields already exist

### Notes

- This phase is mostly orchestrator logic using the phase 10 schema.

## Phase 12

### New Or Changed Models

- `MergeRecord`
- `SubTask` relation to merge history

### Fields

#### `MergeRecord`

- `id`
- `subTaskId`
- `attemptNumber`
- `operation`
- `sourceBranch`
- `targetBranch`
- `status`
- `resultCommitSha?`
- `conflictSummary?`
- `completedAt?`
- `createdAt`
- `updatedAt`

### Notes

- Keep `SubTask -> MergeRecord` one-to-many.
- Do not use a unique constraint on `subTaskId`.
- Use additive enum values:
  - `MergeStatus`: `PENDING`, `SUCCEEDED`, `CONFLICT`, `ABORTED`
  - `MergeOperation`: `MERGE`, `REBASE`

## Phase 13

### New Or Changed Models

- No required migration by default

### Notes

- Cleanup warnings can remain in task logs and emitted events unless structured warning persistence becomes necessary.

## Phase 14

### New Or Changed Models

- Prefer no new migration

### Optional Additions

- Only add derived counters if query-based metrics prove too expensive or ambiguous

### Notes

- MVP metric export should read existing persisted state rather than creating a second analytics schema.

## Recommended Consolidation Plan

If starting from an empty database and wanting fewer migrations, a pragmatic grouping is:

1. `001_projects_and_core_tasks`
   - `Project`
   - `Task`
   - `Message`
   - `Attachment`
   - `AgentSession`
2. `002_planning_and_subtasks`
   - `PlanSnapshot`
   - `Task.planVersion`
   - `Task.currentPlanJson`
   - `Task.approvedPlanJson`
   - `SubTask`
3. `003_review_history`
   - `ReviewRecord`
   - `SubTask.latestReview*`
4. `004_merge_history`
   - `MergeRecord`

Use the phase mapping above for rollout order even if the physical migrations are grouped this way.

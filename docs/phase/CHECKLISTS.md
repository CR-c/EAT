# EAT Phase Checklists

This document turns the 14 phase plans into execution checklists. Each phase should be considered complete only when all required items are checked and the phase-level acceptance criteria in the source phase doc are still true.

## Phase 01 Checklist

- [ ] Add `Project` persistence and unique path constraint
- [ ] Implement absolute-path and git-repo validation
- [ ] Normalize project paths before persistence
- [ ] Read default branch, current branch, cleanliness, and recent branches
- [ ] Add project registration endpoint
- [ ] Add project list endpoint
- [ ] Add project detail or repo-status endpoint
- [ ] Build project list UI
- [ ] Build project detail UI
- [ ] Show dirty working tree warning
- [ ] Prevent duplicate project registration
- [ ] Verify invalid-path and non-git cases

## Phase 02 Checklist

- [ ] Define adapter capability contract
- [ ] Implement `AgentRegistry`
- [ ] Support lead-candidate filtering
- [ ] Support worker-candidate filtering
- [ ] Implement structured health checks
- [ ] Normalize health failure reasons
- [ ] Add agents listing endpoint
- [ ] Add health endpoint or event
- [ ] Build agent health UI
- [ ] Show sandbox support in capability display
- [ ] Block unhealthy lead-agent selection in task creation

## Phase 03 Checklist

- [ ] Define sandbox config type and validation rules
- [ ] Implement Docker daemon preflight check
- [ ] Validate image/runtime availability strategy
- [ ] Implement mount allowlist enforcement
- [ ] Block home directory and `.ssh` mounts by default
- [ ] Enforce non-root worker execution
- [ ] Reject privileged container mode
- [ ] Implement container create/start/stop/remove helpers
- [ ] Persist `sandboxType` and `containerId` shape in session model or staged schema
- [ ] Expose Docker health to the app
- [ ] Verify sandbox failures fail closed

## Phase 04 Checklist

- [ ] Add `Task` persistence
- [ ] Add `Message` persistence
- [ ] Add `Attachment` persistence
- [ ] Add minimal `AgentSession` persistence for lead sessions
- [ ] Snapshot `baseCommitSha` during task creation
- [ ] Persist task attachments under task-scoped upload directory
- [ ] Validate attachment metadata and size/type limits
- [ ] Implement `task:start-clarification`
- [ ] Implement `task:message`
- [ ] Implement `task:confirm-requirements`
- [ ] Spawn lead session
- [ ] Persist full clarification transcript
- [ ] Build task creation UI
- [ ] Build clarification chat UI
- [ ] Verify reload persistence and unhealthy lead-agent handling

## Phase 05 Checklist

- [ ] Add `currentPlanJson` to task persistence
- [ ] Add `planVersion` semantics with initial `0`
- [ ] Add `PlanSnapshot` persistence
- [ ] Trigger planning prompt after requirements confirmation
- [ ] Parse lead-agent JSON safely
- [ ] Validate plan structure and agent health
- [ ] Validate unique slug-safe `branch_suffix`
- [ ] Persist valid `currentPlanJson`
- [ ] Append `LEAD_GENERATED` snapshot
- [ ] Emit `task:plan-generated`
- [ ] Handle regeneration on invalid plan
- [ ] Verify versioning and snapshot history

## Phase 06 Checklist

- [ ] Build plan review editing UI
- [ ] Support add/remove/edit subtask operations
- [ ] Support worker-agent reassignment in draft
- [ ] Support branch suffix editing in draft
- [ ] Revalidate edited current plan before approval
- [ ] Implement `task:restore-plan-snapshot`
- [ ] Emit `task:plan-restored`
- [ ] Restore historical snapshot into `currentPlanJson`
- [ ] Optionally append `RESTORED_FROM_HISTORY` snapshot
- [ ] Prevent approval of invalid edited drafts

## Phase 07 Checklist

- [ ] Add full `SubTask` persistence if not already migrated
- [ ] Implement approval transaction boundary
- [ ] Copy `currentPlanJson` to `approvedPlanJson`
- [ ] Append `APPROVED` `PlanSnapshot`
- [ ] Materialize one `SubTask` per approved item
- [ ] Initialize `SubTask` status as `PENDING`
- [ ] Leave `branchName` and `worktreePath` null before setup
- [ ] Emit task/subtask state after approval
- [ ] Prevent duplicate approval from creating duplicate subtasks

## Phase 08 Checklist

- [ ] Compute deterministic branch names from `taskId` and `branchSuffix`
- [ ] Resolve branch collisions with numeric suffixes
- [ ] Persist resolved `branchName`
- [ ] Emit `branch:renamed`
- [ ] Create one worktree per subtask from `baseCommitSha`
- [ ] Persist `worktreePath`
- [ ] Create worker `AgentSession` rows
- [ ] Spawn worker sessions through sandbox manager
- [ ] Filter attachments per worker capability at launch time
- [ ] Persist or expose included/excluded attachment metadata
- [ ] Transition subtask `PENDING -> READY -> RUNNING`
- [ ] Implement `subtask:retry`
- [ ] Increment `retryCount` on retry/rework run
- [ ] Route branch/setup failures to `ACTION_REQUIRED`
- [ ] Verify concurrent sessions of same adapter type

## Phase 09 Checklist

- [ ] Persist full session logs to `logPath`
- [ ] Maintain bounded `outputBuffer`
- [ ] Stream `session:output` by `sessionId`
- [ ] Emit `session:started` and `session:ended`
- [ ] Build summary cards for all subtasks
- [ ] Show tail preview from `outputBuffer`
- [ ] Mount only one focused terminal surface by default
- [ ] Keep ANSI rendering in focused terminal
- [ ] Verify routing correctness under concurrent noisy output
- [ ] Verify UI remains responsive with several active workers

## Phase 10 Checklist

- [ ] Add `ReviewRecord` persistence if not already migrated
- [ ] Add `latestReviewDecision`, `latestReviewPhase`, `latestReviewSummary`
- [ ] Trigger incremental review when a successful worker run completes
- [ ] Persist `INCREMENTAL` review records
- [ ] Emit `subtask:review`
- [ ] Show incremental review summary in UI
- [ ] Enable `Rework Now` only for actionable incremental `REWORK` or `REJECTED`
- [ ] Support optional description edit before relaunch
- [ ] Support optional `subtask:change-agent` before relaunch
- [ ] Keep task in `EXECUTING` during early rework flow
- [ ] Verify early rework does not bypass final review later

## Phase 11 Checklist

- [ ] Detect task readiness for final review
- [ ] Build final review aggregate prompt
- [ ] Include approved plan, diffs, retries, and incremental history
- [ ] Persist `FINAL` review records
- [ ] Transition `REVIEW_PENDING -> ACCEPTED`
- [ ] Transition `REVIEW_PENDING -> REWORK_REQUIRED`
- [ ] Transition `REVIEW_PENDING -> DISCARD_PENDING`
- [ ] Route task to `MERGING` or `ACTION_REQUIRED`
- [ ] Implement discard confirmation flow
- [ ] Verify mixed accepted/rework/failed/cancelled cases

## Phase 12 Checklist

- [ ] Add `MergeRecord` persistence if not already migrated
- [ ] Merge accepted subtasks in stable creation order
- [ ] Use `--no-ff`
- [ ] Check target branch safety before each merge
- [ ] Persist successful merge attempts with `SUCCEEDED`
- [ ] Persist conflicted merge attempts with `CONFLICT`
- [ ] Move task to `ACTION_REQUIRED` on conflict
- [ ] Implement `subtask:rebase-retry`
- [ ] Persist rebase attempts separately from merge attempts
- [ ] Resume merge flow after successful rebase
- [ ] Support dirty-target-branch recovery via `task:resume`
- [ ] Show merge attempt history and `Rebase & Retry` UI only when valid

## Phase 13 Checklist

- [ ] Detect terminal task transitions centrally
- [ ] Attempt worktree cleanup for `COMPLETED`
- [ ] Attempt worktree cleanup for `FAILED`
- [ ] Attempt worktree cleanup for `CANCELLED`
- [ ] Log cleanup failures without reopening task state
- [ ] Emit `task:cleanup-warning`
- [ ] Show cleanup warning in task UI after reload
- [ ] Verify cleanup on missing/locked worktrees

## Phase 14 Checklist

- [ ] Confirm all required metric inputs exist in persisted data
- [ ] Fill missing persistence gaps only if necessary
- [ ] Implement metrics summary queries
- [ ] Implement export API or CLI
- [ ] Document metric definitions near code or docs
- [ ] Validate completion-rate calculation
- [ ] Validate retry-to-review conversion metric
- [ ] Validate merge-conflict and rebase-retry counters
- [ ] Validate cleanup warning and sandbox failure counters
- [ ] Verify metrics on seeded histories with retries, reworks, and conflicts

## Phase 15 Checklist

- [ ] Extend plan payload with optional `depends_on`
- [ ] Validate `depends_on` references and reject cycles or forward references
- [ ] Persist subtask dependency metadata
- [ ] Add `BLOCKED` subtask status
- [ ] Materialize dependent subtasks as `BLOCKED`
- [ ] Auto-release blocked subtasks when prerequisites complete
- [ ] Auto-launch newly released subtasks without re-approving the task
- [ ] Route unresolved blocked subtasks to `ACTION_REQUIRED`
- [ ] Expose dependency metadata in task APIs and UI
- [ ] Verify ordered execution on a seeded dependency chain

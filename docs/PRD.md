# EAT (Engineering Agent Team) - Product Requirements Document v3.2

> Version: 3.2
> Date: 2026-03-18
> Status: Draft
> Author: Codex revision based on prior internal drafts

---

## 1. Document Purpose

This PRD refines v3.1 into a safer and more operationally efficient MVP specification. The goal of v3.2 is to preserve the clarified v3.1 data and workflow model while closing three remaining gaps: worker-process safety, long-tail execution efficiency, and recoverability of review and merge operations.

Primary goals of this revision:

- Separate editable plan data from executable subtask records
- Introduce a stronger worker sandbox boundary than git worktrees alone
- Allow user-driven early rework from actionable incremental review signals
- Add recoverable merge-attempt history and `Rebase & Retry`
- Preserve lightweight plan history for rollback during plan review
- Reduce terminal-output overload in the default execution UX
- Add faster recovery when attachment filtering reveals an incompatible worker

### 1.1 Changes from v3.1

- Added Docker-based sandboxing as the required execution model for worker sessions
- Added sandbox metadata to `AgentSession` and runtime contract
- Added lightweight `PlanSnapshot` history for lead-generated and approved plans
- Changed `SubTask -> MergeRecord` from one-to-one to one-to-many merge-attempt history
- Added merge-attempt metadata: `attemptNumber` and `operation`
- Clarified that incremental review remains advisory but may unlock user-triggered early rework during `EXECUTING`
- Added `Rebase & Retry` as an `ACTION_REQUIRED` recovery path for merge conflicts
- Added worker-agent switching and relaunch flow when attachment filtering reveals a capability mismatch
- Added default summary-first terminal UX with lazy focused-terminal mounting

---

## 2. Product Overview

### 2.1 Vision

EAT is a local-first orchestration panel for CLI-based AI coding agents. A user selects a local git repository, collaborates with a lead agent to clarify requirements, reviews an editable execution plan, and then launches multiple worker agents on isolated git branches. Each task also gets one task-mainline branch that accumulates successful task progress so downstream work starts from real task code, not only from the original base commit. EAT streams execution in real time, preserves task context, and manages review, rework, merge, and recovery decisions.

### 2.2 Product Positioning

EAT is not a fully autonomous black box. For MVP, it is a supervised orchestration system:

- Human involvement is required during clarification
- Human approval is required before execution starts
- Human visibility is maintained during execution
- Human action is required for rework selection, discard confirmation, and blocked merges

This product choice is intentional. It keeps failures inspectable and reduces the cost of wrong autonomous actions in v0.1.

### 2.3 Core Principles

- CLI-first: existing CLI agents are first-class execution units
- Local-first: repos, uploads, logs, and state remain on the local machine
- Sandboxed execution: each worker runs in an isolated git branch, git worktree, container sandbox, and process session
- Explicit supervision: critical transitions are enforced by system logic, not prompt-only behavior
- Least privilege: worker sessions should see only the files and network access they actually need
- Pluggable adapters: agent-specific behavior is isolated behind a shared runtime contract

---

## 3. Target Users

- Solo developers working on local repositories
- Small teams sharing a development machine or controlled local environment
- Users who already have supported CLI agents installed and authenticated

### 3.1 Non-Goals for MVP

- Multi-user collaboration
- Remote execution across multiple machines
- Cloud-hosted orchestration
- Marketplace-style third-party adapter installation from the UI
- Agent-driven auto-resolution of merge conflicts

---

## 4. Product Scope

### 4.1 MVP In Scope

- Register local git repositories as projects
- Create tasks with prompt, base branch, lead agent, and attachments
- Run clarification chat with the lead agent
- Generate a structured plan containing independently executable subtasks
- Let the user edit and approve the plan before execution
- Materialize approved subtasks into isolated branches and worktrees
- Create one task-mainline branch per task so downstream subtasks can branch from accumulated task progress
- Respect optional subtask dependencies and launch downstream work only after prerequisites complete
- Preserve directed mailbox handoff notes between lead and subtasks, and inject downstream handoff context into worker prompts
- Run multiple worker agents concurrently in Docker sandboxes on separate branches
- Stream terminal output per running session
- Allow cancel, retry, rework, agent switching, and message injection during execution
- Run incremental review after each successful subtask run
- Run final review before any merge starts
- Merge accepted subtask branches into the task base branch after final review
- Support `Rebase & Retry` for conflicted merge candidates
- Preserve task history, plan snapshots, logs, attachments, statuses, review records, and merge-attempt records locally

### 4.2 MVP Out of Scope

- Cross-task orchestration across multiple tasks or projects
- Automatic conflict resolution by an agent
- Automatic visual captioning through external services
- Cross-project task orchestration
- Cost accounting across providers
- Recovery of in-flight PTY sessions after a full server restart
- VM-based or hypervisor-based isolation beyond Docker

### 4.3 MVP Guardrails

To keep v0.1 buildable, the following restrictions apply:

- Subtasks may mix parallel and dependency-constrained execution in MVP
- Dependencies must be expressed explicitly in the approved plan and must form an acyclic graph
- Mailbox handoff stays task-scoped. MVP does not support cross-task or cross-project agent messaging
- Images are passed only to vision-capable agents in MVP
- If a selected worker agent cannot consume an attachment type, that attachment is omitted and the omission is surfaced in the UI and task log
- Worker sessions must run in a sandbox that does not expose the host home directory by default
- No merge starts until final review has produced authoritative decisions for the whole task
- Merge conflicts stop automatic completion and require user action

---

## 5. Definitions

| Term | Definition |
|------|------------|
| Project | A registered local git repository |
| Task | A user request associated with one project and one selected base branch |
| Current Plan | The latest editable plan draft stored on the task during planning and plan review |
| Approved Plan | The frozen plan snapshot captured at execution approval time |
| SubTask | An executable unit of work materialized from the approved plan |
| Agent Adapter | A plugin implementing the runtime contract for one CLI agent type |
| Lead Agent | The agent used for clarification, planning, incremental review prompts, and final review |
| Worker Agent | The agent used to execute one subtask |
| Agent Session | One live spawned process instance with its own PTY, logs, and lifecycle |
| Task Mainline Branch | The task-scoped integration branch created at task creation time and updated during execution so downstream subtasks can branch from accumulated task work |
| Task Workspace Branch | The branch created for a subtask, under the EAT naming convention |
| Task Worktree | A dedicated local git worktree used to keep one running subtask isolated from the user's main working directory |
| Session Sandbox | The runtime isolation boundary used for an agent session, such as `HOST` or `DOCKER` |
| Review Record | One persisted lead-agent review result for a subtask in either incremental or final phase |
| Mailbox Message | One persisted directed handoff note scoped to a task and targeted at either one subtask or the lead |
| Plan Snapshot | A lightweight persisted JSON copy of a lead-generated or approved plan |
| Plan Approval | The explicit user confirmation that freezes the approved plan and allows execution to start |

---

## 6. Product Decisions

### 6.1 Human Approval Model

MVP uses supervised execution with explicit checkpoints:

- Checkpoint 1: user confirms requirements are clear
- Checkpoint 2: user approves the plan before workers start
- Checkpoint 3: user resolves `ACTION_REQUIRED` states such as rework, discard, merge conflict, or dirty target branch

### 6.2 Dependency Model

MVP supports lightweight subtask dependencies inside one approved plan.

- Each subtask may declare optional `depends_on`
- `depends_on` is an array of earlier subtask `branch_suffix` values
- Dependencies must form an acyclic graph
- Root subtasks may run in parallel
- Downstream subtasks remain blocked until all prerequisite subtasks complete execution successfully
- When a prerequisite subtask completes successfully, its branch is merged into the task-mainline branch before downstream subtasks branch from that task-mainline head
- If a prerequisite fails or requires rework, blocked downstream subtasks do not auto-start

### 6.3 Attachment Model

MVP does not include an implicit vision preprocessing service. Therefore:

- Vision-capable agents may receive image attachments as file references
- Non-vision agents do not receive image attachments
- The UI must show when an attachment was excluded due to agent capability mismatch
- If an excluded attachment is likely task-critical, the UI should offer agent replacement and relaunch instead of silently proceeding
- Future versions may add a dedicated preprocessing pipeline, but it is out of scope for v0.1

### 6.4 Plan Materialization Model

The editable plan and executable subtasks are different concepts.

- During `PLANNING` and `PLAN_REVIEW`, the task stores only a plan snapshot in `currentPlanJson`
- `SubTask` records are created only when the user approves execution
- `approvedPlanJson` stores the frozen input used to create `SubTask` records
- User edits in `PLAN_REVIEW` modify `currentPlanJson` in place
- After approval, later execution changes do not mutate `approvedPlanJson`

### 6.5 Review Authority Model

Incremental review exists to give fast signal, not to define authoritative state.

- Incremental review always writes a `ReviewRecord` with `phase = INCREMENTAL`
- Incremental review may recommend `ACCEPTED`, `REWORK`, or `REJECTED`
- Incremental review does not change `SubTaskStatus`
- Incremental `REWORK` or `REJECTED` may unlock user-triggered early rework while the task is still in `EXECUTING`
- Final review writes a `ReviewRecord` with `phase = FINAL`
- Final review is the only review phase that may change `SubTaskStatus` to `ACCEPTED`, `REWORK_REQUIRED`, or `DISCARD_PENDING`

### 6.6 Merge Model

Merges happen only after final review confirms the merge set.

- No incremental merge is allowed in MVP
- After final review, all subtasks must be resolved into one of:
  - `ACCEPTED`
  - `DISCARDED`
  - `CANCELLED`
- Merge starts only when there are no subtasks left in `REWORK_REQUIRED`, `DISCARD_PENDING`, `FAILED`, or unresolved branch-setup failure states
- During merge, accepted subtasks are merged one by one into the task base branch
- Every merge or rebase attempt is persisted as a separate `MergeRecord`
- If a merge conflict occurs, the user may choose `Rebase & Retry` before falling back to manual conflict resolution
- If merge stops after some successful merges, that is a valid partial-success state for the task

### 6.7 Runtime Model

EAT requires a long-running local Node.js server process plus a local container runtime.

- Supported runtime: local Node.js process
- Required worker sandbox runtime: local Docker Engine or API-compatible Docker daemon
- Unsupported for MVP: serverless and edge runtimes
- The system is intended to bind to `127.0.0.1` only
- Adapters may declare `runtimeMode = REAL | STUB`
- `STUB` means the orchestration path, session lifecycle, sandbox, logging, and streaming are real, but the adapter workload is an explicit placeholder runtime
- A worker launched in `STUB` mode must still use the real Docker sandbox path; the UI and health surfaces must show that runtime mode explicitly

### 6.8 Execution Isolation Model

To support concurrent workers safely, EAT uses both dedicated git worktrees and container sandboxes.

- The user's current working directory is never reused as a live worker execution directory
- Each task gets one task-mainline branch created from the selected base branch at task creation time
- Each subtask gets its own isolated worktree on its own branch, but that subtask branch is rooted at the current task-mainline head when the subtask is first launched
- Each worker session runs inside a dedicated Docker container
- The container sees only explicitly mounted paths required for that session
- The default worker mount set is:
  - subtask worktree as read-write
  - task attachments as read-only
  - logs/output path as write-only or append-only via app-controlled path when needed
- The host home directory, SSH directory, and unrelated repositories are not mounted by default
- Worker containers run as non-root by default and must not use `--privileged`

### 6.9 Agent Mailbox And Handoff Model

MVP supports lightweight directed handoff notes inside one task so downstream workers can start with structured upstream context in the web UI.

- Mailbox messages are append-only task-scoped records
- A mailbox message may be sent from the lead, a subtask, or the system
- A mailbox message targets either one subtask or the lead
- The UI must surface mailbox history while execution is active
- Downstream worker prompts should include mailbox messages targeted to that subtask
- The system may auto-generate upstream-to-downstream handoff notes when prerequisite subtasks finish successfully
- Mailbox delivery is advisory context only and does not bypass the documented task or review state machines
- Uncommitted changes in the user's main working tree do not block task creation in MVP
- Merge safety checks happen at merge time, not task creation time
- If the user starts a new task from the same project while the project working directory has uncommitted changes, EAT must prompt:
  - commit first
  - continue with a fresh task worktree

### 6.9 Worktree Cleanup Model

Worktrees are cleaned up when a task reaches a terminal state.

- Cleanup is executed as part of terminal-state processing for `COMPLETED`, `FAILED`, or `CANCELLED`
- Cleanup is best-effort; a deletion failure is logged but does not reopen the task
- `COMPLETED` means task orchestration is resolved and cleanup has been attempted
- If one or more worktrees cannot be removed, the task still remains terminal and a warning is surfaced in the UI and task log

### 6.10 Branch Naming Collision Resolution

When a computed branch name `eat/{taskId}/{branchSuffix}` already exists in the repository:

- The system automatically appends an incrementing numeric suffix: `eat/{taskId}/{branchSuffix}-1`, `eat/{taskId}/{branchSuffix}-2`, and so on
- The resolved branch name is persisted on the subtask record
- The UI displays a notification that a branch was renamed due to collision
- The collision and resolution are logged in the task log

### 6.11 Plan Version and Snapshot Semantics

`planVersion` on the `Task` record counts how many lead-agent plan generations have succeeded. Historical plan snapshots are retained in lightweight form.

- Initial value is `0`
- Incremented each time the lead agent produces a syntactically valid plan payload, even if later validation fails and regeneration is needed
- Not incremented when the user edits the plan during `PLAN_REVIEW`
- Each syntactically valid lead-generated plan is stored as a `PlanSnapshot`
- Each approved plan is also stored as a `PlanSnapshot`
- During `PLAN_REVIEW`, the user may restore any lead-generated snapshot into `currentPlanJson`
- `currentPlanJson` and `approvedPlanJson` remain the fast-path fields used by the UI and orchestrator

---

## 7. System Architecture

### 7.1 High-Level Architecture

```text
Browser UI (Local static app)
  - Project screens
  - Task chat
  - Plan review
  - Agent session monitor
  - Merge and recovery actions

Local Node.js App Server
  - REST/API handlers
  - SSE event stream handlers
  - Orchestrator
  - Scheduler
  - Agent session manager
  - Container sandbox manager
  - Git manager
  - Worktree manager
  - Upload manager
  - Persistence layer

Local Dependencies
  - SQLite database
  - Local filesystem for uploads and logs
  - Docker Engine
  - Installed CLI agents
  - Local git repositories
```

### 7.2 Key Modules

| Module | Responsibility |
|--------|----------------|
| Orchestrator | Owns task lifecycle transitions and coordination logic |
| Agent Session Manager | Spawns, tracks, and controls concurrent PTY-backed agent sessions |
| Container Sandbox Manager | Creates and tears down Docker sandboxes and mount policies for worker sessions |
| Agent Registry | Registers adapter factories and capability metadata |
| Git Manager | Validates repo state, creates branches, computes diffs, performs merges |
| Worktree Manager | Creates, tracks, and cleans isolated git worktrees per subtask |
| Upload Manager | Stores and validates task-scoped attachments |
| Event Gateway | Streams task and session events to the UI |
| Persistence Layer | Stores projects, tasks, plan snapshots, subtasks, sessions, attachments, messages, review records, merge records, and logs |

### 7.3 Recommended Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| UI / App | Local Node.js HTTP server plus static HTML/CSS/ES modules | Persistent local server, framework-free by default |
| Realtime | Server-Sent Events (`EventSource`) | Task-scoped event stream fits the current local UI model |
| Session Runtime | Adapter-owned process/session abstraction | PTY-capable when an adapter needs interactive CLI input |
| Container Runtime | Docker Engine / Docker API | Required for worker sandboxing |
| DB | SQLite via `node:sqlite` plus checked-in SQL migrations | Single-user local persistence with inspectable schema changes |
| Git | Native `git` CLI plus focused workspace helpers | Keep merge and worktree behavior deterministic |
| Terminal Rendering | Focused ANSI-safe terminal surface (`xterm.js` optional) | Summary-first by default; never mount one full terminal per worker |

---

## 8. Data Model

### 8.1 Design Changes from v3.1

- `Task.baseCommitSha` is now required
- `Task.planVersion` starts at `0`
- `Task.currentPlanJson` stores the latest editable plan
- `Task.approvedPlanJson` stores the frozen approved plan
- `Task` retains lightweight `PlanSnapshot` history
- `SubTask.branchSuffix` stores the plan-time branch slug
- `SubTask.branchName` is nullable until branch creation succeeds
- Review history is persisted in `ReviewRecord` instead of a single mutable field
- `SubTask.latestReviewDecision`, `latestReviewPhase`, and `latestReviewSummary` are denormalized convenience fields
- `AgentSession` stores sandbox metadata such as `sandboxType` and `containerId`
- Merge history is persisted as one-to-many `MergeRecord` attempts instead of a single mutable merge record

### 8.2 Entity Overview

```text
Project 1──* Task
Task 1──* Message
Task 1──* Attachment
Task 1──* PlanSnapshot
Task 1──* SubTask
Task 1──* AgentSession (lead sessions)
SubTask 1──* AgentSession (worker sessions)
SubTask 1──* ReviewRecord
SubTask 1──* MergeRecord
```

### 8.3 Prisma-Like Schema

```prisma
model Project {
  id             String   @id @default(cuid())
  name           String
  path           String   @unique
  defaultBranch  String   @default("main")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  tasks          Task[]
}

model Task {
  id                 String      @id @default(cuid())
  projectId          String
  project            Project     @relation(fields: [projectId], references: [id])
  title              String
  description        String
  leadAgentType      String
  baseBranch         String
  baseCommitSha      String
  status             TaskStatus  @default(DRAFT)
  planVersion        Int         @default(0)
  currentPlanJson    Json?
  approvedPlanJson   Json?
  lastError          String?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  messages           Message[]
  attachments        Attachment[]
  planSnapshots      PlanSnapshot[]
  subTasks           SubTask[]
  sessions           AgentSession[]
}

model SubTask {
  id                   String         @id @default(cuid())
  taskId               String
  task                 Task           @relation(fields: [taskId], references: [id])
  title                String
  description          String
  branchSuffix         String
  branchName           String?
  worktreePath         String?
  agentType            String
  status               SubTaskStatus  @default(PENDING)
  latestReviewDecision ReviewDecision @default(PENDING)
  latestReviewPhase    ReviewPhase?
  latestReviewSummary  String?
  autoAssigned         Boolean        @default(true)
  retryCount           Int            @default(0)
  lastError            String?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  sessions             AgentSession[]
  reviewRecords        ReviewRecord[]
  mergeRecords         MergeRecord[]
}

model AgentSession {
  id                   String         @id @default(cuid())
  taskId               String
  task                 Task           @relation(fields: [taskId], references: [id])
  subTaskId            String?
  subTask              SubTask?       @relation(fields: [subTaskId], references: [id])
  agentType            String
  sessionType          SessionType    @default(WORKER)
  sandboxType          SessionSandboxType @default(DOCKER)
  containerId          String?
  status               SessionStatus  @default(PENDING)
  pid                  Int?
  startedAt            DateTime?
  endedAt              DateTime?
  exitCode             Int?
  logPath              String?
  outputBuffer         String         @default("")
  outputBufferMaxBytes Int            @default(65536)
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  reviewRecords        ReviewRecord[]
}

model PlanSnapshot {
  id          String             @id @default(cuid())
  taskId       String
  task         Task              @relation(fields: [taskId], references: [id])
  version      Int
  source       PlanSnapshotSource
  payload      Json
  createdAt    DateTime          @default(now())
}

model ReviewRecord {
  id          String         @id @default(cuid())
  subTaskId   String
  subTask     SubTask        @relation(fields: [subTaskId], references: [id])
  sessionId   String?
  session     AgentSession?  @relation(fields: [sessionId], references: [id])
  phase       ReviewPhase
  decision    ReviewDecision
  summary     String
  createdAt   DateTime       @default(now())
}

model MergeRecord {
  id                 String        @id @default(cuid())
  subTaskId          String
  subTask            SubTask       @relation(fields: [subTaskId], references: [id])
  attemptNumber      Int
  operation          MergeOperation @default(MERGE)
  sourceBranch       String
  targetBranch       String
  status             MergeStatus   @default(PENDING)
  resultCommitSha    String?
  conflictSummary    String?
  completedAt        DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
}

model Message {
  id                 String       @id @default(cuid())
  taskId             String
  task               Task         @relation(fields: [taskId], references: [id])
  subTaskId          String?
  role               MessageRole
  content            String
  createdAt          DateTime     @default(now())
}

model Attachment {
  id                 String          @id @default(cuid())
  taskId             String
  task               Task            @relation(fields: [taskId], references: [id])
  fileName           String
  filePath           String
  fileType           AttachmentType
  mimeType           String
  size               Int
  createdAt          DateTime        @default(now())
}

enum TaskStatus {
  DRAFT
  CLARIFYING
  PLANNING
  PLAN_REVIEW
  EXECUTING
  REVIEWING
  MERGING
  ACTION_REQUIRED
  COMPLETED
  FAILED
  CANCELLED
}

enum SubTaskStatus {
  PENDING
  READY
  RUNNING
  REVIEW_PENDING
  ACCEPTED
  DISCARD_PENDING
  REWORK_REQUIRED
  MERGED
  FAILED
  CANCELLED
  DISCARDED
}

enum SessionStatus {
  PENDING
  STARTING
  RUNNING
  STOPPING
  COMPLETED
  FAILED
  CANCELLED
}

enum ReviewDecision {
  PENDING
  ACCEPTED
  REWORK
  REJECTED
}

enum ReviewPhase {
  INCREMENTAL
  FINAL
}

enum MergeStatus {
  PENDING
  SUCCEEDED
  CONFLICT
  ABORTED
}

enum MergeOperation {
  MERGE
  REBASE
}

enum PlanSnapshotSource {
  LEAD_GENERATED
  APPROVED
  RESTORED_FROM_HISTORY
}

enum SessionType {
  LEAD
  WORKER
}

enum SessionSandboxType {
  HOST
  DOCKER
}

enum MessageRole {
  USER
  LEAD_AGENT
  SYSTEM
}

enum AttachmentType {
  IMAGE
  DOCUMENT
  CODE
}
```

---

## 9. Agent Runtime Contract

### 9.1 Design Principle

The adapter must be stateless or factory-based at registration time. Runtime process state belongs to `AgentSession`, not the registry singleton.

Built-in adapters may intentionally expose `runtimeMode = STUB` before a provider-specific execution protocol is stable. In that mode, the system still exercises the real orchestration path, sandbox policy, session persistence, and output streaming, and the UI must not present the run as if it were a real provider-backed execution.

### 9.2 Adapter Factory Interface

```typescript
interface AgentCapabilities {
  canOrchestrate: boolean;
  canExecute: boolean;
  supportsVision: boolean;
  supportsInteractiveInput: boolean;
  supportedSandboxTypes: ('HOST' | 'DOCKER')[];
  description: string;
}

interface AgentSessionConfig {
  workDir: string;
  branchName: string;
  prompt: string;
  systemPrompt?: string;
  attachments?: RuntimeAttachment[];
  env?: Record<string, string>;
  sandbox: SessionSandboxConfig;
}

interface SessionSandboxConfig {
  type: 'HOST' | 'DOCKER';
  containerImage?: string;
  readonlyMounts?: string[];
  readwriteMounts?: string[];
  networkProfile?: string;
}

interface RuntimeAttachment {
  fileName: string;
  filePath: string;
  fileType: 'IMAGE' | 'DOCUMENT' | 'CODE';
}

type AgentRuntimeMode = 'REAL' | 'STUB';

interface RunningAgentSession {
  sessionId: string;
  pid: number | null;
  containerId?: string | null;
  sendInput(message: string): Promise<void>;
  stop(): Promise<void>;
  kill(): Promise<void>;
  onOutput(callback: (chunk: string) => void): void;
  onExit(callback: (exitCode: number | null) => void): void;
}

interface AgentAdapterFactory {
  readonly name: string;
  readonly capabilities: AgentCapabilities;
  readonly runtimeMode?: AgentRuntimeMode;
  readonly usesSandboxManager?: boolean;
  healthCheck(): Promise<HealthCheckResult>;
  spawnSession(config: AgentSessionConfig): Promise<RunningAgentSession>;
}

interface HealthCheckResult {
  available: boolean;
  version?: string;
  reason?: string | {
    code?: string;
    message: string;
    details?: Record<string, unknown>;
  };
  checks?: Array<{
    name: string;
    status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
    message?: string;
    details?: Record<string, unknown>;
  }>;
}
```

### 9.3 Registry Contract

```typescript
class AgentRegistry {
  register(factory: AgentAdapterFactory): void;
  unregister(name: string): void;
  get(name: string): AgentAdapterFactory | null;
  listAll(): AgentAdapterFactory[];
  listLeadCandidates(): AgentAdapterFactory[];
  listWorkerCandidates(): AgentAdapterFactory[];
  healthCheckAll(): Promise<Record<string, HealthCheckResult>>;
}
```

### 9.4 Concurrency Requirement

The system must support multiple live sessions of the same adapter type at once.

Example supported scenario:

- 1 lead session using `claude-cli`
- 3 worker sessions using `claude-cli`
- 2 worker sessions using `codex-cli`

All session output and controls must be scoped by `sessionId`.

---

## 10. Task Lifecycle

### 10.1 Task State Machine

```text
DRAFT
  -> CLARIFYING
  -> PLANNING
  -> PLAN_REVIEW
  -> EXECUTING
  -> REVIEWING
  -> MERGING
  -> COMPLETED

Return paths:
- REVIEWING -> ACTION_REQUIRED
- ACTION_REQUIRED -> EXECUTING
- ACTION_REQUIRED -> MERGING
- MERGING -> ACTION_REQUIRED

Exceptional transitions:
- Any active state -> ACTION_REQUIRED
- Any active state -> FAILED
- DRAFT / PLAN_REVIEW / ACTION_REQUIRED -> CANCELLED
```

### 10.2 State Definitions

| State | Meaning |
|-------|---------|
| DRAFT | Task created but not yet started |
| CLARIFYING | Lead agent and user are clarifying requirements |
| PLANNING | Lead agent is generating a current plan |
| PLAN_REVIEW | User is reviewing and editing the current plan |
| EXECUTING | Worker sessions are running, pending start, or awaiting retry/rework scheduling |
| REVIEWING | Lead agent is producing final authoritative review decisions |
| MERGING | Accepted subtasks are being merged into the task base branch |
| ACTION_REQUIRED | User intervention is required before the task can continue |
| COMPLETED | Task workflow is resolved and cleanup has been attempted |
| FAILED | Task cannot proceed automatically |
| CANCELLED | User stopped the task before completion |

### 10.3 SubTask State Machine

```text
PENDING
  -> READY
  -> RUNNING
  -> REVIEW_PENDING

Early recovery transitions:
- REVIEW_PENDING -> READY (user initiates early rework after actionable incremental review)

Authoritative review transitions:
- REVIEW_PENDING -> ACCEPTED
- REVIEW_PENDING -> REWORK_REQUIRED
- REVIEW_PENDING -> DISCARD_PENDING

Recovery transitions:
- REWORK_REQUIRED -> READY
- FAILED -> READY
- DISCARD_PENDING -> REWORK_REQUIRED

Terminal transitions:
- ACCEPTED -> MERGED
- DISCARD_PENDING -> DISCARDED
- READY / RUNNING / REVIEW_PENDING / REWORK_REQUIRED -> CANCELLED
```

### 10.4 Lifecycle Rules

- A task enters `EXECUTING` only after explicit plan approval
- A task enters `REVIEWING` only when all subtasks are no longer running
- A subtask enters `READY` only after branch and worktree creation succeeds
- A subtask enters `RUNNING` only when a worker session starts
- A subtask enters `REVIEW_PENDING` only when its latest worker session exits successfully
- Incremental review writes a `ReviewRecord` but does not change `SubTaskStatus`
- A user may move a `REVIEW_PENDING` subtask back to `READY` before final review if its latest incremental review recommends `REWORK` or `REJECTED`
- A subtask enters `ACCEPTED` only after final review confirms acceptance
- A subtask enters `DISCARD_PENDING` only after final review issues `REJECTED`
- A subtask enters `MERGED` only after a successful merge attempt is recorded in `MergeRecord`
- Any unresolved merge conflict moves the task to `ACTION_REQUIRED`
- A failed subtask may return to `READY` via user-initiated retry

---

## 11. Feature Requirements

### 11.1 Project Management

#### FR-PM-01 Register Project

- User provides an absolute local path
- System validates the path exists
- System validates the path is a git repository
- System captures repository metadata:
  - current branch
  - default branch
  - working tree cleanliness
  - recent local branches
- System stores the project only after validation succeeds

#### FR-PM-02 Project Dashboard

- List all registered projects
- Show:
  - project name
  - local path
  - active task count
  - current branch
  - working tree status

#### FR-PM-03 Repo Safety Banner

- If a project has uncommitted changes, the UI must show a warning before task creation
- MVP behavior:
  - task creation is allowed by default
  - the task records the selected base branch and its current HEAD commit as `baseCommitSha`
  - the current working tree status is snapshotted into the task log
  - the user's active working directory is not reused for worker execution

#### FR-PM-04 Follow-Up Task Prompt

- If the user creates another task from the same project while the project working directory has uncommitted changes, EAT must show an explicit prompt
- MVP prompt options:
  - commit first
  - continue with a fresh task worktree
- If the user chooses `continue with a fresh task worktree`, the new task starts from the selected base branch HEAD and does not inherit those uncommitted changes
- MVP does not provide an in-product commit helper; the user must commit using their own tools

### 11.2 Task Creation and Clarification

#### FR-TC-01 Create Task

- User selects:
  - project
  - base branch
  - lead agent
  - title
  - requirement description
- User may upload attachments
- Task is created in `DRAFT`
- The system snapshots `baseCommitSha` from the selected base branch at task creation time

#### FR-TC-02 Start Clarification

- System validates the selected lead agent is healthy
- System creates a lead session (`AgentSession` with `sessionType = LEAD`, `taskId` set, `subTaskId` null)
- The lead session sandbox is selected according to adapter policy and capability
- Task transitions to `CLARIFYING`
- All lead-agent messages are stored as `Message`

#### FR-TC-03 Requirement Confirmation

- User explicitly confirms requirements are clear
- Task transitions from `CLARIFYING` to `PLANNING`
- The system sends a planning instruction to the lead agent

### 11.3 Planning

#### FR-PL-01 Plan Output Contract

The lead agent must return valid JSON matching this structure:

```json
{
  "subtasks": [
    {
      "title": "string",
      "description": "string",
      "recommended_agent": "string",
      "branch_suffix": "string"
    }
  ],
  "notes": "optional string"
}
```

Rules:

- `subtasks` may contain dependency-constrained items via `depends_on`
- `branch_suffix` must be slug-safe
- No `order` field is allowed in MVP
- If only one worker is appropriate, the lead agent may return a single subtask

#### FR-PL-02 Plan Validation

The system validates:

- JSON is parseable
- `subtasks` is non-empty
- every recommended agent exists and is healthy
- titles and descriptions are non-empty
- `branch_suffix` values are unique within the current plan

On validation failure:

- The task remains in `PLANNING`
- The system requests the lead agent to regenerate the plan
- `planVersion` is incremented only when a new syntactically valid plan payload was produced
- A validation error is added to the task log

#### FR-PL-03 Current Plan Persistence

- On each valid plan generation, the system writes the full payload to `currentPlanJson`
- On each valid lead-generated plan, the system also writes a `PlanSnapshot` with `source = LEAD_GENERATED`
- `currentPlanJson` is the source of truth for `PLAN_REVIEW`
- `SubTask` records are not created during planning

#### FR-PL-04 Plan Review

- Task transitions to `PLAN_REVIEW`
- User can:
  - edit title
  - edit description
  - change assigned agent
  - edit `branch_suffix`
  - add a new subtask
  - remove a subtask
  - restore a previous lead-generated `PlanSnapshot` into `currentPlanJson`
- User may define dependencies between subtasks in MVP through `depends_on`
- User edits do not increment `planVersion`
- User edits update `currentPlanJson` in place
- If a historical snapshot is restored, the system may write a new `PlanSnapshot` with `source = RESTORED_FROM_HISTORY` for auditability

#### FR-PL-05 Plan Approval

- User clicks `Execute`
- System validates the edited `currentPlanJson`
- System snapshots `currentPlanJson` into `approvedPlanJson`
- System writes one `PlanSnapshot` with `source = APPROVED`
- System materializes one `SubTask` record per approved plan item
- `SubTask.branchSuffix` is copied from the approved plan item
- Task transitions to `EXECUTING`

### 11.4 Worker Execution

#### FR-EX-01 Branch Naming

Branch format:

```text
eat/{taskId}/{branchSuffix}
```

Requirements:

- branch names are deterministic from the approved plan
- branch names must be unique within the repo
- if a computed branch name already exists, the system appends `-1`, `-2`, and so on until a unique name is found
- the final branch name is persisted on the subtask record
- the UI displays a notification when a branch was renamed due to collision
- the collision and resolution are logged in the task log

#### FR-EX-02 Worktree Isolation

For each approved subtask:

- the system creates a dedicated git worktree
- the worktree is rooted at the task's recorded `baseCommitSha`
- the worktree path is persisted on the subtask record
- worker sessions run only inside the assigned subtask worktree
- the user's active project directory remains untouched by worker execution

#### FR-EX-03 Branch Creation

For each approved subtask:

- create the subtask branch from the task's recorded `baseCommitSha`
- resolve naming collisions before creation
- attach the branch to the dedicated subtask worktree
- persist `branchName` and `worktreePath`
- mark the subtask `READY`

If any required branch or worktree creation fails:

- the task moves to `ACTION_REQUIRED`
- successfully created subtasks are retained
- failed subtasks remain `PENDING`
- the failure reason is surfaced in the UI and task log

#### FR-EX-04 Session Spawn

For each `READY` subtask:

- the system creates an `AgentSession` with `sessionType = WORKER`, `taskId` set, `subTaskId` set
- the assigned worker adapter spawns a PTY-backed session
- the session is linked to one subtask only
- the session `workDir` is the subtask worktree path
- subtask moves to `RUNNING`

#### FR-EX-05 Container Sandbox

For each worker session:

- the session must run inside a dedicated Docker container
- the container mounts the subtask worktree as read-write
- task attachments are mounted read-only when needed
- unrelated host paths are not mounted by default
- the container runs as non-root by default and without `--privileged`
- the `containerId` is persisted on the `AgentSession` record when available
- the container is torn down when the session reaches a terminal state

#### FR-EX-06 Output Streaming

- Output is streamed per `sessionId`
- The UI groups output by subtask and active session
- Full output is persisted to local log files at `logPath`
- `outputBuffer` holds the last `outputBufferMaxBytes` of output for quick UI display
- ANSI color sequences may be rendered in the UI but raw output must also be stored in the log file
- The default task view must not mount a full terminal surface for every concurrent worker
- By default, the UI shows a summary card per subtask with status, latest step signal if available, and a short tail preview derived from `outputBuffer`
- A full focused terminal or console surface with ANSI-safe rendering is mounted only when the user focuses a specific subtask

#### FR-EX-07 Mid-Flight User Intervention

While a task is in `EXECUTING`, the user may:

- send a message to the lead agent
- cancel a running subtask
- retry a failed subtask after editing its description
- switch the assigned worker agent and relaunch a subtask when the current agent is incompatible with required attachments

MVP does not require pause or resume support for individual PTY processes.

If agent switching is requested for a running subtask:

- the current worker session is cancelled
- the subtask stays on the same branch and worktree
- the new agent assignment is persisted before relaunch

#### FR-EX-08 Retry

Retry creates a new `AgentSession` for the same subtask branch.

Rules:

- previous session records are retained
- the latest successful session is the one used for incremental review input
- retry count must be visible in the UI
- `retryCount` increments each time a retry or rework run is launched
- a failed subtask transitions to `READY` when retry is initiated, then to `RUNNING` when the new session starts

### 11.5 Review

#### FR-RV-01 Incremental Review Trigger

Each subtask must receive an incremental review once immediately after it reaches `REVIEW_PENDING`.

Rules:

- the lead agent receives the completed subtask context as soon as the latest successful session ends
- the system writes one `ReviewRecord` with `phase = INCREMENTAL`
- incremental review may recommend `ACCEPTED`, `REWORK`, or `REJECTED`
- incremental review decisions are advisory only
- incremental review does not change `SubTaskStatus`
- the latest incremental decision is copied into `latestReviewDecision`, `latestReviewPhase`, and `latestReviewSummary` for UI convenience
- if the latest incremental decision is `REWORK` or `REJECTED`, the subtask becomes eligible for user-triggered early rework while the task remains in `EXECUTING`

#### FR-RV-02 Early Rework During Execution

If a subtask is in `REVIEW_PENDING` and its latest incremental review recommends `REWORK` or `REJECTED`:

- the UI may offer `Rework Now` without waiting for task-level final review
- the user may optionally edit the subtask description before relaunch
- the user may optionally switch to a different worker agent before relaunch
- on user confirmation, the subtask transitions from `REVIEW_PENDING` back to `READY`
- the task remains in `EXECUTING` while other subtasks continue running

This path is a user-driven operational shortcut. It does not make incremental review authoritative.

#### FR-RV-03 Final Review Trigger

Task transitions to `REVIEWING` when all subtasks are in one of:

- `REVIEW_PENDING`
- `FAILED`
- `CANCELLED`

Final review purpose:

- check cross-subtask consistency
- catch integration issues missed by incremental review
- confirm the final merge set before merge starts
- produce authoritative decisions for every non-terminal subtask

#### FR-RV-04 Review Inputs

The lead agent review prompt must include:

- original task description
- approved plan snapshot
- per-subtask diff summary
- per-subtask latest successful session result
- retry count and latest exit status

For final review, the prompt must also include:

- all incremental review records
- a merged view of accepted, rework, and rejected recommendations across the task

#### FR-RV-05 Final Review Decisions

For each subtask in `REVIEW_PENDING`, the lead agent recommends one of:

- `ACCEPTED`
- `REWORK`
- `REJECTED`

System behavior:

- the system writes one `ReviewRecord` with `phase = FINAL`
- `ACCEPTED` transitions the subtask to `ACCEPTED`
- `REWORK` transitions the subtask to `REWORK_REQUIRED`
- `REJECTED` transitions the subtask to `DISCARD_PENDING`
- `DISCARD_PENDING` requires explicit user confirmation before the subtask can become `DISCARDED`

#### FR-RV-06 Rework Loop

- Rework does not create a new branch
- Rework continues on the existing subtask branch
- User may edit the subtask description before relaunch
- Reworked subtasks return to `READY`, then `RUNNING`

#### FR-RV-07 Discard Confirmation

- A subtask marked `DISCARD_PENDING` must be surfaced to the user for confirmation
- Until confirmed, the subtask remains `DISCARD_PENDING`
- Once the user confirms discard, the subtask transitions to `DISCARDED`
- If the user does not confirm discard, they may instead request rework

#### FR-RV-08 Post-Review Flow

- If final review leaves one or more subtasks in `REWORK_REQUIRED`, `DISCARD_PENDING`, `FAILED`, or `CANCELLED`, the task moves to `ACTION_REQUIRED`
- If all subtasks are `ACCEPTED`, `DISCARDED`, or `CANCELLED`, the task transitions to `MERGING`

### 11.6 Merge

#### FR-MG-01 Merge Strategy

Accepted subtasks are merged one by one into the task base branch after final review.

Recommended default:

- merge target: the task base branch selected at task creation
- merge order: stable order of subtask creation
- merge mode: `--no-ff`
- merge precondition: before each merge, EAT checks the current state of the target base branch and working tree
- each successful merge attempt writes a `MergeRecord` with `operation = MERGE` and `status = SUCCEEDED`

#### FR-MG-02 Partial Success

The system supports partial success during merge.

Examples:

- Subtask A merged successfully, Subtask B hits a merge conflict, Subtask C remains `ACCEPTED` but not yet merged
- Subtask A and B merged successfully, then merge is blocked because the target branch became dirty before Subtask C

The task remains active until all accepted subtasks are either merged or explicitly discarded by the user.

#### FR-MG-03 Conflict Handling

If a merge conflict occurs:

- create a new `MergeRecord` attempt with `operation = MERGE` and `status = CONFLICT`
- stop further automatic merges for this task
- move the task to `ACTION_REQUIRED`
- surface the conflict summary in the UI

MVP resolution paths:

- user triggers `Rebase & Retry`
- user resolves the conflict manually outside EAT, then resumes
- user discards the conflicting subtask

Automatic agent-driven conflict resolution is out of scope for MVP.

#### FR-MG-04 Rebase & Retry

If a task is in `ACTION_REQUIRED` because the latest merge attempt conflicted:

- the UI may offer `Rebase & Retry` for the conflicting subtask
- the system runs `git rebase {baseBranch}` on the conflicting subtask branch
- the rebase attempt is persisted as a new `MergeRecord` with `operation = REBASE`
- if the rebase succeeds, the task may return to `MERGING` and retry the blocked merge
- if the rebase conflicts, the task remains in `ACTION_REQUIRED` and the new conflict summary is surfaced

If the rebase succeeds, that `MergeRecord` must use `status = SUCCEEDED`.

`Rebase & Retry` is best-effort automation. It does not replace manual conflict resolution when rebase also fails.

#### FR-MG-05 Dirty Base Branch Handling

- Dirty working trees do not block task creation
- Dirty working trees do block automatic merge if the merge target is not in a safe state
- When merge is blocked by uncommitted changes on the target branch, the task moves to `ACTION_REQUIRED`
- The UI must ask the user to resolve the target branch state before merge continues

#### FR-MG-06 Post-Merge Completion

- When all accepted subtasks have been successfully merged and all other subtasks are `DISCARDED` or `CANCELLED`, the task transitions to `COMPLETED`
- On transition to `COMPLETED`, the Worktree Manager attempts cleanup of all subtask worktrees for this task
- Cleanup warnings do not change the terminal task status

### 11.7 Attachment Handling

#### FR-AT-01 Supported Types

- Images: PNG, JPG, JPEG, GIF, WebP, SVG
- Documents: PDF, MD, TXT
- Code: text-based source files

#### FR-AT-02 Storage

Files are stored locally:

```text
uploads/{taskId}/{attachmentId}-{originalFileName}
```

#### FR-AT-03 Capability Filtering

At runtime, attachments are filtered per target session:

- if `supportsVision = true`, image file references may be passed
- if `supportsVision = false`, image files are excluded
- documents and code files may be passed as content excerpts or file references depending on adapter implementation

#### FR-AT-04 User Visibility

For each session launch, the UI must display:

- included attachments
- excluded attachments
- exclusion reason
- excluded image attachments should be visually emphasized because they are likely to invalidate the worker choice

#### FR-AT-05 Compatible Agent Relaunch

If one or more task-critical attachments are excluded because the assigned worker lacks required capabilities:

- the UI should offer a one-step `Switch Agent & Relaunch` action
- if the subtask is already running, the current session is cancelled before relaunch
- the replacement agent must be validated as healthy before relaunch
- the relaunch continues on the same subtask branch and worktree

#### FR-AT-06 Security Rules

- uploads are not served from public static routes by default
- file paths passed to agents must stay under project or upload roots
- attachment extraction must enforce size limits

---

## 12. API and Event Protocol

### 12.1 API Style

MVP uses a local Node.js HTTP server with REST endpoints plus task-scoped SSE event streams.

Suggested split:

- REST for CRUD and snapshot reads
- SSE for long-running task and session events

### 12.2 Client -> Server Events

| Event | Payload |
|-------|---------|
| `task:start-clarification` | `{ taskId }` |
| `task:message` | `{ taskId, content, attachments? }` |
| `task:confirm-requirements` | `{ taskId }` |
| `task:approve-plan` | `{ taskId, currentPlan }` |
| `task:restore-plan-snapshot` | `{ taskId, snapshotId }` |
| `task:cancel` | `{ taskId }` |
| `task:resume` | `{ taskId }` |
| `subtask:confirm-discard` | `{ subtaskId }` |
| `subtask:cancel` | `{ subtaskId }` |
| `subtask:retry` | `{ subtaskId, description? }` |
| `subtask:rework` | `{ subtaskId, description? }` |
| `subtask:change-agent` | `{ subtaskId, agentType, description? }` |
| `subtask:rebase-retry` | `{ subtaskId }` |

Notes:

- `task:resume` is the generic recovery action after the user has resolved an `ACTION_REQUIRED` blocker such as merge conflict, dirty target branch, or branch-setup issue
- `subtask:rework` is used when the subtask is in `REWORK_REQUIRED`, `DISCARD_PENDING`, or `REVIEW_PENDING` with latest incremental `REWORK` or `REJECTED`
- `subtask:change-agent` may be used as part of early rework, retry, or attachment-driven relaunch
- `subtask:rebase-retry` is only valid when the latest merge attempt for the subtask ended in conflict

### 12.3 Server -> Client Events

| Event | Payload |
|-------|---------|
| `task:status` | `{ taskId, status, reason? }` |
| `task:lead-message` | `{ taskId, messageId, content }` |
| `task:plan-generated` | `{ taskId, currentPlan, planVersion }` |
| `task:plan-restored` | `{ taskId, snapshotId, currentPlan }` |
| `subtask:status` | `{ subtaskId, status, reason? }` |
| `subtask:review` | `{ subtaskId, decision, summary, phase }` |
| `session:started` | `{ sessionId, taskId, subtaskId?, pid? }` |
| `session:output` | `{ sessionId, taskId, subtaskId?, chunk }` |
| `session:ended` | `{ sessionId, taskId, subtaskId?, exitCode, status }` |
| `merge:status` | `{ subtaskId, status, summary? }` |
| `subtask:agent-changed` | `{ subtaskId, oldAgentType, newAgentType }` |
| `agent:health` | `{ agents }` |
| `branch:renamed` | `{ subtaskId, originalName, resolvedName }` |
| `task:cleanup-warning` | `{ taskId, worktreePath, reason }` |

---

## 13. Non-Functional Requirements

### 13.1 Performance

- UI should reflect session output with perceived latency under 250 ms on the same machine
- System should support at least 5 concurrent worker sessions in one task
- UI should remain usable while output is actively streaming from all concurrent sessions
- The default execution view should render summary cards for all subtasks without mounting more than one live focused terminal surface by default

### 13.2 Reliability

- every session exit must be detected and persisted
- orphan child processes must be cleaned up on normal shutdown
- task and subtask statuses must remain recoverable from persisted records after restart
- full live PTY recovery after restart is not required in MVP

### 13.3 Security

- local-only network binding on `127.0.0.1`
- no unauthenticated remote exposure in MVP
- worker agent processes must run inside Docker sandboxes rather than directly as unrestricted host-user processes
- worker containers must not mount the host home directory, SSH directory, or unrelated repositories by default
- worker containers must run without `--privileged` and as non-root by default
- container network access must be controlled by adapter or project policy rather than assumed as unrestricted host access
- lead sessions may run on the host only for adapters that do not require repository-mutating execution; otherwise they should use the same sandbox model
- any dangerous adapter flags must be explicit in adapter configuration and documentation

### 13.4 Observability

The system must persist enough data to evaluate success metrics:

- task creation timestamp
- task completion timestamp
- per-session exit status
- retry count
- merge conflict count
- merge or rebase completion timestamp (`completedAt`)
- final task outcome
- cleanup warning count
- sandbox launch failure count
- rebase-retry attempt count

Metric collection in MVP: all metrics are derived from querying the SQLite database. No separate analytics pipeline is required. A CLI command or API endpoint should support exporting task-level metric summaries.

### 13.5 Extensibility

- adding a new agent type should require a new adapter factory and registry entry only
- orchestration logic must not hard-code provider names
- attachment filtering must rely on capabilities, not on provider-specific conditionals in the UI

---

## 14. UX Requirements

### 14.1 Required Screens

- Project list
- Project detail with branch overview and task list
- Task creation
- Task execution view with:
  - clarification chat
  - plan review
  - subtask list
  - per-session terminal output
  - review summaries
  - merge and recovery actions
- Agent registry health view

### 14.2 Required UX Signals

- show when a task is blocked and why
- show the current plan separately from the approved plan
- show prior lead-generated plan snapshots and allow restoring one into the current editable plan
- show which attachments each session received
- show which attachments were excluded with a prominent capability-mismatch warning
- show retry count per subtask
- show merged vs discarded vs rework-required subtasks clearly
- show if the underlying repo was dirty at task start
- show when a subtask is waiting for discard confirmation
- show when a branch was renamed due to collision
- show cleanup warnings after terminal transition if a worktree could not be deleted
- show a summary-first execution board by default and open the full terminal only for the selected subtask
- show `Rework Now`, `Switch Agent & Relaunch`, and `Rebase & Retry` only when their preconditions are satisfied

---

## 15. Acceptance Criteria

### 15.1 End-to-End Acceptance

MVP is acceptable when the following flow works on a local machine:

1. User registers a valid git repository
2. User creates a task with one lead agent and attachments
3. Lead agent performs clarification chat
4. Lead agent generates a valid independent plan
5. User can restore a prior lead-generated plan snapshot during plan review
6. User edits and approves the plan
7. System snapshots the approved plan and materializes subtasks from it
8. System creates isolated subtask worktrees and Docker-sandboxed worker sessions from the recorded base commit
9. System runs multiple worker sessions concurrently, including at least two sessions of the same agent type
10. UI streams summary output for all sessions and mounts a full terminal only for the selected subtask
11. At least one subtask can be retried after failure
12. Each completed subtask receives an incremental review record
13. A subtask with incremental `REWORK` or `REJECTED` can be relaunched before the whole task reaches final review
14. After all subtasks finish, the lead agent performs a final review pass
15. Only final review changes subtasks into `ACCEPTED`, `REWORK_REQUIRED`, or `DISCARD_PENDING`
16. Accepted subtasks merge successfully using `--no-ff` only after final review
17. A merge conflict moves the task to `ACTION_REQUIRED`, and `Rebase & Retry` can be attempted
18. A rejected subtask cannot be discarded without explicit user confirmation
19. Cleanup is attempted when the task reaches a terminal state and failures are surfaced as warnings

### 15.2 Negative Acceptance

The system must also correctly handle:

- invalid project path
- non-git directory
- unavailable lead or worker agent
- malformed plan JSON
- invalid plan payload shape
- branch name collision resolved via auto-suffix
- Docker sandbox startup failure
- worker process crash
- branch or worktree creation failure for one subtask
- merge conflict after one or more prior merges
- rebase attempt that also conflicts
- merge blocked by dirty target branch state
- unsupported attachment type for selected agent
- incompatible worker agent replaced and relaunched on the same subtask branch
- rejected subtask awaiting discard confirmation

---

## 16. Success Metrics

| Metric | Target |
|--------|--------|
| Task completion rate after plan approval | > 70% |
| Concurrent session routing correctness | 100% |
| Worker sandbox escape incidents | 0 |
| Worker crash detection rate | 100% |
| Successful retry-to-review conversion rate | > 60% |
| Merge conflict surfacing accuracy | 100% |
| Median time from plan approval to first worker output | < 10s |
| Early rework adoption on actionable incremental reviews | Tracked |

Metric definitions:

- `completion rate after plan approval`: tasks reaching `COMPLETED` divided by tasks entering `EXECUTING`
- `routing correctness`: no session output appears under the wrong subtask or session panel

---

## 17. Suggested Implementation Order

1. Project registration and repo validation
2. Agent registry and health checks
3. Container sandbox manager and Docker preflight checks
4. Lead session chat flow
5. Plan generation, validation, `currentPlanJson`, and `PlanSnapshot` persistence
6. Plan review UI with restore-from-history
7. Approved-plan materialization into `SubTask` records
8. Agent session manager with concurrent worker sessions
9. Real-time output streaming with summary-first terminal UX
10. Incremental review persistence and early rework flow
11. Final review persistence
12. Merge flow, merge-attempt history, and `Rebase & Retry`
13. Worktree cleanup warnings
14. Metrics and observability

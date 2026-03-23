# EAT Development Phases

本目录承载 EAT 基础交付阶段，也就是 phase `01` 到 `16`。  
从 `PRD v4.0` 的角度看，这些阶段定义的是产品主干能力的落地顺序，而不是一份独立于当前产品定义之外的旧路线。

统一文档入口见 [docs/README.md](/home/code/EAT/docs/README.md)，实现规则见 [AGENTS.md](/home/code/EAT/AGENTS.md)。

## 这组文档在整体文档体系中的位置

当前文档分层应这样理解：

1. `docs/PRD.md`
2. `docs/phase/` phase `01` 到 `16`
3. `docs/v1.1/` phase `17` 到 `22`

也就是说：

- `docs/PRD.md` 是唯一顶层产品定义
- `docs/phase/` 负责基础主干阶段
- `docs/v1.1/` 负责扩展阶段，不再被视为另一个并行 PRD

## 这 16 个 phase 覆盖什么

phase `01` 到 `16` 主要覆盖：

- 项目注册与仓库校验
- agent registry 与健康检查
- Docker sandbox manager
- lead clarification
- plan generation / review / snapshot
- approved plan materialization
- worker execution / output streaming
- incremental review / final review
- merge flow / rebase retry
- metrics
- dependency scheduling
- mailbox 的基础形态

这些阶段是后续 Web-first orchestration、team board、integration queue、guided flow 的基础。

## 阶段顺序

除非某个阶段文档明确说明可以并行，否则应按顺序实现。

## Phase List

1. [01-project-registration-and-repo-validation.md](/home/code/EAT/docs/phase/01-project-registration-and-repo-validation.md)
2. [02-agent-registry-and-health-checks.md](/home/code/EAT/docs/phase/02-agent-registry-and-health-checks.md)
3. [03-container-sandbox-manager-and-docker-preflight.md](/home/code/EAT/docs/phase/03-container-sandbox-manager-and-docker-preflight.md)
4. [04-lead-session-chat-flow.md](/home/code/EAT/docs/phase/04-lead-session-chat-flow.md)
5. [05-plan-generation-validation-and-snapshots.md](/home/code/EAT/docs/phase/05-plan-generation-validation-and-snapshots.md)
6. [06-plan-review-ui-and-history-restore.md](/home/code/EAT/docs/phase/06-plan-review-ui-and-history-restore.md)
7. [07-approved-plan-materialization.md](/home/code/EAT/docs/phase/07-approved-plan-materialization.md)
8. [08-worker-session-manager-and-concurrent-execution.md](/home/code/EAT/docs/phase/08-worker-session-manager-and-concurrent-execution.md)
9. [09-realtime-output-streaming-and-summary-ux.md](/home/code/EAT/docs/phase/09-realtime-output-streaming-and-summary-ux.md)
10. [10-incremental-review-and-early-rework.md](/home/code/EAT/docs/phase/10-incremental-review-and-early-rework.md)
11. [11-final-review-and-authoritative-decisions.md](/home/code/EAT/docs/phase/11-final-review-and-authoritative-decisions.md)
12. [12-merge-flow-and-rebase-retry.md](/home/code/EAT/docs/phase/12-merge-flow-and-rebase-retry.md)
13. [13-worktree-cleanup-and-terminal-warnings.md](/home/code/EAT/docs/phase/13-worktree-cleanup-and-terminal-warnings.md)
14. [14-metrics-observability-and-export.md](/home/code/EAT/docs/phase/14-metrics-observability-and-export.md)
15. [15-dependent-subtask-scheduling.md](/home/code/EAT/docs/phase/15-dependent-subtask-scheduling.md)
16. [16-agent-mailbox-and-web-handoff.md](/home/code/EAT/docs/phase/16-agent-mailbox-and-web-handoff.md)

扩展阶段入口：

- [docs/v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)

## Supplementary Delivery Docs

- [CHECKLISTS.md](/home/code/EAT/docs/phase/CHECKLISTS.md)
- [PRISMA-MIGRATIONS.md](/home/code/EAT/docs/phase/PRISMA-MIGRATIONS.md)
- [API-EVENT-EXAMPLES.md](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)
- [ISSUE-WORKSPACE-PLAYBOOK.md](/home/code/EAT/docs/phase/ISSUE-WORKSPACE-PLAYBOOK.md)
- [ISSUE-WORKSPACE-PLAYBOOK.zh-CN.md](/home/code/EAT/docs/phase/ISSUE-WORKSPACE-PLAYBOOK.zh-CN.md)

## Definition Of Done For Every Phase

- Required schema changes are implemented and migrated.
- Required server APIs and events are implemented.
- Required UI states are visible and testable.
- Negative-path behavior described in the phase is covered by tests or explicit manual verification steps.
- Logging and user-facing errors are good enough for debugging without attaching a debugger.

## Standard Phase Structure

每个 phase 文档至少应包含：

- Goal
- PRD Coverage
- Preconditions
- Deliverables
- Suggested Execution Order
- Schema And Persistence
- API And Event Surface
- Outputs For Next Phase
- Backend, UI, and integration tasks
- Edge cases
- Acceptance checklist
- Suggested tests

如果某个阶段没有 schema 或 API 变化，应明确写出，而不是留空。

## Recommended Delivery Style

- Prefer one focused branch or PR per phase unless the codebase size makes smaller PRs necessary.
- If a phase spans backend and frontend, land the schema and server contracts first.
- Do not start later UI polish while core state transitions are still unstable.
- If a later phase depends on append-only history, land the history-preserving schema before writing orchestration logic.

## Recommended Tracking Fields

执行 phase 时，至少跟踪：

- owner
- start date
- target completion date
- blocking dependency
- implementation status
- verification status

## Cross-Cutting Constraints

- Worker execution must remain sandboxed by Docker after phase 3. Do not introduce host-executed shortcuts for workers.
- Task and subtask status transitions must be centralized in orchestrator logic.
- Session output must always remain scoped by `sessionId`.
- Keep plan drafts separate from executable subtasks.
- Keep merge and review history append-only wherever the PRD requires history preservation.
- If a later phase extends an earlier phase, the later document should explicitly say which earlier contract it refines rather than silently redefining terms.

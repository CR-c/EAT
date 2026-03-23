# EAT Foundation Phase Checklists

本文件是基础阶段 `01` 到 `16` 的执行 checklist。  
只有当对应 phase 文档中的验收标准与本文件中的核对项同时满足时，该阶段才算完成。

使用规则：

- 本文件不替代 `docs/PRD.md`
- 本文件不替代具体 phase 文档
- 若 checklist 与 `PRD v4.0` 冲突，以 `PRD v4.0` 为准

## Phase 01 Checklist

- [ ] 持久化 `Project`
- [ ] 路径规范化与唯一约束
- [ ] Git 仓库校验
- [ ] 读取默认分支、当前分支、dirty 状态、最近分支
- [ ] `POST /api/projects`
- [ ] `GET /api/projects`
- [ ] `GET /api/projects/:id` 或 `repo-status`
- [ ] 项目列表 UI
- [ ] 项目详情 UI
- [ ] dirty working tree warning
- [ ] 重复项目注册保护
- [ ] 非法路径与非 Git 目录负路径验证

## Phase 02 Checklist

- [ ] 定义 adapter capability contract
- [ ] 实现 `AgentRegistry`
- [ ] 支持 lead candidate 过滤
- [ ] 支持 worker candidate 过滤
- [ ] 结构化 health checks
- [ ] 规范化 health failure reasons
- [ ] `GET /api/agents`
- [ ] `GET /api/agents/health`
- [ ] agent health UI
- [ ] capability 中显示 sandbox support
- [ ] 阻止选择不健康的 lead agent

## Phase 03 Checklist

- [ ] 定义 sandbox config 与校验规则
- [ ] Docker daemon preflight
- [ ] image / runtime availability 校验
- [ ] mount allowlist enforcement
- [ ] 默认阻止 home 与 `.ssh` 挂载
- [ ] 默认非 root Worker
- [ ] 拒绝 privileged container
- [ ] container create / start / stop / remove helpers
- [ ] session 持久化中可容纳 `sandboxType` / `containerId`
- [ ] `GET /api/system/docker-health`
- [ ] `GET /api/system/sandbox-policy`
- [ ] sandbox failure fail closed

## Phase 04 Checklist

- [ ] 持久化 `Task`
- [ ] 持久化 `Message`
- [ ] 持久化 `Attachment`
- [ ] 持久化 lead `AgentSession`
- [ ] task 创建时记录 `baseCommitSha`
- [ ] task-scoped 附件目录持久化
- [ ] 附件类型、大小和元数据校验
- [ ] `POST /api/tasks`
- [ ] `POST /api/tasks/:id/start-clarification`
- [ ] `POST /api/tasks/:id/messages`
- [ ] `POST /api/tasks/:id/confirm-requirements`
- [ ] clarification chat UI
- [ ] reload 后 transcript 与 lead session 可恢复

## Phase 05 Checklist

- [ ] `Task.currentPlanJson`
- [ ] `Task.planVersion`
- [ ] `PlanSnapshot`
- [ ] requirements confirmation 后自动进入 planning
- [ ] 安全解析 lead 计划 JSON
- [ ] 校验 plan 结构与 agent 合法性
- [ ] 校验唯一 `branch_suffix`
- [ ] 合法计划持久化到 `currentPlanJson`
- [ ] 追加 `LEAD_GENERATED` snapshot
- [ ] `task:plan-generated`
- [ ] 非法计划再生成逻辑
- [ ] version 与 snapshot history 验证

## Phase 06 Checklist

- [ ] plan review 编辑 UI
- [ ] add / remove / edit subtask
- [ ] 编辑推荐 agent
- [ ] 编辑 `branch_suffix`
- [ ] 批准前重新校验 draft
- [ ] `POST /api/tasks/:id/restore-plan-snapshot`
- [ ] `task:plan-restored`
- [ ] 历史 snapshot 恢复到 `currentPlanJson`
- [ ] 需要时追加 `RESTORED_FROM_HISTORY`
- [ ] 阻止批准非法草稿

## Phase 07 Checklist

- [ ] 持久化 `SubTask`
- [ ] approval transaction boundary
- [ ] `currentPlanJson -> approvedPlanJson`
- [ ] 追加 `APPROVED` snapshot
- [ ] 一对一物化 approved plan items
- [ ] 初始 `SubTask.status = PENDING`
- [ ] setup 前 `branchName` / `worktreePath` 为空
- [ ] approval 后发布 task / subtask 状态
- [ ] 阻止重复批准重复物化

## Phase 08 Checklist

- [ ] 基于 `taskId + branchSuffix` 生成稳定 branch name
- [ ] 分支名冲突自动加数字后缀
- [ ] 持久化 resolved `branchName`
- [ ] `branch:renamed`
- [ ] 基于 `baseCommitSha` 创建独立 worktree
- [ ] 持久化 `worktreePath`
- [ ] 创建 worker `AgentSession`
- [ ] 通过 sandbox manager 启动 worker
- [ ] 启动时按 capability 过滤附件
- [ ] included / excluded attachment metadata 可见
- [ ] `PENDING -> READY -> RUNNING`
- [ ] `POST /api/subtasks/:id/retry`
- [ ] retry / rework 增加 `retryCount`
- [ ] branch / worktree setup 失败转 `ACTION_REQUIRED`

## Phase 09 Checklist

- [ ] session logs 持久化到 `logPath`
- [ ] bounded `outputBuffer`
- [ ] `session:output` 按 `sessionId` 路由
- [ ] `session:started`
- [ ] `session:ended`
- [ ] 所有 subtasks 都有 summary cards
- [ ] 从 `outputBuffer` 显示 tail preview
- [ ] 默认只挂载一个 focused terminal surface
- [ ] focused terminal 保持 ANSI-safe rendering
- [ ] 高并发输出下路由正确

## Phase 10 Checklist

- [ ] `ReviewRecord`
- [ ] `latestReviewDecision`
- [ ] `latestReviewPhase`
- [ ] `latestReviewSummary`
- [ ] 成功 worker run 后触发 incremental review
- [ ] 持久化 `INCREMENTAL` review
- [ ] `subtask:review`
- [ ] UI 中显示 incremental review summary
- [ ] 对可操作的 `REWORK` / `REJECTED` 开启 `Rework Now`
- [ ] relaunch 前支持编辑描述
- [ ] relaunch 前支持 change-agent
- [ ] early rework 不绕过 final review

## Phase 11 Checklist

- [ ] 检测 task 何时进入 final review
- [ ] 构建 final review aggregate prompt
- [ ] prompt 包含 approved plan、diffs、retries、incremental history
- [ ] 持久化 `FINAL` review
- [ ] `REVIEW_PENDING -> ACCEPTED`
- [ ] `REVIEW_PENDING -> REWORK_REQUIRED`
- [ ] `REVIEW_PENDING -> DISCARD_PENDING`
- [ ] task 正确路由到 `MERGING` 或 `ACTION_REQUIRED`
- [ ] discard confirmation flow
- [ ] mixed outcome task 验证

## Phase 12 Checklist

- [ ] `MergeRecord`
- [ ] accepted subtasks 按稳定顺序 merge
- [ ] 使用 `--no-ff`
- [ ] merge 前校验 target branch 安全性
- [ ] `SUCCEEDED` merge attempts 持久化
- [ ] `CONFLICT` merge attempts 持久化
- [ ] merge conflict 转 `ACTION_REQUIRED`
- [ ] `POST /api/subtasks/:id/rebase-retry`
- [ ] rebase attempt 独立于 merge attempt 持久化
- [ ] rebase 成功后恢复 merge 流程
- [ ] dirty target branch 可通过 `task:resume` 或等价恢复入口处理

## Phase 13 Checklist

- [ ] 中央化检测 terminal task transitions
- [ ] 对 `COMPLETED` 尝试 cleanup
- [ ] 对 `FAILED` 尝试 cleanup
- [ ] 对 `CANCELLED` 尝试 cleanup
- [ ] cleanup 失败不重开 task
- [ ] `task:cleanup-warning`
- [ ] reload 后仍能看到 cleanup warning
- [ ] 缺失 / 锁定 worktree 的 cleanup 负路径验证

## Phase 14 Checklist

- [ ] 所需 metrics 输入都来自持久化数据
- [ ] `GET /api/metrics/summary`
- [ ] `GET /api/metrics/export`
- [ ] completion-rate 计算验证
- [ ] retry-to-review conversion 计算验证
- [ ] merge-conflict 与 rebase-retry counter 验证
- [ ] cleanup warning / sandbox failure counter 验证
- [ ] 带 retry / rework / conflict 的 seeded histories 验证

## Phase 15 Checklist

- [ ] plan payload 支持 `depends_on`
- [ ] 校验依赖引用与环
- [ ] 持久化 subtask dependency metadata
- [ ] 引入 `BLOCKED` subtask status
- [ ] 依赖型 subtasks 初始为 `BLOCKED`
- [ ] 依赖满足后自动 release
- [ ] release 后自动 launch
- [ ] unresolved blocked subtasks 正确转入 `ACTION_REQUIRED`
- [ ] API 与 UI 暴露 dependency metadata
- [ ] 有序依赖链验证

## Phase 16 Checklist

- [x] `MailboxMessage`
- [x] task detail API 暴露 mailbox history
- [x] `POST /api/tasks/:id/mailbox`
- [x] realtime mailbox events
- [x] 上游成功后自动生成 handoff note
- [x] targeted mailbox notes 注入 worker prompt
- [x] focused execution mailbox UI
- [x] Web 中可发送 lead mailbox note
- [x] mailbox persistence 与 ordering 验证
- [x] downstream prompt handoff 验证

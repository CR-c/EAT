# EAT Extended Phase Checklists

本文件是 `docs/v1.1/` phase `17` 到 `22` 的执行 checklist。  
只有当对应 phase 文档中的交付项、验收标准与这里的核对项同时满足时，该阶段才算完成。

使用规则：

- 本文件不替代 `docs/PRD.md`
- 本文件不替代各 phase 的详细合同文档
- 若 checklist 与 `PRD v4.0` 冲突，以 `PRD v4.0` 为准

## Phase 17 Checklist

- [ ] `SubTask` 已具备稳定的 team-member 展示字段
- [ ] 没有引入独立 `Team` 顶层实体
- [ ] 提供 `GET /api/tasks/:taskId/team`
- [ ] lead 与 members 在 Web 中有清晰分层
- [ ] member card 显示 role、agent、branch、worktree、status、summary
- [ ] 提供 cancel 入口
- [ ] 提供 reassign 入口
- [ ] 提供 change-agent 入口
- [ ] team 读取不破坏 task / subtask 状态机
- [ ] task reload 后 team 视图可恢复

## Phase 18 Checklist

- [ ] plan node 已升级为 role-aware DAG 结构
- [ ] plan node 包含 `role`
- [ ] plan node 包含 `deliverable`
- [ ] plan node 包含 `acceptance_criteria`
- [ ] plan node 支持 `template_hint`
- [ ] lead planning 输出契约与新 plan schema 一致
- [ ] 校验逻辑覆盖 DAG 环检测
- [ ] `PLAN_REVIEW` 提供 graph/list 双视图
- [ ] 支持 `POST /api/tasks/:taskId/plan-seed`
- [ ] template seed -> plan review -> approval 全链路可验证

## Phase 19 Checklist

- [ ] mailbox 已支持 typed message schema
- [ ] mailbox 已支持 `artifactRefs`
- [ ] mailbox 已支持 `fileRefs`
- [ ] mailbox 已支持 `branchRef`
- [ ] mailbox 已支持 `schemaJson`
- [ ] mailbox 已支持 `requiresAck`
- [ ] 支持 `subtask -> lead`
- [ ] 支持 `subtask -> subtask`
- [ ] worker prompt 注入按类型裁剪
- [ ] mailbox 继续保持 append-only

## Phase 20 Checklist

- [ ] 提供 `GET /api/tasks/:taskId/board`
- [ ] 提供 graph mode
- [ ] 提供 list mode
- [ ] 提供 activity stream
- [ ] action-required 队列集中可见
- [ ] blocker / mailbox / review / integration 风险已聚合
- [ ] board-first 成为执行阶段默认关注面
- [ ] operator 可从 board 直接执行主要干预动作
- [ ] mixed-state task 可被稳定渲染
- [ ] clarification 阶段未被错误改成 board-first

## Phase 21 Checklist

- [ ] 引入显式 `IntegrationRun`
- [ ] 引入显式 `IntegrationQueueItem`
- [ ] 引入显式 `GateResult`
- [ ] 提供 `POST /api/tasks/:taskId/integration-runs`
- [ ] 提供 integration retry
- [ ] 提供 integration rollback
- [ ] 提供 integration queue dequeue
- [ ] accepted subtasks 先进入 integration queue / branch
- [ ] gate failure 不污染 base branch
- [ ] integration branch -> gate -> base branch 全链路可验证

## Phase 22 Checklist

- [ ] 内建 templates 已稳定可用
- [ ] 提供 `POST /api/guided-tasks`
- [ ] guided task creation flow 可作为黄金路径入口
- [ ] 提供 full-stack Todo 黄金路径
- [ ] 提供 backend API 黄金路径
- [ ] 提供 frontend feature 黄金路径
- [ ] preview studio 关键状态可解释
- [ ] 空态 / 错误态 / 阻塞态文案已补齐
- [ ] 有 demo playbook 或 demo dataset
- [ ] guided flow E2E 可复现

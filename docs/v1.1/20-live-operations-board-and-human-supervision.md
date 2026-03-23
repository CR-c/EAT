# Phase 20 - Live Operations Board And Human Supervision

## Goal

把执行态主界面提升为真正的 live operations board，让操作者持续监督整个 agent team，而不是只盯单个 subtask 或 transcript。

## PRD Coverage

本阶段主要落实：

- 执行阶段 board-first
- live operations board
- action-required 聚合
- team、mailbox、review、merge 风险统一可见

## Preconditions

- phase `17` 已有 team / member 骨架
- phase `18` 已有 role-aware DAG
- phase `19` 已有结构化 mailbox

## Deliverables

- task 内 live board 视图
- graph / list / activity 三类运行视图
- action-required queue
- blocker、review、merge 风险聚合
- operator controls 的统一入口

## Suggested Execution Order

1. 统一构建 board snapshot 读取模型。
2. 聚合 sessions、subtasks、mailbox、reviews、integration 风险。
3. 提供 graph / list / activity 多视图 UI。
4. 提供 action-required queue 和 operator controls。
5. 增加排序、过滤和 mixed-state 测试。

## Schema And Persistence

本阶段原则上不新增核心实体。  
重点是复用并聚合已有对象：

- `Task`
- `SubTask`
- `AgentSession`
- `MailboxMessage`
- `ReviewRecord`
- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`

## API And Event Surface

建议或要求具备：

- `GET /api/tasks/:taskId/board`
- `GET /api/tasks/:taskId/team`
- `GET /api/tasks/:taskId/events`

推荐事件：

- `task:status`
- `subtask:status`
- `session:started`
- `session:ended`
- `mailbox:message`
- `merge:*`
- `integration:*`

## Backend Tasks

- 提供稳定的 board snapshot，而不是让前端自行拉平所有记录。
- 聚合出当前最值得干预的 action-required 项。
- 为 mixed-state task 生成一致的排序和 summary 结果。

## UI Tasks

- 默认执行界面从 transcript-first 切到 board-first。
- graph mode 显示节点、边、依赖和阻塞。
- list mode 显示成员清单、状态和最近摘要。
- activity mode 显示 session、mailbox、review、merge、integration 事件流。
- action-required queue 要优先露出：
  - `REWORK_REQUIRED`
  - `DISCARD_PENDING`
  - merge conflict
  - failed launch
  - unresolved blocker

## Integration Tasks

- board 中的 operator actions 应直接调用已有任务 / subtask API。
- mailbox 和 review 状态必须能在 board 中联动显示。

## Edge Cases

- 没有运行中成员时，board 仍需可解释地显示 idle 或 waiting 状态。
- mixed-state task 中，排序不能让真正需要处理的项被埋掉。
- clarification 阶段保留 transcript-first，不应强行套用 board-first。

## Acceptance Checklist

- 用户能在一个界面识别 team 当前运行态。
- action-required 项集中可见。
- DAG 状态和 mailbox / review 活动联动。
- operator 可从 board 执行主要干预动作。

## Suggested Tests

- board snapshot 渲染测试。
- mixed-state task 的 UI 快照测试。
- action-required 排序测试。
- activity stream 事件聚合测试。

## Outputs For Next Phase

完成后，phase `21` 可以在 board 的收口视图上继续推进 integration branch、queue 和 release gate。

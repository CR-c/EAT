# Phase 21 - Integration Branch, Merge Queue And Release Gates

## Goal

把任务结果从“多个 accepted subtasks”推进为“可审计、可验证、可回滚的集成流程”。

## PRD Coverage

本阶段主要落实：

- integration branch
- integration run
- integration queue
- release gate
- retry / rollback / dequeue

## Preconditions

- phase `11` 和 `12` 已提供 review 与 merge 主干
- phase `20` 已提供 board 与 action-required 汇聚

## Deliverables

- integration branch 生命周期
- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`
- queue / gate / result UI
- integration failure -> action required 恢复流

## Suggested Execution Order

1. 落地 integration run 及其状态机。
2. 落地 integration queue item。
3. 落地 gate result 持久化。
4. 在 task 收口阶段接入 queue / gate 逻辑。
5. 提供 retry、rollback、dequeue 操作入口。

## Schema And Persistence

本阶段应使用或引入：

- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`
- `integrationBranch`

约束：

- queue 必须是显式对象，不能只存在内存顺序
- gate 结果必须持久化
- integration 历史必须 append-only

## API And Event Surface

建议或要求具备：

- `POST /api/tasks/:taskId/integration-runs`
- `POST /api/integration-runs/:integrationRunId/retry`
- `POST /api/integration-runs/:integrationRunId/rollback`
- `POST /api/integration-queue-items/:integrationQueueItemId/dequeue`

推荐事件：

- `integration:queued`
- `integration:started`
- `integration:gate-result`
- `integration:completed`
- `integration:failed`

## Backend Tasks

- accepted subtasks 进入 integration queue，而不是直接隐式合并。
- integration branch 作为技术收口面，而不是替代 task mainline。
- final review 与 release gate 分离表达。
- gate 失败时把 task 转入 `ACTION_REQUIRED`。

## UI Tasks

- 显示 integration runs 列表和当前 run。
- 显示 queue 顺序、queue item 状态和 merged commit。
- 显示 gate 结果、失败摘要和恢复操作。
- 在 board 中让 integration 风险成为可见的操作项。

## Integration Tasks

- integration branch 通过后，再进入 base branch 的最终收口。
- rollback、retry、dequeue 语义必须与 task status 联动。

## Edge Cases

- gate 失败不能污染 base branch。
- 已完成部分 queue item 后失败，必须支持部分成功状态。
- actionable queue item 被 dequeue 后，需要在 UI 中留下清晰痕迹。
- final review 通过不代表 release gate 自动通过。

## Acceptance Checklist

- accepted subtasks 可进入 integration branch 与 queue。
- gate 失败不会污染 base branch。
- Web 中可见 queue、gate 和 result。
- 用户可 retry、rollback 或 dequeue。

## Suggested Tests

- merge queue 顺序测试。
- gate fail / retry 测试。
- rollback 流程测试。
- integration branch -> base branch 收口测试。

## Outputs For Next Phase

完成后，phase `22` 可以围绕模板、guided flow、demo scenario 和 operator polish 打磨黄金路径。

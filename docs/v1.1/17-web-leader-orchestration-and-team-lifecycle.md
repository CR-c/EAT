# Phase 17 - Web Leader Orchestration And Team Lifecycle

## Goal

把已有的任务执行主干提升为明确的 Web-first orchestration shell，让 task 在 UI 上不再只是“一个详情页”，而是能呈现 lead、team members、成员生命周期和常见编排操作的监督界面。

## PRD Coverage

本阶段主要落实 `PRD v4.0` 中这些要求：

- Web-first operator experience
- task 内 team / member 视图
- `SubTask` 作为 team member 的持久化表达
- 执行阶段 board-first 的前置骨架
- 单成员编排入口：cancel、reassign、change-agent

## Preconditions

- phase `01` 到 `16` 已提供 task / subtask / session 主干能力
- task 可以进入 `EXECUTING`
- `SubTask` 已能承载 branch、worktree、agent、status 等执行字段

## Deliverables

- task 级 `team` 读取模型
- `SubTask` 的 team-member 化展示字段
- `GET /api/tasks/:taskId/team`
- UI 中 lead card、member list、team summary
- 面向单成员的常见控制入口

## Suggested Execution Order

1. 补齐 `SubTask` 的 team 展示字段和默认值。
2. 提供 task team 聚合读取接口。
3. 在 task detail / workspace 中加入 team shell。
4. 接入 cancel、reassign、change-agent 等操作入口。
5. 增加 team 相关事件与测试。

## Schema And Persistence

本阶段应使用或引入这些字段：

- `SubTask.role`
- `SubTask.displayName`
- `SubTask.executionOrder`
- `SubTask.assignmentSource`
- `SubTask.runSummary`

约束：

- 不新增独立 `Team` 顶层实体
- 一个 `Task` 仍代表一次 orchestration run
- `SubTask` 继续是执行单元，只是在 UI 上表现为 team member

## API And Event Surface

建议或要求具备：

- `GET /api/tasks/:taskId/team`
- `POST /api/subtasks/:subTaskId/cancel`
- `POST /api/subtasks/:subTaskId/reassign`
- `POST /api/subtasks/:subTaskId/change-agent`

推荐事件：

- `team:updated`
- `subtask:status`
- `session:started`
- `session:ended`

## Backend Tasks

- 统一构建 task team view，而不是由 UI 端自行拼装成员状态。
- 为 `SubTask` 生成稳定的默认 `displayName` 和 `runSummary`。
- 将成员排序、角色、当前 session 状态聚合成单次读取结果。
- 保证 team 读取不会破坏原有 task / subtask 状态机。

## UI Tasks

- 在 workspace 中提供明确的 team 区域，而不是只显示 subtask 原始列表。
- 视觉上分离 lead 与 worker members。
- 每个 member card 至少展示：
  - role
  - agent
  - branch
  - worktree
  - status
  - latest summary
- 支持从 Web 直接发起常见单成员操作。

## Integration Tasks

- team 视图应与 task detail、board、mailbox 后续能力兼容。
- task reload 后必须恢复 team 状态，而不是依赖临时内存。

## Edge Cases

- member 尚未物化 branch / worktree 时，仍需稳定显示占位状态。
- member 被取消、改派或换 agent 后，team summary 必须同步更新。
- 没有 worker、只有 lead 的 task，也必须有可解释的 team 空态。
- 不得把“显示层 team”错误实现为“跨 task 可复用 team 实体”。

## Acceptance Checklist

- 用户可在 Web 中识别 lead 和全部成员。
- 每个成员的 agent、branch、worktree 和 status 可见。
- 常见单成员操作不依赖命令行。
- team 视图不会改写基础状态机语义。

## Suggested Tests

- team API 返回排序、角色和成员摘要。
- cancel / reassign / change-agent 的 API 流程测试。
- task reload 后 team 视图恢复测试。
- mixed-state members 的 UI 快照测试。

## Outputs For Next Phase

完成后，phase `18` 可以在稳定的 team/member 骨架上继续引入 role-aware DAG 与 plan seed。

# Phase 19 - Structured Mailbox, Contracts And Artifact Handoff

## Goal

把 phase `16` 的基础 mailbox 升级为结构化、可追踪、可注入 prompt 的 handoff 层，用于真实 team 协作。

## PRD Coverage

本阶段主要落实：

- typed mailbox / handoff
- append-only mailbox history
- `artifactRefs` / `fileRefs` / `branchRef` / `schemaJson` / `requiresAck`
- subtask -> lead 与 subtask -> subtask 协作
- prompt 注入按类型裁剪

## Preconditions

- phase `16` 已提供 task-scoped mailbox 主干
- phase `17` 和 `18` 已提供 team members 与 role-aware DAG

## Deliverables

- 扩展后的 mailbox message schema
- contract-aware mailbox API
- inbox / outbox / contracts / blockers UI
- worker prompt 的 handoff 注入策略
- artifact reference rendering

## Suggested Execution Order

1. 扩展 mailbox message 持久化结构。
2. 支持 typed message 的发送、读取和分组。
3. 升级 prompt 注入逻辑。
4. 在执行界面提供 contracts / blockers / outbox 视图。
5. 增加手动发送结构化消息的表单和测试。

## Schema And Persistence

本阶段应使用或引入这些字段：

- `messageType`
- `artifactRefs`
- `fileRefs`
- `branchRef`
- `schemaJson`
- `requiresAck`

消息类型至少包括：

- `NOTE`
- `BLOCKER`
- `DELIVERABLE_READY`
- `API_CONTRACT`
- `DB_CONTRACT`
- `TEST_REQUEST`
- `REVIEW_REQUEST`

约束：

- mailbox 继续 append-only
- 必须保留 sender、target、type 和引用上下文

## API And Event Surface

建议或要求具备：

- `POST /api/tasks/:taskId/mailbox`
- task detail / board 读取中包含 mailbox messages

推荐事件：

- `mailbox:message`
- `team:updated`

## Backend Tasks

- 为 mailbox 增加 typed payload 的校验和规范化。
- 支持 lead、subtask、system 三类 sender。
- 支持 lead 与 subtask 两类 target。
- 按消息类型生成 prompt-ready handoff 摘要，而不是盲目拼接全文。
- 保持 mailbox 记录可以在 task reload 后完整恢复。

## UI Tasks

- 在 execution panel 中分开展示：
  - inbox
  - outbox
  - contracts
  - blockers / requests
- 提供手动发送结构化消息表单。
- 支持 artifact refs、file refs、branch ref 和 schema 的查看。

## Integration Tasks

- structured mailbox 必须和 board 中的 blocker 聚合联动。
- downstream worker 获取的 handoff 内容应与其 target 身份一致。

## Edge Cases

- subtasks 不能给自己发消息。
- schemaJson 非法时必须阻止提交。
- 非执行态 task 不应开放 mailbox 写入口。
- 大量 mailbox 文本不应直接全部进入 worker prompt。

## Acceptance Checklist

- subtask 可以给 lead 发结构化消息。
- subtask 可以给其他 subtask 发结构化消息。
- downstream prompt 能收到按类型裁剪的 handoff。
- Web 中可追踪 handoff 链路和 artifact 引用。

## Suggested Tests

- typed mailbox payload persistence 测试。
- API contract handoff -> downstream prompt injection 测试。
- subtask -> lead blocker 流程测试。
- artifact refs / file refs reload correctness 测试。

## Outputs For Next Phase

完成后，phase `20` 可以把 mailbox、review、session 和 dependency 状态统一汇聚到 live operations board。

# EAT v1.1 Prisma Migration Plan

本文件描述 v1.1 路线下建议的 schema rollout。  
目标不是一次性把全部字段提前打满，而是给每个 phase 提供“足够但不激进”的迁移节奏。

## Migration Strategy

- 优先 additive migration
- 尽量复用现有 `Task` / `SubTask` / `AgentSession` 结构
- 需要 append-only 历史时，不要用 mutable 覆盖字段替代历史表
- 如果字段暂时只用于 UI 展示，可先允许 nullable，再在后续 phase 收紧

## Phase 17

### New Or Changed Models

- `SubTask`

### Fields

- `role?`
- `display_name?`
- `execution_order?`
- `assignment_source?`
- `run_summary?`

### Notes

- 这一阶段不建议新增独立 `Team` 表
- `SubTask` 继续作为执行单元，新增字段只为支撑 Web leader orchestration 视图

## Phase 18

### New Or Changed Models

- `Task`
- `PlanSnapshot`

### Fields

#### `Task`

- `current_plan_graph_json?`
- `approved_plan_graph_json?`

#### `PlanSnapshot`

- `graph_payload?`

### Notes

- 如果决定继续只用 `currentPlanJson` / `approvedPlanJson` 承载 graph，也可以不单独建字段
- 但建议至少为 graph-ready payload 预留明确命名，避免 list plan 与 DAG plan 混淆

## Phase 19

### New Or Changed Models

- `MailboxMessage`

### Fields

- `message_type`
- `artifact_refs_json @default('[]')`
- `file_refs_json @default('[]')`
- `branch_ref?`
- `schema_json?`
- `requires_ack @default(false)`

### Notes

- 保持 append-only
- typed mailbox 应优先在现有 `mailbox_messages` 表上扩展，而不是拆出多张弱表

## Phase 20

### New Or Changed Models

- Optional only

### Optional Fields / Models

- `TaskActivity` optional append-only table if query-based board rendering becomes too expensive

### Notes

- 如果 board 可通过现有事件和持久化数据推导，不强制迁移
- 不要为了 board 视图过早建立高冗余聚合表

## Phase 21

### New Or Changed Models

- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`

### Fields

#### `IntegrationRun`

- `taskId`
- `integrationBranch`
- `status`
- `startedAt`
- `endedAt?`

#### `IntegrationQueueItem`

- `integrationRunId`
- `subTaskId`
- `queueOrder`
- `status`

#### `GateResult`

- `integrationRunId`
- `gateType`
- `status`
- `summary`
- `detailsJson?`
- `createdAt`

### Notes

- 这一阶段建议引入独立表，而不是把 integration 状态塞回 `Task`
- merge queue 与 gate result 都是 append-only / history-sensitive 对象

## Phase 22

### New Or Changed Models

- Optional only

### Optional Models

- `TaskTemplate`
- `DemoScenario`

### Notes

- 若模板先以内置静态配置实现，则可不做 migration
- 若要支持模板管理 UI，再考虑持久化 `TaskTemplate`

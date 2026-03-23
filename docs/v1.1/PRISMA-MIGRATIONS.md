# EAT Extended Phase Schema Rollout Notes

## 文档定位

这个文件说明扩展阶段 `17` 到 `22` 的数据层 rollout 策略。  
它沿用历史命名 `PRISMA-MIGRATIONS.md`，但当前仓库的真实运行时并不是 Prisma Client。

当前实际情况：

- 运行时数据库访问使用 `node:sqlite`
- schema rollout 依赖 `prisma/migrations/` 中的 SQL migration
- `prisma/schema.prisma` 主要是参考性 schema 描述，不应被视为唯一运行时真相
- 当 `schema.prisma` 与 repository / SQL migrations 冲突时，以运行时 repository 和已落地 migration 为准

## Rollout Principles

- 优先 additive migration
- 能复用现有对象时，不额外发明顶层实体
- append-only history 不应用可变覆盖字段替代
- 如果字段只为展示层服务，可以先 nullable，再在稳定后收紧
- 若扩展阶段文档描述的对象已经进入仓库实现，后续 migration 设计应与当前 repository 字段命名保持一致

## Phase 17

### Target Objects

- `SubTask`

### Expected Fields

- `role`
- `display_name`
- `execution_order`
- `assignment_source`
- `run_summary`

### Notes

- 不新增独立 `Team` 表
- `SubTask` 继续作为执行单元和 member 持久化对象

## Phase 18

### Target Objects

- `Task`
- `PlanSnapshot`

### Expected Strategy

优先继续复用：

- `current_plan_json`
- `approved_plan_json`
- `plan_snapshots.payload`

### Notes

- 当前更推荐把 role-aware DAG 继续编码在现有 plan JSON 中，而不是额外引入 `current_plan_graph_json` / `approved_plan_graph_json`
- 只有在 plan payload 无法继续承载 graph 结构时，才考虑单独迁移字段

## Phase 19

### Target Objects

- `MailboxMessage`

### Expected Fields

- `message_type`
- `artifact_refs_json`
- `file_refs_json`
- `branch_ref`
- `schema_json`
- `requires_ack`

### Notes

- typed mailbox 应优先在现有 `mailbox_messages` 表上扩展
- 不要把 mailbox 拆成多张弱关联子表

## Phase 20

### Target Objects

- Optional only

### Notes

- board 优先通过现有 task / subtask / session / mailbox / review / integration 数据聚合得出
- 不要为了 board 视图过早引入高冗余聚合表
- 如果查询成本未来不可接受，再考虑 append-only `TaskActivity` 一类的派生表

## Phase 21

### Target Objects

- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`

### Expected Fields

#### `IntegrationRun`

- `task_id`
- `integration_branch`
- `status`
- `started_at`
- `ended_at`
- `created_at`
- `updated_at`

#### `IntegrationQueueItem`

- `integration_run_id`
- `sub_task_id`
- `queue_order`
- `status`
- `merged_commit_sha`
- `created_at`
- `updated_at`

#### `GateResult`

- `integration_run_id`
- `gate_type`
- `status`
- `summary`
- `details_json`
- `created_at`

### Notes

- integration run、queue item、gate result 都应保持独立对象层
- 不要把 integration 结果塞回 `Task` 上的几个 mutable 字段

## Phase 22

### Target Objects

- Optional only

### Notes

- built-in templates 可以继续用静态配置，不强制持久化
- guided flow 不强制新增表
- 只有在需要模板管理 UI、模板版本控制或 demo scenario 管理时，才考虑新增：
  - `TaskTemplate`
  - `DemoScenario`

## Maintenance Rule

每次扩展阶段涉及 schema 讨论时，按以下顺序核对：

1. `docs/PRD.md`
2. `src/repositories/*`
3. `prisma/migrations/*`
4. `prisma/schema.prisma`

不要反过来只看 `schema.prisma` 就推导新 migration。

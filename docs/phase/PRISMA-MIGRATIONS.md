# EAT Foundation Phase Schema Rollout Notes

## 文档定位

这个文件说明基础阶段 `01` 到 `16` 的数据层 rollout 策略。  
它沿用历史命名 `PRISMA-MIGRATIONS.md`，但当前仓库运行时并不是 Prisma Client。

当前实际情况：

- 运行时数据库访问使用 `node:sqlite`
- schema rollout 依赖 `prisma/migrations/` 中的 SQL migration
- `prisma/schema.prisma` 是参考性描述，不是唯一运行时真相
- 当 `schema.prisma` 与 repository / SQL migrations 冲突时，以运行时 repository 和已落地 migration 为准

## Rollout Principles

- 优先 additive migration
- 字段只有在服务端已能稳定写入后再从 nullable 收紧为 required
- 多个 phase 会共用的表，应在最早不可避免的阶段一次性引入
- append-only history 不应用 mutable 覆盖字段代替

## Phase 01

### Target Objects

- `Project`

### Expected Fields

- `id`
- `name`
- `path`
- `default_branch`
- `created_at`
- `updated_at`

## Phase 02

### Target Objects

- None required

### Notes

- agent registry 可以继续是 in-process 配置
- health snapshot 若未来要持久化，应作为单独扩展而不是 phase `02` 隐含要求

## Phase 03

### Target Objects

- `AgentSession` staged fields, optional

### Expected Fields

- `sandbox_type`
- `container_id`

### Notes

- 如果 `AgentSession` 在 phase `04` 才正式引入，这两个字段可以合并进 phase `04` 的初始 migration

## Phase 04

### Target Objects

- `Task`
- `Message`
- `Attachment`
- `AgentSession`

### Expected Fields

#### `Task`

- `project_id`
- `title`
- `description`
- `lead_agent_type`
- `base_branch`
- `base_commit_sha`
- `status`
- `created_at`
- `updated_at`

#### `Message`

- `task_id`
- `sub_task_id`
- `role`
- `content`
- `created_at`

#### `Attachment`

- `task_id`
- `file_name`
- `file_path`
- `file_type`
- `mime_type`
- `size`
- `created_at`

#### `AgentSession`

- `task_id`
- `sub_task_id`
- `agent_type`
- `session_type`
- `sandbox_type`
- `container_id`
- `status`
- `pid`
- `started_at`
- `ended_at`
- `exit_code`
- `log_path`
- `output_buffer`
- `output_buffer_max_bytes`
- `created_at`
- `updated_at`

## Phase 05

### Target Objects

- `Task`
- `PlanSnapshot`

### Expected Fields

#### `Task`

- `plan_version`
- `current_plan_json`

#### `PlanSnapshot`

- `task_id`
- `version`
- `source`
- `payload`
- `created_at`

## Phase 06

### Target Objects

- No required new tables

### Notes

- `RESTORED_FROM_HISTORY` 优先作为 `PlanSnapshot.source` 的值扩展，而不是单独新增结构

## Phase 07

### Target Objects

- `Task`
- `SubTask`

### Expected Fields

#### `Task`

- `approved_plan_json`
- `task_branch_name`

#### `SubTask`

- `task_id`
- `title`
- `description`
- `branch_suffix`
- `branch_name`
- `worktree_path`
- `agent_type`
- `status`
- `auto_assigned`
- `retry_count`
- `last_error`
- `created_at`
- `updated_at`

### Notes

- `branch_name` 与 `worktree_path` 在 setup 成功前可为空
- `task_branch_name` 指向 task mainline branch

## Phase 08

### Target Objects

- `SubTask`
- `AgentSession`

### Optional / Confirmed Fields

#### `SubTask`

- `branch_name`
- `worktree_path`
- `retry_count`

#### `AgentSession`

- `sub_task_id`
- `log_path`
- `output_buffer`
- `output_buffer_max_bytes`

### Notes

- 如果 phase `04` 和 `07` 已把这些字段一次性建完，本阶段可能不需要新增 migration

## Phase 09

### Target Objects

- Usually none

### Notes

- 避免为了流式输出过早引入逐块日志表
- 优先使用 filesystem log + tail buffer

## Phase 10

### Target Objects

- `ReviewRecord`
- `SubTask`

### Expected Fields

#### `ReviewRecord`

- `sub_task_id`
- `session_id`
- `phase`
- `decision`
- `summary`
- `created_at`

#### `SubTask`

- `latest_review_decision`
- `latest_review_phase`
- `latest_review_summary`

## Phase 11

### Target Objects

- Usually none beyond phase `10`

### Notes

- phase `11` 重点是使用 final review，不一定需要额外 migration

## Phase 12

### Target Objects

- `MergeRecord`

### Expected Fields

- `sub_task_id`
- `attempt_number`
- `operation`
- `source_branch`
- `target_branch`
- `status`
- `result_commit_sha`
- `conflict_summary`
- `completed_at`
- `created_at`
- `updated_at`

## Phase 13

### Target Objects

- Usually none

### Notes

- cleanup warning 优先通过 task log / message 体系表达
- 不强制新增 cleanup 历史表

## Phase 14

### Target Objects

- Usually none

### Notes

- 指标优先通过 query 持久化数据得出，不额外引入 analytics pipeline

## Phase 15

### Target Objects

- `SubTask`

### Expected Fields

- `dependency_branch_suffixes_json`

### Notes

- 对基础阶段，JSON 持久化依赖关系已足够
- 规范化 edge table 可留给后续扩展

## Phase 16

### Target Objects

- `MailboxMessage`

### Expected Fields

- `task_id`
- `sender_type`
- `sender_sub_task_id`
- `target_type`
- `target_sub_task_id`
- `content`
- `created_at`

### Notes

- 基础阶段 mailbox 可先保持最小模型
- typed mailbox 字段由扩展阶段 `19` 继续补齐

## Maintenance Rule

每次基础阶段涉及 schema 讨论时，按以下顺序核对：

1. `docs/PRD.md`
2. 当前运行时 repository 实现（Go 主路径下通常为 `backend/internal/store/`、`backend/internal/project/`、`backend/internal/task/`；历史实现可参考 `src/repositories/*`）
3. `prisma/migrations/*`
4. `prisma/schema.prisma`

不要反过来只看 `schema.prisma` 就推导新 migration。

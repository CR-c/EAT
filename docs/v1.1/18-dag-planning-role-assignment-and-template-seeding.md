# Phase 18 - DAG Planning, Role Assignment And Template Seeding

## Goal

把计划从“可执行子任务列表”升级为“可审阅、可编辑、带角色语义和依赖图的 team execution DAG”。

## PRD Coverage

本阶段主要落实：

- role-aware DAG planning
- `currentPlanJson` / `approvedPlanJson` 的 plan contract 扩展
- template seed 与 guided flow 的计划层入口
- plan validation 中对 role、deliverable、acceptance criteria 的约束

## Preconditions

- phase `05` 和 `06` 已提供 plan generation / review / snapshot
- phase `17` 已提供 team member 骨架

## Deliverables

- 扩展后的 plan node schema
- lead 输出 role-aware DAG 的约束
- graph/list 双视图 plan review
- template seed 系统
- 更严格的 plan validation 规则

## Suggested Execution Order

1. 扩展 plan node schema 和校验逻辑。
2. 升级 lead planning prompt 输出契约。
3. 接入 template seed 与 guided flow 的计划骨架。
4. 实现 graph/list 双视图 plan review。
5. 校验 approval 后的 materialized subtasks 与 DAG 一致。

## Schema And Persistence

每个 plan node 至少应支持：

- `title`
- `description`
- `recommended_agent`
- `branch_suffix`
- `role`
- `deliverable`
- `acceptance_criteria`
- `depends_on`
- `template_hint`

可选字段可继续扩展，但不得削弱上面这些字段的必填要求。

## API And Event Surface

建议或要求具备：

- `PUT /api/tasks/:taskId/current-plan`
- `POST /api/tasks/:taskId/plan-seed`
- `POST /api/tasks/:taskId/approve-plan`
- `POST /api/tasks/:taskId/restore-plan-snapshot`

推荐事件：

- `task:plan-generated`
- `task:plan-restored`
- `task:status`

## Backend Tasks

- 扩展 plan parser 和 validator，覆盖 DAG 语义。
- 对 `role`、`deliverable`、`acceptance_criteria` 增加非空校验。
- 对 `depends_on` 进行环检测。
- 在 approval 时把 plan node 正确映射为 `SubTask` 字段。
- 保留 `planVersion` 与 `PlanSnapshot` 语义不变。

## UI Tasks

- plan review 不再只停留在列表编辑。
- 提供 graph/list 双视图。
- 允许编辑 role、deliverable、acceptance criteria、dependency。
- 支持从模板初始化 plan seed。
- 清楚区分 lead 生成内容与 operator 编辑内容。

## Integration Tasks

- guided task creation 进入计划阶段时，应直接落到统一 plan schema。
- team view 中的 member role 应与 approved plan 一致。

## Edge Cases

- 模板只能作为 seed，不能绕过审批。
- 单节点 plan 仍然合法，但必须满足 role 和 deliverable 要求。
- 编辑后若形成依赖环，系统必须阻止批准。
- 历史 plan snapshot 恢复后，不得污染 `approvedPlanJson`。

## Acceptance Checklist

- lead 能生成包含 role 和 DAG 的计划。
- operator 可在 Web 中编辑依赖和角色字段。
- template seed 能作为起点，但不会绕过 `PLAN_REVIEW`。
- approved plan 与 materialized subtasks 保持一致。

## Suggested Tests

- DAG 解析与环检测测试。
- template seed -> lead refine -> approval 全链路测试。
- UI graph 编辑后的再校验测试。
- approval 后 subtask 字段映射测试。

## Outputs For Next Phase

完成后，phase `19` 可以在 role-aware DAG 的基础上，为节点之间引入结构化协作合同和 artifact handoff。

# Phase 18 - DAG Planning, Role Assignment And Template Seeding

## 目标

让 lead agent 生成的不再只是“子任务列表”，而是一个真正可编辑的 team execution DAG。

这一阶段完成后，用户在 Web 中应当可以看到并编辑：

- role
- owner agent
- dependency DAG
- deliverable
- acceptance criteria
- 推荐模板种子

## 这阶段解决什么问题

当前 plan 已经支持 `depends_on`，但还不够像一个可操作的 team plan：

- 只有 subtask 层，没有 role 语义
- 缺少交付物定义
- 缺少验收标准
- 缺少模板化脚手架
- 缺少 DAG 级可视化编辑

这导致 lead 虽然能拆任务，但对用户来说还不像“一个可以在 Web 中审阅和调整的编排图”。

## 范围

本阶段内：

- 将 plan 草案升级为 DAG draft
- 为每个节点增加 role / deliverable / acceptance 字段
- 提供 DAG 编辑 UI
- 为常见任务提供 plan seed/template

本阶段外：

- 富合同 handoff
- 多任务看板
- 集成分支和 merge queue

## 借鉴 ClawTeam 的点

可借鉴：

- leader 先生成角色化分工
- 再基于依赖图派发 specialist
- 对常见任务提供 team 模板感知

不直接照搬：

- 不把模板当成黑盒自动执行器
- 模板只能作为 planning seed，最终仍由用户审阅批准

## 交付物

- DAG plan schema
- lead prompt 升级：要求输出 role-aware DAG
- Web DAG 编辑器
- 模板种子系统
- 计划验证规则扩展

## 建议 schema 扩展

对每个 plan item / subtask 增加：

- `role`
- `deliverable`
- `acceptance_criteria`
- `estimated_scope`
- `template_hint`

建议保留：

- `branch_suffix`
- `recommended_agent`
- `depends_on`

## 模板策略

模板不应直接等于固定计划，而应分为两层：

### 1. Task template

例如：

- full-stack web app
- backend API service
- frontend refactor
- bugfix hotpatch
- docs / release task

### 2. Plan seed

模板只提供默认 DAG 骨架，例如：

- architect
- backend
- database
- frontend
- tester

lead agent 仍需要基于用户输入细化每个节点内容。

## UI 任务

- plan review 区从 list 进化为 graph/list 双视图
- 支持拖拽调整依赖
- 支持编辑 role / deliverable / acceptance
- 支持从模板初始化 plan seed
- 清楚标注哪些字段是 lead 生成、哪些字段是用户改过的

## 验证规则

除现有规则外，增加：

- role 不能为空
- deliverable 不能为空
- acceptance 不能为空
- 依赖不得形成环
- 叶子节点必须可被验证或审查

## 测试与验收

验收标准：

- lead 能生成包含角色与 DAG 的 plan
- 用户可在 Web 中调整角色和依赖
- 模板可作为起点，但不绕过审批
- plan 审批后 materialized subtasks 与 DAG draft 保持一致

建议测试：

- DAG 解析与环检测
- 模板 seed -> lead refine -> approval 全链路
- UI graph 编辑后的再校验

## 输出给下一阶段

phase 19 将基于 role-aware DAG，把 handoff 从“文本 note”升级为“结构化协作合同”。

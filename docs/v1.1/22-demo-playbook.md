# Phase 22 Demo Playbook

## 目标

提供一条稳定、可复现、可讲解的 `v1.1` 演示路径，突出：

- Web-first orchestration
- real Codex CLI multi-agent execution
- role-aware DAG planning
- structured mailbox handoff
- live supervision
- safe integration gates

## 推荐演示场景

### 1. Full-stack Todo

推荐模板：`full-stack-web-app`

推荐标题：

`全栈 Todo 应用`

推荐描述：

`做一个全栈 Todo 应用，包含认证、数据库和 React 前端。请拆成 architect、backend、database、frontend、tester、integration 六个角色，并给出明确交付物与验收标准。`

### 2. Backend API

推荐模板：`backend-api`

推荐标题：

`后端 API 服务`

推荐描述：

`实现一个带数据库访问层和发布验证清单的后端 API 服务。`

### 3. Frontend Feature

推荐模板：`frontend-feature`

推荐标题：

`前端功能开发`

推荐描述：

`完成一个 React 前端功能，从交互设计到接口接线与验收验证。`

## 演示步骤

1. 注册 demo 仓库并确认 Docker sandbox 与 lead agent 健康。
2. 在创建区选择黄金路径模板。
3. 用推荐标题和描述创建 guided task。
4. 展示任务直接进入 `PLAN_REVIEW`，说明“模板降低首次成功门槛，但没有绕过审批边界”。
5. 在 DAG 视图中检查角色、依赖、deliverable 和 acceptance criteria。
6. 批准计划，展示 team lifecycle、operations board 和 mailbox。
7. 等待执行收敛到 `MERGING`。
8. 显式启动 integration run。
9. 展示 queue、gate result、integration completion。
10. 在任务详情中展示最终 merge / integration 结果。

## 演示讲解重点

- 模板不是黑盒自动化，而是降低第一次成功门槛。
- 计划仍然可编辑，审批仍然必须显式发生。
- worker 仍然在 Docker sandbox + 独立 worktree 中运行。
- handoff、风险聚合、merge queue 和 gate 都在 Web 中可见。
- integration run 是显式触发的，所以 release gate 和 final review 被分开表达。

## 建议准备项

- 确保本机 `codex-cli` 已完成认证。
- 准备一个干净的 demo 仓库或可重复初始化的样例目录。
- 提前验证 Docker 可用。
- 如果要演示 gate failure / retry，提前准备一个会故意失败一次的 gate runner。

# EAT API Reference

这份文档只描述当前主干已经存在的 HTTP 资源面，用于开发与联调时快速查阅。

规则：

- 产品语义以 [PRD.md](/home/code/EAT/docs/PRD.md) 为准
- 最终实现以 [`backend/internal/api/router.go`](/home/code/EAT/backend/internal/api/router.go) 为准
- 响应字段、状态字段和持久化细节需要继续结合 repository 与 migration 核对

## 入口

- 根路径：`/`
- API 前缀：`/api`
- 实时事件：SSE，`GET /api/tasks/{taskId}/events`

## 项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/project-directories` | 浏览可注册目录 |
| POST | `/api/projects` | 注册项目 |
| GET | `/api/projects` | 获取项目列表 |
| GET | `/api/projects/{projectId}` | 获取项目详情 |
| DELETE | `/api/projects/{projectId}` | 删除项目 |
| GET | `/api/projects/{projectId}/repository-status` | 获取仓库状态 |
| PUT | `/api/projects/{projectId}/preferences` | 更新项目偏好 |
| GET | `/api/projects/{projectId}/tasks` | 获取项目任务列表 |

## Agent 与系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 获取 Agent 目录 |
| GET | `/api/agents/health` | 获取 Agent 健康状态 |
| GET | `/api/system/health` | 获取系统健康状态 |
| GET | `/api/system/execution-backends` | 获取当前 execution backend 列表与 readiness |
| GET | `/api/system/docker` | 获取 Docker 健康状态 |
| GET | `/api/system/sandbox-policy` | 获取当前沙箱策略 |
| GET | `/api/task-templates` | 获取任务模板列表 |
| GET | `/api/metrics/summary` | 获取指标摘要 |
| GET | `/api/metrics/export` | 导出指标明细 |

## 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/guided-tasks` | 引导式创建任务；支持可选 `workerBackendKind` / `executionProfile`（`default` / `isolated` / `internet` / `host-network`） |
| POST | `/api/tasks` | 创建任务；支持可选 `workerBackendKind` / `executionProfile`（`default` / `isolated` / `internet` / `host-network`） |
| GET | `/api/tasks/{taskId}` | 获取任务详情 |
| DELETE | `/api/tasks/{taskId}` | 删除任务 |
| GET | `/api/tasks/{taskId}/events` | 订阅任务事件流 |
| GET | `/api/tasks/{taskId}/team` | 获取任务团队视图 |
| GET | `/api/tasks/{taskId}/board` | 获取任务看板视图 |
| GET | `/api/tasks/{taskId}/runtime` | 获取任务运行时图谱 |
| GET | `/api/tasks/{taskId}/diff` | 获取任务差异 |
| GET | `/api/tasks/{taskId}/preview` | 获取预览状态 |
| POST | `/api/tasks/{taskId}/preview-sessions` | 启动预览 |
| DELETE | `/api/tasks/{taskId}/preview-sessions/current` | 停止当前预览 |
| POST | `/api/tasks/{taskId}/clarification-sessions` | 开始澄清会话 |
| POST | `/api/tasks/{taskId}/messages` | 发送任务消息 |
| DELETE | `/api/tasks/{taskId}/lead-sessions/current` | 结束当前 Lead 会话 |
| POST | `/api/tasks/{taskId}/requirement-confirmations` | 确认需求 |
| POST | `/api/tasks/{taskId}/mailbox-messages` | 发送 mailbox 消息 |
| PUT | `/api/tasks/{taskId}/plan` | 更新当前计划 |
| POST | `/api/tasks/{taskId}/plan-seeds` | 生成或补种计划 |
| POST | `/api/tasks/{taskId}/plan-approvals` | 批准计划 |
| POST | `/api/tasks/{taskId}/replan-requests` | 请求重新规划 |
| POST | `/api/tasks/{taskId}/archives` | 归档任务 |
| DELETE | `/api/tasks/{taskId}/archives/current` | 取消归档 |
| POST | `/api/tasks/{taskId}/pauses` | 暂停任务 |
| DELETE | `/api/tasks/{taskId}/pauses/current` | 恢复任务 |
| POST | `/api/tasks/{taskId}/integration-runs` | 发起集成运行 |
| POST | `/api/tasks/{taskId}/plan-snapshot-restores` | 恢复计划快照 |

## 子任务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/subtasks/{subTaskId}/retry-requests` | 重试子任务 |
| POST | `/api/subtasks/{subTaskId}/rework-requests` | 返工子任务 |
| POST | `/api/subtasks/{subTaskId}/cancellations` | 取消子任务 |
| POST | `/api/subtasks/{subTaskId}/reassignments` | 重新分派子任务 |
| POST | `/api/subtasks/{subTaskId}/agent-changes` | 更换执行 Agent |
| POST | `/api/subtasks/{subTaskId}/discard-confirmations` | 确认丢弃子任务结果 |
| POST | `/api/subtasks/{subTaskId}/rebase-retries` | rebase 后重试 |

## 集成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/integration-runs/{integrationRunId}/retry-requests` | 重试集成运行 |
| POST | `/api/integration-runs/{integrationRunId}/rollback-requests` | 回滚集成运行 |
| POST | `/api/integration-queue-items/{integrationQueueItemId}/dequeue-requests` | 将子任务移出集成队列 |

## 当前事件面

当前前端工作台显式消费的实时事件包括：

- `session:started`
- `session:output`
- `session:ended`
- `subtask:status`
- `task:status`
- `integration:queued`
- `integration:started`
- `integration:gate-result`
- `integration:completed`
- `integration:failed`

如需核对事件 payload，请直接查看当前 handler、service 与前端消费方实现。

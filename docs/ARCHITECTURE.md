# EAT 架构与实现总览

## 文档目的

这份文档解释仓库当前“已经实现的系统形态”。它不替代 `docs/PRD.md` 和 phase 文档；当实现说明与产品规范冲突时，以规范为准。

当前默认运行时已经收敛为：

- Go 后端
- React + Vite 前端
- SQLite 本地持久化
- Docker sandboxed worker execution

## 一句话定义

EAT 是一个本地优先、人工监督、以 Git 分支和 Docker 沙箱为执行边界的多 Agent 工程编排工作台。

标准路径是：

1. 注册本地 Git 项目
2. 创建任务并选定基线
3. 与 Lead Agent 澄清需求
4. 生成并审阅可编辑计划
5. 批准后物化为子任务
6. 在隔离分支、worktree、容器中执行 Worker
7. 进入审查、集成、合并与收口

## 当前实现覆盖面

从源码、migration 和测试可以确认的能力包括：

- 项目注册、路径浏览、仓库状态探测
- Agent 目录与健康检查
- Docker 健康检查和沙箱策略暴露
- Lead 会话、消息持久化、澄清到规划切换
- 计划草稿解析、校验、快照、恢复、审批
- 引导式建任务与计划模板
- 子任务记录物化、依赖调度、并发执行
- Worker 分支冲突处理、worktree 落盘、实时事件推送
- 增量审查与最终审查
- 返工、重试、换 Agent、重分配、取消、丢弃确认、rebase retry
- 结构化 mailbox 与团队/运行看板
- integration run、queue item、gate result、rollback
- 预览目标发现与容器化预览
- 任务归档/恢复和指标导出

## 核心领域对象

### Project

一个本地 Git 仓库的注册记录，保存规范化路径、名称和默认分支。

### Task

一个面向单个项目的任务主记录，包含：

- 标题、描述、Lead Agent
- 基线分支与基线 commit
- `currentPlanJson`
- `approvedPlanJson`
- `taskBranchName`
- 任务状态、错误信息、归档时间

### SubTask

批准计划之后才会物化的执行单元。每个子任务有自己的：

- `branchSuffix`
- 实际分支名
- worktree 路径
- 指派 Agent
- 依赖关系
- 执行与审查状态

### AgentSession

一次真实的 Lead 或 Worker 会话，保存：

- `sessionType`
- `status`
- `sandboxType`
- 关联 task / subtask

### PlanSnapshot

计划历史快照，保持 append-only，用于记录：

- Lead 生成的计划
- 审批时冻结的计划
- 从历史恢复的计划

### ReviewRecord

持久化的审查记录，区分：

- `INCREMENTAL`
- `FINAL`

### MergeRecord

持久化的 merge / rebase 尝试历史，支持一对多保留尝试记录。

### MailboxMessage

任务内的定向 handoff 消息，可由 Lead、SubTask 或系统发送，目标为 Lead 或指定子任务。

### IntegrationRun / IntegrationQueueItem / GateResult

表示集成收口阶段的运行记录、队列项和 gate 执行结果。

## 状态模型

### 任务状态

- `DRAFT`
- `CLARIFYING`
- `PLANNING`
- `PLAN_REVIEW`
- `EXECUTING`
- `REVIEWING`
- `MERGING`
- `ACTION_REQUIRED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### 子任务状态

- `BLOCKED`
- `PENDING`
- `READY`
- `RUNNING`
- `REVIEW_PENDING`
- `ACCEPTED`
- `REWORK_REQUIRED`
- `DISCARD_PENDING`
- `MERGED`
- `FAILED`
- `CANCELLED`
- `DISCARDED`

代码中的状态枚举当前以 Go 运行时实现为准，说明文档和 UI 文案应继续复用这些名字。

## 执行链路

### 1. 项目注册

`ProjectService` 调用仓库校验逻辑，确认：

- 路径存在
- 是 Git 仓库
- 可读
- 可解析默认分支与仓库状态

### 2. 任务创建

`TaskService#createTask` 会：

- 校验请求字段
- 校验 Lead Agent 可用性
- 校验附件类型和大小
- 记录基线分支与 commit
- 创建任务主线分支
- 持久化任务与附件

### 3. 澄清与规划

Lead 会话开始后：

- 用户与 Lead 通过消息持续澄清
- 系统保存消息和任务文档快照
- 点击确认需求后进入 `PLANNING`
- Lead 输出计划草稿
- 服务端解析、校验计划，生成 `currentPlanJson`
- 任务进入 `PLAN_REVIEW`

### 4. 批准并物化子任务

批准计划后：

- 冻结 `approvedPlanJson`
- 为每个计划节点创建 `SubTask`
- 写入依赖关系
- 将无依赖节点置为可执行状态
- 任务进入 `EXECUTING`

### 5. Worker 执行

每个 Worker 启动时都会建立：

- 子任务分支
- 子任务 worktree
- Docker 沙箱
- 会话日志与实时输出流

系统还会处理：

- 附件能力过滤
- 分支重名冲突
- 同仓库 Git 写操作串行化
- 失败后的重试/改派/换 Agent

### 6. 审查

Worker 结束后，子任务进入 `REVIEW_PENDING`。随后：

- 增量审查给出快速信号，但不是最终权威
- 最终审查才会把子任务推进到 `ACCEPTED`、`REWORK_REQUIRED` 或 `DISCARD_PENDING`

### 7. 集成与合并

当任务具备收口条件时，系统会：

- 启动 integration run
- 生成 integration queue item
- 记录 gate result
- 在任务主线和目标分支之间推进合并
- 为 merge / rebase 尝试持久化 append-only 历史

遇到冲突时，操作者可以选择 `Rebase & Retry`、手动回退或继续处理。

## 运行时边界

### Git 隔离

仓库不复用用户当前工作目录作为 Worker 执行目录。执行时使用：

- 基线分支
- 任务主线分支
- 子任务分支
- 子任务 worktree

### Docker 沙箱

`DockerSandboxManager` 默认策略：

- Worker 使用 `DOCKER`
- 默认镜像为 `eat/worker-base:latest`
- 默认网络策略是隔离网络
- 默认挂载只允许 worktree、附件和受控运行时目录
- 不暴露 `~`、`~/.ssh` 等宿主关键目录

### 预览沙箱

`PreviewService` 会为可预览目标创建独立 worktree，并在容器中启动预览命令。当前支持的预览目标类型包括：

- `BASE_BRANCH`
- `TASK_MAINLINE`
- `SUBTASK`
- `INTEGRATION_RUN`

## 代码分层

### `backend/cmd/eat/`

Go 后端启动入口。

### `backend/internal/api/`

HTTP 路由层，负责：

- 静态资源输出
- JSON API
- SSE 事件流
- 错误码到 HTTP 响应的转换

### `backend/internal/task/`

任务生命周期、计划、执行、团队视图、运行看板、集成收口等核心业务逻辑。

### `backend/internal/project/`

项目注册、仓库状态探测、偏好设置等项目域逻辑。

### `backend/internal/store/`

SQLite 打开、migration 应用和基础持久化能力。

### `backend/internal/agent/`

Agent contract、registry 与内置 adapter 定义。当前内置运行时中：

- `codex-cli` 为真实运行时
- `claude-cli` / `gemini-cli` 为 stub

### `web/src/`

React 前端应用，包括：

- 页面路由
- 布局与共享组件
- API wrapper
- 主题、偏好和视图状态

## API 面概览

当前 API 大体分为以下几组：

### 项目

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/project-directories`
- `GET /api/projects/{projectId}`
- `DELETE /api/projects/{projectId}`
- `GET /api/projects/{projectId}/repository-status`
- `PUT /api/projects/{projectId}/preferences`
- `GET /api/projects/{projectId}/tasks`

### Agent / 系统 / 指标

- `GET /api/agents`
- `GET /api/agents/health`
- `GET /api/system/health`
- `GET /api/system/docker`
- `GET /api/system/sandbox-policy`
- `GET /api/metrics/summary`
- `GET /api/metrics/export`

### 任务主流程

- `POST /api/tasks`
- `POST /api/guided-tasks`
- `GET /api/tasks/{taskId}`
- `POST /api/tasks/{taskId}/clarification-sessions`
- `POST /api/tasks/{taskId}/messages`
- `DELETE /api/tasks/{taskId}/lead-sessions/current`
- `POST /api/tasks/{taskId}/requirement-confirmations`
- `PUT /api/tasks/{taskId}/plan`
- `POST /api/tasks/{taskId}/plan-seeds`
- `POST /api/tasks/{taskId}/plan-approvals`
- `POST /api/tasks/{taskId}/replan-requests`

### 运行期控制

- `GET /api/tasks/{taskId}/events`
- `GET /api/tasks/{taskId}/team`
- `GET /api/tasks/{taskId}/board`
- `GET /api/tasks/{taskId}/runtime`
- `GET /api/tasks/{taskId}/diff`
- `POST /api/tasks/{taskId}/mailbox-messages`
- `POST /api/tasks/{taskId}/pauses`
- `DELETE /api/tasks/{taskId}/pauses/current`
- `POST /api/tasks/{taskId}/archives`
- `DELETE /api/tasks/{taskId}/archives/current`
- `DELETE /api/tasks/{taskId}`
- `POST /api/tasks/{taskId}/plan-snapshot-restores`

### 子任务与集成

- `POST /api/subtasks/{subTaskId}/retry-requests`
- `POST /api/subtasks/{subTaskId}/rework-requests`
- `POST /api/subtasks/{subTaskId}/reassignments`
- `POST /api/subtasks/{subTaskId}/agent-changes`
- `POST /api/subtasks/{subTaskId}/cancellations`
- `POST /api/subtasks/{subTaskId}/discard-confirmations`
- `POST /api/subtasks/{subTaskId}/rebase-retries`
- `POST /api/tasks/{taskId}/integration-runs`
- `POST /api/integration-runs/{integrationRunId}/retry-requests`
- `POST /api/integration-runs/{integrationRunId}/rollback-requests`
- `POST /api/integration-queue-items/{integrationQueueItemId}/dequeue-requests`

### 预览

- `GET /api/tasks/{taskId}/preview`
- `POST /api/tasks/{taskId}/preview-sessions`
- `DELETE /api/tasks/{taskId}/preview-sessions/current`

## 持久化与运行时目录

常见路径：

- 数据库：`.eat/eat.db`
- 附件：`uploads/`
- Worker worktree：`/tmp/.eat-worktrees`
- Preview worktree：`/tmp/.eat-preview-worktrees`

## 测试覆盖

当前主路径的自动化校验主要包括：

- `cd backend && go test ./...`
- `cd web && pnpm lint`
- `cd web && pnpm build`

历史 Node 测试目录已经移除，因此旧 `tests/*.js` 文件列表不再代表当前仓库状态。

## 文档关系

推荐阅读顺序：

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. 本文档
4. `docs/EAT-user-guide.md`
5. `docs/v1.1/README.md`

如果你要继续开发，请先服从 PRD 和 phase 文档；如果你要先快速熟悉仓库，再从本文档进入代码。

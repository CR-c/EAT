# Go 后端重构执行计划

> 状态：进行中  
> 目标：在不破坏现有产品契约的前提下，将 `src/server/` + `src/services/` + `src/repositories/` 的 Node.js 后端逐步迁移到 `backend/` Go 后端，并最终完成 API、编排、持久化与测试切换。

---

## 1. 文档目的

这份文档不是新的 PRD，也不是替代 [new-react-go.md](/home/code/EAT/docs/new-react-go.md) 的概念路线图。  
它只做一件事：

- 把当前仓库里“已经开始的 Go 迁移”整理为可执行的阶段计划
- 约束后续实现顺序、测试门槛和切换条件
- 明确哪些能力已经落地，哪些能力只是骨架，哪些能力还未开始

当本文与以下文档冲突时，优先级如下：

1. [PRD.md](/home/code/EAT/docs/PRD.md)
2. [AGENTS.md](/home/code/EAT/AGENTS.md)
3. [new-react-go.md](/home/code/EAT/docs/new-react-go.md)
4. 本文

---

## 2. 当前真实状态

### 2.1 Node 基线

当前仓库的运行时主后端仍然是 Node.js：

- [app.js](/home/code/EAT/src/server/app.js)
- [task-service.js](/home/code/EAT/src/services/task-service.js)
- [task-repository.js](/home/code/EAT/src/repositories/task-repository.js)

当前 Node 测试基线已恢复为绿色：

- `npm test`：`126/126` 通过

### 2.2 Go 迁移现状

当前 Go 后端目录已建立：

- [backend/](/home/code/EAT/backend)

其中已完成的是真实实现，不只是空文件：

- SQLite migration runner
- `system` API
- `projects` API
- `agents` API
- `task-templates` API
- event bus
- scheduler 环检测基础测试
- Go 入口、路由、中间件、Dockerfile、Makefile

当前 Go 测试基线为绿色：

- `cd backend && go test ./...`：通过

### 2.3 已完成提交

- `7df6e6a` `Add Go backend scaffold and fix review regressions`
- `66157a1` `Implement Go project, agent, and template APIs`

---

## 3. 重构目标

### 3.1 最终目标

完成后，`backend/` 必须具备以下能力：

- 覆盖当前 Node 后端公开 API 契约
- 保持当前 PRD 约束下的状态机、历史记录和 Docker 沙箱模型
- 替代当前 Node 的任务编排、审查、合并、集成、预览和事件流
- 具备独立可运行、可测试、可竞态检查的 Go 实现

### 3.2 非目标

本次迁移不做以下事情：

- 不改变 PRD 中的任务/子任务状态机
- 不把 Docker worker 执行退化为宿主直接执行
- 不顺手改产品流程来“适配 Go”
- 不提前实现与当前契约无关的 later-phase 新功能

---

## 4. 执行原则

### 4.1 先对齐契约，再替换实现

迁移目标是当前仓库真实行为，不是抽象架构图。  
每进入一个模块前，都要同时核对：

- 当前 Node 代码
- 现有测试
- 相关 phase / PRD 契约

### 4.2 先低耦合，后编排核心

按以下优先级迁移：

1. 只读和低耦合接口
2. 仓储层和基础写接口
3. Task 读写模型
4. Preview / Metrics 这类衍生服务
5. Orchestrator 核心
6. SSE / review / merge / integration / mailbox 全链路

### 4.3 迁移期间保持 Node 基线可回归

在 Go 完整替换前：

- Node 后端仍是当前真实运行基线
- 每次迁移都必须继续保证 `npm test` 可运行
- Go 侧要单独建立 `go test` 覆盖，不允许只靠“能编译”冒充完成

### 4.4 迁移切换必须是显式的

切换到 Go 后端前必须满足：

- 关键 API 契约已对齐
- Node/Go 核心用例对照通过
- Go 侧具备至少一次 `go test -race ./...` 干净结果

---

## 5. 模块映射

### 5.1 HTTP 层

Node：

- [app.js](/home/code/EAT/src/server/app.js)

Go：

- [router.go](/home/code/EAT/backend/internal/api/router.go)
- `*_handler.go`
- [sse.go](/home/code/EAT/backend/internal/api/sse.go)

### 5.2 项目与仓库

Node：

- [project-service.js](/home/code/EAT/src/services/project-service.js)
- [project-repository.js](/home/code/EAT/src/repositories/project-repository.js)
- [repo-validation-service.js](/home/code/EAT/src/services/repo-validation-service.js)

Go：

- [service.go](/home/code/EAT/backend/internal/project/service.go)
- [repository.go](/home/code/EAT/backend/internal/project/repository.go)
- [commands.go](/home/code/EAT/backend/internal/git/commands.go)

### 5.3 Agent 目录

Node：

- [agent-service.js](/home/code/EAT/src/services/agent-service.js)
- [built-in-agents.js](/home/code/EAT/src/agents/built-in-agents.js)

Go：

- [service.go](/home/code/EAT/backend/internal/agent/service.go)

### 5.4 编排核心

Node：

- [task-service.js](/home/code/EAT/src/services/task-service.js)
- [task-event-bus.js](/home/code/EAT/src/services/task-event-bus.js)
- [sandbox-manager.js](/home/code/EAT/src/services/sandbox-manager.js)
- [preview-service.js](/home/code/EAT/src/services/preview-service.js)
- [metrics-service.js](/home/code/EAT/src/services/metrics-service.js)

Go：

- [orchestrator.go](/home/code/EAT/backend/internal/orchestrator/orchestrator.go)
- [worker_manager.go](/home/code/EAT/backend/internal/orchestrator/worker_manager.go)
- [watchdog.go](/home/code/EAT/backend/internal/orchestrator/watchdog.go)
- [review_engine.go](/home/code/EAT/backend/internal/orchestrator/review_engine.go)
- [merge_engine.go](/home/code/EAT/backend/internal/orchestrator/merge_engine.go)
- [integration_engine.go](/home/code/EAT/backend/internal/orchestrator/integration_engine.go)

### 5.5 持久化

Node：

- [database.js](/home/code/EAT/src/repositories/database.js)
- [task-repository.js](/home/code/EAT/src/repositories/task-repository.js)

Go：

- [sqlite.go](/home/code/EAT/backend/internal/store/sqlite.go)
- `internal/store/db`
- `internal/store/queries`

---

## 6. 分阶段执行计划

### Phase A：基线稳定与迁移脚手架

目标：

- 保证 Node 基线绿色
- 建立 Go 模块布局、migration runner、入口和基础测试

完成定义：

- `npm test` 通过
- `backend` 可编译并 `go test ./...` 通过

当前状态：

- 已完成

### Phase B：低耦合 API 先迁移

目标：

- 先迁移不会拉上整条编排链路的接口

范围：

- `system`
- `projects`
- `agents`
- `task-templates`

完成定义：

- Go 实现真实返回数据，不再是 `NOT_IMPLEMENTED`
- 各自拥有 Go API 测试

当前状态：

- 已完成

### Phase C：Task 基础读写模型

目标：

- 在不接入 orchestrator 的前提下，把 Task 基础持久化和轻量接口迁到 Go

范围：

- `tasks` create / list / detail
- `projects/{projectId}/tasks`
- attachments 基础落库与读取
- 计划模板 seed / guided task 的静态落库部分

必须对齐：

- task 基础字段
- taskBranchName / baseBranch / baseCommitSha
- plan 快照 append-only 约束
- 附件类型校验和落盘语义

完成定义：

- Go 侧具备 task 基础仓储
- 相关 API handler 不再返回 `NOT_IMPLEMENTED`
- 至少覆盖 `tests/task-api.test.js` 中的非编排型基础用例对应场景

当前状态：

- 进行中
- 已完成 Go 侧 `start-clarification` 的静态状态迁移、消息落库与 lead session 占位持久化
- 已完成 Go 侧 `messages` 的静态消息写入，并对齐 `PLAN_REVIEW -> PLANNING` 的状态转换
- 已完成 Go 侧 `archive / unarchive / pause / resume / delete` 的非编排生命周期写路径
- 已完成 task message / session / archive / delete 所需基础仓储写能力
- 已补齐 clarification / lifecycle / branch cleanup / resume 的 Go API 测试
- 已完成 Go 侧 `tasks` 读模型基础仓储
- 已完成 Go 侧 `/api/tasks` 基础创建
- 已完成 Go 侧 `/api/projects/{projectId}/tasks`
- 已完成 Go 侧 `/api/tasks/{taskId}` 基础详情读取
- 已完成 Go 侧 `/api/guided-tasks` 静态模板建单与 `PLAN_REVIEW` 初始化
- 已完成 Go 侧 `/api/tasks/{taskId}/plan-seed` 模板 seed 写路径
- 已完成 plan snapshot append-only 基础落库
- 已完成 Go 侧 `/api/tasks/{taskId}/current-plan`
- 已完成 Go 侧 `/api/tasks/{taskId}/approve-plan` 的静态审批落库与 subtask 物化
- 已完成 Go 侧 `/api/tasks/{taskId}/restore-plan-snapshot`
- 已补齐 guided task / plan seed 的 Go API 测试与错误用例覆盖
- 已补齐 current plan / approve / restore 的 Go API 测试与幂等场景覆盖

### Phase D：衍生服务迁移

目标：

- 迁移不直接驱动 worker 编排、但依赖 task 数据的派生服务

范围：

- preview read model / start / stop
- metrics summary / export

完成定义：

- Go 侧具备 preview 与 metrics 真实实现
- Go 测试覆盖关键导出和状态构造逻辑

当前状态：

- 已完成
- 已完成 Go 侧 `metrics summary / export` 真实实现
- 已补齐 metrics Go API 测试
- 已完成 Go 侧 `preview` read model / start / stop 真实实现
- 已补齐 preview service 与 preview API 的 Go 测试

### Phase E：Task 生命周期写接口

目标：

- 先迁移“任务生命周期但不执行 worker”的写接口

范围：

- start clarification
- task messages
- current plan update
- approve / restore snapshot
- archive / unarchive / pause / resume / delete 的非编排部分

完成定义：

- Go 仓储已覆盖 task / message / snapshot / session 基础写入
- 对应 API 可真实驱动状态变化

当前状态：

- 进行中

### Phase F：Orchestrator 核心迁移

目标：

- 将 Node 的执行引擎迁移到 Go

范围：

- subtask materialization
- worker lifecycle
- dependency scheduling
- retry / rework / change-agent / reassign / cancel
- event bus / SSE
- watchdog
- final review single-trigger
- task mainline sync

必须显式修复的问题：

- P1 `retry_count` 原子更新
- P2 worker / watchdog 生命周期统一
- P3 final review 单次触发
- P5 并发池限流
- P6 DAG 环检测
- P7 增强 watchdog
- P8 metadata 清理
- P10 不允许静默吞错
- P11 固定锁顺序

完成定义：

- Go 侧具备可运行 worker 编排主链路
- 关键 worker 行为有 Go 测试
- `go test -race ./...` 开始纳入主验证

当前状态：

- 未开始

### Phase G：审查、合并、集成与 mailbox

目标：

- 迁移最终收口链路

范围：

- incremental review
- final review
- merge / rebase retry
- integration run / queue / rollback / dequeue
- mailbox / structured handoff

完成定义：

- append-only review / merge / integration 历史保持一致
- 相关 Go 测试覆盖到 authoritative final review 和 merge/integration 主链路

当前状态：

- 未开始

### Phase H：切换与收尾

目标：

- 让 Go 后端成为可切换主实现

范围：

- 与前端联调
- Node / Go 对照测试
- race 检测
- 切换入口
- 保留回滚路径

完成定义：

- 关键接口对照通过
- `go test -race ./...` 通过
- 可明确声明 Go 后端已经达到可替代当前 Node 后端的程度

当前状态：

- 未开始

---

## 7. 当前执行顺序

后续执行必须按以下顺序推进：

1. Phase C：Task 基础读写模型
2. Phase D：Preview / Metrics
3. Phase E：Task 生命周期写接口
4. Phase F：Orchestrator 核心
5. Phase G：审查、合并、集成与 mailbox
6. Phase H：切换与收尾

当前正在执行：

- Phase E

下一步唯一优先项：

- 继续补齐 Phase E 的 clarification / messages / archive / unarchive / pause / resume / delete 等生命周期写接口，再进入 Phase F 的 orchestrator 主链路迁移

---

## 8. 每阶段测试门槛

### 全局门槛

每一阶段结束时至少满足：

- `cd /home/code/EAT && npm test`
- `cd /home/code/EAT/backend && go test ./...`

### Orchestrator 开始后追加门槛

- `cd /home/code/EAT/backend && go test -race ./...`

### 切换前门槛

- Node / Go 关键接口对照
- 编排主链路场景验证
- merge / integration / review 主链路验证

---

## 9. 风险与处理

### 9.1 任务编排耦合过深

风险：

- `task-service.js` 过大，直接全搬容易引入隐性回归

处理：

- 严格拆成 read/write/orchestrator 三层迁移
- 先落低耦合接口，再碰 worker 生命周期

### 9.2 SQLite 语义差异

风险：

- Node `DatabaseSync` 与 Go `database/sql` 对事务和锁的行为不完全等价

处理：

- 关键更新采用显式事务
- 关键竞争点采用 SQL CAS
- 尽早引入 race 检测和并发测试

### 9.3 文档路线图与真实状态偏差

风险：

- [new-react-go.md](/home/code/EAT/docs/new-react-go.md) 是高层路线图，不代表当前 repo 已经具备对应基础

处理：

- 后续实现顺序以本文为准
- 如本文与代码现实冲突，以当前代码与测试重新校正本文

---

## 10. 完成标准

只有同时满足以下条件，才能声称 Go 后端重构完成：

- `backend/` 覆盖当前 Node 后端核心 API
- orchestrator 主链路已迁移
- review / merge / integration / preview / metrics / mailbox 已迁移
- Node 关键测试场景已在 Go 侧具备对应验证
- `go test -race ./...` 通过
- 切换路径明确且可回滚

在这之前，任何阶段性提交都只能称为：

- Go 后端迁移进展
- Go 后端阶段性里程碑

不能称为：

- Phase 2 已完成
- Go 后端已全量替换 Node

# EAT 多端 Web / 桌面应用结构重构计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将 EAT 从“Docker 为唯一执行形态的本地 Web 编排台”重构为“Web/Desktop 控制面 + 可插拔执行后端”的结构，为未来适配 Linux / macOS / Windows、浏览器访问和桌面打包预留稳定边界。

**Architecture:** 保留 EAT 的核心产品约束——本地优先、人工监督、Worker 必须受控隔离执行——但把“Docker”从唯一实现降级为默认/推荐执行后端。控制面继续复用现有 Go backend + React Web 主体，先拆掉 Lead 健康与 Docker readiness 的错误耦合，再引入通用 Worker Runtime/Backend 抽象，最后补齐 Web/Desktop 共用控制面和执行后端选择能力。

**Tech Stack:** Go backend, React + Vite frontend, SQLite, current Docker sandbox, future pluggable worker backends, optional desktop shell (Tauri/Electron-class host, exact shell postponed).

---

## 1. 背景与当前问题

当前仓库已经有“未来可扩展”的表面字段，但没有形成真正的多后端结构。

已确认的关键现状：
- 产品文档仍把 Docker 写成 Worker 的硬约束：
  - `docs/PRD.md`
  - `docs/ARCHITECTURE.md`
  - `docs/EAT-user-guide.md`
- 创建任务页把 Docker readiness 作为创建前置，并把 Lead candidate 的 `selectable` 绑到 agent overall health：
  - `web/src/features/tasks/pages/create-task-page.tsx`
  - `web/src/lib/api/system.ts`
  - `web/src/lib/types.ts`
- Agent health 会把 Docker 缺失直接判成 `Available=false`，导致 Lead CLI 也不可选：
  - `backend/internal/agent/service.go`
  - `backend/internal/api/agent_handler.go`
- Worker session 创建路径仍把 `SandboxType` 写死成 `DOCKER`：
  - `backend/internal/task/task_plan_service.go`
  - `backend/internal/task/task_subtask_service.go`
- Worker 运行时主路径仍直接依赖容器 runtime，而不是通用 runtime 抽象：
  - `backend/internal/agent/service.go`
  - `backend/internal/orchestrator/orchestrator.go`
  - `backend/internal/sandbox/manager.go`
- 反而 `PreviewService` 已经有更好的 `RuntimeRunner` / `RuntimeSession` 抽象，可以复用其思路：
  - `backend/internal/preview/service.go`

这会带来三个长期问题：
1. 无 Docker 时，连 Lead 选择、任务创建、澄清/规划都被一起阻断。
2. Windows/macOS/Linux 的平台差异被“镜像是否存在”这一条粗暴地遮蔽，无法表达真正的支持矩阵。
3. 如果以后做桌面应用，前端壳虽然可复用，但执行后端仍然没有可替换边界，架构收益很低。

---

## 2. 重构目标

本次结构重构的目标不是“移除 Docker”，而是把系统改造成：

### 2.1 保留的硬约束
- EAT 仍是 supervised, local-first。
- Worker 不能退化成对宿主仓库的无边界直接执行。
- 默认推荐路径仍然是 Docker 或等价受控容器后端。
- Lead / plan / review / merge / append-only 历史约束不变。

### 2.2 要改变的结构定义
把当前产品语义从：
- “Worker 必须继续 Docker 沙箱化”

改为：
- “Worker 必须运行在受控、可声明的执行后端中；Docker 是当前默认与推荐后端，但不是唯一后端。”

### 2.3 多端目标形态
目标结构：
- Control Plane
  - 浏览器 Web
  - 桌面壳（后续可接 Tauri/Electron 风格容器）
- Local Orchestration Backend
  - 现有 Go backend
- Execution Backends
  - DockerBackend（首个默认实现）
  - TrustedHostBackend（可选、显式降级、默认关闭）
  - Future desktop-managed / WSL / compatible container backend（后续扩展）

---

## 3. 非目标

以下内容不在本轮结构重构第一阶段内：
- 不做多租户 SaaS。
- 不做跨机器分布式 worker 调度。
- 不引入远程控制平面。
- 不立即实现完整桌面应用壳；先把控制面与执行后端边界抽出来。
- 不在第一阶段同时实现多个正式 worker backend；先让 Docker 成为“默认后端”而不是“唯一后端”。

---

## 4. 目标架构

### 4.1 分层模型

#### Layer A: Product Invariants
唯一应该写死的，是：
- 本地优先
- 人工监督
- Worker 必须受控执行
- 计划与执行分离
- review / merge append-only

#### Layer B: Control Plane
复用现有 React Web 控制面，并为未来桌面壳预留：
- 同一套页面状态与 API client
- 平台差异通过 `platform capability` 抽象处理
- 避免把“是否有 Docker”表达成“系统是否在线”

#### Layer C: Orchestrator Backend
现有 Go backend 继续负责：
- Project / Task / Plan / SubTask / Review / Merge / Preview
- 调度 Worker Runtime
- 记录 session 与执行状态

#### Layer D: Execution Backend
新抽象层负责：
- health probing
- runtime spawn / stop / kill
- output streaming
- exit callbacks
- backend metadata

首批推荐接口：
- `ExecutionBackend`
- `WorkerRuntimeSession`
- `BackendHealth`
- `ExecutionProfile`

### 4.2 核心解耦原则

#### 解耦 1：Lead Availability != Worker Backend Availability
必须拆开：
- Lead orchestration ready
- Worker execution ready
- Preview runtime ready

#### 解耦 2：System Health != Docker Health
系统健康不应再等同于 Docker 状态。
Docker/Execution Backend 应该是系统子面，而不是系统总面。

#### 解耦 3：Session 记录不应默认以容器为中心
当前 `container_id`、`pid` 是主字段，后续应补：
- `backend_kind`
- `backend_session_id`
- `backend_metadata_json`

#### 解耦 4：Worker Runtime 抽象不能直接泄漏 `*sandbox.ContainerRuntime`
Orchestrator 应只依赖通用 runtime 接口。

---

## 5. 支持矩阵建议

第一阶段建议支持矩阵：

### 5.1 Control Plane
- Linux/macOS/Windows 浏览器：支持
- Linux/macOS/Windows 桌面壳：后续支持，前提是复用同一 API 与页面逻辑

### 5.2 Execution Capability
- Docker backend ready：可完整执行
- 无 execution backend：允许创建任务、澄清、规划；禁止批准执行
- Trusted host backend：仅开发/紧急模式，必须显式开启，UI 上给出“低隔离”警示

### 5.3 推荐表述
不要再把支持矩阵写成“有没有 Docker”。
应该写成：
- Lead-only mode
- Planning-ready mode
- Full execution mode
- Preview-ready mode

---

## 6. 实施阶段与任务拆解

## Phase 0: 先统一产品语义与文档词汇

### Task 1: 重写产品硬约束描述

**Objective:** 把“Docker 是唯一后端”的产品表述降级为“默认/推荐后端”，保留“受控执行”硬约束。

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/EAT-user-guide.md`
- Modify: `README.md`

**Steps:**
1. 把 `docs/PRD.md` 中所有“Worker 必须继续 Docker 沙箱化”改写为“Worker 必须运行在受控执行后端中；Docker 是当前默认/推荐实现”。
2. 更新 `docs/ARCHITECTURE.md` 的一句话定义和运行时边界章节，说明当前默认实现仍为 Docker backend。
3. 更新 `docs/EAT-user-guide.md` 的前置条件章节，区分：Lead 可用、Worker backend 可用、Preview 可用。
4. 在 `README.md` 增加“未来多端控制面与可插拔执行后端”的路线说明。

**Validation:**
- `read_file` 核对文档已不再把 Docker 写成唯一合法实现。

---

## Phase 1: 拆掉 Lead 与 Docker 的错误耦合

### Task 2: 重新定义 Agent 健康结构

**Objective:** 将 agent health 从单一 `available` 重构为“编排可用性 + 执行后端可用性”。

**Files:**
- Modify: `backend/internal/agent/service.go`
- Modify: `backend/internal/api/agent_handler.go`
- Modify: `web/src/lib/types.ts`

**Steps:**
1. 在 `backend/internal/agent/service.go` 中把当前 `HealthSnapshot` 扩展为：
   - `orchestrationAvailable`
   - `executionAvailable`
   - `available`（兼容字段，可由 orchestration 计算或逐步废弃）
   - `checks`
   - `failureReason`
2. 对 `claude-cli` / `codex-cli`：
   - binary + auth 决定 orchestration
   - Docker/worker backend 决定 execution
3. 在 `web/src/lib/types.ts` 中同步类型。
4. 在 `backend/internal/api/agent_handler.go` 中让 `leadCandidates.selectable` 基于 orchestration，而不是整体 execution readiness。

**Validation:**
- Backend test target: `cd backend && go test ./internal/agent ./internal/api`
- 期望：无 Docker 时，lead candidate 仍可被选中；worker capability 单独显示 unavailable。

### Task 3: 调整任务创建与澄清的后端校验口径

**Objective:** 让“创建任务、发送澄清、生成计划”只依赖 Lead orchestration 可用性，不依赖 Worker backend 可用性。

**Files:**
- Modify: `backend/internal/task/task_lifecycle_service.go`
- Modify: `backend/internal/task/task_lead_clarification.go`
- Modify: `backend/internal/agent/service.go`

**Steps:**
1. 把 task creation 的 lead health 校验改为 orchestration 口径。
2. 把 clarification reply 的 health 校验改为 orchestration 口径。
3. 保留批准执行前的 execution backend 校验，后移到 plan approval / worker launch 前。

**Validation:**
- Backend test target: `cd backend && go test ./internal/task ./internal/api`
- 需补覆盖：无 Docker 时可创建普通任务并进入澄清。

---

## Phase 2: 新增 Execution Backend API 面

### Task 4: 增加 execution backends 查询接口

**Objective:** 不再让前端只看 `/api/system/docker`，而是看统一的 execution backend 列表。

**Files:**
- Modify: `backend/internal/api/system_handler.go`
- Modify: `backend/internal/api/router.go`
- Modify: `backend/internal/api/handler.go`
- Modify: `web/src/lib/api/system.ts`
- Modify: `web/src/lib/types.ts`

**Steps:**
1. 新增 `/api/system/execution-backends`。
2. 返回结构建议：
   - `backends[]`
   - `kind`
   - `available`
   - `default`
   - `trustLevel`
   - `reason`
   - `dependencies`
3. 现阶段先接入 `docker` backend。
4. `/api/system/docker` 暂时保留兼容，但标注为 legacy。

**Validation:**
- Backend: `cd backend && go test ./internal/api`
- 手工检查返回 JSON 字段完整。

### Task 5: 调整系统状态页与 Header 的健康语义

**Objective:** 去掉“docker unavailable = system offline”的误导。

**Files:**
- Modify: `web/src/components/layout/app-header.tsx`
- Modify: `web/src/features/system/pages/settings-page.tsx`
- Modify: `web/src/lib/api/system.ts`
- Modify: `web/src/lib/types.ts`

**Steps:**
1. Header 只显示系统 backend 服务存活，不把 Docker readiness 当系统 offline。
2. Settings 页显示 execution backends 列表，而不是只显示 Docker。
3. 保留 workerDefault / previewDefault，但 UI 文案升级成 backend 视角。

**Validation:**
- Frontend: `cd web && pnpm lint && pnpm build`

---

## Phase 3: 改造任务创建 UX，为多端与多 backend 预留

### Task 6: 重构创建任务页 preflight 结构

**Objective:** 将 preflight 从“全阻断单层结构”改成“Lead / Worker / Preview 分层 readiness”。

**Files:**
- Modify: `web/src/features/tasks/pages/create-task-page.tsx`
- Modify: `web/src/features/tasks/components/create-task-dialog.tsx`
- Modify: `web/src/lib/api/system.ts`
- Modify: `web/src/lib/types.ts`

**Steps:**
1. 把当前 `Docker / Worker 镜像` 改成 `Worker Backend`。
2. 将 preflight 拆为：
   - Benchmark 仓库
   - Git 仓库状态
   - Lead Runtime
   - Worker Backend
   - Preview Backend（可选，可后置）
3. 提交按钮只要求：
   - title/description/baseBranch/leadAgentType 完整
   - Lead runtime ready
4. Worker backend 未就绪时给出明确提示：
   - “可创建并澄清/规划；批准执行前需先配置 Worker Backend”。

**Validation:**
- Frontend: `cd web && pnpm lint && pnpm build`
- 手工验证：无 Docker 时可点选 Lead，可创建任务。

### Task 7: 为任务创建请求增加 backend/profile 字段

**Objective:** 给 future desktop / host backend 留协议口子。

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api/tasks.ts`
- Modify: `backend/internal/task/repository.go`
- Modify: `backend/internal/task/task_lifecycle_types.go`
- Modify: `backend/internal/task/task_lifecycle_service.go`
- Possibly Create: `prisma/migrations/<timestamp>_task_execution_profile/migration.sql`

**Steps:**
1. `CreateTaskInput` 增加可选：
   - `workerBackendKind?: string`
   - `executionProfile?: string`
2. 后端先允许为空；为空时按 default backend 决策。
3. 第一阶段可以只存 `task.execution_profile` 或等价字段，不要求立刻完整调度接入。

**Validation:**
- Backend: `cd backend && go test ./internal/task ./internal/api`
- Frontend: `cd web && pnpm build`

---

## Phase 4: 引入通用 Worker Runtime / Backend 抽象

### Task 8: 定义 Worker RuntimeSession 与 ExecutionBackend 接口

**Objective:** 让 orchestrator 不再直接依赖 Docker 容器 runtime。

**Files:**
- Create: `backend/internal/workerbackend/contract.go`
- Modify: `backend/internal/orchestrator/orchestrator.go`
- Modify: `backend/internal/agent/service.go`

**Suggested interface sketch:**

```go
type RuntimeSession interface {
    OnOutput(func(string))
    OnExit(func(int))
    Stop() error
    Kill() error
    Metadata() map[string]any
}

type Backend interface {
    Kind() string
    Health(context.Context) Health
    StartWorker(context.Context, StartWorkerInput) (RuntimeSession, error)
}
```

**Steps:**
1. 新增 worker backend contract 包。
2. 把 orchestrator 的 `WorkerHandle.Runtime` 改成接口，而不是 `*sandbox.ContainerRuntime`。
3. `agent.Service.SpawnSession` 改为返回通用 runtime interface。

**Validation:**
- Backend compile: `cd backend && go test ./internal/orchestrator ./internal/agent`

### Task 9: 把现有 Docker manager 降级为 Docker backend 实现

**Objective:** 保留当前 Docker 逻辑，但封装到可替换 backend 中。

**Files:**
- Modify: `backend/internal/sandbox/manager.go`
- Create: `backend/internal/workerbackend/docker/backend.go`
- Possibly Create: `backend/internal/workerbackend/docker/runtime.go`
- Modify: `backend/internal/api/handler.go`

**Steps:**
1. 将现有 `sandbox.Manager` 中的 Docker health / create / start 逻辑收口到 Docker backend。
2. 允许 `api.NewHandler` 注入 backend registry，而不是只 new 一个 Docker manager。
3. Docker backend 继续作为 default backend。

**Validation:**
- Backend: `cd backend && go test ./internal/sandbox ./internal/orchestrator ./internal/api`

### Task 10: 让 Worker session 物化时不再硬编码 `DOCKER`

**Objective:** session 的 sandbox/backend 种类应来自 task/profile/default backend，而不是常量。

**Files:**
- Modify: `backend/internal/task/task_plan_service.go`
- Modify: `backend/internal/task/task_subtask_service.go`
- Modify: `backend/internal/task/repository.go`
- Modify: `backend/internal/orchestrator/orchestrator.go`

**Steps:**
1. 把 `sessionSandboxDocker` 替换为从 task execution profile 派生的 backend kind。
2. orchestrator launch 时读取 session/backend profile 决策 backend。
3. 补上 `backend kind not available` 的错误路径与 action required 提示。

**Validation:**
- Backend: `cd backend && go test ./internal/task ./internal/orchestrator`

---

## Phase 5: 引入可选 Trusted Host backend（开发态）

### Task 11: 提供一个显式受限的 Host backend

**Objective:** 为无 Docker 的 Windows/macOS/Linux 开发场景提供受控降级模式，但默认关闭。

**Files:**
- Create: `backend/internal/workerbackend/host/backend.go`
- Modify: `backend/internal/api/system_handler.go`
- Modify: `backend/internal/api/handler.go`
- Modify: `docs/EAT-user-guide.md`
- Modify: `docs/PRD.md`

**Steps:**
1. Host backend 必须通过显式环境变量开启，例如：
   - `EAT_ENABLE_TRUSTED_HOST_BACKEND=1`
2. API 返回该 backend 的 `trustLevel=REDUCED_ISOLATION`。
3. UI 明确标红或警示，不可伪装成与 Docker 同级安全。
4. 仅允许本地开发 / 受信任机器使用。

**Validation:**
- Backend: `cd backend && go test ./internal/api`
- 手工验证：不开开关时 backend 不暴露；开开关后可见但有警示。

---

## Phase 6: 为桌面壳预留控制面结构

### Task 12: 抽平台能力适配层，避免前端直接假设浏览器形态

**Objective:** 让现有 Web 控制面可被后续桌面壳复用。

**Files:**
- Create: `web/src/lib/platform.ts`
- Modify: `web/src/lib/api/client.ts`
- Modify: `web/src/main.tsx`
- Modify: `web/src/components/layout/*`（只在有必要时）

**Steps:**
1. 新增平台能力模块，统一回答：
   - 是否为纯 Web
   - 是否有桌面宿主 API
   - 后端 baseURL 如何解析
2. 避免页面里散落 `window.location`、环境判断和未来桌面壳分支。
3. 保持 React 页面层尽量不感知“浏览器还是桌面壳”。

**Validation:**
- Frontend: `cd web && pnpm lint && pnpm build`

### Task 13: 规划 future desktop shell 的最小接入面

**Objective:** 先收口壳层边界，不立即落地桌面应用。

**Files:**
- Create: `docs/plans/<future-date>-desktop-shell-bootstrap.md`
- Modify: `README.md`

**Steps:**
1. 明确桌面壳最小职责：
   - 启动/连接本地 Go backend
   - 提供 WebView 容器
   - 传递平台能力
   - 不承载业务编排逻辑
2. 不在此阶段拆 monorepo，除非出现明确复用痛点。

**Validation:**
- 文档 review 即可。

---

## Phase 7: 对齐 Preview 抽象，避免双轨分叉

### Task 14: 把 Preview Runtime 与 Worker Runtime 的抽象对齐

**Objective:** 利用现有 `PreviewService` 的 `RuntimeRunner` 经验，避免 worker 与 preview 各自发明不同抽象。

**Files:**
- Modify: `backend/internal/preview/service.go`
- Modify: `backend/internal/workerbackend/contract.go`
- Create or Modify: shared runtime package if needed

**Steps:**
1. 对比 worker runtime 与 preview runtime 接口。
2. 如果差异不大，抽公共 runtime contract。
3. 至少统一：输出流、退出回调、停止语义、metadata 表达。

**Validation:**
- Backend: `cd backend && go test ./internal/preview ./internal/orchestrator`

---

## 7. 关键文件清单（优先级排序）

### 第一优先级：必须改
- `backend/internal/agent/service.go`
- `backend/internal/api/agent_handler.go`
- `backend/internal/api/system_handler.go`
- `backend/internal/api/handler.go`
- `backend/internal/orchestrator/orchestrator.go`
- `backend/internal/task/task_lifecycle_service.go`
- `backend/internal/task/task_lead_clarification.go`
- `backend/internal/task/task_plan_service.go`
- `backend/internal/task/task_subtask_service.go`
- `backend/internal/sandbox/manager.go`
- `web/src/features/tasks/pages/create-task-page.tsx`
- `web/src/features/tasks/components/create-task-dialog.tsx`
- `web/src/lib/api/system.ts`
- `web/src/lib/types.ts`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/EAT-user-guide.md`

### 第二优先级：建议改
- `backend/internal/api/router.go`
- `backend/internal/task/repository.go`
- `backend/internal/preview/service.go`
- `web/src/components/layout/app-header.tsx`
- `web/src/features/system/pages/settings-page.tsx`
- `README.md`

### 第三优先级：按设计需要新增
- `backend/internal/workerbackend/contract.go`
- `backend/internal/workerbackend/docker/backend.go`
- `backend/internal/workerbackend/host/backend.go`
- `web/src/lib/platform.ts`
- `prisma/migrations/<timestamp>_task_execution_profile/migration.sql`

---

## 8. 测试与验证策略

### 8.1 Backend
优先运行：
- `cd backend && go test ./internal/agent ./internal/api ./internal/task ./internal/orchestrator ./internal/preview`

重点回归：
- 无 Docker 时：
  - Lead 可选
  - 可创建任务
  - 可澄清 / 规划
  - 不能批准执行
- 有 Docker 时：
  - 当前路径不回归
  - Worker launch 正常
  - session 输出与退出事件不回归

### 8.2 Frontend
- `cd web && pnpm lint && pnpm build`

重点回归：
- create-task 页面
- task dialog
- app header 系统状态
- settings/system 页面

### 8.3 Manual smoke checks
1. Docker ready + Lead ready：完整黄金路径通过。
2. Docker unavailable + Lead ready：可创建/澄清/规划，不可执行。
3. Host backend disabled：不应在 UI 暴露。
4. Host backend enabled：可暴露，但必须有低隔离警示。

---

## 9. 风险与权衡

### 风险 1：抽象过度
如果一开始就上“支持所有 backend”，会拖慢主线。

**Mitigation:**
- 第一阶段只支持 DockerBackend 正式实现。
- Host backend 仅作开发态可选降级。

### 风险 2：文档和实现节奏脱节
如果先改文档不改实现，用户仍会遇到“Lead 不可选”的老问题。

**Mitigation:**
- Phase 1 必须早于大规模文档宣称。

### 风险 3：安全叙事被稀释
如果 Host backend 没有明显区分，产品会被误解为弱隔离工具。

**Mitigation:**
- 在 API、UI、文档都明确标注 trust level。

### 风险 4：Worker 与 Preview 出现双抽象体系
如果各自演化，会形成长期维护成本。

**Mitigation:**
- 使用 `backend/internal/preview/service.go` 作为 worker runtime 抽象参考。

### 风险 5：Windows 支持变成 Docker Desktop / WSL 特判泥潭

**Mitigation:**
- 不把平台支持写成“是否有 Docker”，而写成“backend capability”。

---

## 10. 开放问题

1. 官方是否接受“无 execution backend 时仍允许创建任务并完成澄清/规划”的产品状态？
2. `TrustedHostBackend` 是否纳入正式支持，还是只做开发实验开关？
3. 未来桌面应用是否内置 Go backend 启动器，还是只连接外部已运行服务？
4. `task` 级别是否需要显式选择 execution profile，还是先只支持 system default？
5. Preview backend 是否与 Worker backend 共用同一 backend registry，还是保持独立但接口对齐？

---

## 11. 推荐落地顺序

最小正确顺序：
1. Phase 1：拆 Lead/Docker 耦合
2. Phase 2：补 execution backend API
3. Phase 3：改 create-task UX
4. Phase 4：抽 worker runtime/backend 接口
5. Phase 7：对齐 preview 抽象
6. Phase 5：补 Host backend（可选）
7. Phase 6：再推进桌面壳规划

不要反过来先做桌面壳。否则只是把 Docker-only 的旧结构搬进桌面容器里，收益很低。

---

## 12. 验收标准

满足以下条件，才算本次结构重构达标：
- 无 Docker 时，Lead CLI 仍可选择并创建任务。
- 任务可以进入澄清与规划，但批准执行会被明确拦截并提示缺少 Worker backend。
- API 能表达 execution backends 列表，而不是只表达 Docker health。
- Orchestrator 不再直接依赖 Docker-specific runtime 类型。
- Docker backend 仍保持当前黄金路径可用。
- 文档已将“Docker 唯一后端”改写为“默认/推荐后端”。
- 前端控制面不再把 Docker unavailable 解释为系统整体 offline。

---

## 13. 最终建议

这次重构不要把重点放在“桌面壳长什么样”，而要先把以下两件事做对：
- 把 Control Plane 与 Execution Backend 解耦。
- 把 Docker 从“唯一实现”降级成“默认实现”。

只要这两件事做对，Web、多端、桌面壳、Windows/macOS/Linux 支持都会有稳定落点；否则只是继续在 Docker-only 结构上堆不同入口，后续维护成本会持续升高。

# EAT Task Execution Profile Rollout Plan

> **For Hermes:** Use docs-driven-autonomous-rollout + leader-subagent-multi-agent-dev. Keep batch size small, validate each batch, and update `.hermes/state/docs-driven-rollout/eat-multi-end-architecture-refactor.md` after every commit.

**Goal:** 为 EAT 的任务创建链路补上 task 级 `workerBackendKind` / `executionProfile`，让任务在创建时固定执行后端选择，并为后续非 Docker backend / execution profile 演进留出稳定持久化边界。

**Architecture:** 本轮不做 TrustedHost backend，也不做 desktop/platform 层。采用“task 级选择 + session 物化时映射到 sandboxType”的渐进方案：`workerBackendKind` 在创建时固化到 `tasks` 表，并在计划批准/依赖释放时决定新建 worker session 的 `sandboxType`；`executionProfile` 先作为 task 级 opaque string 持久化，不立即驱动 runtime contract，避免把这批小改升级成 orchestrator/agent/workerbackend 的大重构。

**Tech Stack:** Go backend, SQLite migrations, React + TypeScript frontend, existing `workerbackend` contract.

---

## Truth Sources

优先级从高到低：
1. `AGENTS.md`
2. `README.md`
3. `docs/README.md`
4. `.hermes/plans/2026-04-16_170639-eat-multi-end-architecture-refactor.md`
5. 当前实现文件：
   - `backend/internal/task/task_lifecycle_types.go`
   - `backend/internal/task/task_lifecycle_service.go`
   - `backend/internal/task/service.go`
   - `backend/internal/task/task_plan_service.go`
   - `backend/internal/task/task_subtask_service.go`
   - `backend/internal/task/repository.go`
   - `backend/internal/task/task_repository.go`
   - `backend/internal/workerbackend/contract.go`
   - `web/src/features/tasks/pages/create-task-page.tsx`
   - `web/src/lib/types.ts`
   - `web/src/lib/api/tasks.ts`
   - `prisma/migrations/*`

---

## Execution Contract

### Scope
- 在 `tasks` 表新增 `worker_backend_kind` / `execution_profile`
- 任务创建 API 接收并返回这两个字段
- 创建任务页面默认把当前 selected backend 固化进请求
- 计划批准 / 子任务释放时，新建 worker session 改为按 task 级 backend 决定 `sandboxType`

### Explicitly out of scope for this round
- `TrustedHostBackend`
- desktop shell / `web/src/lib/platform.ts`
- `executionProfile` 驱动 mounts/ports 等更高阶 runtime contract
- schema 全面命名迁移（`sandboxType -> backendKind`）
- 额外新增复杂 UI 配置面板

### Fixed decisions for this rollout
1. `workerBackendKind` 为空时，在创建任务时解析并固化当前 default backend。
2. `executionProfile` 本轮只做持久化占位，可为空。
3. 未注册 / 未就绪 backend 不在创建阶段拦截；在 plan approval 时按 task 选中的 backend 做 readiness 拦截。
4. Guided task 与 normal task 共用同一字段扩展面，不另起一套契约。

### High-risk boundary
- 本轮不 push、不部署、不做不可逆数据重置。
- 仅新增 additive SQLite migration。

---

## Batch Plan

### Batch A: 打通 task 级请求与持久化

**Objective:** 让 `CreateTaskRequest` / `Task` / `tasks` 表具备 `workerBackendKind` / `executionProfile`。

**Files:**
- Modify: `backend/internal/task/task_lifecycle_types.go`
- Modify: `backend/internal/task/task_lifecycle_service.go`
- Modify: `backend/internal/task/repository.go`
- Modify: `backend/internal/task/task_repository.go`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/features/tasks/pages/create-task-page.tsx`
- Create: `prisma/migrations/<timestamp>_task_execution_profile/migration.sql`

**Implementation notes:**
- `CreateTaskRequest` 增加 `WorkerBackendKind` / `ExecutionProfile`
- `Task` 增加 `WorkerBackendKind` / `ExecutionProfile`

  - `ALTER TABLE tasks ADD COLUMN worker_backend_kind TEXT;`
  - `ALTER TABLE tasks ADD COLUMN execution_profile TEXT;`
- 创建页不新增 UI 控件，直接使用当前 `selectedWorkerBackend?.kind`。
- `executionProfile` 前端暂不传值，保持空。

**Validation:**
- `cd /home/code/EAT/backend && rtk go test ./internal/task ./internal/api`
- `cd /home/code/EAT/web && rtk pnpm lint && rtk pnpm build`

**Commit boundary:**
- 中文 commit，聚焦“任务创建请求与 task 持久化扩展”。

---

### Batch B: 让 task 级 backend 真正决定 worker session backend

**Objective:** worker session 不再总是跟系统 default backend，而是优先跟 task 固化的 backend。

**Files:**
- Modify: `backend/internal/task/service.go`
- Modify: `backend/internal/task/task_plan_service.go`
- Modify: `backend/internal/task/task_subtask_service.go`

**Implementation notes:**
- 新增 helper：
  - `resolveTaskWorkerBackendKind(ctx, task *Task) string`
  - `executionBackendStatusForTask(ctx, task *Task) workerbackend.Status`
  - `workerSessionSandboxTypeForTask(ctx, task *Task) string`
- `ApprovePlan`：
  - backend readiness 改为检查 task 级 backend
  - 新建 session 时使用 `workerSessionSandboxTypeForTask`
- 子任务重派 / 依赖释放：
  - 创建 worker session 时改为读取 task 级 backend

**Validation:**
- `cd /home/code/EAT/backend && rtk go test ./internal/task ./internal/api ./internal/orchestrator`

**Commit boundary:**
- 中文 commit，聚焦“task 级 backend 驱动 worker session 物化”。

---

### Batch C: 文档与状态文件收口

**Objective:** 让计划文档、run state、API/README 口径与当前真相一致。

**Files:**
- Modify: `.hermes/state/docs-driven-rollout/eat-multi-end-architecture-refactor.md`
- Possibly Modify: `README.md`
- Possibly Modify: `docs/API-REFERENCE.md`

**Implementation notes:**
- 如果 API 返回结构新增 task 字段但资源面不变，可只更新 state file，不强制改 API-REFERENCE。
- README 仅在“当前实现真相”出现明显 drift 时更新。

**Validation:**
- 文档自检 + 相关测试/构建重跑

---

## Acceptance Criteria

完成本轮后应满足：
- `POST /api/tasks` / `POST /api/guided-tasks` 可接收 `workerBackendKind` / `executionProfile`
- 新建 task 返回体中可看到这两个字段（`executionProfile` 可为空）
- 创建页发起任务时会把当前 selected backend 固化进 task
- 批准计划时，如果该 task 绑定的 backend 不可用，会被明确拦截
- 计划批准 / 依赖释放后，新建 worker session 的 `sandboxType` 来源于 task 级 backend，而不是全局 default backend
- 现有 Docker 黄金路径不回归

---

## Risks

1. `executionProfile` 目前只是占位字符串，若后续长期不赋予 runtime 语义，会形成“名有其物、行为为空”的技术债。
2. 任务创建时固化 default backend，会让任务不再自动跟随系统默认 backend 变化；这是预期行为，但意味着“默认 backend 切换”只影响新任务。
3. 当前前端没有显式 backend/profile 控件，所以这次是先收口协议与 runtime 语义，不是把 operator 选择面做全。

---

## Next-batch Input

如果 Batch A/B 完成且验证通过，下一批优先顺序：
1. 评估是否补一个只读 backend/profile 展示到任务详情或 runtime 视图
2. 再决定是否推进 `TrustedHostBackend`
3. 最后才考虑 desktop/platform 抽象

## Batch D: 让 executionProfile 进入最小运行时语义

**Objective:** 让 `executionProfile` 不再只是占位字段，而是影响 worker 的网络档位。

**Files:**
- Modify: `backend/internal/task/task_lifecycle_service.go`
- Modify: `backend/internal/task/task_support.go`
- Modify: `backend/internal/task/task_error_codes.go`
- Modify: `backend/internal/orchestrator/{orchestrator.go,task_repository_adapter.go}`
- Modify: `backend/internal/agent/{service.go,service_test.go}`
- Modify: `backend/internal/api/{task_contract_handler_test.go,task_create_handler_test.go}`

**Implementation notes:**
- `executionProfile` 允许值：`default` / `isolated` / `internet` / `host-network`
- 本轮只映射到 `StartWorkerInput.NetworkProfile`
  - `default` / `isolated` -> `ISOLATED`
  - `internet` -> `DEFAULT`
  - `host-network` -> `HOST`
- 非法 profile 在创建任务阶段直接返回 `EXECUTION_PROFILE_INVALID`
- 暂不驱动 mounts / ports / more advanced runtime policy

## Batch E: 扩展 executionProfile 到最小端口暴露策略

**Objective:** 在不引入复杂 mounts 语义的前提下，为 preview/server 类 worker 任务补齐最小端口暴露策略。

**Files:**
- Modify: `backend/internal/task/task_support.go`
- Modify: `backend/internal/agent/{service.go,service_test.go}`
- Modify: `backend/internal/api/{task_contract_handler_test.go,task_create_handler_test.go}`
- Modify: `docs/API-REFERENCE.md`
- Modify: `README.md`

**Implementation notes:**
- 新增 profile：`web-preview` / `web-preview-host`
- 保持原有 4 个 profile 兼容不变
- `web-preview`
  - `NetworkProfile` = `DEFAULT`
  - 注入 env：`PORT=4173`, `HOST=0.0.0.0`, `BROWSER=none`
  - 暴露端口：`4173 -> 4173`
- `web-preview-host`
  - `NetworkProfile` = `HOST`
  - 注入相同预览 env
  - 不额外发布端口
- 本轮仍不触碰更复杂 mounts 策略

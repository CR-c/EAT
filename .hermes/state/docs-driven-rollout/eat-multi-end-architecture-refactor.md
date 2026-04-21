# Rollout Run State

项目：EAT 多端控制面 / 可插拔执行后端结构重构
当前批次：Batch 14 - TrustedHost backend 最小闭环
执行状态：
- status: COMPLETED
- run_started_at: 2026-04-21T12:41:00+08:00
- completed_at: 2026-04-21T13:10:00+08:00
- 本轮目标: 落地最小可用的 `HOST` execution backend：显式开关、默认关闭、reduced-isolation 标记、后端注册、审批可用性接线、系统页/创建页警示与文档同步
- 本轮明确未做: `executionProfile` 驱动 runtime contract、桌面壳相关代码、大范围 schema 命名迁移、host backend 的额外策略限制（更细粒度文件/网络约束）

已完成批次：
- Batch 1 - Phase1/2/3 最小闭环（Lead/Docker 解耦 + execution backend API + 创建页/系统页语义改造）
- Batch 2 - Phase4 首刀（worker runtime contract 落地 + orchestrator runtime 解耦）
- Batch 3 - Docker backend 接线 + session backend kind 收口
- Batch 4 - Preview runtime 与 execution backend 抽象对齐
- Batch 5 - ApprovePlan 前按计划节点预检 worker execution readiness
- Batch 6 - 消除 plan 校验与 agent registry 的重复真相源
- Batch 7 - 收口 codex 执行就绪与真实依赖
- Batch 8 - 收口 gemini / claude 执行就绪契约
- Batch 9 - 补充会话 backendKind 表达
- Batch 10 - 在 runtime/team/detail 层补充 backendKind 暴露
- Batch 11 - 评估 schema 级 `sandboxType -> backendKind` 迁移是否值得推进，并收口上层表达
- Batch 12 - task 级 worker backend / execution profile 持久化与执行接线
- Batch 13 - task 级 backend/profile 只读展示与 operator 可见性
- Batch 14 - TrustedHost backend 最小闭环

下一批次：
- Batch 15 - 决定 `executionProfile` 是否进入 runtime contract（network/mounts/ports），或进入桌面壳 / platform 适配主线

真相源文档：
- /home/code/EAT/AGENTS.md
- /home/code/EAT/README.md
- /home/code/EAT/docs/README.md
- /home/code/EAT/docs/API-REFERENCE.md
- /home/code/EAT/docs/HERMES-AUTONOMY-TRIAL.md
- /home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md
- /home/code/EAT/.hermes/plans/2026-04-16_170639-eat-multi-end-architecture-refactor.md
- /home/code/EAT/docs/plans/2026-04-21-task-execution-profile-rollout.md
- /home/code/EAT/.hermes/state/docs-driven-rollout/eat-multi-end-architecture-refactor.md

冻结的共享 contract：
- Agent health：`orchestrationAvailable` / `executionAvailable` 已成为主链路字段；`available` 仅作兼容总状态。
- `/api/system/execution-backends` 返回 `{ backends: [{ kind, available, default, trustLevel, reason, dependencies }] }`；`/api/system/docker` 为 legacy 兼容面。
- 无 execution backend 时：允许创建任务并完成澄清 / 规划；`PLAN_REVIEW` 批准执行前必须拦截，且不得创建 subtasks / sessions。
- `workerbackend.Backend` 已包含：`Kind()` / `Status(ctx)` / `StartWorker(ctx, input)`。
- `workerbackend.StartWorkerInput` 已统一收口 `WorkDir` / `Command` / `Env` / `NetworkProfile` / `ReadwriteMounts` / `ReadonlyMounts` / `PublishedPorts`。
- preview `RuntimeSession` 已与 `workerbackend.RuntimeSession` 对齐；preview 默认 runner 通过 `BackendRunner` 复用 workerbackend.Backend。
- Task 级 contract 新增：
  - `CreateTaskRequest` / `CreateGuidedTaskRequest` 支持可选 `workerBackendKind` / `executionProfile`
  - `tasks` 表新增 `worker_backend_kind` / `execution_profile`
  - task JSON 返回新增 `workerBackendKind` / `executionProfile`
  - 创建任务时若未显式传入 `workerBackendKind`，会固化当前 default backend
  - `executionProfile` 当前仅作 task 级 opaque string 持久化，不驱动 runtime contract
- `ApprovePlan` 与子任务释放/重派创建 worker session 时，优先按 task 级 backend 决定 `sandboxType`；不再一律跟随系统 default backend。
- 若 task 绑定的 backend 未注册或不可用，`PLAN_REVIEW` 批准执行会返回 `EXECUTION_BACKEND_UNAVAILABLE`，并在错误详情中暴露 task 级 backend 状态。
- `GetTaskRuntime` / `GetTaskTeam` 已补 task 级 `workerBackendKind` / `executionProfile` 只读字段，workbench 页会显式展示 task 级 backend/profile 与节点 session backend。
- 当显式设置 `EAT_ENABLE_TRUSTED_HOST_BACKEND=1` 时：
  - 系统注册 `host` backend，`trustLevel=REDUCED_ISOLATION`
  - Docker 不可用时，`host` 会成为 default execution backend
  - `SandboxPolicy` 会跟随当前 default backend 暴露 `HOST` / `DOCKER`
  - agent execution readiness 改为按已注册 execution backends 判断，不再把 Docker 当成唯一执行后端

本批改动范围：
- backend/internal/workerbackend/{contract.go,host/backend.go}
- backend/internal/agent/service.go
- backend/internal/api/{handler.go,system_handler.go,router_test.go}
- web/src/features/{system/pages/settings-page.tsx,tasks/pages/create-task-page.tsx}
- docs/{EAT-user-guide.md,PRD.md}
- README.md

本批验证：
- Ran: `cd /home/code/EAT/backend && rtk go test ./internal/api ./internal/agent ./internal/task ./internal/orchestrator`
- Result: PASS (`Go test: 67 passed in 4 packages`)
- Ran: `cd /home/code/EAT/web && rtk pnpm lint && rtk pnpm build`
- Result: PASS

本批提交：
- commit: 当前批次 HEAD（见 `git log -1 --oneline`）
- message: 引入受信任主机执行后端

待恢复输入：
- 关键文件：`backend/internal/workerbackend/host/backend.go`, `backend/internal/agent/service.go`, `backend/internal/api/system_handler.go`, `web/src/features/system/pages/settings-page.tsx`
- 关键目标：
  - 决定 `executionProfile` 是否进入 runtime contract（network/mounts/ports）
  - 决定 host backend 是否需要更严格的工作目录/挂载/网络限制
  - 若继续做多端控制面，则进入 desktop/platform 适配主线
- 关键风险：
  - `executionProfile` 目前只有持久化与展示语义，没有执行语义
  - host backend 当前是 reduced-isolation 的最小实现，主要依赖 operator 自觉与受信任本机环境
  - schema 底层仍保留历史 `sandboxType` 命名，未来若引入更多 backend，命名负担会继续上升

blocker：
- NONE

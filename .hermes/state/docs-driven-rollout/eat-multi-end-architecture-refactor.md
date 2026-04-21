# Rollout Run State

项目：EAT 多端控制面 / 可插拔执行后端结构重构
当前批次：Batch 12 - task 级 worker backend / execution profile 持久化与执行接线
执行状态：
- status: COMPLETED
- run_started_at: 2026-04-21T11:33:00+08:00
- completed_at: 2026-04-21T12:20:00+08:00
- 本轮目标: 为 task 创建链路补齐 `workerBackendKind` / `executionProfile`，让任务在创建时固化执行后端选择，并在计划批准 / 子任务释放时真正按 task 级 backend 物化 worker session
- 本轮明确未做: TrustedHost backend、桌面壳相关代码、`executionProfile` 驱动 runtime contract、大范围 schema 命名迁移

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

下一批次：
- Batch 13 - 评估是否补 task 级 backend/profile 的只读展示与 operator 可见性，再决定是否进入 TrustedHost backend 或 desktop/platform 主线

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

本批改动范围：
- backend/internal/task/{task_lifecycle_types.go,task_lifecycle_service.go,repository.go,service.go,task_repository.go,task_plan_service.go,task_subtask_service.go}
- backend/internal/api/{task_contract_handler_test.go,task_lead_only_mode_test.go}
- prisma/migrations/20260421114500_phase27_task_execution_profile/migration.sql
- web/src/features/tasks/pages/create-task-page.tsx
- web/src/lib/types.ts
- docs/{API-REFERENCE.md,plans/2026-04-21-task-execution-profile-rollout.md}
- README.md

本批验证：
- Ran: `cd /home/code/EAT/backend && rtk go test ./internal/task ./internal/api ./internal/orchestrator`
- Result: PASS (`Go test: 62 passed in 3 packages`)
- Ran: `cd /home/code/EAT/web && rtk pnpm lint && rtk pnpm build`
- Result: PASS

本批提交：
- commit: 当前批次 HEAD（见 `git log -1 --oneline`）
- message: 收口任务级执行后端与执行配置占位

待恢复输入：
- 关键文件：`backend/internal/task/repository.go`, `backend/internal/task/task_runtime_view.go`, `backend/internal/task/task_team_view.go`, `web/src/lib/types.ts`, `docs/plans/2026-04-21-task-execution-profile-rollout.md`
- 关键目标：
  - 评估是否要在 task detail / runtime / team 视图里补 task 级 `workerBackendKind` / `executionProfile` 的只读展示
  - 决定 `executionProfile` 是否进入 runtime contract（network/mounts/ports）
  - 决定是否进入 TrustedHost backend 主线
- 关键风险：
  - `executionProfile` 目前只有持久化语义，没有执行语义
  - 当前前端没有显式 backend/profile 配置 UI，operator 仅会隐式使用当前 default backend
  - schema 底层仍保留历史 `sandboxType` 命名，未来若引入非容器 backend，命名负担会继续上升

blocker：
- NONE

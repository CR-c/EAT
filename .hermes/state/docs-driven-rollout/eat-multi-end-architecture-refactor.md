# Rollout Run State

项目：EAT 多端控制面 / 可插拔执行后端结构重构
当前批次：Batch 20 - host backend 工作目录白名单约束
执行状态：
- status: COMPLETED
- run_started_at: 2026-04-21T14:26:00+08:00
- completed_at: 2026-04-21T14:40:00+08:00
- 本轮目标: 为 reduced-isolation 的 host backend 增加最小但真实的工作目录白名单约束，避免其退化为对任意宿主目录的直接执行
- 本轮明确未做: executionProfile 更细粒度 repo/worktree mounts 策略、host backend 的更复杂网络/挂载策略、桌面壳实际工程落地

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
- Batch 15 - executionProfile 最小运行时语义
- Batch 16 - executionProfile 最小端口暴露策略
- Batch 17 - 附件只读挂载策略
- Batch 18 - 平台适配层与桌面壳 bootstrap 文档
- Batch 19 - preview 旧 Docker 专用实现清理
- Batch 20 - host backend 工作目录白名单约束

下一批次：
- Batch 21 - 决定 executionProfile 是否继续扩到更细粒度 repo/worktree mounts 策略，或真正落地桌面壳工程骨架

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
  - `executionProfile` 当前支持：`default` / `isolated` / `internet` / `host-network` / `web-preview` / `web-preview-host`
- `executionProfile` 会在 worker spawn 时映射到 `StartWorkerInput.NetworkProfile`，并对 `web-preview` / `web-preview-host` 注入预览端口环境变量；当前仍不驱动更高阶 mounts 策略
- `ApprovePlan` 与子任务释放/重派创建 worker session 时，优先按 task 级 backend 决定 `sandboxType`；不再一律跟随系统 default backend。
- 若 task 绑定的 backend 未注册或不可用，`PLAN_REVIEW` 批准执行会返回 `EXECUTION_BACKEND_UNAVAILABLE`，并在错误详情中暴露 task 级 backend 状态。
- `GetTaskRuntime` / `GetTaskTeam` 已补 task 级 `workerBackendKind` / `executionProfile` 只读字段，workbench 页会显式展示 task 级 backend/profile 与节点 session backend。
- 当显式设置 `EAT_ENABLE_TRUSTED_HOST_BACKEND=1` 时：
  - 系统注册 `host` backend，`trustLevel=REDUCED_ISOLATION`
  - Docker 不可用时，`host` 会成为 default execution backend
  - `SandboxPolicy` 会跟随当前 default backend 暴露 `HOST` / `DOCKER`
  - agent execution readiness 改为按已注册 execution backends 判断，不再把 Docker 当成唯一执行后端
  - host backend 默认只允许在 `.eat-worktrees` 根下执行；可通过 `EAT_TRUSTED_HOST_ALLOWED_ROOTS` 显式追加允许根路径
- `executionProfile` 当前正式支持：`default` / `isolated` / `internet` / `host-network` / `web-preview` / `web-preview-host`
  - 创建任务阶段会校验非法 profile，并返回 `EXECUTION_PROFILE_INVALID`
  - worker spawn 时会映射到 `StartWorkerInput.NetworkProfile`
  - 当前映射：`default` / `isolated` -> `ISOLATED`，`internet` -> `DEFAULT`，`host-network` -> `HOST`
  - `web-preview` 会注入 `PORT=4173` / `HOST=0.0.0.0` / `BROWSER=none`，并暴露 `4173 -> 4173`
  - `web-preview-host` 会注入相同预览环境变量，但走 `HOST` 网络
  - 当前仍未进入更细粒度 repo/worktree mounts 策略
- task attachments 已接入 worker mount contract：
  - orchestrator 在 launchSubTask 时会读取 task attachments
  - worker prompt 会明确列出可读附件
  - agent 执行时会把附件文件路径作为只读挂载传给 execution backend
- 前端已新增 `web/src/lib/platform.ts`：
  - 统一回答 `web` / `desktop-hosted` 平台能力
  - 统一解析 API baseURL
  - 允许未来桌面壳通过 `window.__EAT_PLATFORM__` 注入 `apiBaseUrl` / `shell`
  - `main.tsx` 会把平台信息写入 `document.documentElement.dataset`
- preview runtime 当前只保留 `BackendRunner -> workerbackend.Backend` 主路径；历史 `DockerRunner` / `dockerRuntimeSession` 已删除，避免 preview 与 worker runtime 再次双轨分叉

本批改动范围：
- backend/internal/workerbackend/host/{backend.go,backend_test.go}
- docs/{EAT-user-guide.md,PRD.md}
- README.md

本批验证：
- Ran: `cd /home/code/EAT/backend && gofmt -w internal/workerbackend/host/backend.go internal/workerbackend/host/backend_test.go && rtk go test ./internal/workerbackend/... ./internal/api ./internal/agent ./internal/task ./internal/orchestrator`
- Result: PASS (`Go test: 74 passed in 7 packages`)

本批提交：
- commit: 当前批次 HEAD（见 `git log -1 --oneline`）
- message: 收紧受信任主机执行范围

待恢复输入：
- 关键文件：`backend/internal/workerbackend/host/backend.go`, `backend/internal/agent/service.go`, `docs/plans/2026-04-21-desktop-shell-bootstrap.md`
- 关键目标：
  - 决定 executionProfile 是否继续扩到更细粒度 repo/worktree mounts 策略
  - 或真正落地桌面壳工程骨架（Tauri/Electron）
  - 若继续加强 host backend，则补更细粒度网络/挂载限制
- 关键风险：
  - host backend 当前已限制 workdir 根，但仍是 reduced-isolation 的最小实现
  - 当前 executionProfile 已覆盖网络、端口、附件只读挂载，但仍未进入 repo/worktree 的更细粒度 mount policy
  - schema 底层仍保留历史 `sandboxType` 命名，未来若引入更多 backend，命名负担会继续上升

blocker：
- NONE

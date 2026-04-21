# EAT

EAT，`Engineering Agent Team`，是一个面向本地 Git 仓库的监督式多 Agent 编排面板。它不是“全自动黑盒写代码系统”，而是一个让操作者通过 Web 界面把任务交给 Leader Agent，再由系统在受控沙箱里调度 Worker Agent 执行、审阅、集成和合并的本地优先工具。

本文描述的是当前主干实现与本地开发前置条件，不替代 [PRD.md](/home/code/EAT/docs/PRD.md) 的产品定义。

当前仓库已经收敛为一条明确的 `Go 后端 + React 前端` 主路径。代码里已经落地了真实 CLI runtime 接入、任务模板、团队视图、运行看板、结构化 mailbox、integration run，以及任务主线分支模型。

## 项目定位

EAT 要解决的问题不是“怎么再包装一个聊天框”，而是下面这条工程主线：

1. 注册一个本地 Git 项目
2. 创建一个任务，并为它选定或新建基线分支
3. 只和 Leader Agent 对话，澄清需求与边界
4. 由 Leader 生成可编辑的 DAG 计划
5. 人工审阅后批准执行
6. 系统在独立分支、独立 worktree、独立受控执行后端里启动 Worker（当前默认实现为 Docker）
7. 通过增量审查、最终审查、integration run 和 merge flow 收口

它强调的是：

- 本地优先
- 明确审批
- 可追踪状态
- 可恢复执行
- 分支与工作区隔离
- 人类保有监督权

## 当前技术栈

当前默认产品栈是 `React + Go`：

- React 19 + TypeScript + Vite 负责前端应用壳层、页面路由和交互
- Go 1.22+ + `chi` + SQLite 负责 API、事件流、任务编排和静态资源承载
- `web/dist` 是唯一受支持的前端发布产物目录
- 仓库已经收敛为单一的 `Go 后端 + React 前端` 主路径

### 后端

- Go 1.22+
- `net/http` + `chi`
- SQLite 作为本地持久化数据库
- `backend/cmd/eat` 为默认运行入口
- 手写 repository / service 分层
- SSE 事件流用于任务实时状态推送

### 前端

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- `web/src` 中的 React 页面、组件和 API wrapper
- 中英双语，默认 `zh-CN`

### Agent 与执行层

- `codex-cli`、`claude-cli`、`gemini-cli` 当前都已注册为真实运行时
- `codex-cli`、`claude-cli` 可作为 Lead；`gemini-cli` 当前只作为 Worker 候选
- 当前默认和验证最充分的主路径仍然是 `codex-cli` + Docker Worker
- Lead orchestration readiness 与 Worker execution readiness 已拆分暴露
- Worker 执行当前默认仍走 Docker 沙箱
- Git worktree 用于隔离每个子任务工作目录

## 当前实现的核心能力

- 项目注册与 Git 仓库校验
- 系统文件树路径浏览和手动绝对路径输入
- Agent 注册表、健康检查与可选性过滤
- Docker 健康检查、execution backend 列表与沙箱策略暴露
- Lead 澄清会话与消息持久化
- 计划生成、计划快照、计划恢复、计划审阅
- 引导式任务创建与黄金路径模板
- 子任务物化、依赖调度、并发 worker 执行
- 任务团队视图、运行看板、Mailbox 交接
- 增量审查、最终审查、Rebase & Retry
- Integration run、gate result、队列出列、回滚入口
- 单任务任务主线分支 `task mainline branch`
- 同一项目下多任务并存时的仓库级 Git 写操作串行化

## 执行模型摘要

- 一个任务对应一条任务主线分支；子任务在各自的分支、worktree 和受控 execution backend 中执行，当前默认实现仍为 Docker。
- 同一 Git 项目可以同时存在多个任务，但所有会修改仓库状态的 Git 写操作都会串行化，避免互相污染。
- 任务主线通常经历 `DRAFT -> CLARIFYING -> PLANNING -> PLAN_REVIEW -> EXECUTING -> REVIEWING -> MERGING -> COMPLETED`，异常时可能进入 `ACTION_REQUIRED`、`FAILED` 或 `CANCELLED`。
- 当 execution backend 未就绪时，任务仍可创建并进入澄清 / 规划；批准执行前会被明确拦截。
- 任务在创建时会固化 `workerBackendKind`（默认取当前 default backend）；`executionProfile` 当前仅作为 task 级预留字段持久化。

更完整的领域对象、状态模型和执行链路，请看 [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)；面向操作者的逐步流程，请看 [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)。

## 首次使用建议

1. 注册一个本地 Git 仓库。
2. 创建任务，必要时直接选择内置模板。
3. 在工作区里先和 Lead 澄清范围、约束和验收标准。
4. 审阅 DAG 计划并批准执行。
5. 在运行看板观察团队、子任务、审查和集成状态。

## 内置任务模板

当前内置模板包括：

- `full-stack-web-app`
- `backend-api`
- `frontend-feature`
- `repo-wide-refactor`

这些模板会自动提供推荐角色、执行顺序、`depends_on` 依赖链和初始 plan seed，用于更快进入计划审阅。

## 系统架构

### 运行方式

- 默认启动 Go 后端：`npm start`
- 显式启动 Go 后端：`npm run start:go`
- 前端开发模式：`cd web && pnpm dev`

### 目录结构

```text
.
├── backend/               # Go 后端、HTTP API、任务编排与静态资源服务
├── deploy/                # systemd、nginx 与 journald 部署模板
├── docs/                  # PRD、实现文档、API 参考与使用说明
├── prisma/                # schema 与 SQL migration
├── scripts/               # 发布与备份脚本
├── web/                   # React + Vite 前端工程与构建产物
├── docker/worker-base/    # Worker Docker 镜像定义
├── uploads/               # 任务附件
└── .eat/                  # 本地 SQLite 数据库与运行时状态
```

### 服务分层

- `backend/cmd/eat`
  Go 后端启动入口
- `backend/internal/api`
  HTTP 路由、SSE 输出、前端静态资源承载
- `backend/internal/task`
  任务生命周期、计划、执行、看板与集成能力
- `backend/internal/project`
  项目注册、仓库状态与偏好设置
- `web/src`
  React 页面、共享组件、主题、状态和 API wrapper

### 持久化与运行时目录

- 本地数据库默认在 [`.eat/eat.db`](/home/code/EAT/.eat/eat.db)
- 任务附件默认落在 [`uploads/`](/home/code/EAT/uploads)
- Worker worktree 默认落在系统临时目录 `/tmp/.eat-worktrees`
- Codex 运行时临时目录默认在 `/tmp/.eat-codex-runtime`

### 数据库说明

虽然仓库里有 Prisma schema 文件，但当前运行时并没有使用 Prisma Client。实际数据库访问是：

- 通过 Go `database/sql` + `github.com/mattn/go-sqlite3`
- 启动时自动执行 [`prisma/migrations/`](/home/code/EAT/prisma/migrations)
- repository 层直接发 SQL

也就是说，这里的 Prisma 更接近“schema 与 migration 规范来源”，不是运行时 ORM。

当前还要额外注意：

- `prisma/schema.prisma` 不是最新运行时表结构的完整镜像
- `agent_sessions`、`integration_runs`、`integration_queue_items` 等运行时表，以 SQL migration 和 repository 实现为准
- 如果 schema、README、历史文档和代码冲突，优先回到 `backend/internal/api/router.go`、`prisma/migrations/`、`backend/internal/task/*_repository.go`

## API 概览

默认服务入口是 Go HTTP 服务，主要 API 包括：

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/project-directories`
- `GET /api/agents`
- `GET /api/agents/health`
- `GET /api/system/health`
- `GET /api/system/execution-backends`
- `GET /api/system/docker`
- `GET /api/system/sandbox-policy`
- `GET /api/task-templates`
- `POST /api/guided-tasks`
- `POST /api/tasks`
- `GET /api/tasks/{taskId}`
- `GET /api/tasks/{taskId}/events`
- `GET /api/tasks/{taskId}/team`
- `GET /api/tasks/{taskId}/board`
- `GET /api/tasks/{taskId}/runtime`
- `GET /api/tasks/{taskId}/diff`
- `POST /api/tasks/{taskId}/clarification-sessions`
- `POST /api/tasks/{taskId}/messages`
- `POST /api/tasks/{taskId}/requirement-confirmations`
- `POST /api/tasks/{taskId}/mailbox-messages`
- `PUT /api/tasks/{taskId}/plan`
- `POST /api/tasks/{taskId}/plan-approvals`
- `POST /api/tasks/{taskId}/replan-requests`
- `POST /api/tasks/{taskId}/integration-runs`
- `POST /api/subtasks/{subTaskId}/retry-requests`
- `POST /api/subtasks/{subTaskId}/rework-requests`
- `POST /api/subtasks/{subTaskId}/agent-changes`
- `POST /api/subtasks/{subTaskId}/rebase-retries`

如果你要看更细的请求/响应约定，直接读：

- [`docs/API-REFERENCE.md`](/home/code/EAT/docs/API-REFERENCE.md)
- [`backend/internal/api/router.go`](/home/code/EAT/backend/internal/api/router.go)

## 本地开发

### 前置要求

- Go 1.22 或更高
- Node.js 22 或更高
- pnpm 10 或更高
- Git
- Docker
- 已安装并登录可用的 CLI runtime
- 默认开发主路径至少需要 `codex-cli`

### 安装依赖

```bash
npm install
cd web && pnpm install
```

### 构建 React 前端

```bash
npm run build:ui
```

### 构建 Worker 镜像

```bash
npm run build:worker-image
```

默认镜像名：

```bash
eat/worker-base:latest
```

镜像当前要求至少包含这些工具：

- `bash`
- `git`
- `rg`

当前运行时已经拆开了 Lead orchestration readiness 与 Worker execution readiness。也就是说，在默认配置下：

- 没有本地 `eat/worker-base:latest` 镜像时，`/api/agents/health` 会报告 Worker sandbox 不可用
- 这不会再阻断普通任务创建、澄清和规划
- 但 `PLAN_REVIEW` 阶段的批准执行仍会校验 execution backend 与计划中各 worker agent 的 execution readiness；缺少任一前置条件时会返回 `EXECUTION_BACKEND_UNAVAILABLE` 或 `EXECUTION_AGENT_UNAVAILABLE`
- 因此本地试跑完整执行主流程前，应先构建 Worker 镜像

### 启动服务

```bash
npm start
```

默认监听：

- `HOST=127.0.0.1`
- `PORT=3000`
- 或使用 `EAT_BACKEND_ADDR`

启动后访问：

- <http://127.0.0.1:3000/>

### 前端本地开发

```bash
cd web
pnpm dev
```

Vite 默认监听本地开发端口，并将 `/api` 代理到 `http://127.0.0.1:3000`。

## 关键环境变量

### 服务监听

- `HOST`
- `PORT`
- `EAT_BACKEND_ADDR`
- `EAT_BACKEND_DB_PATH`
- `EAT_MIGRATIONS_DIR`
- `EAT_UI_ROOT`
- `EAT_UPLOAD_ROOT`
- `EAT_PREVIEW_ROOT`

### Codex 运行时

- `EAT_CODEX_BINARY`
- `EAT_CODEX_PACKAGE_PATH`
- `EAT_CODEX_CONFIG_PATH`
- `EAT_CODEX_AUTH_PATH`
- `EAT_CODEX_RUNTIME_ROOT`
- `EAT_CODEX_MODEL`

### Worker 沙箱

- `EAT_WORKER_IMAGE`
- `EAT_WORKER_CONTAINER_USER`
- `EAT_WORKTREE_ROOT`

## 推荐生产部署方式

推荐部署拓扑：

```text
Browser
  -> nginx
  -> 127.0.0.1:3000
  -> systemd-managed eat-backend
  -> host Docker daemon (worker / preview containers)
```

这条路径是当前仓库最稳的主路径：

- 主后端直接跑在宿主机，由 `systemd` 常驻
- Worker 和 Preview 继续使用宿主机 Docker
- 日志交给 `journald` 轮转
- 数据落 SQLite + 本地持久化目录

仓库内置的部署资产：

- [`deploy/systemd/eat.service`](/home/code/EAT/deploy/systemd/eat.service)
- [`deploy/systemd/eat.env.example`](/home/code/EAT/deploy/systemd/eat.env.example)
- [`deploy/systemd/journald-eat.conf`](/home/code/EAT/deploy/systemd/journald-eat.conf)
- [`deploy/nginx/eat.conf`](/home/code/EAT/deploy/nginx/eat.conf)
- [`scripts/deploy-release.sh`](/home/code/EAT/scripts/deploy-release.sh)
- [`scripts/backup-eat.sh`](/home/code/EAT/scripts/backup-eat.sh)

推荐目录布局：

```text
/opt/eat/current                 # 当前发布版本
/opt/eat/releases/<timestamp>    # 历史发布
/etc/eat/eat.env                 # 服务环境变量
/var/lib/eat/data/eat.db         # SQLite
/var/lib/eat/uploads             # 附件
/var/lib/eat/worktrees           # Worker worktree
/var/lib/eat/preview-worktrees   # Preview worktree
/var/lib/eat/codex-runtime       # Codex 会话运行时
/var/lib/eat/home/.codex         # Codex 认证与配置
/srv/eat-projects                # 推荐集中存放被注册的 Git 仓库
```

### 一次性初始化

1. 安装依赖：`go`、`pnpm`、`git`、`docker`、`nginx`
2. 创建运行用户并加入 Docker 组：`useradd --system --create-home --home-dir /var/lib/eat/home --shell /usr/sbin/nologin eat && usermod -aG docker eat`
3. 创建目录：`mkdir -p /opt/eat/releases /var/lib/eat/{runtime,data,uploads,worktrees,preview-worktrees,codex-runtime} /etc/eat /var/backups/eat`
4. 复制环境变量模板：`cp deploy/systemd/eat.env.example /etc/eat/eat.env`
5. 编辑 [`/etc/eat/eat.env`](/etc/eat/eat.env)，至少确认数据库、UI、上传、preview、worktree、Codex 路径都指向持久化目录

### 发布

准备一个新版本：

```bash
sudo INSTALL_SYSTEM_ASSETS=1 ./scripts/deploy-release.sh
```

这个脚本会：

- 构建 `web/dist`
- 构建 `backend/eat-backend`
- 复制 `prisma/migrations`
- 可选重建 `eat/worker-base:latest`
- 生成 `/opt/eat/releases/<timestamp>`
- 切换 `/opt/eat/current` 软链接
- 可选安装 `systemd` 与 `nginx` 模板

如果你只想发布程序，不覆盖系统配置：

```bash
sudo INSTALL_SYSTEM_ASSETS=0 RESTART_SERVICE=1 ./scripts/deploy-release.sh
```

### 启动与日志

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now eat
sudo systemctl status eat --no-pager
```

启用 nginx：

```bash
sudo cp deploy/nginx/eat.conf /etc/nginx/sites-available/eat.conf
sudo ln -sfn /etc/nginx/sites-available/eat.conf /etc/nginx/sites-enabled/eat.conf
sudo nginx -t
sudo systemctl reload nginx
```

日志默认走 `journald`，推荐复制 [`deploy/systemd/journald-eat.conf`](/home/code/EAT/deploy/systemd/journald-eat.conf) 到 `/etc/systemd/journald.conf.d/eat.conf` 后重启 `systemd-journald`。这样就有日志分割、压缩和保留策略。

常用日志命令：

```bash
journalctl -u eat -f
journalctl -u eat --since "1 hour ago"
```

### 备份

备份脚本：

```bash
sudo ./scripts/backup-eat.sh
```

它会：

- 读取 `/etc/eat/eat.env`
- 备份 SQLite 数据库
- 备份上传目录
- 保留一份环境变量快照
- 生成 `/var/backups/eat/eat-<timestamp>.tar.gz`
- 自动清理超出保留天数的旧备份

可以放到 `cron`：

```bash
0 3 * * * root /opt/eat/current/scripts/backup-eat.sh
```

## 测试

当前建议按栈分别执行验证：

```bash
cd backend && go test ./...
cd web && pnpm lint && pnpm build
```

也可以直接在仓库根执行：

```bash
npm test
```

## 现网实例

这个仓库在当前服务器上的公开访问地址是：

- <https://eat.735678.xyz/>

当前部署链路：

```text
Browser
  -> Cloudflare
  -> nginx-gateway
  -> 127.0.0.1:3000
  -> /home/code/EAT
```

服务形式：

- `systemd` 服务名：`eat.service`
- 工作目录：`/home/code/EAT`
- 启动命令：`npm start`

### 本服务器标准部署步骤

1. 进入仓库目录
2. 构建 React 前端
3. 如有 Worker 运行时改动则重建 Worker 镜像
4. 视情况跑测试
5. 重启 `eat.service`
6. 用本机地址和域名各验证一次

常用命令：

```bash
cd /home/code/EAT
npm run build:ui
npm run build:worker-image
systemctl restart eat.service
systemctl status eat.service --no-pager
curl -i -s http://127.0.0.1:3000/
curl -k -i -s --resolve eat.735678.xyz:443:127.0.0.1 https://eat.735678.xyz/
```

更完整的服务器部署说明见：

- [`agent.md`](/home/code/EAT/agent.md)
- [`/home/system.md`](/home/system.md)

## 文档地图

如果你要继续开发这个项目，建议按这个顺序读文档：

1. [`AGENTS.md`](/home/code/EAT/AGENTS.md)
2. [`docs/README.md`](/home/code/EAT/docs/README.md)
3. [`docs/HERMES-AUTONOMY-TRIAL.md`](/home/code/EAT/docs/HERMES-AUTONOMY-TRIAL.md)
4. [`docs/HERMES-FIRST-TRIAL-PROMPT.md`](/home/code/EAT/docs/HERMES-FIRST-TRIAL-PROMPT.md)
5. [`docs/EAT-EVAT-TODO-BENCHMARK.md`](/home/code/EAT/docs/EAT-EVAT-TODO-BENCHMARK.md)
6. [`docs/EAT-EVAT-TODO-TASK.md`](/home/code/EAT/docs/EAT-EVAT-TODO-TASK.md)
7. [`docs/PRD.md`](/home/code/EAT/docs/PRD.md)
8. [`docs/ARCHITECTURE.md`](/home/code/EAT/docs/ARCHITECTURE.md)
9. [`docs/API-REFERENCE.md`](/home/code/EAT/docs/API-REFERENCE.md)
10. [`docs/GO-DEVELOPMENT-CONVENTIONS.md`](/home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md)
11. [`docs/EAT-user-guide.md`](/home/code/EAT/docs/EAT-user-guide.md)

如果你要理解“这个仓库现在大概已经实现到了哪里”，优先看：

- [`docs/ARCHITECTURE.md`](/home/code/EAT/docs/ARCHITECTURE.md)
- [`docs/README.md`](/home/code/EAT/docs/README.md)
- [`docs/API-REFERENCE.md`](/home/code/EAT/docs/API-REFERENCE.md)
- 最近的数据库 migration

## 已知边界与非目标

当前系统仍然保持这些边界：

- 不是多用户协作平台
- 不是跨机器分布式执行系统
- 不是无审批的自治 swarm
- 不自动帮你解决 merge conflict
- 多 runtime 已注册，但默认验证最充分的仍是 `codex-cli` 主路径

另外，虽然同一项目下可以存在多个任务，但系统的重点仍然是“任务内 DAG 编排”，不是“跨任务编排”。

## 对当前仓库状态的简短判断

基于当前代码、迁移、测试和 UI 资源，可以把仓库理解为：

- 当前主干能力已经成型
- Web-first 的 Leader orchestration 体验已经具备骨架
- 真实 Codex 执行链路已经接入
- integration run、团队看板、模板引导、任务主线分支已经进入可用状态
- 目前最值得继续投入的方向不是再补一个底层框架，而是持续提高任务编排质量、提示词约束、可观测性和操作员 UX

## 相关文件

- 文档入口：[docs/README.md](/home/code/EAT/docs/README.md)
- Agent 规范：[AGENTS.md](/home/code/EAT/AGENTS.md)
- Hermes 试验指南：[docs/HERMES-AUTONOMY-TRIAL.md](/home/code/EAT/docs/HERMES-AUTONOMY-TRIAL.md)
- Hermes 首轮 Prompt：[docs/HERMES-FIRST-TRIAL-PROMPT.md](/home/code/EAT/docs/HERMES-FIRST-TRIAL-PROMPT.md)
- EAT 评测标准（evat Todo）：[docs/EAT-EVAT-TODO-BENCHMARK.md](/home/code/EAT/docs/EAT-EVAT-TODO-BENCHMARK.md)
- EAT 基准任务输入：[docs/EAT-EVAT-TODO-TASK.md](/home/code/EAT/docs/EAT-EVAT-TODO-TASK.md)
- 产品说明：[docs/PRD.md](/home/code/EAT/docs/PRD.md)
- 当前实现总览：[docs/ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
- 当前 API 参考：[docs/API-REFERENCE.md](/home/code/EAT/docs/API-REFERENCE.md)
- 当前服务器部署说明：[agent.md](/home/code/EAT/agent.md)

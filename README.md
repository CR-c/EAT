# EAT

EAT，`Engineering Agent Team`，是一个面向本地 Git 仓库的监督式多 Agent 编排面板。它不是“全自动黑盒写代码系统”，而是一个让操作者通过 Web 界面把任务交给 Leader Agent，再由系统在受控沙箱里调度 Worker Agent 执行、审阅、集成和合并的本地优先工具。

当前仓库的实现已经覆盖 `docs/phase/` 定义的基础主干阶段，并继续向 `docs/v1.1/` 的扩展编排阶段推进。代码里已经落地了真实 Codex CLI 接入、任务模板、团队视图、运行看板、结构化 mailbox、integration run，以及任务主线分支模型。

## 项目定位

EAT 要解决的问题不是“怎么再包装一个聊天框”，而是下面这条工程主线：

1. 注册一个本地 Git 项目
2. 创建一个任务，并为它选定或新建基线分支
3. 只和 Leader Agent 对话，澄清需求与边界
4. 由 Leader 生成可编辑的 DAG 计划
5. 人工审阅后批准执行
6. 系统在独立分支、独立 worktree、独立 Docker 沙箱里启动 Worker
7. 通过增量审查、最终审查、integration run 和 merge flow 收口

它强调的是：

- 本地优先
- 明确审批
- 可追踪状态
- 可恢复执行
- 分支与工作区隔离
- 人类保有监督权

## 当前技术栈

这是一个偏“原生 Web + Go 后端”的项目，不是 React/Next.js 应用。

### 后端

- Go 1.22+
- `net/http` + `chi`
- SQLite 作为本地持久化数据库
- `backend/cmd/eat` 为默认运行入口
- 保留 Node 后端用于对照测试与回滚入口
- 手写 repository / service 分层
- SSE 事件流用于任务实时状态推送

### 前端

- 原生 HTML
- 原生 JavaScript
- Tailwind CSS 构建静态样式
- 自定义液态玻璃风格控制台 UI
- 中英双语，默认 `zh-CN`

### Agent 与执行层

- `codex-cli` 为当前真实可用的内置 Agent 运行时
- `claude-cli`、`gemini-cli` 当前仍是 stub adapter，占位但不算真实可选运行时
- Worker 执行默认走 Docker 沙箱
- Git worktree 用于隔离每个子任务工作目录

## 当前实现的核心能力

- 项目注册与 Git 仓库校验
- 系统文件树路径浏览和手动绝对路径输入
- Agent 注册表、健康检查与可选性过滤
- Docker 健康检查与沙箱策略暴露
- Lead 澄清会话与消息持久化
- 计划生成、计划快照、计划恢复、计划审阅
- 引导式任务创建与黄金路径模板
- 子任务物化、依赖调度、并发 worker 执行
- 任务团队视图、运行看板、Mailbox 交接
- 增量审查、最终审查、Rebase & Retry
- Integration run、gate result、队列出列、回滚入口
- 单任务任务主线分支 `task mainline branch`
- 同一项目下多任务并存时的仓库级 Git 写操作串行化

## 关键执行模型

### 1. 单任务单主线分支

对操作者而言，一个任务对应一条明确的任务主线分支。

- 创建任务时，系统会为任务自动创建一个 `task mainline branch`
- 命名默认形如 `eat-<任务标题规范化结果>`
- 如果名称冲突，会自动生成唯一名称

这条分支不是给某一个 Worker 独占使用的，它是该任务当前“累计有效进度”的集成主线。

### 2. 子任务仍然独立隔离

系统没有让所有 Worker 直接共用一个工作目录。当前实现是更稳妥的混合模型：

- 每个子任务有自己的分支
- 每个子任务有自己的 worktree
- 每个子任务在自己的 Docker 沙箱中运行
- 子任务完成后，成功结果会同步回任务主线分支
- 下游依赖子任务会从最新任务主线继续派生

这保证了两件事同时成立：

- 从产品语义上看，任务有一条清晰的“开发主线”
- 从工程安全性上看，并发执行仍然隔离，避免互相污染

### 3. 同一项目多任务并存

当前代码已经支持“同一个 Git 项目里同时存在多个任务”。但因为这些任务共享同一个仓库对象，凡是会改 Git 状态的动作都做了仓库级串行化。

也就是说：

- 多个任务可以同时存在
- 多个任务可以分别拥有自己的任务主线分支
- 但同一仓库上的关键 Git 写操作会排队执行

这样做是为了避免：

- 分支创建冲突
- integration / merge 互相踩状态
- rebase / checkout / ensureBranchExists 并发污染仓库

## 典型用户流程

### 标准路径

1. 注册项目
2. 选择模板，或保持自定义任务
3. 创建任务
4. 在任务列表中只和 Leader 对话
5. 确认需求后进入计划审阅
6. 检查 DAG、依赖、角色分配、分支命名
7. 批准执行
8. 在运行看板查看团队、子任务、审查和集成状态
9. 遇到冲突时使用 rework、change-agent、rebase-retry、resume、integration retry/rollback 等恢复入口

### 首次使用时你应该怎么操作

如果你是第一次用这个系统，最推荐的方式是：

1. 先注册一个本地 Git 仓库
2. 在任务创建页面选一个模板，例如“全栈 Web 应用”
3. 写清任务标题和需求描述
4. 创建任务后，去任务列表给 Leader 发第一条消息
5. 明确范围、约束、验收标准，确认无误后再点“确认需求”
6. 进入计划审阅确认拆分与依赖
7. 批准执行，转到运行看板观察全流程

### 一个任务内部的主线状态

任务大致会经过这些状态：

- `DRAFT`
- `CLARIFYING`
- `PLANNING`
- `PLAN_REVIEW`
- `EXECUTING`
- `REVIEWING`
- `MERGING`
- `COMPLETED`

也可能进入：

- `ACTION_REQUIRED`
- `FAILED`
- `CANCELLED`

子任务状态更细，包括：

- `BLOCKED`
- `PENDING`
- `READY`
- `RUNNING`
- `REVIEW_PENDING`
- `ACCEPTED`
- `REWORK_REQUIRED`
- `DISCARD_PENDING`
- `MERGED`

## 内置任务模板

当前内置模板已经不是“纯空白任务”，而是可以直接种出 DAG 草稿的黄金路径。

仓库内置的模板包括：

- `full-stack-web-app`
- `backend-api`
- `frontend-feature`
- `repo-wide-refactor`

这些模板会自动提供：

- 推荐角色
- 推荐子任务顺序
- `depends_on` 依赖链
- 每个节点的验收标准
- 适合作为 Leader 初始规划骨架的 plan seed

## Agent 角色与借鉴来源

当前仓库的 Leader 规划提示词已经吸收了 `agency-agents` 的角色边界思路，用于让任务分配更像“真实团队分工”，而不是笼统切几个任务。

参考来源：

- <https://github.com/msitarzewski/agency-agents>

EAT 借鉴的是：

- 更明确的 specialist role
- 更清晰的职责边界
- 更适合规划 DAG 的角色命名方式

但 EAT 没有照搬对方产品形态。EAT 仍然保持：

- Web-first
- 本地优先
- 明确审批
- Docker worker sandbox
- append-only review / merge 历史

## 系统架构

### 运行方式

- 默认启动 Go 后端：`npm start`
- 显式启动 Go 后端：`npm run start:go`
- 回滚到 Node 后端：`npm run start:node`

### 目录结构

```text
.
├── deploy/                # systemd、nginx 与 journald 部署模板
├── docs/                  # PRD、基础 phase、扩展 phase 与使用说明
├── prisma/                # schema 与 SQL migration
├── scripts/               # 发布与备份脚本
├── src/
│   ├── agents/            # Agent contract、registry、built-in adapters
│   ├── repositories/      # SQLite repository 层
│   ├── server/            # HTTP 服务入口与路由
│   ├── services/          # 核心业务逻辑
│   └── ui/                # 原生前端资源
├── tests/                 # Node 内置 test runner 测试
├── docker/worker-base/    # Worker Docker 镜像定义
├── uploads/               # 任务附件
└── .eat/                  # 本地 SQLite 数据库与运行时状态
```

### 服务分层

- `src/server/`
  负责路由、静态资源、SSE 输出
- `src/services/`
  负责项目注册、任务生命周期、Git 操作、审查、集成、指标、模板
- `src/repositories/`
  负责 SQLite 读写与 migration 自动应用
- `src/agents/`
  负责 Agent 能力契约、健康检查、真实/Stub runtime 适配
- `src/ui/`
  负责浏览器端交互与视图模型

### 持久化与运行时目录

- 本地数据库默认在 [`.eat/eat.db`](/home/code/EAT/.eat/eat.db)
- 任务附件默认落在 [`uploads/`](/home/code/EAT/uploads)
- Worker worktree 默认落在系统临时目录 `/tmp/.eat-worktrees`
- Codex 运行时临时目录默认在 `/tmp/.eat-codex-runtime`

### 数据库说明

虽然仓库里有 Prisma schema 文件，但当前运行时并没有使用 Prisma Client。实际数据库访问是：

- 通过 `node:sqlite`
- 启动时自动执行 [`prisma/migrations/`](/home/code/EAT/prisma/migrations)
- repository 层直接发 SQL

也就是说，这里的 Prisma 更接近“schema 与 migration 规范来源”，不是运行时 ORM。

## API 概览

服务入口是一个单进程 Node HTTP 服务，主要 API 包括：

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/browse`
- `GET /api/agents`
- `GET /api/agents/health`
- `GET /api/system/docker-health`
- `GET /api/system/sandbox-policy`
- `GET /api/task-templates`
- `POST /api/guided-tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/events`
- `GET /api/tasks/:id/team`
- `GET /api/tasks/:id/board`
- `POST /api/tasks/:id/start-clarification`
- `POST /api/tasks/:id/messages`
- `POST /api/tasks/:id/confirm-requirements`
- `PUT /api/tasks/:id/current-plan`
- `POST /api/tasks/:id/approve-plan`
- `POST /api/tasks/:id/resume`
- `POST /api/subtasks/:id/retry`
- `POST /api/subtasks/:id/rework`
- `POST /api/subtasks/:id/change-agent`
- `POST /api/subtasks/:id/rebase-retry`
- `POST /api/tasks/:id/integration-runs`

如果你要看更细的请求/响应约定，直接读：

- [`docs/phase/API-EVENT-EXAMPLES.md`](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)
- [`docs/v1.1/API-EVENT-EXAMPLES.md`](/home/code/EAT/docs/v1.1/API-EVENT-EXAMPLES.md)

## 本地开发

### 前置要求

- Go 1.22 或更高
- Node.js 22 或更高
- Git
- Docker
- 已安装并登录 `codex-cli`

### 安装依赖

```bash
npm install
```

### 构建前端样式

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

项目使用 Node 内置 test runner。

直接运行全量测试：

```bash
npm test
```

当前仓库已有的测试覆盖重点包括：

- 项目注册与仓库校验
- Agent contract / registry / health
- Docker sandbox manager
- 任务创建与附件处理
- 澄清流程与计划生成
- 子任务执行、分支冲突与并发
- 指标导出
- UI 静态资源与关键文案/结构

测试文件位于 [`tests/`](/home/code/EAT/tests)。

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
2. 构建前端样式
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
3. [`docs/PRD.md`](/home/code/EAT/docs/PRD.md)
4. [`docs/phase/README.md`](/home/code/EAT/docs/phase/README.md)
5. [`docs/phase/PRISMA-MIGRATIONS.md`](/home/code/EAT/docs/phase/PRISMA-MIGRATIONS.md)
6. [`docs/phase/API-EVENT-EXAMPLES.md`](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)
7. [`docs/phase/CHECKLISTS.md`](/home/code/EAT/docs/phase/CHECKLISTS.md)
8. 当前正在处理的具体 phase 文档
9. [`docs/v1.1/README.md`](/home/code/EAT/docs/v1.1/README.md)

如果你要理解“这个仓库现在大概已经实现到了哪里”，优先看：

- [`docs/ARCHITECTURE.md`](/home/code/EAT/docs/ARCHITECTURE.md)
- [`docs/README.md`](/home/code/EAT/docs/README.md)
- [`docs/v1.1/README.md`](/home/code/EAT/docs/v1.1/README.md)
- [`docs/v1.1/IMPLEMENTATION-ORDER.md`](/home/code/EAT/docs/v1.1/IMPLEMENTATION-ORDER.md)
- 最近的数据库 migration

## 已知边界与非目标

当前系统仍然保持这些边界：

- 不是多用户协作平台
- 不是跨机器分布式执行系统
- 不是无审批的自治 swarm
- 不自动帮你解决 merge conflict
- 不把 stub adapter 当成真实可执行 Agent

另外，虽然同一项目下可以存在多个任务，但系统的重点仍然是“任务内 DAG 编排”，不是“跨任务编排”。

## 对当前仓库状态的简短判断

基于当前代码、迁移、测试和 UI 资源，可以把仓库理解为：

- 基础主干 phase 已经成型
- Web-first 的 Leader orchestration 体验已经具备骨架
- 真实 Codex 执行链路已经接入
- integration run、团队看板、模板引导、任务主线分支已经进入可用状态
- 目前最值得继续投入的方向不是再补一个底层框架，而是持续提高任务编排质量、提示词约束、可观测性和操作员 UX

## 相关文件

- 文档入口：[docs/README.md](/home/code/EAT/docs/README.md)
- Agent 规范：[AGENTS.md](/home/code/EAT/AGENTS.md)
- 产品说明：[docs/PRD.md](/home/code/EAT/docs/PRD.md)
- 基础 phase 索引：[docs/phase/README.md](/home/code/EAT/docs/phase/README.md)
- 扩展 phase 索引：[docs/v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)
- 当前服务器部署说明：[agent.md](/home/code/EAT/agent.md)

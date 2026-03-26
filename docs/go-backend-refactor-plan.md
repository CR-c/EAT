# Go 后端重构记录

> 状态：已完成
> 完成日期：2026-03-25

## 概述

将 Node.js 后端 (`src/server/` + `src/services/`) 完整迁移到 Go (`backend/`)。Go 后端现为唯一运行入口，旧 Node 实现已从主分支移除。

## 迁移范围

### API 层（47 端点，100% 覆盖）

- system / projects / agents / task-templates
- tasks CRUD + 生命周期（clarification / plan / approve / archive / pause / resume / delete）
- subtask 操作（retry / rework / cancel / reassign / change-agent / confirm-discard / rebase-retry）
- preview / metrics / integration / mailbox / SSE 事件流

### 运行时编排

| 组件 | 实现 |
|------|------|
| Docker 沙箱 | `sandbox/manager.go` — 完整容器生命周期 (create/start/stop/kill/rm) |
| Agent 适配器 | `agent/service.go` — codex-cli 真实 spawn，claude-cli/gemini-cli STUB |
| Worker 编排 | `orchestrator/orchestrator.go` — 启动/退出/依赖调度/并发限制(6) |
| 工作区准备 | 分支创建 + worktree 创建，对齐 Node `#prepareSubTaskWorkspace` |
| Merge-to-Mainline | Worker 完成后自动合并到任务主干，冲突标记 ACTION_REQUIRED |
| Final Review | 所有子任务完成后触发状态转换 EXECUTING → REVIEWING → DONE |
| Watchdog | 60s 扫描，5m idle / 30m hard timeout，自动 kill + retry（最多 2 次） |
| Git 操作 | 完整 worktree/branch/merge/rebase/checkout/stage/commit |

### 持久化

- SQLite + WAL 模式 + 外键约束
- 23 个 migration（复用 `prisma/migrations/`）
- 手写 SQL，`repository.go`（1967 行）
- 乐观锁（version 字段）

## 入口切换

```
npm start        → Go 后端 (backend/cmd/eat)
```

默认监听 `127.0.0.1:3000`。

## 测试基线

- `go test ./...` — 当前主路径验证方式
- `cd web && pnpm lint && pnpm build` — 当前前端验证方式
- `npm test` — 根目录聚合验证入口

## 目录结构

```
backend/
├── cmd/eat/main.go              # 入口
├── internal/
│   ├── api/                     # HTTP 路由 + handler（chi v5）
│   ├── agent/                   # Agent 注册 + spawn
│   ├── eventbus/                # Pub/Sub 事件总线
│   ├── git/                     # Git 操作封装
│   ├── metrics/                 # 指标导出
│   ├── orchestrator/            # Worker 编排 + watchdog + review + merge
│   ├── preview/                 # 预览服务（Docker 容器）
│   ├── project/                 # 项目管理
│   ├── sandbox/                 # Docker 沙箱管理
│   ├── store/                   # SQLite 存储 + migration
│   ├── task/                    # 任务服务（4000+ 行）+ repository
│   └── tasktemplates/           # 任务模板
├── go.mod
├── Makefile
└── Dockerfile
```

## 已知限制

- claude-cli / gemini-cli 为 STUB 模式，等待上游 CLI 文档后接入
- Final review 当前为自动通过，未接入 review agent
- Integration engine 为骨架，等待测试框架对接

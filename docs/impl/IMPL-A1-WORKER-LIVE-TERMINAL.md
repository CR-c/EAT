# 实施计划 A1 · Worker Live 终端面板（xterm.js 只读）

> 目标：team 视图里每个 RUNNING SubTask 配一个实时滚动、ANSI 着色的只读终端；刷新页面能回填已产生输出。
> 上层背景见 `docs/CC-PANE-BORROW-AND-COLLAB-DESIGN.md` A1 节。

## 范围与约束
- 只读终端，**不**做反向 PTY 输入（worker 在 Docker 内自主执行）。
- 后端最小改动：仅新增一个回填端点；复用已有 SSE 与 `session:output` 事件。
- 复用 workbench 已有的单条 SSE 连接，按 `sessionId` 分发，**不**为每个面板新开连接。

## 现状锚点
- SSE 端点：`GET /api/tasks/{taskId}/events`（`backend/internal/api/sse.go`，router.go:56）。
- 输出事件：`session:output` = `{chunk, sessionId, subTaskId, taskId}`（`backend/internal/task/task_events.go:63`）。
- 会话回填数据：`Session.OutputBuffer` / `OutputBufferMaxBytes`（task_events.go:49-50；持久化见 `session_repository.go`）。
- 前端 API 封装：`web/src/lib/api/`（client.ts/tasks.ts）。
- 前端 `web/package.json` 当前**无** xterm 依赖。
- 工作台页面：`web/src/features/tasks/pages/task-workbench-page.tsx`（团队/运行视图所在）。

## 任务拆解

### T1. 后端：会话输出回填端点
- 新增 `GET /api/sessions/{sessionId}/output` → 返回 `{ sessionId, output, truncated }`，内容取 `Session.OutputBuffer`。
- handler 放 `backend/internal/api/`（参考现有 session 读取路径），路由注册到 `router.go`。
- 复用 `task`/`session` repository 现有读取方法；无则新增最小只读方法。
- 加 handler 测试（参考 `internal/api/*_test.go` 风格）。

### T2. 前端：依赖与终端组件
- 加依赖：`@xterm/xterm`、`@xterm/addon-fit`（可选 `@xterm/addon-search`）。
- 新建 `web/src/features/tasks/components/session-terminal.tsx`：
  - props：`sessionId`、`taskId`、以及来自父级 SSE 分发的 `subscribe(sessionId, cb)` 句柄。
  - 挂载：创建 `Terminal` + `FitAddon`；先 `GET /api/sessions/{sessionId}/output` 回填 `term.write(output)`；再订阅增量 `session:output`（按 sessionId 过滤）`term.write(chunk)`。
  - 卸载：取消订阅 + `term.dispose()`；窗口 resize 调 `fitAddon.fit()`。

### T3. 前端：workbench 单连接 SSE 分发
- 在 `task-workbench-page.tsx`（或其 hook）维护**一个** `EventSource`/SSE 客户端，监听 `session:output`，按 `sessionId` 分发给已注册的终端回调。
- 提供 `subscribe(sessionId, cb)` / `unsubscribe` 给各 `session-terminal` 使用。
- 复用项目已有的 SSE 客户端封装（若有）；无则在 `web/src/lib/api/` 加薄封装。

### T4. 前端：接入 team/run 视图
- 在每个 RUNNING SubTask 卡片/行内嵌入 `session-terminal`（sessionId 来自 team API 的 session 字段）。
- 终端区给固定高度 + 可展开；无 session（未运行）时显示占位。

### T5. 校验
- `cd web && pnpm lint && pnpm build` 通过。
- `cd backend && go test ./...` 通过。
- 手动：启动一个 worker，确认终端实时滚动 + ANSI 颜色 + 刷新后回填。

## 验收标准
1. RUNNING SubTask 显示实时输出终端，带 ANSI 着色与滚动。
2. 刷新页面后通过回填端点恢复已产生的输出。
3. 多个并行 worker 各自独立终端，但共用一条 SSE 连接。
4. lint/build/go test 全绿。

## 不做
- 不做终端输入/反向通道。
- 不做分屏网格布局（属 A4，依赖本组件）。
- 不做下载/导出日志（后续可加）。

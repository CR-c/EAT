# EAT 优化设计：借鉴 cc-pane + 强化 Agent Team 协作

> 目的：以「Engineering Agent Team 提效」为目标，给出两组可落地设计——
> A. 借鉴 [cc-pane](https://github.com/wuxiran/cc-pane) 的成熟能力补齐 EAT 的观感/接入层；
> B. 针对 EAT **现有 agent team 自动对话与协作链路**的真实缺口，给出闭环优化。
>
> 本文所有设计都对齐当前主干（Go 后端 + React 前端 + SQLite + Docker worker），引用了真实文件与符号。落地前以 `docs/PRD.md`、`docs/ARCHITECTURE.md` 为准。

---

## 0. 两个项目的范式对照（先定边界）

| 维度 | cc-pane (CC-Panes) | EAT |
|---|---|---|
| 范式 | 人在**每个终端**里，并行交互式会话 | 人在**审批门**处，编排式自主执行 |
| 栈 | Tauri 2 + Rust + React/Zustand | Go + chi + React/Vite + SQLite |
| 核心单元 | split-pane 里的 live 终端（xterm + portable-pty） | DAG 计划 → SubTask → Docker worker |
| 隔离 | 进程/会话级 | Git 分支 + worktree + Docker 沙箱 |
| 人的角色 | 多开操作员 | 监督者（澄清/审批/审查/合并门） |

**结论**：不照搬 cc-pane 架构（尤其不转 Tauri/Rust）。EAT 的编排骨架已强于 cc-pane；该借的是 cc-pane 打磨成熟的**「观感层 + 接入层」**——live 终端、provider/launch profile、多 CLI adapter、通知、共享记忆。EAT 的 worker 是沙箱内自主执行，因此所有「面板」是**只读观测**，不是 cc-pane 那种双向手动驱动。

---

# A 部分 · 借鉴 cc-pane 的落地设计

落地顺序按 ROI：A1 → A2 → A3 → A4 → A5 → A6。

## A1. Worker live 终端面板（xterm.js，只读）— 最高 ROI

### 现状
- Worker 输出已通过 SSE 事件 `session:output` 实时推送：
  `backend/internal/task/task_events.go:63` `publishSessionOutput` 发出 `{chunk, sessionId, subTaskId, taskId}`；
  orchestrator 侧 `orchestrator.go:454` 调 `AppendSessionOutput` 落盘 + `:464` 发 `chunk` 事件。
- 会话记录已带 `OutputBuffer` / `OutputBufferMaxBytes`（`publishSession`，task_events.go:49-50），可用于「附着时回填」。
- 前端 `web/package.json` **无任何 xterm/terminal 依赖**——目前只有 `task_runtime_view.go` 的 `logsPreview` 纯文本预览，没有真正的终端渲染与 ANSI 着色。

### 设计
只读终端，不需要 PTY 反向通道（worker 在 Docker 里自主跑）。

**前端**
1. 加依赖：`@xterm/xterm` + `@xterm/addon-fit`（+ 可选 `@xterm/addon-search`）。
2. 新增组件 `web/src/features/tasks/components/session-terminal.tsx`：
   - 挂载时创建 `Terminal`，`FitAddon` 自适应；
   - 先用回填数据 `term.write(outputBuffer)`，再订阅 SSE `session:output`（按 `sessionId` 过滤）增量 `term.write(chunk)`；
   - 卸载时 `term.dispose()`。
3. 复用现有 SSE 连接（`GET /api/tasks/{taskId}/events`），在 workbench 顶层维护一个 EventSource，按 `sessionId` 分发到对应终端，避免每个面板各开一条连接。

**后端（最小改动）**
- 新增回填端点 `GET /api/sessions/{sessionId}/output` 返回当前 `OutputBuffer`（附着/刷新/断线重连时拉全量），处理逻辑复用 `session_repository.go` 的读取。
- `session:output` 事件已存在，无需新增事件类型。

### 验收
team 视图里每个 RUNNING SubTask 有一个实时滚动、ANSI 着色的终端；刷新页面后能回填已产生的输出。

---

## A2. 门控通知（gate notifications）— 极低成本，强契合监督范式

### 现状
- `publishTaskStatus`（task_events.go:26）已广播 `task:status`，但没有任何「该你了」的主动提醒；监督者必须盯屏。
- EAT 的范式恰恰是「人在门处」：`PLAN_REVIEW`、`ACTION_REQUIRED`、最终审查、集成/合并冲突都需要人介入。

### 设计
借鉴 cc-pane 的 `cc-notify` 思路，但先做 Web 层，桌面壳成熟后再接系统 tray。

**前端**
1. 在 workbench 的 SSE 分发层加 `notify(event)`：当 `task:status` 进入需人工的状态集合
   `{PLAN_REVIEW, ACTION_REQUIRED}`，或收到 `mailbox:message` 且 `messageType=BLOCKER`、或集成 gate 失败时，调用 `Notification` API。
2. 通过 `web/src/lib/platform.ts` 抽象 `notify()`：Web 端用 `window.Notification`；未来桌面壳经 `window.__EAT_PLATFORM__` 注入原生通知实现（对齐已预留的平台适配层）。
3. 首次进入工作区请求通知权限；用户偏好里加「门控通知开关」，存到现有 project preferences（`PUT /api/projects/{projectId}/preferences`）。

**后端**
- 无需改动（事件已具备）。可选：给需要人工的状态事件加 `"requiresAttention": true` 字段，前端无需维护状态集合白名单。

### 验收
切到别的窗口时，进入 PLAN_REVIEW / ACTION_REQUIRED / BLOCKER / gate 失败会弹系统通知，点击回到对应任务。

---

## A3. Provider + Launch Profile 抽象 — 解锁「按节点选模型」降本提效

### 现状（重要）
provider 配置目前**散落在 spawn 时读进程环境变量**，写死在每个 `spawnXxxWorker`：
- `agent/service.go:356-436` codex：`EAT_CODEX_MODEL` / `OPENAI_API_KEY` / `EAT_CODEX_AUTH_PATH` …
- `:483-490` claude：`EAT_CLAUDE_MODEL` / `ANTHROPIC_API_KEY`
- `:531-542` gemini：`EAT_GEMINI_MODEL` / `GOOGLE_API_KEY` / `GEMINI_API_KEY`

后端**无 provider / launch_profile 抽象**（已确认 grep 为空）。意味着「不同 worker 用不同模型/provider」必须改环境变量、且全局一刀切。

### 设计
借鉴 cc-pane 的 provider 体系（Anthropic/Bedrock/Vertex/OpenAI-compatible/Gemini）+ 可复用 launch profile。

**数据模型（新 migration）**
```
providers(
  id, agent_type,           -- codex-cli / claude-cli / gemini-cli
  display_name,
  base_url,                 -- OpenAI-compatible 代理 / Bedrock / Vertex
  auth_env_json,            -- {"OPENAI_API_KEY": "...", ...} 或引用密钥别名
  model,                    -- 覆盖默认模型
  network_profile,          -- 映射 executionProfile 网络档位
  created_at, updated_at
)
launch_profiles(
  id, display_name,
  agent_type, provider_id,
  execution_profile,        -- default/isolated/internet/host-network/web-preview...
  extra_env_json,
  created_at, updated_at
)
```

**后端**
1. 新建 `backend/internal/provider/`（registry + repository + service），CRUD 落 SQLite。
2. `agent.SpawnConfig`（service.go:24）新增 `ProviderID` / `Model` / `ExtraEnv`。
3. 把 `spawnCodexWorker` / `spawnClaudeWorker` / `spawnGeminiWorker` 里读 `os.Getenv(...)` 的部分改为**优先取解析后的 provider 配置**，env 仅作 fallback——保持向后兼容。
4. API：`/api/providers`、`/api/launch-profiles` 的 CRUD；`/api/agents` 健康检查带上可用 provider。

**编排接入**
- 计划节点现已有 `recommended_agent`（见 task_events.go:95 `agentType`）。扩展为可选 `recommended_profile`；批准物化 SubTask 时固化 `launchProfileId`，`launchSubTask`（orchestrator.go:332）据此解析 provider 后再 spawn。

### 提效价值
难节点用强模型、杂活用便宜模型/本地模型，一键配置而非改代码；同一 team 内混合 provider。直接降本、并行更快。

---

## A4. Split-pane 团队网格视图 — 把「team 现场感」做满

### 现状
team/run board 已有（`task_team_view.go`、`task_board_view.go`），但是看板式状态卡片，不是「N 个会话并排实时跑」。

### 设计（主要是前端）
1. workbench team 视图加「网格 / 分屏」模式：每格 = 一个 worker 单元 = A1 的 live 终端 + 状态徽章 + diff 入口（复用 `GET /api/tasks/{taskId}/diff`）+ 该 SubTask 的 mailbox 摘要。
2. 布局借鉴 cc-pane split-pane：2×2 / 3×N 自适应，可单格放大全屏。
3. 复用现有 team API 拿 SubTask 列表与 sessionId，终端面板复用 A1 组件。

### 验收
一屏看到全部并行 worker 的实时现场，点任一格放大看终端 + diff。

---

## A5. 共享记忆（cc-memory / MCP / 只读挂载）— 减少重复上下文推导

### 现状
- `buildWorkerPrompt`（orchestrator.go:970）只给：task 标题、assignment、branch、依赖、附件、固定 instructions。**没有项目级/任务级的沉淀知识**。
- 每个 worker 都要从零理解项目背景与既有约定。
- 已有「附件只读挂载」机制（buildWorkerPrompt 里 attachments + README 所述只读挂载）。

### 设计
借鉴 cc-pane 的 `cc-memory` + `cc-memory-mcp`，但顺着 EAT 已有的只读挂载落地，先不强依赖 MCP。

**数据模型**
```
memory_notes(
  id, scope,                -- PROJECT / TASK
  project_id, task_id,
  title, body,              -- 结论 / 约定 / 踩坑 / 接口决策
  author,                   -- LEAD / OPERATOR / SUBTASK
  created_at, updated_at
)
```

**落地**
1. Lead 在澄清/规划阶段可写入 PROJECT/TASK 记忆；操作者可手编。
2. Worker 启动时，把相关 memory 渲染成只读文件（如 `.eat/memory.md`）挂进 worktree（复用 attachment 只读挂载路径），并在 `buildWorkerPrompt` 注入指针：「项目记忆见 `.eat/memory.md`」。
3. 进阶（可选）：提供 `cc-memory-mcp` 等价的本地 MCP server，worker 通过 MCP 读/写记忆，实现跨 task 沉淀。

### 提效价值
团队级共识（接口约定、坑、风格）一次沉淀、全员复用，避免每个 worker 重复踩坑/重复解释。

---

## A6. Adapter 拓宽 + Git 可视化 — 持续增强

### Adapter 拓宽
- 现有契约已具雏形：`agent/contract.go` 的 `Adapter{ Name(); SpawnSession() }` + `agent/registry.go`，但只 3 个真实运行时。
- 借鉴 cc-pane 的 `cc-cli-adapters`（Codex/Gemini/Kimi/GLM/OpenCode/Cursor 统一接入）：对照其 adapter 契约（启动命令、健康检查、会话恢复、输出解析），把 EAT 的 `Adapter` 接口补齐 `HealthCheck()` / `ResumeSession()`，逐步新增 kimi/glm/opencode adapter。adapter 越多，team 越能按节点特性派活。

### Git 可视化
- EAT 底层 worktree 用得很重但偏后台。借鉴 cc-pane 把 git 状态 UI 化：
  新增 `GET /api/tasks/{taskId}/git-graph` 返回 base / task-mainline / subtask 分支与 integration 队列的拓扑，前端画分支图。已有 `diff` API 可作节点详情。

---

# B 部分 · 现有 Agent Team 自动对话与协作的分析与优化

## B0. 现状拆解（基于真实代码）

EAT 当前的「协作」链路：
1. **Lead 澄清**（pre-plan）：`task_lead_clarification.go`，人 ↔ Lead 多轮消息，产出计划。
2. **DAG 调度**：批准后物化 SubTask，`orchestrator.go` 按依赖调度并发 worker。依赖满足靠 `areDependenciesSatisfied`（:737）+ `syncSubTaskIntoMainline`（:850）把上游已完成分支合进 mainline。
3. **Mailbox**：`task_mailbox_service.go` 支持 Lead/SubTask/系统发结构化消息（类型含 `NOTE/BLOCKER/DELIVERABLE_READY/TEST_REQUEST/REVIEW_REQUEST/API_CONTRACT/DB_CONTRACT`，带 `RequiresAck`、`SchemaJSON`、`ArtifactRefs`、`FileRefs`、`BranchRef`），并发 `mailbox:message` / `board:activity` 事件。
4. **看板**：`task_board_view.go` 统计 `handoffCount`、`HANDOFF_READY` 等协作状态展示给人。

### 关键缺口（最重要）
> **Mailbox 没有进入 Worker 的执行上下文。** `buildWorkerPrompt`（orchestrator.go:970）只拼 task/assignment/branch/deps/attachments/instructions——**没有任何 mailbox 内容**；orchestrator 全文对 mailbox 的引用为 **0**。

也就是说：
- Worker 之间唯一的真实信息通道是「上游分支被合进 mainline 的代码」——**语义层面的约定（API/DB 契约、决策、阻塞原因）不会传给下游 Worker**。
- 上游 SubTask 的 `RunSummary` 也**没有**注入下游 prompt（RunSummary 只进 team/board 视图给人看）。
- Mailbox 当前实际是「人可见的协作日志」，**不是 agent 之间自动对话的总线**。
- `RequiresAck` / `SchemaJSON` 字段已存在但**没有强制语义**（无人 ack 也能继续）。
- 执行期 Lead **不在环**：Lead 只在 pre-plan 澄清；EXECUTING 期间出现 BLOCKER 或 worker 失败时，没有自动的 Lead 决策，全靠人。

下面针对这些缺口给优化设计。优先级 B1 > B2 > B3 > B4 > B5。

---

## B1. Mailbox 闭环：让消息真正进入 Worker 上下文（最高价值）

### 目标
把 mailbox 从「人看的日志」升级为「agent 之间真正的消息总线」——双向：注入 + 回收。

### 设计
**注入（下行）**：`launchSubTask`（orchestrator.go:332）在 spawn 前，查询本 SubTask 相关 mailbox：
- `targetType=SUBTASK && targetSubTaskId=本节点` 的定向消息；
- 全局广播型契约（`API_CONTRACT` / `DB_CONTRACT`）；
- 未 ack 且 `RequiresAck` 的阻塞项。

渲染进 `buildWorkerPrompt` 新增段落，例如：
```
## Team Handoffs (read before you start)
- [API_CONTRACT from auth-slice] POST /login -> {token}. See branch feat/auth.
- [BLOCKER -> you] DB schema for `users` not finalized; assume column `email` unique.
```

**回收（上行）**：让 Worker 能产出结构化 mailbox。两条路，选其一或并行：
1. **输出协议**：约定 worker 在 stdout 输出 fenced 块
   ` ```eat:mailbox\n{ "type":"API_CONTRACT", "target":"...", "content":"..." }\n``` `；
   在 `handleWorkerExit`（orchestrator.go:477）或输出流里解析，调用现有 `repository.CreateMailboxMessage`。
2. **MCP 工具**（进阶）：给 worker 注入一个 `eat_mailbox_send` MCP 工具，直接落库（与 A5 的 MCP server 合流）。

### 验收
上游 worker 声明的 API/DB 契约会自动出现在下游 worker 的 prompt 里；worker 产出的契约/阻塞自动落 mailbox 并在看板可见——形成真正的「自动对话」。

---

## B2. 上游交付摘要传播（dependency run summary propagation）

### 现状
`buildWorkerPrompt` 对依赖只说「dependency 分支已合进 mainline，你的分支是最新的」（orchestrator.go:988-992），**不带上游做了什么的语义摘要**。下游 worker 得自己读代码反推。

### 设计
- 依赖满足、合并完成后，把每个上游依赖 SubTask 的 `RunSummary`（已持久化，subtask_repository.go）+ 其产出的 `DELIVERABLE_READY` mailbox 注入下游 prompt 的 `## Upstream Deliverables` 段。
- 若 `RunSummary` 为空，退回 `buildDerivedRunSummary`（task_board_view.go 已有）。

### 提效价值
下游 worker 直接得到「上游交付了什么接口/产物」，减少反推代码的 token 与试错，并行链路更顺。

---

## B3. 执行期 Lead 在环（supervisor-in-the-loop triage）

### 现状
EXECUTING 期间 Lead 休眠。出现 `BLOCKER` mailbox 或 worker 失败（`failSubTaskLaunch` orchestrator.go:590 / `handleWorkerExit`）时，目前要么自动 retry，要么转 `ACTION_REQUIRED` 等人。Lead 的编排智能没用上。

### 设计
- 引入 Lead **triage 回合**（复用已有 `RunLeadTurn` / `LeadTurnRunner`，service.go:216）：
  当收到 `BLOCKER` mailbox、或 worker 非零退出、或最终审查 `REWORK_REQUIRED` 时，自动触发一次 Lead turn，输入「当前计划 + 失败上下文 + mailbox」，让 Lead 在受限动作集里产出决策：
  `{ ANSWER_BLOCKER | REASSIGN | RETRY_WITH_HINT | LOCAL_REPLAN | ESCALATE_TO_HUMAN }`。
- 决策走现有子任务控制 API（retry / reassign / agent-change / replan-request）。`ESCALATE_TO_HUMAN` 才转 `ACTION_REQUIRED` + 触发 A2 通知。
- 加预算/次数上限（如每 SubTask 最多 N 次自动 triage）防止 Lead↔Worker 死循环，超限即升级给人。

### 提效价值
大量「可由 Lead 当场解决」的阻塞不再打断人；人只在真正需要决策时被叫醒。这是「agent team 提效」的核心。

---

## B4. 结构化交接的 schema 校验 + ack 闭环

### 现状
`CreateMailboxMessageInput` 已有 `SchemaJSON` / `RequiresAck`（repository.go:292 区域、mailbox_service.go:89-90），但**没有强制**：契约消息不校验结构，`RequiresAck` 也无人 ack 仍可推进。

### 设计
- 对 `API_CONTRACT` / `DB_CONTRACT` 定义 JSON schema，发送时用 `SchemaJSON` 校验，不合规拒收并提示。
- `RequiresAck=true` 的消息：下游 SubTask 在 prompt 里被要求确认（产出一条 ack mailbox），未 ack 的关键契约可阻止其进入合并门（gate 检查接入 `task_integration_service.go`）。

### 提效价值
跨 worker 的接口契约从「自由文本备注」变成「可校验、可追踪、必须确认」的工程约束，减少集成期返工。

---

## B5. Git 写锁粒度优化（吞吐）

### 现状
README/ARCHITECTURE 述：同一 Git 项目下所有会改仓库状态的写操作**全部串行化**，避免互相污染。多任务/多 worker 并发时这是吞吐瓶颈。

### 设计（谨慎、需测）
- 评估把「仓库级全局写锁」细化为**按 task-mainline 分支的锁**：不同任务的 mainline 互不影响时可并行；仅在触及共享 ref（如 base 分支、最终 merge 到目标分支）时升级为仓库级锁。
- worktree 本身已隔离，多数 worker 内的提交不需要全局锁；真正需要串行的是对 mainline/目标分支的合并与 ref 更新。
- 必须配套并发测试（参考 orchestrator/integration_engine 的现有测试）验证无 ref 竞争。

### 提效价值
解开多任务并行的 Git 串行瓶颈，提升整体 team 吞吐。

---

# C. 实施路线建议（按 ROI 排序）

| 优先级 | 项目 | 类型 | 主要改动面 |
|---|---|---|---|
| P0 | **B1 Mailbox 闭环** | 协作核心 | orchestrator buildWorkerPrompt / handleWorkerExit |
| P0 | **A1 Worker live 终端** | 可观测性 | 前端 xterm + 回填端点 |
| P1 | **B2 上游交付摘要传播** | 协作 | buildWorkerPrompt |
| P1 | **A2 门控通知** | 监督提效 | 前端 + platform.ts |
| P1 | **B3 Lead 执行期在环** | 协作核心 | orchestrator + RunLeadTurn |
| P2 | **A3 Provider/Launch Profile** | 降本 | provider 包 + migration + spawn 改造 |
| P2 | **A4 分屏网格视图** | 观感 | 前端（依赖 A1） |
| P2 | **B4 契约 schema/ack** | 协作质量 | mailbox + integration gate |
| P3 | **A5 共享记忆** | 提效 | memory 包 + 只读挂载/MCP |
| P3 | **A6 adapter/git 可视化** | 扩展 | agent adapter + 前端 |
| P3 | **B5 Git 锁粒度** | 吞吐 | git 串行化层（需并发测试） |

> 共识：**先做 B1 + A1**。B1 让 team 真正"对话"起来（当前最大缺口），A1 让监督者"看得见"team 在干什么——两者叠加，"agent team 提效"的体感提升最大、风险最低。

---

## 附：明确不要借鉴的

- ❌ Tauri/Rust 重写——与 Go 主路径冲突，收益不抵成本（桌面壳走已预留的 `platform.ts` + `window.__EAT_PLATFORM__`）。
- ❌ 双向交互 PTY 驱动 worker——破坏「沙箱内自主执行 + 审批门」隔离契约；worker 面板只读。
- ❌ 以「人多开终端」为中心的布局哲学——EAT 的人是监督者，面板服务于"监督 N 个自主 worker"，非"手动驱动 N 个会话"。
- ❌ 全功能 Monaco 编辑器——监督式范式下优先只读 diff/文件查看。

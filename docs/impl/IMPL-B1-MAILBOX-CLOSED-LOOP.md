# 实施计划 B1 · Mailbox 闭环（让消息进入 Worker 执行上下文）

> 目标：把 mailbox 从「人可见日志」升级为 agent 之间真正的消息总线——
> **下行注入**（相关 mailbox 进入 Worker prompt）+ **上行回收**（Worker 输出结构化 mailbox 自动落库）。
> 上层背景见 `docs/CC-PANE-BORROW-AND-COLLAB-DESIGN.md` B1 节。

## 范围与约束
- 只改后端 Go；不引入新依赖；保持向后兼容（无 mailbox 时行为不变）。
- 不破坏 Docker 沙箱隔离与「人在审批门」范式。
- 全程 `cd backend && go test ./...` 必须通过；新增逻辑要有单测。

## 现状锚点（实施前先读这些）
- `backend/internal/orchestrator/orchestrator.go:970` `buildWorkerPrompt`：当前**不含 mailbox**。
- `orchestrator.go:332` `launchSubTask`：spawn 入口，prompt 在此构建。
- `orchestrator.go:477` `handleWorkerExit`：worker 退出处理（上行解析挂这里）。
- `backend/internal/task/mailbox_repository.go`：`CreateMailboxMessage` / `ListMailboxMessagesByTaskID`。
- `backend/internal/task/task_mailbox_service.go`：mailbox 语义、消息类型常量。
- `backend/internal/task/repository.go:133` `MailboxMessage`、`:292` `CreateMailboxMessageInput`。
- orchestrator 通过 `TaskRepository` 接口（orchestrator.go:39 附近）访问仓储——新增读取方法要在该接口 + `task_repository_adapter.go` 同步暴露。

## 任务拆解

### T1. 仓储层：按 SubTask 查询相关 mailbox
- 在 `mailbox_repository.go` 新增 `ListMailboxMessagesForSubTask(ctx, taskID, subTaskID)`：返回
  (a) `targetType=SUBTASK && targetSubTaskId=subTaskID` 的定向消息；
  (b) 广播契约 `messageType IN (API_CONTRACT, DB_CONTRACT)`；
  (c) `requiresAck=true` 且未被本 subtask ack 的消息。
- 在 orchestrator 的 `TaskRepository` 接口（orchestrator.go:39 区）+ `task_repository_adapter.go` 增加对应转发方法。

### T2. 下行注入：buildWorkerPrompt 增加 Team Handoffs 段
- 修改 `buildWorkerPrompt` 签名，增传 `[]MailboxMessage`（或在 `launchSubTask` 内查询后传入）。
- 渲染新段落（仅当非空时输出）：
  ```
  ## Team Handoffs (read before you start)
  - [API_CONTRACT from <senderBranch>] <content> (branch: <branchRef>)
  - [BLOCKER -> you] <content>
  ```
- `launchSubTask` 在构建 prompt 前调用 T1 的查询。

### T3. 上行回收：解析 Worker 输出的结构化 mailbox
- 约定输出协议：worker 在 stdout 输出 fenced 块
  ````
  ```eat:mailbox
  {"type":"API_CONTRACT","targetType":"LEAD","content":"...","branchRef":"..."}
  ```
  ````
- 在 `handleWorkerExit`（orchestrator.go:477）读取该 session 的输出缓冲（已有 `OutputBuffer`），用正则/扫描提取所有 `eat:mailbox` 块，逐条 `json.Unmarshal` 后调 `CreateMailboxMessage`（sender=该 subtask）。
- 解析失败的块跳过并记日志，不影响 worker 退出主流程。
- 复用现有发布：CreateMailboxMessage 后已有 `mailbox:message`/`board:activity` 事件（在 service 层）；若在 orchestrator 直接写库，需补发等价事件（参考 orchestrator.go:722 `publish`）。

### T4. Worker prompt 告知协议
- 在 `buildWorkerPrompt` 的 `## Instructions` 段追加一条：
  「如需向 Lead 或其他子任务交接 API/DB 契约、阻塞、交付就绪，请在 stdout 输出 `eat:mailbox` JSON 块（schema：type/targetType/targetSubTaskId/content/branchRef）。」

### T5. 测试
- 单测 T1 查询过滤逻辑（含三类消息）。
- 单测 buildWorkerPrompt 含/不含 mailbox 两种渲染。
- 单测上行解析：多块、坏块、空输出。
- `cd backend && go test ./...` 全绿。

## 验收标准
1. 上游 worker 输出 `eat:mailbox` 契约后，该消息在看板出现，并在下游相关 worker 的 prompt `## Team Handoffs` 段出现。
2. 无 mailbox 时 prompt 与现状逐字节一致（向后兼容）。
3. 所有 Go 测试通过。

## 不做
- 不做 MCP 工具通道（留给 A5/后续）。
- 不做 schema 强校验与 ack 阻断（属 B4）。
- 不改前端（事件已存在，前端展示是 A 部分）。

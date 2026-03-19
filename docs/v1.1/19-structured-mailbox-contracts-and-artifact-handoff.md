# Phase 19 - Structured Mailbox, Contracts And Artifact Handoff

## 目标

把 phase 16 的基础 mailbox 扩展成真正可支撑 team 协作的结构化 handoff 层。

这一阶段完成后，agent 之间传递的不应只是自由文本，还应包括：

- 合同信息
- 交付物引用
- 接口说明
- 阻塞与请求
- 结果确认

## 为什么需要这一阶段

当前 mailbox 已经能做：

- lead -> subtask note
- upstream -> downstream 自动 note

但对于真实全栈任务还不够，因为下游常常需要的是结构化信息，例如：

- API endpoint contract
- env / migration requirements
- test commands
- file locations
- branch references

如果继续只靠自由文本，复杂任务很快会变成 prompt 垃圾堆。

## 范围

本阶段内：

- 扩展 mailbox 消息类型
- 支持 artifact / contract 引用
- 支持 subtask -> lead
- 支持 subtask -> subtask 主动发信
- 在 worker prompt 中按类型注入 handoff

本阶段外：

- 跨 task 消息
- 跨项目共享知识库
- 多用户权限体系

## 建议消息类型

- `NOTE`
- `BLOCKER`
- `DELIVERABLE_READY`
- `API_CONTRACT`
- `DB_CONTRACT`
- `TEST_REQUEST`
- `REVIEW_REQUEST`

## 建议 payload 扩展

除原有字段外，增加：

- `messageType`
- `artifactRefs[]`
- `branchRef?`
- `fileRefs[]`
- `schemaJson?`
- `requiresAck`

## 产品决策

### 1. mailbox 仍然 append-only

不引入“编辑历史覆盖”。

需要保留：

- 谁发的
- 发给谁
- 当时引用了什么 artifact

### 2. prompt 注入要按类型裁剪

worker prompt 中不应简单拼接所有消息，而应：

- 优先注入最新合同
- 其次注入 blocker / deliverable_ready
- 保留少量摘要文本

### 3. handoff 可见性必须强

在 Web 中，用户必须能看见：

- 一个节点收到了哪些合同
- 它又向谁发了哪些交付物

否则监督会失效。

## 交付物

- mailbox schema 扩展
- contract-aware API
- handoff timeline UI
- artifact reference rendering
- prompt 注入策略升级

## UI 任务

- 在 focused execution panel 中区分：
  - inbox
  - outbox
  - blockers
  - contracts
- 支持手动发送结构化消息
- 支持查看 artifact 引用和 file refs

## 测试与验收

验收标准：

- subtask 可以主动给 lead 发消息
- 下游可收到结构化合同而非纯文本
- worker prompt 注入按类型裁剪后仍然完整可用
- Web 中可追踪 handoff 链路

建议测试：

- mailbox typed payload persistence
- API contract handoff -> downstream prompt injection
- subtask -> lead blocker flow
- artifact refs reload correctness

## 输出给下一阶段

phase 20 将以这些结构化消息为输入，构建真正可监督的 live operations board。

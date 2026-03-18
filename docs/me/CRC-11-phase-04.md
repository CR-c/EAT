# CRC-11 Phase 04

父任务：

- `CRC-11` Phase 04 - Lead Session Chat Flow

阶段文档：

- `docs/phase/04-lead-session-chat-flow.md`

子任务顺序：

1. `CRC-34`
2. `CRC-35`
3. `CRC-36`
4. `CRC-37`

父任务 `CRC-11` 要做的事：

- 检查 `CRC-34` 到 `CRC-37` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 联调 task persistence、task create API、clarification 事件流、clarification UI
- 核对 reload persistence 和 unhealthy lead-agent handling
- 确认可以进入 Phase 05 的 planning 流程

## CRC-34

```text
实现 EAT 项目的子任务 CRC-34。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-34 CRC-11 / P4.1 Task And Session Persistence Layer
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按标准顺序阅读文档，以及 CRC-11 和 CRC-34 的 issue 描述。

本次只做：
- Task / Message / Attachment / AgentSession 持久化层
- baseCommitSha required field

不要实现：
- task 创建 API
- clarification chat UI

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-35 是否已解锁
```

## CRC-35

```text
实现 EAT 项目的子任务 CRC-35。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-35 CRC-11 / P4.2 Task Creation API And Attachment Handling
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按标准顺序阅读文档，以及 CRC-11 和 CRC-35 的 issue 描述。

本次只做：
- task creation endpoint
- task-scoped attachment persistence
- attachment validation

不要实现：
- lead session clarification 事件流
- chat UI

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-36 是否已解锁
```

## CRC-36

```text
实现 EAT 项目的子任务 CRC-36。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-36 CRC-11 / P4.3 Lead Session Clarification Event Flow
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按标准顺序阅读文档，以及 CRC-11 和 CRC-36 的 issue 描述。

本次只做：
- task:start-clarification
- task:message
- task:confirm-requirements
- lead session spawn
- clarification transcript persistence

不要实现：
- plan generation
- clarification UI

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-37 是否已解锁
```

## CRC-37

```text
实现 EAT 项目的子任务 CRC-37。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-37 CRC-11 / P4.4 Task Creation And Clarification UI
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按标准顺序阅读文档，以及 CRC-11 和 CRC-37 的 issue 描述。

本次只做：
- task creation UI
- clarification chat UI
- unhealthy lead agent 提示
- attachment validation error 展示

不要实现：
- plan generation UI

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- Phase 04 是否可收尾
```

## 父任务 CRC-11 收尾提示词

```text
对 EAT 项目的父任务 CRC-11 Phase 04 - Lead Session Chat Flow 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始前请按顺序阅读标准文档，以及父任务 CRC-11 和已完成子任务 CRC-34、CRC-35、CRC-36、CRC-37 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 task create、attachment handling、lead clarification event flow、clarification UI
- 核对 task 状态是否能正确从 DRAFT 到 CLARIFYING 到 PLANNING
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 05 planning 功能
- 后续 execution / review / merge 功能

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 05
```

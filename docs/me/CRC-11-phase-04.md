# CRC-11 Phase 04

父任务：

- `CRC-11` Phase 04 - Lead Session Chat Flow

阶段文档：

- `docs/phase/04-lead-session-chat-flow.md`

内部开发顺序：

1. `CRC-34` Task / Message / Attachment / AgentSession persistence
2. `CRC-35` task creation API and lead-session spawn
3. `CRC-36` clarification event flow and message persistence
4. `CRC-37` clarification UI and explicit requirement confirmation

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-11`。
2. 只从父任务 `CRC-11` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-11` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-11` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 task create、attachment handling、lead clarification event flow、clarification UI 和状态流转
- 对照 `docs/phase/04-lead-session-chat-flow.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 05 做好准备

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

## 父任务 CRC-11 执行提示词

```text
实现 EAT 项目的父任务 CRC-11 Phase 04 - Lead Session Chat Flow，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/04-lead-session-chat-flow.md
父任务：CRC-11 Phase 04 - Lead Session Chat Flow

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/04-lead-session-chat-flow.md
8. 父任务 CRC-11 的 issue 描述
9. docs/me/CRC-11-phase-04.md

执行规则：
- 只使用父任务 CRC-11 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-34 Task / Message / Attachment / AgentSession persistence
2. CRC-35 task creation API and lead-session spawn
3. CRC-36 clarification event flow and message persistence
4. CRC-37 clarification UI and explicit requirement confirmation
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 task create、attachment handling、lead clarification event flow、clarification UI 和状态流转

不要实现：
- Phase 05 planning 功能
- 后续 execution / review / merge 功能

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 05
```

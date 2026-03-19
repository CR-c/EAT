# CRC-16 Phase 09

父任务：

- `CRC-16` Phase 09 - Realtime Output Streaming And Summary UX

阶段文档：

- `docs/phase/09-realtime-output-streaming-and-summary-ux.md`

内部开发顺序：

1. `CRC-54` session log persistence and bounded tail buffer
2. `CRC-55` realtime SSE routing and lifecycle event consumption
3. `CRC-56` summary-first execution board and selected session state
4. `CRC-57` focused terminal surface and noisy-worker verification

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-16`。
2. 只从父任务 `CRC-16` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-16` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-16` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 session log、`outputBuffer`、SSE output routing、summary-first execution board、focused terminal 和并发噪声场景
- 对照 `docs/phase/09-realtime-output-streaming-and-summary-ux.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 10 做好准备

## CRC-54

```text
实现 EAT 项目的子任务 CRC-54。

仓库路径：/home/code/EAT
父任务：CRC-16 Phase 09 - Realtime Output Streaming And Summary UX
子任务：CRC-54 CRC-16 / P9.1 Session Log Persistence And Tail Buffer
阶段文档：docs/phase/09-realtime-output-streaming-and-summary-ux.md

开始编码前，请按标准顺序阅读文档，以及 CRC-16 和 CRC-54 的 issue 描述。

本次只做：
- worker / lead session 全量日志落盘到 logPath
- outputBuffer tail truncation
- outputBufferMaxBytes 边界处理
- 为后续 review 复用日志路径与 tail 数据

不要实现：
- 前端 execution board
- focused terminal 交互

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
- CRC-55 是否已解锁
```

## CRC-55

```text
实现 EAT 项目的子任务 CRC-55。

仓库路径：/home/code/EAT
父任务：CRC-16 Phase 09 - Realtime Output Streaming And Summary UX
子任务：CRC-55 CRC-16 / P9.2 SSE Session Output Routing
阶段文档：docs/phase/09-realtime-output-streaming-and-summary-ux.md

开始编码前，请按标准顺序阅读文档，以及 CRC-16 和 CRC-55 的 issue 描述。

本次只做：
- `session:started`
- `session:output`
- `session:ended`
- `subtask:status` 与 session 事件按 taskId / subtaskId / sessionId 正确路由
- 前端不再只靠整页 reload 处理执行输出

不要实现：
- review 逻辑
- merge 逻辑

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
- CRC-56 是否已解锁
```

## CRC-56

```text
实现 EAT 项目的子任务 CRC-56。

仓库路径：/home/code/EAT
父任务：CRC-16 Phase 09 - Realtime Output Streaming And Summary UX
子任务：CRC-56 CRC-16 / P9.3 Summary-First Execution Board
阶段文档：docs/phase/09-realtime-output-streaming-and-summary-ux.md

开始编码前，请按标准顺序阅读文档，以及 CRC-16 和 CRC-56 的 issue 描述。

本次只做：
- subtask summary cards
- status / assigned agent / retry count / latest session / tail preview 展示
- selected subtask / selected session 的前端状态
- retry 后的 session restart 清晰可见

不要实现：
- incremental review
- final review

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
- CRC-57 是否已解锁
```

## CRC-57

```text
实现 EAT 项目的子任务 CRC-57。

仓库路径：/home/code/EAT
父任务：CRC-16 Phase 09 - Realtime Output Streaming And Summary UX
子任务：CRC-57 CRC-16 / P9.4 Focused Terminal And Concurrency Verification
阶段文档：docs/phase/09-realtime-output-streaming-and-summary-ux.md

开始编码前，请按标准顺序阅读文档，以及 CRC-16 和 CRC-57 的 issue 描述。

本次只做：
- 单一 focused terminal / console surface
- ANSI-safe live output render
- noisy concurrent workers 下的 routing correctness 验证
- UI responsiveness 与 execution panel 收尾

不要实现：
- incremental review
- merge flow

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
- Phase 09 是否可收尾
```

## 父任务 CRC-16 执行提示词

```text
实现 EAT 项目的父任务 CRC-16 Phase 09 - Realtime Output Streaming And Summary UX，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/09-realtime-output-streaming-and-summary-ux.md
父任务：CRC-16 Phase 09 - Realtime Output Streaming And Summary UX

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/09-realtime-output-streaming-and-summary-ux.md
8. 父任务 CRC-16 的 issue 描述
9. docs/me/CRC-16-phase-09.md

执行规则：
- 只使用父任务 CRC-16 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-54 session log persistence and bounded tail buffer
2. CRC-55 realtime SSE routing and lifecycle event consumption
3. CRC-56 summary-first execution board and selected session state
4. CRC-57 focused terminal surface and noisy-worker verification
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调日志落盘、tail buffer、SSE streaming、summary-first execution board 和 focused terminal

不要实现：
- Phase 10 incremental review / rework
- merge / cleanup / metrics

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 10
```

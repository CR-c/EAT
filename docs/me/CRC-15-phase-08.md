# CRC-15 Phase 08

父任务：

- `CRC-15` Phase 08 - Worker Session Manager And Concurrent Execution

阶段文档：

- `docs/phase/08-worker-session-manager-and-concurrent-execution.md`

内部开发顺序：

1. `CRC-50` branch naming and collision resolution
2. `CRC-51` worktree creation and persistence
3. `CRC-52` worker launch, attachment filtering, and session ownership
4. `CRC-53` retry flow and concurrent execution safeguards

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-15`。
2. 只从父任务 `CRC-15` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-15` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-15` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 branch naming、worktree、worker launch、attachment filtering、retry、execution state machine 和 concurrent execution 约束
- 对照 `docs/phase/08-worker-session-manager-and-concurrent-execution.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 09 做好准备

## CRC-50

```text
实现 EAT 项目的子任务 CRC-50。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-50 CRC-15 / P8.1 Branch Naming And Collision Resolution
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按标准顺序阅读文档，以及 CRC-15 和 CRC-50 的 issue 描述。

本次只做：
- deterministic branch naming
- numeric suffix collision resolution
- persist resolved branchName
- emit branch:renamed

不要实现：
- worktree create
- worker session launch

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
- CRC-51 是否已解锁
```

## CRC-51

```text
实现 EAT 项目的子任务 CRC-51。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-51 CRC-15 / P8.2 Worktree Creation And Persistence
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按标准顺序阅读文档，以及 CRC-15 和 CRC-51 的 issue 描述。

本次只做：
- 从 baseCommitSha 创建 worktree
- persist worktreePath
- setup failure -> actionable state

不要实现：
- worker launch
- attachment filtering

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
- CRC-52 是否已解锁
```

## CRC-52

```text
实现 EAT 项目的子任务 CRC-52。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-52 CRC-15 / P8.3 Worker Session Launch And Attachment Filtering
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按标准顺序阅读文档，以及 CRC-15 和 CRC-52 的 issue 描述。

本次只做：
- worker AgentSession rows
- sandbox manager 启动 worker
- attachment filtering by capability
- included / excluded attachment metadata exposure

不要实现：
- retry flow
- review phase

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
- CRC-53 是否已解锁
```

## CRC-53

```text
实现 EAT 项目的子任务 CRC-53。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-53 CRC-15 / P8.4 Retry Flow And Execution State Machine
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按标准顺序阅读文档，以及 CRC-15 和 CRC-53 的 issue 描述。

本次只做：
- subtask:retry
- retryCount 增长
- PENDING -> READY -> RUNNING 状态机
- branch / setup failure -> ACTION_REQUIRED
- 防止同一 subtask 出现重复 live session

不要实现：
- incremental review
- final review
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
- Phase 08 是否可收尾
```

## 父任务 CRC-15 执行提示词

```text
实现 EAT 项目的父任务 CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/08-worker-session-manager-and-concurrent-execution.md
8. 父任务 CRC-15 的 issue 描述
9. docs/me/CRC-15-phase-08.md

执行规则：
- 只使用父任务 CRC-15 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-50 branch naming and collision resolution
2. CRC-51 worktree creation and persistence
3. CRC-52 worker launch, attachment filtering, and session ownership
4. CRC-53 retry flow and concurrent execution safeguards
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 branch naming、worktree、worker launch、attachment filtering、retry、execution state machine 和 concurrent execution 约束

不要实现：
- Phase 09 output streaming / terminal UX
- review / merge 逻辑

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 09
```

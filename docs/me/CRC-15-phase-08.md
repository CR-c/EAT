# CRC-15 Phase 08

父任务：

- `CRC-15` Phase 08 - Worker Session Manager And Concurrent Execution

阶段文档：

- `docs/phase/08-worker-session-manager-and-concurrent-execution.md`

子任务顺序：

1. `CRC-50`
2. `CRC-51`
3. `CRC-52`
4. `CRC-53`

父任务 `CRC-15` 要做的事：

- 检查 `CRC-50` 到 `CRC-53` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 联调 branch naming、worktree creation、worker launch、attachment filtering、retry、execution state machine
- 核对 concurrent execution 和 duplicate live session 约束
- 确认仓库已准备好进入 Phase 09

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

## 父任务 CRC-15 收尾提示词

```text
对 EAT 项目的父任务 CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始前请按顺序阅读标准文档，以及父任务 CRC-15 和已完成子任务 CRC-50、CRC-51、CRC-52、CRC-53 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 branch naming、worktree、worker launch、attachment filtering、retry、execution state machine
- 验证 concurrent execution 与 duplicate live session 防护
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 09 output streaming / terminal UX
- review / merge 逻辑

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 09
```

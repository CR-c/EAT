# CRC-20 Phase 13

父任务：

- `CRC-20` Phase 13 - Worktree Cleanup And Terminal Warnings

阶段文档：

- `docs/phase/13-worktree-cleanup-and-terminal-warnings.md`

内部开发顺序：

1. `CRC-70` terminal transition detection and cleanup runner
2. `CRC-71` cleanup warning persistence and reload support
3. `CRC-72` cleanup warning UI and operator guidance
4. `CRC-73` locked/missing worktree verification and non-regression

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-20`。
2. 只从父任务 `CRC-20` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-20` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-20` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 terminal task transition、worktree cleanup、warning persistence、reload 展示和 operator guidance
- 对照 `docs/phase/13-worktree-cleanup-and-terminal-warnings.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 14 做好准备

## CRC-70

```text
实现 EAT 项目的子任务 CRC-70。

仓库路径：/home/code/EAT
父任务：CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings
子任务：CRC-70 CRC-20 / P13.1 Terminal Transition And Cleanup Runner
阶段文档：docs/phase/13-worktree-cleanup-and-terminal-warnings.md

开始编码前，请按标准顺序阅读文档，以及 CRC-20 和 CRC-70 的 issue 描述。

本次只做：
- terminal task transition detection
- worktree cleanup runner
- `COMPLETED` / `FAILED` / `CANCELLED` cleanup 触发
- cleanup 不回滚 terminal status

不要实现：
- warning UI
- metrics

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
- CRC-71 是否已解锁
```

## CRC-71

```text
实现 EAT 项目的子任务 CRC-71。

仓库路径：/home/code/EAT
父任务：CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings
子任务：CRC-71 CRC-20 / P13.2 Cleanup Warning Persistence And Reload
阶段文档：docs/phase/13-worktree-cleanup-and-terminal-warnings.md

开始编码前，请按标准顺序阅读文档，以及 CRC-20 和 CRC-71 的 issue 描述。

本次只做：
- `task:cleanup-warning`
- warning persistence
- task detail reload 后仍可见 warning context
- cleanup failure metadata 标准化

不要实现：
- metrics export
- unrelated merge logic

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
- CRC-72 是否已解锁
```

## CRC-72

```text
实现 EAT 项目的子任务 CRC-72。

仓库路径：/home/code/EAT
父任务：CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings
子任务：CRC-72 CRC-20 / P13.3 Cleanup Warning UI
阶段文档：docs/phase/13-worktree-cleanup-and-terminal-warnings.md

开始编码前，请按标准顺序阅读文档，以及 CRC-20 和 CRC-72 的 issue 描述。

本次只做：
- cleanup warning UI
- manual cleanup guidance
- terminal task 仍保持 terminal 的前端表达
- warning copy/actionability 收尾

不要实现：
- metrics dashboard
- export API

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
- CRC-73 是否已解锁
```

## CRC-73

```text
实现 EAT 项目的子任务 CRC-73。

仓库路径：/home/code/EAT
父任务：CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings
子任务：CRC-73 CRC-20 / P13.4 Cleanup Edge Cases And Verification
阶段文档：docs/phase/13-worktree-cleanup-and-terminal-warnings.md

开始编码前，请按标准顺序阅读文档，以及 CRC-20 和 CRC-73 的 issue 描述。

本次只做：
- missing / locked / already-deleted worktree 场景验证
- cleanup warning 非回滚语义验证
- Phase 13 收尾和非回归测试

不要实现：
- metrics
- analytics pipeline

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
- Phase 13 是否可收尾
```

## 父任务 CRC-20 执行提示词

```text
实现 EAT 项目的父任务 CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/13-worktree-cleanup-and-terminal-warnings.md
父任务：CRC-20 Phase 13 - Worktree Cleanup And Terminal Warnings

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/13-worktree-cleanup-and-terminal-warnings.md
8. 父任务 CRC-20 的 issue 描述
9. docs/me/CRC-20-phase-13.md

执行规则：
- 只使用父任务 CRC-20 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-70 terminal transition detection and cleanup runner
2. CRC-71 cleanup warning persistence and reload support
3. CRC-72 cleanup warning UI and operator guidance
4. CRC-73 locked/missing worktree verification and non-regression
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 cleanup trigger、warning persistence、reload visibility 和 cleanup failure 不回滚 terminal task 的约束

不要实现：
- Phase 14 metrics / export
- 新的 review / merge 功能

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 14
```

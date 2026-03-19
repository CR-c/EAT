# CRC-19 Phase 12

父任务：

- `CRC-19` Phase 12 - Merge Flow And Rebase Retry

阶段文档：

- `docs/phase/12-merge-flow-and-rebase-retry.md`

内部开发顺序：

1. `CRC-66` MergeRecord schema and stable merge executor
2. `CRC-67` conflict capture and ACTION_REQUIRED routing
3. `CRC-68` rebase-and-retry flow and merge resume
4. `CRC-69` merge history UI, dirty-target recovery, and completion checks

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-19`。
2. 只从父任务 `CRC-19` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-19` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-19` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 MergeRecord 历史、stable merge order、conflict recovery、Rebase & Retry 和 dirty target recovery
- 对照 `docs/phase/12-merge-flow-and-rebase-retry.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 13 做好准备

## CRC-66

```text
实现 EAT 项目的子任务 CRC-66。

仓库路径：/home/code/EAT
父任务：CRC-19 Phase 12 - Merge Flow And Rebase Retry
子任务：CRC-66 CRC-19 / P12.1 MergeRecord Schema And Stable Merge Executor
阶段文档：docs/phase/12-merge-flow-and-rebase-retry.md

开始编码前，请按标准顺序阅读文档，以及 CRC-19 和 CRC-66 的 issue 描述。

本次只做：
- `MergeRecord` persistence
- accepted subtasks stable creation order merge
- `--no-ff`
- merge success history append

不要实现：
- conflict recovery UI
- rebase retry

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
- CRC-67 是否已解锁
```

## CRC-67

```text
实现 EAT 项目的子任务 CRC-67。

仓库路径：/home/code/EAT
父任务：CRC-19 Phase 12 - Merge Flow And Rebase Retry
子任务：CRC-67 CRC-19 / P12.2 Conflict Capture And Action Routing
阶段文档：docs/phase/12-merge-flow-and-rebase-retry.md

开始编码前，请按标准顺序阅读文档，以及 CRC-19 和 CRC-67 的 issue 描述。

本次只做：
- merge conflict detection
- `MergeRecord status = CONFLICT`
- `ACTION_REQUIRED` routing
- merge stop-on-conflict 行为

不要实现：
- rebase retry
- cleanup

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
- CRC-68 是否已解锁
```

## CRC-68

```text
实现 EAT 项目的子任务 CRC-68。

仓库路径：/home/code/EAT
父任务：CRC-19 Phase 12 - Merge Flow And Rebase Retry
子任务：CRC-68 CRC-19 / P12.3 Rebase Retry And Merge Resume
阶段文档：docs/phase/12-merge-flow-and-rebase-retry.md

开始编码前，请按标准顺序阅读文档，以及 CRC-19 和 CRC-68 的 issue 描述。

本次只做：
- `subtask:rebase-retry`
- `MergeRecord operation = REBASE`
- rebase success / conflict persistence
- blocked merge path resume

不要实现：
- metrics
- cleanup warning UI

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
- CRC-69 是否已解锁
```

## CRC-69

```text
实现 EAT 项目的子任务 CRC-69。

仓库路径：/home/code/EAT
父任务：CRC-19 Phase 12 - Merge Flow And Rebase Retry
子任务：CRC-69 CRC-19 / P12.4 Merge History UI And Recovery Controls
阶段文档：docs/phase/12-merge-flow-and-rebase-retry.md

开始编码前，请按标准顺序阅读文档，以及 CRC-19 和 CRC-69 的 issue 描述。

本次只做：
- merge attempt history UI
- `task:resume`
- dirty target branch recovery
- merge completion / partial success 验收

不要实现：
- cleanup
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
- Phase 12 是否可收尾
```

## 父任务 CRC-19 执行提示词

```text
实现 EAT 项目的父任务 CRC-19 Phase 12 - Merge Flow And Rebase Retry，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/12-merge-flow-and-rebase-retry.md
父任务：CRC-19 Phase 12 - Merge Flow And Rebase Retry

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/12-merge-flow-and-rebase-retry.md
8. 父任务 CRC-19 的 issue 描述
9. docs/me/CRC-19-phase-12.md

执行规则：
- 只使用父任务 CRC-19 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-66 MergeRecord schema and stable merge executor
2. CRC-67 conflict capture and ACTION_REQUIRED routing
3. CRC-68 rebase-and-retry flow and merge resume
4. CRC-69 merge history UI, dirty-target recovery, and completion checks
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 merge history append-only、conflict routing、Rebase & Retry、dirty target recovery 和 partial-success merge 状态

不要实现：
- Phase 13 cleanup warning
- metrics / export

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 13
```

# CRC-13 Phase 06

父任务：

- `CRC-13` Phase 06 - Plan Review UI And History Restore

阶段文档：

- `docs/phase/06-plan-review-ui-and-history-restore.md`

内部开发顺序：

1. `CRC-42` editable plan review UI
2. `CRC-43` server-side revalidation for edited draft
3. `CRC-44` history restore flow and restored state handling
4. `CRC-45` approval gating and UX safeguards

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-13`。
2. 只从父任务 `CRC-13` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-13` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-13` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 editable review、revalidation、restore flow、restore event 和 approval guard
- 对照 `docs/phase/06-plan-review-ui-and-history-restore.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 07 做好准备

## CRC-42

```text
实现 EAT 项目的子任务 CRC-42。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-42 CRC-13 / P6.1 Editable Plan Review UI
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按标准顺序阅读文档，以及 CRC-13 和 CRC-42 的 issue 描述。

本次只做：
- editable plan review UI
- add / remove / edit subtask
- edit title / description / assigned worker / branch suffix

不要实现：
- restore API
- approval guard 后端逻辑

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
- CRC-43 是否已解锁
```

## CRC-43

```text
实现 EAT 项目的子任务 CRC-43。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-43 CRC-13 / P6.2 Current Plan Revalidation And Approval Guard
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按标准顺序阅读文档，以及 CRC-13 和 CRC-43 的 issue 描述。

本次只做：
- edited current plan 的服务端重校验
- invalid edited draft 的 approval blocking

不要实现：
- restore-from-history
- subtasks materialization

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
- CRC-44 是否已解锁
```

## CRC-44

```text
实现 EAT 项目的子任务 CRC-44。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-44 CRC-13 / P6.3 Plan Snapshot Restore Flow
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按标准顺序阅读文档，以及 CRC-13 和 CRC-44 的 issue 描述。

本次只做：
- task:restore-plan-snapshot
- 恢复历史 snapshot 到 currentPlanJson
- 必要时追加 RESTORED_FROM_HISTORY 审计记录

不要实现：
- approval materialization

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
- CRC-45 是否已解锁
```

## CRC-45

```text
实现 EAT 项目的子任务 CRC-45。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-45 CRC-13 / P6.4 Restore Event And UX Safeguards
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按标准顺序阅读文档，以及 CRC-13 和 CRC-45 的 issue 描述。

本次只做：
- task:plan-restored 事件
- restore confirmation UX
- stale draft / multi-tab 风险的最小保护

不要实现：
- approval 后的 materialization

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
- Phase 06 是否可收尾
```

## 父任务 CRC-13 执行提示词

```text
实现 EAT 项目的父任务 CRC-13 Phase 06 - Plan Review UI And History Restore，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/06-plan-review-ui-and-history-restore.md
8. 父任务 CRC-13 的 issue 描述
9. docs/me/CRC-13-phase-06.md

执行规则：
- 只使用父任务 CRC-13 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-42 editable plan review UI
2. CRC-43 server-side revalidation for edited draft
3. CRC-44 history restore flow and restored state handling
4. CRC-45 approval gating and UX safeguards
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 editable review、revalidation、restore flow、restore event 和 approval guard

不要实现：
- Phase 07 materialization
- execution phase 功能

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 07
```

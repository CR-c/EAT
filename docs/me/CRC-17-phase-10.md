# CRC-17 Phase 10

父任务：

- `CRC-17` Phase 10 - Incremental Review And Early Rework

阶段文档：

- `docs/phase/10-incremental-review-and-early-rework.md`

内部开发顺序：

1. `CRC-58` ReviewRecord schema and incremental persistence plumbing
2. `CRC-59` incremental review trigger and advisory event flow
3. `CRC-60` Rework Now flow and description relaunch editing
4. `CRC-61` change-agent relaunch and EXECUTING-state safeguards

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-17`。
2. 只从父任务 `CRC-17` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-17` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-17` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 incremental review、append-only review history、Rework Now、change-agent relaunch 和 task 仍保持 `EXECUTING` 的约束
- 对照 `docs/phase/10-incremental-review-and-early-rework.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 11 做好准备

## CRC-58

```text
实现 EAT 项目的子任务 CRC-58。

仓库路径：/home/code/EAT
父任务：CRC-17 Phase 10 - Incremental Review And Early Rework
子任务：CRC-58 CRC-17 / P10.1 ReviewRecord Schema And Persistence
阶段文档：docs/phase/10-incremental-review-and-early-rework.md

开始编码前，请按标准顺序阅读文档，以及 CRC-17 和 CRC-58 的 issue 描述。

本次只做：
- `ReviewRecord` persistence
- `SubTask.latestReviewDecision`
- `SubTask.latestReviewPhase`
- `SubTask.latestReviewSummary`

不要实现：
- incremental review trigger
- rework relaunch flow

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
- CRC-59 是否已解锁
```

## CRC-59

```text
实现 EAT 项目的子任务 CRC-59。

仓库路径：/home/code/EAT
父任务：CRC-17 Phase 10 - Incremental Review And Early Rework
子任务：CRC-59 CRC-17 / P10.2 Incremental Review Trigger And Events
阶段文档：docs/phase/10-incremental-review-and-early-rework.md

开始编码前，请按标准顺序阅读文档，以及 CRC-17 和 CRC-59 的 issue 描述。

本次只做：
- successful worker run 后触发 incremental review
- `ReviewRecord phase = INCREMENTAL`
- `subtask:review` 事件
- advisory summary 挂到 subtask detail / execution board

不要实现：
- Rework Now
- final authoritative review

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
- CRC-60 是否已解锁
```

## CRC-60

```text
实现 EAT 项目的子任务 CRC-60。

仓库路径：/home/code/EAT
父任务：CRC-17 Phase 10 - Incremental Review And Early Rework
子任务：CRC-60 CRC-17 / P10.3 Rework Now And Description Edit
阶段文档：docs/phase/10-incremental-review-and-early-rework.md

开始编码前，请按标准顺序阅读文档，以及 CRC-17 和 CRC-60 的 issue 描述。

本次只做：
- actionable incremental `REWORK` / `REJECTED` 下的 `Rework Now`
- 可选 description edit
- same branch / same worktree relaunch
- task 保持 `EXECUTING`

不要实现：
- change-agent
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
- CRC-61 是否已解锁
```

## CRC-61

```text
实现 EAT 项目的子任务 CRC-61。

仓库路径：/home/code/EAT
父任务：CRC-17 Phase 10 - Incremental Review And Early Rework
子任务：CRC-61 CRC-17 / P10.4 Change-Agent Relaunch And Guardrails
阶段文档：docs/phase/10-incremental-review-and-early-rework.md

开始编码前，请按标准顺序阅读文档，以及 CRC-17 和 CRC-61 的 issue 描述。

本次只做：
- `subtask:change-agent`
- relaunch 前健康检查与 capability 重评估
- `subtask:agent-changed`
- early rework 全链路验收

不要实现：
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
- Phase 10 是否可收尾
```

## 父任务 CRC-17 执行提示词

```text
实现 EAT 项目的父任务 CRC-17 Phase 10 - Incremental Review And Early Rework，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/10-incremental-review-and-early-rework.md
父任务：CRC-17 Phase 10 - Incremental Review And Early Rework

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/10-incremental-review-and-early-rework.md
8. 父任务 CRC-17 的 issue 描述
9. docs/me/CRC-17-phase-10.md

执行规则：
- 只使用父任务 CRC-17 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-58 ReviewRecord schema and incremental persistence plumbing
2. CRC-59 incremental review trigger and advisory event flow
3. CRC-60 Rework Now flow and description relaunch editing
4. CRC-61 change-agent relaunch and EXECUTING-state safeguards
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 incremental review append-only history、Rework Now、change-agent relaunch 和 advisory-only review authority

不要实现：
- Phase 11 final authoritative review
- merge / cleanup / metrics

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 11
```

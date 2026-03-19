# CRC-18 Phase 11

父任务：

- `CRC-18` Phase 11 - Final Review And Authoritative Decisions

阶段文档：

- `docs/phase/11-final-review-and-authoritative-decisions.md`

内部开发顺序：

1. `CRC-62` final review readiness and aggregate prompt inputs
2. `CRC-63` final review persistence and authoritative status transitions
3. `CRC-64` discard confirmation and ACTION_REQUIRED routing
4. `CRC-65` final review UI surfacing and mixed-outcome verification

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-18`。
2. 只从父任务 `CRC-18` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-18` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-18` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 final review readiness、aggregate prompt、authoritative transition、discard confirmation 和 mixed outcome routing
- 对照 `docs/phase/11-final-review-and-authoritative-decisions.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 12 做好准备

## CRC-62

```text
实现 EAT 项目的子任务 CRC-62。

仓库路径：/home/code/EAT
父任务：CRC-18 Phase 11 - Final Review And Authoritative Decisions
子任务：CRC-62 CRC-18 / P11.1 Final Review Readiness And Inputs
阶段文档：docs/phase/11-final-review-and-authoritative-decisions.md

开始编码前，请按标准顺序阅读文档，以及 CRC-18 和 CRC-62 的 issue 描述。

本次只做：
- task readiness for final review
- aggregate prompt input assembly
- approved plan、diff、retry、incremental history 收集
- `REVIEWING` 入口

不要实现：
- authoritative decision writeback
- discard confirmation UI

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
- CRC-63 是否已解锁
```

## CRC-63

```text
实现 EAT 项目的子任务 CRC-63。

仓库路径：/home/code/EAT
父任务：CRC-18 Phase 11 - Final Review And Authoritative Decisions
子任务：CRC-63 CRC-18 / P11.2 Final Review Persistence And Status Writes
阶段文档：docs/phase/11-final-review-and-authoritative-decisions.md

开始编码前，请按标准顺序阅读文档，以及 CRC-18 和 CRC-63 的 issue 描述。

本次只做：
- `ReviewRecord phase = FINAL`
- authoritative decisions 写入
- `REVIEW_PENDING -> ACCEPTED`
- `REVIEW_PENDING -> REWORK_REQUIRED`
- `REVIEW_PENDING -> DISCARD_PENDING`

不要实现：
- merge flow
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
- CRC-64 是否已解锁
```

## CRC-64

```text
实现 EAT 项目的子任务 CRC-64。

仓库路径：/home/code/EAT
父任务：CRC-18 Phase 11 - Final Review And Authoritative Decisions
子任务：CRC-64 CRC-18 / P11.3 Discard Confirmation And Action Routing
阶段文档：docs/phase/11-final-review-and-authoritative-decisions.md

开始编码前，请按标准顺序阅读文档，以及 CRC-18 和 CRC-64 的 issue 描述。

本次只做：
- discard confirmation flow
- `ACTION_REQUIRED` routing
- `MERGING` routing preconditions
- unresolved failed / cancelled / rework-required 场景处理

不要实现：
- actual merge executor
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
- CRC-65 是否已解锁
```

## CRC-65

```text
实现 EAT 项目的子任务 CRC-65。

仓库路径：/home/code/EAT
父任务：CRC-18 Phase 11 - Final Review And Authoritative Decisions
子任务：CRC-65 CRC-18 / P11.4 Final Review UI And Mixed-Outcome Verification
阶段文档：docs/phase/11-final-review-and-authoritative-decisions.md

开始编码前，请按标准顺序阅读文档，以及 CRC-18 和 CRC-65 的 issue 描述。

本次只做：
- final review summary UI
- accepted / rework / discard mixed outcome 展示
- discard confirmation UX 收尾
- Phase 11 mixed-case 验收

不要实现：
- merge execution
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
- Phase 11 是否可收尾
```

## 父任务 CRC-18 执行提示词

```text
实现 EAT 项目的父任务 CRC-18 Phase 11 - Final Review And Authoritative Decisions，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/11-final-review-and-authoritative-decisions.md
父任务：CRC-18 Phase 11 - Final Review And Authoritative Decisions

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/11-final-review-and-authoritative-decisions.md
8. 父任务 CRC-18 的 issue 描述
9. docs/me/CRC-18-phase-11.md

执行规则：
- 只使用父任务 CRC-18 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-62 final review readiness and aggregate prompt inputs
2. CRC-63 final review persistence and authoritative status transitions
3. CRC-64 discard confirmation and ACTION_REQUIRED routing
4. CRC-65 final review UI surfacing and mixed-outcome verification
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 final review aggregate input、authoritative status writeback、discard confirmation 和 mixed outcome routing

不要实现：
- Phase 12 merge / rebase-retry
- cleanup / metrics

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 12
```

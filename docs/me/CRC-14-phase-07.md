# CRC-14 Phase 07

父任务：

- `CRC-14` Phase 07 - Approved Plan Materialization

阶段文档：

- `docs/phase/07-approved-plan-materialization.md`

内部开发顺序：

1. `CRC-46` approved plan fields and SubTask schema
2. `CRC-47` approval transaction and approved snapshot write
3. `CRC-48` SubTask materialization and initial status emission
4. `CRC-49` approval idempotency and failure handling

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-14`。
2. 只从父任务 `CRC-14` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-14` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-14` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 approved plan、approved snapshot、SubTask materialization、status emission 和 approval idempotency
- 对照 `docs/phase/07-approved-plan-materialization.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 08 做好准备

## CRC-46

```text
实现 EAT 项目的子任务 CRC-46。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-46 CRC-14 / P7.1 Approved Plan Fields And SubTask Schema
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按标准顺序阅读文档，以及 CRC-14 和 CRC-46 的 issue 描述。

本次只做：
- Task.approvedPlanJson
- SubTask schema
- branch / worktree / agent / status / retry fields

不要实现：
- approval transaction
- materialization 逻辑

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
- CRC-47 是否已解锁
```

## CRC-47

```text
实现 EAT 项目的子任务 CRC-47。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-47 CRC-14 / P7.2 Approval Transaction And Approved Snapshot
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按标准顺序阅读文档，以及 CRC-14 和 CRC-47 的 issue 描述。

本次只做：
- approval transaction boundary
- currentPlanJson -> approvedPlanJson
- approved snapshot 追加

不要实现：
- subtasks materialization
- execution launch

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
- CRC-48 是否已解锁
```

## CRC-48

```text
实现 EAT 项目的子任务 CRC-48。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-48 CRC-14 / P7.3 SubTask Materialization From Approved Plan
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按标准顺序阅读文档，以及 CRC-14 和 CRC-48 的 issue 描述。

本次只做：
- 从 approved plan materialize SubTask
- status 初始化为 PENDING
- 复制执行字段

不要实现：
- worktree、branch、worker session launch

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
- CRC-49 是否已解锁
```

## CRC-49

```text
实现 EAT 项目的子任务 CRC-49。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-49 CRC-14 / P7.4 Initial Status Emission And Idempotency Guard
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按标准顺序阅读文档，以及 CRC-14 和 CRC-49 的 issue 描述。

本次只做：
- approval 后 task / subtask status emission
- duplicate approval guard
- 仅在 materialization 成功后进入 EXECUTING

不要实现：
- branch setup
- worker execution

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
- Phase 07 是否可收尾
```

## 父任务 CRC-14 执行提示词

```text
实现 EAT 项目的父任务 CRC-14 Phase 07 - Approved Plan Materialization，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/07-approved-plan-materialization.md
父任务：CRC-14 Phase 07 - Approved Plan Materialization

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/07-approved-plan-materialization.md
8. 父任务 CRC-14 的 issue 描述
9. docs/me/CRC-14-phase-07.md

执行规则：
- 只使用父任务 CRC-14 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-46 approved plan fields and SubTask schema
2. CRC-47 approval transaction and approved snapshot write
3. CRC-48 SubTask materialization and initial status emission
4. CRC-49 approval idempotency and failure handling
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 approved plan、approved snapshot、SubTask materialization、status emission 和 approval idempotency

不要实现：
- Phase 08 execution launch
- review / merge 功能

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 08
```

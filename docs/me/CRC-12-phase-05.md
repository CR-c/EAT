# CRC-12 Phase 05

父任务：

- `CRC-12` Phase 05 - Plan Generation, Validation, And Snapshots

阶段文档：

- `docs/phase/05-plan-generation-validation-and-snapshots.md`

内部开发顺序：

1. `CRC-38` plan fields and snapshot persistence
2. `CRC-39` planning trigger and lead prompt flow
3. `CRC-40` plan parser and validator
4. `CRC-41` plan rendering, regeneration loop, and events

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-12`。
2. 只从父任务 `CRC-12` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-12` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-12` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 plan fields、snapshot history、planning trigger、parser、validation、draft rendering 和 regeneration loop
- 对照 `docs/phase/05-plan-generation-validation-and-snapshots.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 06 做好准备

## CRC-38

```text
实现 EAT 项目的子任务 CRC-38。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-38 CRC-12 / P5.1 Plan Fields And Snapshot Persistence
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按标准顺序阅读文档，以及 CRC-12 和 CRC-38 的 issue 描述。

本次只做：
- Task.currentPlanJson
- Task.planVersion
- PlanSnapshot 持久化

不要实现：
- planning trigger
- parser / validator
- plan UI

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
- CRC-39 是否已解锁
```

## CRC-39

```text
实现 EAT 项目的子任务 CRC-39。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-39 CRC-12 / P5.2 Planning Trigger And Safe Parsing Pipeline
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按标准顺序阅读文档，以及 CRC-12 和 CRC-39 的 issue 描述。

本次只做：
- requirements confirmation 后触发 planning
- 安全解析 lead 输出
- 处理 markdown wrapped JSON 和非法 payload

不要实现：
- 完整 validation rules
- plan draft UI

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
- CRC-40 是否已解锁
```

## CRC-40

```text
实现 EAT 项目的子任务 CRC-40。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-40 CRC-12 / P5.3 Plan Validation Rules And Regeneration Handling
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按标准顺序阅读文档，以及 CRC-12 和 CRC-40 的 issue 描述。

本次只做：
- plan validation rules
- agent health validation
- branch_suffix 唯一性与 slug-safe 校验
- invalid plan regeneration handling

不要实现：
- draft rendering

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
- CRC-41 是否已解锁
```

## CRC-41

```text
实现 EAT 项目的子任务 CRC-41。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-41 CRC-12 / P5.4 Plan Generated Event And Draft Rendering
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按标准顺序阅读文档，以及 CRC-12 和 CRC-41 的 issue 描述。

本次只做：
- task:plan-generated 事件
- current plan draft 渲染
- validation failure 的友好展示

不要实现：
- restore
- approval

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
- Phase 05 是否可收尾
```

## 父任务 CRC-12 执行提示词

```text
实现 EAT 项目的父任务 CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/05-plan-generation-validation-and-snapshots.md
8. 父任务 CRC-12 的 issue 描述
9. docs/me/CRC-12-phase-05.md

执行规则：
- 只使用父任务 CRC-12 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-38 plan fields and snapshot persistence
2. CRC-39 planning trigger and lead prompt flow
3. CRC-40 plan parser and validator
4. CRC-41 plan rendering, regeneration loop, and events
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 plan fields、snapshot history、planning trigger、parser、validation、draft rendering 和 regeneration loop

不要实现：
- Phase 06 plan editing / restore
- SubTask materialization

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 06
```

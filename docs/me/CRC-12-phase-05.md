# CRC-12 Phase 05

父任务：

- `CRC-12` Phase 05 - Plan Generation, Validation, And Snapshots

阶段文档：

- `docs/phase/05-plan-generation-validation-and-snapshots.md`

子任务顺序：

1. `CRC-38`
2. `CRC-39`
3. `CRC-40`
4. `CRC-41`

父任务 `CRC-12` 要做的事：

- 检查 `CRC-38` 到 `CRC-41` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 联调 plan fields、snapshot history、planning trigger、parsing、validation、draft rendering
- 核对 invalid regeneration loop 与 history append-only 语义
- 确认可进入 Phase 06 的 plan review 编辑流程

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

## 父任务 CRC-12 收尾提示词

```text
对 EAT 项目的父任务 CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始前请按顺序阅读标准文档，以及父任务 CRC-12 和已完成子任务 CRC-38、CRC-39、CRC-40、CRC-41 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 plan fields、snapshot history、planning trigger、parser、validation、draft rendering
- 验证 invalid plan 不会留下错误状态
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 06 plan editing / restore
- SubTask materialization

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 06
```

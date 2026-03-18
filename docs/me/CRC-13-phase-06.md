# CRC-13 Phase 06

父任务：

- `CRC-13` Phase 06 - Plan Review UI And History Restore

阶段文档：

- `docs/phase/06-plan-review-ui-and-history-restore.md`

子任务顺序：

1. `CRC-42`
2. `CRC-43`
3. `CRC-44`
4. `CRC-45`

父任务 `CRC-13` 要做的事：

- 检查 `CRC-42` 到 `CRC-45` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 联调 editable plan review、revalidation、restore flow、restore event 和 UX safeguard
- 核对 invalid edited draft 不能 approval
- 确认可进入 Phase 07 的 approved plan materialization

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

## 父任务 CRC-13 收尾提示词

```text
对 EAT 项目的父任务 CRC-13 Phase 06 - Plan Review UI And History Restore 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始前请按顺序阅读标准文档，以及父任务 CRC-13 和已完成子任务 CRC-42、CRC-43、CRC-44、CRC-45 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 plan review UI、revalidation、restore flow、restore event
- 验证 restored / edited draft 的 approval guard
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 07 materialization
- execution phase 功能

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 07
```

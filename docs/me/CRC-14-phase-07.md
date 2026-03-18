# CRC-14 Phase 07

父任务：

- `CRC-14` Phase 07 - Approved Plan Materialization

阶段文档：

- `docs/phase/07-approved-plan-materialization.md`

子任务顺序：

1. `CRC-46`
2. `CRC-47`
3. `CRC-48`
4. `CRC-49`

父任务 `CRC-14` 要做的事：

- 检查 `CRC-46` 到 `CRC-49` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 联调 approvedPlanJson、approved snapshot、SubTask schema、SubTask materialization、status emission、approval idempotency
- 核对 task 只在 materialization 成功后进入 EXECUTING
- 确认可进入 Phase 08 的 branch / worktree / worker execution

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

## 父任务 CRC-14 收尾提示词

```text
对 EAT 项目的父任务 CRC-14 Phase 07 - Approved Plan Materialization 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/07-approved-plan-materialization.md

开始前请按顺序阅读标准文档，以及父任务 CRC-14 和已完成子任务 CRC-46、CRC-47、CRC-48、CRC-49 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 approved plan、approved snapshot、SubTask materialization、status emission、approval idempotency
- 验证 task 进入 EXECUTING 的时机
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 08 execution launch
- review / merge 功能

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 08
```

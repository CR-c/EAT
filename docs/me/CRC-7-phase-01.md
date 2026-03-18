# CRC-7 Phase 01

父任务：

- `CRC-7` Phase 01 - Project Registration And Repo Validation

阶段文档：

- `docs/phase/01-project-registration-and-repo-validation.md`

子任务顺序：

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`

本阶段目标：

- 先把项目注册、仓库校验、项目 API、项目 UI 做完整

在 Vibe Kanban 中的操作：

1. 找到 `CRC-22`
2. 从 `CRC-22` 创建 workspace
3. 基准分支选最新 `main`
4. 把下面 `CRC-22` 的提示词发给 AI
5. 完成后再做 `CRC-23`
6. 依次做到 `CRC-25`
7. 子任务都完成后，如有需要，再从父任务 `CRC-7` 创建收尾 workspace

父任务 `CRC-7` 要做的事：

- 检查 `CRC-22` 到 `CRC-25` 是否都已完成
- 检查这些子任务的分支是否都已经 review 并合并回 `main`
- 站在 phase 视角补齐缺失的小整合项
- 对照 `docs/phase/01-project-registration-and-repo-validation.md` 的 acceptance checklist 做最终验收
- 确认仓库已经为 Phase 02 做好准备

## CRC-22

```text
实现 EAT 项目的子任务 CRC-22。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-22 CRC-7 / P1.1 Schema And Project Persistence
阶段文档：docs/phase/01-project-registration-and-repo-validation.md

开始编码前，请按下面顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/01-project-registration-and-repo-validation.md
8. 父任务 CRC-7 的 issue 描述
9. 子任务 CRC-22 的 issue 描述

本次只做：
- 增加 Project 模型与迁移
- 落唯一规范化 path
- 持久化 canonical project metadata，包括 defaultBranch

不要实现：
- repo probe 逻辑
- project API
- project UI
- 后续 phase 内容

开始实现前，请先总结目标、范围、schema 变更和测试方案，然后直接实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-23 是否已解锁
```

## CRC-23

```text
实现 EAT 项目的子任务 CRC-23。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-23 CRC-7 / P1.2 Repo Validation And Status Probe Service
阶段文档：docs/phase/01-project-registration-and-repo-validation.md

开始编码前，请按标准顺序阅读文档，以及 CRC-7 和 CRC-23 的 issue 描述。

本次只做：
- 绝对路径、存在性、目录、git repo 校验
- default branch / current branch / isDirty / recent branches 探测
- 输出结构化校验错误

不要实现：
- project 注册 API
- project list/detail UI
- task creation 流程

要求：
- 优先使用确定性的 git 命令
- 不要依赖脆弱的人类可读输出

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-24 是否已解锁
```

## CRC-24

```text
实现 EAT 项目的子任务 CRC-24。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-24 CRC-7 / P1.3 Project Registration And Detail APIs
阶段文档：docs/phase/01-project-registration-and-repo-validation.md

开始编码前，请按标准顺序阅读文档，以及 CRC-7 和 CRC-24 的 issue 描述。

本次只做：
- project registration endpoint
- project list endpoint
- project detail 或 repo-status endpoint
- API 合同与 phase 文档、API examples 对齐

不要实现：
- project UI
- task creation
- 后续 phase 内容

要求：
- 复用 path normalization 与 repo probe
- 返回结构化错误

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-25 是否已解锁
```

## CRC-25

```text
实现 EAT 项目的子任务 CRC-25。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-25 CRC-7 / P1.4 Project UI And Dirty Repo Warning
阶段文档：docs/phase/01-project-registration-and-repo-validation.md

开始编码前，请按标准顺序阅读文档，以及 CRC-7 和 CRC-25 的 issue 描述。

本次只做：
- project list UI
- project detail UI
- current branch / cleanliness 展示
- dirty working tree warning banner

不要实现：
- task creation 表单
- 后续 agent、sandbox、chat、plan 功能

要求：
- 基于已完成 API
- duplicate registration 和 invalid repo 错误提示清晰

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- Phase 01 是否可进入父任务收尾
```

## 父任务 CRC-7 收尾提示词

只有当 `CRC-22` 到 `CRC-25` 都完成后，再使用这段提示词，从父任务 `CRC-7` 创建 workspace。

```text
对 EAT 项目的父任务 CRC-7 Phase 01 - Project Registration And Repo Validation 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
阶段文档：docs/phase/01-project-registration-and-repo-validation.md

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/01-project-registration-and-repo-validation.md
8. 父任务 CRC-7 的 issue 描述
9. 已完成的子任务 CRC-22、CRC-23、CRC-24、CRC-25 的 issue 描述

本次只做父任务收尾：
- 检查 CRC-22 到 CRC-25 是否都已经实现并合并到 main
- 处理少量跨子任务的小整合问题
- 对照 phase 文档完成最终验收
- 补足本阶段遗漏但仍属于 Phase 01 范围的小项

不要实现：
- Phase 02 的功能
- 与 Phase 01 无关的大改动

完成后请输出：
- 父任务收尾完成内容
- 核对过的子任务与合并情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 02
```

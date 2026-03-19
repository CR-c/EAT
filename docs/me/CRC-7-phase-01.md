# CRC-7 Phase 01

父任务：

- `CRC-7` Phase 01 - Project Registration And Repo Validation

阶段文档：

- `docs/phase/01-project-registration-and-repo-validation.md`

内部开发顺序：

1. `CRC-22` Project schema and persistence
2. `CRC-23` repo validation and probing service
3. `CRC-24` project APIs and repo-status contract
4. `CRC-25` project list/detail UI and dirty-repo warning

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-7`。
2. 只从父任务 `CRC-7` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-7` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-7` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 project registration、repo validation、project APIs、project UI、dirty-repo warning
- 对照 `docs/phase/01-project-registration-and-repo-validation.md` 与 checklist 做最终验收
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

## 父任务 CRC-7 执行提示词

```text
实现 EAT 项目的父任务 CRC-7 Phase 01 - Project Registration And Repo Validation，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/01-project-registration-and-repo-validation.md
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/01-project-registration-and-repo-validation.md
8. 父任务 CRC-7 的 issue 描述
9. docs/me/CRC-7-phase-01.md

执行规则：
- 只使用父任务 CRC-7 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-22 Project schema and persistence
2. CRC-23 repo validation and probing service
3. CRC-24 project APIs and repo-status contract
4. CRC-25 project list/detail UI and dirty-repo warning
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 project registration、repo validation、project APIs、project UI、dirty-repo warning

不要实现：
- Phase 02 的功能
- 与 Phase 01 无关的大改动

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 02
```

# EAT Issue / Workspace 操作手册

这份文档是给你自己看的操作手册，用来指导你如何在 Vibe Kanban 中，按照已经拆好的父任务与子任务创建工作区、驱动 AI 开发、验收和推进阶段。

如果你只是想知道一句话版本：

- 父任务用来管阶段
- 子任务用来实际开发
- 默认一个子任务对应一个 workspace
- 不要一上来就在父任务里直接写一整阶段的代码

## 先理解三层对象

### 1. 父任务

父任务就是 phase 任务，例如：

- `CRC-7` Phase 01 - Project Registration And Repo Validation
- `CRC-9` Phase 02 - Agent Registry And Health Checks

父任务的作用：

- 看这个阶段到底做什么
- 管理这个阶段是否完成
- 在所有子任务完成后做阶段联调、补洞、验收

父任务不应该作为默认开发入口。

### 2. 子任务

子任务是实际的开发单元，例如：

- `CRC-22` `CRC-23` `CRC-24` `CRC-25`

子任务的作用：

- 创建 workspace
- 交给 AI 实现
- 做 review、测试、合并

默认规则：

- 一个子任务 = 一个开发 workspace

### 3. Workspace

Workspace 是 Vibe Kanban 里真正让 AI 干活的地方。

你应该优先从子任务创建 workspace，而不是从父任务创建。

## 你在 Vibe Kanban 里的标准操作顺序

每推进一个阶段，都按下面顺序做。

1. 打开父任务。
2. 阅读父任务内容，确认这一阶段的目标和边界。
3. 找到这个父任务下面第一个未完成的子任务。
4. 从这个子任务创建 workspace。
5. 基准分支选择当前最新的 `main`。
6. 把 AI 提示词发进去，只让它完成这个子任务。
7. 等 AI 改完后，你 review、测试、验收。
8. 验收通过后合并回 `main`。
9. 回到看板，把这个子任务标记完成。
10. 再处理下一个子任务。
11. 当这个父任务下所有子任务都完成后，如果需要，再从父任务创建一个“收尾 workspace”做联调、补测试、补文档、补小问题。
12. 父任务验收通过后，再进入下一个父任务。

## 父任务什么时候创建 workspace

只有下面两种情况才建议从父任务创建 workspace：

### 情况 A：阶段收尾

这个阶段下面的子任务都已经完成了，但你还需要：

- 联调
- 补集成测试
- 补小修复
- 收敛阶段验收项

这时可以从父任务创建一个 workspace。

### 情况 B：跨子任务的小整合

有时候几个子任务分别完成了，但最后会出现一点点跨边界的小修正，例如：

- 前端字段名对不上后端返回
- 事件名统一调整
- 文档描述和实现不一致

这种也可以用父任务 workspace 收尾。

除此之外，不建议在父任务 workspace 里直接展开大规模开发。

## 子任务什么时候创建 workspace

默认都应该从子任务创建 workspace。

只要这个子任务满足下面两个条件，就应该直接从它开工：

- 边界清楚
- 可以独立 review 和合并

目前你已经拆好的前 8 个 phase 子任务，基本都满足这个条件。

## 你应该按什么顺序推进

## 第一层顺序：父任务顺序

严格按这个顺序推进：

1. `CRC-7` Phase 01 - Project Registration And Repo Validation
2. `CRC-9` Phase 02 - Agent Registry And Health Checks
3. `CRC-10` Phase 03 - Container Sandbox Manager And Docker Preflight
4. `CRC-11` Phase 04 - Lead Session Chat Flow
5. `CRC-12` Phase 05 - Plan Generation, Validation, And Snapshots
6. `CRC-13` Phase 06 - Plan Review UI And History Restore
7. `CRC-14` Phase 07 - Approved Plan Materialization
8. `CRC-15` Phase 08 - Worker Session Manager And Concurrent Execution
9. `CRC-16` Phase 09 - Realtime Output Streaming And Summary UX
10. `CRC-17` Phase 10 - Incremental Review And Early Rework
11. `CRC-18` Phase 11 - Final Review And Authoritative Decisions
12. `CRC-19` Phase 12 - Merge Flow And Rebase Retry
13. `CRC-20` Phase 13 - Worktree Cleanup And Terminal Warnings
14. `CRC-21` Phase 14 - Metrics, Observability, And Export

不要跳 phase。

## 第二层顺序：前 8 个 phase 的子任务顺序

### Phase 01

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`

### Phase 02

1. `CRC-26`
2. `CRC-27`
3. `CRC-28`
4. `CRC-29`

### Phase 03

1. `CRC-30`
2. `CRC-31`
3. `CRC-32`
4. `CRC-33`

### Phase 04

1. `CRC-34`
2. `CRC-35`
3. `CRC-36`
4. `CRC-37`

### Phase 05

1. `CRC-38`
2. `CRC-39`
3. `CRC-40`
4. `CRC-41`

### Phase 06

1. `CRC-42`
2. `CRC-43`
3. `CRC-44`
4. `CRC-45`

### Phase 07

1. `CRC-46`
2. `CRC-47`
3. `CRC-48`
4. `CRC-49`

### Phase 08

1. `CRC-50`
2. `CRC-51`
3. `CRC-52`
4. `CRC-53`

## 你现在最推荐的开工点

直接从下面这个顺序开始：

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`

这正好就是 Phase 01 的最佳落地顺序：

- 先 schema
- 再 repo probe service
- 再 API
- 再 UI

## 哪些情况可以并行

默认建议：

- Phase 01 到 Phase 05 尽量串行

因为前面这些阶段会持续定义：

- schema
- contract
- state machine
- API 形状

如果太早并行，很容易返工。

只有满足下面两个条件时才建议并行：

- 两个子任务写入文件范围明显不同
- 后一个子任务不依赖前一个子任务刚定义的 contract

安全做法：

- schema 先落地
- service / API 再落地
- UI 最后跟进

## Issue 描述够不够直接驱动开发

结论：

- 不够单独使用
- 但很适合当“当前工作切片说明”

你不能只把 issue 文本丢给 AI 就让它写代码，因为 issue 不会完整覆盖：

- PRD 里的约束
- phase 顺序
- schema 迁移要求
- API / event 合同
- 父任务和子任务之间的边界

所以正确用法是：

- issue 描述 + PRD + phase docs 一起用

## 每次创建子任务 workspace 后，AI 应该先读什么

固定顺序如下：

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/phase/README.md`
4. `docs/phase/PRISMA-MIGRATIONS.md`
5. `docs/phase/API-EVENT-EXAMPLES.md`
6. `docs/phase/CHECKLISTS.md`
7. 对应的 phase 文档
8. 父任务 issue 描述
9. 当前子任务 issue 描述

## 你可以直接复制给 AI 的子任务提示词模板

把下面内容复制进子任务 workspace 的对话里，把占位符替换掉即可。

```text
实现 EAT 项目的子任务 {子任务ID}。

仓库路径：/home/code/EAT
父任务：{父任务ID} {父任务标题}
子任务：{子任务ID} {子任务标题}
阶段文档：{阶段文档路径}

开始编码前，请按下面顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. {阶段文档路径}
8. 父任务 issue 描述
9. 子任务 issue 描述

执行要求：
- 只实现这个子任务的范围，不要顺手实现后续 phase。
- 必须遵守 PRD 中的命名、状态机、字段名、事件名。
- 如果涉及 schema，优先采用 additive migration。
- 不要破坏文档中要求的 Docker sandbox worker 模型。

开始实现前，请先总结：
- 这个子任务的目标
- 明确的范围边界
- 需要的 schema 变更
- 需要的 API / event 变更
- 需要的 UI 变更
- 需要的测试

然后直接开始实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- 下一个兄弟子任务是否已经解锁
```

## 你可以直接复制给 AI 的父任务收尾提示词模板

这个模板只在某个父任务下面所有子任务都完成之后使用。

```text
对 EAT 项目的父任务 {父任务ID} {父任务标题} 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：{阶段文档路径}

开始前请阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. {阶段文档路径}
8. 父任务 issue 描述
9. 该父任务下已经完成的所有子任务 issue

目标：
- 做该阶段的联调与验收
- 修正少量跨子任务的小问题
- 补齐 phase checklist 中遗漏但仍属于本阶段范围的内容
- 不要提前进入下一阶段的大功能

完成后请输出：
- 已完成的收尾项
- 剩余未完成 checklist
- 测试结果
- 阻塞项
- 是否可以进入下一 phase
```

## 你实际操作时最简单的决策规则

如果你在 Vibe Kanban 里面犹豫“这个 workspace 应该从父任务开还是子任务开”，直接用这条规则：

- 默认从子任务开
- 只有收尾联调时才从父任务开

如果你犹豫“现在该做哪个 issue”，直接用这条规则：

- 永远做当前最早未完成 phase 下的第一个未完成子任务

这能最大限度减少返工。

## 可直接照着执行的顺序与提示词

这一节就是给你直接照着操作用的。

使用方式：

1. 在 Vibe Kanban 中找到对应 issue
2. 从该 issue 创建 workspace
3. 基准分支选择最新 `main`
4. 把下面对应 issue 的提示词原样复制给 AI
5. 等它完成后 review、测试、合并
6. 再做下一个 issue

---

## 第一阶段：Phase 01

### `CRC-22`

用途：

- Phase 01 的第一个子任务
- 先落 schema 和项目持久化

提示词：

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

本次只做 CRC-22 的范围：
- 增加 Project 模型与迁移
- 落唯一规范化 path
- 持久化 canonical project metadata，包括 defaultBranch

不要实现：
- repo probe 逻辑
- project API
- project UI
- 后续 phase 内容

开始实现前，请先总结：
- 这个子任务的目标
- 明确的范围边界
- 需要的 schema 变更
- 本次不做的 API / UI 范围
- 需要的测试

然后直接实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-23 是否已解锁
```

### `CRC-23`

用途：

- 在 schema 之后落 repo 校验和状态探测

提示词：

```text
实现 EAT 项目的子任务 CRC-23。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-23 CRC-7 / P1.2 Repo Validation And Status Probe Service
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
9. 子任务 CRC-23 的 issue 描述

本次只做 CRC-23 的范围：
- 绝对路径、存在性、目录、git repo 校验
- default branch / current branch / isDirty / recent branches 探测
- 输出结构化校验错误

不要实现：
- project 注册 API
- project list/detail UI
- 跨 phase 的 task creation 流程

要求：
- 优先使用确定性的 git 命令
- 不要解析脆弱的人类可读输出
- 注意 invalid path、non-git、bare repo、detached HEAD 等边界情况

开始实现前，请先总结：
- 服务边界
- repo status 返回结构
- 错误模型
- 需要的测试

然后直接实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-24 是否已解锁
```

### `CRC-24`

用途：

- 在 schema 和 probe service 之后落 project API

提示词：

```text
实现 EAT 项目的子任务 CRC-24。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-24 CRC-7 / P1.3 Project Registration And Detail APIs
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
9. 子任务 CRC-24 的 issue 描述

本次只做 CRC-24 的范围：
- project registration endpoint
- project list endpoint
- project detail 或 repo-status endpoint
- API 合同与 phase 文档、API examples 对齐

不要实现：
- project 页面 UI
- task creation
- 后续 agent / sandbox phase

要求：
- 复用已有 path normalization 与 repo probe 结果
- 返回结构化错误，不暴露原始 shell 噪声
- detail 接口要支持 live repo status 刷新

开始实现前，请先总结：
- 端点列表
- request / response shape
- 依赖的服务
- 需要的测试

然后直接实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- CRC-25 是否已解锁
```

### `CRC-25`

用途：

- 完成 Phase 01 的 UI 和 dirty repo warning

提示词：

```text
实现 EAT 项目的子任务 CRC-25。

仓库路径：/home/code/EAT
父任务：CRC-7 Phase 01 - Project Registration And Repo Validation
子任务：CRC-25 CRC-7 / P1.4 Project UI And Dirty Repo Warning
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
9. 子任务 CRC-25 的 issue 描述

本次只做 CRC-25 的范围：
- project list UI
- project detail UI
- current branch / cleanliness 展示
- dirty working tree warning banner

不要实现：
- task creation 表单
- 后续 agent、sandbox、chat、plan 功能

要求：
- 基于已经完成的 API 契约
- duplicate registration 和 invalid repo 的错误提示要清晰
- dirty repo warning 要符合 phase doc 中的 follow-up prompt contract

开始实现前，请先总结：
- 需要的页面 / 组件
- 依赖的 API
- 交互状态
- 需要的测试或手工验证

然后直接实现。

完成后请输出：
- 已完成内容
- 修改的文件
- 测试结果
- 剩余风险 / 假设
- Phase 01 是否已可进入父任务收尾
```

---

## 第二阶段：Phase 02

### `CRC-26`

提示词：

```text
实现 EAT 项目的子任务 CRC-26。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-26 CRC-9 / P2.1 Agent Capability Contract And Registry Core
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按顺序阅读 AGENTS.md、docs/PRD.md、docs/phase/README.md、docs/phase/PRISMA-MIGRATIONS.md、docs/phase/API-EVENT-EXAMPLES.md、docs/phase/CHECKLISTS.md、docs/phase/02-agent-registry-and-health-checks.md，以及 CRC-9 和 CRC-26 的 issue 描述。

本次只做：
- adapter capability contract
- AgentRegistry 核心结构
- register / unregister / lookup
- lead candidate / worker candidate filtering

不要实现：
- health check pipeline
- API 层
- agent health UI

重点：
- capability metadata 必须集中定义
- 不要把 provider 名字硬编码到后续逻辑里

完成前请先总结范围、schema 是否需要变更、API 是否暂不涉及、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-27 是否解锁。
```

### `CRC-27`

提示词：

```text
实现 EAT 项目的子任务 CRC-27。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-27 CRC-9 / P2.2 Health Check Pipeline And Error Normalization
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按顺序阅读标准文档，以及 CRC-9 和 CRC-27 的 issue 描述。

本次只做：
- 结构化 health checks
- health failure reason normalization
- binary missing / auth missing / unsupported sandbox / unsupported capability 等错误分类

不要实现：
- agents API
- UI

要求：
- health 结果要给 UI 直接消费
- 避免 UI 解析字符串
- 如果需要缓存，要说明生命周期

完成前先总结范围、错误模型、缓存策略、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-28 是否解锁。
```

### `CRC-28`

提示词：

```text
实现 EAT 项目的子任务 CRC-28。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-28 CRC-9 / P2.3 Agents And Health API Surface
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按顺序阅读标准文档，以及 CRC-9 和 CRC-28 的 issue 描述。

本次只做：
- GET /api/agents
- GET /api/agents/health 或等价事件接口
- 暴露 capability、sandbox support、lead/worker 可用性

不要实现：
- agent health UI
- task creation UI gating

要求：
- API 结构与 API-EVENT-EXAMPLES 对齐
- task creation 未来应能同步校验 lead 是否可用

完成前先总结端点、契约、依赖、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-29 是否解锁。
```

### `CRC-29`

提示词：

```text
实现 EAT 项目的子任务 CRC-29。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-29 CRC-9 / P2.4 Agent Health UI And Selection Gating
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按顺序阅读标准文档，以及 CRC-9 和 CRC-29 的 issue 描述。

本次只做：
- agent health view
- capability badges
- degraded / unavailable 展示
- unhealthy lead-agent selection gating

不要实现：
- 后续 lead chat 或 task creation 的完整业务流

要求：
- 区分 lead-capable 与 worker-capable agent
- sandbox support 必须可见

完成前先总结 UI 边界、依赖 API、状态处理和测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 02 是否可收尾。
```

---

## 第三阶段：Phase 03

### `CRC-30`

提示词：

```text
实现 EAT 项目的子任务 CRC-30。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-30 CRC-10 / P3.1 Sandbox Config And Mount Policy Enforcement
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按顺序阅读标准文档，以及 CRC-10 和 CRC-30 的 issue 描述。

本次只做：
- sandbox config type
- validation rules
- mount allowlist enforcement
- 默认阻止 home 和 .ssh 挂载

不要实现：
- Docker preflight
- container lifecycle helper
- UI

要求：
- fail closed
- 只允许 app-owned paths 挂载

完成前先总结范围、配置模型、安全边界、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-31 是否解锁。
```

### `CRC-31`

提示词：

```text
实现 EAT 项目的子任务 CRC-31。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-31 CRC-10 / P3.2 Docker Preflight And Runtime Availability Checks
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按顺序阅读标准文档，以及 CRC-10 和 CRC-31 的 issue 描述。

本次只做：
- Docker daemon reachability 检测
- image / runtime availability strategy
- 结构化 preflight 错误

不要实现：
- container create/start/stop/remove helper
- UI 层展示

要求：
- 区分 Docker 未安装、daemon 未启动、镜像不可用
- worker launch 后续必须能 fail fast

完成前先总结范围、检测接口、错误模型、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-32 是否解锁。
```

### `CRC-32`

提示词：

```text
实现 EAT 项目的子任务 CRC-32。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-32 CRC-10 / P3.3 Container Lifecycle Helpers And Security Guardrails
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按顺序阅读标准文档，以及 CRC-10 和 CRC-32 的 issue 描述。

本次只做：
- container create / start / stop / remove helper
- non-root worker execution
- reject privileged mode
- reject undeclared host mounts

不要实现：
- task orchestration
- worker session manager

要求：
- 中央化构建 Docker 命令，不要把 CLI 字符串散落业务代码
- 安全默认值必须集中处理

完成前先总结 helper 边界、安全护栏、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-33 是否解锁。
```

### `CRC-33`

提示词：

```text
实现 EAT 项目的子任务 CRC-33。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-33 CRC-10 / P3.4 Sandbox Health Exposure And Failure-Closed Verification
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按顺序阅读标准文档，以及 CRC-10 和 CRC-33 的 issue 描述。

本次只做：
- sandbox health exposure
- 必要时 staged session fields，如 sandboxType / containerId
- blocked mount / sandbox failure 的 fail-closed 验证

不要实现：
- 后续 worker execution phase
- task UI 主流程

要求：
- app 在 execution 前就能知道 sandbox 是否可用
- 失败路径要结构化、可调试

完成前先总结范围、是否涉及 session schema、API 或内部服务暴露方式、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 03 是否可收尾。
```

---

## 第四阶段：Phase 04

### `CRC-34`

提示词：

```text
实现 EAT 项目的子任务 CRC-34。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-34 CRC-11 / P4.1 Task And Session Persistence Layer
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按顺序阅读标准文档，以及 CRC-11 和 CRC-34 的 issue 描述。

本次只做：
- Task / Message / Attachment / AgentSession 持久化层
- baseCommitSha 作为 task 创建时 required field

不要实现：
- task 创建 API
- attachment 上传流程
- clarification chat UI

要求：
- schema 必须支撑后续 clarification transcript replay
- lead session 不绑定 subTask

完成前先总结 schema 变更、约束、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-35 是否解锁。
```

### `CRC-35`

提示词：

```text
实现 EAT 项目的子任务 CRC-35。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-35 CRC-11 / P4.2 Task Creation API And Attachment Handling
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按顺序阅读标准文档，以及 CRC-11 和 CRC-35 的 issue 描述。

本次只做：
- task creation endpoint
- task-scoped attachment persistence
- attachment metadata / size / type validation

不要实现：
- lead session clarification 事件流
- chat UI

要求：
- baseCommitSha 必须来自选定 base branch
- attachment 错误要在 task 创建完成前暴露

完成前先总结 API、upload / persistence 边界、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-36 是否解锁。
```

### `CRC-36`

提示词：

```text
实现 EAT 项目的子任务 CRC-36。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-36 CRC-11 / P4.3 Lead Session Clarification Event Flow
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按顺序阅读标准文档，以及 CRC-11 和 CRC-36 的 issue 描述。

本次只做：
- task:start-clarification
- task:message
- task:confirm-requirements
- lead session spawn
- clarification transcript persistence

不要实现：
- plan generation
- clarification UI

要求：
- task 状态要正确从 DRAFT -> CLARIFYING -> PLANNING
- transcript 要能 reload 后继续使用

完成前先总结事件流、状态流转、依赖服务、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-37 是否解锁。
```

### `CRC-37`

提示词：

```text
实现 EAT 项目的子任务 CRC-37。

仓库路径：/home/code/EAT
父任务：CRC-11 Phase 04 - Lead Session Chat Flow
子任务：CRC-37 CRC-11 / P4.4 Task Creation And Clarification UI
阶段文档：docs/phase/04-lead-session-chat-flow.md

开始编码前，请按顺序阅读标准文档，以及 CRC-11 和 CRC-37 的 issue 描述。

本次只做：
- task creation UI
- clarification chat UI
- lead agent unhealthy 提示
- attachment validation error 展示

不要实现：
- plan generation UI
- 后续 review / execution phase

要求：
- UI 状态必须对应持久化 task / message
- reload 后仍能恢复 clarification 界面

完成前先总结页面结构、依赖 API / event、状态设计、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 04 是否可收尾。
```

---

## 第五阶段：Phase 05

### `CRC-38`

提示词：

```text
实现 EAT 项目的子任务 CRC-38。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-38 CRC-12 / P5.1 Plan Fields And Snapshot Persistence
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按顺序阅读标准文档，以及 CRC-12 和 CRC-38 的 issue 描述。

本次只做：
- Task.currentPlanJson
- Task.planVersion
- PlanSnapshot 持久化

不要实现：
- planning trigger
- parser / validator
- plan generated UI

要求：
- planVersion 初始为 0
- PlanSnapshot 必须 append-only

完成前先总结 schema、历史保留要求、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-39 是否解锁。
```

### `CRC-39`

提示词：

```text
实现 EAT 项目的子任务 CRC-39。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-39 CRC-12 / P5.2 Planning Trigger And Safe Parsing Pipeline
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按顺序阅读标准文档，以及 CRC-12 和 CRC-39 的 issue 描述。

本次只做：
- 在 requirements confirmation 后触发 planning
- 安全解析 lead 输出
- 处理 markdown wrapped JSON 和非法 payload

不要实现：
- 完整 validation rules
- plan UI

要求：
- lead 输出视为不可信文本
- invalid output 不得留下半成品 plan 状态

完成前先总结 trigger 点、解析策略、失败处理、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-40 是否解锁。
```

### `CRC-40`

提示词：

```text
实现 EAT 项目的子任务 CRC-40。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-40 CRC-12 / P5.3 Plan Validation Rules And Regeneration Handling
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按顺序阅读标准文档，以及 CRC-12 和 CRC-40 的 issue 描述。

本次只做：
- plan validation rules
- agent health validation
- branch_suffix 唯一性与 slug-safe 校验
- invalid plan regeneration handling

不要实现：
- plan draft UI 渲染

要求：
- invalid plan 保持任务在 PLANNING
- regeneration 不得污染历史 snapshot

完成前先总结 validation 规则、错误结构、状态处理、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-41 是否解锁。
```

### `CRC-41`

提示词：

```text
实现 EAT 项目的子任务 CRC-41。

仓库路径：/home/code/EAT
父任务：CRC-12 Phase 05 - Plan Generation, Validation, And Snapshots
子任务：CRC-41 CRC-12 / P5.4 Plan Generated Event And Draft Rendering
阶段文档：docs/phase/05-plan-generation-validation-and-snapshots.md

开始编码前，请按顺序阅读标准文档，以及 CRC-12 和 CRC-41 的 issue 描述。

本次只做：
- task:plan-generated 事件
- current plan draft 渲染
- validation failure 的非原始 parser 风格展示

不要实现：
- plan edit / restore
- approval

要求：
- 事件结构与 API-EVENT-EXAMPLES 对齐
- UI 必须能立即看到最新 draft 和 planVersion

完成前先总结 event、UI 边界、状态设计、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 05 是否可收尾。
```

---

## 第六阶段：Phase 06

### `CRC-42`

提示词：

```text
实现 EAT 项目的子任务 CRC-42。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-42 CRC-13 / P6.1 Editable Plan Review UI
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按顺序阅读标准文档，以及 CRC-13 和 CRC-42 的 issue 描述。

本次只做：
- editable plan review UI
- add / remove / edit subtask
- edit title / description / assigned worker / branch suffix

不要实现：
- restore API
- approval guard 后端逻辑

要求：
- draft 编辑时不能丢字段
- UI 只处理当前 draft，不提前 materialize subtasks

完成前先总结 UI 范围、数据结构、交互设计、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-43 是否解锁。
```

### `CRC-43`

提示词：

```text
实现 EAT 项目的子任务 CRC-43。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-43 CRC-13 / P6.2 Current Plan Revalidation And Approval Guard
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按顺序阅读标准文档，以及 CRC-13 和 CRC-43 的 issue 描述。

本次只做：
- edited current plan 的服务端重校验
- invalid edited draft 的 approval blocking

不要实现：
- restore-from-history
- subtasks materialization

要求：
- 尽量复用 Phase 05 validation 规则
- approval 入口必须受保护

完成前先总结校验边界、接口变化、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-44 是否解锁。
```

### `CRC-44`

提示词：

```text
实现 EAT 项目的子任务 CRC-44。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-44 CRC-13 / P6.3 Plan Snapshot Restore Flow
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按顺序阅读标准文档，以及 CRC-13 和 CRC-44 的 issue 描述。

本次只做：
- task:restore-plan-snapshot
- 把选中历史 snapshot 恢复到 currentPlanJson
- 必要时追加 RESTORED_FROM_HISTORY audit snapshot

不要实现：
- approval materialization
- worker execution

要求：
- restore 后只是 current draft，不是 approved plan
- 历史记录必须可追溯

完成前先总结 restore 流程、持久化处理、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-45 是否解锁。
```

### `CRC-45`

提示词：

```text
实现 EAT 项目的子任务 CRC-45。

仓库路径：/home/code/EAT
父任务：CRC-13 Phase 06 - Plan Review UI And History Restore
子任务：CRC-45 CRC-13 / P6.4 Restore Event And UX Safeguards
阶段文档：docs/phase/06-plan-review-ui-and-history-restore.md

开始编码前，请按顺序阅读标准文档，以及 CRC-13 和 CRC-45 的 issue 描述。

本次只做：
- task:plan-restored 事件
- restore confirmation UX
- stale draft / multi-tab 风险的最小保护

不要实现：
- approval 之后的 materialization

要求：
- restore 后 UI 立即刷新
- invalid restored plan 也必须阻止 approval

完成前先总结事件、UI 安全护栏、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 06 是否可收尾。
```

---

## 第七阶段：Phase 07

### `CRC-46`

提示词：

```text
实现 EAT 项目的子任务 CRC-46。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-46 CRC-14 / P7.1 Approved Plan Fields And SubTask Schema
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按顺序阅读标准文档，以及 CRC-14 和 CRC-46 的 issue 描述。

本次只做：
- Task.approvedPlanJson
- SubTask schema
- branch / worktree / agent / status / retry fields

不要实现：
- approval transaction
- subtask materialization 逻辑

要求：
- branchName / worktreePath 在 setup 前保持 nullable
- schema 对齐 phase 和 migration 文档

完成前先总结 schema、约束、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-47 是否解锁。
```

### `CRC-47`

提示词：

```text
实现 EAT 项目的子任务 CRC-47。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-47 CRC-14 / P7.2 Approval Transaction And Approved Snapshot
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按顺序阅读标准文档，以及 CRC-14 和 CRC-47 的 issue 描述。

本次只做：
- approval transaction boundary
- currentPlanJson -> approvedPlanJson
- approved snapshot 追加

不要实现：
- subtasks materialization
- execution launch

要求：
- 不能产生半批准状态
- approved snapshot 必须冻结且可恢复

完成前先总结 transaction 设计、失败回滚、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-48 是否解锁。
```

### `CRC-48`

提示词：

```text
实现 EAT 项目的子任务 CRC-48。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-48 CRC-14 / P7.3 SubTask Materialization From Approved Plan
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按顺序阅读标准文档，以及 CRC-14 和 CRC-48 的 issue 描述。

本次只做：
- 从 approved plan materialize SubTask
- status 初始化为 PENDING
- 复制 assigned agent / branch suffix 等执行字段

不要实现：
- worktree、branch、worker session launch

要求：
- materialized subtasks 只能创建一次
- 后续 execution 必须直接读 SubTask，而不是反复解析 approvedPlanJson

完成前先总结 materialization 规则、幂等要求、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-49 是否解锁。
```

### `CRC-49`

提示词：

```text
实现 EAT 项目的子任务 CRC-49。

仓库路径：/home/code/EAT
父任务：CRC-14 Phase 07 - Approved Plan Materialization
子任务：CRC-49 CRC-14 / P7.4 Initial Status Emission And Idempotency Guard
阶段文档：docs/phase/07-approved-plan-materialization.md

开始编码前，请按顺序阅读标准文档，以及 CRC-14 和 CRC-49 的 issue 描述。

本次只做：
- approval 后 task / subtask status emission
- duplicate approval guard
- 保证 task 仅在 materialization 成功后进入 EXECUTING

不要实现：
- branch setup
- worker execution

要求：
- multi-click / multi-tab approval 必须幂等

完成前先总结事件、幂等策略、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 07 是否可收尾。
```

---

## 第八阶段：Phase 08

### `CRC-50`

提示词：

```text
实现 EAT 项目的子任务 CRC-50。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-50 CRC-15 / P8.1 Branch Naming And Collision Resolution
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按顺序阅读标准文档，以及 CRC-15 和 CRC-50 的 issue 描述。

本次只做：
- deterministic branch naming
- numeric suffix collision resolution
- persist resolved branchName
- emit branch:renamed

不要实现：
- worktree create
- worker session launch

要求：
- branch naming 要 retry-safe
- 不能产生模糊 ownership

完成前先总结命名规则、冲突处理、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-51 是否解锁。
```

### `CRC-51`

提示词：

```text
实现 EAT 项目的子任务 CRC-51。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-51 CRC-15 / P8.2 Worktree Creation And Persistence
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按顺序阅读标准文档，以及 CRC-15 和 CRC-51 的 issue 描述。

本次只做：
- 从 baseCommitSha 创建 worktree
- persist worktreePath
- setup failure -> actionable state

不要实现：
- worker launch
- attachment filtering

要求：
- 不能直接在用户 repo root 中执行
- worktree path collision 和 setup failure 必须可见

完成前先总结 worktree 规则、失败处理、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-52 是否解锁。
```

### `CRC-52`

提示词：

```text
实现 EAT 项目的子任务 CRC-52。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-52 CRC-15 / P8.3 Worker Session Launch And Attachment Filtering
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按顺序阅读标准文档，以及 CRC-15 和 CRC-52 的 issue 描述。

本次只做：
- worker AgentSession rows
- sandbox manager 启动 worker
- attachment filtering by capability
- included / excluded attachment metadata exposure

不要实现：
- retry flow
- incremental review

要求：
- 同类型 agent 支持并发运行
- session ownership 必须清晰并按 sessionId 隔离

完成前先总结 launch 流程、attachment 规则、并发边界、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、CRC-53 是否解锁。
```

### `CRC-53`

提示词：

```text
实现 EAT 项目的子任务 CRC-53。

仓库路径：/home/code/EAT
父任务：CRC-15 Phase 08 - Worker Session Manager And Concurrent Execution
子任务：CRC-53 CRC-15 / P8.4 Retry Flow And Execution State Machine
阶段文档：docs/phase/08-worker-session-manager-and-concurrent-execution.md

开始编码前，请按顺序阅读标准文档，以及 CRC-15 和 CRC-53 的 issue 描述。

本次只做：
- subtask:retry
- retryCount 增长
- PENDING -> READY -> RUNNING 状态机
- branch / setup failure -> ACTION_REQUIRED
- 防止同一 subtask 出现重复 live session

不要实现：
- incremental review
- final review
- merge flow

要求：
- retry 默认复用同一 branch 和 worktree
- prior session history 必须保留

完成前先总结状态机、retry 规则、幂等要求、测试方案，然后实现。
完成后汇报已完成内容、修改文件、测试结果、风险、Phase 08 是否可收尾。
```

---

## 当你做到 `CRC-16` 以后怎么办

目前 `CRC-16` 到 `CRC-21` 还没有继续拆成子任务。

所以当你真的做到这里时，建议你先不要直接开工，而是先做下面二选一：

1. 先让我继续把 `CRC-16` 到 `CRC-21` 再拆成子任务
2. 或者你从父任务开 workspace，但只做该 phase 的一个清晰切片，并先让我帮你补对应提示词

如果你想最稳地推进，推荐选第 1 种。

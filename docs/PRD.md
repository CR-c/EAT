# EAT (Engineering Agent Team) Product Requirements Document v4.0

> Version: 4.0
> Date: 2026-03-23
> Status: Working Draft
> Scope: Current product definition for the local-first Web orchestration build

---

## 1. 文档目的

本 PRD 取代 v3.2 只描述 MVP 主线的写法，把当前产品形态统一定义为：

`EAT = supervised, local-first, web-first multi-agent orchestration for local Git repositories`

这份文档的作用是：

- 统一产品定义，不再把历史交付拆分文档当成并行 PRD
- 将已经进入代码和交互面的能力正式纳入产品范围
- 为 API、实现文档和后续演进提供顶层约束

当本文与其他仓库文档冲突时，以本文为准。

---

## 2. 从 v3.2 到 v4.0 的变化

v4.0 保留了 v3.2 已经确定的核心约束：

- 本地优先
- 人工监督
- 受控 Worker execution backend（当前默认实现为 Docker）
- 可编辑计划与可执行子任务分离
- append-only review / merge history

同时把下面这些能力升级为正式产品定义，而不再仅作为后续路线：

- Web-first leader orchestration
- task 内 team / member 视图
- role-aware DAG planning
- template seed 与 guided task creation
- 结构化 mailbox / handoff 合同
- live operations board 与 action-required 聚合
- integration branch、integration queue、release gate
- preview studio 与预览目标管理
- task archive / unarchive
- 指标摘要与导出

---

## 3. 产品定义

### 3.1 一句话定义

EAT 是一个运行在本机上的 Web 工作台，让操作者围绕本地 Git 仓库，以 Lead Agent 为唯一主要编排入口，在独立分支、独立 worktree、独立受控执行后端中调度多个 Worker Agent，并在浏览器中监督澄清、计划、执行、审查、集成、预览和收口全过程；当前正式 Worker backend 仍为 Docker。

### 3.2 产品定位

EAT 是：

- 面向真实工程仓库的交付编排工具
- 本地优先而非云端托管系统
- 监督式而非黑盒自治系统
- Web-first operator experience，而不是 tmux-first 或 CLI-first 产品

EAT 不是：

- 全自动无人值守 swarm
- 多用户协作平台
- 跨机器分布式 transport 平台
- 自动解决冲突并自动发布的黑盒发布系统

### 3.3 核心价值

- 用 Lead Agent 统一需求澄清、计划生成、审查和收口
- 用 Worker Agent 并行执行可拆分的工程任务
- 用 Git 分支、worktree 和受控执行后端维持执行隔离
- 用 append-only 的历史记录保持过程可追溯
- 用 board、mailbox、queue 和 preview 维持人类监督能力

---

## 4. 核心原则与不可破坏约束

### 4.1 人类监督优先

EAT 不是“用户旁观、系统自治”的默认模式。以下检查点必须保留：

- 需求确认
- 计划批准
- `ACTION_REQUIRED` 阶段的人类决策
- 集成失败、冲突、回滚时的人类干预

### 4.2 本地优先

项目、数据库、日志、附件、worktree、容器和运行状态默认都留在本机。

### 4.3 Worker 必须运行在受控执行后端中

Worker 执行不能退化为对宿主仓库目录的直接写入执行。  
当前正式默认实现仍然是 `DOCKER`。  
允许存在 `HOST` sandbox 能力声明，但无论使用哪种实现，只有在 execution backend ready 时才允许批准执行。无 execution backend 时，系统允许 Lead-only 模式完成任务创建、需求澄清和计划生成。

### 4.4 计划与执行分离

- `currentPlanJson` 表示当前可编辑计划
- `approvedPlanJson` 表示已冻结计划
- `SubTask` 只在计划批准后物化

不得把“正在编辑的计划草稿”与“已经落库、可执行的子任务”混成同一层对象。

### 4.5 审查与合并历史必须 append-only

以下记录必须保持追加式历史，而不是单条可变状态覆盖：

- `PlanSnapshot`
- `ReviewRecord`
- `MergeRecord`
- `MailboxMessage`
- `IntegrationRun`
- `IntegrationQueueItem`
- `GateResult`

### 4.6 执行阶段必须 board-first

澄清阶段可以 transcript-first。  
进入执行后，主界面必须以 board / team / action-required 为优先，而不是只显示长聊天记录。

### 4.7 国际化要求

- 默认界面语言为 `zh-CN`
- 同时保留 `en`
- 新增或重写 UI 不得破坏双语支持

---

## 5. 目标用户

- 单个开发者
- 在受控本地环境中运行的研发小团队
- 已经习惯本地 Git、CLI agent、分支和测试流程的工程用户

### 5.1 非目标

- 多租户 SaaS
- 跨组织权限与协作
- 远程执行集群
- 跨机器 Redis / queue transport
- 自动冲突修复
- “不需要审批”的自治开发系统

---

## 6. 典型用户路径

标准黄金路径如下：

1. 注册本地 Git 仓库为 `Project`
2. 创建 `Task`，选择基线分支、Lead Agent、任务描述与附件
3. 在 Web 中只与 Lead 交互，澄清需求
4. Lead 生成 role-aware DAG 计划
5. 操作者在 `PLAN_REVIEW` 中编辑、恢复快照、应用模板 seed，并批准执行
6. 系统先校验 execution backend readiness；通过后物化 `SubTask`，建立 team 视图并在当前默认 Docker backend 中启动 Worker
7. 操作者在 board、team、mailbox、activity stream 中监督执行
8. 系统执行增量审查、最终审查、integration run、gate 检查和 merge
9. 操作者查看 preview、处理 action required、归档任务或继续恢复执行

---

## 7. 产品范围

### 7.1 当前产品内

#### 项目与仓库

- 注册和注销本地 Git 仓库
- 目录浏览与绝对路径输入
- 默认分支、当前分支、仓库状态探测
- 同路径去重

#### Agent 目录与运行时

- Agent registry
- 健康检查
- lead / worker 候选筛选
- runtime mode 显示
- sandbox capability 声明

#### 任务与澄清

- 普通任务创建
- 引导式任务创建
- 附件上传和类型校验
- Lead clarification 会话
- 任务文档快照
- 无 execution backend 时的 Lead-only 模式（创建 / 澄清 / 规划）

#### 计划

- Lead 生成计划
- role-aware DAG plan
- plan validation
- plan history snapshots
- template seed
- guided flow
- 操作者编辑和恢复计划

#### 执行

- 批准后物化子任务
- team / member 视图
- 子任务分支与 worktree
- 受控 Worker execution backend（当前默认 Docker）
- 依赖调度
- 并发 Worker 执行
- 实时事件流和会话输出

#### 协作与监督

- typed mailbox / handoff
- lead -> subtask
- subtask -> lead
- subtask -> subtask
- live operations board
- action-required 聚合

#### 审查与恢复

- incremental review
- final review
- retry
- rework
- change agent
- reassign
- cancel
- confirm discard
- rebase retry

#### 集成与收口

- task mainline branch
- integration branch
- integration run
- integration queue
- release gate result
- rollback / retry / dequeue
- merge history

#### 预览与运营

- preview target recommendation
- preview session 启动 / 停止
- metrics summary / export
- task archive / unarchive

### 7.2 当前产品外

- 多用户协作
- 跨任务共享 mailbox
- 跨项目协作图谱
- 自动 conflict resolution
- 云端托管控制面
- serverless / edge runtime
- 成本核算平台

---

## 8. 核心对象与术语

| 对象 | 定义 |
|------|------|
| `Project` | 一个注册的本地 Git 仓库 |
| `Task` | 一次面向单个项目的任务编排记录 |
| `currentPlanJson` | 当前可编辑计划草稿 |
| `approvedPlanJson` | 已冻结、可执行的批准计划 |
| `PlanSnapshot` | 计划历史快照 |
| `SubTask` | 从批准计划物化出的执行单元 |
| `Task Mainline Branch` | 任务级主线分支，保存该任务累计有效进展 |
| `Integration Branch` | 集成分支，用于 integration run 和 release gate |
| `AgentSession` | 一次 Lead 或 Worker 的真实会话记录 |
| `MailboxMessage` | task-scoped 的结构化 handoff 消息 |
| `ReviewRecord` | 增量或最终审查记录 |
| `MergeRecord` | merge / rebase 尝试历史 |
| `IntegrationRun` | 一次面向 task 的集成运行 |
| `IntegrationQueueItem` | integration run 中待处理的显式队列项 |
| `GateResult` | release gate 的检查结果 |

### 8.1 Task 关键字段

`Task` 必须至少包含：

- `title`
- `description`
- `leadAgentType`
- `baseBranch`
- `baseCommitSha`
- `taskBranchName`
- `status`
- `planVersion`
- `currentPlanJson`
- `approvedPlanJson`
- `lastError`
- `archivedAt`

### 8.2 SubTask 关键字段

`SubTask` 必须至少包含：

- `title`
- `description`
- `branchSuffix`
- `dependencyBranchSuffixes`
- `branchName`
- `worktreePath`
- `agentType`
- `status`
- `autoAssigned`
- `retryCount`
- `latestReviewDecision`
- `latestReviewPhase`
- `latestReviewSummary`
- `role`
- `displayName`
- `executionOrder`
- `assignmentSource`
- `runSummary`

### 8.3 MailboxMessage 关键字段

`MailboxMessage` 必须至少支持：

- `senderType`
- `senderSubTaskId`
- `targetType`
- `targetSubTaskId`
- `messageType`
- `artifactRefs`
- `fileRefs`
- `branchRef`
- `schemaJson`
- `requiresAck`
- `content`

### 8.4 集成对象

`IntegrationRun` 必须至少包含：

- `taskId`
- `integrationBranch`
- `status`
- `startedAt`
- `endedAt`

`IntegrationQueueItem` 必须至少包含：

- `integrationRunId`
- `subTaskId`
- `queueOrder`
- `status`
- `mergedCommitSha`

`GateResult` 必须至少包含：

- `integrationRunId`
- `gateType`
- `status`
- `summary`
- `detailsJson`

---

## 9. 状态模型

### 9.1 Task 状态

Task 允许的状态为：

- `DRAFT`
- `CLARIFYING`
- `PLANNING`
- `PLAN_REVIEW`
- `EXECUTING`
- `REVIEWING`
- `MERGING`
- `ACTION_REQUIRED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

状态定义：

- `DRAFT`：任务已创建，尚未启动澄清
- `CLARIFYING`：Lead 与操作者正在澄清需求
- `PLANNING`：Lead 正在生成计划
- `PLAN_REVIEW`：计划已生成，等待人工编辑与批准
- `EXECUTING`：Worker 执行和依赖调度进行中
- `REVIEWING`：进行任务级最终审查
- `MERGING`：进行 integration run、gate 或 merge 收口
- `ACTION_REQUIRED`：需要操作者处理失败、返工、冲突、回滚或继续动作
- `COMPLETED`：任务主流程结束，清理流程已执行或尝试执行
- `FAILED`：任务无法自动继续
- `CANCELLED`：任务被停止

### 9.2 SubTask 状态

SubTask 允许的状态为：

- `BLOCKED`
- `PENDING`
- `READY`
- `RUNNING`
- `REVIEW_PENDING`
- `ACCEPTED`
- `REWORK_REQUIRED`
- `DISCARD_PENDING`
- `MERGED`
- `FAILED`
- `CANCELLED`
- `DISCARDED`

状态含义：

- `BLOCKED`：依赖尚未满足
- `PENDING`：待启动但未落到运行
- `READY`：分支、worktree、agent 指派已就绪
- `RUNNING`：已有运行中的 Worker session
- `REVIEW_PENDING`：最近一次执行成功，等待审查或收口
- `ACCEPTED`：审查通过，可进入集成
- `REWORK_REQUIRED`：需要返工
- `DISCARD_PENDING`：等待操作者确认丢弃
- `MERGED`：已成功进入集成结果
- `FAILED`：最近一次执行失败
- `CANCELLED`：该子任务被取消
- `DISCARDED`：该子任务被明确丢弃

### 9.3 AgentSession 状态

会话状态至少包括：

- `PENDING`
- `STARTING`
- `RUNNING`
- `STOPPING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### 9.4 IntegrationRun 状态

集成运行状态至少包括：

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `ACTION_REQUIRED`
- `ROLLED_BACK`

### 9.5 IntegrationQueueItem 状态

队列项状态至少包括：

- `QUEUED`
- `MERGED`
- `FAILED`
- `DEQUEUED`
- `RELEASED`
- `ROLLED_BACK`

### 9.6 GateResult 状态

gate 结果状态至少包括：

- `PASSED`
- `FAILED`

---

## 10. 功能要求

### 10.1 Project Management

#### FR-PM-01 项目注册

- 用户提供绝对路径，或通过目录浏览选择仓库
- 系统验证路径存在、可读、是 Git 仓库
- 系统记录项目名、规范化路径、默认分支

#### FR-PM-02 项目状态展示

- UI 必须能显示项目路径、默认分支、当前分支和仓库状态
- 若仓库工作区不干净，必须可见地提醒操作者

#### FR-PM-03 多任务并存

- 同一 `Project` 下允许多个 `Task`
- 但仓库级 Git 写操作必须串行化，避免互相污染

### 10.2 Agent Directory And Runtime

#### FR-AR-01 Agent 目录

- 系统必须区分 lead candidates 与 worker candidates
- 系统必须展示 capabilities、runtime mode 和健康结果

#### FR-AR-02 Runtime Mode

- adapter 可声明 `REAL` 或 `STUB`
- `STUB` adapter 不能被伪装成真实可执行 provider
- 当前产品允许存在多个 adapter，但真实可用运行时以 `codex-cli` 为主

### 10.3 Task Creation And Guided Flow

#### FR-TC-01 普通任务创建

创建时至少需要：

- `projectId`
- `title`
- `description`
- `baseBranch`
- `leadAgentType`

系统必须：

- 校验 lead agent 健康状态
- 记录 `baseCommitSha`
- 创建 task 级主线分支并持久化 `taskBranchName`
- 校验并持久化任务附件
- 令 task 进入 `DRAFT`

#### FR-TC-02 引导式建任务

- 系统必须提供 guided flow
- 用户可通过模板直接生成 plan seed
- guided flow 是降低首次成功门槛的产品能力，不得绕过审批模型

### 10.4 Clarification And Task Document

#### FR-CL-01 澄清启动

- 只有健康的 lead agent 才能启动澄清
- 启动后创建 `sessionType = LEAD` 的 `AgentSession`
- task 转入 `CLARIFYING`

#### FR-CL-02 对话与快照

- 操作者和 Lead 的消息必须持久化
- 系统必须保留任务文档快照或等价的结构化澄清结果

#### FR-CL-03 需求确认

- 只有操作者显式确认后才能从 `CLARIFYING` 进入 `PLANNING`
- 不允许隐式跳过需求确认

### 10.5 Role-Aware DAG Planning

#### FR-PL-01 计划输出

Lead 产出的计划至少应覆盖每个节点的：

- `title`
- `description`
- `recommended_agent`
- `branch_suffix`
- `role`
- `deliverable`
- `acceptance_criteria`
- 可选 `depends_on`
- 可选 `template_hint`

#### FR-PL-02 计划校验

系统必须校验：

- JSON 可解析
- 节点非空
- `branch_suffix` 唯一
- `role` 非空
- `deliverable` 非空
- `acceptance_criteria` 非空
- 依赖图无环
- `recommended_agent` 合法

#### FR-PL-03 计划历史

- 每次合法的 lead-generated 计划都应形成 `PlanSnapshot`
- `planVersion` 只在 lead 成功生成新计划时递增
- 操作者编辑计划不增加 `planVersion`

#### FR-PL-04 Plan Review

在 `PLAN_REVIEW` 中，操作者必须可以：

- 编辑节点标题和描述
- 修改 `role`
- 修改 `recommended_agent`
- 修改 `branch_suffix`
- 修改 `deliverable`
- 修改 `acceptance_criteria`
- 修改 `depends_on`
- 新增 / 删除节点
- 从 `PlanSnapshot` 恢复
- 应用 template seed

#### FR-PL-05 计划批准

批准后系统必须：

- 校验 `currentPlanJson`
- 写入 `approvedPlanJson`
- 生成 `source = APPROVED` 的 `PlanSnapshot`
- 物化 `SubTask`
- 将 task 置为 `EXECUTING`

### 10.6 Team Lifecycle And Worker Execution

#### FR-EX-01 Team 视图

task 内必须存在 team / member 视图。  
每个成员卡片至少显示：

- `role`
- `displayName`
- `agentType`
- `branchName`
- `worktreePath`
- 当前状态
- 运行摘要

#### FR-EX-02 分支与 worktree

每个 `SubTask` 必须拥有：

- 独立分支
- 独立 worktree
- 独立 Worker session

分支冲突时系统必须自动重命名并保留冲突解决历史。

#### FR-EX-03 Controlled Execution Backend

每个 Worker session 必须运行在受控 execution backend 中。当前正式默认实现为 Docker，因此当前主路径要求：

- 运行在独立 Docker 容器中
- 将 worktree 以读写方式挂载
- 将附件按需只读挂载
- 不默认暴露宿主关键目录
- 默认非 root 且非 `--privileged`

#### FR-EX-04 依赖调度

- root subtasks 可并行执行
- downstream subtasks 必须在依赖满足后才可释放
- 依赖满足的产品语义是：上游执行结果已经足以为下游提供可消费上下文和主线进展
- 最终审查仍然是合并权威，不因为下游提前启动而被绕过

#### FR-EX-05 中途干预

执行阶段至少支持：

- `retry`
- `rework`
- `change-agent`
- `reassign`
- `cancel`
- mailbox 消息发送

### 10.7 Structured Mailbox And Handoff

#### FR-MB-01 mailbox 追加式持久化

- mailbox 必须 append-only
- 必须记录 sender、target、类型、内容和引用上下文

#### FR-MB-02 typed handoff

系统至少支持这些 `messageType`：

- `NOTE`
- `BLOCKER`
- `DELIVERABLE_READY`
- `API_CONTRACT`
- `DB_CONTRACT`
- `TEST_REQUEST`
- `REVIEW_REQUEST`

#### FR-MB-03 结构化引用

mailbox 必须支持：

- `artifactRefs`
- `fileRefs`
- `branchRef`
- `schemaJson`
- `requiresAck`

#### FR-MB-04 prompt 注入

Worker prompt 不得简单拼接全部 mailbox 内容，而应按优先级裁剪：

- 最新合同
- blocker / request
- 必要的摘要说明

### 10.8 Review And Rework

#### FR-RV-01 增量审查

- 每个成功完成的 subtask 都应生成 `INCREMENTAL` 审查记录
- incremental review 是信号，不是最终权威
- incremental review 不直接改变任务级结论

#### FR-RV-02 最终审查

- final review 是唯一有权推进 `ACCEPTED` / `REWORK_REQUIRED` / `DISCARD_PENDING` 的审查阶段
- final review 结果必须持久化

#### FR-RV-03 恢复入口

操作者必须可在合适的状态下触发：

- `Rework`
- `Confirm Discard`
- `Rebase & Retry`
- merge resume

### 10.9 Integration, Queue And Release Gates

#### FR-IG-01 task mainline 与 integration branch

系统必须同时保留：

- task mainline branch
- integration branch

task mainline 用于累计任务主线进展；  
integration branch 用于集成验证和 queue 收口。

#### FR-IG-02 integration run

当 task 进入收口阶段时，系统必须能创建显式 `IntegrationRun`，并将 accepted subtasks 放入显式队列。

#### FR-IG-03 merge queue

merge queue 不能只是内存顺序，必须是可见、可持久化、可恢复的对象层。

#### FR-IG-04 release gate

release gate 与 final review 是两个概念：

- final review：语义与质量判断
- release gate：测试、构建、lint、迁移等技术性放行检查

#### FR-IG-05 失败恢复

integration 失败后，系统必须支持：

- retry integration run
- rollback integration run
- dequeue queue item
- 将 task 转入 `ACTION_REQUIRED`

### 10.10 Preview, Metrics And Archive

#### FR-PV-01 preview studio

系统必须提供 preview studio，并允许对以下目标发起预览：

- 基线分支
- task mainline
- subtask 分支
- integration run 目标

#### FR-PV-02 preview sandbox

preview 必须在独立工作目录和受控容器环境中启动，不得直接污染用户活动工作目录。

#### FR-MT-01 指标

系统必须提供：

- metrics summary
- metrics export

#### FR-ARH-01 归档

task 必须支持：

- archive
- unarchive

归档后的任务历史仍需可读。

---

## 11. 系统架构要求

### 11.1 运行时形态

当前产品要求：

- 本地长运行 Go HTTP 服务进程
- 本地 SQLite 数据库
- 本地 Docker daemon
- 本地 Git CLI
- 浏览器通过 `127.0.0.1` 访问 UI

### 11.2 推荐技术栈

- UI：React + TypeScript + Vite
- Server：Go `net/http` + `chi`
- Persistence：SQLite via Go `database/sql`
- Realtime：SSE
- Sandbox：Docker Engine / compatible daemon
- Git：native `git` CLI

### 11.3 持久化要求

本地持久化至少包括：

- projects
- tasks
- messages
- attachments
- plan snapshots
- subtasks
- sessions
- mailbox messages
- review records
- merge records
- integration runs
- integration queue items
- gate results

---

## 12. UX 要求

### 12.1 Web-first

用户应当通过 Web 完成主编排动作，而不是依赖命令行。

### 12.2 执行阶段 board-first

进入执行后，默认关注面应切换为：

- team 状态
- DAG 运行态
- blocker
- mailbox
- activity stream
- action required

### 12.3 可解释性

系统必须让操作者清楚知道：

- 谁在执行
- 谁阻塞了谁
- 哪些 handoff 未闭环
- 哪个 gate 阻止了集成
- 下一步最值得人工处理的点是什么

### 12.4 安全可见性

当发生以下情况时，UI 必须明确可见：

- Agent 不健康
- 附件被 capability 过滤
- 分支发生重命名
- launch failure
- merge conflict
- integration failure
- cleanup warning

---

## 13. 成功标准

当前产品应至少满足以下成功标准：

- 新用户可通过 Web 注册本地项目并创建任务
- Lead 可在 Web 中完成需求澄清和计划生成
- 操作者可在 `PLAN_REVIEW` 中编辑 role-aware DAG 并批准执行
- 无 execution backend 时，系统仍允许创建任务并完成澄清 / 规划，但批准执行会被明确拦截
- Worker 可在独立分支、worktree 和 Docker sandbox 中并发运行
- 操作者可在 board 中监督 team、mailbox、review 和 integration 状态
- 最终结果可通过 integration run、gate 和 merge 流程收口
- 当流程中断时，系统提供足够明确的 `ACTION_REQUIRED` 恢复入口

---

## 14. 当前已知边界

- 仍然是单机、单用户系统
- 仍然不做自动 conflict resolution
- 仍然不做跨项目或跨任务共享协作网络
- 进程级崩溃后，不保证恢复已有 PTY 会话
- 允许存在 `STUB` adapter，但不得把它们作为真实 provider 体验对外承诺

---

## 15. 结论

EAT 的产品主线已经不再只是“本地多 agent MVP 编排器”，而是：

一个以 Lead 为核心、以 role-aware DAG 为执行载体、以受控 execution backend 为安全边界（当前默认 Docker）、以 mailbox / board / integration / preview 为监督界面的本地 Web 编排工作台。

后续所有 schema、API、UI 和实现工作，都应服从这个定义。

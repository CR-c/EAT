# EAT v1.1 路线文档

## 目标

当前仓库已经完成 `docs/phase/` 下定义的 MVP phase 01 到 16。  
`v1.1` 的目标不是继续补底层 MVP 缺口，而是把产品从“已经能跑的本地监督式多 agent 编排器”推进到“真正可以通过 Web 界面完成 leader orchestration 的版本”。

一句话定义：

`v1.1 = Web-first Leader Orchestration for real Codex CLI multi-agent execution`

也就是：

- 用户不再需要依赖命令行去编排 team
- 用户可以在 Web 中把一个高层任务直接交给 lead agent
- lead agent 使用真实 `codex-cli` 规划、派发、协调、集成
- worker 继续保持独立 worktree + Docker sandbox
- 人类继续保有监督权和关键审批权

## 参考项目与借鉴点

本路线参考了 ClawTeam 的几个有效思路，但不会直接照搬其产品边界：

- 参考项目：
  - https://github.com/HKUDS/ClawTeam
  - https://github.com/HKUDS/ClawTeam/blob/main/README.md
  - https://github.com/HKUDS/ClawTeam/blob/main/ROADMAP.md

适合借鉴的点：

- leader 负责拆解任务并派生多个 specialist agent
- agent 之间存在显式 handoff / inbox 协作
- 每个 agent 对应独立工作空间，结果可合并回主线
- 存在持续可视化的 board / dashboard
- 围绕“复杂目标 -> DAG -> 执行 -> 集成”的主线设计产品

不直接照搬的点：

- EAT 暂不把“完全自治、用户只旁观”设为默认模式
- EAT 暂不把跨机器 Redis transport 作为 v1.1 主目标
- EAT 暂不转向 tmux-first / CLI-first operator UX
- EAT 必须保留当前 PRD 中已经建立的 Docker worker sandbox 和人工审批边界

换句话说，ClawTeam 给的是“编排方式上的启发”，不是 EAT 的新 PRD 本身。

## v1.1 产品定义

v1.1 的主线能力应当满足下面这个黄金路径：

1. 用户在 Web 中输入一个高层目标
2. lead agent 生成可编辑的 team execution plan
3. plan 中包含角色、子任务、依赖、交付物、验收标准
4. 用户在 Web 中确认后启动真实 Codex 多 worker 执行
5. worker 在独立 worktree + Docker sandbox 中执行
6. 任务过程中的 mailbox、handoff、状态、阻塞、审查都在 Web 中可见
7. 系统对已完成结果做集成、验证、最终审阅与合并

示例场景：

> “做一个全栈 Todo 应用，包含认证、数据库和 React 前端。”

在 v1.1 中，用户应该可以直接在 Web 中把这个任务交给 lead agent，然后看到：

- architect / backend / frontend / tester 等角色拆解
- DAG 依赖
- 实时执行
- agent 间 handoff
- 集成和最终 merge 结果

## v1.1 边界

v1.1 内：

- 单机、本地优先
- 真实 `codex-cli`
- Web-first orchestration
- 多 worktree、多 worker、多阶段 handoff
- 监督式执行

v1.1 外：

- 多用户协作
- 跨机器 transport / Redis backend
- 云端托管
- 完全自动合并冲突修复
- 无审批的黑盒自治 swarm

## v1.1 Phase 列表

17. [17-web-leader-orchestration-and-team-lifecycle.md](/home/code/EAT/docs/v1.1/17-web-leader-orchestration-and-team-lifecycle.md)
18. [18-dag-planning-role-assignment-and-template-seeding.md](/home/code/EAT/docs/v1.1/18-dag-planning-role-assignment-and-template-seeding.md)
19. [19-structured-mailbox-contracts-and-artifact-handoff.md](/home/code/EAT/docs/v1.1/19-structured-mailbox-contracts-and-artifact-handoff.md)
20. [20-live-operations-board-and-human-supervision.md](/home/code/EAT/docs/v1.1/20-live-operations-board-and-human-supervision.md)
21. [21-integration-branch-merge-queue-and-release-gates.md](/home/code/EAT/docs/v1.1/21-integration-branch-merge-queue-and-release-gates.md)
22. [22-golden-path-templates-demo-flows-and-operator-polish.md](/home/code/EAT/docs/v1.1/22-golden-path-templates-demo-flows-and-operator-polish.md)

## 配套文档

- [CHECKLISTS.md](/home/code/EAT/docs/v1.1/CHECKLISTS.md)
- [PRISMA-MIGRATIONS.md](/home/code/EAT/docs/v1.1/PRISMA-MIGRATIONS.md)
- [API-EVENT-EXAMPLES.md](/home/code/EAT/docs/v1.1/API-EVENT-EXAMPLES.md)
- [IMPLEMENTATION-ORDER.md](/home/code/EAT/docs/v1.1/IMPLEMENTATION-ORDER.md)

## 推荐实施顺序

- 先做 phase 17 和 18，建立 Web 侧 leader orchestration 主骨架
- 再做 phase 19 和 20，让 team coordination 真正能被看见和操作
- 最后做 phase 21 和 22，把“可运行”提升成“可演示、可复用、可交付”

## 当前建议

如果下一步马上进入开发，优先级应当是：

1. Phase 17
2. Phase 18
3. 在这两阶段完成后，用“全栈 Todo”作为端到端 demo task 反推缺口

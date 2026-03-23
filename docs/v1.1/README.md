# EAT Extended Phases 17-22

本目录承载 EAT 的扩展交付阶段，也就是 phase `17` 到 `22`。  
统一文档入口见 [docs/README.md](/home/code/EAT/docs/README.md)，实现规则见 [AGENTS.md](/home/code/EAT/AGENTS.md)。

在 `PRD v4.0` 之前，这组文档以 “v1.1 路线” 的方式存在；现在它们应被理解为：

`同一产品线中的后续扩展阶段文档`

而不是另一份和 `docs/PRD.md` 并列竞争的产品定义。

## 这组文档解决什么问题

phase `01` 到 `16` 把基础主干能力搭起来了，但还不足以把 EAT 表现成一个真正成熟的 Web orchestration 工作台。  
phase `17` 到 `22` 负责把基础能力推进到当前产品形态，重点包括：

- Web-first leader orchestration
- team / member lifecycle
- role-aware DAG planning
- structured mailbox / handoff
- live operations board
- integration branch / queue / release gates
- guided flow、template seed、demo-ready operator polish

## 与 `PRD v4.0` 的关系

现在的关系应理解为：

- `docs/PRD.md` 定义当前产品
- `docs/phase/` 负责基础交付阶段 `01` 到 `16`
- `docs/v1.1/` 负责扩展交付阶段 `17` 到 `22`

换句话说，`docs/v1.1/` 不是“另一个 PRD”，而是 phase continuation。

## 产品方向摘要

这组扩展阶段把 EAT 从“基础可运行的本地监督式编排器”推进到：

`web-first, role-aware, supervision-first local orchestration workbench`

也就是：

- 用户在 Web 中完成主编排动作
- Lead 成为主要的交互和编排入口
- plan 从普通子任务列表升级为 role-aware DAG
- team、mailbox、board、integration、preview 成为正式一等界面

## 扩展阶段列表

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

## 如何使用这些文档

如果你在做新实现，不要跳过基础阶段文档。建议顺序是：

1. `docs/PRD.md`
2. `docs/phase/README.md`
3. 对应的 phase `01` 到 `16`
4. 再看本目录的 phase `17` 到 `22`

如果你在做文档维护，应确保：

- 术语继续服从 `PRD v4.0`
- 扩展阶段不要悄悄改写早期状态机定义
- 新能力应写清楚是在扩展还是替换基础阶段契约

## 当前建议

如果要继续推进交付，优先从 phase `17` 到 `22` 中尚未完全对齐 `PRD v4.0` 的部分入手，特别关注：

1. team / board 视图与 task 状态机的一致性
2. role-aware DAG 字段与 plan validation 的一致性
3. integration queue / gate / integration 状态语义与当前实现的一致性
4. guided flow、preview 和 operator polish 是否保持监督边界不变

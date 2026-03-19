# Phase 22 FAQ And Known Limits

## FAQ

### 1. guided task 会不会绕过审批？

不会。  
guided flow 只是用内建模板预填 role-aware DAG，并把任务直接放到 `PLAN_REVIEW`，operator 仍然必须显式批准后才能进入执行。

### 2. 模板是不是在替代 lead agent 思考？

不是。  
模板的目标是降低第一次成功门槛，让典型任务更快进入可审查状态；plan 仍然可以编辑，lead 仍然需要在监督边界内推进任务。

### 3. Web 里能否直接演示“全栈 Todo 应用”这类任务？

可以。  
`full-stack-web-app` 模板内置了 `architect`、`backend`、`database`、`frontend`、`tester`、`integration` 六个角色，适合作为默认黄金路径演示。

### 4. guided flow 和普通创建任务有什么区别？

- 普通创建任务走常规创建入口，由 lead 生成或补全计划。
- guided task 使用内建模板预置计划骨架，更适合首次使用、演示和标准化场景。

### 5. 什么时候应该不用模板？

当任务结构非常特殊、依赖链不稳定，或者 operator 需要完全从空白描述开始审查 lead 的拆解时，应优先使用普通创建流程。

## Known Limits

- 当前模板覆盖的是黄金路径场景，不是完整任务类型目录。
- guided task 生成的是可审查草案，不保证模板内容已经适配每个仓库的真实技术栈。
- 演示质量依赖本机 `codex-cli` 可用、已认证，并且 Docker sandbox 正常工作。
- 如果仓库缺少可执行测试、构建命令或 gate 配置，后续 execution / integration 阶段仍可能进入 `ACTION_REQUIRED`。
- Phase 22 聚焦单机、受监督、本地优先体验，不包含多用户 onboarding 或 SaaS 化部署能力。
- 本阶段提供的是 demo dataset，不强制绑定单一 demo repo；如需完全稳定复现，仍建议准备可重复初始化的样例仓库。

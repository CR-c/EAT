# Phase 22 - Golden Path Templates, Demo Flows And Operator Polish

## 目标

把前面阶段形成的能力收束成“第一次打开就能跑通”的产品体验，能稳定支撑演示和早期真实使用。

## 这一阶段的定位

phase 17 到 21 更偏系统能力。  
phase 22 的目标是把这些能力变成用户真正能顺畅用起来的黄金路径。

特别是你关心的这个场景：

> 在 Web 中输入“做一个全栈 Todo 应用，包含认证、数据库和 React 前端。”

phase 22 要保证这类任务不是“理论上能做”，而是：

- 有推荐模板
- 有清晰操作流
- 有可解释的执行过程
- 有稳定的 demo 结果

## 范围

本阶段内：

- 常见任务模板
- 引导式新建 flow
- demo scenario
- operator 文案和空态优化
- 首次使用体验优化

本阶段外：

- 多用户 onboarding
- SaaS 化部署

## 交付物

- built-in templates：
  - full-stack web app
  - backend API
  - frontend feature
  - repo-wide refactor
- guided task creation flow
- demo dataset / demo repo / demo playbook
- operator onboarding 文案
- FAQ / known limits 文档

## 黄金路径要求

至少要打通这些场景：

### 1. Full-stack Todo

- architect
- backend auth
- database
- frontend
- tester
- integration

### 2. 单模块 feature 开发

- plan
- implementation
- review
- merge

### 3. 高风险修改

- plan
- partial execution
- action required
- manual intervention
- resume

## 产品决策

### 1. 模板的目标是降低第一次成功门槛

不是为了替代 lead agent 思考。

### 2. demo flow 是产品功能的一部分

如果没有一个稳定 demo 流，后续不论是对内推进还是对外展示都会一直低效。

## 测试与验收

验收标准：

- 新用户能通过 Web 快速启动典型任务
- “Todo 全栈” demo 可以稳定复现
- 模板不会绕开审批和监督边界
- 空态、错误态、阻塞态对 operator 足够清晰

建议测试：

- guided flow E2E
- template seed correctness
- demo scenario regression suite

## 完成后的结果

完成 phase 22 后，EAT 才算进入真正有竞争力的 `v1.1` 形态：

- Web-first
- real Codex multi-agent
- DAG planning
- structured handoff
- live supervision
- safe integration
- demo-ready product flow

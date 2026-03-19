# Phase 20 - Live Operations Board And Human Supervision

## 目标

把当前 task detail 扩展成真正的运行看板，让用户在 Web 中持续监督整个 agent team，而不是只盯着某一个 subtask。

## 这一阶段解决的问题

当前 UI 已有 execution board，但还偏“详情页”思维，不是真正的运营面板：

- 缺少 team 级总览
- 缺少 blocker 聚合
- 缺少 handoff 热点视图
- 缺少可视化依赖图运行状态
- 缺少批量干预入口

真实使用中，用户需要的是：

- 谁在跑
- 谁卡住了
- 谁在等谁
- 哪些 handoff 没闭环
- 现在最值得干预的点是什么

## 范围

本阶段内：

- team health board
- DAG live 状态着色
- blocker 聚合区
- mailbox / review / merge 风险聚合
- 批量 operator action

本阶段外：

- 跨 task portfolio board
- 多项目运营中心

## 交付物

- task 内的 live board 视图
- graph mode / list mode / activity mode
- blocking edges 高亮
- 待用户决策区
- agent health / runtime health / sandbox health 聚合展示

## 关键 UI 区块

### 1. Team graph

- 节点显示 role、状态、agent、最近事件
- 边显示依赖、handoff、阻塞

### 2. Action required queue

集中展示：

- rework required
- discard pending
- merge conflict
- failed launch
- unresolved blocker

### 3. Activity stream

集中展示：

- session started / ended
- mailbox 事件
- review 事件
- merge 事件

### 4. Operator controls

- rerun
- replace agent
- send note
- approve / discard
- resume merge

## 产品决策

### 1. 默认是 board first，不再是 transcript first

clarification transcript 仍保留，但执行阶段的主界面应该切换成 board first。

### 2. 必须突出“需要人处理的事”

EAT 的核心不是全自动，而是监督式编排。  
所以 UI 首屏必须优先突出需要 operator 决策的项，而不是纯粹展示日志。

## 测试与验收

验收标准：

- 用户能在一个界面识别 team 当前运行状态
- action-required 项集中可见
- DAG 状态和 mailbox 活动能够联动
- operator 可以直接从 board 做主要干预动作

建议测试：

- board 状态渲染测试
- mixed-state task 的 UI 快照测试
- action-required 队列排序测试

## 输出给下一阶段

phase 21 将围绕集成与最终交付，把 board 中“执行完成”推进到“可稳定集成发布”。

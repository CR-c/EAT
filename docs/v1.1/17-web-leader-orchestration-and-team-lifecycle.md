# Phase 17 - Web Leader Orchestration And Team Lifecycle

## 目标

把“真实 codex-cli 多 agent 编排”的入口从底层 runtime 能力提升到 Web 一等能力。

这一阶段完成后，用户应当可以在 Web 中：

- 创建一个 orchestration task
- 看到 lead agent 的 team planning 状态
- 启动一组具名 worker
- 看到每个 worker 的角色、agent 类型、分支、worktree、session 状态

## 为什么先做这一阶段

当前仓库已经能：

- 跑真实 `codex-cli`
- 支持依赖调度
- 支持基础 mailbox handoff

但还缺一个真正的“leader orchestration shell”：

- 任务还是以单个 task detail 为中心
- 没有 team 级视图
- 没有具名角色和成员生命周期
- 没有 Web 中显式的“spawn / pause / relaunch / replace worker”编排层

如果没有 phase 17，后面的 DAG、合同、board 都只能挂在旧 UI 上勉强拼接。

## 范围

本阶段内：

- 为 task 增加 team / member 视角
- Web 中可见 lead 与 worker 的角色编排
- 建立 team member 生命周期
- 为后续 DAG 和 board 提供稳定的 UI/数据骨架

本阶段外：

- DAG 编辑器
- 模板化拆解
- 富 mailbox 合同
- 多任务总览 board
- 集成分支与 release gate

## 关键产品决策

### 1. 不引入独立“Team”顶层实体

v1.1 初期继续保持：

- 一个 task 对应一次 orchestration run
- “team” 是 task 内部的运行视图，不是新的跨 task 协作对象

这样可以避免：

- 过早引入跨 task team 复用
- 把现有 task 状态机推倒重做

### 2. team member 需要持久化

当前 `SubTask` 已经能承载执行单元，但在 Web leader 编排里还缺：

- 角色名
- 成员显示名
- team 内排序
- owner/source（lead 自动生成还是用户手改）
- 运行摘要

本阶段要明确：  
`SubTask` 继续是执行单元，但 UI 上要把它表现为 team member。

### 3. operator 不写命令

所有面向用户的编排动作都必须通过 Web 完成：

- 启动执行
- 替换 agent
- 重试 / 重做
- 查看成员状态

命令行只保留给底层 adapter/runtime，不作为产品主入口。

## 交付物

- Team view 数据模型设计
- task detail 中新增 leader orchestration 区域
- 具名成员卡片
- 成员生命周期状态展示
- Web 操作入口：
  - 启动 team run
  - 替换 worker
  - 暂停 / 取消单成员
  - 重新派发单成员

## 数据与 API

建议新增或扩展的数据字段：

- `SubTask.role`
- `SubTask.displayName`
- `SubTask.executionOrder`
- `SubTask.assignmentSource`
- `SubTask.runSummary`

建议新增 API：

- `GET /api/tasks/:taskId/team`
- `POST /api/subtasks/:subTaskId/cancel`
- `POST /api/subtasks/:subTaskId/reassign`

建议新增事件：

- `team:updated`
- `subtask:assigned`
- `subtask:cancelled`

## UI 任务

- 在 task detail 顶部加入 team 概览
- 每个 subtask 卡片要显示：
  - role
  - agent
  - branch
  - worktree
  - 当前状态
  - 最近摘要
- lead 区域与 worker 区域要从视觉上分层
- 当前执行界面要从“按 subtask 看执行”提升为“按 team 看执行”

## 测试与验收

验收标准：

- 用户可以在 Web 中识别 lead 与所有 team members
- 每个成员的执行状态和运行位置可见
- 不用命令行即可完成常见单成员编排动作
- 原有 task / subtask 状态机不被破坏

建议测试：

- team API 返回成员排序与角色信息
- worker 替换与重新派发的 UI/API 流
- task reload 后 team 视图状态恢复

## 输出给下一阶段

完成后，phase 18 就可以在稳定的 team 视图上引入 DAG、角色分配和模板化拆解。

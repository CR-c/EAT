# Phase 22 - Golden Path Templates, Demo Flows And Operator Polish

## Goal

把前面阶段形成的能力收束成“第一次打开就能跑通”的产品体验，让系统既能稳定演示，也能支撑早期真实使用。

## PRD Coverage

本阶段主要落实：

- guided task creation
- template seed 的黄金路径体验
- preview studio 的 operator polish
- onboarding、FAQ、known limits 和空态文案

## Preconditions

- phase `17` 到 `21` 已完成主干扩展能力
- role-aware DAG、mailbox、board、integration、preview 已有基础实现

## Deliverables

- built-in templates 的稳定化
- guided task creation flow
- demo scenario / demo playbook
- operator-facing onboarding 文案
- FAQ / known limits 文档
- preview、空态、错误态、阻塞态的 polish

## Suggested Execution Order

1. 固化 built-in templates 和 plan seed 文案。
2. 打磨 guided flow 的表单、步骤和默认值。
3. 定义 demo scenario 与 demo playbook。
4. 打磨 preview、空态、错误态和阻塞态。
5. 形成 FAQ / known limits 文档。

## Schema And Persistence

本阶段原则上不新增核心领域对象。  
重点是复用：

- template seed
- guided task creation
- preview session
- integration / board / mailbox 已有数据

## API And Event Surface

建议或要求具备：

- `GET /api/task-templates`
- `POST /api/guided-tasks`
- `GET /api/tasks/:taskId/preview`
- `POST /api/tasks/:taskId/preview/start`
- `POST /api/tasks/:taskId/preview/stop`

## Backend Tasks

- 保证 built-in templates 输出稳定、可解释、可审阅。
- guided flow 创建后的 task 必须仍走统一审批与执行链路。
- preview recommendation 应能为 operator 给出足够合理的默认项。

## UI Tasks

- guided flow 作为黄金路径入口，而不是附属按钮。
- 模板说明应帮助用户理解角色和交付物，不应制造黑盒感。
- preview studio 要明确显示 readiness、target、command、日志和启动状态。
- 空态、错误态、阻塞态必须让 operator 知道下一步该做什么。

## Integration Tasks

- demo flow 不得绕过审批、review、integration 或监督边界。
- template、board、preview 的文案需要相互一致。

## Edge Cases

- 模板不能替代 lead 思考，只能降低第一次成功门槛。
- guided flow 创建的 task 若需要澄清，仍必须回到统一 task 状态机。
- preview 启动失败时，必须提供足够清晰的反馈，而不是静默失败。

## Acceptance Checklist

- 新用户能通过 Web 快速启动典型任务。
- “Todo 全栈” demo 能稳定复现。
- 模板不会绕开审批和监督边界。
- 空态、错误态、阻塞态对 operator 足够清晰。

## Suggested Tests

- guided flow E2E 测试。
- template seed correctness 测试。
- demo scenario regression suite。
- preview 启动 / 停止 / 失败路径测试。

## Outputs For Next Phase

phase `22` 是这一组扩展阶段的收口阶段。完成后，系统应以“可演示、可复用、可监督的本地 Web orchestration 工作台”形态对外描述，而不是继续停留在路线说明层。

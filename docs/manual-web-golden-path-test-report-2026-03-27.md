# Web 端黄金路径比对测试报告

> 测试日期：2026-03-27
> 测试基准文档：`docs/manual-web-golden-path-test-2026-03-27.md`
> 当前页面基准：运行中的现有 Web UI
> 结论：已中止，原因是核心链路存在结构性阻塞

## 1. 执行概况

本次测试按“先写任务文档，再用真实页面点击验证”的要求执行。

已完成：

1. 编写测试任务文档
2. 环境预检
3. 创建独立测试 Git 仓库
4. 通过当前 Web 页面完成项目注册
5. 通过当前 Web 页面完成任务创建
6. 通过当前 Web 页面发送多轮澄清消息
7. 通过当前 Web 页面点击“确认文档，进入计划审阅”
8. 对页面行为与后端实际状态进行比对

未继续执行：

- 计划分配批注打回与重新生成
- 批准执行
- 实现产物生成
- 查看最终代码差异
- 让 leader 再次修改
- 走到提交代码节点

中止原因不是单点 UI bug，而是主干业务能力没有形成闭环。

## 2. 测试环境

- EAT Web 服务地址：`http://127.0.0.1:3000`
- 独立测试仓库：`/home/code/eat-web-flow-sandbox`
- 测试项目 ID：`3a446c99-3c5e-40b7-a233-bbca27098130`
- 测试任务 ID：`9dcb0c40-0501-4163-8058-d9f0e2fe3679`
- Lead Agent：`codex-cli`
- Docker 预检：可用
- Worker 镜像预检：可用

约束执行情况：

- 未对 `/home/code/EAT` 执行任何 git 操作
- 测试用 git 初始化与提交只发生在独立测试仓库 `/home/code/eat-web-flow-sandbox`

## 3. 执行步骤与结果

### 3.1 项目注册

结果：通过

实际操作：

- 进入 `/projects`
- 点击“注册新项目”
- 在当前页面中输入 `/home/code/eat-web-flow-sandbox`
- 点击“确认注册”

实际结果：

- 页面成功显示新项目卡片
- 显示路径 `/home/code/eat-web-flow-sandbox`
- 显示基线 `main`
- 显示状态“已同步”

结论：

- Web 端项目注册能力可用

### 3.2 任务创建

结果：通过

实际操作：

- 进入当前项目的任务创建页
- 填写任务标题与需求描述
- 选择默认 lead agent
- 点击“确认发布”

实际结果：

- 页面成功跳转到工作区
- 任务主分支已生成：`eat/eat-web-flow-sandb-1n31xu`
- 工作区页正常加载

结论：

- Web 端任务创建能力可用

### 3.3 Leader 澄清对话

结果：页面可发消息，但 leader 实际不可对话

实际操作：

1. 在工作区输入第一条澄清消息
2. 再输入第二条补充验收标准消息

两条实际发送的消息：

- `先澄清两点：1）默认只修改原生 HTML/CSS/JS 文件；2）请给我一个包含 architect、frontend、tester、integration 的执行方案方向。`
- `补充验收标准：任务列表需要有空态提示，移动端宽度 390px 下不能溢出，README 要写清刷新后数据仍保留。`

页面实际表现：

- 两条消息都以本地操作者身份显示
- 页面未出现任何 leader 回复
- 页面左侧显示为 `COMMANDER // LOCAL`
- 右侧任务文档只回显用户输入摘要

后端实际状态：

- 任务状态变为 `CLARIFYING`
- session 存在且显示 `LEAD` / `codex-cli` / `RUNNING`
- 但消息列表只有 `USER`

关键证据：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L161) 的 `StartClarification` 只创建 synthetic lead session、切换状态并写入用户消息
- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L214) 的 `SendTaskMessage` 只写入用户消息，没有触发 leader 输出持久化

结论：

- 当前 Web 端“看起来有 leader 会话”，但业务上无法完成真正的 leader 多轮对话
- 这是核心能力缺口，不是文案或刷新问题

### 3.4 确认文档并进入计划阶段

结果：页面切到了“计划审阅”外观，但后端没有生成任何计划

实际操作：

- 点击“确认文档，进入计划审阅”

页面实际表现：

- 工作区切到 `任务分配拓扑图 (DAG_PLAN)` 视图
- 页面提示：
  `当前任务还没有可审阅计划。若任务状态是 PLANNING，说明后端已进入生成计划阶段，等待 Lead 返回即可。`
- “确认无误，开始并行执行”按钮为禁用状态

后端实际状态：

- `status = PLANNING`
- `workspaceStage = PLAN_REVIEW`
- `planVersion = 0`
- `currentPlanJson = null`
- `approvedPlanJson = null`

关键证据：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L533) 的 `ConfirmRequirements` 只把状态改成 `PLANNING` 并追加一条 system message，没有生成计划
- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx#L243) 会根据 `workspaceStage` 直接渲染计划审阅视图
- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx#L510) 在没有任何 plan 节点时展示空计划提示
- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx#L587) 只有 `task.status === "PLAN_REVIEW"` 时才允许批准执行

结论：

- 当前实现存在明显的“页面阶段”与“后端状态/数据”脱节
- 页面已展示计划审阅壳层，但没有实际计划，也不能批准执行

### 3.5 批准计划

结果：无法继续

实际验证：

- 页面上的“确认无误，开始并行执行”按钮处于禁用态
- 直接调用 `POST /api/tasks/{taskId}/plan-approvals` 返回：
  - `code = TASK_NOT_PLAN_REVIEW`
  - `message = Plan approval is only available during PLAN_REVIEW.`

结论：

- 当前任务无法从 Web 端进入执行阶段
- 因为没有 leader 产出的计划，所以后续分配、打回、执行、diff、最终修改都无法成立

## 4. 页面逻辑与业务实际能力比对

| 环节 | 页面表现 | 实际业务能力 | 结论 |
|---|---|---|---|
| 项目注册 | 可操作、可成功注册 | 后端也真实落库 | 通过 |
| 任务创建 | 可操作、可进入工作区 | 后端也真实创建任务 | 通过 |
| leader 对话 | 页面有聊天输入框和会话区 | 实际只保存 USER 消息，无 leader 回复 | 不通过 |
| 确认任务文档 | 按钮可点 | 仅切到 `PLANNING`，不生成计划 | 不通过 |
| 计划审阅 | 页面展示 DAG shell | `currentPlanJson` 为空，无计划节点 | 不通过 |
| 批注打回 | 页面存在入口 | 当前没有计划可打回，无法验证 | 阻塞 |
| 批准执行 | 页面有按钮但禁用 | API 拒绝批准，因为状态仍是 `PLANNING` | 不通过 |
| 执行实现 | 无法进入 | 无法验证 | 阻塞 |
| 查看 diff | 无法进入完成态 | 无法验证 | 阻塞 |
| 让 leader 最后修改 | 无法进入该阶段 | 无法验证 | 阻塞 |
| 提交代码 | 无法进入该节点 | 无法验证 | 阻塞 |

## 5. 中止判定

本次按要求中止，原因如下：

1. 缺少真正的 leader 回复链路
2. 缺少从澄清到计划生成的实际产出链路
3. 页面 `workspaceStage` 与后端真实状态、计划数据不一致
4. 后续所有要求验证的能力都建立在“存在有效计划”之上，而这一前提当前不成立

这已经超出“先修一个局部 bug 再回归”的范围，属于核心编排链路未落地完成。

## 6. 已修复问题

无。

说明：

- 本次没有对产品代码做修复，因为发现的是结构性阻塞，不适合在回归测试过程中做临时补丁式处理

## 7. 结论

截至 2026-03-27，本次基于当前 Web 页面的真实点击验证结论如下：

1. 能从 Web 端完成项目注册
2. 能从 Web 端完成任务创建
3. 不能通过 Web 端完成真正的 leader 多轮对话
4. 不能通过 Web 端得到实际可审阅计划
5. 因此不能继续验证计划打回、重新生成、执行实现、diff 查看、leader 最后修改和提交代码

换句话说，当前系统只打通了“项目注册 + 任务创建 + 用户消息持久化”的前半段壳层，尚未打通这次验收要求中的核心业务闭环。

## 8. 附加记录

本次测试使用的临时浏览器脚本与截图未写入仓库，位于临时目录：

- `/tmp/eat-browser/`

测试用独立仓库位于：

- `/home/code/eat-web-flow-sandbox`

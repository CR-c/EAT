# Web 端黄金路径修复清单

> 来源：`docs/manual-web-golden-path-test-report-2026-03-27.md`
> 日期：2026-03-27
> 目标：列出当前阻断 Web 黄金路径闭环的实际修复项

## 修复结论概览

当前 Web 端不是“局部按钮坏了”，而是主链路在这三个点断开：

1. 澄清阶段没有真正的 leader 回复能力
2. 确认需求后没有真正的计划生成能力
3. 前端展示阶段与后端真实状态不一致

如果不先修这三个点，后面的“打回重拟、批准执行、实现、diff、leader 最后修改、提交代码”都无法成立。

## P0：必须先修

### 1. 澄清消息只保存 USER，没有 LEADER 输出

问题表现：

- Web 工作区可以发送消息
- 任务会从 `DRAFT` 进入 `CLARIFYING`
- 但消息列表里只有 `USER`
- 页面没有任何 leader 回复

实际影响：

- 无法完成“与 leader 多轮对话”
- 任务文档只能回显用户输入，不能被 leader 主动澄清或收敛
- 后续计划生成没有真实输入来源

当前根因：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L161) 的 `StartClarification` 只做：
  - synthetic session 创建
  - 状态切换
  - 用户消息持久化
- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L214) 的 `SendTaskMessage` 只做用户消息持久化
- 当前没有把 `codex-cli` lead 运行结果写回 `Message`
- 当前也没有把 session 输出映射成 `AGENT` / `LEADER` 消息

需要修复：

1. 在开始澄清时真正启动 lead 编排流程，而不是只建 synthetic session
2. 把 lead 输出落库为消息记录
3. 让页面能读取并展示 agent 消息，而不是只显示 user/system
4. 保证刷新后 agent 回复仍存在

涉及文件：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go)
- [`backend/internal/task/session_repository.go`](/home/code/EAT/backend/internal/task/session_repository.go)
- [`backend/internal/agent/service.go`](/home/code/EAT/backend/internal/agent/service.go)
- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx)

验收标准：

- 发出首条消息后，页面能看到 leader 回复
- 连续发两轮消息后，消息列表包含 user 和 leader 双方内容
- 刷新页面后对话仍完整

### 2. ConfirmRequirements 只改状态，不生成计划

问题表现：

- 点击“确认文档，进入计划审阅”后
- 页面切到了计划审阅壳层
- 但后端只有 `status = PLANNING`
- `currentPlanJson = null`
- `approvedPlanJson = null`
- `planVersion = 0`

实际影响：

- 无法产生可审阅计划
- 无法打回重拟
- 无法批准执行

当前根因：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go#L533) 的 `ConfirmRequirements` 仅：
  - 把状态改成 `PLANNING`
  - 追加一条 system message
- 没有触发真实的 lead 计划生成流程
- 没有串联 plan parser / validator / snapshot 持久化

需要修复：

1. `ConfirmRequirements` 后触发真实 plan generation
2. 将 lead 输出送入 plan parser / validator
3. 在成功时写入：
   - `currentPlanJson`
   - `planVersion`
   - `PlanSnapshot`
4. 只有计划有效时才进入真正可审阅状态

涉及文件：

- [`backend/internal/task/task_lifecycle_service.go`](/home/code/EAT/backend/internal/task/task_lifecycle_service.go)
- [`backend/internal/task/task_plan_service.go`](/home/code/EAT/backend/internal/task/task_plan_service.go)
- [`backend/internal/task/task_plan_types.go`](/home/code/EAT/backend/internal/task/task_plan_types.go)
- [`backend/internal/task/repository.go`](/home/code/EAT/backend/internal/task/repository.go)

验收标准：

- 确认需求后，最终能得到非空 `currentPlanJson`
- `planVersion` 从 `0` 正确递增
- 页面出现真实 plan 节点，而不是空壳提示

### 3. 前端把 `workspaceStage` 当真，导致“假 PLAN_REVIEW”

问题表现：

- 页面已进入“计划审阅”视图
- 但后端真实状态仍是 `PLANNING`
- 批准按钮显示在计划页面里，但因为状态不是 `PLAN_REVIEW` 被禁用

实际影响：

- 操作者以为自己到了审阅阶段
- 实际上系统还没有计划数据
- 页面语义和业务真实状态脱节

当前根因：

- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx#L846) 的 `deriveWorkbenchStage` 优先取 `workspaceStage`
- 后端把 `workspaceStage = PLAN_REVIEW` 暴露给前端，但 `status` 仍是 `PLANNING`
- 前端因此渲染了错误阶段

需要修复：

1. 统一 `status` 与 `workspaceStage` 的语义边界
2. 没有 `currentPlanJson` 时，前端不得渲染真正的 plan review 主界面
3. 前端阶段判定要以“是否已有有效计划”作为条件之一
4. 后端不要过早暴露误导性的 `workspaceStage`

涉及文件：

- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx)
- [`backend/internal/task/task_runtime_view.go`](/home/code/EAT/backend/internal/task/task_runtime_view.go)
- [`backend/internal/task/task_query_service.go`](/home/code/EAT/backend/internal/task/task_query_service.go)

验收标准：

- `PLANNING` 且无计划时，页面明确显示“正在生成计划”
- 只有在 `status = PLAN_REVIEW` 且存在有效计划时，才进入可审阅 DAG 视图

## P1：修完 P0 后继续修

### 4. 打回重拟入口缺少后端前置条件保护

问题表现：

- 页面存在“无批注打回”入口
- 但当前无计划时这个入口仍可见

实际影响：

- 容易让操作者误以为已经具备重拟条件

需要修复：

1. 无计划时隐藏或禁用打回重拟入口
2. 页面上明确区分：
   - 正在生成计划
   - 有计划可审阅
   - 计划生成失败

涉及文件：

- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx#L579)
- [`backend/internal/task/task_plan_service.go`](/home/code/EAT/backend/internal/task/task_plan_service.go#L177)

验收标准：

- 只有存在有效 plan 节点时，才能打回重拟

### 5. 页面没有给出“leader 未回复 / 计划未生成”的明确错误态

问题表现：

- 当前页面更像静默等待
- 没有把“没有 reply”与“生成失败”区分开

实际影响：

- 操作者无法判断是慢、挂了、还是根本没接线

需要修复：

1. 为澄清阶段增加：
   - lead 运行中
   - lead 已超时
   - lead 失败
   - lead 无回复
2. 为计划阶段增加：
   - 生成中
   - 校验失败
   - 重试中
   - 已完成

涉及文件：

- [`web/src/features/tasks/pages/task-workbench-page.tsx`](/home/code/EAT/web/src/features/tasks/pages/task-workbench-page.tsx)
- [`backend/internal/api/sse.go`](/home/code/EAT/backend/internal/api/sse.go)
- [`backend/internal/api/task_handler.go`](/home/code/EAT/backend/internal/api/task_handler.go)

验收标准：

- 页面能明确告诉操作者当前卡在“没有 reply”还是“没有 plan”

## P2：P0/P1 通过后再继续

### 6. 执行、diff、最终修改、提交代码链路补全

这部分当前测试没有进入，不应先拍脑袋改页面。必须先等 P0 通过后，再继续验证和修复下面能力：

1. 计划批准后是否真实物化 subtasks
2. 是否进入 `EXECUTING`
3. 是否有真实 worker 输出
4. 是否能进入完成态并展示 diff
5. 是否支持“结果不满意 -> 要求 leader 再改”
6. 是否存在真正的“提交代码”节点

建议处理顺序：

1. 先打通 lead 对话
2. 再打通 plan generation
3. 再修状态与页面一致性
4. 然后重跑黄金路径
5. 只有跑通到 `PLAN_REVIEW -> EXECUTING` 后，才继续修执行后半段

## 建议排期

### 第一批

- 修 leader 消息产出链路
- 修确认需求后的计划生成链路
- 修页面阶段判定与空计划状态

### 第二批

- 修打回重拟前置条件
- 修澄清/计划失败态提示

### 第三批

- 重新执行黄金路径测试
- 根据新结果继续补执行、diff、leader 最终修改、提交代码

## 重新验收条件

只有满足下面条件，才值得重新跑完整 Web 黄金路径测试：

1. 工作区能显示 leader 实际回复
2. 确认需求后能自动生成有效 plan
3. 页面进入计划审阅时，计划节点真实存在
4. 批准按钮可用且能让任务进入执行态

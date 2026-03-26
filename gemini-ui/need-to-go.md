# Web 设计稿复现待补后端能力

以下项是在本次 `web/` 设计稿复现过程中确认的后端缺口。当前前端已经按设计稿展示；未落地的地方已用 mock、前端本地状态或降级行为占位。

## 1. 任务创建

- `POST /api/tasks` 目前不能接受自定义 `taskBranchName`
  - 设计稿里“目标工作分支 (TARGET)”是显式输入项。
  - 当前 Go 后端会根据标题自动生成主任务分支。
  - 需要后端支持：
    - 请求字段：`taskBranchName`
    - 分支名合法性校验
    - 冲突时自动去重或返回明确错误

## 2. 计划审阅 / 重拟

- 缺少“带批注重拟计划”的明确接口
  - 设计稿里用户可在 DAG 节点上逐项批注，然后发回 Lead 重新拆解。
  - 当前前端只能退化为通过 `POST /api/tasks/:taskId/messages` 发送文本意见。
  - 需要后端支持：
    - 显式 `replan` 接口，接收结构化节点批注
    - 返回新的 `currentPlanJson`
    - 最好附带计划版本号与变更摘要

## 3. 执行态实时信息

- 缺少适合设计稿工作台的结构化执行视图接口
  - 当前前端主要依赖 `GET /api/tasks/:taskId` 内的 `sessions / subTasks / board / team`
  - 能展示，但不够完整。
  - 还需要后端补充：
    - lead / worker 节点的统一 runtime 视图
    - 每个节点最近日志摘要、开始/结束时间、错误原因
    - 节点拓扑与依赖状态的直接字段，而不是只靠前端拼装

- 缺少前端可直接消费的增量日志接口
  - 现在只能读取 `outputBuffer`
  - 若要完整复现设计稿的终端感，需要：
    - SSE / WS 增量日志流
    - 支持按 lead / subtask 维度订阅

## 4. 合并收尾 / Diff 审阅

- 缺少任务级真实 diff / changed files API
  - 设计稿右侧是“完成态代码差异审阅”。
  - 当前后端没有直接提供：
    - 任务最终合并 diff
    - integration run diff
    - 文件树、增删行数、patch 文本
  - 当前前端只能用 mock 文件树占位。
  - 需要后端支持类似：
    - `GET /api/tasks/:taskId/diff`
    - 返回文件树、文件状态、`additions/deletions`、可选 patch 内容

## 5. 项目侧栏元数据

- 缺少项目颜色与置顶状态的后端持久化
  - 设计稿里项目有颜色标识、侧栏置顶。
  - 当前前端：
    - 颜色是按项目 ID 前端推导
    - 置顶状态保存在浏览器 `localStorage`
  - 如果需要跨浏览器/跨机器一致，应由后端保存：
    - `color`
    - `isPinned`
    - 排序权重

## 6. 工作台阶段契约

- 任务状态到阶段 UI 的映射还缺少后端显式语义
  - 当前前端用以下映射兜底：
    - `DRAFT/CLARIFYING -> CLARIFYING`
    - `PLANNING/PLAN_REVIEW -> PLAN_REVIEW`
    - `EXECUTING/ACTION_REQUIRED/REVIEWING/MERGING -> EXECUTING`
    - `COMPLETED -> COMPLETED`
  - 若后端后续继续扩展状态，建议补一个明确阶段字段，例如：
    - `workspaceStage`
    - `workspaceStageLabel`

## 7. 可选增强

- 若希望“系统控制台”的 Token 区块完全真实，需要后端提供真实 token usage 聚合，而不是只靠现有 metrics 间接拼装。
- 若希望“完成合并”按钮具备真实闭环，需要明确任务最终收尾动作接口，以及收尾后状态/归档策略。

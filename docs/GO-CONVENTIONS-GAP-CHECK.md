# Go 规范差距检查

## 文档目的

这份文档对照 `docs/GO-DEVELOPMENT-CONVENTIONS.md`，检查 EAT 当前 Go 后端实现还存在哪些明显差距。

目标不是否定当前实现，而是：

- 标出最影响维护成本的点
- 按优先级给出收敛方向
- 帮后续重构和新增功能时有统一判断基线

## 检查范围

- `backend/cmd/eat`
- `backend/internal/*`
- 当前路由、service、repository、preview、orchestrator 相关实现

## 总体结论

当前后端已经满足以下大方向：

- 使用单一 Go module
- 使用 `cmd + internal` 结构
- transport / service / repository 基本分层存在
- HTTP API 已基本切换到 canonical resource-style naming
- 测试优先使用真实 SQLite 和临时 Git 仓库，这一点与规范一致

当前主要差距集中在 4 类：

1. 响应与事件字段命名还未完全统一
2. 超大文件承载过多职责
3. 存在未落地职责的包
4. 个别 API 资源命名仍偏“仓库内部便利名”，还不够统一

## P1：必须尽快收敛

### 1. `subTaskId` / `subtaskId` 并存

这与规范里“同一响应不要并存同义字段”直接冲突。

当前可以明确看到：

- 结构体 JSON 标签大多使用 `subTaskId`
- 运行时 map payload 和事件 payload 中仍大量出现 `subtaskId`
- 有些地方甚至同一个 payload 同时写入两种键名

典型位置：

- `backend/internal/task/service.go`
  - 事件发布和运行时 payload 中同时存在 `subTaskId` / `subtaskId`
- `backend/internal/api/task_events_handler_test.go`
- `backend/internal/api/task_board_mailbox_handler_test.go`

影响：

- 前端消费方必须记忆两套字段名
- SSE 事件、运行时视图、列表视图的数据契约不统一
- 后续接口演进容易再次引入兼容分支

建议：

- 统一仓库内对外 JSON 字段名为 `subTaskId`
- `subtaskId` 只允许存在于历史测试说明或迁移说明，不再出现在新 payload 中
- 优先清理 `task/service.go` 中的事件和视图构造函数

### 2. `internal/task/service.go` 过大

当前文件规模：

- `backend/internal/task/service.go`: 4489 行

这已经明显超出单文件可维护边界。

问题不是“行数大”本身，而是同一文件同时承载：

- 任务创建
- 澄清与计划
- 审批与物化
- 子任务调度
- mailbox
- integration
- runtime 视图
- diff
- 事件发布
- 各种工具函数

影响：

- 任何一次改动都需要加载过多上下文
- review 成本高
- 容易在一个 use case 中误改另一个 use case 的公共 helper

建议拆分为至少几类文件：

- `task_create_service.go`
- `task_plan_service.go`
- `task_execution_service.go`
- `task_integration_service.go`
- `task_view_service.go`
- `task_events.go`
- `task_helpers.go`

### 3. `internal/task/repository.go` 过大

当前文件规模：

- `backend/internal/task/repository.go`: 1969 行

问题：

- 一个 repository 文件里承载 task / subtask / session / mailbox / integration / gate result / snapshot 等过多表操作

建议：

- 仍可保留同一个 `task` 包
- 但应拆文件，不必拆包：
  - `task_repository.go`
  - `subtask_repository.go`
  - `session_repository.go`
  - `mailbox_repository.go`
  - `integration_repository.go`

## P2：应尽快优化

### 4. `internal/preview/service.go` 过大

当前文件规模：

- `backend/internal/preview/service.go`: 1166 行

它同时包含：

- target 枚举
- app root 探测
- worktree 准备
- runtime 启动/停止
- 日志采集
- readiness 探测

建议拆成：

- `preview_targets.go`
- `preview_runtime.go`
- `preview_service.go`
- `preview_detection.go`

### 5. `internal/orchestrator/orchestrator.go` 仍然偏大

当前文件规模：

- `backend/internal/orchestrator/orchestrator.go`: 823 行

虽然比 `task/service.go` 好一些，但仍然同时处理：

- worker 启动
- watchdog
- review/merge 协作
- session output
- 状态推进

建议：

- 保持 `orchestrator` 包不变
- 继续把 worker lifecycle、output handling、retry scheduling 拆分到更聚焦文件

### 6. `internal/domain` 当前没有真正承担边界职责

仓库中存在：

- `backend/internal/domain/errors.go`
- `backend/internal/domain/types.go`

但当前实现中几乎没有实际被消费。

这说明它现在更像“残留抽象”而不是稳定领域层。

建议二选一：

- 要么删除 `internal/domain`
- 要么明确它只承载真正跨包共享、稳定的领域类型

不要保留一个名义上的 `domain` 包却没有清晰职责。

## P3：可以逐步收敛

### 7. 顶层 API 资源命名仍有少量“便利名”

当前整体已经比之前统一很多，但仍有少量顶层资源更像内部 convenience path：

- `/api/project-directories`
- `/api/guided-tasks`
- `/api/task-templates`

这些不一定错，但风格上仍有轻微不一致：

- 有的是项目资源的辅助集合
- 有的是任务创建的特殊模式
- 有的是模板资源

建议：

- 若短期不影响维护，可以保留
- 若后续继续收敛 API，可再统一梳理“顶层资源层级”和“创建模式资源化”规则

### 8. 错误码与错误消息还可以进一步标准化

当前已有结构化错误返回，这是好的。

仍可继续收敛的点：

- error code 命名风格统一
- 内部错误包装上下文更一致
- transport 层状态码映射继续集中

这不是当前最大问题，但会影响后续 API 一致性。

## 已符合规范的点

以下方面当前实现与新规范是一致的：

- 单 module：`backend/go.mod`
- 应用入口在 `backend/cmd/eat`
- 私有实现落在 `backend/internal/*`
- router / handler / service / repository 有明确分层
- HTTP API 命名已经从动词路径大幅收敛到 resource-style
- 真实 SQLite + 临时 Git 仓库测试是主路径
- interface 没有泛滥成“每层一个接口”

## 建议整改顺序

### 第一阶段

- 统一所有对外 payload 的 `subTaskId`
- 清理 `subtaskId` 遗留键名
- 为这项收敛补一轮 API / SSE 测试

### 第二阶段

- 拆 `internal/task/service.go`
- 拆 `internal/task/repository.go`

### 第三阶段

- 拆 `internal/preview/service.go`
- 评估 `internal/orchestrator/orchestrator.go` 的继续拆分
- 清理或重定义 `internal/domain`

### 第四阶段

- 统一顶层辅助资源命名
- 收敛错误码与错误包装

## 一句话结论

EAT 当前 Go 后端的大方向是对的，真正需要优先处理的不是“重做结构”，而是：

- 先统一 JSON / 事件字段名
- 再拆超大文件
- 最后清理残留抽象和边角命名

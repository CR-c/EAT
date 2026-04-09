# Go 开发规范

## 文档目的

这份文档定义 EAT 仓库中 Go 后端的实现规范，覆盖：

- 项目结构
- 包与模块边界
- HTTP API 定义
- service / repository 职责
- interface 使用原则
- 错误处理
- 测试与迁移

它是仓库级工程规范，不替代 `docs/PRD.md` 或运行时实现说明。

如果产品语义与本规范冲突，以 `docs/PRD.md` 为准。

## 参考基线

本规范结合以下来源，并按 EAT 当前仓库形态做了裁剪，而不是直接照搬：

- Go 官方 `Organizing a Go module`
- Go 官方 `Code Review Comments`
- Uber Go Style Guide
- 高 star Go 项目仓库结构观察：
  - `kubernetes/kubernetes`
  - `moby/moby`
  - `gin-gonic/gin`
  - `gohugoio/hugo`
  - `etcd-io/etcd`
  - `golang-standards/project-layout`

## 适用范围

当前 Go 后端模块位于：

- `backend/go.mod`
- `backend/cmd/eat`
- `backend/internal/*`

本规范默认 EAT 是一个应用型仓库，不是面向外部复用的 Go library 仓库。

因此，默认设计应优先服务：

- 单模块维护
- 单主程序或少量命令入口
- `internal` 私有包边界
- 清晰的业务能力分包

而不是优先服务外部 import 稳定性。

## 必须遵守

以下规则是 EAT 仓库中的强约束，默认必须遵守：

- 保持 `backend/` 为单一 Go module，除非明确需要独立发布和独立版本化。
- 命令入口放在 `backend/cmd/<binary-name>`，`cmd` 只做启动和依赖装配，不承载业务逻辑。
- 后端实现优先使用 `internal/` 包边界，不默认新增 `/pkg`。
- HTTP API 使用 canonical resource-style naming，路径优先使用名词而不是动词。
- JSON 字段统一 lower camel case，同一响应里不要并存同义字段。
- `internal/api` 只负责 transport；业务编排放 service；SQL 读写放 repository。
- 不要为了“形式统一”给每个 struct 先定义 interface；只有在真实抽象需求出现时再引入。
- 错误处理优先早返回，错误信息必须包含操作上下文。
- schema 变更优先 additive migration，不要静默破坏历史数据语义。
- API 契约变更时，必须同时更新 backend tests 和 frontend API wrappers。

## 推荐遵守

以下规则不是绝对硬约束，但默认应遵守；偏离时需要有清晰理由：

- 新能力优先扩展现有业务包，而不是额外创建横切抽象层。
- 包名保持短、小、稳定，避免 `util`、`common`、`helper`。
- 文件按职责命名，如 `service.go`、`repository.go`、`handler.go`。
- interface 优先定义在消费方，而不是实现方。
- 测试优先使用真实 SQLite、临时 Git 仓库和真实 router/handler 调用，而不是重 mock。
- 文档结构优先服务当前仓库维护成本，不为了追求“通用模板”引入多 module、深目录树或过度分层。

## 一、项目结构规范

### 1. 模块与入口

- 默认保持 `backend/` 为单一 Go module。
- 只有在明确需要独立发布、独立版本化、独立依赖生命周期时，才拆成多 module。
- 命令入口放在 `backend/cmd/<binary-name>`。
- `cmd` 下的 `main.go` 只负责启动、依赖装配、配置读取和进程级初始化。
- 不要把业务逻辑堆进 `cmd`。

### 2. 包分层

EAT 当前后端应优先使用以下形态：

- `internal/api`
  - HTTP transport 层
  - 路由、handler、解码、响应、状态码映射、SSE
- `internal/<bounded-context>`
  - 面向业务能力的包，例如 `task`、`project`、`preview`
  - 包内可包含 `service.go`、`repository.go`、`types.go` 等文件
- `internal/store`
  - 数据库连接与 migration 入口
- `internal/git`
  - Git 命令与工作树操作
- `internal/eventbus` / `internal/sandbox` / `internal/metrics`
  - 跨业务能力的基础设施能力

### 3. 目录使用原则

- 优先使用 `internal/`，不要默认新建 `/pkg`。
- 只有在确定某部分代码需要被仓库外部稳定复用时，才考虑 `/pkg` 或独立 module。
- 不要为了“看起来标准”引入 `pkg`、`staging`、多 module、过深目录树。
- `golang-standards/project-layout` 可以参考，但它自己也明确说明这不是官方标准，也可能对简单项目过重。

### 4. 新能力落位规则

新增后端能力时，优先问这三个问题：

1. 这是新的业务域，还是现有域的扩展？
2. 它是 transport 逻辑、业务逻辑，还是基础设施逻辑？
3. 它是否真的需要成为独立包？

默认做法：

- 扩展现有域：优先放进现有包
- 新业务域：在 `internal/` 下新增一个聚焦包
- 通用基础设施：放进 `internal/<infra-package>`

不要为了“分层漂亮”把一个很小的功能拆成过多包。

### 5. 大业务包的落地模式

当一个 bounded context 已经承担多个稳定子职责时，默认先在包内拆文件，而不是先拆包。

例如 `internal/task` 可以在保持单包的前提下，按下面结构组织：

- 核心定义
  - `service.go`
  - `task_constants.go`
  - `task_error_codes.go`
- 生命周期 / 计划 / 子任务 / 集成 / mailbox
  - `task_lifecycle_service.go`
  - `task_plan_service.go`
  - `task_subtask_service.go`
  - `task_integration_service.go`
  - `task_mailbox_service.go`
- 查询与视图
  - `task_query_service.go`
  - `task_team_view.go`
  - `task_board_view.go`
  - `task_runtime_view.go`
  - `task_view_helpers.go`
- 数据访问
  - `task_repository.go`
  - `subtask_repository.go`
  - `session_repository.go`
  - `mailbox_repository.go`
  - `integration_repository.go`
- 类型
  - `task_lifecycle_types.go`
  - `task_plan_types.go`
  - `task_query_types.go`
  - `task_mailbox_types.go`
  - `task_subtask_types.go`
  - `task_integration_types.go`

默认优先级：

1. 先保留单包
2. 在包内按职责拆文件
3. 只有当依赖方向、初始化边界、测试边界都已经稳定，且单包维护成本明显升高时，再考虑拆成多个包

## 二、包与命名规范

### 1. 包名

- 包名使用短、小、稳定的名词。
- 避免 `util`、`common`、`helper` 这种语义空泛的包名。
- 避免 stutter，例如 `task.TaskService` 比 `task.Service` 更差。

### 2. 文件命名

- 文件按职责命名，不按对象类型堆砌。
- 常见允许模式：
  - `service.go`
  - `repository.go`
  - `router.go`
  - `handler.go`
  - `errors.go`
  - `preview_service.go`
- 测试文件和被测文件保持邻近。

当单个业务包规模增大时，允许继续按职责拆成多文件，但不要拆成无边界的碎片。默认优先按这些稳定职责拆：

- 核心骨架
  - `service.go`
  - `constants.go`
  - `error_codes.go`
- use case 编排
  - `task_plan_service.go`
  - `task_lifecycle_service.go`
  - `task_mailbox_service.go`
- 查询与视图
  - `task_query_service.go`
  - `task_team_view.go`
  - `task_board_view.go`
  - `task_runtime_view.go`
- 数据访问
  - `task_repository.go`
  - `subtask_repository.go`
  - `session_repository.go`
- 类型定义
  - `task_plan_types.go`
  - `task_lifecycle_types.go`
  - `task_query_types.go`
- 共享支持
  - `task_support.go`
  - `task_events.go`

拆分原则：

- 按 use case、查询视图、repository、types 这类稳定边界聚合
- 不按“一个函数一个文件”拆
- 共享 helper 只放真正跨多个文件复用、且语义稳定的函数
- 当拆分后依然属于同一业务域时，优先保持单包，不急于拆成多个子包

### 3. 类型命名

- 导出类型用清晰名词，如 `Service`、`Repository`、`Detail`、`CreateTaskRequest`。
- JSON 字段统一 lower camel case。
- 不要在同一个响应里同时出现同义字段，例如 `subtaskId` 和 `subTaskId` 并存。

## 三、HTTP API 规范

### 1. 路径命名

- 使用 canonical resource-style naming。
- 路径优先使用名词，不使用动词开头。
- 集合资源使用复数。
- 状态切换、动作请求也应建模为资源，而不是动词路径。

推荐模式：

- `POST /api/tasks/{taskId}/plan-approvals`
- `POST /api/tasks/{taskId}/replan-requests`
- `POST /api/tasks/{taskId}/clarification-sessions`
- `PUT /api/projects/{projectId}/preferences`
- `POST /api/tasks/{taskId}/pauses`
- `DELETE /api/tasks/{taskId}/pauses/current`

避免模式：

- `/start-*`
- `/stop-*`
- `/confirm-*`
- `/approve-*`
- `/repo-status`
- `/docker-health`

### 2. handler 责任

`internal/api` 中的 handler 应保持薄：

- 读取 path/query/body
- 做最小必要的 transport 层校验
- 调用 service
- 统一响应 JSON 和状态码

handler 不应承担：

- 业务编排
- SQL
- Git 细节
- 复杂状态迁移

### 3. service 责任

service 层负责：

- use case 编排
- 业务校验
- 跨 repository / git / sandbox 的协同
- 事务边界
- 事件发布

service 不应直接暴露 HTTP 细节，不应依赖 `http.Request` 或 `http.ResponseWriter`。

### 4. repository 责任

repository 层负责：

- SQL 查询与更新
- 行到结构体映射
- 事务内数据库读写

repository 不应承担：

- HTTP 语义
- 业务状态机
- 跨系统编排

## 四、interface 规范

### 1. 默认原则

不要为每个 struct 先写一个 interface。

优先：

- 先写 concrete type
- 在真实消费方出现抽象需求时，再定义 interface

### 2. interface 放置位置

遵循 Go 官方建议：

- interface 应该定义在消费方，而不是实现方
- 实现方优先返回 concrete type

也就是说：

- 不要为了“mock 方便”在实现包里先定义接口
- 不要在 repository 包里默认给每个 repository 补一个 interface

### 3. 何时引入 interface

只有满足下列场景之一时再引入：

- 存在多个真实实现
- 调用方只需要一小部分行为
- 需要隔离外部系统适配层
- 需要为高价值测试建立清晰 seam，且 fake 成本低于真实依赖

### 4. 本仓库的默认建议

对 EAT 当前代码形态：

- `Service`、`Repository` 默认保持 concrete type
- 跨包抽象优先用 request/result struct，而不是“全局大接口”
- 对外部依赖边界，如 agent runtime、sandbox adapter、event publisher，可按需要引入小接口

## 五、错误处理规范

### 1. 早返回

遵循 Go 官方 `Indent Error Flow`：

- 保持正常路径最少缩进
- 先处理错误，再继续主流程

### 2. 错误字符串

- 错误信息应说明上下文
- 不写无信息量的 `"failed"`、`"error"` 作为完整错误
- 底层错误向上传递时补充操作上下文

例如：

- `read task: ...`
- `update project preferences: ...`
- `resolve git revision: ...`

### 3. API 错误返回

面向前端的 API 错误应统一成结构化 payload，例如：

- `code`
- `message`
- `details`

状态码映射尽量集中在 transport 层统一维护。

### 4. panic

- 业务流不应依赖 panic
- 初始化阶段无法恢复的进程级错误可以 panic / fatal
- 运行期错误应返回并处理

## 六、context 与并发规范

- `context.Context` 始终作为第一个参数传入
- 不要把 context 存入 struct
- 数据库、Git、外部命令、长链路操作都应接受 context
- goroutine 必须有清晰生命周期，不能无控制泄漏
- 多协程共享状态时，先明确所有权，再决定同步方式

## 七、数据与迁移规范

- schema 变更优先 additive migration
- 不要静默删除历史字段或历史数据语义
- migration 文件名要表达顺序和目的
- repository、migration、运行时结构体字段名要保持一致语义
- 若 schema 与文档冲突：
  - 运行时事实描述以已落地 migration 和 repository 为准
  - 产品语义仍以 PRD 为准

## 八、测试规范

### 1. 测试放置

- 测试与包同目录放置
- handler / router 测试放在 `internal/api`
- 业务测试放在对应业务包

### 2. 测试策略

EAT 默认优先：

- 真实 SQLite
- 临时 Git 仓库
- 真实 handler/router 调用

而不是：

- 大量 mock
- 只测接口不测状态变化

原因是当前仓库的大部分关键风险在于：

- 状态迁移
- SQL 持久化
- Git 分支与 worktree 操作
- API 返回契约

这些都更适合用轻量真实依赖测试。

### 3. 测试命名

- 测试名应直接描述行为和预期
- 优先写行为测试，不写实现细节测试

例如：

- `TestCreateTaskEndpointAcceptsCustomTaskBranchName`
- `TestProjectPreferencesEndpointPersistsMetadata`

## 九、文档与契约规范

- 后端 API 改动时，同时更新：
  - backend tests
  - frontend API wrapper
  - 必要的 docs / AGENTS 引用
- 运行时行为写进文档前，先核实现有代码
- 不要在本仓库里制造“代码、测试、文档三套接口名”

## 十、EAT 仓库的具体建议

结合当前实现，建议长期保持如下方向：

### 1. 保持单 module

当前 `backend/go.mod` 足够清晰，不建议拆多 module。

### 2. 保持 `cmd + internal`

这与 Go 官方对 server project 的建议一致，也与当前仓库实际结构一致。

### 3. 不新增 `/pkg`

EAT 当前不是外部复用库仓库，`internal` 更适合。

### 4. 新能力优先落在现有业务包

例如：

- 任务流转和任务工作台数据继续放 `internal/task`
- 项目注册和项目偏好继续放 `internal/project`
- 通用 Git 能力继续放 `internal/git`

而不是再造新的横切抽象层。

### 5. API 契约统一由 `internal/api` 收口

所有 path、状态码、错误包装、JSON 命名规则，都应在 `internal/api` 这一层统一。

### 6. interface 控制数量

当前仓库不需要“每层一个 interface”的 Java 式结构。优先 concrete type + 小范围抽象。

## 参考来源

- Go 官方 `Organizing a Go module`
  - https://go.dev/doc/modules/layout
- Go 官方 `Code Review Comments`
  - https://go.dev/wiki/CodeReviewComments
- Uber Go Style Guide
  - https://github.com/uber-go/guide
- `golang-standards/project-layout`
  - https://github.com/golang-standards/project-layout
- `kubernetes/kubernetes`
  - https://github.com/kubernetes/kubernetes
- `moby/moby`
  - https://github.com/moby/moby
- `gin-gonic/gin`
  - https://github.com/gin-gonic/gin
- `gohugoio/hugo`
  - https://github.com/gohugoio/hugo
- `etcd-io/etcd`
  - https://github.com/etcd-io/etcd

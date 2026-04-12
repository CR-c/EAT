# EAT Benchmark: EVAT Todo Vertical Slice

这份文档用于验证 **EAT 这个项目本身** 是否已经具备可用的监督式多 Agent 开发闭环。

这里要测的不是某个模型单独强不强，而是：

- EAT 能不能正确接管一个真实本地仓库
- EAT 能不能把需求澄清、计划、执行、审查、集成串成完整链路
- EAT 最终能不能把一个完整功能从基线做到可运行状态

## 结论先说

如果你要用 `/home/code/evat` 做评测，**不能直接在当前 `main` 分支上用“实现 Todo List”作为成败标准**。

原因很简单：`evat` 的 Todo 垂直切片已经在当前主干里实现了。

当前证据：

- API 已有 `/api/todos` 全套路由：
  [`api/src/server.js`](/home/code/evat/api/src/server.js#L200)
- 数据库已有 Todo migration：
  [`api/migrations/004_add_todos.sql`](/home/code/evat/api/migrations/004_add_todos.sql#L1)
- 前端已有 Todo 页面：
  [`web/src/pages/TodoPage.jsx`](/home/code/evat/web/src/pages/TodoPage.jsx#L48)
- 路由已挂载 `/todos`：
  [`web/src/App.jsx`](/home/code/evat/web/src/App.jsx#L6)
- README 已把 Todo 标为当前已完成能力：
  [`README.md`](/home/code/evat/README.md#L19)

对应 Git 历史也很清楚：

- `aa35630`：Todo 接入前的基线
- `a08ecf9`：`feat: integrate todo vertical slice`

所以，**正确的 EAT benchmark** 不是“在今天的 `main` 上再做一遍 Todo”，而是：

1. 从 `aa35630` 这个前 Todo 基线开始
2. 让 EAT 驱动一次完整的 Todo 功能交付
3. 用当前 `main` 上的 Todo 结果作为“已知可达的参考终态”

## Benchmark 目标

一次成功的 Benchmark，应该证明 EAT 可以把下面这件事做完整：

> 在 `evat` 的前 Todo 基线上，交付一个完整的 Todo 垂直切片，包括数据库、API、前端页面、交互、验证和最终汇报。

“完整”在这里不是泛指，而是最少要覆盖：

- 数据持久化
- API 读写
- 前端可用页面
- 增删改查与完成切换
- 明确的验证命令
- 最终风险说明

## Benchmark 输入仓库

### 不要直接用当前 `/home/code/evat`

当前工作树不是理想评测输入，原因有两个：

1. Todo 已经存在
2. 当前工作树还有额外本地修改：
   `deploy/nginx/evat-gateway.conf`

所以评测时应使用一个**隔离的 benchmark 副本**。

### 推荐基线

基线 commit：

```text
aa35630
```

它对应的是：

- 记账、分类、统计已经存在
- Todo 还没有集成

这正适合作为 EAT 的功能增量 benchmark。

### 推荐准备方式

选一种即可：

方法 A，独立 clone：

```bash
git clone /home/code/evat /home/code/evat-todo-benchmark
git -C /home/code/evat-todo-benchmark checkout aa35630
```

方法 B，独立 worktree：

```bash
git -C /home/code/evat worktree add /home/code/evat-todo-benchmark aa35630
```

评测时在 EAT 中注册的项目路径，应该是：

```text
/home/code/evat-todo-benchmark
```

## Capability Evals

下面这些是“EAT 系统能力”层面的评测项。

### Eval 1. 项目接入

EAT 应能：

- 正确注册 `/home/code/evat-todo-benchmark`
- 识别为本地 Git 仓库
- 不错误操作当前 `/home/code/evat` 主工作树

判定：

- PASS：项目注册成功，路径正确
- FAIL：路径混淆、误连到已有主工作树、Git 校验失败

### Eval 2. 需求澄清与计划

EAT 应能：

- 把“实现完整 Todo List”拆成合理子任务
- 明确前后端、数据库、验证的边界
- 不把任务扩大成全仓重构

判定：

- PASS：计划覆盖 migration / API / web / validation
- FAIL：计划缺少关键子系统，或出现无关大范围重构

### Eval 3. 执行闭环

EAT 应能：

- 在隔离分支 / worktree 中执行
- 产出代码改动
- 完成至少一轮审查与验证
- 给出最终状态与风险说明

判定：

- PASS：执行、验证、汇报链路完整
- FAIL：停在中途、无法收口、没有清晰最终结论

## Feature Acceptance Evals

下面这些是“Todo 功能本身”必须达到的验收项。

### 数据库

- 有新的 Todo 表 migration
- 标题不能为空
- 至少包含：
  - `id`
  - `title`
  - `notes`
  - `is_completed`
  - `completed_at`
  - `created_at`
  - `updated_at`

### API

至少具备这些接口：

- `GET /api/todos`
- `GET /api/todos/:id`
- `POST /api/todos`
- `PUT /api/todos/:id`
- `PATCH /api/todos/:id`
- `DELETE /api/todos/:id`

并且要有这些行为：

- 支持 `all / active / completed` 状态筛选
- 新建后可持久化
- 更新后字段同步正确
- 完成与恢复未完成都可用
- 删除后列表正确刷新
- 不存在的 Todo 返回 404

### Web

至少具备这些结果：

- 首页或导航中能进入 Todo 页面
- 存在独立 Todo 页面路由
- 可以新增 Todo
- 可以编辑 Todo
- 可以删除 Todo
- 可以标记完成 / 恢复未完成
- 可以按状态筛选
- 刷新页面后数据仍来自数据库，不是纯前端内存

## Deterministic Graders

这些检查尽量用确定性命令完成。

### Code Graders

在 benchmark 仓库中检查：

```bash
rg -n "/api/todos|TodoPage|/todos|is_completed|completed_at" api web
```

```bash
test -f api/migrations/*todos*.sql
```

### Validation Commands

至少应运行：

API：

```bash
cd /home/code/evat-todo-benchmark/api
npm install
npm run migrate
npm run start
```

Web：

```bash
cd /home/code/evat-todo-benchmark/web
npm install
npm run lint
npm run build
```

如果 EAT 给出了更窄但合理的验证集合，也可以接受，但最终至少要证明：

- API 能启动
- Web 能构建
- Todo 页面不是死页面

## Human Graders

下面这些仍然建议人工确认：

- Todo 页面交互是否顺手
- 文案是否合理
- 页面结构是否和 `evat` 现有风格一致
- EAT 最终汇报是否能清楚区分“代码问题”和“环境问题”

## Pass / Fail 定义

### Full Pass

满足全部条件：

- EAT 从 `aa35630` 基线驱动完成 Todo 垂直切片
- 计划、执行、审查、验证链路完整
- Todo 功能验收项全部满足
- API 与 Web 验证通过
- 最终汇报清楚、边界明确

### Partial Pass

满足大部分条件，但仍需人工补刀：

- 功能主体已完成
- 主要代码路径可用
- 但计划质量、收口质量或验证覆盖不够完整

这说明 EAT 已经“能做事”，但还没有达到稳定可用的产品标准。

### Fail

出现任一情况可判失败：

- 在错误仓库或错误路径上工作
- 任务中途失控，变成大范围无关重构
- Todo 功能未交付完整
- 无法给出清晰验证结果
- 最终无法区分环境问题与实现问题

## 推荐的评测口径

最终不要只问一句“它做出来没有”。

建议按下面四个维度评分：

1. **路径正确性**
   是否在正确 repo、正确基线、正确边界内工作
2. **计划质量**
   是否能把数据库、API、前端、验证拆清楚
3. **执行收口**
   是否能把任务推到可验证状态，而不是停留在半成品
4. **最终可用性**
   Todo 是否真的能被用户使用

## 最实用的结论

如果你要拿这个 benchmark 判断 EAT 值不值得继续投入，最实用的判断标准是：

> EAT 能不能在前 Todo 基线的 `evat` 仓库里，把 Todo 垂直切片从需求推进到可运行、可验证、可解释的交付结果。

只要这件事能稳定做成一次，EAT 就已经不是“概念演示”；如果还可以重复做成多次，才算真正接近产品成立。

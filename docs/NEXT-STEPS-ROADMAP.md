# EAT 下一阶段 Roadmap

这份文档用于指导当前 `/home/code/EAT` 项目的下一步推进顺序。

目标不是继续无边界扩功能，而是先验证 EAT 当前主路径是否真的可用，再针对真实阻塞点做高优先级修正。

适用场景：
- 明天继续推进项目时，按这份文档执行
- 做一次真实 benchmark 闭环
- 记录问题并决定后续修复优先级

## 当前阶段判断

基于当前仓库文档、最近提交和未提交变更，可以把 EAT 视为：

- 主干能力已经基本成型
- Go 后端 + React 前端 + SQLite + Docker worker 的主路径已经明确
- 项目重点已经从“继续补底层框架”转向“验证主路径闭环是否可用，并提升操作质量”

当前最值得继续投入的方向不是大规模重构，而是：

1. 真实 benchmark 闭环
2. 环境前置条件可视化
3. 故障定位与可观测性
4. 计划约束与任务边界控制
5. 操作者 UX 收口

## 总体策略

按以下顺序推进：

1. 先证明主路径能跑通
2. 再修影响 benchmark 成功率的阻塞点
3. 再打磨 UX 和评估流程
4. 最后才考虑更大范围能力扩展

---

## P0：跑通一次可复现 benchmark 闭环

这是当前最高优先级。

### 目标

验证 EAT 是否真的能完成一次完整的监督式多 Agent 交付闭环，而不是只看某些单点功能是否存在。

### 推荐 benchmark

使用仓库中已经准备好的 benchmark 文档：

- `docs/EAT-EVAT-TODO-BENCHMARK.md`
- `docs/EAT-EVAT-TODO-TASK.md`

### 推荐 benchmark 输入

- 基线仓库：`/home/code/evat-todo-benchmark`
- 基线 commit：`aa35630`

不要直接拿当前 `/home/code/evat` 主工作树做 benchmark。

### Benchmark 目标

让 EAT 驱动一次完整 Todo 垂直切片交付，至少覆盖：

- migration
- API
- web
- validation
- 最终汇报

### 成功标准

一次 benchmark 至少要能回答下面这些问题：

- 项目是否能正确注册
- 需求澄清是否正常
- 计划是否覆盖关键层级
- 子任务是否能正确执行
- review / integration 是否能推进
- 最终是否能明确区分：
  - 已通过项
  - 未通过项
  - 环境问题
  - 代码问题

### 执行后必须产出

- 一份 benchmark 最终结果报告
- 一份阻塞点清单
- 一份优先级排序后的修复建议

### 为什么先做这个

如果不先跑 benchmark，后续优化会变成拍脑袋，无法判断现在最影响成功率的问题到底是什么。

---

## P1：把环境阻塞显式化

这是 benchmark 之后最应该优先补的能力。

### 当前已知问题

当前仓库文档已明确：

- 缺少 `eat/worker-base:latest` 会影响任务创建和相关测试
- Docker 不可用时，可能表现为 `LEAD_AGENT_UNHEALTHY` 或 `DOCKER_UNAVAILABLE`
- `npm test` 不完全是“纯代码结果”，还受 worker image 是否存在影响

### 要解决的问题

当前环境问题容易伪装成普通任务失败，不利于操作员判断。

### 建议落地方向

做一个 readiness / preflight 检查，至少覆盖：

- Docker 是否可用
- `eat/worker-base:latest` 是否存在
- Lead runtime 是否健康
- 必要 CLI 是否已安装并可用
- 当前项目路径是否是合法 Git 仓库

### 产品表现建议

在 UI 中明确显示：

- Ready
- Warning
- Blocking

在任务创建前给出阻塞原因，例如：

- 缺少 worker image
- Docker daemon 未运行
- Lead runtime 未登录或不可用
- 当前 sandbox 条件不满足执行要求

### 成功标准

操作员无需读源码或日志细节，就能知道为什么任务不能创建或不能继续执行。

---

## P1：增强可观测性和故障定位

这个优先级与 preflight 接近，建议尽早做。

### 要解决的问题

当任务卡住时，操作员需要快速知道：

- 是澄清阶段没收口
- 还是计划质量不够
- 还是 worker 没启动成功
- 还是 review 未通过
- 还是 integration 失败
- 还是纯环境问题

### 建议落地方向

为 task / subtask 引入更清晰的失败归因分类，例如：

- `ENVIRONMENT_BLOCKED`
- `AGENT_UNAVAILABLE`
- `SANDBOX_FAILED`
- `PLAN_INVALID`
- `REVIEW_REJECTED`
- `INTEGRATION_FAILED`
- `MERGE_CONFLICT`
- `USER_ACTION_REQUIRED`

### UI 展现建议

在 board / team / runtime 中突出显示：

- 当前阻塞点
- 最近失败原因
- 下一步推荐动作

对 integration run 和 gate result 给出可读摘要，而不是只展示原始日志。

### 成功标准

看板本身就能回答：“为什么这个任务没有继续往前走？”

---

## P1：强化计划约束，防止任务范围失控

这是保证 EAT 不跑偏的关键能力。

### 背景

当前 EAT 的主要风险不是完全不会拆任务，而是任务容易被计划扩散成无关大范围改动。

### 建议落地方向

#### 1. 强化 guided task / benchmark task 约束

对 benchmark 或 autonomy 任务，计划至少应覆盖：

- 数据层
- API 层
- 前端层
- 验证层

#### 2. 提升 plan validation

校验内容建议包括：

- 是否遗漏关键子系统
- 是否出现无关大范围重构
- 是否越过任务硬约束
- 是否缺少验证步骤
- 是否没有体现人工审批或 review 节点

#### 3. 提供更明确的审阅提示

例如：

- 缺少 migration 任务
- 缺少 web 验证
- 存在超范围改动
- 任务边界定义不清

### 成功标准

- 计划更稳定
- 操作者更容易审批
- 执行返工率下降

---

## P2：打磨 operator UX

在主路径能跑通之后，这一项会非常值得做。

### 优先改进建议

#### 1. 任务创建 UX

- 明确推荐主路径：`codex-cli + Docker`
- 显示 readiness 状态
- 区分 benchmark 模式和普通模式

#### 2. 计划审阅 UX

- 高亮缺失层级
- 高亮风险节点
- 更清楚展示依赖结构

#### 3. 执行看板 UX

更清楚地区分：

- `running`
- `blocked`
- `action required`
- `failed`
- `environment blocked`

#### 4. 最终汇报 UX

自动汇总：

- 修改文件
- 执行命令
- 测试结果
- review 结果
- integration 结果
- 剩余风险

### 成功标准

- 操作者更少依赖底层日志
- benchmark 更容易复盘
- “监督式编排”体验更清晰

---

## P2：把 benchmark 流程产品化

如果 P0 跑通，这一步建议尽快做。

### 建议内容

- benchmark task preset
- benchmark readiness checklist
- benchmark report 模板
- 自动提醒不要操作主工作树
- 自动检查 benchmark 仓库路径是否符合要求

### 成功标准

后续再做 benchmark 时，不需要重新手工拼提示和判断标准。

---

## P3：更大范围能力扩展

只有在前面这些都稳定后，才建议考虑。

### 可选方向

- 更强的 review 协同
- 更好的 preview / sandbox 体验
- 更丰富的 guided templates
- 更完善的 metrics export
- 更细的 runtime compatibility

### 当前不建议优先做

- 多用户协作
- SaaS 化
- 分布式执行
- 重写状态机
- 放宽 Docker sandbox 主路径
- 大规模架构重构

---

## 推荐实际推进顺序

### 第一步

先完成一次 benchmark 试跑。

### 第二步

把试跑中出现的问题分成四类：

- 环境前置条件问题
- 计划 / 提示词问题
- 编排 / 状态推进问题
- UI 可观测性问题

### 第三步

优先修：

1. readiness / preflight
2. 错误归因和阻塞提示
3. plan validation 和边界约束

### 第四步

再做：

- board / runtime / final report UX 收口
- benchmark 流程产品化

---

## 明天建议你怎么操作

建议按这个顺序：

1. 准备 benchmark 仓库副本
2. 确认 worker image、Docker、runtime 是否满足前置条件
3. 在 EAT 中发起 benchmark 任务
4. 完整记录实际过程中的阻塞点
5. 跑完后把结果反馈给我

你明天反馈时，最好按下面格式告诉我：

### 1. 环境情况

- worker image 是否存在
- Docker 是否正常
- Lead runtime 是否健康
- 项目是否成功注册

### 2. 流程情况

- 是否进入澄清
- 是否生成计划
- 计划是否合理
- 是否批准执行
- 是否进入 review / integration

### 3. 失败点或卡点

- 卡在哪一步
- 页面上显示什么
- 后端或前端日志有什么关键信息
- 你判断更像环境问题还是代码问题

### 4. 最终结果

- 哪些通过了
- 哪些没通过
- 你觉得最该先修哪一类问题

---

## 一句话总结

当前 EAT 下一步最应该做的，是先证明系统能完成一次真实 benchmark 闭环；随后优先修环境可见性、故障定位和计划约束，而不是继续扩大功能面。

# Phase 21 - Integration Branch, Merge Queue And Release Gates

## 目标

让多 agent 任务的结果从“多个 accepted branches”升级到“可审计、可验证、可回退的集成流程”。

## 为什么是下一步

当 v1.1 前几阶段完成后，用户真正会开始把复杂项目交给 lead orchestrate。  
这时新的瓶颈就不是“能否派发”，而是“最后怎么安全集成”。

当前 merge 流已经满足 MVP，但对于多 agent Web 编排还不够：

- 缺少 integration branch
- 缺少 merge queue 可视化
- 缺少集中验证 gate
- 缺少 release-ready 判断

## 范围

本阶段内：

- integration branch 模式
- merge queue 可视化
- pre-merge verification gate
- release gate 结果可见

本阶段外：

- 自动修冲突
- 跨仓库 release orchestration

## 关键产品决策

### 1. 先集成到 integration branch，再进入 base branch

建议把当前“accepted subtask -> base branch”升级为：

1. accepted branches
2. integration branch
3. integration verification
4. base branch merge

这样更适合多 worker 复杂任务的收敛。

### 2. merge queue 是显式对象

用户必须能看到：

- 哪些 branch 正待集成
- 当前集成顺序
- 哪个 gate 挡住了发布

### 3. release gate 不等于 final review

final review 是语义审查；  
release gate 是技术性放行检查，例如：

- tests
- lint
- build
- migrations

这两者要分开表达。

## 交付物

- integration branch 生命周期
- merge queue UI
- release gate 结果面板
- gate failure -> action required 流

## API / 事件建议

- `integration:queued`
- `integration:started`
- `integration:gate-result`
- `integration:completed`
- `integration:failed`

## 测试与验收

验收标准：

- accepted subtasks 可先进入 integration branch
- integration gate 失败不会污染 base branch
- Web 中可见 queue、gate、结果
- 用户可重试 integration gate 或回退队列项

建议测试：

- merge queue 顺序测试
- gate fail / retry 测试
- integration branch 完成后再入 base branch 流程测试

## 输出给下一阶段

phase 22 将把整个能力打磨成可以对外演示、可快速复用的黄金路径产品体验。

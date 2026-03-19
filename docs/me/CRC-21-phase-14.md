# CRC-21 Phase 14

父任务：

- `CRC-21` Phase 14 - Metrics, Observability, And Export

阶段文档：

- `docs/phase/14-metrics-observability-and-export.md`

内部开发顺序：

1. `CRC-74` metrics inventory and persistence gap closure
2. `CRC-75` deterministic summary queries
3. `CRC-76` export API or CLI and metric definitions
4. `CRC-77` seeded-history verification and operator UX

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-21`。
2. 只从父任务 `CRC-21` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-21` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-21` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 metrics inventory、summary query、export、metric definition 文档和 seeded-history 验收
- 对照 `docs/phase/14-metrics-observability-and-export.md` 与 checklist 做最终验收
- 作为 MVP 最终收尾阶段做整体验收

## CRC-74

```text
实现 EAT 项目的子任务 CRC-74。

仓库路径：/home/code/EAT
父任务：CRC-21 Phase 14 - Metrics, Observability, And Export
子任务：CRC-74 CRC-21 / P14.1 Metrics Inventory And Persistence Gaps
阶段文档：docs/phase/14-metrics-observability-and-export.md

开始编码前，请按标准顺序阅读文档，以及 CRC-21 和 CRC-74 的 issue 描述。

本次只做：
- metrics inventory
- persisted inputs gap analysis
- 必要时补最小 persistence 缺口
- 不引入独立 analytics pipeline

不要实现：
- export API
- dashboard polish

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-75 是否已解锁
```

## CRC-75

```text
实现 EAT 项目的子任务 CRC-75。

仓库路径：/home/code/EAT
父任务：CRC-21 Phase 14 - Metrics, Observability, And Export
子任务：CRC-75 CRC-21 / P14.2 Deterministic Metrics Queries
阶段文档：docs/phase/14-metrics-observability-and-export.md

开始编码前，请按标准顺序阅读文档，以及 CRC-21 和 CRC-75 的 issue 描述。

本次只做：
- metrics summary queries
- completion rate
- retry-to-review conversion
- merge conflict / rebase / cleanup / sandbox counters

不要实现：
- export endpoint
- admin screen polish

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-76 是否已解锁
```

## CRC-76

```text
实现 EAT 项目的子任务 CRC-76。

仓库路径：/home/code/EAT
父任务：CRC-21 Phase 14 - Metrics, Observability, And Export
子任务：CRC-76 CRC-21 / P14.3 Export Surface And Metric Definitions
阶段文档：docs/phase/14-metrics-observability-and-export.md

开始编码前，请按标准顺序阅读文档，以及 CRC-21 和 CRC-76 的 issue 描述。

本次只做：
- `GET /api/metrics/summary` 或等价 CLI
- `GET /api/metrics/export` 或等价导出路径
- metric definition 文档化
- fail-loudly 的缺失数据处理

不要实现：
- unrelated UI refactor
- external analytics service

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- CRC-77 是否已解锁
```

## CRC-77

```text
实现 EAT 项目的子任务 CRC-77。

仓库路径：/home/code/EAT
父任务：CRC-21 Phase 14 - Metrics, Observability, And Export
子任务：CRC-77 CRC-21 / P14.4 Seeded History Verification And Operator UX
阶段文档：docs/phase/14-metrics-observability-and-export.md

开始编码前，请按标准顺序阅读文档，以及 CRC-21 和 CRC-77 的 issue 描述。

本次只做：
- seeded histories verification
- export 验证
- metrics summary 基础 UI / operator usage 收尾
- MVP 整体验收输入准备

不要实现：
- cloud analytics
- multi-user reporting

完成前必须：
- 将本子任务代码提交到当前子任务分支
- 确保至少存在一个与本子任务相关的非空 commit
- 如果没有实际代码变更，不要宣称完成，应继续实现或明确说明阻塞

完成后请输出：
- 已完成内容
- 修改的文件
- 本子任务 commit hash
- 测试结果
- 剩余风险 / 假设
- Phase 14 是否可收尾
```

## 父任务 CRC-21 执行提示词

```text
实现 EAT 项目的父任务 CRC-21 Phase 14 - Metrics, Observability, And Export，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/14-metrics-observability-and-export.md
父任务：CRC-21 Phase 14 - Metrics, Observability, And Export

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/14-metrics-observability-and-export.md
8. 父任务 CRC-21 的 issue 描述
9. docs/me/CRC-21-phase-14.md

执行规则：
- 只使用父任务 CRC-21 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-74 metrics inventory and persistence gap closure
2. CRC-75 deterministic summary queries
3. CRC-76 export API or CLI and metric definitions
4. CRC-77 seeded-history verification and operator UX
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 deterministic metrics queries、export surface、metric definition 文档和 seeded-history 验收

不要实现：
- 外部 analytics pipeline
- cloud reporting

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- MVP 是否可整体验收
```

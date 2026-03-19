# CRC-9 Phase 02

父任务：

- `CRC-9` Phase 02 - Agent Registry And Health Checks

阶段文档：

- `docs/phase/02-agent-registry-and-health-checks.md`

内部开发顺序：

1. `CRC-26` agent capability contract and registry core
2. `CRC-27` health check pipeline and error normalization
3. `CRC-28` agent APIs and selection helpers
4. `CRC-29` agent health UI and unhealthy gating

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-9`。
2. 只从父任务 `CRC-9` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-9` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-9` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 agent contract、health、API、UI 和 unhealthy gating
- 对照 `docs/phase/02-agent-registry-and-health-checks.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 03 做好准备

## CRC-26

```text
实现 EAT 项目的子任务 CRC-26。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-26 CRC-9 / P2.1 Agent Capability Contract And Registry Core
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按标准顺序阅读文档，以及 CRC-9 和 CRC-26 的 issue 描述。

本次只做：
- adapter capability contract
- AgentRegistry register / unregister / lookup
- lead candidate / worker candidate filtering

不要实现：
- health checks
- API 层
- UI

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
- CRC-27 是否已解锁
```

## CRC-27

```text
实现 EAT 项目的子任务 CRC-27。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-27 CRC-9 / P2.2 Health Check Pipeline And Error Normalization
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按标准顺序阅读文档，以及 CRC-9 和 CRC-27 的 issue 描述。

本次只做：
- 结构化 health checks
- health failure reason normalization

不要实现：
- API
- UI

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
- CRC-28 是否已解锁
```

## CRC-28

```text
实现 EAT 项目的子任务 CRC-28。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-28 CRC-9 / P2.3 Agents And Health API Surface
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按标准顺序阅读文档，以及 CRC-9 和 CRC-28 的 issue 描述。

本次只做：
- GET /api/agents
- GET /api/agents/health 或等价事件接口
- 暴露 capability 和 sandbox support

不要实现：
- UI

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
- CRC-29 是否已解锁
```

## CRC-29

```text
实现 EAT 项目的子任务 CRC-29。

仓库路径：/home/code/EAT
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks
子任务：CRC-29 CRC-9 / P2.4 Agent Health UI And Selection Gating
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始编码前，请按标准顺序阅读文档，以及 CRC-9 和 CRC-29 的 issue 描述。

本次只做：
- agent health view
- capability badges
- degraded / unavailable 展示
- unhealthy lead-agent selection gating

不要实现：
- 后续 lead chat
- execution phase 功能

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
- Phase 02 是否可收尾
```

## 父任务 CRC-9 执行提示词

```text
实现 EAT 项目的父任务 CRC-9 Phase 02 - Agent Registry And Health Checks，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/02-agent-registry-and-health-checks.md
父任务：CRC-9 Phase 02 - Agent Registry And Health Checks

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/02-agent-registry-and-health-checks.md
8. 父任务 CRC-9 的 issue 描述
9. docs/me/CRC-9-phase-02.md

执行规则：
- 只使用父任务 CRC-9 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-26 agent capability contract and registry core
2. CRC-27 health check pipeline and error normalization
3. CRC-28 agent APIs and selection helpers
4. CRC-29 agent health UI and unhealthy gating
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 agent contract、health、API、UI 和 unhealthy gating

不要实现：
- Phase 03 sandbox 功能
- 无关重构

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 03
```

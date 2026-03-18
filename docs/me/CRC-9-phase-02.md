# CRC-9 Phase 02

父任务：

- `CRC-9` Phase 02 - Agent Registry And Health Checks

阶段文档：

- `docs/phase/02-agent-registry-and-health-checks.md`

子任务顺序：

1. `CRC-26`
2. `CRC-27`
3. `CRC-28`
4. `CRC-29`

操作顺序：

1. `CRC-26`
2. `CRC-27`
3. `CRC-28`
4. `CRC-29`
5. 必要时再从父任务 `CRC-9` 做收尾

父任务 `CRC-9` 要做的事：

- 检查 `CRC-26` 到 `CRC-29` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 汇总 agent contract、health、API、UI 是否形成闭环
- 按 Phase 02 验收标准做最终核对
- 确认 Phase 03 的 sandbox 工作已具备前置条件

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

## 父任务 CRC-9 收尾提示词

```text
对 EAT 项目的父任务 CRC-9 Phase 02 - Agent Registry And Health Checks 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/02-agent-registry-and-health-checks.md

开始前请按顺序阅读标准文档，以及父任务 CRC-9 和已完成子任务 CRC-26、CRC-27、CRC-28、CRC-29 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 修补少量跨子任务的小整合问题
- 对照 phase 文档与 checklist 做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 03 sandbox 功能
- 无关重构

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 03
```

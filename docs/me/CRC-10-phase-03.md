# CRC-10 Phase 03

父任务：

- `CRC-10` Phase 03 - Container Sandbox Manager And Docker Preflight

阶段文档：

- `docs/phase/03-container-sandbox-manager-and-docker-preflight.md`

内部开发顺序：

1. `CRC-30` sandbox config and mount policy enforcement
2. `CRC-31` Docker preflight and health surface
3. `CRC-32` container launch/stop/cleanup helper
4. `CRC-33` UI surfacing and failure-path hardening

在 Vibe Kanban 中的操作：

1. 找到父任务 `CRC-10`。
2. 只从父任务 `CRC-10` 创建 workspace。
3. 基准分支始终选择最新 `main`。
4. 把父任务 `CRC-10` 的 issue 描述直接发给 AI。
5. 在同一个父任务 workspace / 分支里，严格按上面的内部开发顺序实现。
6. 每完成一个内部步骤，就在同一个父任务分支提交一个非空 commit。
7. 所有内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
8. review 通过后，将父任务分支合并到 `main`。
9. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

父任务 `CRC-10` 要做的事：

- 在同一个父任务分支内完成本 phase 的全部开发
- 严格按内部开发顺序推进，不要跳步骤
- 每完成一个内部步骤都提交实际代码，避免后续步骤建立在未提交状态上
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 统一联调 sandbox config、Docker preflight、container helper、安全护栏和失败路径
- 对照 `docs/phase/03-container-sandbox-manager-and-docker-preflight.md` 与 checklist 做最终验收
- 确认仓库已经为 Phase 04 做好准备

## CRC-30

```text
实现 EAT 项目的子任务 CRC-30。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-30 CRC-10 / P3.1 Sandbox Config And Mount Policy Enforcement
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按标准顺序阅读文档，以及 CRC-10 和 CRC-30 的 issue 描述。

本次只做：
- sandbox config type
- validation rules
- mount allowlist enforcement
- 默认阻止 home 和 .ssh 挂载

不要实现：
- Docker preflight
- container lifecycle helper
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
- CRC-31 是否已解锁
```

## CRC-31

```text
实现 EAT 项目的子任务 CRC-31。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-31 CRC-10 / P3.2 Docker Preflight And Runtime Availability Checks
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按标准顺序阅读文档，以及 CRC-10 和 CRC-31 的 issue 描述。

本次只做：
- Docker daemon reachability 检测
- image / runtime availability strategy
- 结构化 preflight 错误

不要实现：
- container create/start/stop/remove helper
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
- CRC-32 是否已解锁
```

## CRC-32

```text
实现 EAT 项目的子任务 CRC-32。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-32 CRC-10 / P3.3 Container Lifecycle Helpers And Security Guardrails
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按标准顺序阅读文档，以及 CRC-10 和 CRC-32 的 issue 描述。

本次只做：
- container create / start / stop / remove helper
- non-root worker execution
- reject privileged mode
- reject undeclared host mounts

不要实现：
- task orchestration
- worker execution

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
- CRC-33 是否已解锁
```

## CRC-33

```text
实现 EAT 项目的子任务 CRC-33。

仓库路径：/home/code/EAT
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight
子任务：CRC-33 CRC-10 / P3.4 Sandbox Health Exposure And Failure-Closed Verification
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始编码前，请按标准顺序阅读文档，以及 CRC-10 和 CRC-33 的 issue 描述。

本次只做：
- sandbox health exposure
- 必要时 staged session fields，如 sandboxType / containerId
- fail-closed 验证

不要实现：
- worker execution
- task UI 主流程

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
- Phase 03 是否可收尾
```

## 父任务 CRC-10 执行提示词

```text
实现 EAT 项目的父任务 CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight，并在一个 workspace 中完成整个 phase。

仓库路径：/home/code/EAT
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md
父任务：CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight

开始前请按顺序阅读：
1. AGENTS.md
2. docs/PRD.md
3. docs/phase/README.md
4. docs/phase/PRISMA-MIGRATIONS.md
5. docs/phase/API-EVENT-EXAMPLES.md
6. docs/phase/CHECKLISTS.md
7. docs/phase/03-container-sandbox-manager-and-docker-preflight.md
8. 父任务 CRC-10 的 issue 描述
9. docs/me/CRC-10-phase-03.md

执行规则：
- 只使用父任务 CRC-10 workspace，不创建子任务 workspace
- 在同一个父任务分支内完成整个 phase 的开发、联调、修复和验收
- 严格按下面顺序实现内部步骤，不要跳步：
1. CRC-30 sandbox config and mount policy enforcement
2. CRC-31 Docker preflight and health surface
3. CRC-32 container launch/stop/cleanup helper
4. CRC-33 UI surfacing and failure-path hardening
- 每完成一个内部步骤，就在当前父任务分支提交一个与该步骤对应的非空 commit
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发
- 全部步骤完成后，在同一个父任务分支完成联调、补洞、checklist 验收和必要修复
- review 通过后，再将父任务分支合并到 `main`
- 合并完成后删除父任务分支，并把最新 `main` 推送到远端

本次 phase 重点：
- 统一联调 sandbox config、Docker preflight、container helper、安全护栏和失败路径

不要实现：
- Phase 04 lead chat 主流程
- 与 sandbox 无关的大功能

完成后请输出：
- 本 phase 已完成内容
- 修改的文件
- 父任务分支上的 commits
- 测试结果
- 剩余风险 / 假设
- 是否可以进入 Phase 04
```

# CRC-10 Phase 03

父任务：

- `CRC-10` Phase 03 - Container Sandbox Manager And Docker Preflight

阶段文档：

- `docs/phase/03-container-sandbox-manager-and-docker-preflight.md`

子任务顺序：

1. `CRC-30`
2. `CRC-31`
3. `CRC-32`
4. `CRC-33`

父任务 `CRC-10` 要做的事：

- 检查 `CRC-30` 到 `CRC-33` 是否都已完成
- 先确认这些子任务分支都包含对应子任务的实际提交，避免后续合并空分支
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 合并后在 `main` 上做联调、检查和必要修复
- 验证 `main` 已包含这些子任务的最终代码
- 验收通过后删除对应的已完成子任务分支
- 最后将最新 `main` 推送到远端
- 核对 sandbox config、preflight、container helper、安全护栏是否形成完整闭环
- 验证 fail-closed 行为是否满足 Phase 03 要求
- 确认 Phase 04 可以安全建立在这个 sandbox 基础上

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

## 父任务 CRC-10 收尾提示词

```text
对 EAT 项目的父任务 CRC-10 Phase 03 - Container Sandbox Manager And Docker Preflight 做阶段收尾、联调和验收。

仓库路径：/home/code/EAT
阶段文档：docs/phase/03-container-sandbox-manager-and-docker-preflight.md

开始前请按顺序阅读标准文档，以及父任务 CRC-10 和已完成子任务 CRC-30、CRC-31、CRC-32、CRC-33 的 issue 描述。

本次只做父任务收尾：
- 先确认 4 个子任务都已完成，且各自分支包含实际提交
- 再将所有已完成但未合并的子任务分支合并到 `main`
- 在 `main` 上完成联调、检查和必要修复
- 验证 `main` 已包含所有子任务最终代码
- 验收通过后删除已完成子任务分支
- 联调 sandbox config、Docker preflight、container helper、安全护栏
- 验证 blocked mount、daemon failure、unsupported sandbox 等失败路径
- 对照 phase 文档做最终验收

完成前必须：
- 所有合并与修复提交都已经进入 `main`
- 将最新 `main` 推送到远端

不要实现：
- Phase 04 lead chat 主流程
- 与 sandbox 无关的大功能

完成后请输出：
- 父任务收尾完成内容
- 子任务合并、修复、删分支、push 情况
- 测试结果
- 剩余未完成 checklist
- 是否可以进入 Phase 04
```

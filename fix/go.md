# Go 后端待修复项

## 已完成

- 项目级 token 聚合已落到后端能力。
  - `Project` 读模型与项目列表/详情接口现在返回 `tokens` 字段。
  - 聚合口径按 CLI 维度输出，供项目库页面直接消费。

- 任务级 token 聚合已落到后端能力。
  - `Task` 读模型与任务列表/详情接口现在返回 `tokens` 字段。
  - 任务列表、任务详情、工作台可以复用同一字段命名。

- 新增 session 级 token 使用持久化。
  - 后端新增 `session_token_usage` 存储，记录每个 session 的输入与输出 token，并按 `input + output` 聚合 `total_tokens`。
  - Codex worker 的 `--json` 输出会解析 `turn.completed.usage` 并自动累计到后端。

## 说明

- 该缺口已不再依赖前端占位或硬编码。
- 当前已记录输入和输出 token；缓存命中不单独作为对外统计口径。

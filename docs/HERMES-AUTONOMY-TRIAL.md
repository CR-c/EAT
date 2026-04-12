# Hermes Autonomy Trial Guide

这份文档用于在 `/home/code/EAT` 上试验 Hermes 的高自治开发能力。

目标不是证明 “Hermes 可以无监督做完整产品”，而是验证：

1. 它能否在当前仓库内稳定读取正确上下文
2. 它能否在受控边界内执行一个完整开发闭环
3. 它是被代码问题卡住，还是被环境/文档问题卡住

## 结论先说

对 EAT 这类仓库，推荐的试验方式是：

- 小范围闭环任务
- 明确验收标准
- 保留人工里程碑确认
- 让 Hermes 自己读 `AGENTS.md` 和当前文档

不建议一上来就让它“全自动做完整功能树”。

## 试验前置条件

开始前至少确认这些条件为真。

### 1. CLI runtime 存在

当前机器上应至少有：

- `codex`
- `claude`
- `gemini`

EAT 当前默认和验证最充分的主路径仍然是 `codex-cli` 作为 Lead。

### 2. Worker 镜像存在

这是当前自动试验最容易忽略的前置条件。

构建命令：

```bash
cd /home/code/EAT
npm run build:worker-image
```

如果这个镜像缺失：

- `npm test` 中部分任务创建测试会失败
- 任务创建相关 API 会返回 `LEAD_AGENT_UNHEALTHY`
- 嵌套原因通常是 `DOCKER_UNAVAILABLE`

镜像名：

```bash
eat/worker-base:latest
```

### 3. 依赖已安装

```bash
cd /home/code/EAT
npm install
cd web && pnpm install
```

### 4. 服务能启动

```bash
cd /home/code/EAT
npm start
```

默认地址：

```text
http://127.0.0.1:3000
```

## 推荐试验顺序

### 第一轮：仓库内局部修复

目标：

- 验证 Hermes 是否能读懂文档和代码
- 验证它是否会执行正确测试

适合的任务类型：

- 修一个后端 handler bug
- 修一个前端交互缺陷
- 补一组测试
- 对一个页面做小范围 UX 修正

成功标准：

- 改动范围可解释
- 跑了相关测试
- 没有擅自改产品语义
- 最终说明能指出真实风险

### 第二轮：单一子系统功能增量

目标：

- 验证 Hermes 是否能跨 doc/backend/frontend 三者协同

适合的任务类型：

- 增加一个任务详情字段并贯通 API 与 UI
- 为项目设置页增加一个小配置项
- 为任务工作台增加一处状态展示

成功标准：

- 后端、前端、文档改动一致
- API 和 UI 没有明显漂移
- 至少跑过相关测试或构建

### 第三轮：EAT 自己创建和执行任务的主流程试跑

目标：

- 验证 EAT 作为编排系统的核心黄金路径

这轮应在前两轮稳定后再做。

## 不推荐的首轮任务

这些任务太大，容易把“环境问题”误判成“模型不行”：

- “把整个 EAT 做完”
- “全自动把产品做成 SaaS”
- “把所有历史文档和代码统一重构”
- “从头重写前后端架构”

## 建议给 Hermes 的工作方式

如果你想直接开跑而不自己再拼提示词，可直接使用：

- [`HERMES-FIRST-TRIAL-PROMPT.md`](/home/code/EAT/docs/HERMES-FIRST-TRIAL-PROMPT.md)

### 推荐提示结构

让 Hermes 收到的任务至少包含：

1. 任务目标
2. 约束条件
3. 验收标准
4. 必跑验证命令
5. 不允许碰的范围

示例：

```text
你在 /home/code/EAT 工作。

先阅读 AGENTS.md、README.md、docs/README.md，再只读与这个任务直接相关的最小文档集合。

任务：
修复任务创建页中某个已知交互问题。

约束：
- 不改任务状态机
- 不改 API 路径
- 不改部署脚本

验收标准：
- 页面行为符合描述
- pnpm lint 和 pnpm build 通过
- 若涉及后端则补相关测试

完成后请说明：
- 改了什么
- 跑了什么命令
- 还有什么风险
```

### 更适合 Hermes 的指令风格

好：

- “先读最小相关文档，再修这个 bug，最后跑相关测试”
- “不要改产品语义，只做当前实现修复”
- “如果测试失败，区分环境前置条件和代码回归”

差：

- “自己看着办，把这个项目弄好”
- “全自动完成全部功能”
- “想怎么改都行”

## 试验时建议观察什么

不要只看它“有没有改代码”，要看它是否做对下面这些事：

- 有没有先读 `AGENTS.md`
- 有没有优先读最小相关文档，而不是乱扫全仓
- 有没有先检查现有实现再下结论
- 有没有把环境问题和代码问题分开
- 有没有跑对应验证命令
- 有没有在最终说明里给出真实剩余风险

## 当前已知真实阻塞

这不是 Hermes 本身的问题，而是当前仓库做全自动试验时的真实前置条件：

- 默认 worker 镜像当前本机不存在时，任务创建相关路径会失败
- `npm test` 不是永远纯代码真相，它受 worker image 是否已构建影响
- `prisma/schema.prisma` 不是完整运行时真相，读表结构要回到 migration 和 repository

## 推荐试验命令

### 环境预热

```bash
cd /home/code/EAT
npm install
cd web && pnpm install
cd ..
npm run build:worker-image
```

### 本地验证

```bash
cd /home/code/EAT
cd backend && go test ./...
cd ../web && pnpm lint && pnpm build
```

### 整体验证

```bash
cd /home/code/EAT
npm test
```

## 推荐的首个实战试验

建议你先给 Hermes 一个“小范围但完整闭环”的任务，例如：

- 修一个明确的 handler 测试失败
- 给项目页面补一处已知交互缺陷
- 给任务工作台补一处状态展示和对应文案

不要先让它做跨后端、前端、部署、数据迁移的大任务。

## 如何判断这次试验是否成功

一次好的试验，不要求 “零人工参与”，而要求：

- 它能自己定位正确上下文
- 它能自己改代码
- 它能自己运行相关验证
- 它不会擅自发明产品语义
- 它能清楚说明失败是环境问题还是实现问题

---
*Last Updated: 2026-04-10*

# EAT Docs Map

这份文档是 EAT 仓库文档的统一入口。

如果你是实现者或编码 agent，请先阅读 [AGENTS.md](/home/code/EAT/AGENTS.md)。

## 推荐阅读顺序

1. [AGENTS.md](/home/code/EAT/AGENTS.md)
2. [PRD.md](/home/code/EAT/docs/PRD.md)
3. [phase/README.md](/home/code/EAT/docs/phase/README.md)
4. [v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)
5. [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
6. [GO-DEVELOPMENT-CONVENTIONS.md](/home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md)
7. [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)

## 文档分层

### 顶层产品定义

- [PRD.md](/home/code/EAT/docs/PRD.md)

### 交付合同与历史实现说明

- `docs/phase/` 与 `docs/v1.1/` 主要承担交付合同、状态机约束和设计背景说明，不应直接视为当前运行时代码结构。
- 某些 phase 文档中的文件路径和实现备注仍保留了历史 Node / 原生前端落地痕迹；这些内容用于说明当时的交付切片，不代表当前前端运行时。
- 当前实现真相优先参考仓库根 [README.md](/home/code/EAT/README.md)、[ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md) 与实际代码。

### 基础交付阶段 01-16

- [phase/README.md](/home/code/EAT/docs/phase/README.md)
- [phase/CHECKLISTS.md](/home/code/EAT/docs/phase/CHECKLISTS.md)
- [phase/PRISMA-MIGRATIONS.md](/home/code/EAT/docs/phase/PRISMA-MIGRATIONS.md)
- [phase/API-EVENT-EXAMPLES.md](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)

### 扩展交付阶段 17-22

- [v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)
- [v1.1/IMPLEMENTATION-ORDER.md](/home/code/EAT/docs/v1.1/IMPLEMENTATION-ORDER.md)
- [v1.1/CHECKLISTS.md](/home/code/EAT/docs/v1.1/CHECKLISTS.md)
- [v1.1/PRISMA-MIGRATIONS.md](/home/code/EAT/docs/v1.1/PRISMA-MIGRATIONS.md)
- [v1.1/API-EVENT-EXAMPLES.md](/home/code/EAT/docs/v1.1/API-EVENT-EXAMPLES.md)

### 实现与运维

- [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
- [GO-DEVELOPMENT-CONVENTIONS.md](/home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md)
- [GO-CONVENTIONS-GAP-CHECK.md](/home/code/EAT/docs/GO-CONVENTIONS-GAP-CHECK.md)
- [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)
- [go-backend-refactor-plan.md](/home/code/EAT/docs/go-backend-refactor-plan.md) — Go 迁移完成记录

### 测试与验收记录

- [manual-web-golden-path-test-2026-03-27.md](/home/code/EAT/docs/manual-web-golden-path-test-2026-03-27.md) — 本次 Web 黄金路径比对测试任务文档
- [manual-web-golden-path-test-report-2026-03-27.md](/home/code/EAT/docs/manual-web-golden-path-test-report-2026-03-27.md) — 本次 Web 黄金路径比对测试报告
- [manual-web-golden-path-fix-list-2026-03-27.md](/home/code/EAT/docs/manual-web-golden-path-fix-list-2026-03-27.md) — 基于测试报告整理的修复清单

## 解释规则

- 实现规则冲突 → 以 [AGENTS.md](/home/code/EAT/AGENTS.md) 为准
- 产品定义冲突 → 以 [PRD.md](/home/code/EAT/docs/PRD.md) 为准
- phase 与说明文档冲突 → 以 phase 文档为准
- schema / repository / migration 描述冲突 → 以运行时 repository 和已落地 SQL migrations 为准
- phase 文档中的历史实现路径与当前代码不一致时 → 以当前代码和 [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md) 为准，同时保留 phase 合同语义

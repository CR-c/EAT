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

## 解释规则

- 实现规则冲突 → 以 [AGENTS.md](/home/code/EAT/AGENTS.md) 为准
- 产品定义冲突 → 以 [PRD.md](/home/code/EAT/docs/PRD.md) 为准
- phase 与说明文档冲突 → 以 phase 文档为准
- schema / repository / migration 描述冲突 → 以运行时 repository 和已落地 SQL migrations 为准

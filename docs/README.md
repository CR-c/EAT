# EAT Docs Map

这份文档是 EAT 仓库文档的统一入口。

如果你是实现者或编码 agent，请先阅读 [AGENTS.md](/home/code/EAT/AGENTS.md)。

## 推荐阅读顺序

1. [AGENTS.md](/home/code/EAT/AGENTS.md)
2. [PRD.md](/home/code/EAT/docs/PRD.md)
3. [phase/README.md](/home/code/EAT/docs/phase/README.md)
4. [v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)
5. [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
6. [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)

## 按任务类型阅读

### 做基础 phase 实现时

1. [PRD.md](/home/code/EAT/docs/PRD.md)
2. [phase/README.md](/home/code/EAT/docs/phase/README.md)
3. [phase/PRISMA-MIGRATIONS.md](/home/code/EAT/docs/phase/PRISMA-MIGRATIONS.md)
4. [phase/API-EVENT-EXAMPLES.md](/home/code/EAT/docs/phase/API-EVENT-EXAMPLES.md)
5. [phase/CHECKLISTS.md](/home/code/EAT/docs/phase/CHECKLISTS.md)
6. 对应的 phase 文档

### 做扩展 phase 实现时

1. [PRD.md](/home/code/EAT/docs/PRD.md)
2. [phase/README.md](/home/code/EAT/docs/phase/README.md)
3. [v1.1/README.md](/home/code/EAT/docs/v1.1/README.md)
4. [v1.1/PRISMA-MIGRATIONS.md](/home/code/EAT/docs/v1.1/PRISMA-MIGRATIONS.md)
5. [v1.1/API-EVENT-EXAMPLES.md](/home/code/EAT/docs/v1.1/API-EVENT-EXAMPLES.md)
6. [v1.1/CHECKLISTS.md](/home/code/EAT/docs/v1.1/CHECKLISTS.md)
7. 对应的扩展 phase 文档

### 做文档维护时

1. [PRD.md](/home/code/EAT/docs/PRD.md)
2. 本文档
3. 直接相关的文档
4. 如涉及运行时描述，再核对代码与测试

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

### 面向实现与使用的说明文档

- [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
- [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)
- [go-backend-refactor-plan.md](/home/code/EAT/docs/go-backend-refactor-plan.md)

## 解释规则

- 如果实现规则冲突，以 [AGENTS.md](/home/code/EAT/AGENTS.md) 的任务执行规则为准。
- 如果产品定义冲突，以 [PRD.md](/home/code/EAT/docs/PRD.md) 为准。
- 如果 phase 文档和说明文档冲突，以 phase 文档为准。
- 如果 `schema.prisma`、repository 和 migration 描述冲突，以运行时 repository 和已落地 SQL migrations 为准。

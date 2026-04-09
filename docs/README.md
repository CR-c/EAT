# EAT Docs Map

这份文档是 EAT 仓库文档的统一入口。

如果你是实现者或编码 agent，请先阅读 [AGENTS.md](/home/code/EAT/AGENTS.md)。

## 推荐阅读顺序

1. [AGENTS.md](/home/code/EAT/AGENTS.md)
2. [README.md](/home/code/EAT/README.md)
3. [PRD.md](/home/code/EAT/docs/PRD.md)
4. [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)
5. [API-REFERENCE.md](/home/code/EAT/docs/API-REFERENCE.md)
6. [GO-DEVELOPMENT-CONVENTIONS.md](/home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md)
7. [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md)

## 文档分层

### 顶层产品定义

- [PRD.md](/home/code/EAT/docs/PRD.md)

### 当前实现真相

- 当前主干实现总览优先看仓库根 [README.md](/home/code/EAT/README.md) 与 [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md)。
- 当前 API 资源面优先看 [API-REFERENCE.md](/home/code/EAT/docs/API-REFERENCE.md)。
- API 路径以 [`backend/internal/api/router.go`](/home/code/EAT/backend/internal/api/router.go) 为准。
- 数据库表结构、状态字段和运行时持久化以 [`prisma/migrations/`](/home/code/EAT/prisma/migrations) 与 `backend/internal/task/*_repository.go` 为准。
- `prisma/schema.prisma` 当前不是最新运行时表结构的完整镜像；阅读 schema 时必须与 migration 和 repository 一起核对。

### 核心文档

- [README.md](/home/code/EAT/README.md) — 仓库总览与本地开发入口
- [PRD.md](/home/code/EAT/docs/PRD.md) — 唯一产品定义
- [ARCHITECTURE.md](/home/code/EAT/docs/ARCHITECTURE.md) — 当前实现总览
- [API-REFERENCE.md](/home/code/EAT/docs/API-REFERENCE.md) — 当前 API 资源面
- [GO-DEVELOPMENT-CONVENTIONS.md](/home/code/EAT/docs/GO-DEVELOPMENT-CONVENTIONS.md) — Go 后端工程规范
- [EAT-user-guide.md](/home/code/EAT/docs/EAT-user-guide.md) — 操作者使用说明

### 精简原则

- 旧的交付拆分树、个人工作记录与历史测试/迁移记录已从主文档面移除，避免当前开发继续围绕失效切片阅读。
- 如果确实需要追溯早期交付拆分或旧设计基线，请直接查 Git 历史，而不是把历史文件继续当作当前文档面的一部分。

## 解释规则

- 实现规则冲突 → 以 [AGENTS.md](/home/code/EAT/AGENTS.md) 为准
- 产品定义冲突 → 以 [PRD.md](/home/code/EAT/docs/PRD.md) 为准
- 当前 API 说明冲突 → 以 [API-REFERENCE.md](/home/code/EAT/docs/API-REFERENCE.md) 与实际 router 为准
- schema / repository / migration 描述冲突 → 以运行时 repository 和已落地 SQL migrations 为准
- `prisma/schema.prisma` 与当前代码冲突时 → 不要默认 schema 是最新真相，先回到当前代码、router 和 migrations

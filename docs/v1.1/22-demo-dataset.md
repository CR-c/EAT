# Phase 22 Demo Dataset

## 用途

为 `v1.1` 的黄金路径演示提供一个最小但真实的任务输入集合，便于重复验证 guided flow。

## Dataset

### full-stack-todo

- templateId: `full-stack-web-app`
- title: `全栈 Todo 应用`
- description:

`做一个全栈 Todo 应用，包含认证、数据库和 React 前端。请拆成 architect、backend、database、frontend、tester、integration 六个角色，并为每个角色给出交付物与验收标准。`

### backend-api

- templateId: `backend-api`
- title: `后端 API 服务`
- description:

`实现一个后端 API，包含接口契约、数据库层、测试和发布前验证清单。`

### frontend-feature

- templateId: `frontend-feature`
- title: `前端功能开发`
- description:

`完成一个 React 前端功能，从交互设计、接口接线到验收验证全链路交付。`

### repo-wide-refactor

- templateId: `repo-wide-refactor`
- title: `仓库级重构任务`
- description:

`对仓库做一次跨模块重构，要求保留可审查切片、回归验证和集成回滚说明。`

## 验证标准

- guided task 创建后直接进入 `PLAN_REVIEW`
- 计划包含与模板匹配的角色和依赖
- operator 仍需显式批准计划
- 执行后仍通过 operations board、mailbox 和 integration run 完成收敛

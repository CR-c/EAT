# EAT v1.1 Phase Checklists

本文件把 `/docs/v1.1/` 的路线文档转换成可执行 checklist。  
只有当 phase 文档中的验收标准与本文件中的条目同时满足时，该阶段才算完成。

## Phase 17 Checklist

- [ ] 明确 task 内 team view 的数据模型
- [ ] 为 subtask 增加 role / displayName / executionOrder / assignmentSource / runSummary 设计
- [ ] 提供 team 级读取 API
- [ ] 在 Web 中显示 lead 与 team members 分层视图
- [ ] 在成员卡片中显示 role、agent、branch、worktree、status、summary
- [ ] 提供单成员重派发入口
- [ ] 提供单成员取消入口
- [ ] 提供单成员替换 worker 入口
- [ ] 保持现有 task / subtask 状态机不回退
- [ ] 验证 reload 后 team lifecycle 视图可恢复

## Phase 18 Checklist

- [ ] 把 plan draft 升级为 role-aware DAG draft
- [ ] 为每个 plan node 增加 `role`
- [ ] 为每个 plan node 增加 `deliverable`
- [ ] 为每个 plan node 增加 `acceptance_criteria`
- [ ] 为每个 plan node 增加 `template_hint`
- [ ] 扩展 lead planning prompt 以输出 DAG 结构
- [ ] 增加 DAG 校验规则
- [ ] 增加 DAG 编辑 UI
- [ ] 支持从模板初始化 plan seed
- [ ] 验证 template seed -> plan review -> approval 全链路

## Phase 19 Checklist

- [ ] 为 mailbox 增加 typed message schema
- [ ] 增加 artifact refs / file refs / branch refs 设计
- [ ] 支持 `subtask -> lead` 主动发信
- [ ] 支持 `subtask -> subtask` 主动发信
- [ ] 区分 `NOTE` / `BLOCKER` / `DELIVERABLE_READY` / `API_CONTRACT` 等类型
- [ ] worker prompt 注入按消息类型裁剪
- [ ] Web 中区分 inbox / outbox / contracts / blockers
- [ ] 显示 artifact refs 与 branch refs
- [ ] 保持 mailbox append-only
- [ ] 验证结构化 handoff -> downstream prompt 注入

## Phase 20 Checklist

- [ ] 新增 task 内 live operations board 视图
- [ ] 提供 graph mode
- [ ] 提供 list mode
- [ ] 提供 activity stream
- [ ] 聚合 action-required items
- [ ] 高亮 blocking edges 与 unresolved blockers
- [ ] 聚合 mailbox / review / merge 风险状态
- [ ] 从 board 直接触发关键 operator actions
- [ ] 默认执行主界面切换到 board-first
- [ ] 验证 mixed-state task 在 board 中可正确呈现

## Phase 21 Checklist

- [ ] 设计 integration branch 生命周期
- [ ] 增加 merge queue 视图
- [ ] accepted branches 先进入 integration branch
- [ ] 增加 pre-merge verification gate
- [ ] 区分 final review 与 release gate
- [ ] 提供 gate result UI
- [ ] gate failure 路由到 action-required
- [ ] 支持 integration retry / dequeue / rollback
- [ ] 防止 gate failure 污染 base branch
- [ ] 验证 integration branch -> gate -> base branch 全链路

## Phase 22 Checklist

- [ ] 提供内建 task templates
- [ ] 提供 guided task creation flow
- [ ] 提供 full-stack Todo 黄金路径模板
- [ ] 提供 backend API 黄金路径模板
- [ ] 提供 frontend feature 黄金路径模板
- [ ] 提供 operator onboarding 文案
- [ ] 补充空态 / 错误态 / 阻塞态文案
- [ ] 准备 demo playbook
- [ ] 准备 demo repo 或 demo dataset
- [ ] 验证黄金路径 E2E 演示可复现

# EAT 系统功能规格书（供 Web UI 设计用）

> 版本：2026-03-25 | 基于 Go 后端 `new-to-go` 分支

---

## 一、产品定义

EAT（Ensemble Agent Taskforce）是一个**本地优先的多 Agent 协作任务编排系统**。用户通过 Web 界面将一个软件开发需求拆解为多个子任务，由多个 AI Agent（当前支持 codex-cli）在 Docker 沙箱中并行执行，系统负责分支管理、依赖调度、代码审查和合并。

**核心原则：**
- **有监督**：人工在关键节点审批（计划审阅、冲突处理）
- **本地优先**：所有数据存 SQLite，代码在本地 git 仓库操作
- **透明可追溯**：所有审查、合并、计划变更记录不可变历史
- **看板优先**：用 DAG 可视化和看板替代纯对话式交互

---

## 二、用户工作流（7 步）

```
注册项目 → 创建任务 → 需求澄清 → 计划审阅 → 并行执行 → 审查合并 → 成品预览
```

### 步骤 1：注册项目
用户选择本地 git 仓库路径，系统自动检测：
- 默认分支（main/master）
- 当前分支
- 是否有未提交改动
- 最近活跃分支列表

### 步骤 2：创建任务
- 填写标题、描述
- 选择基线分支（从哪个分支开始工作）
- 选择 Lead Agent（当前只有 codex-cli 可用）
- 可选：选择模板自动生成计划

### 步骤 3：需求澄清（可选）
- 用户与 Lead Agent 对话，细化需求
- Lead Agent 在 Docker 中运行，实时输出流式展示
- 可随时发送补充消息

### 步骤 4：计划审阅
- Lead Agent 生成任务计划（DAG 形式的子任务分解）
- 用户审阅、编辑计划
- 可从历史快照恢复之前的计划版本
- 审批后进入执行

### 步骤 5：并行执行
- 系统自动创建 git 分支和 worktree
- 按依赖顺序在 Docker 容器中启动 Worker Agent
- 最多 6 个 Worker 并行运行
- 实时输出通过 SSE 推送到前端
- Watchdog 监控：5 分钟无输出或 30 分钟总超时自动 kill + 重试（最多 2 次）

### 步骤 6：审查与合并
- Worker 完成后自动合并到任务主干分支
- 遇到合并冲突标记为 ACTION_REQUIRED
- 所有子任务完成后进入 Final Review
- 最终通过后标记任务完成

### 步骤 7：成品预览
- 在 Docker 中启动应用预览
- 自动检测框架（Next/Vue/React/Vite 等）
- 支持选择预览目标（基线分支/任务主干/特定子任务）

---

## 三、页面结构建议

### 3.1 首页 / 项目列表页

**数据来源：** `GET /api/projects`

展示所有已注册的项目卡片：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 UUID |
| name | string | 仓库目录名 |
| path | string | 本地绝对路径 |
| defaultBranch | string | 默认分支 |
| createdAt | ISO 8601 | 注册时间 |

每个项目卡片可展示关联任务数量（`GET /api/projects/{id}/tasks`）。

**操作：**
- 注册新项目（打开目录选择/路径输入对话框）
- 点击项目进入任务列表

### 3.2 注册项目对话框

**请求：** `POST /api/projects`

```json
{ "path": "/absolute/path/to/repo" }
```

**响应包含：**
```json
{
  "project": { "id", "name", "path", "defaultBranch", "createdAt" },
  "repoStatus": {
    "defaultBranch": "main",
    "currentBranch": "main",
    "isDirty": false,
    "recentBranches": ["main", "feature/foo"]
  }
}
```

**错误提示（需本地化）：**

| 错误码 | 中文提示 |
|--------|---------|
| PROJECT_ALREADY_REGISTERED | 该仓库已注册在 {path} |
| PATH_NOT_FOUND | 该路径不存在 |
| PATH_NOT_DIRECTORY | 所选路径必须是目录 |
| NOT_GIT_REPOSITORY | 所选目录不是 Git 仓库 |
| PATH_ACCESS_DENIED | 没有权限读取所选目录 |

### 3.3 目录浏览

**请求：** `GET /api/projects/browse?path=/some/dir`

```json
{
  "currentPath": "/home/code",
  "entries": [
    { "name": "EAT", "path": "/home/code/EAT", "type": "directory", "isGitRepo": true },
    { "name": "other", "path": "/home/code/other", "type": "directory", "isGitRepo": false }
  ],
  "parentPath": "/home"
}
```

用于构建目录浏览器组件，高亮 git 仓库目录。

### 3.4 任务列表页

**数据来源：** `GET /api/projects/{projectId}/tasks`

每个任务卡片：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务 UUID |
| title | string | 任务标题 |
| status | string | 当前状态（见状态机） |
| leadAgentType | string | Lead Agent 类型 |
| baseBranch | string | 基线分支 |
| taskBranchName | string | 任务主干分支名 |
| lastError | string? | 最后错误信息 |
| archivedAt | string? | 归档时间（null 表示未归档） |
| createdAt | ISO 8601 | 创建时间 |

**操作：**
- 创建新任务
- 按状态筛选
- 查看已归档任务
- 点击任务进入工作区

### 3.5 创建任务页

#### 基础创建
**请求：** `POST /api/tasks`
```json
{
  "projectId": "uuid",
  "title": "任务标题",
  "description": "任务描述",
  "baseBranch": "main",
  "leadAgentType": "codex-cli"
}
```

#### 模板创建（推荐）
**请求：** `POST /api/guided-tasks`
```json
{
  "projectId": "uuid",
  "title": "任务标题",
  "description": "任务描述",
  "baseBranch": "main",
  "leadAgentType": "codex-cli",
  "templateId": "backend-api"
}
```

**可用模板（`GET /api/task-templates`）：**

| 模板 ID | 角色数 | 包含角色 |
|---------|--------|----------|
| full-stack-web-app | 6 | architect, backend, database, frontend, tester, integration |
| backend-api | 5 | architect, backend, database, tester, integration |
| frontend-feature | 4 | architect, frontend, tester, integration |
| bugfix | 3 | investigator, fixer, tester |

**所需上下文：**
- Agent 健康状态（`GET /api/agents/health`）决定哪些 agent 可选
- 项目仓库状态（分支列表）决定 baseBranch 选项
- 任务模板列表决定快速创建选项

### 3.6 工作区页（核心页面）

这是最复杂的页面，需要根据任务状态动态切换内容。

**数据来源：** `GET /api/tasks/{taskId}`

**响应结构：**
```json
{
  "task": { /* 完整任务对象 */ },
  "subTasks": [ /* 子任务列表 */ ],
  "sessions": [ /* 所有 session */ ],
  "messages": [ /* 消息历史 */ ],
  "attachments": [ /* 附件 */ ],
  "planSnapshots": [ /* 计划快照历史 */ ],
  "team": [ /* 团队视图 */ ],
  "board": { /* 看板数据 */ },
  "mailboxMessages": [ /* 邮箱消息 */ ],
  "mergeRecords": [ /* 合并记录 */ ],
  "integrationRuns": [ /* 集成运行 */ ]
}
```

**实时更新：** 通过 SSE 连接 `GET /api/tasks/{taskId}/events`

---

## 四、任务状态机（核心）

### 4.1 任务状态流转

```
DRAFT ─── StartClarification ──→ CLARIFYING
  │                                   │
  │    ConfirmRequirements ───────────┘
  │                ↓
  │           PLANNING (Lead 生成计划)
  │                ↓
  ├──── GuidedTask ──→ PLAN_REVIEW (用户审阅/编辑计划)
  │                        │
  │               ApprovePlan
  │                        ↓
  │                    EXECUTING (Worker 并行执行)
  │                    ├── ACTION_REQUIRED (冲突/失败)
  │                    │       ↓ (修复后)
  │                    │   ← EXECUTING
  │                    ↓
  │                 REVIEWING (Final Review)
  │                    ↓
  │                 MERGING (合并到主干)
  │                    ↓
  │                 COMPLETED ✓
  │
  ├── ArchiveTask ──→ (任何状态可归档)
  └── DeleteTask ──→ (需先暂停)
```

### 4.2 任务状态含义与 UI 行为

| 状态 | 中文 | 颜色建议 | 工作区显示内容 |
|------|------|----------|---------------|
| DRAFT | 草稿 | 灰色 | 任务信息 + "开始澄清"按钮 |
| CLARIFYING | 澄清中 | 蓝色 | Lead Agent 对话窗口 + 实时输出 |
| PLANNING | 规划中 | 蓝色 | Lead Agent 生成计划中 + 加载动画 |
| PLAN_REVIEW | 计划审阅 | 黄色 | 计划编辑器 + DAG 预览 + "审批"按钮 |
| EXECUTING | 执行中 | 绿色脉冲 | 看板 + Worker 实时输出 + DAG 进度 |
| ACTION_REQUIRED | 需要处理 | 红色 | 错误详情 + 修复操作按钮 |
| REVIEWING | 审查中 | 紫色 | 审查进度 |
| MERGING | 合并中 | 紫色 | 合并进度 |
| COMPLETED | 已完成 | 绿色 | 完成总结 + 预览按钮 |
| FAILED | 失败 | 红色 | 错误详情 |
| CANCELLED | 已取消 | 灰色 | 归档信息 |

### 4.3 子任务状态流转

```
PENDING ──→ RUNNING ──→ REVIEW_PENDING ──→ ACCEPTED ──→ MERGED ✓
  ↑           │              │                │
BLOCKED       │         REWORK_REQUIRED       │
              │              ↓                │
              │         (ReworkSubTask)→ PENDING
              │
              ├──→ FAILED
              └──→ CANCELLED

DISCARD_PENDING ──→ DISCARDED (丢弃)
```

### 4.4 子任务状态含义

| 状态 | 中文 | 图标建议 | 说明 |
|------|------|----------|------|
| PENDING | 待执行 | ⏳ 时钟 | 等待系统调度 |
| BLOCKED | 阻塞中 | 🔒 锁 | 等待上游依赖完成 |
| READY | 已就绪 | ✅ 勾选 | 工作区已准备 |
| RUNNING | 运行中 | ▶️ 播放 / 旋转动画 | Worker 正在执行 |
| REVIEW_PENDING | 待审查 | 👁️ 眼睛 | 等待代码审查 |
| ACCEPTED | 已接受 | ✓ 绿勾 | 审查通过 |
| REWORK_REQUIRED | 需要返工 | 🔄 循环 | 审查有修改意见 |
| DISCARD_PENDING | 待丢弃 | ⚠️ 警告 | 标记为丢弃 |
| MERGED | 已合并 | 🔀 合并 | 已合并到主干 |
| FAILED | 失败 | ❌ 叉 | 执行失败 |
| CANCELLED | 已取消 | ⊘ 禁止 | 用户取消 |
| DISCARDED | 已丢弃 | 🗑️ 垃圾桶 | 确认丢弃 |

---

## 五、工作区分区设计

### 5.1 工作区头部

| 元素 | 数据 |
|------|------|
| 任务标题 | `task.title` |
| 状态徽章 | `task.status` + 对应颜色 |
| 阶段进度条 | 8 个圆点: DRAFT → CLARIFYING → PLANNING → PLAN_REVIEW → EXECUTING → REVIEWING → MERGING → COMPLETED |
| 主操作按钮 | 根据状态动态变化（见下） |
| 溢出菜单 (⋮) | 暂停/恢复/删除/预览/元信息 |

**主操作按钮逻辑：**

| 任务状态 | 按钮文本 | 动作 |
|----------|---------|------|
| DRAFT | 开始澄清 | `POST /api/tasks/{id}/start-clarification` |
| CLARIFYING | 确认需求 | `POST /api/tasks/{id}/confirm-requirements` |
| PLAN_REVIEW | 审批计划 | `POST /api/tasks/{id}/approve-plan` |
| EXECUTING | — | 无主按钮，看板控制 |
| ACTION_REQUIRED | 恢复执行 | `POST /api/tasks/{id}/resume` |
| COMPLETED | 预览成品 | 打开预览面板 |

### 5.2 左侧面板：对话/消息区

**在 CLARIFYING / PLANNING / PLAN_REVIEW 阶段：**

展示 `messages` 数组，每条消息：

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "subTaskId": null,
  "role": "USER" | "SYSTEM" | "LEAD",
  "content": "消息内容（支持 markdown）",
  "createdAt": "2026-03-25T..."
}
```

底部输入框：
- **请求：** `POST /api/tasks/{id}/messages`
- **请求体：** `{ "content": "用户消息" }`

**在 EXECUTING 阶段：**

展示实时 Worker 输出（通过 SSE `session:output` 事件）：

```
event: session:output
data: {"chunk":"Building project...\n","sessionId":"...","subtaskId":"...","taskId":"..."}
```

### 5.3 右侧面板：上下文选项卡

#### Tab 1: 概览 (Overview)

| 区块 | 内容 |
|------|------|
| 任务描述 | `task.description` |
| 项目信息 | 项目名 + 路径 + 基线分支 |
| 分支信息 | `task.taskBranchName` + `task.baseCommitSha` |
| Lead Agent | `task.leadAgentType` + 健康状态 |
| 最后错误 | `task.lastError`（红色警告） |

#### Tab 2: 计划 (Plan)

**在 PLAN_REVIEW 阶段为可编辑。**

计划数据结构（`task.currentPlanJson` 解析后）：

```json
{
  "notes": "计划说明",
  "nodes": [
    {
      "title": "设计 API 契约",
      "description": "整理服务边界、数据契约和运维约束...",
      "branch_suffix": "architect",
      "role": "architect",
      "deliverable": "接口与实施蓝图",
      "recommended_agent": "codex-cli",
      "depends_on": [],
      "acceptance_criteria": ["API surface 已列出", "依赖关系清晰"],
      "template_hint": "api-contract"
    },
    {
      "title": "实现服务端逻辑",
      "branch_suffix": "backend",
      "role": "backend",
      "depends_on": ["architect"],
      ...
    }
  ],
  "template_id": "backend-api"
}
```

**DAG 可视化：** 用 `nodes` 的 `depends_on` 关系画有向无环图。每个节点显示：
- 角色图标 + 标题
- 推荐 Agent
- 依赖连线

**计划操作：**
- 编辑计划：`POST /api/tasks/{id}/current-plan` `{ "planJson": "..." }`
- 应用模板：`POST /api/tasks/{id}/plan-seed` `{ "templateId": "backend-api" }`
- 恢复快照：`POST /api/tasks/{id}/restore-plan-snapshot` `{ "snapshotId": "uuid" }`
- 审批计划：`POST /api/tasks/{id}/approve-plan`

**快照历史：** `planSnapshots` 数组

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "version": 1,
  "source": "LEAD_GENERATED" | "APPROVED" | "RESTORED_FROM_HISTORY",
  "planJson": "...",
  "createdAt": "..."
}
```

#### Tab 3: 团队 (Team)

**数据来源：** `GET /api/tasks/{id}/team`

```json
{
  "lead": {
    "agentType": "codex-cli",
    "status": "COMPLETED",
    "latestSessionStatus": "COMPLETED"
  },
  "members": [
    {
      "subtaskId": "uuid",
      "title": "设计 API 契约",
      "role": "architect",
      "agentType": "codex-cli",
      "status": "RUNNING",
      "latestSessionStatus": "RUNNING",
      "lifecycle": {
        "status": "ACTIVE",
        "reason": "Worker 正在执行"
      }
    }
  ],
  "task": {
    "id": "uuid",
    "status": "EXECUTING",
    "title": "Build a REST API"
  }
}
```

每个成员卡片显示：角色图标、名称、状态徽章、Agent 类型、最新 session 状态。

**成员操作（右键菜单或操作按钮）：**

| 操作 | API | 条件 |
|------|-----|------|
| 重试 | `POST /api/tasks/{tid}/subtasks/{sid}/retry` | FAILED/ACTION_REQUIRED 状态 |
| 返工 | `POST /api/tasks/{tid}/subtasks/{sid}/rework` | 有增量审查反馈 |
| 取消 | `POST /api/tasks/{tid}/subtasks/{sid}/cancel` | 非终态 |
| 重派发 | `POST /api/tasks/{tid}/subtasks/{sid}/reassign` | 非 RUNNING |
| 换 Agent | `POST /api/tasks/{tid}/subtasks/{sid}/change-agent` `{"agentType":"..."}` | 非 RUNNING |
| 确认丢弃 | `POST /api/tasks/{tid}/subtasks/{sid}/confirm-discard` | DISCARD_PENDING |
| Rebase 重试 | `POST /api/tasks/{tid}/subtasks/{sid}/rebase-retry` | 合并冲突后 |

#### Tab 4: 看板 (Board)

**数据来源：** `GET /api/tasks/{id}/board`

##### 看板摘要

```json
{
  "summary": {
    "pending": 2,
    "blocked": 1,
    "running": 1,
    "reviewPending": 0,
    "accepted": 0,
    "merged": 0,
    "failed": 0,
    "actionRequired": 0
  }
}
```

渲染为水平进度条或数字统计卡片。

##### 列表视图

```json
{
  "list": {
    "members": [
      {
        "subtaskId": "uuid",
        "title": "设计 API 契约",
        "role": "architect",
        "agentType": "codex-cli",
        "status": "RUNNING",
        "branchName": "eat/task-id/architect",
        "dependencyBranchSuffixes": [],
        "latestSessionStatus": "RUNNING",
        "runSummary": "Worker 正在运行"
      }
    ]
  }
}
```

##### DAG 图视图

```json
{
  "graph": {
    "nodes": [
      {
        "id": "subtask-uuid",
        "label": "architect",
        "status": "RUNNING",
        "role": "architect",
        "dependencies": [],
        "mailboxInCount": 0,
        "mailboxOutCount": 0,
        "hasBlockers": false,
        "requiresAction": false
      }
    ],
    "edges": [
      {
        "from": "architect-subtask-id",
        "to": "backend-subtask-id",
        "state": "BLOCKING"
      }
    ]
  }
}
```

**Edge states:**
| 状态 | 含义 | 样式建议 |
|------|------|----------|
| SATISFIED | 依赖已满足 | 绿色实线 |
| BLOCKING | 依赖阻塞中 | 灰色虚线 |
| ATTENTION | 需要注意 | 橙色 |
| HANDOFF_READY | 交接就绪 | 蓝色 |

##### 活动流

```json
{
  "activity": [
    {
      "type": "SESSION_STARTED",
      "subtaskId": "uuid",
      "sessionId": "uuid",
      "timestamp": "2026-03-25T..."
    },
    {
      "type": "MAILBOX_MESSAGE",
      "subtaskId": "uuid",
      "messageType": "API_CONTRACT",
      "timestamp": "..."
    }
  ]
}
```

##### 操作队列

```json
{
  "actionRequiredItems": [
    {
      "id": "uuid",
      "kind": "BLOCKER",
      "subtaskId": "uuid",
      "summary": "合并冲突：backend 分支与 database 分支冲突",
      "severity": 1,
      "targetType": "SUBTASK",
      "primaryAction": "OPEN_MAILBOX"
    }
  ]
}
```

##### 风险摘要

```json
{
  "riskSummary": {
    "failedLaunches": 0,
    "integrationFailures": 0,
    "mailboxBlockers": 0,
    "mergeConflicts": 1,
    "requiresAck": 0,
    "reviewRequired": 2
  }
}
```

##### 工作流进度

```json
{
  "workflow": {
    "completed": 2,
    "waiting": 3,
    "manualAttentionCount": 1,
    "systemAttentionCount": 0,
    "total": 5
  }
}
```

---

## 六、邮箱/交接系统

用于子任务之间的结构化通信。

**数据来源：** `task.mailboxMessages`

### 发送交接消息

**请求：** `POST /api/tasks/{id}/mailbox`

```json
{
  "senderType": "SUBTASK",
  "senderSubTaskId": "uuid",
  "targetType": "SUBTASK",
  "targetSubTaskId": "uuid",
  "messageType": "API_CONTRACT",
  "content": "这是 API 接口定义...",
  "schemaJson": { "endpoints": [...] },
  "artifactRefs": ["artifact-uuid"],
  "fileRefs": ["/path/to/file"],
  "branchRef": "eat/task-id/architect",
  "requiresAck": true
}
```

### 消息类型

| 类型 | 中文 | 用途 |
|------|------|------|
| NOTE | 备注 | 非正式沟通 |
| BLOCKER | 阻塞项 | 标记阻塞问题 |
| DELIVERABLE_READY | 交付物就绪 | 通知上游交付完成 |
| TEST_REQUEST | 测试请求 | 请求测试 |
| REVIEW_REQUEST | 审查请求 | 请求代码审查 |
| API_CONTRACT | API 契约 | 接口定义交接 |
| DB_CONTRACT | 数据库契约 | Schema 定义交接 |

### UI 建议
- 在每个子任务卡片上显示未读消息数
- 点击打开邮箱对话框，按时间线展示消息
- BLOCKER 类型用红色高亮
- requiresAck 的消息需要确认按钮

---

## 七、预览系统

**数据来源：** `GET /api/tasks/{id}/preview`

### 预览配置

```json
{
  "session": null | {
    "status": "STARTING" | "RUNNING" | "STOPPED" | "FAILED",
    "targetType": "BASE_BRANCH" | "TASK_MAINLINE" | "SUBTASK",
    "targetId": "string",
    "branchName": "eat-Build-a-REST-API",
    "appRoot": "./frontend",
    "command": "npm run dev",
    "port": 3001,
    "url": "http://127.0.0.1:3001",
    "logs": "Starting dev server...\n",
    "startedAt": "2026-03-25T...",
    "updatedAt": "2026-03-25T..."
  },
  "targets": [
    {
      "type": "BASE_BRANCH",
      "id": "main",
      "label": "基线分支 (main)",
      "branchName": "main",
      "recommended": false
    },
    {
      "type": "TASK_MAINLINE",
      "id": "task-uuid",
      "label": "任务主干",
      "branchName": "eat-Build-a-REST-API",
      "recommended": true
    },
    {
      "type": "SUBTASK",
      "id": "subtask-uuid",
      "label": "architect 分支",
      "branchName": "eat/task-id/architect",
      "recommended": false
    }
  ]
}
```

### 操作

| 操作 | API | 请求体 |
|------|-----|--------|
| 启动预览 | `POST /api/tasks/{id}/preview/start` | `{"targetType":"TASK_MAINLINE","targetId":"uuid"}` |
| 停止预览 | `POST /api/tasks/{id}/preview/stop` | — |

### UI 建议
- 预览面板以 overlay/drawer 形式打开
- 顶部：目标选择器（下拉框）+ 启动/停止按钮
- 中间：iframe 嵌入预览 URL
- 底部：实时日志输出

---

## 八、指标系统

### 摘要视图

**数据来源：** `GET /api/metrics/summary`

```json
{
  "summary": {
    "tasksCompleted": 5,
    "tasksEnteredExecuting": 12,
    "failedWorkerSessionCount": 3,
    "mergeConflictCount": 1,
    "rebaseRetryCount": 0,
    "sandboxLaunchFailureCount": 0,
    "completionRateAfterPlanApproval": 0.42,
    "workerCrashDetectionRate": 1.0,
    "mergeConflictSurfacingAccuracy": 1.0,
    "retryToReviewConversionRate": null,
    "medianPlanApprovalToFirstWorkerOutputMs": 15200,
    "cleanupWarningCount": 0
  }
}
```

### UI 建议
- 仪表盘页面，卡片式展示关键指标
- 完成率用环形图
- Worker 崩溃率用条形图
- 中位启动时间用数字 + 趋势线

---

## 九、实时事件（SSE）

### 连接

```
GET /api/tasks/{taskId}/events
Accept: text/event-stream
```

### 事件类型

| 事件名 | 触发时机 | 数据 |
|--------|---------|------|
| `task:status` | 任务状态变更 | `{taskId, status, lastError}` |
| `subtask:status` | 子任务状态变更 | `{subtaskId, status, taskId}` |
| `subtask:assigned` | 子任务分配 | `{subtaskId, agentType, role}` |
| `session:started` | Worker 启动 | `{sessionId, subtaskId, containerId}` |
| `session:output` | Worker 实时输出 | `{chunk, sessionId, subtaskId}` |
| `session:ended` | Worker 退出 | `{sessionId, exitCode, status}` |
| `watchdog:timeout` | 超时 kill | `{reason, subtaskId}` |
| `task:mainline-updated` | 分支合并 | `{taskId, subtaskId, branch}` |
| `task:plan-restored` | 计划恢复 | `{taskId, snapshotId}` |
| `team:updated` | 团队变更 | `{taskId}` |
| `board:activity` | 看板活动 | `{type, subtaskId, ...}` |
| `mailbox:message` | 邮箱消息 | `{messageType, senderSubTaskId, ...}` |
| `integration:queued` | 集成排队 | `{taskId, runId}` |

### 前端处理建议
- 连接建立后收到 `: connected` 注释
- 用 EventSource API 监听
- `task:status` → 刷新任务头部
- `subtask:status` → 更新看板/团队视图
- `session:output` → 追加到实时输出面板
- `session:ended` → 刷新 session 列表
- `watchdog:timeout` → 显示告警通知

---

## 十、Agent 系统

### Agent 列表

**数据来源：** `GET /api/agents`

```json
{
  "agents": [
    {
      "name": "codex-cli",
      "runtimeMode": "REAL",
      "usesSandboxManager": true,
      "capabilities": {
        "canOrchestrate": true,
        "canExecute": true,
        "description": "OpenAI Codex CLI...",
        "supportedSandboxTypes": ["HOST", "DOCKER"],
        "supportsInteractiveInput": true,
        "supportsVision": false
      },
      "roles": {
        "leadCandidate": true,
        "workerCandidate": true
      }
    }
  ]
}
```

### Agent 健康

**数据来源：** `GET /api/agents/health`

```json
{
  "agents": {
    "codex-cli": {
      "available": true,
      "runtimeMode": "REAL",
      "checks": [
        { "name": "binary", "status": "PASS", "message": "codex binary is available." },
        { "name": "worker-sandbox", "status": "PASS", "message": "Docker worker sandbox is available." }
      ]
    },
    "claude-cli": {
      "available": false,
      "runtimeMode": "STUB",
      "failureReason": {
        "code": "HEALTH_CHECK_FAILED",
        "message": "Stub adapter is not treated as a real CLI runtime."
      }
    }
  },
  "leadCandidates": [
    { "agentName": "codex-cli", "available": true, "selectable": true, ... }
  ],
  "workerCandidates": [
    { "agentName": "codex-cli", "available": true, "selectable": true, ... },
    { "agentName": "claude-cli", "available": false, "selectable": false, ... }
  ]
}
```

### UI 建议
- 设置页面或创建任务时显示 Agent 健康状态
- REAL + available = 绿色勾选
- STUB = 灰色锁定 + "等待接入" 提示
- 健康检查项逐项展示（binary ✓, sandbox ✓）

---

## 十一、系统状态

### 健康检查

**数据来源：** `GET /api/system/health`

```json
{
  "status": "healthy",
  "db": "ok",
  "docker": {
    "available": true,
    "serverVersion": "29.2.1",
    "imageReady": true
  },
  "goroutines": 6,
  "uptime_seconds": 3600,
  "workers": {
    "pool_size": 6,
    "running": 2
  },
  "checked_at": "2026-03-25T..."
}
```

### Docker 健康

**数据来源：** `GET /api/system/docker-health`

```json
{
  "available": true,
  "reason": "",
  "serverVersion": "29.2.1",
  "imageReady": true
}
```

### 沙箱策略

**数据来源：** `GET /api/system/sandbox-policy`

```json
{
  "workerDefault": "DOCKER",
  "previewDefault": "DOCKER"
}
```

### UI 建议
- 底部状态栏或设置页面
- Docker 状态指示灯（绿/红）
- Worker 池使用率 (running/pool_size)

---

## 十二、国际化

系统支持中文和英文双语。当前主路径由 React 前端负责维护 `zh-CN` 和 `en` 翻译映射；`view-model.js` 属于历史实现。

### 关键翻译项

| Key | 中文 | 英文 |
|-----|------|------|
| statusDraft | 草稿 | Draft |
| statusClarifying | 澄清中 | Clarifying |
| statusPlanning | 规划中 | Planning |
| statusPlanReview | 计划审阅 | Plan Review |
| statusExecuting | 执行中 | Executing |
| statusReviewing | 审查中 | Reviewing |
| statusMerging | 合并中 | Merging |
| statusCompleted | 已完成 | Completed |
| statusActionRequired | 需要处理 | Action Required |
| subtaskPending | 待执行 | Pending |
| subtaskBlocked | 阻塞中 | Blocked |
| subtaskRunning | 运行中 | Running |
| subtaskReviewPending | 待审查 | Review Pending |
| subtaskMerged | 已合并 | Merged |
| subtaskFailed | 失败 | Failed |

---

## 十三、集成运行系统

### 数据模型

**IntegrationRun:**
```json
{
  "id": "uuid",
  "taskId": "uuid",
  "status": "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "ROLLED_BACK",
  "triggerType": "MANUAL" | "AUTO",
  "startedAt": "...",
  "completedAt": "...",
  "summary": "All gates passed.",
  "gateResults": [
    { "name": "lint", "status": "PASSED", "output": "..." },
    { "name": "test", "status": "FAILED", "output": "..." }
  ]
}
```

### 操作

| 操作 | API |
|------|-----|
| 启动集成运行 | `POST /api/tasks/{id}/integration-runs` |
| 重试 | `POST /api/tasks/{id}/integration-runs/retry` |
| 回滚 | `POST /api/tasks/{id}/integration-runs/rollback` |
| 出队 | `POST /api/tasks/{id}/integration-runs/dequeue` |

### UI 建议
- 在工作区底部或独立面板展示
- 每个 gate 一行：名称 + 状态图标 + 输出摘要
- 失败时高亮 + 展开详情
- 操作按钮：重试 / 回滚

---

## 十四、错误码完整列表

### 项目错误

| 错误码 | 含义 |
|--------|------|
| PROJECT_ALREADY_REGISTERED | 仓库已注册 |
| PATH_NOT_FOUND | 路径不存在 |
| PATH_NOT_DIRECTORY | 不是目录 |
| PATH_NOT_ABSOLUTE | 非绝对路径 |
| NOT_GIT_REPOSITORY | 非 Git 仓库 |
| BARE_GIT_REPOSITORY | 裸仓库不支持 |
| PATH_ACCESS_DENIED | 无权限 |
| PROJECT_NOT_FOUND | 项目不存在 |

### 任务错误

| 错误码 | 含义 |
|--------|------|
| TASK_NOT_FOUND | 任务不存在 |
| TASK_NOT_DRAFT | 非草稿状态 |
| TASK_NOT_CLARIFYING | 非澄清状态 |
| TASK_NOT_PLAN_REVIEW | 非计划审阅状态 |
| TASK_PAUSE_NOT_ALLOWED | 不允许暂停 |
| TASK_RESUME_NOT_ALLOWED | 不允许恢复 |
| TASK_DELETE_REQUIRES_PAUSE | 删除前需暂停 |
| LEAD_AGENT_REQUIRED | 必须指定 Lead Agent |
| LEAD_AGENT_UNHEALTHY | Lead Agent 不可用 |
| BASE_BRANCH_NOT_FOUND | 基线分支不存在 |

### 子任务错误

| 错误码 | 含义 |
|--------|------|
| SUBTASK_NOT_FOUND | 子任务不存在 |
| SUBTASK_CANCEL_NOT_ALLOWED | 不允许取消 |
| SUBTASK_RETRY_NOT_ALLOWED | 不允许重试 |
| SUBTASK_REWORK_NOT_ALLOWED | 不允许返工 |
| SUBTASK_REASSIGN_NOT_ALLOWED | 不允许重派发 |
| SUBTASK_CHANGE_AGENT_NOT_ALLOWED | 不允许换 Agent |
| SUBTASK_DISCARD_NOT_ALLOWED | 不允许丢弃 |
| SUBTASK_REBASE_RETRY_NOT_ALLOWED | 不允许 Rebase 重试 |

---

## 十五、技术约束（供前端参考）

- **后端地址：** 默认 `http://127.0.0.1:3000`
- **API 前缀：** `/api/`
- **SSE 端点：** `/api/tasks/{taskId}/events`
- **静态资源：** Go 后端直接承载前端静态文件
- **数据格式：** 全 JSON，时间戳为 ISO 8601
- **错误格式：** `{ "error": { "code": "ERROR_CODE", "message": "...", "details": {...} } }`
- **认证：** 无（本地系统，无需认证）
- **并发安全：** 乐观锁（version 字段），幂等操作（如 approve-plan）

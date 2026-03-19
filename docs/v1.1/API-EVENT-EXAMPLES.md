# EAT v1.1 API And Event Examples

本文件给出 v1.1 路线下建议的 API / SSE 事件示例。  
这些 payload 是设计合同示例，不代表路径已经在当前代码中存在。

## Conventions

- REST 示例使用 `/api/...`
- realtime 事件默认沿用 SSE
- 示例强调字段命名与状态表达，不追求完整 payload

## Phase 17 - Team View And Lifecycle

### Get Team View

```http
GET /api/tasks/task_123/team
```

```json
{
  "task": {
    "id": "task_123",
    "status": "EXECUTING",
    "title": "Build full-stack Todo app"
  },
  "lead": {
    "agentType": "codex-cli",
    "status": "RUNNING"
  },
  "members": [
    {
      "subtaskId": "sub_architect",
      "role": "architect",
      "displayName": "Architecture Lead",
      "agentType": "codex-cli",
      "status": "ACCEPTED",
      "branchName": "eat/task_123/architect",
      "worktreePath": "/tmp/eat/task_123/architect"
    },
    {
      "subtaskId": "sub_frontend",
      "role": "frontend",
      "displayName": "Frontend Worker",
      "agentType": "codex-cli",
      "status": "RUNNING",
      "branchName": "eat/task_123/frontend",
      "worktreePath": "/tmp/eat/task_123/frontend"
    }
  ]
}
```

### Reassign Worker

```http
POST /api/subtasks/sub_frontend/reassign
Content-Type: application/json
```

```json
{
  "agentType": "codex-cli",
  "reason": "Need a stronger frontend-capable worker."
}
```

### Team Event

```json
{
  "event": "team:updated",
  "data": {
    "taskId": "task_123",
    "memberCount": 5
  }
}
```

## Phase 18 - DAG Planning

### Lead-Generated DAG Draft

```json
{
  "event": "task:plan-generated",
  "data": {
    "taskId": "task_123",
    "planVersion": 3,
    "currentPlan": {
      "nodes": [
        {
          "title": "Design API and delivery contracts",
          "role": "architect",
          "recommended_agent": "codex-cli",
          "branch_suffix": "architect",
          "deliverable": "REST API contract and repo plan",
          "acceptance_criteria": [
            "Auth routes documented",
            "Todo CRUD contract documented"
          ]
        },
        {
          "title": "Implement React frontend",
          "role": "frontend",
          "recommended_agent": "codex-cli",
          "branch_suffix": "frontend",
          "depends_on": ["architect"],
          "deliverable": "React app with login and todo flows",
          "acceptance_criteria": [
            "Build passes",
            "Auth flow integrated"
          ]
        }
      ],
      "notes": "Architect defines contracts before implementation workers start."
    }
  }
}
```

### Seed From Template

```http
POST /api/task-templates/full-stack-web-app/seed
Content-Type: application/json
```

```json
{
  "title": "Build full-stack Todo app",
  "description": "React frontend, auth, SQLite/Postgres, tests."
}
```

## Phase 19 - Structured Mailbox

### Post Structured Handoff

```http
POST /api/tasks/task_123/mailbox
Content-Type: application/json
```

```json
{
  "senderSubTaskId": "sub_architect",
  "targetSubTaskId": "sub_backend",
  "messageType": "API_CONTRACT",
  "branchRef": "eat/task_123/architect",
  "fileRefs": ["docs/contracts/auth-api.md"],
  "content": "Use POST /api/auth/login and keep JWT payload shape unchanged."
}
```

```json
{
  "message": {
    "id": "mail_123",
    "taskId": "task_123",
    "senderType": "SUBTASK",
    "senderSubTaskId": "sub_architect",
    "targetType": "SUBTASK",
    "targetSubTaskId": "sub_backend",
    "messageType": "API_CONTRACT",
    "branchRef": "eat/task_123/architect",
    "fileRefs": ["docs/contracts/auth-api.md"],
    "content": "Use POST /api/auth/login and keep JWT payload shape unchanged.",
    "createdAt": "2026-03-20T09:00:00.000Z"
  }
}
```

### Mailbox Event

```json
{
  "event": "mailbox:message",
  "data": {
    "taskId": "task_123",
    "message": {
      "id": "mail_123",
      "messageType": "API_CONTRACT",
      "senderType": "SUBTASK",
      "targetSubTaskId": "sub_backend"
    }
  }
}
```

## Phase 20 - Operations Board

### Board Snapshot

```http
GET /api/tasks/task_123/board
```

```json
{
  "taskId": "task_123",
  "summary": {
    "running": 2,
    "blocked": 1,
    "actionRequired": 1,
    "accepted": 2
  },
  "actionRequiredItems": [
    {
      "kind": "BLOCKER",
      "subtaskId": "sub_tester",
      "summary": "Waiting for backend auth contract handoff."
    }
  ],
  "graph": {
    "nodes": [
      { "subtaskId": "sub_architect", "status": "ACCEPTED" },
      { "subtaskId": "sub_backend", "status": "RUNNING" },
      { "subtaskId": "sub_tester", "status": "BLOCKED" }
    ],
    "edges": [
      { "from": "sub_architect", "to": "sub_backend", "state": "SATISFIED" },
      { "from": "sub_backend", "to": "sub_tester", "state": "BLOCKING" }
    ]
  }
}
```

### Activity Event

```json
{
  "event": "board:activity",
  "data": {
    "taskId": "task_123",
    "kind": "MAILBOX_MESSAGE",
    "summary": "architect sent API_CONTRACT to backend",
    "createdAt": "2026-03-20T09:01:00.000Z"
  }
}
```

## Phase 21 - Integration Queue And Gates

### Start Integration Run

```http
POST /api/tasks/task_123/integration-runs
```

```json
{
  "integrationRun": {
    "id": "int_001",
    "taskId": "task_123",
    "integrationBranch": "eat/task_123/integration-1",
    "status": "RUNNING"
  }
}
```

### Gate Result Event

```json
{
  "event": "integration:gate-result",
  "data": {
    "taskId": "task_123",
    "integrationRunId": "int_001",
    "gateType": "TEST",
    "status": "FAILED",
    "summary": "2 integration tests failed in auth flow."
  }
}
```

## Phase 22 - Guided Flow And Templates

### List Built-In Templates

```http
GET /api/task-templates
```

```json
{
  "templates": [
    {
      "id": "full-stack-web-app",
      "label": "Full-stack web app",
      "description": "Architect, backend, database, frontend, tester, integration."
    },
    {
      "id": "backend-api",
      "label": "Backend API",
      "description": "Contract, implementation, tests, release verification."
    }
  ]
}
```

### Guided Task Creation Example

```http
POST /api/guided-tasks
Content-Type: application/json
```

```json
{
  "templateId": "full-stack-web-app",
  "title": "Build full-stack Todo app",
  "description": "React frontend, auth, database, tests.",
  "projectId": "proj_123",
  "baseBranch": "main",
  "leadAgentType": "codex-cli"
}
```

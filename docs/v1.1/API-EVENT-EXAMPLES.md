# EAT Extended Phase API And Event Examples

本文件给出扩展阶段 `17` 到 `22` 的 API / SSE 事件示例。  
这些示例以当前代码已存在或已明确落地的路径和字段命名为基础，不再保留与现有实现明显不一致的“想象接口”。

## Conventions

- REST 示例使用 `/api/...`
- realtime 事件沿用 task-scoped SSE
- 示例强调对象层和字段命名，不追求完整响应体

## Phase 17 - Team View And Lifecycle

### Get Team View

```http
GET /api/tasks/task_123/team
```

```json
{
  "ok": true,
  "team": {
    "task": {
      "id": "task_123",
      "status": "EXECUTING",
      "taskBranchName": "eat-task-123-mainline",
      "title": "Build full-stack Todo app"
    },
    "lead": {
      "agentType": "codex-cli",
      "sessionId": "sess_lead_001",
      "status": "RUNNING",
      "lastError": null
    },
    "members": [
      {
        "subtaskId": "sub_architect",
        "taskId": "task_123",
        "title": "Design system boundary and contracts",
        "displayName": "Architecture Lead",
        "role": "architect",
        "agentType": "codex-cli",
        "status": "ACCEPTED",
        "branchSuffix": "architect",
        "branchName": "eat/task_123/architect",
        "worktreePath": "/tmp/.eat-worktrees/task_123/architect",
        "executionOrder": 1,
        "latestSessionId": "sess_worker_001",
        "latestSessionStatus": "COMPLETED",
        "runSummary": "Accepted for integration."
      }
    ]
  }
}
```

### Reassign Member

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

## Phase 18 - Role-Aware DAG Planning

### Plan Generated Event

```json
{
  "event": "task:plan-generated",
  "data": {
    "taskId": "task_123",
    "planVersion": 3,
    "currentPlan": {
      "subtasks": [
        {
          "title": "Design API and delivery contracts",
          "description": "Define the API contract and shared implementation baseline.",
          "role": "architect",
          "recommended_agent": "codex-cli",
          "branch_suffix": "architect",
          "deliverable": "REST API contract and delivery plan",
          "acceptance_criteria": [
            "Auth routes documented",
            "Todo CRUD contract documented"
          ],
          "template_hint": "api-contract"
        },
        {
          "title": "Implement React frontend",
          "description": "Implement the authenticated Todo experience in the web app.",
          "role": "frontend",
          "recommended_agent": "codex-cli",
          "branch_suffix": "frontend",
          "depends_on": ["architect"],
          "deliverable": "React app with login and todo flows",
          "acceptance_criteria": [
            "Build passes",
            "Auth flow integrated"
          ],
          "template_hint": "react-feature"
        }
      ],
      "notes": "Architect defines contracts before implementation workers start."
    }
  }
}
```

### Apply Plan Seed

```http
POST /api/tasks/task_123/plan-seed
Content-Type: application/json
```

```json
{
  "templateId": "full-stack-web-app"
}
```

### Plan Seeded Event

```json
{
  "event": "task:plan-seeded",
  "data": {
    "taskId": "task_123",
    "templateId": "full-stack-web-app"
  }
}
```

### Restore Plan Snapshot

```http
POST /api/tasks/task_123/restore-plan-snapshot
Content-Type: application/json
```

```json
{
  "snapshotId": "snap_001"
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
  "artifactRefs": ["auth-contract-v1"],
  "fileRefs": ["docs/contracts/auth-api.md"],
  "schemaJson": {
    "route": "POST /api/auth/login"
  },
  "requiresAck": true,
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
    "artifactRefs": ["auth-contract-v1"],
    "fileRefs": ["docs/contracts/auth-api.md"],
    "schemaJson": {
      "route": "POST /api/auth/login"
    },
    "requiresAck": true,
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
      "targetSubTaskId": "sub_backend",
      "requiresAck": true
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
  "ok": true,
  "board": {
    "summary": {
      "running": 2,
      "blocked": 1,
      "actionRequired": 1,
      "accepted": 2
    },
    "riskSummary": {
      "failedLaunches": 0,
      "mailboxBlockers": 1,
      "mergeConflicts": 0,
      "integrationFailures": 0,
      "reviewRequired": 1,
      "requiresAck": 1
    },
    "actionRequiredItems": [
      {
        "kind": "MAILBOX_MESSAGE",
        "subTaskId": "sub_tester",
        "summary": "Waiting for backend test request response."
      }
    ],
    "graph": {
      "nodes": [
        {
          "subtaskId": "sub_architect",
          "role": "architect",
          "status": "ACCEPTED"
        },
        {
          "subtaskId": "sub_backend",
          "role": "backend",
          "status": "RUNNING"
        }
      ],
      "edges": [
        {
          "from": "sub_architect",
          "to": "sub_backend",
          "state": "HANDOFF_READY",
          "handoffCount": 1,
          "isBlocking": false,
          "unresolvedBlockerCount": 0
        }
      ]
    }
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
  "ok": true,
  "integrationRun": {
    "id": "int_001",
    "taskId": "task_123",
    "integrationBranch": "eat/task_123/integration-1",
    "status": "QUEUED",
    "startedAt": null,
    "endedAt": null
  }
}
```

### Integration Started Event

```json
{
  "event": "integration:started",
  "data": {
    "taskId": "task_123",
    "integrationRunId": "int_001",
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

### Retry Integration Run

```http
POST /api/integration-runs/int_001/retry
```

### Roll Back Integration Run

```http
POST /api/integration-runs/int_001/rollback
```

### Dequeue Queue Item

```http
POST /api/integration-queue-items/queue_001/dequeue
```

## Phase 22 - Guided Flow, Templates And Preview

### List Built-In Templates

```http
GET /api/task-templates
```

```json
{
  "ok": true,
  "templates": [
    {
      "id": "full-stack-web-app",
      "roles": ["architect", "backend", "database", "frontend", "tester", "integration"],
      "nodeCount": 6
    },
    {
      "id": "backend-api",
      "roles": ["architect", "backend", "database", "tester", "integration"],
      "nodeCount": 5
    }
  ]
}
```

### Guided Task Creation

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

### Get Preview Recommendation

```http
GET /api/tasks/task_123/preview
```

```json
{
  "ok": true,
  "preview": {
    "available": true,
    "defaults": {
      "targetId": "task-mainline",
      "targetType": "TASK_MAINLINE",
      "appRoot": "web",
      "command": "npm run dev -- --host 0.0.0.0 --port 4173",
      "port": 4173,
      "path": "/"
    }
  }
}
```

### Start Preview

```http
POST /api/tasks/task_123/preview/start
Content-Type: application/json
```

```json
{
  "targetId": "task-mainline",
  "appRoot": "web",
  "command": "npm run dev -- --host 0.0.0.0 --port 4173",
  "port": 4173,
  "path": "/"
}
```

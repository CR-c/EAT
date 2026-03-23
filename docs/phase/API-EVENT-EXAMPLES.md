# EAT Foundation Phase API And Event Examples

本文件给出基础阶段 `01` 到 `16` 的 API / SSE 事件示例。  
示例以当前代码已存在或已明确落地的路径和事件名为基础，不再混用 websocket 占位写法或不完整 payload。

## Conventions

- REST 示例使用 `/api/...`
- realtime 事件沿用 task-scoped SSE
- 示例强调字段命名与状态表达，不追求完整响应体

## Phase 01 - Project APIs

### Register Project

```http
POST /api/projects
Content-Type: application/json
```

```json
{
  "path": "/home/code/EAT"
}
```

```json
{
  "ok": true,
  "project": {
    "id": "proj_123",
    "name": "EAT",
    "path": "/home/code/EAT",
    "defaultBranch": "main"
  },
  "repoStatus": {
    "currentBranch": "main",
    "defaultBranch": "main",
    "isDirty": true,
    "recentBranches": ["main", "feature/prd"]
  }
}
```

### Project Validation Failure

```json
{
  "error": {
    "code": "NOT_GIT_REPOSITORY",
    "message": "The selected path is not a git repository."
  }
}
```

## Phase 02 - Agent APIs

### List Agents

```http
GET /api/agents
```

```json
{
  "agents": [
    {
      "name": "codex-cli",
      "runtimeMode": "REAL",
      "capabilities": {
        "canOrchestrate": true,
        "canExecute": true,
        "supportsVision": false,
        "supportsInteractiveInput": true,
        "supportedSandboxTypes": ["DOCKER"]
      }
    }
  ],
  "leadCandidates": [
    {
      "agentName": "codex-cli",
      "selectable": true
    }
  ],
  "workerCandidates": [
    {
      "agentName": "codex-cli",
      "selectable": true
    }
  ]
}
```

### Health Snapshot

```http
GET /api/agents/health
```

```json
{
  "agents": {
    "codex-cli": {
      "available": true,
      "runtimeMode": "REAL",
      "version": "codex-cli 1.2.3",
      "checks": [
        {
          "name": "binary",
          "status": "PASS"
        }
      ]
    }
  }
}
```

## Phase 03 - Sandbox APIs

### Docker Health

```http
GET /api/system/docker-health
```

```json
{
  "ok": true,
  "available": true,
  "daemonReachable": true,
  "defaultWorkerImage": "eat/worker-base:latest",
  "networkProfile": "ISOLATED"
}
```

### Sandbox Policy

```http
GET /api/system/sandbox-policy
```

```json
{
  "ok": true,
  "defaultSandboxType": "DOCKER",
  "defaultWorkerImage": "eat/worker-base:latest",
  "blockedHostPaths": ["~", "~/.ssh"]
}
```

## Phase 04 - Task Creation And Clarification

### Create Task

```http
POST /api/tasks
Content-Type: application/json
```

```json
{
  "projectId": "proj_123",
  "baseBranch": "main",
  "leadAgentType": "codex-cli",
  "title": "Implement task orchestration foundation flow",
  "description": "Build local-first multi-agent orchestration.",
  "attachments": [
    {
      "fileName": "brief.md",
      "filePath": "/tmp/brief.md",
      "mimeType": "text/markdown",
      "fileType": "DOCUMENT"
    }
  ]
}
```

```json
{
  "task": {
    "id": "task_123",
    "status": "DRAFT",
    "baseCommitSha": "abc123def456",
    "taskBranchName": "eat-Implement-task-orchestration-foundation-flow"
  }
}
```

### Start Clarification

```http
POST /api/tasks/task_123/start-clarification
Content-Type: application/json
```

```json
{
  "content": "Clarify whether workers must run in parallel only."
}
```

### Lead Message Event

```json
{
  "event": "task:lead-message",
  "data": {
    "taskId": "task_123",
    "messageId": "msg_001",
    "content": "Please confirm whether subtasks must run in parallel only."
  }
}
```

## Phase 05 - Plan Generation

### Plan Generated Event

```json
{
  "event": "task:plan-generated",
  "data": {
    "taskId": "task_123",
    "planVersion": 1,
    "currentPlan": {
      "subtasks": [
        {
          "title": "Add project registration",
          "description": "Implement project CRUD and repo validation.",
          "recommended_agent": "codex-cli",
          "branch_suffix": "project-registration"
        },
        {
          "title": "Add task UI",
          "description": "Build the UI after the API contract exists.",
          "recommended_agent": "codex-cli",
          "branch_suffix": "task-ui",
          "depends_on": ["project-registration"]
        }
      ],
      "notes": "Parallelize only independent backend and UI slices."
    }
  }
}
```

### Plan Validation Failure

```json
{
  "error": {
    "code": "INVALID_PLAN",
    "message": "Plan contains duplicate branch suffixes.",
    "details": {
      "duplicates": ["project-registration"]
    }
  }
}
```

## Phase 06 - Plan Restore

### Restore Historical Snapshot

```http
POST /api/tasks/task_123/restore-plan-snapshot
Content-Type: application/json
```

```json
{
  "snapshotId": "plan_snap_002"
}
```

### Plan Restored Event

```json
{
  "event": "task:plan-restored",
  "data": {
    "taskId": "task_123",
    "snapshotId": "plan_snap_002",
    "currentPlan": {
      "subtasks": [
        {
          "title": "Restored subtask title",
          "description": "Restored description",
          "recommended_agent": "codex-cli",
          "branch_suffix": "restored-subtask"
        }
      ]
    }
  }
}
```

## Phase 07 - Plan Approval

### Approve Plan

```http
POST /api/tasks/task_123/approve-plan
```

```json
{
  "ok": true,
  "task": {
    "id": "task_123",
    "status": "EXECUTING"
  },
  "subTasks": [
    {
      "id": "sub_001",
      "status": "PENDING",
      "branchSuffix": "project-registration"
    }
  ]
}
```

## Phase 08 - Worker Setup And Execution

### Branch Renamed Event

```json
{
  "event": "branch:renamed",
  "data": {
    "subtaskId": "sub_001",
    "originalName": "eat/task_123/backend",
    "resolvedName": "eat/task_123/backend-1"
  }
}
```

### Session Started Event

```json
{
  "event": "session:started",
  "data": {
    "sessionId": "sess_worker_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "status": "RUNNING"
  }
}
```

## Phase 09 - Output Streaming

### Session Output Event

```json
{
  "event": "session:output",
  "data": {
    "sessionId": "sess_worker_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "chunk": "worker completed\n"
  }
}
```

### Session Ended Event

```json
{
  "event": "session:ended",
  "data": {
    "sessionId": "sess_worker_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "exitCode": 0,
    "status": "COMPLETED"
  }
}
```

## Phase 10 - Incremental Review

### Incremental Review Event

```json
{
  "event": "subtask:review",
  "data": {
    "subtaskId": "sub_001",
    "phase": "INCREMENTAL",
    "decision": "REWORK",
    "summary": "Retry with clearer validation handling."
  }
}
```

## Phase 12 - Merge And Retry

### Merge Conflict Event

```json
{
  "event": "merge:status",
  "data": {
    "subtaskId": "sub_001",
    "status": "CONFLICT",
    "summary": "Conflict in src/server/app.js."
  }
}
```

## Phase 13 - Cleanup Warning

### Cleanup Warning Event

```json
{
  "event": "task:cleanup-warning",
  "data": {
    "taskId": "task_123",
    "worktreePath": "/tmp/.eat-worktrees/task_123/backend",
    "reason": "Directory is locked by another process."
  }
}
```

## Phase 14 - Metrics

### Metrics Summary

```http
GET /api/metrics/summary
```

```json
{
  "ok": true,
  "metrics": {
    "taskCompletionRate": 0.75,
    "mergeConflictCount": 2,
    "rebaseRetryCount": 1
  }
}
```

## Phase 15 - Dependency Scheduling

### Dependency-Constrained Plan Item

```json
{
  "title": "Add task UI",
  "description": "Build the UI after the API contract exists.",
  "recommended_agent": "codex-cli",
  "branch_suffix": "task-ui",
  "depends_on": ["project-registration"]
}
```

## Phase 16 - Mailbox And Handoff

### Post Lead Handoff Note

```http
POST /api/tasks/task_123/mailbox
Content-Type: application/json
```

```json
{
  "targetSubTaskId": "subtask_frontend",
  "content": "Use the auth endpoints from the backend branch and keep the token shape unchanged."
}
```

```json
{
  "message": {
    "id": "mail_001",
    "taskId": "task_123",
    "senderType": "LEAD",
    "targetType": "SUBTASK",
    "targetSubTaskId": "subtask_frontend",
    "messageType": "NOTE",
    "content": "Use the auth endpoints from the backend branch and keep the token shape unchanged."
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
      "id": "mail_001",
      "senderType": "LEAD",
      "targetSubTaskId": "subtask_frontend",
      "messageType": "NOTE"
    }
  }
}
```

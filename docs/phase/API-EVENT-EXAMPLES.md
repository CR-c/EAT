# EAT API And Event Examples

This document gives concrete request, response, and websocket payload examples by phase. The payloads are illustrative contracts, not a claim that every endpoint path is already fixed.

## Conventions

- REST examples use `/api/...` paths as placeholders.
- Websocket event names follow the PRD naming.
- IDs use readable fake values.
- Responses omit unrelated fields for brevity.

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
  "project": {
    "id": "proj_123",
    "name": "EAT",
    "path": "/home/code/EAT",
    "defaultBranch": "main"
  },
  "repoStatus": {
    "currentBranch": "main",
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
      "capabilities": {
        "canOrchestrate": true,
        "canExecute": true,
        "supportsVision": false,
        "supportsInteractiveInput": true,
        "supportedSandboxTypes": ["DOCKER"]
      }
    }
  ]
}
```

### Agent Health Event

```json
{
  "event": "agent:health",
  "data": {
    "agents": {
      "codex-cli": {
        "available": true,
        "version": "1.2.3"
      }
    }
  }
}
```

## Phase 03 - Docker Health API

### Docker Preflight

```http
GET /api/system/docker-health
```

```json
{
  "available": true,
  "daemonReachable": true,
  "defaultWorkerImage": "eat/worker-base:latest"
}
```

### Docker Failure

```json
{
  "available": false,
  "daemonReachable": false,
  "reason": "Docker daemon is not running."
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
  "title": "Implement task orchestration MVP",
  "description": "Build local-first multi-agent orchestration.",
  "attachments": [
    {
      "fileName": "ui-flow.png",
      "filePath": "/tmp/upload-ui-flow.png",
      "mimeType": "image/png",
      "fileType": "IMAGE",
      "size": 120330
    }
  ]
}
```

```json
{
  "task": {
    "id": "task_123",
    "status": "DRAFT",
    "baseCommitSha": "abc123def456"
  }
}
```

### Start Clarification

```json
{
  "event": "task:start-clarification",
  "data": {
    "taskId": "task_123"
  }
}
```

### Lead Message

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
        }
      ],
      "notes": "Parallelize only independent backend and UI slices."
    }
  }
}
```

### Plan Validation Failure Shape

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

## Phase 06 - Plan Restore And Approval Surface

### Restore Historical Snapshot

```json
{
  "event": "task:restore-plan-snapshot",
  "data": {
    "taskId": "task_123",
    "snapshotId": "plan_snap_002"
  }
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

## Phase 07 - Approve Plan

### Approve Plan Event

```json
{
  "event": "task:approve-plan",
  "data": {
    "taskId": "task_123",
    "currentPlan": {
      "subtasks": [
        {
          "title": "Build backend",
          "description": "Implement project and task APIs.",
          "recommended_agent": "codex-cli",
          "branch_suffix": "backend"
        },
        {
          "title": "Build UI",
          "description": "Implement task creation and project screens.",
          "recommended_agent": "codex-cli",
          "branch_suffix": "ui"
        }
      ]
    }
  }
}
```

### Initial Subtask Status Event

```json
{
  "event": "subtask:status",
  "data": {
    "subtaskId": "sub_001",
    "status": "PENDING"
  }
}
```

## Phase 08 - Worker Execution

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
    "sessionId": "sess_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "pid": 4812
  }
}
```

### Retry Event

```json
{
  "event": "subtask:retry",
  "data": {
    "subtaskId": "sub_001",
    "description": "Retry after fixing missing API route."
  }
}
```

### Attachment Launch Metadata Shape

```json
{
  "subtaskId": "sub_001",
  "attachments": {
    "included": [
      {
        "attachmentId": "att_doc_1",
        "fileName": "requirements.md",
        "fileType": "DOCUMENT"
      }
    ],
    "excluded": [
      {
        "attachmentId": "att_img_1",
        "fileName": "ui-flow.png",
        "fileType": "IMAGE",
        "reason": "Assigned agent does not support vision."
      }
    ]
  }
}
```

## Phase 09 - Output Streaming

### Session Output Event

```json
{
  "event": "session:output",
  "data": {
    "sessionId": "sess_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "chunk": "Applying Prisma migration...\n"
  }
}
```

### Session Ended Event

```json
{
  "event": "session:ended",
  "data": {
    "sessionId": "sess_001",
    "taskId": "task_123",
    "subtaskId": "sub_001",
    "exitCode": 0,
    "status": "COMPLETED"
  }
}
```

## Phase 10 - Incremental Review And Early Rework

### Incremental Review Event

```json
{
  "event": "subtask:review",
  "data": {
    "subtaskId": "sub_001",
    "decision": "REWORK",
    "summary": "API route compiles, but validation errors are not surfaced to the UI.",
    "phase": "INCREMENTAL"
  }
}
```

### Early Rework Event

```json
{
  "event": "subtask:rework",
  "data": {
    "subtaskId": "sub_001",
    "description": "Add error-state handling to the project registration form."
  }
}
```

### Change Agent Event

```json
{
  "event": "subtask:change-agent",
  "data": {
    "subtaskId": "sub_001",
    "agentType": "claude-cli",
    "description": "Switch to a vision-capable agent because image review is required."
  }
}
```

## Phase 11 - Final Review

### Final Review Event

```json
{
  "event": "subtask:review",
  "data": {
    "subtaskId": "sub_001",
    "decision": "ACCEPTED",
    "summary": "The backend changes are correct and consistent with the approved plan.",
    "phase": "FINAL"
  }
}
```

### Confirm Discard Event

```json
{
  "event": "subtask:confirm-discard",
  "data": {
    "subtaskId": "sub_002"
  }
}
```

## Phase 12 - Merge And Rebase Retry

### Merge Status Event

```json
{
  "event": "merge:status",
  "data": {
    "subtaskId": "sub_001",
    "status": "SUCCEEDED",
    "summary": "Merged into main with --no-ff."
  }
}
```

### Merge Conflict Status Event

```json
{
  "event": "merge:status",
  "data": {
    "subtaskId": "sub_002",
    "status": "CONFLICT",
    "summary": "Conflict in package.json"
  }
}
```

### Rebase Retry Event

```json
{
  "event": "subtask:rebase-retry",
  "data": {
    "subtaskId": "sub_002"
  }
}
```

### Generic Resume Event

```json
{
  "event": "task:resume",
  "data": {
    "taskId": "task_123"
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
    "worktreePath": "/tmp/eat/task_123/sub_002",
    "reason": "Directory is locked by another process."
  }
}
```

## Phase 14 - Metrics Export

### Metrics Summary

```http
GET /api/metrics/summary
```

```json
{
  "summary": {
    "tasksEnteredExecuting": 24,
    "tasksCompleted": 19,
    "completionRateAfterPlanApproval": 0.7917,
    "workerCrashDetectionRate": 1.0,
    "mergeConflictCount": 5,
    "rebaseRetryCount": 3
  }
}
```

### Metrics Export

```http
GET /api/metrics/export
```

```json
{
  "generatedAt": "2026-03-18T12:00:00.000Z",
  "tasks": [
    {
      "taskId": "task_123",
      "status": "COMPLETED",
      "retryCount": 2,
      "mergeConflictCount": 1,
      "cleanupWarningCount": 0
    }
  ]
}
```

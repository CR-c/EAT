import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  GATE_RESULT_STATUS,
  INTEGRATION_QUEUE_ITEM_STATUS,
  INTEGRATION_RUN_STATUS,
  MAILBOX_MESSAGE_TYPE,
  MAILBOX_PARTICIPANT_TYPE,
  MAILBOX_TARGET_TYPE,
  MERGE_OPERATION,
  MERGE_STATUS,
  PLAN_SNAPSHOT_SOURCE,
  MESSAGE_ROLE,
  REVIEW_PHASE,
  SESSION_STATUS,
  SESSION_TYPE,
  SqliteTaskRepository,
  SUBTASK_STATUS,
  TASK_STATUS,
} from "../src/repositories/task-repository.js";
import { SqliteProjectRepository } from "../src/repositories/project-repository.js";

test("persists task plan fields, messages, attachments, sessions, subtasks, and append-only plan snapshots", async () => {
  const fixture = await makeTempDir("eat-task-repo-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const projectRepository = new SqliteProjectRepository({ databasePath });
    const taskRepository = new SqliteTaskRepository({ databasePath });

    const project = await projectRepository.createProject({
      defaultBranch: "main",
      name: "EAT",
      path: "/home/code/EAT",
    });

    const task = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "abc123def456",
      description: "Build the Phase 04 clarification flow.",
      leadAgentType: "claude-cli",
      projectId: project.id,
      title: "Lead session chat flow",
    });

    const message = await taskRepository.createMessage({
      content: "Please confirm whether planning waits for explicit approval.",
      role: MESSAGE_ROLE.LEAD_AGENT,
      taskId: task.id,
    });

    const attachment = await taskRepository.createAttachment({
      fileName: "brief.md",
      filePath: `/tmp/${task.id}/brief.md`,
      fileType: "DOCUMENT",
      mimeType: "text/markdown",
      size: 1024,
      taskId: task.id,
    });

    const session = await taskRepository.createSession({
      agentType: "claude-cli",
      sandboxType: "HOST",
      sessionType: SESSION_TYPE.LEAD,
      status: SESSION_STATUS.RUNNING,
      taskId: task.id,
    });
    const updatedTask = await taskRepository.updateTask(task.id, {
      approvedPlanJson: JSON.stringify({
        notes: "Frozen approved plan.",
        subtasks: [
          {
            branch_suffix: "lead-session-chat-flow",
            description: "Execute the approved implementation plan.",
            recommended_agent: "claude-cli",
            title: "Approved lead session chat flow",
          },
        ],
      }),
      currentPlanJson: JSON.stringify({
        notes: "Parallelize independent work only.",
        subtasks: [
          {
            branch_suffix: "lead-session-chat-flow",
            description: "Implement the Phase 04 clarification loop.",
            recommended_agent: "claude-cli",
            title: "Lead session chat flow",
          },
        ],
      }),
      planVersion: 1,
      status: TASK_STATUS.PLANNING,
    });
    const subTask = await taskRepository.createSubTask({
      agentType: "claude-cli",
      autoAssigned: false,
      branchSuffix: "lead-session-chat-flow",
      dependencyBranchSuffixes: ["setup-contract"],
      description: "Implement the approved work item.",
      status: SUBTASK_STATUS.PENDING,
      taskId: task.id,
      title: "Approved subtask",
    });
    const leadGeneratedSnapshot = await taskRepository.createPlanSnapshot({
      payload: updatedTask.currentPlanJson,
      source: PLAN_SNAPSHOT_SOURCE.LEAD_GENERATED,
      taskId: task.id,
      version: updatedTask.planVersion,
    });
    const restoredSnapshot = await taskRepository.createPlanSnapshot({
      payload: updatedTask.currentPlanJson,
      source: PLAN_SNAPSHOT_SOURCE.RESTORED_FROM_HISTORY,
      taskId: task.id,
      version: updatedTask.planVersion,
    });

    assert.equal(task.status, TASK_STATUS.DRAFT);
    assert.equal(task.baseCommitSha, "abc123def456");
    assert.equal(updatedTask.planVersion, 1);
    assert.equal(typeof updatedTask.currentPlanJson, "string");
    assert.equal(typeof updatedTask.approvedPlanJson, "string");
    assert.equal(message.role, MESSAGE_ROLE.LEAD_AGENT);
    assert.equal(attachment.taskId, task.id);
    assert.equal(session.sessionType, SESSION_TYPE.LEAD);
    assert.equal(subTask.autoAssigned, false);
    assert.deepEqual(subTask.dependencyBranchSuffixes, ["setup-contract"]);
    assert.deepEqual(
      normalizeRecord(await taskRepository.findSubTaskById(subTask.id)),
      subTask,
    );

    assert.deepEqual(
      normalizeRecord(await taskRepository.findTaskById(task.id)),
      updatedTask,
    );
    assert.deepEqual(
      (await taskRepository.listMessagesByTaskId(task.id)).map(normalizeRecord),
      [message],
    );
    assert.deepEqual(
      (await taskRepository.listAttachmentsByTaskId(task.id)).map(normalizeRecord),
      [attachment],
    );
    assert.deepEqual(
      (await taskRepository.listSessionsByTaskId(task.id)).map(normalizeRecord),
      [session],
    );
    assert.deepEqual(
      (await taskRepository.listSessionsBySubTaskId(subTask.id)).map(normalizeRecord),
      [],
    );
    assert.deepEqual(
      (await taskRepository.listSubTasksByTaskId(task.id)).map(normalizeRecord),
      [subTask],
    );
    assert.deepEqual(
      (await taskRepository.listPlanSnapshotsByTaskId(task.id)).map(normalizeRecord),
      [restoredSnapshot, leadGeneratedSnapshot],
    );
    assert.deepEqual(
      (await taskRepository.listTasksByProjectId(project.id)).map((entry) => entry.id),
      [task.id],
    );

    const updatedSubTask = await taskRepository.updateSubTask(subTask.id, {
      branchName: "eat/task-1/lead-session-chat-flow",
      retryCount: 1,
      status: SUBTASK_STATUS.RUNNING,
      worktreePath: "/tmp/eat-worktree/subtask-1",
    });
    const workerSession = await taskRepository.createSession({
      agentType: "claude-cli",
      sandboxType: "DOCKER",
      sessionType: SESSION_TYPE.WORKER,
      status: SESSION_STATUS.RUNNING,
      subTaskId: subTask.id,
      taskId: task.id,
    });
    const incrementalReview = await taskRepository.createReviewRecord({
      decision: "REWORK",
      phase: REVIEW_PHASE.INCREMENTAL,
      sessionId: workerSession.id,
      subTaskId: subTask.id,
      summary: "Retry with clearer validation handling.",
    });
    const reviewedSubTask = await taskRepository.updateSubTask(subTask.id, {
      latestReviewDecision: incrementalReview.decision,
      latestReviewPhase: incrementalReview.phase,
      latestReviewSummary: incrementalReview.summary,
    });
    const mergeAttempt = await taskRepository.createMergeRecord({
      completedAt: new Date().toISOString(),
      operation: MERGE_OPERATION.MERGE,
      resultCommitSha: "deadbeefcafe",
      sourceBranch: "eat/task-1/lead-session-chat-flow",
      status: MERGE_STATUS.SUCCEEDED,
      subTaskId: subTask.id,
      targetBranch: "main",
    });
    const rebaseAttempt = await taskRepository.createMergeRecord({
      completedAt: new Date().toISOString(),
      conflictSummary: "Conflict in src/server/app.js.",
      operation: MERGE_OPERATION.REBASE,
      sourceBranch: "eat/task-1/lead-session-chat-flow",
      status: MERGE_STATUS.CONFLICT,
      subTaskId: subTask.id,
      targetBranch: "main",
    });

    assert.equal(updatedSubTask.branchName, "eat/task-1/lead-session-chat-flow");
    assert.equal(updatedSubTask.retryCount, 1);
    assert.equal(updatedSubTask.worktreePath, "/tmp/eat-worktree/subtask-1");
    assert.equal(
      (await taskRepository.listSessionsBySubTaskId(subTask.id)).map((entry) => entry.id)[0],
      workerSession.id,
    );
    assert.equal(reviewedSubTask.latestReviewDecision, "REWORK");
    assert.equal(reviewedSubTask.latestReviewPhase, REVIEW_PHASE.INCREMENTAL);
    assert.equal(reviewedSubTask.latestReviewSummary, "Retry with clearer validation handling.");
    assert.deepEqual(
      (await taskRepository.listReviewRecordsBySubTaskId(subTask.id)).map(normalizeRecord),
      [incrementalReview],
    );
    assert.equal(mergeAttempt.attemptNumber, 1);
    assert.equal(rebaseAttempt.attemptNumber, 2);
    assert.deepEqual(
      (await taskRepository.listMergeRecordsBySubTaskId(subTask.id)).map(normalizeRecord),
      [mergeAttempt, rebaseAttempt],
    );
    assert.deepEqual(
      (await taskRepository.listMergeRecordsByTaskId(task.id)).map(normalizeRecord),
      [mergeAttempt, rebaseAttempt],
    );
  } finally {
    await fixture.dispose();
  }
});

test("supports task archiving filters and hard deletion", async () => {
  const fixture = await makeTempDir("eat-task-repo-archive-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const projectRepository = new SqliteProjectRepository({ databasePath });
    const taskRepository = new SqliteTaskRepository({ databasePath });

    const project = await projectRepository.createProject({
      defaultBranch: "main",
      name: "EAT",
      path: "/home/code/EAT",
    });

    const activeTask = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "abc123",
      description: "Visible task",
      leadAgentType: "codex-cli",
      projectId: project.id,
      title: "Visible task",
    });
    const archivedTask = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "def456",
      description: "Archived task",
      leadAgentType: "codex-cli",
      projectId: project.id,
      title: "Archived task",
    });

    const archivedAt = "2026-03-21T09:00:00.000Z";
    await taskRepository.updateTask(archivedTask.id, {
      archivedAt,
    });

    assert.deepEqual(
      (await taskRepository.listTasksByProjectId(project.id)).map((task) => task.id),
      [activeTask.id],
    );
    assert.deepEqual(
      (await taskRepository.listTasksByProjectId(project.id, { includeArchived: true })).map((task) => ({
        archivedAt: task.archivedAt,
        id: task.id,
      })),
      [
        { archivedAt, id: archivedTask.id },
        { archivedAt: null, id: activeTask.id },
      ],
    );

    const deletedTask = await taskRepository.deleteTask(archivedTask.id);

    assert.equal(deletedTask.id, archivedTask.id);
    assert.equal(await taskRepository.findTaskById(archivedTask.id), null);
  } finally {
    await fixture.dispose();
  }
});

test("persists structured mailbox contracts with refs, branch, schema, and acknowledgement state", async () => {
  const fixture = await makeTempDir("eat-task-repo-mailbox-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const projectRepository = new SqliteProjectRepository({ databasePath });
    const taskRepository = new SqliteTaskRepository({ databasePath });

    const project = await projectRepository.createProject({
      defaultBranch: "main",
      name: "EAT",
      path: "/home/code/EAT",
    });
    const task = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "abc123def456",
      description: "Persist structured mailbox contracts.",
      leadAgentType: "codex-cli",
      projectId: project.id,
      title: "Structured mailbox",
    });
    const architect = await taskRepository.createSubTask({
      agentType: "codex-cli",
      branchName: `eat/${task.id}/architect`,
      branchSuffix: "architect",
      description: "Define API contracts.",
      status: SUBTASK_STATUS.ACCEPTED,
      taskId: task.id,
      title: "Architect",
    });
    const backend = await taskRepository.createSubTask({
      agentType: "codex-cli",
      branchName: `eat/${task.id}/backend`,
      branchSuffix: "backend",
      description: "Implement backend.",
      status: SUBTASK_STATUS.BLOCKED,
      taskId: task.id,
      title: "Backend",
    });

    const mailboxMessage = await taskRepository.createMailboxMessage({
      artifactRefs: ["contract:auth-api", "session:session_123"],
      branchRef: architect.branchName,
      content: "Keep the JWT payload stable and reuse POST /api/auth/login.",
      fileRefs: ["docs/contracts/auth-api.md", "src/server/auth.js"],
      messageType: MAILBOX_MESSAGE_TYPE.API_CONTRACT,
      requiresAck: true,
      schemaJson: {
        request: { body: { email: "string", password: "string" } },
        response: { body: { token: "string" } },
      },
      senderSubTaskId: architect.id,
      senderType: MAILBOX_PARTICIPANT_TYPE.SUBTASK,
      targetSubTaskId: backend.id,
      targetType: MAILBOX_TARGET_TYPE.SUBTASK,
      taskId: task.id,
    });

    assert.equal(mailboxMessage.messageType, MAILBOX_MESSAGE_TYPE.API_CONTRACT);
    assert.deepEqual(mailboxMessage.artifactRefs, ["contract:auth-api", "session:session_123"]);
    assert.deepEqual(mailboxMessage.fileRefs, ["docs/contracts/auth-api.md", "src/server/auth.js"]);
    assert.equal(mailboxMessage.branchRef, architect.branchName);
    assert.equal(mailboxMessage.requiresAck, true);
    assert.deepEqual(mailboxMessage.schemaJson, {
      request: { body: { email: "string", password: "string" } },
      response: { body: { token: "string" } },
    });

    assert.deepEqual(
      (await taskRepository.listMailboxMessagesByTaskId(task.id)).map(normalizeRecord),
      [mailboxMessage],
    );
    assert.deepEqual(
      (await taskRepository.listMailboxMessagesByTargetSubTaskId(backend.id)).map(normalizeRecord),
      [mailboxMessage],
    );
  } finally {
    await fixture.dispose();
  }
});

test("persists integration runs, queue items, and gate results", async () => {
  const fixture = await makeTempDir("eat-task-repo-integration-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const projectRepository = new SqliteProjectRepository({ databasePath });
    const taskRepository = new SqliteTaskRepository({ databasePath });

    const project = await projectRepository.createProject({
      defaultBranch: "main",
      name: "EAT",
      path: "/home/code/EAT",
    });
    const task = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "abc123def456",
      description: "Persist integration lifecycle records.",
      leadAgentType: "codex-cli",
      projectId: project.id,
      status: TASK_STATUS.MERGING,
      title: "Integration lifecycle",
    });
    const subTask = await taskRepository.createSubTask({
      agentType: "codex-cli",
      branchName: `eat/${task.id}/backend`,
      branchSuffix: "backend",
      description: "Implement backend.",
      status: SUBTASK_STATUS.ACCEPTED,
      taskId: task.id,
      title: "Backend",
    });

    const integrationRun = await taskRepository.createIntegrationRun({
      integrationBranch: `eat/${task.id}/integration-1`,
      startedAt: new Date().toISOString(),
      status: INTEGRATION_RUN_STATUS.RUNNING,
      taskId: task.id,
    });
    const queueItem = await taskRepository.createIntegrationQueueItem({
      integrationRunId: integrationRun.id,
      queueOrder: 1,
      status: INTEGRATION_QUEUE_ITEM_STATUS.QUEUED,
      subTaskId: subTask.id,
    });
    const gateResult = await taskRepository.createGateResult({
      detailsJson: { failedTests: 2 },
      gateType: "TEST",
      integrationRunId: integrationRun.id,
      status: GATE_RESULT_STATUS.FAILED,
      summary: "2 integration tests failed.",
    });

    const updatedRun = await taskRepository.updateIntegrationRun(integrationRun.id, {
      status: INTEGRATION_RUN_STATUS.ACTION_REQUIRED,
    });
    const updatedQueueItem = await taskRepository.updateIntegrationQueueItem(queueItem.id, {
      status: INTEGRATION_QUEUE_ITEM_STATUS.FAILED,
    });

    assert.equal(updatedRun.status, INTEGRATION_RUN_STATUS.ACTION_REQUIRED);
    assert.equal(updatedQueueItem.status, INTEGRATION_QUEUE_ITEM_STATUS.FAILED);
    assert.deepEqual(
      normalizeRecord(await taskRepository.findIntegrationRunById(integrationRun.id)),
      updatedRun,
    );
    assert.deepEqual(
      normalizeRecord(await taskRepository.findLatestIntegrationRunByTaskId(task.id)),
      updatedRun,
    );
    assert.deepEqual(
      (await taskRepository.listIntegrationRunsByTaskId(task.id)).map(normalizeRecord),
      [updatedRun],
    );
    assert.deepEqual(
      (await taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRun.id)).map(normalizeRecord),
      [updatedQueueItem],
    );
    assert.deepEqual(
      (await taskRepository.listGateResultsByIntegrationRunId(integrationRun.id)).map(normalizeRecord),
      [gateResult],
    );
    assert.deepEqual((await taskRepository.listIntegrationRuns()).map(normalizeRecord), [updatedRun]);
    assert.deepEqual((await taskRepository.listIntegrationQueueItems()).map(normalizeRecord), [updatedQueueItem]);
    assert.deepEqual((await taskRepository.listGateResults()).map(normalizeRecord), [gateResult]);
  } finally {
    await fixture.dispose();
  }
});

async function makeTempDir(prefix) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDir,
    async dispose() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

function normalizeRecord(record) {
  return record ? { ...record } : record;
}

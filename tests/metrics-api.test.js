import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { createApp } from "../src/server/app.js";
import { SqliteProjectRepository } from "../src/repositories/project-repository.js";
import {
  MERGE_OPERATION,
  MERGE_STATUS,
  PLAN_SNAPSHOT_SOURCE,
  REVIEW_PHASE,
  SESSION_STATUS,
  SESSION_TYPE,
  SqliteTaskRepository,
  SUBTASK_STATUS,
  TASK_STATUS,
} from "../src/repositories/task-repository.js";

test("reports derived summary metrics and exports task-level counters from persisted local data", async () => {
  const fixture = await makeTempDir("eat-metrics-api-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    await seedMetricsDataset(databasePath);

    const server = createApp({
      repositoryOptions: { databasePath },
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const summaryResponse = await requestJson(server, "/api/metrics/summary");
      assert.equal(summaryResponse.status, 200);
      assert.equal(summaryResponse.body.summary.tasksEnteredExecuting, 2);
      assert.equal(summaryResponse.body.summary.tasksCompleted, 1);
      assert.equal(summaryResponse.body.summary.completionRateAfterPlanApproval, 0.5);
      assert.equal(summaryResponse.body.summary.workerCrashDetectionRate, 1);
      assert.equal(summaryResponse.body.summary.mergeConflictCount, 1);
      assert.equal(summaryResponse.body.summary.rebaseRetryCount, 1);
      assert.equal(summaryResponse.body.summary.cleanupWarningCount, 1);
      assert.equal(summaryResponse.body.summary.sandboxLaunchFailureCount, 1);
      assert.equal(summaryResponse.body.summary.retryToReviewConversionRate, 1);
      assert.equal(summaryResponse.body.summary.earlyReworkAdoptionRate, 1);
      assert.equal(summaryResponse.body.summary.mergeConflictSurfacingAccuracy, 1);
      assert.equal(summaryResponse.body.summary.medianPlanApprovalToFirstWorkerOutputMs, 6000);
      assert.equal(summaryResponse.body.summary.unavailableMetrics.length, 1);
      assert.equal(summaryResponse.body.summary.unavailableMetrics[0].metric, "routingCorrectness");

      const exportResponse = await requestJson(server, "/api/metrics/export");
      assert.equal(exportResponse.status, 200);
      assert.match(exportResponse.body.generatedAt, /\d{4}-\d{2}-\d{2}T/);
      assert.equal(exportResponse.body.tasks.length, 2);

      const completedTask = exportResponse.body.tasks.find((task) => task.status === "COMPLETED");
      const actionRequiredTask = exportResponse.body.tasks.find((task) => task.status === "ACTION_REQUIRED");

      assert.ok(completedTask);
      assert.equal(completedTask.retryCount, 1);
      assert.equal(completedTask.mergeConflictCount, 1);
      assert.equal(completedTask.rebaseRetryCount, 1);
      assert.equal(completedTask.cleanupWarningCount, 1);
      assert.equal(completedTask.sandboxLaunchFailureCount, 0);
      assert.equal(completedTask.failedWorkerSessionCount, 0);

      assert.ok(actionRequiredTask);
      assert.equal(actionRequiredTask.mergeConflictCount, 0);
      assert.equal(actionRequiredTask.cleanupWarningCount, 0);
      assert.equal(actionRequiredTask.sandboxLaunchFailureCount, 1);
      assert.equal(actionRequiredTask.failedWorkerSessionCount, 1);
      assert.ok(actionRequiredTask.firstWorkerOutputAt);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  } finally {
    await fixture.dispose();
  }
});

async function seedMetricsDataset(databasePath) {
  const projectRepository = new SqliteProjectRepository({ databasePath });
  const taskRepository = new SqliteTaskRepository({ databasePath });

  try {
    const project = await projectRepository.createProject({
      defaultBranch: "main",
      name: "Metrics Project",
      path: "/tmp/metrics-project",
    });

    const completedTask = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "aaa111",
      description: "Completed metrics task.",
      leadAgentType: "healthy-lead",
      projectId: project.id,
      title: "Completed metrics task",
    });
    const actionRequiredTask = await taskRepository.createTask({
      baseBranch: "main",
      baseCommitSha: "bbb222",
      description: "Action required metrics task.",
      leadAgentType: "healthy-lead",
      projectId: project.id,
      title: "Action required metrics task",
    });

    const completedTaskApprovedAt = "2026-03-19T10:00:00.000Z";
    const actionRequiredApprovedAt = "2026-03-19T11:00:00.000Z";

    await taskRepository.updateTask(completedTask.id, {
      approvedPlanJson: JSON.stringify({}),
      currentPlanJson: JSON.stringify({}),
      status: TASK_STATUS.COMPLETED,
      updatedAt: "2026-03-19T10:30:00.000Z",
    });
    await taskRepository.updateTask(actionRequiredTask.id, {
      approvedPlanJson: JSON.stringify({}),
      currentPlanJson: JSON.stringify({}),
      status: TASK_STATUS.ACTION_REQUIRED,
      updatedAt: "2026-03-19T11:30:00.000Z",
    });

    await taskRepository.createPlanSnapshot({
      createdAt: completedTaskApprovedAt,
      payload: JSON.stringify({}),
      source: PLAN_SNAPSHOT_SOURCE.APPROVED,
      taskId: completedTask.id,
      version: 1,
    });
    await taskRepository.createPlanSnapshot({
      createdAt: actionRequiredApprovedAt,
      payload: JSON.stringify({}),
      source: PLAN_SNAPSHOT_SOURCE.APPROVED,
      taskId: actionRequiredTask.id,
      version: 1,
    });

    const completedSubTask = await taskRepository.createSubTask({
      agentType: "worker-agent",
      branchSuffix: "completed-metrics",
      createdAt: "2026-03-19T10:00:01.000Z",
      description: "Completed subtask.",
      retryCount: 1,
      status: SUBTASK_STATUS.MERGED,
      taskId: completedTask.id,
      title: "Completed subtask",
      updatedAt: "2026-03-19T10:30:00.000Z",
    });
    const actionRequiredSubTask = await taskRepository.createSubTask({
      agentType: "worker-agent",
      branchSuffix: "action-required-metrics",
      createdAt: "2026-03-19T11:00:01.000Z",
      description: "Action required subtask.",
      status: SUBTASK_STATUS.FAILED,
      taskId: actionRequiredTask.id,
      title: "Action required subtask",
      updatedAt: "2026-03-19T11:10:00.000Z",
    });

    const firstWorkerSession = await taskRepository.createSession({
      agentType: "worker-agent",
      createdAt: "2026-03-19T10:00:02.000Z",
      endedAt: "2026-03-19T10:00:30.000Z",
      exitCode: 0,
      firstOutputAt: "2026-03-19T10:00:04.000Z",
      outputBuffer: "first output\n",
      sandboxType: "DOCKER",
      sessionType: SESSION_TYPE.WORKER,
      startedAt: "2026-03-19T10:00:03.000Z",
      status: SESSION_STATUS.COMPLETED,
      subTaskId: completedSubTask.id,
      taskId: completedTask.id,
    });
    const retryWorkerSession = await taskRepository.createSession({
      agentType: "worker-agent",
      createdAt: "2026-03-19T10:05:02.000Z",
      endedAt: "2026-03-19T10:05:30.000Z",
      exitCode: 0,
      firstOutputAt: "2026-03-19T10:05:05.000Z",
      outputBuffer: "retry output\n",
      sandboxType: "DOCKER",
      sessionType: SESSION_TYPE.WORKER,
      startedAt: "2026-03-19T10:05:03.000Z",
      status: SESSION_STATUS.COMPLETED,
      subTaskId: completedSubTask.id,
      taskId: completedTask.id,
    });
    await taskRepository.createSession({
      agentType: "worker-agent",
      createdAt: "2026-03-19T11:00:02.000Z",
      endedAt: "2026-03-19T11:00:40.000Z",
      exitCode: 2,
      firstOutputAt: "2026-03-19T11:00:08.000Z",
      outputBuffer: "crash output\n",
      sandboxType: "DOCKER",
      sessionType: SESSION_TYPE.WORKER,
      startedAt: "2026-03-19T11:00:03.000Z",
      status: SESSION_STATUS.FAILED,
      subTaskId: actionRequiredSubTask.id,
      taskId: actionRequiredTask.id,
    });

    await taskRepository.createReviewRecord({
      createdAt: "2026-03-19T10:01:00.000Z",
      decision: "REWORK",
      phase: REVIEW_PHASE.INCREMENTAL,
      sessionId: firstWorkerSession.id,
      subTaskId: completedSubTask.id,
      summary: "Needs rework.",
    });
    await taskRepository.createReviewRecord({
      createdAt: "2026-03-19T10:06:00.000Z",
      decision: "ACCEPTED",
      phase: REVIEW_PHASE.INCREMENTAL,
      sessionId: retryWorkerSession.id,
      subTaskId: completedSubTask.id,
      summary: "Accepted after retry.",
    });

    await taskRepository.createMergeRecord({
      completedAt: "2026-03-19T10:10:00.000Z",
      conflictSummary: "Conflict in package.json",
      createdAt: "2026-03-19T10:10:00.000Z",
      operation: MERGE_OPERATION.MERGE,
      sourceBranch: "eat/task/completed",
      status: MERGE_STATUS.CONFLICT,
      subTaskId: completedSubTask.id,
      targetBranch: "main",
      updatedAt: "2026-03-19T10:10:00.000Z",
    });
    await taskRepository.createMergeRecord({
      completedAt: "2026-03-19T10:15:00.000Z",
      createdAt: "2026-03-19T10:15:00.000Z",
      operation: MERGE_OPERATION.REBASE,
      resultCommitSha: "ccc333",
      sourceBranch: "eat/task/completed",
      status: MERGE_STATUS.SUCCEEDED,
      subTaskId: completedSubTask.id,
      targetBranch: "main",
      updatedAt: "2026-03-19T10:15:00.000Z",
    });
    await taskRepository.createMergeRecord({
      completedAt: "2026-03-19T10:20:00.000Z",
      createdAt: "2026-03-19T10:20:00.000Z",
      operation: MERGE_OPERATION.MERGE,
      resultCommitSha: "ddd444",
      sourceBranch: "eat/task/completed",
      status: MERGE_STATUS.SUCCEEDED,
      subTaskId: completedSubTask.id,
      targetBranch: "main",
      updatedAt: "2026-03-19T10:20:00.000Z",
    });

    await taskRepository.createMessage({
      content: 'Cleanup warning: {"reason":"Directory is locked by another process.","worktreePath":"/tmp/eat/task/completed"}',
      role: "SYSTEM",
      taskId: completedTask.id,
    });
    await taskRepository.createMessage({
      content: `Launch failure: {"kind":"SANDBOX_LAUNCH_FAILURE","reason":"Assigned worker agent does not support DOCKER sandboxing.","subTaskId":"${actionRequiredSubTask.id}"}`,
      role: "SYSTEM",
      subTaskId: actionRequiredSubTask.id,
      taskId: actionRequiredTask.id,
    });
  } finally {
    projectRepository.close();
    taskRepository.close();
  }
}

async function makeTempDir(prefix) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDir,
    async dispose() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

async function requestJson(server, routePath) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

  return {
    body: await response.json(),
    status: response.status,
  };
}

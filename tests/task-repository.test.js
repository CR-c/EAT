import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
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

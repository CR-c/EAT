import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  MESSAGE_ROLE,
  SESSION_STATUS,
  SESSION_TYPE,
  SqliteTaskRepository,
  TASK_STATUS,
} from "../src/repositories/task-repository.js";
import { SqliteProjectRepository } from "../src/repositories/project-repository.js";

test("persists phase 04 task, message, attachment, and lead session records", async () => {
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

    assert.equal(task.status, TASK_STATUS.DRAFT);
    assert.equal(task.baseCommitSha, "abc123def456");
    assert.equal(message.role, MESSAGE_ROLE.LEAD_AGENT);
    assert.equal(attachment.taskId, task.id);
    assert.equal(session.sessionType, SESSION_TYPE.LEAD);

    assert.deepEqual(
      normalizeRecord(await taskRepository.findTaskById(task.id)),
      task,
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
      (await taskRepository.listTasksByProjectId(project.id)).map((entry) => entry.id),
      [task.id],
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

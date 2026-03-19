import { randomUUID } from "node:crypto";

import { createDatabaseConnection, DEFAULT_DATABASE_PATH } from "./database.js";

export const TASK_STATUS = Object.freeze({
  ACTION_REQUIRED: "ACTION_REQUIRED",
  CANCELLED: "CANCELLED",
  CLARIFYING: "CLARIFYING",
  COMPLETED: "COMPLETED",
  DRAFT: "DRAFT",
  EXECUTING: "EXECUTING",
  FAILED: "FAILED",
  MERGING: "MERGING",
  PLANNING: "PLANNING",
  PLAN_REVIEW: "PLAN_REVIEW",
  REVIEWING: "REVIEWING",
});

export const MESSAGE_ROLE = Object.freeze({
  LEAD_AGENT: "LEAD_AGENT",
  SYSTEM: "SYSTEM",
  USER: "USER",
});

export const SESSION_STATUS = Object.freeze({
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  STARTING: "STARTING",
  STOPPING: "STOPPING",
});

export const SESSION_TYPE = Object.freeze({
  LEAD: "LEAD",
  WORKER: "WORKER",
});

export const PLAN_SNAPSHOT_SOURCE = Object.freeze({
  APPROVED: "APPROVED",
  LEAD_GENERATED: "LEAD_GENERATED",
  RESTORED_FROM_HISTORY: "RESTORED_FROM_HISTORY",
});

export const SUBTASK_STATUS = Object.freeze({
  ACCEPTED: "ACCEPTED",
  CANCELLED: "CANCELLED",
  DISCARDED: "DISCARDED",
  DISCARD_PENDING: "DISCARD_PENDING",
  FAILED: "FAILED",
  MERGED: "MERGED",
  PENDING: "PENDING",
  READY: "READY",
  REVIEW_PENDING: "REVIEW_PENDING",
  REWORK_REQUIRED: "REWORK_REQUIRED",
  RUNNING: "RUNNING",
});

export class SqliteTaskRepository {
  constructor(options = {}) {
    this.databasePath = options.databasePath ?? DEFAULT_DATABASE_PATH;
    this.database = options.database ?? null;
  }

  async createTask(input) {
    const timestamp = new Date().toISOString();
    const task = {
      approvedPlanJson: null,
      baseBranch: input.baseBranch,
      baseCommitSha: input.baseCommitSha,
      createdAt: timestamp,
      currentPlanJson: null,
      description: input.description,
      id: input.id ?? randomUUID(),
      lastError: null,
      leadAgentType: input.leadAgentType,
      planVersion: 0,
      projectId: input.projectId,
      status: input.status ?? TASK_STATUS.DRAFT,
      title: input.title,
      updatedAt: timestamp,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO tasks (
          id,
          project_id,
          title,
          description,
          lead_agent_type,
          base_branch,
          base_commit_sha,
          status,
          plan_version,
          current_plan_json,
          approved_plan_json,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        task.id,
        task.projectId,
        task.title,
        task.description,
        task.leadAgentType,
        task.baseBranch,
        task.baseCommitSha,
        task.status,
        task.planVersion,
        task.currentPlanJson,
        task.approvedPlanJson,
        task.lastError,
        task.createdAt,
        task.updatedAt,
      );

    return task;
  }

  async findTaskById(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          project_id AS projectId,
          title,
          description,
          lead_agent_type AS leadAgentType,
          base_branch AS baseBranch,
          base_commit_sha AS baseCommitSha,
          status,
          plan_version AS planVersion,
          current_plan_json AS currentPlanJson,
          approved_plan_json AS approvedPlanJson,
          last_error AS lastError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM tasks
        WHERE id = ?
      `)
      .get(taskId) ?? null;
  }

  async updateTask(taskId, updates) {
    const existingTask = await this.findTaskById(taskId);

    if (!existingTask) {
      return null;
    }

    const nextTask = {
      ...existingTask,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };

    this.#getDatabase()
      .prepare(`
        UPDATE tasks
        SET
          title = ?,
          description = ?,
          lead_agent_type = ?,
          base_branch = ?,
          base_commit_sha = ?,
          status = ?,
          plan_version = ?,
          current_plan_json = ?,
          approved_plan_json = ?,
          last_error = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextTask.title,
        nextTask.description,
        nextTask.leadAgentType,
        nextTask.baseBranch,
        nextTask.baseCommitSha,
        nextTask.status,
        nextTask.planVersion,
        nextTask.currentPlanJson,
        nextTask.approvedPlanJson,
        nextTask.lastError,
        nextTask.updatedAt,
        taskId,
      );

    return nextTask;
  }

  async listTasksByProjectId(projectId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          project_id AS projectId,
          title,
          description,
          lead_agent_type AS leadAgentType,
          base_branch AS baseBranch,
          base_commit_sha AS baseCommitSha,
          status,
          plan_version AS planVersion,
          current_plan_json AS currentPlanJson,
          approved_plan_json AS approvedPlanJson,
          last_error AS lastError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM tasks
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC
      `)
      .all(projectId);
  }

  async createMessage(input) {
    const message = {
      content: input.content,
      createdAt: input.createdAt ?? new Date().toISOString(),
      id: input.id ?? randomUUID(),
      role: input.role,
      subTaskId: input.subTaskId ?? null,
      taskId: input.taskId,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO messages (
          id,
          task_id,
          sub_task_id,
          role,
          content,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        message.id,
        message.taskId,
        message.subTaskId,
        message.role,
        message.content,
        message.createdAt,
      );

    return message;
  }

  async listMessagesByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sub_task_id AS subTaskId,
          role,
          content,
          created_at AS createdAt
        FROM messages
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(taskId);
  }

  async createAttachment(input) {
    const attachment = {
      createdAt: input.createdAt ?? new Date().toISOString(),
      fileName: input.fileName,
      filePath: input.filePath,
      fileType: input.fileType,
      id: input.id ?? randomUUID(),
      mimeType: input.mimeType,
      size: input.size,
      taskId: input.taskId,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO attachments (
          id,
          task_id,
          file_name,
          file_path,
          file_type,
          mime_type,
          size,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        attachment.id,
        attachment.taskId,
        attachment.fileName,
        attachment.filePath,
        attachment.fileType,
        attachment.mimeType,
        attachment.size,
        attachment.createdAt,
      );

    return attachment;
  }

  async listAttachmentsByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          file_name AS fileName,
          file_path AS filePath,
          file_type AS fileType,
          mime_type AS mimeType,
          size,
          created_at AS createdAt
        FROM attachments
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(taskId);
  }

  async createSession(input) {
    const timestamp = new Date().toISOString();
    const session = {
      agentType: input.agentType,
      containerId: input.containerId ?? null,
      createdAt: timestamp,
      endedAt: input.endedAt ?? null,
      exitCode: input.exitCode ?? null,
      id: input.id ?? randomUUID(),
      logPath: input.logPath ?? null,
      outputBuffer: input.outputBuffer ?? "",
      outputBufferMaxBytes: input.outputBufferMaxBytes ?? 65_536,
      pid: input.pid ?? null,
      sandboxType: input.sandboxType,
      sessionType: input.sessionType,
      startedAt: input.startedAt ?? null,
      status: input.status ?? SESSION_STATUS.PENDING,
      subTaskId: input.subTaskId ?? null,
      taskId: input.taskId,
      updatedAt: timestamp,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO agent_sessions (
          id,
          task_id,
          sub_task_id,
          agent_type,
          session_type,
          sandbox_type,
          container_id,
          status,
          pid,
          started_at,
          ended_at,
          exit_code,
          log_path,
          output_buffer,
          output_buffer_max_bytes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.taskId,
        session.subTaskId,
        session.agentType,
        session.sessionType,
        session.sandboxType,
        session.containerId,
        session.status,
        session.pid,
        session.startedAt,
        session.endedAt,
        session.exitCode,
        session.logPath,
        session.outputBuffer,
        session.outputBufferMaxBytes,
        session.createdAt,
        session.updatedAt,
      );

    return session;
  }

  async findSessionById(sessionId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sub_task_id AS subTaskId,
          agent_type AS agentType,
          session_type AS sessionType,
          sandbox_type AS sandboxType,
          container_id AS containerId,
          status,
          pid,
          started_at AS startedAt,
          ended_at AS endedAt,
          exit_code AS exitCode,
          log_path AS logPath,
          output_buffer AS outputBuffer,
          output_buffer_max_bytes AS outputBufferMaxBytes,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM agent_sessions
        WHERE id = ?
      `)
      .get(sessionId) ?? null;
  }

  async updateSession(sessionId, updates) {
    const existingSession = await this.findSessionById(sessionId);

    if (!existingSession) {
      return null;
    }

    const nextSession = {
      ...existingSession,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };

    this.#getDatabase()
      .prepare(`
        UPDATE agent_sessions
        SET
          agent_type = ?,
          session_type = ?,
          sandbox_type = ?,
          container_id = ?,
          status = ?,
          pid = ?,
          started_at = ?,
          ended_at = ?,
          exit_code = ?,
          log_path = ?,
          output_buffer = ?,
          output_buffer_max_bytes = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextSession.agentType,
        nextSession.sessionType,
        nextSession.sandboxType,
        nextSession.containerId,
        nextSession.status,
        nextSession.pid,
        nextSession.startedAt,
        nextSession.endedAt,
        nextSession.exitCode,
        nextSession.logPath,
        nextSession.outputBuffer,
        nextSession.outputBufferMaxBytes,
        nextSession.updatedAt,
        sessionId,
      );

    return nextSession;
  }

  async appendSessionOutput(sessionId, chunk) {
    const existingSession = await this.findSessionById(sessionId);

    if (!existingSession) {
      return null;
    }

    const appendedOutput = `${existingSession.outputBuffer ?? ""}${chunk}`;
    const maxBytes = existingSession.outputBufferMaxBytes ?? 65_536;
    const boundedOutput = Buffer.from(appendedOutput, "utf8").subarray(-maxBytes).toString("utf8");

    return this.updateSession(sessionId, {
      outputBuffer: boundedOutput,
    });
  }

  async listSessionsByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sub_task_id AS subTaskId,
          agent_type AS agentType,
          session_type AS sessionType,
          sandbox_type AS sandboxType,
          container_id AS containerId,
          status,
          pid,
          started_at AS startedAt,
          ended_at AS endedAt,
          exit_code AS exitCode,
          log_path AS logPath,
          output_buffer AS outputBuffer,
          output_buffer_max_bytes AS outputBufferMaxBytes,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM agent_sessions
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(taskId);
  }

  async createPlanSnapshot(input) {
    const snapshot = {
      createdAt: input.createdAt ?? new Date().toISOString(),
      id: input.id ?? randomUUID(),
      payload: input.payload,
      source: input.source,
      taskId: input.taskId,
      version: input.version,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO plan_snapshots (
          id,
          task_id,
          version,
          source,
          payload,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        snapshot.id,
        snapshot.taskId,
        snapshot.version,
        snapshot.source,
        snapshot.payload,
        snapshot.createdAt,
      );

    return snapshot;
  }

  async findPlanSnapshotById(snapshotId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          version,
          source,
          payload,
          created_at AS createdAt
        FROM plan_snapshots
        WHERE id = ?
      `)
      .get(snapshotId) ?? null;
  }

  async listPlanSnapshotsByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          version,
          source,
          payload,
          created_at AS createdAt
        FROM plan_snapshots
        WHERE task_id = ?
        ORDER BY created_at DESC, id DESC
      `)
      .all(taskId);
  }

  async createSubTask(input) {
    const timestamp = new Date().toISOString();
    const subTask = {
      agentType: input.agentType,
      autoAssigned: input.autoAssigned ?? true,
      branchName: input.branchName ?? null,
      branchSuffix: input.branchSuffix,
      createdAt: timestamp,
      description: input.description,
      id: input.id ?? randomUUID(),
      lastError: input.lastError ?? null,
      retryCount: input.retryCount ?? 0,
      status: input.status ?? SUBTASK_STATUS.PENDING,
      taskId: input.taskId,
      title: input.title,
      updatedAt: timestamp,
      worktreePath: input.worktreePath ?? null,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO sub_tasks (
          id,
          task_id,
          title,
          description,
          branch_suffix,
          branch_name,
          worktree_path,
          agent_type,
          status,
          auto_assigned,
          retry_count,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        subTask.id,
        subTask.taskId,
        subTask.title,
        subTask.description,
        subTask.branchSuffix,
        subTask.branchName,
        subTask.worktreePath,
        subTask.agentType,
        subTask.status,
        subTask.autoAssigned ? 1 : 0,
        subTask.retryCount,
        subTask.lastError,
        subTask.createdAt,
        subTask.updatedAt,
      );

    return subTask;
  }

  async listSubTasksByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          title,
          description,
          branch_suffix AS branchSuffix,
          branch_name AS branchName,
          worktree_path AS worktreePath,
          agent_type AS agentType,
          status,
          auto_assigned AS autoAssigned,
          retry_count AS retryCount,
          last_error AS lastError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sub_tasks
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(taskId)
      .map((subTask) => ({
        ...subTask,
        autoAssigned: Boolean(subTask.autoAssigned),
      }));
  }

  close() {
    if (this.database && typeof this.database.close === "function") {
      this.database.close();
      this.database = null;
    }
  }

  #getDatabase() {
    if (!this.database) {
      this.database = createDatabaseConnection(this.databasePath);
    }

    return this.database;
  }
}

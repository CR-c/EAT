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

export const MAILBOX_PARTICIPANT_TYPE = Object.freeze({
  LEAD: "LEAD",
  SUBTASK: "SUBTASK",
  SYSTEM: "SYSTEM",
});

export const MAILBOX_TARGET_TYPE = Object.freeze({
  LEAD: "LEAD",
  SUBTASK: "SUBTASK",
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

export const REVIEW_PHASE = Object.freeze({
  FINAL: "FINAL",
  INCREMENTAL: "INCREMENTAL",
});

export const MERGE_OPERATION = Object.freeze({
  MERGE: "MERGE",
  REBASE: "REBASE",
});

export const MERGE_STATUS = Object.freeze({
  ABORTED: "ABORTED",
  CONFLICT: "CONFLICT",
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
});

export const SUBTASK_STATUS = Object.freeze({
  ACCEPTED: "ACCEPTED",
  BLOCKED: "BLOCKED",
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

export const SUBTASK_ASSIGNMENT_SOURCE = Object.freeze({
  LEAD: "LEAD",
  OPERATOR: "OPERATOR",
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

  async createMailboxMessage(input) {
    const mailboxMessage = {
      content: input.content,
      createdAt: input.createdAt ?? new Date().toISOString(),
      id: input.id ?? randomUUID(),
      senderSubTaskId: input.senderSubTaskId ?? null,
      senderType: input.senderType,
      targetSubTaskId: input.targetSubTaskId ?? null,
      targetType: input.targetType,
      taskId: input.taskId,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO mailbox_messages (
          id,
          task_id,
          sender_type,
          sender_sub_task_id,
          target_type,
          target_sub_task_id,
          content,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        mailboxMessage.id,
        mailboxMessage.taskId,
        mailboxMessage.senderType,
        mailboxMessage.senderSubTaskId,
        mailboxMessage.targetType,
        mailboxMessage.targetSubTaskId,
        mailboxMessage.content,
        mailboxMessage.createdAt,
      );

    return mailboxMessage;
  }

  async listMailboxMessagesByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sender_type AS senderType,
          sender_sub_task_id AS senderSubTaskId,
          target_type AS targetType,
          target_sub_task_id AS targetSubTaskId,
          content,
          created_at AS createdAt
        FROM mailbox_messages
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(taskId);
  }

  async listMailboxMessagesByTargetSubTaskId(targetSubTaskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sender_type AS senderType,
          sender_sub_task_id AS senderSubTaskId,
          target_type AS targetType,
          target_sub_task_id AS targetSubTaskId,
          content,
          created_at AS createdAt
        FROM mailbox_messages
        WHERE target_sub_task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(targetSubTaskId);
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
    const timestamp = input.createdAt ?? new Date().toISOString();
    const session = {
      agentType: input.agentType,
      containerId: input.containerId ?? null,
      createdAt: timestamp,
      endedAt: input.endedAt ?? null,
      exitCode: input.exitCode ?? null,
      firstOutputAt: input.firstOutputAt ?? null,
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
      updatedAt: input.updatedAt ?? timestamp,
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
          first_output_at,
          output_buffer,
          output_buffer_max_bytes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        session.firstOutputAt,
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
          first_output_at AS firstOutputAt,
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
          first_output_at = ?,
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
        nextSession.firstOutputAt,
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
      firstOutputAt: existingSession.firstOutputAt ?? new Date().toISOString(),
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
          first_output_at AS firstOutputAt,
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

  async listPlanSnapshots() {
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
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async createSubTask(input) {
    const timestamp = input.createdAt ?? new Date().toISOString();
    const autoAssigned = input.autoAssigned ?? true;
    const subTask = {
      agentType: input.agentType,
      assignmentSource: input.assignmentSource
        ?? (autoAssigned ? SUBTASK_ASSIGNMENT_SOURCE.LEAD : SUBTASK_ASSIGNMENT_SOURCE.OPERATOR),
      autoAssigned,
      branchName: input.branchName ?? null,
      branchSuffix: input.branchSuffix,
      createdAt: timestamp,
      dependencyBranchSuffixes: normalizeStringArray(input.dependencyBranchSuffixes),
      displayName: normalizeOptionalString(input.displayName) ?? normalizeOptionalString(input.title),
      description: input.description,
      executionOrder: normalizeOptionalInteger(input.executionOrder),
      id: input.id ?? randomUUID(),
      lastError: input.lastError ?? null,
      latestReviewDecision: input.latestReviewDecision ?? null,
      latestReviewPhase: input.latestReviewPhase ?? null,
      latestReviewSummary: input.latestReviewSummary ?? null,
      role: normalizeOptionalString(input.role) ?? inferSubTaskRole(input.branchSuffix, input.title),
      retryCount: input.retryCount ?? 0,
      runSummary: normalizeOptionalString(input.runSummary),
      status: input.status ?? SUBTASK_STATUS.PENDING,
      taskId: input.taskId,
      title: input.title,
      updatedAt: input.updatedAt ?? timestamp,
      worktreePath: input.worktreePath ?? null,
    };
    subTask.runSummary = subTask.runSummary ?? buildSubTaskRunSummary(subTask);

    this.#getDatabase()
      .prepare(`
        INSERT INTO sub_tasks (
          id,
          task_id,
          title,
          description,
          branch_suffix,
          dependency_branch_suffixes_json,
          branch_name,
          worktree_path,
          agent_type,
          status,
          auto_assigned,
          retry_count,
          last_error,
          latest_review_decision,
          latest_review_phase,
          latest_review_summary,
          role,
          display_name,
          execution_order,
          assignment_source,
          run_summary,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        subTask.id,
        subTask.taskId,
        subTask.title,
        subTask.description,
        subTask.branchSuffix,
        JSON.stringify(subTask.dependencyBranchSuffixes),
        subTask.branchName,
        subTask.worktreePath,
        subTask.agentType,
        subTask.status,
        subTask.autoAssigned ? 1 : 0,
        subTask.retryCount,
        subTask.lastError,
        subTask.latestReviewDecision,
        subTask.latestReviewPhase,
        subTask.latestReviewSummary,
        subTask.role,
        subTask.displayName,
        subTask.executionOrder,
        subTask.assignmentSource,
        subTask.runSummary,
        subTask.createdAt,
        subTask.updatedAt,
      );

    return subTask;
  }

  async findSubTaskById(subTaskId) {
    const subTask = this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          title,
          description,
          branch_suffix AS branchSuffix,
          dependency_branch_suffixes_json AS dependencyBranchSuffixesJson,
          branch_name AS branchName,
          worktree_path AS worktreePath,
          agent_type AS agentType,
          status,
          auto_assigned AS autoAssigned,
          retry_count AS retryCount,
          last_error AS lastError,
          latest_review_decision AS latestReviewDecision,
          latest_review_phase AS latestReviewPhase,
          latest_review_summary AS latestReviewSummary,
          role,
          display_name AS displayName,
          execution_order AS executionOrder,
          assignment_source AS assignmentSource,
          run_summary AS runSummary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sub_tasks
        WHERE id = ?
      `)
      .get(subTaskId);

    if (!subTask) {
      return null;
    }

    const { dependencyBranchSuffixesJson, ...rest } = subTask;

    return {
      ...rest,
      autoAssigned: Boolean(subTask.autoAssigned),
      dependencyBranchSuffixes: parseJsonStringArray(dependencyBranchSuffixesJson),
    };
  }

  async updateSubTask(subTaskId, updates) {
    const existingSubTask = await this.findSubTaskById(subTaskId);

    if (!existingSubTask) {
      return null;
    }

    const nextSubTask = {
      ...existingSubTask,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };
    nextSubTask.role = normalizeOptionalString(nextSubTask.role) ?? inferSubTaskRole(nextSubTask.branchSuffix, nextSubTask.title);
    nextSubTask.displayName = normalizeOptionalString(nextSubTask.displayName) ?? normalizeOptionalString(nextSubTask.title);
    nextSubTask.executionOrder = normalizeOptionalInteger(nextSubTask.executionOrder);
    nextSubTask.assignmentSource = normalizeOptionalString(nextSubTask.assignmentSource)
      ?? (nextSubTask.autoAssigned ? SUBTASK_ASSIGNMENT_SOURCE.LEAD : SUBTASK_ASSIGNMENT_SOURCE.OPERATOR);
    nextSubTask.runSummary = normalizeOptionalString(nextSubTask.runSummary) ?? buildSubTaskRunSummary(nextSubTask);

    this.#getDatabase()
      .prepare(`
        UPDATE sub_tasks
        SET
          title = ?,
          description = ?,
          branch_suffix = ?,
          dependency_branch_suffixes_json = ?,
          branch_name = ?,
          worktree_path = ?,
          agent_type = ?,
          status = ?,
          auto_assigned = ?,
          retry_count = ?,
          last_error = ?,
          latest_review_decision = ?,
          latest_review_phase = ?,
          latest_review_summary = ?,
          role = ?,
          display_name = ?,
          execution_order = ?,
          assignment_source = ?,
          run_summary = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextSubTask.title,
        nextSubTask.description,
        nextSubTask.branchSuffix,
        JSON.stringify(normalizeStringArray(nextSubTask.dependencyBranchSuffixes)),
        nextSubTask.branchName,
        nextSubTask.worktreePath,
        nextSubTask.agentType,
        nextSubTask.status,
        nextSubTask.autoAssigned ? 1 : 0,
        nextSubTask.retryCount,
        nextSubTask.lastError,
        nextSubTask.latestReviewDecision,
        nextSubTask.latestReviewPhase,
        nextSubTask.latestReviewSummary,
        nextSubTask.role,
        nextSubTask.displayName,
        nextSubTask.executionOrder,
        nextSubTask.assignmentSource,
        nextSubTask.runSummary,
        nextSubTask.updatedAt,
        subTaskId,
      );

    return nextSubTask;
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
          dependency_branch_suffixes_json AS dependencyBranchSuffixesJson,
          branch_name AS branchName,
          worktree_path AS worktreePath,
          agent_type AS agentType,
          status,
          auto_assigned AS autoAssigned,
          retry_count AS retryCount,
          last_error AS lastError,
          latest_review_decision AS latestReviewDecision,
          latest_review_phase AS latestReviewPhase,
          latest_review_summary AS latestReviewSummary,
          role,
          display_name AS displayName,
          execution_order AS executionOrder,
          assignment_source AS assignmentSource,
          run_summary AS runSummary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sub_tasks
        WHERE task_id = ?
        ORDER BY COALESCE(execution_order, 2147483647) ASC, created_at ASC, id ASC
      `)
      .all(taskId)
      .map((subTask) => ({
        ...omitDependencyBranchSuffixesJson(subTask),
        autoAssigned: Boolean(subTask.autoAssigned),
        dependencyBranchSuffixes: parseJsonStringArray(subTask.dependencyBranchSuffixesJson),
      }));
  }

  async createReviewRecord(input) {
    const reviewRecord = {
      createdAt: input.createdAt ?? new Date().toISOString(),
      decision: input.decision,
      id: input.id ?? randomUUID(),
      phase: input.phase,
      sessionId: input.sessionId ?? null,
      subTaskId: input.subTaskId,
      summary: input.summary,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO review_records (
          id,
          sub_task_id,
          session_id,
          phase,
          decision,
          summary,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        reviewRecord.id,
        reviewRecord.subTaskId,
        reviewRecord.sessionId,
        reviewRecord.phase,
        reviewRecord.decision,
        reviewRecord.summary,
        reviewRecord.createdAt,
      );

    return reviewRecord;
  }

  async listReviewRecordsBySubTaskId(subTaskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          sub_task_id AS subTaskId,
          session_id AS sessionId,
          phase,
          decision,
          summary,
          created_at AS createdAt
        FROM review_records
        WHERE sub_task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(subTaskId);
  }

  async createMergeRecord(input) {
    const timestamp = new Date().toISOString();
    const attemptNumber = input.attemptNumber ?? this.#getNextMergeAttemptNumber(input.subTaskId);
    const mergeRecord = {
      attemptNumber,
      completedAt: input.completedAt ?? null,
      conflictSummary: input.conflictSummary ?? null,
      createdAt: input.createdAt ?? timestamp,
      id: input.id ?? randomUUID(),
      operation: input.operation,
      resultCommitSha: input.resultCommitSha ?? null,
      sourceBranch: input.sourceBranch,
      status: input.status,
      subTaskId: input.subTaskId,
      targetBranch: input.targetBranch,
      updatedAt: input.updatedAt ?? timestamp,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO merge_records (
          id,
          sub_task_id,
          attempt_number,
          operation,
          source_branch,
          target_branch,
          status,
          result_commit_sha,
          conflict_summary,
          completed_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        mergeRecord.id,
        mergeRecord.subTaskId,
        mergeRecord.attemptNumber,
        mergeRecord.operation,
        mergeRecord.sourceBranch,
        mergeRecord.targetBranch,
        mergeRecord.status,
        mergeRecord.resultCommitSha,
        mergeRecord.conflictSummary,
        mergeRecord.completedAt,
        mergeRecord.createdAt,
        mergeRecord.updatedAt,
      );

    return mergeRecord;
  }

  async listMergeRecordsBySubTaskId(subTaskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          sub_task_id AS subTaskId,
          attempt_number AS attemptNumber,
          operation,
          source_branch AS sourceBranch,
          target_branch AS targetBranch,
          status,
          result_commit_sha AS resultCommitSha,
          conflict_summary AS conflictSummary,
          completed_at AS completedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM merge_records
        WHERE sub_task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(subTaskId);
  }

  async listMergeRecordsByTaskId(taskId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          merge_records.id,
          merge_records.sub_task_id AS subTaskId,
          merge_records.attempt_number AS attemptNumber,
          merge_records.operation,
          merge_records.source_branch AS sourceBranch,
          merge_records.target_branch AS targetBranch,
          merge_records.status,
          merge_records.result_commit_sha AS resultCommitSha,
          merge_records.conflict_summary AS conflictSummary,
          merge_records.completed_at AS completedAt,
          merge_records.created_at AS createdAt,
          merge_records.updated_at AS updatedAt
        FROM merge_records
        INNER JOIN sub_tasks ON sub_tasks.id = merge_records.sub_task_id
        WHERE sub_tasks.task_id = ?
        ORDER BY merge_records.created_at ASC, merge_records.id ASC
      `)
      .all(taskId);
  }

  async listTasks() {
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
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listMessages() {
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
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listMailboxMessages() {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          sender_type AS senderType,
          sender_sub_task_id AS senderSubTaskId,
          target_type AS targetType,
          target_sub_task_id AS targetSubTaskId,
          content,
          created_at AS createdAt
        FROM mailbox_messages
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listSessions() {
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
          first_output_at AS firstOutputAt,
          output_buffer AS outputBuffer,
          output_buffer_max_bytes AS outputBufferMaxBytes,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM agent_sessions
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listSubTasks() {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          task_id AS taskId,
          title,
          description,
          branch_suffix AS branchSuffix,
          dependency_branch_suffixes_json AS dependencyBranchSuffixesJson,
          branch_name AS branchName,
          worktree_path AS worktreePath,
          agent_type AS agentType,
          status,
          auto_assigned AS autoAssigned,
          retry_count AS retryCount,
          last_error AS lastError,
          latest_review_decision AS latestReviewDecision,
          latest_review_phase AS latestReviewPhase,
          latest_review_summary AS latestReviewSummary,
          role,
          display_name AS displayName,
          execution_order AS executionOrder,
          assignment_source AS assignmentSource,
          run_summary AS runSummary,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sub_tasks
        ORDER BY COALESCE(execution_order, 2147483647) ASC, created_at ASC, id ASC
      `)
      .all()
      .map((subTask) => ({
        ...omitDependencyBranchSuffixesJson(subTask),
        autoAssigned: Boolean(subTask.autoAssigned),
        dependencyBranchSuffixes: parseJsonStringArray(subTask.dependencyBranchSuffixesJson),
      }));
  }

  async listReviewRecords() {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          sub_task_id AS subTaskId,
          session_id AS sessionId,
          phase,
          decision,
          summary,
          created_at AS createdAt
        FROM review_records
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listMergeRecords() {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          sub_task_id AS subTaskId,
          attempt_number AS attemptNumber,
          operation,
          source_branch AS sourceBranch,
          target_branch AS targetBranch,
          status,
          result_commit_sha AS resultCommitSha,
          conflict_summary AS conflictSummary,
          completed_at AS completedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM merge_records
        ORDER BY created_at ASC, id ASC
      `)
      .all();
  }

  async listSessionsBySubTaskId(subTaskId) {
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
          first_output_at AS firstOutputAt,
          output_buffer AS outputBuffer,
          output_buffer_max_bytes AS outputBufferMaxBytes,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM agent_sessions
        WHERE sub_task_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(subTaskId);
  }

  async runInTransaction(work) {
    const database = this.#getDatabase();
    database.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      const result = await work(this);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
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

  #getNextMergeAttemptNumber(subTaskId) {
    const row = this.#getDatabase()
      .prepare(`
        SELECT COALESCE(MAX(attempt_number), 0) AS maxAttemptNumber
        FROM merge_records
        WHERE sub_task_id = ?
      `)
      .get(subTaskId);

    return Number(row?.maxAttemptNumber ?? 0) + 1;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()))];
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function parseJsonStringArray(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return normalizeStringArray(parsed);
  } catch {
    return [];
  }
}

function omitDependencyBranchSuffixesJson(record) {
  const { dependencyBranchSuffixesJson, ...rest } = record;
  return rest;
}

function inferSubTaskRole(branchSuffix, title) {
  return normalizeOptionalString(branchSuffix)
    ?? normalizeOptionalString(title)?.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")
    ?? "worker";
}

function buildSubTaskRunSummary(subTask) {
  switch (subTask?.status) {
    case SUBTASK_STATUS.BLOCKED:
      return subTask.dependencyBranchSuffixes?.length > 0
        ? `Waiting on ${subTask.dependencyBranchSuffixes.join(", ")} before this member can run.`
        : "Waiting on upstream dependencies before this member can run.";
    case SUBTASK_STATUS.PENDING:
      return "Queued for team execution.";
    case SUBTASK_STATUS.READY:
      return "Workspace is ready. Waiting for worker launch.";
    case SUBTASK_STATUS.RUNNING:
      return subTask.worktreePath
        ? `Running in ${subTask.worktreePath}.`
        : "Worker session is running.";
    case SUBTASK_STATUS.REVIEW_PENDING:
      return "Worker run finished. Waiting for review outcome.";
    case SUBTASK_STATUS.ACCEPTED:
      return "Accepted for integration.";
    case SUBTASK_STATUS.REWORK_REQUIRED:
      return normalizeOptionalString(subTask.latestReviewSummary) ?? "Needs another worker pass before integration.";
    case SUBTASK_STATUS.DISCARD_PENDING:
      return normalizeOptionalString(subTask.latestReviewSummary) ?? "Marked for discard. Waiting for operator confirmation.";
    case SUBTASK_STATUS.MERGED:
      return "Merged into the task base branch.";
    case SUBTASK_STATUS.FAILED:
      return normalizeOptionalString(subTask.lastError) ?? "Worker execution failed.";
    case SUBTASK_STATUS.CANCELLED:
      return "Cancelled by the operator.";
    case SUBTASK_STATUS.DISCARDED:
      return "Discarded from the merge set.";
    default:
      return "Waiting for team lifecycle events.";
  }
}

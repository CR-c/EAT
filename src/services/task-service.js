import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ATTACHMENT_TYPES, SESSION_SANDBOX_TYPES } from "../agents/agent-contract.js";
import {
  abortMerge,
  abortRebase,
  checkoutBranch,
  computeDeterministicBranchName,
  deleteBranch,
  ensureBranchExists,
  ensureWorktree,
  getCurrentBranch,
  isBranchMergedInto,
  isWorkingTreeDirty,
  mergeBranch,
  removeWorktree,
  rebaseBranch,
  resolveRevision,
  resolveUniqueBranchName,
  resolveWorktreePath,
} from "./git-workspace-service.js";
import { resolveBranchHeadCommit } from "./repo-validation-service.js";
import {
  buildPlanningPrompt,
  getPlanNodes,
  looksLikeCompletePlanText,
  parsePlanDraftText,
  validatePlanDraft,
} from "./plan-draft.js";
import { buildPlanSeedFromTemplate, listPlanTemplates } from "./task-templates.js";
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
  SUBTASK_ASSIGNMENT_SOURCE,
  SUBTASK_STATUS,
  TASK_STATUS,
} from "../repositories/task-repository.js";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const execFileAsync = promisify(execFile);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FINAL_REVIEW_DIFF_BYTES = 32_768;
const MAX_FINAL_REVIEW_LOG_BYTES = 32_768;
const MAX_INCREMENTAL_REVIEW_LOG_BYTES = 32_768;
const MAX_AUTO_REWORK_RETRIES = 2;
const MAX_MAILBOX_PROMPT_MESSAGE_BYTES = 1_024;
const FINAL_REVIEW_DECISIONS = new Set(["ACCEPTED", "REJECTED", "REWORK"]);
const INCREMENTAL_REVIEW_DECISIONS = new Set(["ACCEPTED", "REJECTED", "REWORK"]);
const COMPLETED_SUBTASK_STATUSES = new Set([
  SUBTASK_STATUS.CANCELLED,
  SUBTASK_STATUS.DISCARDED,
  SUBTASK_STATUS.MERGED,
]);
const DEPENDENCY_SATISFIED_SUBTASK_STATUSES = new Set([
  SUBTASK_STATUS.ACCEPTED,
  SUBTASK_STATUS.MERGED,
  SUBTASK_STATUS.REVIEW_PENDING,
]);
const TERMINAL_TASK_STATUSES = new Set([
  TASK_STATUS.CANCELLED,
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED,
]);
const ACTIVE_TASK_STATUSES = new Set([
  TASK_STATUS.ACTION_REQUIRED,
  TASK_STATUS.CLARIFYING,
  TASK_STATUS.DRAFT,
  TASK_STATUS.EXECUTING,
  TASK_STATUS.MERGING,
  TASK_STATUS.PLANNING,
  TASK_STATUS.PLAN_REVIEW,
  TASK_STATUS.REVIEWING,
]);
const ARCHIVE_CANCELLABLE_SUBTASK_STATUSES = new Set([
  SUBTASK_STATUS.BLOCKED,
  SUBTASK_STATUS.DISCARD_PENDING,
  SUBTASK_STATUS.PENDING,
  SUBTASK_STATUS.READY,
  SUBTASK_STATUS.REVIEW_PENDING,
  SUBTASK_STATUS.REWORK_REQUIRED,
  SUBTASK_STATUS.RUNNING,
]);
const CLEANUP_WARNING_MESSAGE_PREFIX = "Cleanup warning: ";
const LAUNCH_FAILURE_MESSAGE_PREFIX = "Launch failure: ";
const TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX = "Task document snapshot: ";
const DEFAULT_INTEGRATION_GATE_TYPES = ["TEST"];
const TASK_PAUSED_REASON_PREFIX = "Paused by operator from ";
const CLEANUP_RETRY_ATTEMPTS = 4;
const CLEANUP_RETRY_DELAY_MS = 250;
const SESSION_STOP_WAIT_TIMEOUT_MS = 7_000;

const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".pdf", ".txt"]);
const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

export const TASK_SERVICE_ERROR_CODES = Object.freeze({
  ATTACHMENT_CONTENT_REQUIRED: "ATTACHMENT_CONTENT_REQUIRED",
  ATTACHMENT_MIME_MISMATCH: "ATTACHMENT_MIME_MISMATCH",
  ATTACHMENT_NAME_REQUIRED: "ATTACHMENT_NAME_REQUIRED",
  ATTACHMENT_PATH_NOT_FOUND: "ATTACHMENT_PATH_NOT_FOUND",
  ATTACHMENT_SIZE_EXCEEDED: "ATTACHMENT_SIZE_EXCEEDED",
  ATTACHMENT_TYPE_UNSUPPORTED: "ATTACHMENT_TYPE_UNSUPPORTED",
  AGENT_TYPE_REQUIRED: "AGENT_TYPE_REQUIRED",
  BASE_BRANCH_CREATE_FAILED: "BASE_BRANCH_CREATE_FAILED",
  BASE_BRANCH_NOT_FOUND: "BASE_BRANCH_NOT_FOUND",
  BASE_BRANCH_REQUIRED: "BASE_BRANCH_REQUIRED",
  DESCRIPTION_REQUIRED: "DESCRIPTION_REQUIRED",
  INVALID_ATTACHMENT_PAYLOAD: "INVALID_ATTACHMENT_PAYLOAD",
  LEAD_AGENT_INVALID: "LEAD_AGENT_INVALID",
  LEAD_AGENT_UNHEALTHY: "LEAD_AGENT_UNHEALTHY",
  LEAD_AGENT_REQUIRED: "LEAD_AGENT_REQUIRED",
  INVALID_PLAN: "INVALID_PLAN",
  MAILBOX_MESSAGE_TYPE_INVALID: "MAILBOX_MESSAGE_TYPE_INVALID",
  MAILBOX_MESSAGE_REQUIRED: "MAILBOX_MESSAGE_REQUIRED",
  MAILBOX_NOT_AVAILABLE: "MAILBOX_NOT_AVAILABLE",
  MAILBOX_SCHEMA_INVALID: "MAILBOX_SCHEMA_INVALID",
  MAILBOX_TARGET_REQUIRED: "MAILBOX_TARGET_REQUIRED",
  PLAN_TEMPLATE_NOT_FOUND: "PLAN_TEMPLATE_NOT_FOUND",
  PLAN_SNAPSHOT_NOT_FOUND: "PLAN_SNAPSHOT_NOT_FOUND",
  PLAN_TEMPLATE_REQUIRED: "PLAN_TEMPLATE_REQUIRED",
  REQUIREMENTS_ALREADY_CONFIRMED: "REQUIREMENTS_ALREADY_CONFIRMED",
  SESSION_NOT_RUNNING: "SESSION_NOT_RUNNING",
  TASK_DELETE_REQUIRES_PAUSE: "TASK_DELETE_REQUIRES_PAUSE",
  TASK_BRANCH_CLEANUP_FAILED: "TASK_BRANCH_CLEANUP_FAILED",
  TASK_MESSAGE_REQUIRED: "TASK_MESSAGE_REQUIRED",
  TASK_PAUSE_NOT_ALLOWED: "TASK_PAUSE_NOT_ALLOWED",
  TASK_NOT_CLARIFYING: "TASK_NOT_CLARIFYING",
  TASK_NOT_DRAFT: "TASK_NOT_DRAFT",
  TASK_NOT_PLAN_REVIEW: "TASK_NOT_PLAN_REVIEW",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  SUBTASK_ACTIVE_SESSION_EXISTS: "SUBTASK_ACTIVE_SESSION_EXISTS",
  SUBTASK_CANCEL_NOT_ALLOWED: "SUBTASK_CANCEL_NOT_ALLOWED",
  SUBTASK_CHANGE_AGENT_NOT_ALLOWED: "SUBTASK_CHANGE_AGENT_NOT_ALLOWED",
  SUBTASK_DISCARD_NOT_ALLOWED: "SUBTASK_DISCARD_NOT_ALLOWED",
  SUBTASK_NOT_FOUND: "SUBTASK_NOT_FOUND",
  SUBTASK_REBASE_RETRY_NOT_ALLOWED: "SUBTASK_REBASE_RETRY_NOT_ALLOWED",
  SUBTASK_REASSIGN_NOT_ALLOWED: "SUBTASK_REASSIGN_NOT_ALLOWED",
  SUBTASK_REWORK_NOT_ALLOWED: "SUBTASK_REWORK_NOT_ALLOWED",
  SUBTASK_RETRY_NOT_ALLOWED: "SUBTASK_RETRY_NOT_ALLOWED",
  INTEGRATION_DEQUEUE_NOT_ALLOWED: "INTEGRATION_DEQUEUE_NOT_ALLOWED",
  INTEGRATION_QUEUE_ITEM_NOT_FOUND: "INTEGRATION_QUEUE_ITEM_NOT_FOUND",
  INTEGRATION_RETRY_NOT_ALLOWED: "INTEGRATION_RETRY_NOT_ALLOWED",
  INTEGRATION_ROLLBACK_NOT_ALLOWED: "INTEGRATION_ROLLBACK_NOT_ALLOWED",
  INTEGRATION_RUN_NOT_FOUND: "INTEGRATION_RUN_NOT_FOUND",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_RESUME_NOT_ALLOWED: "TASK_RESUME_NOT_ALLOWED",
  TITLE_REQUIRED: "TITLE_REQUIRED",
});

const WORKER_LIVE_STATUSES = new Set([
  SESSION_STATUS.PENDING,
  SESSION_STATUS.RUNNING,
  SESSION_STATUS.STARTING,
  SESSION_STATUS.STOPPING,
]);
const MAILBOX_CONTRACT_TYPES = new Set([
  MAILBOX_MESSAGE_TYPE.API_CONTRACT,
  MAILBOX_MESSAGE_TYPE.DB_CONTRACT,
]);
const MAILBOX_PRIORITY_TYPES = [
  MAILBOX_MESSAGE_TYPE.API_CONTRACT,
  MAILBOX_MESSAGE_TYPE.DB_CONTRACT,
  MAILBOX_MESSAGE_TYPE.BLOCKER,
  MAILBOX_MESSAGE_TYPE.DELIVERABLE_READY,
  MAILBOX_MESSAGE_TYPE.TEST_REQUEST,
  MAILBOX_MESSAGE_TYPE.REVIEW_REQUEST,
  MAILBOX_MESSAGE_TYPE.NOTE,
];

export class TaskService {
  constructor(options) {
    this.projectRepository = options.projectRepository;
    this.taskRepository = options.taskRepository;
    this.agentService = options.agentService;
    this.eventBus = options.eventBus ?? null;
    this.sandboxManager = options.sandboxManager ?? null;
    this.uploadRootPath = options.uploadRootPath ?? DEFAULT_UPLOAD_ROOT;
    this.runningLeadSessions = new Map();
    this.cancelledLeadSessionIds = new Set();
    this.pendingPlanDrafts = new Map();
    this.pendingWorkerLaunches = new Set();
    this.runningWorkerSessions = new Map();
    this.cancelledWorkerSessionIds = new Set();
    this.sessionLogPaths = new Map();
    this.sessionOutputAppends = new Map();
    this.workerLaunchMetadata = new Map();
    this.workerSessionMetadata = new Map();
    this.pendingFinalReviews = new Set();
    this.pendingMergeExecutions = new Set();
    this.pendingIntegrationExecutions = new Set();
    this.pendingCleanupTasks = new Set();
    this.pendingTaskMainlineSyncs = new Map();
    this.pendingProjectGitLocks = new Map();
    this.integrationGateRunner = options.integrationGateRunner ?? defaultIntegrationGateRunner;
    this.closed = false;
  }

  async createTask(input) {
    try {
      const prepared = await this.#prepareTaskCreationInput(input);

      if (!prepared.ok) {
        return prepared;
      }

      const createdTask = await this.#createTaskRecord(prepared);

      return {
        ok: true,
        attachments: createdTask.attachments,
        task: createdTask.task,
      };
    } catch (error) {
      if (error instanceof TaskServiceError) {
        return {
          ok: false,
          error: error.payload,
        };
      }

      throw error;
    }
  }

  async createGuidedTask(input) {
    const templateId = normalizeRequiredString(input?.templateId);

    if (!templateId) {
      return failure(
        TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_REQUIRED,
        "A task template must be selected before starting the guided flow.",
      );
    }

    try {
      const prepared = await this.#prepareTaskCreationInput(input);

      if (!prepared.ok) {
        return prepared;
      }

      const workerAgentType = await this.#resolveDefaultTemplateAgentType(prepared.taskInput, input?.agentType);
      const seededPlan = buildPlanSeedFromTemplate(templateId, {
        agentType: workerAgentType,
        description: prepared.taskInput.description,
        title: prepared.taskInput.title,
      });

      if (!seededPlan) {
        return failure(
          TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_NOT_FOUND,
          "Requested plan template was not found.",
          { templateId },
        );
      }

      const validation = await this.#validatePlanPayload(seededPlan.plan);

      if (!validation.ok) {
        return validation;
      }

      const createdTask = await this.#createTaskRecord(prepared);
      const currentPlanJson = JSON.stringify(validation.plan);
      const planReviewTask = await this.taskRepository.updateTask(createdTask.task.id, {
        currentPlanJson,
        lastError: null,
        planVersion: 1,
        status: TASK_STATUS.PLAN_REVIEW,
      });

      await this.taskRepository.createPlanSnapshot({
        payload: currentPlanJson,
        source: PLAN_SNAPSHOT_SOURCE.LEAD_GENERATED,
        taskId: createdTask.task.id,
        version: planReviewTask.planVersion,
      });

      this.#publish(createdTask.task.id, "task:status", {
        status: planReviewTask.status,
        taskId: createdTask.task.id,
      });
      this.#publish(createdTask.task.id, "task:plan-generated", {
        currentPlan: validation.plan,
        planVersion: planReviewTask.planVersion,
        taskId: createdTask.task.id,
      });

      return {
        ok: true,
        attachments: createdTask.attachments,
        currentPlan: validation.plan,
        task: planReviewTask,
        template: seededPlan.template,
      };
    } catch (error) {
      if (error instanceof TaskServiceError) {
        return {
          ok: false,
          error: error.payload,
        };
      }

      throw error;
    }
  }

  async listProjectTasks(projectId, options = {}) {
    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId });
    }

    const tasks = await this.taskRepository.listTasksByProjectId(projectId, {
      includeArchived: options.includeArchived === true,
    });
    return {
      ok: true,
      tasks,
    };
  }

  async archiveTask(taskId, input = {}) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const deleteBranches = input?.deleteBranches === true;
    const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);

    if (deleteBranches) {
      await this.#stopTaskSessions(task, subTasks, { persistCancellation: true });
    }

    const branchCleanup = deleteBranches
      ? await this.#cleanupTaskBranches(task, subTasks)
      : buildEmptyTaskCleanupResult();

    if (!branchCleanup.ok) {
      return branchCleanup;
    }

    const nextTask = await this.taskRepository.updateTask(task.id, {
      archivedAt: new Date().toISOString(),
      lastError: null,
      status: deleteBranches && ACTIVE_TASK_STATUSES.has(task.status) ? TASK_STATUS.CANCELLED : task.status,
    });

    return {
      ok: true,
      branchCleanup,
      task: nextTask,
    };
  }

  async unarchiveTask(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const nextTask = await this.taskRepository.updateTask(task.id, {
      archivedAt: null,
    });

    return {
      ok: true,
      task: nextTask,
    };
  }

  async deleteTask(taskId, input = {}) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (!isTaskDeleteAllowed(task)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_DELETE_REQUIRES_PAUSE,
        "Pause the task before deleting it.",
        { status: task.status, taskId },
      );
    }

    const deleteBranches = input?.deleteBranches === true;
    const [subTasks, sessions] = await Promise.all([
      this.taskRepository.listSubTasksByTaskId(task.id),
      this.taskRepository.listSessionsByTaskId(task.id),
    ]);

    if (deleteBranches) {
      await this.#stopTaskSessions(task, subTasks, { persistCancellation: true });
    }

    const branchCleanup = deleteBranches
      ? await this.#cleanupTaskBranches(task, subTasks)
      : buildEmptyTaskCleanupResult();

    if (!branchCleanup.ok) {
      return branchCleanup;
    }

    const deletedTask = await this.taskRepository.deleteTask(task.id);
    await rm(path.join(this.uploadRootPath, task.id), { force: true, recursive: true }).catch(() => null);
    this.#clearTaskRuntimeState(task.id, subTasks, sessions);

    return {
      ok: true,
      branchCleanup,
      task: deletedTask,
    };
  }

  async deleteProjectTasks(projectId, input = {}) {
    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId });
    }

    const tasks = await this.taskRepository.listTasksByProjectId(projectId, { includeArchived: true });
    const deleteBranches = input?.deleteBranches === true;
    const deletedTasks = [];
    const cleanedBranches = [];
    const cleanedWorktrees = [];

    for (const task of tasks) {
      const [subTasks, sessions] = await Promise.all([
        this.taskRepository.listSubTasksByTaskId(task.id),
        this.taskRepository.listSessionsByTaskId(task.id),
      ]);

      await this.#stopTaskSessions(task, subTasks, { persistCancellation: true });

      const branchCleanup = deleteBranches
        ? await this.#cleanupTaskBranches(task, subTasks)
        : buildEmptyTaskCleanupResult();

      if (!branchCleanup.ok) {
        return branchCleanup;
      }

      const deletedTask = await this.taskRepository.deleteTask(task.id);
      await rm(path.join(this.uploadRootPath, task.id), { force: true, recursive: true }).catch(() => null);
      this.#clearTaskRuntimeState(task.id, subTasks, sessions);

      if (deletedTask) {
        deletedTasks.push(deletedTask);
      }

      cleanedBranches.push(...(branchCleanup.cleanedBranches ?? []));
      cleanedWorktrees.push(...(branchCleanup.cleanedWorktrees ?? []));
    }

    return {
      ok: true,
      cleanedBranches,
      cleanedWorktrees,
      deletedTasks,
      projectId,
    };
  }

  async pauseTask(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (!isTaskPauseAllowed(task)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_PAUSE_NOT_ALLOWED,
        "Task pause is only available while work is actively in progress.",
        { status: task.status, taskId },
      );
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);
    await this.#stopTaskSessions(task, subTasks, { persistCancellation: true });

    const pausedTask = await this.#updateTaskStatus(task.id, TASK_STATUS.ACTION_REQUIRED, {
      currentTask: task,
      lastError: buildPausedTaskReason(task.status),
    });
    await this.taskRepository.createMessage({
      content: `Operator paused the task while it was in ${task.status}.`,
      role: MESSAGE_ROLE.SYSTEM,
      taskId: task.id,
    });

    return {
      ok: true,
      task: pausedTask,
    };
  }

  async getTask(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const messages = await this.taskRepository.listMessagesByTaskId(task.id);
    const sessions = await this.taskRepository.listSessionsByTaskId(task.id);
    const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);
    const mergeRecords = await this.taskRepository.listMergeRecordsByTaskId(task.id);
    const mailboxMessages = await this.taskRepository.listMailboxMessagesByTaskId(task.id);
    const reviewRecords = (await this.taskRepository.listReviewRecords())
      .filter((record) => subTasks.some((subTask) => subTask.id === record.subTaskId));
    const integrationRuns = await this.taskRepository.listIntegrationRunsByTaskId(task.id);
    const queueItemsByIntegrationRunId = new Map(
      await Promise.all(integrationRuns.map(async (integrationRun) => [
        integrationRun.id,
        await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRun.id),
      ])),
    );
    const gateResultsByIntegrationRunId = new Map(
      await Promise.all(integrationRuns.map(async (integrationRun) => [
        integrationRun.id,
        await this.taskRepository.listGateResultsByIntegrationRunId(integrationRun.id),
      ])),
    );
    const mergeRecordsBySubTaskId = groupRecordsBySubTaskId(mergeRecords);
    const decoratedSessions = sessions.map((session) => this.#decorateSession(session));
    const decoratedSubTasks = subTasks.map((subTask) => this.#decorateSubTask({
      ...subTask,
      mergeRecords: mergeRecordsBySubTaskId.get(subTask.id) ?? [],
    }));

    return {
      ok: true,
      attachments: await this.taskRepository.listAttachmentsByTaskId(task.id),
      cleanupWarnings: parseCleanupWarningsFromMessages(messages),
      mailboxMessages,
      messages,
      planSnapshots: await this.taskRepository.listPlanSnapshotsByTaskId(task.id),
      board: this.#buildTaskBoardSnapshot(task, {
        gateResultsByIntegrationRunId,
        integrationRuns,
        mailboxMessages,
        messages,
        queueItemsByIntegrationRunId,
        reviewRecords,
        sessions: decoratedSessions,
        subTasks: decoratedSubTasks,
      }),
      integration: this.#buildTaskIntegrationView(task, {
        gateResultsByIntegrationRunId,
        integrationRuns,
        queueItemsByIntegrationRunId,
        subTasks: decoratedSubTasks,
      }),
      sessions: decoratedSessions,
      subTasks: decoratedSubTasks,
      task,
      team: this.#buildTaskTeamView(task, decoratedSessions, decoratedSubTasks),
    };
  }

  async getTaskTeam(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const [sessions, subTasks, mergeRecords] = await Promise.all([
      this.taskRepository.listSessionsByTaskId(task.id),
      this.taskRepository.listSubTasksByTaskId(task.id),
      this.taskRepository.listMergeRecordsByTaskId(task.id),
    ]);
    const mergeRecordsBySubTaskId = groupRecordsBySubTaskId(mergeRecords);
    const decoratedSessions = sessions.map((session) => this.#decorateSession(session));
    const decoratedSubTasks = subTasks.map((subTask) => this.#decorateSubTask({
      ...subTask,
      mergeRecords: mergeRecordsBySubTaskId.get(subTask.id) ?? [],
    }));

    return {
      ok: true,
      team: this.#buildTaskTeamView(task, decoratedSessions, decoratedSubTasks),
    };
  }

  async getTaskBoard(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const [messages, sessions, subTasks, mergeRecords, mailboxMessages, reviewRecords, integrationRuns] = await Promise.all([
      this.taskRepository.listMessagesByTaskId(task.id),
      this.taskRepository.listSessionsByTaskId(task.id),
      this.taskRepository.listSubTasksByTaskId(task.id),
      this.taskRepository.listMergeRecordsByTaskId(task.id),
      this.taskRepository.listMailboxMessagesByTaskId(task.id),
      this.taskRepository.listReviewRecords(),
      this.taskRepository.listIntegrationRunsByTaskId(task.id),
    ]);
    const queueItemsByIntegrationRunId = new Map(
      await Promise.all(integrationRuns.map(async (integrationRun) => [
        integrationRun.id,
        await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRun.id),
      ])),
    );
    const gateResultsByIntegrationRunId = new Map(
      await Promise.all(integrationRuns.map(async (integrationRun) => [
        integrationRun.id,
        await this.taskRepository.listGateResultsByIntegrationRunId(integrationRun.id),
      ])),
    );
    const mergeRecordsBySubTaskId = groupRecordsBySubTaskId(mergeRecords);
    const decoratedSessions = sessions.map((session) => this.#decorateSession(session));
    const decoratedSubTasks = subTasks.map((subTask) => this.#decorateSubTask({
      ...subTask,
      mergeRecords: mergeRecordsBySubTaskId.get(subTask.id) ?? [],
    }));

    return {
      ok: true,
      board: this.#buildTaskBoardSnapshot(task, {
        gateResultsByIntegrationRunId,
        integrationRuns,
        mailboxMessages,
        messages,
        queueItemsByIntegrationRunId,
        reviewRecords: reviewRecords.filter((record) => subTasks.some((subTask) => subTask.id === record.subTaskId)),
        sessions: decoratedSessions,
        subTasks: decoratedSubTasks,
      }),
    };
  }

  async startIntegrationRun(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (![TASK_STATUS.MERGING, TASK_STATUS.ACTION_REQUIRED].includes(task.status)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INTEGRATION_RETRY_NOT_ALLOWED,
        "Integration runs can only start while merging or after an integration failure requires action.",
        { status: task.status, taskId },
      );
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);
    const activeIntegrationRun = await this.taskRepository.findLatestIntegrationRunByTaskId?.(taskId);

    if (
      activeIntegrationRun
      && [INTEGRATION_RUN_STATUS.QUEUED, INTEGRATION_RUN_STATUS.RUNNING].includes(activeIntegrationRun.status)
    ) {
      return {
        ok: true,
        integrationRun: activeIntegrationRun,
        task,
      };
    }

    const integrationRun = await this.#createIntegrationRun(task, subTasks);

    return {
      ok: true,
      integrationRun,
      task: await this.taskRepository.findTaskById(taskId),
    };
  }

  async retryIntegrationRun(integrationRunId) {
    const integrationRun = await this.taskRepository.findIntegrationRunById(integrationRunId);

    if (!integrationRun) {
      return failure(TASK_SERVICE_ERROR_CODES.INTEGRATION_RUN_NOT_FOUND, "Integration run not found.", { integrationRunId });
    }

    const task = await this.taskRepository.findTaskById(integrationRun.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: integrationRun.taskId });
    }

    if (
      task.status !== TASK_STATUS.ACTION_REQUIRED
      || ![INTEGRATION_RUN_STATUS.ACTION_REQUIRED, INTEGRATION_RUN_STATUS.FAILED, INTEGRATION_RUN_STATUS.ROLLED_BACK].includes(integrationRun.status)
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INTEGRATION_RETRY_NOT_ALLOWED,
        "Integration retry is only available after an actionable integration failure or rollback.",
        {
          integrationRunId,
          integrationRunStatus: integrationRun.status,
          taskStatus: task.status,
        },
      );
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);
    const resumedTask = await this.#updateTaskStatus(task.id, TASK_STATUS.MERGING, {
      currentTask: task,
      lastError: null,
    });
    const nextIntegrationRun = await this.#createIntegrationRun(resumedTask, subTasks);

    return {
      ok: true,
      integrationRun: nextIntegrationRun,
      task: await this.taskRepository.findTaskById(task.id),
    };
  }

  async rollbackIntegrationRun(integrationRunId) {
    const integrationRun = await this.taskRepository.findIntegrationRunById(integrationRunId);

    if (!integrationRun) {
      return failure(TASK_SERVICE_ERROR_CODES.INTEGRATION_RUN_NOT_FOUND, "Integration run not found.", { integrationRunId });
    }

    const task = await this.taskRepository.findTaskById(integrationRun.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: integrationRun.taskId });
    }

    if (
      task.status !== TASK_STATUS.ACTION_REQUIRED
      || ![INTEGRATION_RUN_STATUS.ACTION_REQUIRED, INTEGRATION_RUN_STATUS.FAILED].includes(integrationRun.status)
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INTEGRATION_ROLLBACK_NOT_ALLOWED,
        "Integration rollback is only available after an actionable integration failure.",
        {
          integrationRunId,
          integrationRunStatus: integrationRun.status,
          taskStatus: task.status,
        },
      );
    }

    const rolledBackRun = await this.taskRepository.updateIntegrationRun(integrationRunId, {
      endedAt: new Date().toISOString(),
      status: INTEGRATION_RUN_STATUS.ROLLED_BACK,
    });
    const queueItems = await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRunId);

    await Promise.all(queueItems.map((queueItem) => this.taskRepository.updateIntegrationQueueItem(queueItem.id, {
      status: queueItem.status === INTEGRATION_QUEUE_ITEM_STATUS.RELEASED
        ? INTEGRATION_QUEUE_ITEM_STATUS.RELEASED
        : INTEGRATION_QUEUE_ITEM_STATUS.ROLLED_BACK,
    })));

    this.#publish(task.id, "integration:failed", {
      integrationBranch: rolledBackRun.integrationBranch,
      integrationRunId: rolledBackRun.id,
      reason: "Integration run rolled back by operator.",
      status: rolledBackRun.status,
      taskId: task.id,
    });

    return {
      ok: true,
      integrationRun: rolledBackRun,
      task,
    };
  }

  async dequeueIntegrationQueueItem(integrationQueueItemId) {
    const integrationQueueItem = await this.taskRepository.findIntegrationQueueItemById(integrationQueueItemId);

    if (!integrationQueueItem) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INTEGRATION_QUEUE_ITEM_NOT_FOUND,
        "Integration queue item not found.",
        { integrationQueueItemId },
      );
    }

    const integrationRun = await this.taskRepository.findIntegrationRunById(integrationQueueItem.integrationRunId);

    if (!integrationRun) {
      return failure(TASK_SERVICE_ERROR_CODES.INTEGRATION_RUN_NOT_FOUND, "Integration run not found.", {
        integrationQueueItemId,
        integrationRunId: integrationQueueItem.integrationRunId,
      });
    }

    const [task, subTask] = await Promise.all([
      this.taskRepository.findTaskById(integrationRun.taskId),
      this.taskRepository.findSubTaskById(integrationQueueItem.subTaskId),
    ]);

    if (!task || !subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task or subtask not found for integration dequeue.", {
        integrationQueueItemId,
        subTaskId: integrationQueueItem.subTaskId,
        taskId: integrationRun.taskId,
      });
    }

    if (
      task.status !== TASK_STATUS.ACTION_REQUIRED
      || integrationRun.status !== INTEGRATION_RUN_STATUS.ACTION_REQUIRED
      || [INTEGRATION_QUEUE_ITEM_STATUS.RELEASED, INTEGRATION_QUEUE_ITEM_STATUS.DEQUEUED].includes(integrationQueueItem.status)
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INTEGRATION_DEQUEUE_NOT_ALLOWED,
        "Integration dequeue is only available for actionable queue items during an interrupted integration run.",
        {
          integrationQueueItemId,
          integrationRunStatus: integrationRun.status,
          queueItemStatus: integrationQueueItem.status,
          taskStatus: task.status,
        },
      );
    }

    const dequeuedQueueItem = await this.taskRepository.updateIntegrationQueueItem(integrationQueueItem.id, {
      status: INTEGRATION_QUEUE_ITEM_STATUS.DEQUEUED,
    });
    const discardedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
      lastError: "Removed from the integration queue by operator action.",
      status: SUBTASK_STATUS.DISCARDED,
    });

    this.#publish(task.id, "integration:queued", {
      integrationQueueItemId: dequeuedQueueItem.id,
      integrationRunId: integrationRun.id,
      queueOrder: dequeuedQueueItem.queueOrder,
      status: dequeuedQueueItem.status,
      subtaskId: discardedSubTask.id,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, discardedSubTask);

    return {
      ok: true,
      integrationQueueItem: dequeuedQueueItem,
      subTask: discardedSubTask,
      task,
    };
  }

  async listPlanTemplates() {
    return {
      ok: true,
      templates: listPlanTemplates(),
    };
  }

  async applyPlanTemplateSeed(taskId, input = {}) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status !== TASK_STATUS.PLAN_REVIEW) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW,
        "Plan template seeding is only available during PLAN_REVIEW.",
        { status: task.status, taskId },
      );
    }

    const templateId = normalizeRequiredString(input?.templateId);

    if (!templateId) {
      return failure(
        TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_REQUIRED,
        "A plan template must be selected before seeding.",
      );
    }

    const workerAgentType = await this.#resolveDefaultTemplateAgentType(task, input?.agentType);
    const seededPlan = buildPlanSeedFromTemplate(templateId, {
      agentType: workerAgentType,
      description: task.description,
      title: task.title,
    });

    if (!seededPlan) {
      return failure(
        TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_NOT_FOUND,
        "Requested plan template was not found.",
        { templateId },
      );
    }

    const validation = await this.#validatePlanPayload(seededPlan.plan);

    if (!validation.ok) {
      return validation;
    }

    const nextTask = await this.taskRepository.updateTask(taskId, {
      currentPlanJson: JSON.stringify(validation.plan),
      lastError: null,
    });

    this.#publish(taskId, "task:plan-seeded", {
      currentPlan: validation.plan,
      taskId,
      templateId,
    });

    return {
      ok: true,
      currentPlan: validation.plan,
      task: nextTask,
      template: seededPlan.template,
    };
  }

  async startClarification(taskId, input = {}) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status !== TASK_STATUS.DRAFT) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_DRAFT,
        "Clarification can only start from DRAFT.",
        { status: task.status, taskId },
      );
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId: task.projectId });
    }

    const initialMessage = normalizeRequiredString(input?.content);

    if (!initialMessage) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_MESSAGE_REQUIRED,
        "Message content is required.",
        { taskId },
      );
    }

    try {
      const { runningSession, runtime } = await this.#spawnLeadSession(task, project);
      const clarifyingTask = await this.#updateTaskStatus(task.id, TASK_STATUS.CLARIFYING, {
        currentTask: task,
        lastError: null,
        publish: false,
      });

      await this.taskRepository.createMessage({
        content: initialMessage,
        role: MESSAGE_ROLE.USER,
        taskId: task.id,
      });

      await runtime.sendInput(initialMessage);

      this.#publish(task.id, "task:status", {
        taskId: task.id,
        status: clarifyingTask.status,
      });

      return {
        ok: true,
        session: runningSession,
        task: clarifyingTask,
      };
    } catch (error) {
      const latestSession = (await this.taskRepository.listSessionsByTaskId(task.id))
        .filter((session) => session.sessionType === SESSION_TYPE.LEAD)
        .at(-1) ?? null;
      const wasCancelled = latestSession
        ? this.cancelledLeadSessionIds.has(latestSession.id) || latestSession.status === SESSION_STATUS.CANCELLED
        : false;

      if (wasCancelled) {
        return failure(
          TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
          "Lead session was stopped by the operator.",
          { taskId },
        );
      }

      if (latestSession && WORKER_LIVE_STATUSES.has(latestSession.status)) {
        await this.taskRepository.updateSession(latestSession.id, {
          endedAt: new Date().toISOString(),
          exitCode: null,
          status: SESSION_STATUS.FAILED,
        });
      }

      const failedTask = await this.taskRepository.updateTask(task.id, {
        lastError: error?.message ?? "Lead session failed to start.",
      });

      return {
        ok: false,
        error: {
          code: TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
          details: { taskId },
          message: failedTask?.lastError ?? "Lead session failed to start.",
        },
      };
    }
  }

  async sendTaskMessage(taskId, input) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (![
      TASK_STATUS.ACTION_REQUIRED,
      TASK_STATUS.CLARIFYING,
      TASK_STATUS.EXECUTING,
      TASK_STATUS.MERGING,
      TASK_STATUS.PLANNING,
      TASK_STATUS.PLAN_REVIEW,
      TASK_STATUS.REVIEWING,
    ].includes(task.status)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_CLARIFYING,
        "Messages can only be sent while the leader conversation is active.",
        { status: task.status, taskId },
      );
    }

    const content = normalizeRequiredString(input?.content);

    if (!content) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_MESSAGE_REQUIRED,
        "Message content is required.",
        { taskId },
      );
    }

    let activeSession = this.runningLeadSessions.get(taskId);

    if (!activeSession) {
      const project = await this.projectRepository.findProjectById(task.projectId);

      if (!project) {
        return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId: task.projectId });
      }

      try {
        const resumedSession = await this.#spawnLeadSession(
          task,
          project,
          await this.taskRepository.listMessagesByTaskId(task.id),
        );
        activeSession = {
          runtime: resumedSession.runtime,
          sessionId: resumedSession.runningSession.id,
        };
      } catch (error) {
        return failure(
          TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
          error?.message ?? "Lead session is not running.",
          { taskId },
        );
      }
    }

    const nextTask = task.status === TASK_STATUS.PLAN_REVIEW
      ? await this.#updateTaskStatus(taskId, TASK_STATUS.PLANNING, {
          currentTask: task,
          lastError: null,
          publish: false,
        })
      : task;

    const message = await this.taskRepository.createMessage({
      content,
      role: MESSAGE_ROLE.USER,
      taskId,
    });

    try {
      await activeSession.runtime.sendInput(content);
    } catch (error) {
      const latestSession = activeSession?.sessionId
        ? await this.taskRepository.findSessionById(activeSession.sessionId).catch(() => null)
        : null;
      const wasCancelled = activeSession?.sessionId
        ? this.cancelledLeadSessionIds.has(activeSession.sessionId) || latestSession?.status === SESSION_STATUS.CANCELLED
        : false;

      if (wasCancelled) {
        return failure(
          TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
          "Lead session was stopped by the operator.",
          { taskId },
        );
      }

      return failure(
        TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
        error?.message ?? "Lead session is not running.",
        { taskId },
      );
    }

    if (nextTask.status !== task.status) {
      this.#publish(taskId, "task:status", {
        taskId,
        status: nextTask.status,
      });
    }

    return {
      ok: true,
      message,
      task: nextTask,
    };
  }

  async stopLeadSession(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const activeSession = this.runningLeadSessions.get(taskId) ?? null;

    if (!activeSession?.runtime || !activeSession.sessionId) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
        "Lead session is not running.",
        { taskId },
      );
    }

    this.cancelledLeadSessionIds.add(activeSession.sessionId);
    await activeSession.runtime.kill?.().catch(() => null);

    return {
      ok: true,
      task,
    };
  }

  async confirmRequirements(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status === TASK_STATUS.PLANNING) {
      return failure(
        TASK_SERVICE_ERROR_CODES.REQUIREMENTS_ALREADY_CONFIRMED,
        "Requirements are already confirmed for this task.",
        { taskId },
      );
    }

    if (task.status !== TASK_STATUS.CLARIFYING) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_CLARIFYING,
        "Requirements can only be confirmed from CLARIFYING.",
        { status: task.status, taskId },
      );
    }

    const confirmedTask = await this.#updateTaskStatus(taskId, TASK_STATUS.PLANNING, {
      currentTask: task,
      lastError: null,
      publish: false,
    });
    const taskAttachments = await this.taskRepository.listAttachmentsByTaskId(task.id);
    const existingMessages = await this.taskRepository.listMessagesByTaskId(task.id);
    const taskDocumentSnapshot = synthesizeTaskDocumentSnapshot(confirmedTask, existingMessages, taskAttachments);
    const confirmationMessage = await this.taskRepository.createMessage({
      content: "User confirmed that requirements are clear.",
      role: MESSAGE_ROLE.SYSTEM,
      taskId,
    });
    await this.taskRepository.createMessage({
      content: buildTaskDocumentSnapshotMessage(taskDocumentSnapshot),
      role: MESSAGE_ROLE.SYSTEM,
      taskId,
    });
    const planningMessages = await this.taskRepository.listMessagesByTaskId(task.id);
    const planningAgentContext = await this.#getPlanningAgentContext(confirmedTask.leadAgentType);

    let activeSession = this.runningLeadSessions.get(taskId);

    if (!activeSession) {
      const project = await this.projectRepository.findProjectById(task.projectId);

      if (!project) {
        return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId: task.projectId });
      }

      try {
        const resumedSession = await this.#spawnLeadSession(
          confirmedTask,
          project,
          planningMessages,
        );
        activeSession = {
          runtime: resumedSession.runtime,
          sessionId: resumedSession.runningSession.id,
        };
      } catch {
        activeSession = null;
      }
    }

    if (activeSession) {
      try {
        await activeSession.runtime.sendInput(buildPlanningPrompt(confirmedTask, {
          ...planningAgentContext,
          taskDocumentSnapshot,
          transcriptMessages: planningMessages,
        }));
      } catch {
        // Confirmation already advanced the task; keep planning state stable for the next phase.
      }
    }

    this.#publish(taskId, "task:status", {
      taskId,
      status: confirmedTask.status,
    });

    return {
      ok: true,
      message: confirmationMessage,
      task: confirmedTask,
    };
  }

  async sendMailboxMessage(taskId, input = {}) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (![TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING, TASK_STATUS.MERGING, TASK_STATUS.REVIEWING].includes(task.status)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_NOT_AVAILABLE,
        "Mailbox notes are only available after plan approval while the task is still active.",
        { status: task.status, taskId },
      );
    }

    const content = normalizeRequiredString(input?.content);
    const senderSubTaskId = normalizeRequiredString(input?.senderSubTaskId);
    const targetSubTaskId = normalizeRequiredString(input?.targetSubTaskId);
    const targetTypeInput = normalizeOptionalString(input?.targetType);
    const messageTypeInput = normalizeOptionalString(input?.messageType);
    const targetType = targetTypeInput
      ? normalizeMailboxTargetType(targetTypeInput)
      : targetSubTaskId
        ? MAILBOX_TARGET_TYPE.SUBTASK
        : senderSubTaskId
          ? MAILBOX_TARGET_TYPE.LEAD
          : null;
    const messageType = messageTypeInput
      ? normalizeMailboxMessageType(messageTypeInput)
      : MAILBOX_MESSAGE_TYPE.NOTE;
    const artifactRefs = normalizeStringArray(input?.artifactRefs);
    const fileRefs = normalizeStringArray(input?.fileRefs);
    const branchRef = normalizeOptionalString(input?.branchRef);
    const schemaJson = normalizeOptionalJsonObject(input?.schemaJson);
    const requiresAck = Boolean(input?.requiresAck);

    if (!content) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_MESSAGE_REQUIRED,
        "Mailbox message content is required.",
        { taskId },
      );
    }

    if (!messageType) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_MESSAGE_TYPE_INVALID,
        "Mailbox messageType is invalid.",
        { taskId },
      );
    }

    if (input?.schemaJson !== undefined && schemaJson === null) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_SCHEMA_INVALID,
        "schemaJson must be a JSON object when supplied.",
        { taskId },
      );
    }

    if (!targetType) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_TARGET_REQUIRED,
        "Mailbox messages must target either the lead or a subtask.",
        { taskId },
      );
    }

    let targetSubTask = null;

    if (targetType === MAILBOX_TARGET_TYPE.SUBTASK) {
      if (!targetSubTaskId) {
        return failure(
          TASK_SERVICE_ERROR_CODES.MAILBOX_TARGET_REQUIRED,
          "Mailbox messages targeting a subtask must include targetSubTaskId.",
          { taskId },
        );
      }

      targetSubTask = await this.taskRepository.findSubTaskById(targetSubTaskId);

      if (!targetSubTask || targetSubTask.taskId !== taskId) {
        return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", {
          subTaskId: targetSubTaskId,
          taskId,
        });
      }
    }

    let senderType = MAILBOX_PARTICIPANT_TYPE.LEAD;
    let senderSubTask = null;

    if (senderSubTaskId) {
      senderSubTask = await this.taskRepository.findSubTaskById(senderSubTaskId);

      if (!senderSubTask || senderSubTask.taskId !== taskId) {
        return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", {
          subTaskId: senderSubTaskId,
          taskId,
        });
      }

      senderType = MAILBOX_PARTICIPANT_TYPE.SUBTASK;
    }

    if (senderType === MAILBOX_PARTICIPANT_TYPE.LEAD && targetType === MAILBOX_TARGET_TYPE.LEAD) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_TARGET_REQUIRED,
        "Mailbox messages must target another participant.",
        { taskId },
      );
    }

    if (
      senderType === MAILBOX_PARTICIPANT_TYPE.SUBTASK
      && targetType === MAILBOX_TARGET_TYPE.SUBTASK
      && senderSubTask?.id
      && senderSubTask.id === targetSubTask?.id
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.MAILBOX_TARGET_REQUIRED,
        "Subtasks cannot send mailbox messages to themselves.",
        {
          subTaskId: senderSubTask.id,
          taskId,
        },
      );
    }

    const message = await this.#createMailboxMessage({
      artifactRefs,
      branchRef,
      content,
      fileRefs,
      messageType,
      requiresAck,
      schemaJson,
      senderSubTaskId: senderSubTask?.id ?? null,
      senderType,
      targetSubTaskId: targetSubTask?.id ?? null,
      targetType,
      taskId,
    });

    return {
      ok: true,
      message,
    };
  }

  async updateCurrentPlanDraft(taskId, payload) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status !== TASK_STATUS.PLAN_REVIEW) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW,
        "Plan drafts can only be edited during PLAN_REVIEW.",
        { status: task.status, taskId },
      );
    }

    const validation = await this.#validatePlanPayload(payload);

    if (!validation.ok) {
      return validation;
    }

    const nextTask = await this.taskRepository.updateTask(taskId, {
      currentPlanJson: JSON.stringify(validation.plan),
      lastError: null,
    });

    return {
      ok: true,
      currentPlan: validation.plan,
      task: nextTask,
    };
  }

  async approvePlan(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status === TASK_STATUS.EXECUTING && typeof task.approvedPlanJson === "string") {
      return {
        ok: true,
        approvalReady: true,
        currentPlan: parseCurrentPlanJson(task.approvedPlanJson) ?? parseCurrentPlanJson(task.currentPlanJson),
        idempotent: true,
        subTasks: await this.taskRepository.listSubTasksByTaskId(taskId),
        task,
      };
    }

    if (task.status !== TASK_STATUS.PLAN_REVIEW) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW,
        "Plan approval is only available during PLAN_REVIEW.",
        { status: task.status, taskId },
      );
    }

    const parsedPlan = parseCurrentPlanJson(task.currentPlanJson);
    const validation = await this.#validatePlanPayload(parsedPlan);

    if (!validation.ok) {
      return validation;
    }

    const approvedPlanJson = JSON.stringify(validation.plan);
    const approvalResult = await this.taskRepository.runInTransaction(async (repository) => {
      const currentTask = await repository.findTaskById(taskId);

      if (!currentTask) {
        throw new TaskServiceError({
          code: TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND,
          message: "Task not found.",
          details: { taskId },
        });
      }

      if (currentTask.status === TASK_STATUS.EXECUTING && typeof currentTask.approvedPlanJson === "string") {
        return {
          approvedSnapshot: null,
          idempotent: true,
          subTasks: await repository.listSubTasksByTaskId(taskId),
          task: currentTask,
        };
      }

      if (currentTask.status !== TASK_STATUS.PLAN_REVIEW) {
        throw new TaskServiceError({
          code: TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW,
          message: "Plan approval is only available during PLAN_REVIEW.",
          details: { status: currentTask.status, taskId },
        });
      }

      const approvedTask = await repository.updateTask(taskId, {
        approvedPlanJson,
        lastError: null,
      });
      const approvedSnapshot = await repository.createPlanSnapshot({
        payload: approvedPlanJson,
        source: PLAN_SNAPSHOT_SOURCE.APPROVED,
        taskId,
        version: approvedTask.planVersion,
      });
      const subTasks = [];
      const subTaskSeedTime = Date.now();

      for (const [index, subtask] of getPlanNodes(validation.plan).entries()) {
        const dependencyBranchSuffixes = subtask.depends_on ?? [];
        subTasks.push(await repository.createSubTask({
          agentType: subtask.recommended_agent,
          assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.LEAD,
          autoAssigned: true,
          branchName: null,
          branchSuffix: subtask.branch_suffix,
          createdAt: new Date(subTaskSeedTime + index).toISOString(),
          dependencyBranchSuffixes,
          description: subtask.description,
          displayName: subtask.title,
          executionOrder: index + 1,
          role: subtask.role,
          status: dependencyBranchSuffixes.length > 0 ? SUBTASK_STATUS.BLOCKED : SUBTASK_STATUS.PENDING,
          taskId,
          title: subtask.title,
          updatedAt: new Date(subTaskSeedTime + index).toISOString(),
          worktreePath: null,
        }));
      }
      const executingTask = await repository.updateTask(taskId, {
        approvedPlanJson,
        lastError: null,
        status: TASK_STATUS.EXECUTING,
      });

      return {
        approvedSnapshot,
        idempotent: false,
        subTasks,
        task: executingTask,
      };
    });

    if (!approvalResult.idempotent) {
      this.#publish(taskId, "task:status", {
        taskId,
        status: approvalResult.task.status,
      });

      for (const subTask of approvalResult.subTasks) {
        this.#publish(taskId, "subtask:assigned", {
          agentType: subTask.agentType,
          assignmentSource: subTask.assignmentSource,
          displayName: subTask.displayName,
          role: subTask.role,
          status: subTask.status,
          subtaskId: subTask.id,
          taskId,
        });
        this.#publishSubTaskStatus(taskId, subTask);
      }
      void this.#publishTeamUpdated(taskId);

      queueMicrotask(() => {
        void this.#progressDependencySchedule(taskId);
      });
    }

    return {
      ok: true,
      approvalReady: true,
      approvedSnapshot: approvalResult.approvedSnapshot,
      currentPlan: validation.plan,
      idempotent: approvalResult.idempotent,
      subTasks: approvalResult.subTasks,
      task: approvalResult.task,
    };
  }

  async restorePlanSnapshot(taskId, snapshotId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status !== TASK_STATUS.PLAN_REVIEW) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW,
        "Plan restore is only available during PLAN_REVIEW.",
        { status: task.status, taskId },
      );
    }

    const snapshot = await this.taskRepository.findPlanSnapshotById(snapshotId);

    if (!snapshot || snapshot.taskId !== taskId) {
      return failure(
        TASK_SERVICE_ERROR_CODES.PLAN_SNAPSHOT_NOT_FOUND,
        "Plan snapshot not found.",
        { snapshotId, taskId },
      );
    }

    const nextTask = await this.taskRepository.updateTask(taskId, {
      currentPlanJson: snapshot.payload,
      lastError: null,
    });

    await this.taskRepository.createPlanSnapshot({
      payload: snapshot.payload,
      source: PLAN_SNAPSHOT_SOURCE.RESTORED_FROM_HISTORY,
      taskId,
      version: nextTask.planVersion,
    });

    this.#publish(taskId, "task:plan-restored", {
      currentPlan: parseCurrentPlanJson(snapshot.payload),
      snapshotId,
      taskId,
    });

    return {
      ok: true,
      currentPlan: parseCurrentPlanJson(snapshot.payload),
      snapshotId,
      task: nextTask,
    };
  }

  async retrySubTask(subTaskId, input = {}) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (![TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task.status)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_RETRY_NOT_ALLOWED,
        "Subtask retry is only available while the task is executing or action is required.",
        { status: task.status, subTaskId },
      );
    }

    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS,
        "The subtask already has a live worker session.",
        { subTaskId },
      );
    }

    const nextDescription = normalizeRequiredString(input.description) ?? subTask.description;
    const resumedTask = task.status === TASK_STATUS.ACTION_REQUIRED
      ? await this.#updateTaskStatus(task.id, TASK_STATUS.EXECUTING, {
          currentTask: task,
          lastError: null,
          publish: false,
        })
      : task;
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
      description: nextDescription,
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: SUBTASK_STATUS.PENDING,
    });

    if (resumedTask.status !== task.status) {
      this.#publish(task.id, "task:status", {
        taskId: task.id,
        status: resumedTask.status,
      });
    }

    this.#publish(task.id, "subtask:retry", {
      description: nextDescription,
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, pendingSubTask);

    const launchResult = await this.#launchSubTask(task.id, subTaskId, { isRetry: true });

    if (!launchResult.ok) {
      return launchResult;
    }

    return {
      ok: true,
      session: this.#decorateSession(launchResult.session),
      subTask: this.#decorateSubTask(launchResult.subTask),
      task: launchResult.task ?? resumedTask,
    };
  }

  async reworkSubTask(subTaskId, input = {}) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (task.status !== TASK_STATUS.EXECUTING) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REWORK_NOT_ALLOWED,
        "Early rework is only available while the task is executing.",
        { status: task.status, subTaskId },
      );
    }

    if (!isEarlyReworkEligible(subTask)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REWORK_NOT_ALLOWED,
        "This subtask does not have an actionable incremental review yet.",
        {
          latestReviewDecision: subTask.latestReviewDecision ?? null,
          status: subTask.status,
          subTaskId,
        },
      );
    }

    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS,
        "The subtask already has a live worker session.",
        { subTaskId },
      );
    }

    const nextDescription = normalizeRequiredString(input.description) ?? subTask.description;
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
      description: nextDescription,
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: SUBTASK_STATUS.PENDING,
    });

    this.#publish(task.id, "subtask:rework", {
      description: nextDescription,
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, pendingSubTask);

    const launchResult = await this.#launchSubTask(task.id, subTaskId, { isRetry: true });

    if (!launchResult.ok) {
      return launchResult;
    }

    return {
      ok: true,
      session: this.#decorateSession(launchResult.session),
      subTask: this.#decorateSubTask(launchResult.subTask),
      task: launchResult.task,
    };
  }

  async changeSubTaskAgent(subTaskId, input = {}) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (!isAgentChangeEligible(task, subTask)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_CHANGE_AGENT_NOT_ALLOWED,
        "Changing the assigned worker is not allowed from the current subtask state.",
        {
          status: subTask.status,
          subTaskId,
          taskStatus: task.status,
        },
      );
    }

    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS,
        "The subtask already has a live worker session.",
        { subTaskId },
      );
    }

    const nextAgentType = normalizeRequiredString(input.agentType);

    if (!nextAgentType) {
      return failure(
        TASK_SERVICE_ERROR_CODES.AGENT_TYPE_REQUIRED,
        "A replacement worker agent is required before relaunch.",
        { subTaskId },
      );
    }

    if (nextAgentType === subTask.agentType) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_CHANGE_AGENT_NOT_ALLOWED,
        "Select a different worker agent before using Switch Agent & Relaunch.",
        { agentType: nextAgentType, subTaskId },
      );
    }

    const nextDescription = normalizeRequiredString(input.description) ?? subTask.description;
    const resumedTask = task.status === TASK_STATUS.ACTION_REQUIRED
      ? await this.#updateTaskStatus(task.id, TASK_STATUS.EXECUTING, {
          currentTask: task,
          lastError: null,
          publish: false,
        })
      : task;
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      agentType: nextAgentType,
      assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
      autoAssigned: false,
      description: nextDescription,
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: SUBTASK_STATUS.PENDING,
    });

    if (resumedTask.status !== task.status) {
      this.#publish(task.id, "task:status", {
        taskId: task.id,
        status: resumedTask.status,
      });
    }

    this.#publish(task.id, "subtask:agent-changed", {
      newAgentType: nextAgentType,
      oldAgentType: subTask.agentType,
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, pendingSubTask);
    void this.#publishTeamUpdated(task.id);

    const launchResult = await this.#launchSubTask(task.id, subTaskId, { isRetry: true });

    if (!launchResult.ok) {
      return launchResult;
    }

    return {
      ok: true,
      session: this.#decorateSession(launchResult.session),
      subTask: this.#decorateSubTask(launchResult.subTask),
      task: launchResult.task,
    };
  }

  async reassignSubTask(subTaskId, input = {}) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (!isSubTaskReassignEligible(task, subTask)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REASSIGN_NOT_ALLOWED,
        "Reassigning this member is not allowed from the current task or subtask state.",
        {
          status: subTask.status,
          subTaskId,
          taskStatus: task.status,
        },
      );
    }

    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS,
        "The subtask already has a live worker session.",
        { subTaskId },
      );
    }

    const nextAgentType = normalizeRequiredString(input.agentType) ?? subTask.agentType;
    const nextDescription = normalizeRequiredString(input.description) ?? subTask.description;
    const resumedTask = task.status === TASK_STATUS.ACTION_REQUIRED
      ? await this.#updateTaskStatus(task.id, TASK_STATUS.EXECUTING, {
          currentTask: task,
          lastError: null,
          publish: false,
        })
      : task;
    const siblingSubTasks = await this.taskRepository.listSubTasksByTaskId(task.id);
    const nextStatus = areSubTaskDependenciesSatisfied(subTask, siblingSubTasks)
      ? SUBTASK_STATUS.PENDING
      : SUBTASK_STATUS.BLOCKED;
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      agentType: nextAgentType,
      assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
      autoAssigned: false,
      description: nextDescription,
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: nextStatus,
    });

    if (resumedTask.status !== task.status) {
      this.#publish(task.id, "task:status", {
        taskId: task.id,
        status: resumedTask.status,
      });
    }

    this.#publish(task.id, "subtask:assigned", {
      agentType: pendingSubTask.agentType,
      assignmentSource: pendingSubTask.assignmentSource,
      displayName: pendingSubTask.displayName,
      reason: normalizeRequiredString(input.reason) ?? null,
      role: pendingSubTask.role,
      status: pendingSubTask.status,
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, pendingSubTask);
    void this.#publishTeamUpdated(task.id);

    if (pendingSubTask.status === SUBTASK_STATUS.BLOCKED) {
      await this.#progressDependencySchedule(task.id);
      await this.#maybeStartFinalReview(task.id);

      return {
        ok: true,
        session: null,
        subTask: this.#decorateSubTask(pendingSubTask),
        task: resumedTask,
      };
    }

    const launchResult = await this.#launchSubTask(task.id, subTaskId, { isRetry: true });

    if (!launchResult.ok) {
      return launchResult;
    }

    return {
      ok: true,
      session: this.#decorateSession(launchResult.session),
      subTask: this.#decorateSubTask(launchResult.subTask),
      task: launchResult.task ?? resumedTask,
    };
  }

  async cancelSubTask(subTaskId) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (!isSubTaskCancelEligible(task, subTask)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_CANCEL_NOT_ALLOWED,
        "Cancelling this member is not allowed from the current task or subtask state.",
        {
          status: subTask.status,
          subTaskId,
          taskStatus: task.status,
        },
      );
    }

    const liveSession = resolveLatestLiveWorkerSession(await this.taskRepository.listSessionsBySubTaskId(subTaskId));
    const runningSession = this.runningWorkerSessions.get(subTaskId) ?? null;
    const cancelledAt = new Date().toISOString();

    if (runningSession?.sessionId) {
      this.cancelledWorkerSessionIds.add(runningSession.sessionId);
      await runningSession.runtime?.kill?.().catch(() => null);
      this.runningWorkerSessions.delete(subTaskId);
    }

    const cancelledSession = liveSession
      ? await this.taskRepository.updateSession(liveSession.id, {
          endedAt: cancelledAt,
          exitCode: null,
          status: SESSION_STATUS.CANCELLED,
        })
      : null;
    const cancelledSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
      lastError: null,
      status: SUBTASK_STATUS.CANCELLED,
    });

    if (cancelledSession) {
      this.#publishSessionEvent(task.id, "session:ended", cancelledSession);
    }

    this.#publish(task.id, "subtask:cancelled", {
      status: cancelledSubTask.status,
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, cancelledSubTask);
    void this.#publishTeamUpdated(task.id);

    await this.#progressDependencySchedule(task.id);
    await this.#maybeStartFinalReview(task.id);

    return {
      ok: true,
      session: cancelledSession ? this.#decorateSession(cancelledSession) : null,
      subTask: this.#decorateSubTask(cancelledSubTask),
      task: await this.taskRepository.findTaskById(task.id),
    };
  }

  async confirmDiscardSubTask(subTaskId) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const task = await this.taskRepository.findTaskById(subTask.taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    if (task.status !== TASK_STATUS.ACTION_REQUIRED || subTask.status !== SUBTASK_STATUS.DISCARD_PENDING) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_DISCARD_NOT_ALLOWED,
        "Discard confirmation is only available for DISCARD_PENDING subtasks while the task is ACTION_REQUIRED.",
        {
          status: subTask.status,
          subTaskId,
          taskStatus: task.status,
        },
      );
    }

    const discardedSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      status: SUBTASK_STATUS.DISCARDED,
    });

    this.#publish(task.id, "subtask:confirm-discard", {
      subtaskId: subTaskId,
      taskId: task.id,
    });
    this.#publishSubTaskStatus(task.id, discardedSubTask);

    const routedTask = await this.#routeTaskForFinalReviewOutcome(task.id);

    return {
      ok: true,
      subTask: this.#decorateSubTask(discardedSubTask),
      task: routedTask,
    };
  }

  async resumeTask(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    if (task.status !== TASK_STATUS.ACTION_REQUIRED) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_RESUME_NOT_ALLOWED,
        "Task resume is only available while action is required.",
        { status: task.status, taskId },
      );
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);

    if (!isMergeResumeEligible(subTasks)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_RESUME_NOT_ALLOWED,
        "Task resume is only available for merge-time blockers after unresolved subtasks have been handled.",
        { taskId },
      );
    }

    const resumedTask = await this.#updateTaskStatus(taskId, TASK_STATUS.MERGING, {
      currentTask: task,
      lastError: null,
    });

    return {
      ok: true,
      task: resumedTask,
    };
  }

  async rebaseRetrySubTask(subTaskId) {
    const subTask = await this.taskRepository.findSubTaskById(subTaskId);

    if (!subTask) {
      return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId });
    }

    const [task, latestMergeRecord] = await Promise.all([
      this.taskRepository.findTaskById(subTask.taskId),
      this.#findLatestMergeRecord(subTaskId),
    ]);

    if (!task) {
      return failure(TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId: subTask.taskId });
    }

    const taskMainlineBranchName = this.#resolveTaskMainlineBranchName(task);
    const rebaseRetryEligibleStatuses = new Set([SUBTASK_STATUS.ACCEPTED, SUBTASK_STATUS.REVIEW_PENDING]);

    if (
      task.status !== TASK_STATUS.ACTION_REQUIRED
      || !rebaseRetryEligibleStatuses.has(subTask.status)
      || !latestMergeRecord
      || latestMergeRecord.operation !== MERGE_OPERATION.MERGE
      || latestMergeRecord.status !== MERGE_STATUS.CONFLICT
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REBASE_RETRY_NOT_ALLOWED,
        "Rebase & Retry is only available for accepted or review-pending subtasks whose latest merge attempt conflicted.",
        {
          latestMergeRecord: latestMergeRecord
            ? {
                operation: latestMergeRecord.operation,
                status: latestMergeRecord.status,
              }
            : null,
          status: subTask.status,
          subTaskId,
          taskStatus: task.status,
        },
      );
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId: task.projectId });
    }

    const preparedSubTask = await this.#ensureMergeWorkspace(task, project, subTask);

    if (!preparedSubTask.ok) {
      return preparedSubTask;
    }

    const rebasedSubTask = preparedSubTask.subTask;
    const rebaseTargetBranch = latestMergeRecord.targetBranch ?? task.baseBranch;
    const rebaseResult = await rebaseBranch(rebasedSubTask.worktreePath, rebaseTargetBranch);

    if (!rebaseResult.ok) {
      const conflictSummary = await this.#buildRebaseConflictSummary(rebasedSubTask.worktreePath, rebaseResult);

      await abortRebase(rebasedSubTask.worktreePath).catch(() => null);
      await this.taskRepository.createMergeRecord({
        completedAt: new Date().toISOString(),
        conflictSummary,
        operation: MERGE_OPERATION.REBASE,
        sourceBranch: rebasedSubTask.branchName,
        status: MERGE_STATUS.CONFLICT,
        subTaskId: rebasedSubTask.id,
        targetBranch: rebaseTargetBranch,
      });

      const conflictedSubTask = await this.taskRepository.updateSubTask(rebasedSubTask.id, {
        lastError: conflictSummary,
      });

      this.#publish(task.id, "merge:status", {
        status: MERGE_STATUS.CONFLICT,
        subtaskId: rebasedSubTask.id,
      summary: conflictSummary,
    });
    this.#publishSubTaskStatus(task.id, conflictedSubTask);

      return {
        ok: true,
        mergeStatus: MERGE_STATUS.CONFLICT,
        subTask: this.#decorateSubTask(conflictedSubTask),
        task,
      };
    }

    const completedAt = new Date().toISOString();
    const resultCommitSha = await resolveRevision(rebasedSubTask.worktreePath, "HEAD").catch(() => null);
    await this.taskRepository.createMergeRecord({
      completedAt,
      operation: MERGE_OPERATION.REBASE,
      resultCommitSha,
      sourceBranch: rebasedSubTask.branchName,
      status: MERGE_STATUS.SUCCEEDED,
      subTaskId: rebasedSubTask.id,
      targetBranch: rebaseTargetBranch,
    });

    const nextSubTask = await this.taskRepository.updateSubTask(rebasedSubTask.id, {
      lastError: null,
    });
    this.#publish(task.id, "merge:status", {
      status: MERGE_STATUS.SUCCEEDED,
      subtaskId: rebasedSubTask.id,
      summary: `Rebased ${rebasedSubTask.branchName} onto ${rebaseTargetBranch}. Retrying merge.`,
    });
    this.#publishSubTaskStatus(task.id, nextSubTask);

    let nextTask = task;

    if (taskMainlineBranchName && rebaseTargetBranch === taskMainlineBranchName) {
      const syncResult = await this.#syncSubTaskIntoTaskMainline(task.id, rebasedSubTask.id);

      if (!syncResult.ok) {
        return {
          ok: true,
          mergeStatus: MERGE_STATUS.CONFLICT,
          subTask: this.#decorateSubTask(await this.taskRepository.findSubTaskById(rebasedSubTask.id)),
          task: await this.taskRepository.findTaskById(task.id),
        };
      }

      nextTask = await this.#updateTaskStatus(task.id, TASK_STATUS.EXECUTING, {
        currentTask: task,
        lastError: null,
      });
      await this.#maybeStartFinalReview(task.id);
    } else if (rebaseTargetBranch !== task.baseBranch) {
      const latestIntegrationRun = await this.taskRepository.findLatestIntegrationRunByTaskId(task.id);

      if (latestIntegrationRun) {
        const queueItems = await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(latestIntegrationRun.id);
        const conflictedQueueItem = queueItems.find((queueItem) => queueItem.subTaskId === rebasedSubTask.id) ?? null;

        if (conflictedQueueItem) {
          await this.taskRepository.updateIntegrationQueueItem(conflictedQueueItem.id, {
            status: INTEGRATION_QUEUE_ITEM_STATUS.QUEUED,
          });
        }

        await this.taskRepository.updateIntegrationRun(latestIntegrationRun.id, {
          endedAt: null,
          status: INTEGRATION_RUN_STATUS.QUEUED,
        });
        this.#queueIntegrationExecution(latestIntegrationRun.id);
      }
    } else {
      nextTask = await this.#updateTaskStatus(task.id, TASK_STATUS.MERGING, {
        currentTask: task,
        lastError: null,
      });
      this.#queueMergeExecution(task.id);
    }

    return {
      ok: true,
      mergeStatus: MERGE_STATUS.SUCCEEDED,
      subTask: this.#decorateSubTask(nextSubTask),
      task: (await this.taskRepository.findTaskById(task.id)) ?? nextTask,
    };
  }

  async #updateTaskStatus(taskId, status, options = {}) {
    if (this.closed) {
      return options.currentTask ?? null;
    }

    const currentTask = options.currentTask ?? await this.taskRepository.findTaskById(taskId);

    if (!currentTask) {
      return null;
    }

    const updates = { status };

    if (Object.prototype.hasOwnProperty.call(options, "lastError")) {
      updates.lastError = options.lastError;
    }

    const nextTask = await this.taskRepository.updateTask(taskId, updates);

    if (!nextTask) {
      return null;
    }

    if (currentTask.status !== nextTask.status && TERMINAL_TASK_STATUSES.has(nextTask.status)) {
      queueMicrotask(() => {
        void this.#attemptTaskCleanup(nextTask);
      });
    }

    if (options.publish !== false) {
      this.#publish(taskId, "task:status", {
        ...(options.reason ? { reason: options.reason } : {}),
        taskId,
        status: nextTask.status,
      });
    }

    return nextTask;
  }

  async #attemptTaskCleanup(task) {
    if (this.closed || !task || !TERMINAL_TASK_STATUSES.has(task.status) || this.pendingCleanupTasks.has(task.id)) {
      return;
    }

    this.pendingCleanupTasks.add(task.id);

    try {
      const [project, subTasks] = await Promise.all([
        this.projectRepository.findProjectById(task.projectId),
        this.taskRepository.listSubTasksByTaskId(task.id),
      ]);

      if (!project) {
        return;
      }

      await this.#withProjectGitLock(project.path, async () => {
        for (const subTask of subTasks) {
          if (this.closed) {
            return;
          }

          if (!subTask.worktreePath) {
            continue;
          }

          if (await this.#hasLiveWorkerSession(subTask.id)) {
            await this.#recordCleanupWarning(task.id, subTask.worktreePath, "Cleanup skipped because a live worker session still owns this worktree.");
            continue;
          }

          const cleanupResult = await this.#removeWorktreeWithRetries(project.path, subTask.worktreePath);

          if (!cleanupResult.ok) {
            const reason = buildCleanupFailureReason(cleanupResult);
            await this.#recordCleanupWarning(task.id, subTask.worktreePath, reason);
          }
        }
      });
    } finally {
      this.pendingCleanupTasks.delete(task.id);
    }
  }

  async #recordCleanupWarning(taskId, worktreePath, reason) {
    if (this.closed) {
      return;
    }

    const normalizedReason = normalizeRequiredString(reason) ?? "Cleanup failed.";
    const warning = {
      reason: normalizedReason,
      worktreePath,
    };

    await this.taskRepository.createMessage({
      content: buildCleanupWarningMessage(warning),
      role: MESSAGE_ROLE.SYSTEM,
      taskId,
    });

    this.#publish(taskId, "task:cleanup-warning", {
      reason: normalizedReason,
      taskId,
      worktreePath,
    });
  }

  async #createIntegrationRun(task, subTasks) {
    if (this.closed) {
      return null;
    }

    const acceptedSubTasks = (subTasks ?? []).filter((subTask) => subTask.status === SUBTASK_STATUS.ACCEPTED);

    if (acceptedSubTasks.length === 0) {
      await this.#completeTaskIfMergeResolved(task.id);
      return null;
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      await this.#setTaskActionRequired(task.id, "Project not found for integration run.");
      return null;
    }

    const integrationRun = await this.#withProjectGitLock(project.path, async () => {
      const existingRuns = await this.taskRepository.listIntegrationRunsByTaskId(task.id);
      const desiredIntegrationBranch = `eat/${task.id}/integration-${existingRuns.length + 1}`;
      const integrationBranch = await resolveUniqueBranchName(project.path, desiredIntegrationBranch);

      return this.taskRepository.createIntegrationRun({
        integrationBranch,
        status: INTEGRATION_RUN_STATUS.QUEUED,
        taskId: task.id,
      });
    });

    for (const [index, subTask] of acceptedSubTasks.entries()) {
      await this.taskRepository.createIntegrationQueueItem({
        integrationRunId: integrationRun.id,
        queueOrder: index + 1,
        status: INTEGRATION_QUEUE_ITEM_STATUS.QUEUED,
        subTaskId: subTask.id,
      });
    }

    this.#publish(task.id, "integration:queued", {
      integrationBranch: integrationRun.integrationBranch,
      integrationRunId: integrationRun.id,
      queueLength: acceptedSubTasks.length,
      status: integrationRun.status,
      taskId: task.id,
    });

    if (this.closed) {
      return integrationRun;
    }

    this.#queueIntegrationExecution(integrationRun.id);

    return integrationRun;
  }

  #queueIntegrationExecution(integrationRunId) {
    if (this.closed || this.pendingIntegrationExecutions.has(integrationRunId)) {
      return;
    }

    this.pendingIntegrationExecutions.add(integrationRunId);

    queueMicrotask(() => {
      void this.#runIntegrationExecution(integrationRunId)
        .catch(() => null)
        .finally(() => {
          this.pendingIntegrationExecutions.delete(integrationRunId);
        });
    });
  }

  async #runIntegrationExecution(integrationRunId) {
    if (this.closed) {
      return;
    }

    let integrationRun = await this.taskRepository.findIntegrationRunById(integrationRunId);

    if (!integrationRun || ![INTEGRATION_RUN_STATUS.QUEUED, INTEGRATION_RUN_STATUS.RUNNING].includes(integrationRun.status)) {
      return;
    }

    const task = await this.taskRepository.findTaskById(integrationRun.taskId);

    if (!task || task.status !== TASK_STATUS.MERGING) {
      return;
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      await this.#markIntegrationRunActionRequired(integrationRun, task, "Project not found for integration execution.");
      return;
    }

    await this.#withProjectGitLock(project.path, async () => {
      if (integrationRun.status === INTEGRATION_RUN_STATUS.QUEUED) {
        integrationRun = await this.taskRepository.updateIntegrationRun(integrationRun.id, {
          startedAt: integrationRun.startedAt ?? new Date().toISOString(),
          status: INTEGRATION_RUN_STATUS.RUNNING,
        });
        this.#publish(task.id, "integration:started", {
          integrationBranch: integrationRun.integrationBranch,
          integrationRunId: integrationRun.id,
          status: integrationRun.status,
          taskId: task.id,
        });
      }

      const prepareResult = await this.#prepareIntegrationBranch(task, project, integrationRun);

      if (this.closed) {
        return;
      }

      if (!prepareResult.ok) {
        await this.#markIntegrationRunActionRequired(integrationRun, task, prepareResult.reason);
        return;
      }

      let queueItems = await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRun.id);
      const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);
      const subTaskById = new Map(subTasks.map((subTask) => [subTask.id, subTask]));

      for (const queueItem of queueItems) {
        if (queueItem.status !== INTEGRATION_QUEUE_ITEM_STATUS.QUEUED) {
          continue;
        }

        const subTask = subTaskById.get(queueItem.subTaskId) ?? null;

        if (!subTask?.branchName) {
          await this.#markIntegrationRunActionRequired(
            integrationRun,
            task,
            `Accepted subtask ${subTask?.title ?? queueItem.subTaskId} does not have a branch available for integration.`,
          );
          return;
        }

        if (await isBranchMergedInto(project.path, subTask.branchName, integrationRun.integrationBranch)) {
          const mergedCommitSha = await resolveRevision(project.path, integrationRun.integrationBranch).catch(() => null);
          await this.taskRepository.createMergeRecord({
            completedAt: new Date().toISOString(),
            operation: MERGE_OPERATION.MERGE,
            resultCommitSha: mergedCommitSha,
            sourceBranch: subTask.branchName,
            status: MERGE_STATUS.SUCCEEDED,
            subTaskId: subTask.id,
            targetBranch: integrationRun.integrationBranch,
          });
          await this.taskRepository.updateIntegrationQueueItem(queueItem.id, {
            mergedCommitSha,
            status: INTEGRATION_QUEUE_ITEM_STATUS.MERGED,
          });
          continue;
        }

        const mergeResult = await mergeBranch(project.path, subTask.branchName);

        if (this.closed) {
          return;
        }

        if (!mergeResult.ok) {
          const conflictSummary = await this.#buildMergeConflictSummary(
            project.path,
            subTask,
            { baseBranch: integrationRun.integrationBranch },
            mergeResult,
          );

          await abortMerge(project.path).catch(() => null);
          await this.taskRepository.createMergeRecord({
            completedAt: new Date().toISOString(),
            conflictSummary,
            operation: MERGE_OPERATION.MERGE,
            sourceBranch: subTask.branchName,
            status: MERGE_STATUS.CONFLICT,
            subTaskId: subTask.id,
            targetBranch: integrationRun.integrationBranch,
          });
          await this.taskRepository.updateIntegrationQueueItem(queueItem.id, {
            status: INTEGRATION_QUEUE_ITEM_STATUS.FAILED,
          });

          const conflictedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
            lastError: conflictSummary,
          });

          this.#publish(task.id, "merge:status", {
            status: MERGE_STATUS.CONFLICT,
            subtaskId: subTask.id,
            summary: conflictSummary,
          });
          this.#publishSubTaskStatus(task.id, conflictedSubTask);
          await this.#markIntegrationRunActionRequired(integrationRun, task, buildMergeConflictActionRequiredReason(subTask, conflictSummary));
          return;
        }

        const mergedCommitSha = await resolveRevision(project.path, "HEAD").catch(() => null);
        await this.taskRepository.createMergeRecord({
          completedAt: new Date().toISOString(),
          operation: MERGE_OPERATION.MERGE,
          resultCommitSha: mergedCommitSha,
          sourceBranch: subTask.branchName,
          status: MERGE_STATUS.SUCCEEDED,
          subTaskId: subTask.id,
          targetBranch: integrationRun.integrationBranch,
        });
        await this.taskRepository.updateIntegrationQueueItem(queueItem.id, {
          mergedCommitSha,
          status: INTEGRATION_QUEUE_ITEM_STATUS.MERGED,
        });
      }

      queueItems = await this.taskRepository.listIntegrationQueueItemsByIntegrationRunId(integrationRun.id);
      const gateResults = await this.#runIntegrationGates(task, project, integrationRun, queueItems, subTasks);

      if (this.closed) {
        return;
      }

      if (gateResults.some((gateResult) => gateResult.status === GATE_RESULT_STATUS.FAILED)) {
        await this.#markIntegrationRunActionRequired(
          integrationRun,
          task,
          gateResults.filter((gateResult) => gateResult.status === GATE_RESULT_STATUS.FAILED).map((gateResult) => gateResult.summary).join(" "),
        );
        return;
      }

      const releaseResult = await this.#releaseIntegrationRun(task, project, integrationRun, queueItems, subTasks);

      if (this.closed) {
        return;
      }

      if (!releaseResult.ok) {
        await this.#markIntegrationRunActionRequired(integrationRun, task, releaseResult.reason);
        return;
      }

      const completedRun = await this.taskRepository.updateIntegrationRun(integrationRun.id, {
        endedAt: new Date().toISOString(),
        status: INTEGRATION_RUN_STATUS.COMPLETED,
      });

      for (const queueItem of queueItems) {
        if (queueItem.status !== INTEGRATION_QUEUE_ITEM_STATUS.MERGED) {
          continue;
        }

        await this.taskRepository.updateIntegrationQueueItem(queueItem.id, {
          status: INTEGRATION_QUEUE_ITEM_STATUS.RELEASED,
        });
      }

      this.#publish(task.id, "integration:completed", {
        integrationBranch: completedRun.integrationBranch,
        integrationRunId: completedRun.id,
        status: completedRun.status,
        taskId: task.id,
      });
      await this.#completeTaskIfMergeResolved(task.id);
    });
  }

  async #prepareIntegrationBranch(task, project, integrationRun) {
    try {
      const mergeTarget = await this.#ensureMergeTargetReady(task, project);

      if (!mergeTarget.ok) {
        return mergeTarget;
      }

      const integrationBaseBranch = this.#resolveTaskMainlineBranchName(task) ?? task.baseBranch;
      const baseHeadSha = await resolveRevision(project.path, integrationBaseBranch).catch(() => null);

      if (!baseHeadSha) {
        return {
          ok: false,
          reason: `Failed to resolve ${integrationBaseBranch} before preparing the integration branch.`,
        };
      }

      await ensureBranchExists(project.path, integrationRun.integrationBranch, baseHeadSha);
      const checkoutResult = await checkoutBranch(project.path, integrationRun.integrationBranch);

      if (!checkoutResult.ok) {
        return {
          ok: false,
          reason: `Failed to checkout integration branch ${integrationRun.integrationBranch}.`,
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error?.message ?? `Failed to prepare integration branch ${integrationRun.integrationBranch}.`,
      };
    }
  }

  async #runIntegrationGates(task, project, integrationRun, queueItems, subTasks) {
    if (this.closed) {
      return [];
    }

    const gateResults = await normalizeIntegrationGateResults(await this.integrationGateRunner({
      integrationRun,
      project,
      queueItems,
      subTasks,
      task,
    }));

    const persistedGateResults = [];

    for (const gateResult of gateResults) {
      const createdGateResult = await this.taskRepository.createGateResult({
        detailsJson: gateResult.detailsJson ?? null,
        gateType: gateResult.gateType,
        integrationRunId: integrationRun.id,
        status: gateResult.status,
        summary: gateResult.summary,
      });
      persistedGateResults.push(createdGateResult);
      this.#publish(task.id, "integration:gate-result", {
        gateType: createdGateResult.gateType,
        integrationRunId: integrationRun.id,
        status: createdGateResult.status,
        summary: createdGateResult.summary,
        taskId: task.id,
      });
    }

    return persistedGateResults;
  }

  async #releaseIntegrationRun(task, project, integrationRun, queueItems, subTasks) {
    if (this.closed) {
      return { ok: false, reason: "Integration release stopped because the task service is closing." };
    }

    const checkoutBaseResult = await checkoutBranch(project.path, task.baseBranch);

    if (!checkoutBaseResult.ok) {
      return {
        ok: false,
        reason: buildBaseBranchCheckoutFailureReason(task.baseBranch, checkoutBaseResult),
      };
    }

    const mergeTarget = await this.#ensureMergeTargetReady(task, project);

    if (!mergeTarget.ok) {
      return mergeTarget;
    }

    const mergeResult = await mergeBranch(project.path, integrationRun.integrationBranch);

    if (!mergeResult.ok) {
      await abortMerge(project.path).catch(() => null);
      return {
        ok: false,
        reason: `Failed to release ${integrationRun.integrationBranch} into ${task.baseBranch}.`,
      };
    }

    const queueItemSubTaskIds = new Set(queueItems.map((queueItem) => queueItem.subTaskId));

    for (const subTask of subTasks) {
      if (subTask.status !== SUBTASK_STATUS.ACCEPTED || !queueItemSubTaskIds.has(subTask.id)) {
        continue;
      }

      const releasedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
        lastError: null,
        status: SUBTASK_STATUS.MERGED,
      });
      this.#publishSubTaskStatus(task.id, releasedSubTask);
    }

    return { ok: true };
  }

  async #markIntegrationRunActionRequired(integrationRun, task, reason) {
    if (this.closed) {
      return null;
    }

    const nextRun = await this.taskRepository.updateIntegrationRun(integrationRun.id, {
      endedAt: new Date().toISOString(),
      status: INTEGRATION_RUN_STATUS.ACTION_REQUIRED,
    });

    this.#publish(task.id, "integration:failed", {
      integrationBranch: nextRun.integrationBranch,
      integrationRunId: nextRun.id,
      reason,
      status: nextRun.status,
      taskId: task.id,
    });

    await this.#setTaskActionRequired(task.id, reason);
  }

  #queueMergeExecution(taskId) {
    if (this.closed || this.pendingMergeExecutions.has(taskId)) {
      return;
    }

    this.pendingMergeExecutions.add(taskId);

    queueMicrotask(() => {
      void this.#runMergeExecution(taskId)
        .finally(() => {
          this.pendingMergeExecutions.delete(taskId);
        });
    });
  }

  async #runMergeExecution(taskId) {
    if (this.closed) {
      return;
    }

    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || task.status !== TASK_STATUS.MERGING) {
      return;
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      await this.#setTaskActionRequired(taskId, "Project not found for merge execution.");
      return;
    }

    await this.#withProjectGitLock(project.path, async () => {
      const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);

      for (const subTask of subTasks) {
        if (subTask.status !== SUBTASK_STATUS.ACCEPTED) {
          continue;
        }

        const mergeTarget = await this.#ensureMergeTargetReady(task, project);

        if (this.closed) {
          return;
        }

        if (!mergeTarget.ok) {
          await this.#setTaskActionRequired(taskId, mergeTarget.reason);
          return;
        }

        if (!subTask.branchName) {
          await this.#setTaskActionRequired(
            taskId,
            `Accepted subtask ${subTask.title} does not have a branch available for merge.`,
          );
          return;
        }

        if (await isBranchMergedInto(project.path, subTask.branchName, task.baseBranch)) {
          await this.#recordSuccessfulMerge(task, subTask, {
            resultCommitSha: await resolveRevision(project.path, task.baseBranch).catch(() => null),
            summary: `Detected ${subTask.branchName} already present on ${task.baseBranch}.`,
          });
          continue;
        }

        const mergeResult = await mergeBranch(project.path, subTask.branchName);

        if (this.closed) {
          return;
        }

        if (!mergeResult.ok) {
          const conflictSummary = await this.#buildMergeConflictSummary(project.path, subTask, task, mergeResult);

          await abortMerge(project.path).catch(() => null);
          await this.taskRepository.createMergeRecord({
            completedAt: new Date().toISOString(),
            conflictSummary,
            operation: MERGE_OPERATION.MERGE,
            sourceBranch: subTask.branchName,
            status: MERGE_STATUS.CONFLICT,
            subTaskId: subTask.id,
            targetBranch: task.baseBranch,
          });

          const conflictedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
            lastError: conflictSummary,
          });

          this.#publish(task.id, "merge:status", {
            status: MERGE_STATUS.CONFLICT,
            subtaskId: subTask.id,
            summary: conflictSummary,
          });
          this.#publishSubTaskStatus(task.id, conflictedSubTask);
          await this.#setTaskActionRequired(task.id, buildMergeConflictActionRequiredReason(subTask, conflictSummary));
          return;
        }

        await this.#recordSuccessfulMerge(task, subTask, {
          resultCommitSha: await resolveRevision(project.path, "HEAD").catch(() => null),
          summary: `Merged ${subTask.branchName} into ${task.baseBranch} with --no-ff.`,
        });
      }

      await this.#completeTaskIfMergeResolved(taskId);
    });
  }

  async #recordSuccessfulMerge(task, subTask, options = {}) {
    if (this.closed) {
      return subTask;
    }

    const completedAt = new Date().toISOString();
    const mergeRecord = await this.taskRepository.createMergeRecord({
      completedAt,
      operation: MERGE_OPERATION.MERGE,
      resultCommitSha: options.resultCommitSha ?? null,
      sourceBranch: subTask.branchName,
      status: MERGE_STATUS.SUCCEEDED,
      subTaskId: subTask.id,
      targetBranch: task.baseBranch,
    });
    const mergedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
      lastError: null,
      status: SUBTASK_STATUS.MERGED,
    });

    this.#publish(task.id, "merge:status", {
      status: mergeRecord.status,
      subtaskId: subTask.id,
      summary: options.summary ?? `Merged ${subTask.branchName} into ${task.baseBranch} with --no-ff.`,
    });
    this.#publishSubTaskStatus(task.id, mergedSubTask);

    return mergedSubTask;
  }

  #resolveTaskMainlineBranchName(task) {
    return normalizeRequiredString(task?.taskBranchName) ?? normalizeRequiredString(task?.baseBranch);
  }

  async #resolveTaskMainlineHeadCommit(task, project) {
    const taskBranchName = this.#resolveTaskMainlineBranchName(task);

    if (!taskBranchName) {
      return null;
    }

    await ensureBranchExists(project.path, taskBranchName, task.baseCommitSha);

    return resolveRevision(project.path, taskBranchName).catch(() => null);
  }

  async #ensureBranchReady(project, branchName) {
    if (await isWorkingTreeDirty(project.path)) {
      return {
        ok: false,
        reason: buildDirtyTargetBranchReason(branchName),
      };
    }

    const currentBranch = await getCurrentBranch(project.path);

    if (currentBranch === branchName) {
      return { ok: true };
    }

    const checkoutResult = await checkoutBranch(project.path, branchName);

    if (!checkoutResult.ok) {
      return {
        ok: false,
        reason: buildBaseBranchCheckoutFailureReason(branchName, checkoutResult),
      };
    }

    return { ok: true };
  }

  async #ensureMergeTargetReady(task, project) {
    return this.#ensureBranchReady(project, task.baseBranch);
  }

  async #ensureMergeWorkspace(task, project, subTask) {
    let nextSubTask = subTask;

    try {
      return this.#withProjectGitLock(project.path, async () => {
        if (!nextSubTask.branchName) {
          const desiredBranchName = computeDeterministicBranchName(task.id, nextSubTask.branchSuffix);
          const startCommitSha = nextSubTask.startCommitSha
            ?? await this.#resolveTaskMainlineHeadCommit(task, project)
            ?? task.baseCommitSha;
          await ensureBranchExists(project.path, desiredBranchName, startCommitSha);
          nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
            branchName: desiredBranchName,
            startCommitSha,
          });
        }

        await ensureBranchExists(project.path, nextSubTask.branchName, nextSubTask.startCommitSha ?? task.baseCommitSha);

        if (!nextSubTask.worktreePath) {
          const worktreePath = await resolveWorktreePath(project.path, task.id, nextSubTask.branchSuffix);
          await ensureWorktree(project.path, worktreePath, nextSubTask.branchName);
          nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
            worktreePath,
          });
        } else {
          await ensureWorktree(project.path, nextSubTask.worktreePath, nextSubTask.branchName);
        }

        return {
          ok: true,
          subTask: nextSubTask,
        };
      });
    } catch (error) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REBASE_RETRY_NOT_ALLOWED,
        error?.message ?? "Failed to prepare the subtask branch for rebase retry.",
        {
          subTaskId: subTask.id,
          taskId: task.id,
        },
      );
    }
  }

  async #buildMergeConflictSummary(repoPath, subTask, task, mergeResult) {
    const conflictFiles = await listConflictPaths(repoPath);

    if (conflictFiles.length > 0) {
      return `Merge conflict while integrating ${subTask.title}: ${conflictFiles.join(", ")}.`;
    }

    const gitOutput = [mergeResult.stderr, mergeResult.stdout].filter(Boolean).join("\n").trim();

    return gitOutput.length > 0
      ? tailUtf8(gitOutput, 512)
      : `Merge conflict while integrating ${subTask.branchName} into ${task.baseBranch}.`;
  }

  async #buildRebaseConflictSummary(worktreePath, rebaseResult) {
    const conflictFiles = await listConflictPaths(worktreePath);

    if (conflictFiles.length > 0) {
      return `Rebase conflict: ${conflictFiles.join(", ")}.`;
    }

    const gitOutput = [rebaseResult.stderr, rebaseResult.stdout].filter(Boolean).join("\n").trim();

    return gitOutput.length > 0
      ? tailUtf8(gitOutput, 512)
      : "Rebase conflict while replaying the subtask branch onto the latest base branch.";
  }

  async #findLatestMergeRecord(subTaskId) {
    return (await this.taskRepository.listMergeRecordsBySubTaskId(subTaskId)).at(-1) ?? null;
  }

  async #completeTaskIfMergeResolved(taskId) {
    const [task, subTasks] = await Promise.all([
      this.taskRepository.findTaskById(taskId),
      this.taskRepository.listSubTasksByTaskId(taskId),
    ]);

    if (!task) {
      return null;
    }

    if (!subTasks.every((subTask) => COMPLETED_SUBTASK_STATUSES.has(subTask.status))) {
      return task;
    }

    if (task.status === TASK_STATUS.COMPLETED) {
      return task;
    }

    const completedTask = await this.#updateTaskStatus(taskId, TASK_STATUS.COMPLETED, {
      currentTask: task,
      lastError: null,
    });

    return completedTask;
  }

  async #launchApprovedSubTasks(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || task.status !== TASK_STATUS.EXECUTING) {
      return;
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);
    const launchableSubTasks = subTasks.filter((subTask) => (
      subTask.status === SUBTASK_STATUS.PENDING
      && areSubTaskDependenciesSatisfied(subTask, subTasks)
    ));

    await Promise.allSettled(launchableSubTasks.map((subTask) => this.#launchSubTask(taskId, subTask.id)));
  }

  async #progressDependencySchedule(taskId) {
    if (this.closed) {
      return;
    }

    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || ![TASK_STATUS.EXECUTING, TASK_STATUS.ACTION_REQUIRED].includes(task.status)) {
      return;
    }

    let subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);
    let releasedAny = false;

    for (const subTask of subTasks) {
      if (subTask.status !== SUBTASK_STATUS.BLOCKED) {
        continue;
      }

      if (!areSubTaskDependenciesSatisfied(subTask, subTasks)) {
        continue;
      }

      const releasedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
        lastError: null,
        status: SUBTASK_STATUS.PENDING,
      });
      this.#publishSubTaskStatus(taskId, releasedSubTask);
      releasedAny = true;
    }

    if (releasedAny) {
      subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);
    }

    if (task.status === TASK_STATUS.EXECUTING) {
      await this.#launchApprovedSubTasks(taskId);
    }
  }

  async #launchSubTask(taskId, subTaskId) {
    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS,
        "The subtask already has a live worker session.",
        { subTaskId },
      );
    }

    this.pendingWorkerLaunches.add(subTaskId);

    try {
      const task = await this.taskRepository.findTaskById(taskId);
      const subTask = await this.taskRepository.findSubTaskById(subTaskId);

      if (!task || !subTask || subTask.taskId !== taskId) {
        return failure(TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND, "Subtask not found.", { subTaskId, taskId });
      }

      const project = await this.projectRepository.findProjectById(task.projectId);

      if (!project) {
        return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId: task.projectId });
      }

      const agentFactory = this.agentService.agentRegistry.get(subTask.agentType);
      const health = await this.agentService.getHealth();
      const agentHealth = health.agents?.[subTask.agentType] ?? null;

      if (!agentFactory?.capabilities?.canExecute) {
        return this.#failSubTaskLaunch(task, subTask, "Assigned worker agent is not executable.", {
          actionRequired: true,
        });
      }

      if (!agentHealth?.available) {
        return this.#failSubTaskLaunch(
          task,
          subTask,
          `Assigned worker agent is unavailable: ${agentHealth?.failureReason?.message ?? "health check failed."}`,
          { actionRequired: true },
        );
      }

      let preparedSubTask = await this.#prepareSubTaskWorkspace(task, project, subTask);

      if (!preparedSubTask.ok) {
        return preparedSubTask;
      }

      preparedSubTask = preparedSubTask.subTask;

      let sandboxType;
      let launchMetadata;
      let sandboxConfig = null;

      try {
        sandboxType = selectWorkerSandboxType(agentFactory.capabilities.supportedSandboxTypes);
        const attachments = await this.taskRepository.listAttachmentsByTaskId(task.id);
        launchMetadata = buildWorkerLaunchMetadata(attachments, agentFactory.capabilities);

        if (agentFactory.usesSandboxManager === true && this.sandboxManager) {
          sandboxConfig = this.sandboxManager.createWorkerSandboxConfig({
            attachments: launchMetadata.included,
            worktreePath: preparedSubTask.worktreePath,
          });
          await this.sandboxManager.assertDockerReady();
        }
      } catch (error) {
        return this.#failSubTaskLaunch(task, preparedSubTask, error?.message ?? "Worker launch validation failed.", {
          actionRequired: true,
        });
      }

      const session = await this.#createTrackedSession({
        agentType: preparedSubTask.agentType,
        sandboxType,
        sessionType: SESSION_TYPE.WORKER,
        status: SESSION_STATUS.STARTING,
        subTaskId: preparedSubTask.id,
        taskId: task.id,
      });

      this.workerLaunchMetadata.set(preparedSubTask.id, launchMetadata);
      this.workerSessionMetadata.set(session.id, launchMetadata);

      try {
        const [mailboxMessages, promptSubTasks] = await Promise.all([
          this.taskRepository.listMailboxMessagesByTargetSubTaskId(preparedSubTask.id),
          this.taskRepository.listSubTasksByTaskId(task.id),
        ]);
        const runtime = await agentFactory.spawnSession({
          attachments: launchMetadata.included.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            fileName: attachment.fileName,
            filePath: attachment.filePath,
            fileType: attachment.fileType,
          })),
          branchName: preparedSubTask.branchName,
          prompt: buildWorkerPrompt(task, preparedSubTask, {
            mailboxMessages,
            subTasks: promptSubTasks,
          }),
          sandbox: sandboxConfig ?? { type: sandboxType },
          sessionType: SESSION_TYPE.WORKER,
          workDir: preparedSubTask.worktreePath,
        });

        const startedAt = new Date().toISOString();
        const runningSession = await this.taskRepository.updateSession(session.id, {
          containerId: runtime.containerId ?? null,
          pid: runtime.pid ?? null,
          startedAt,
          status: SESSION_STATUS.RUNNING,
        });
        const runningSubTask = await this.taskRepository.updateSubTask(preparedSubTask.id, {
          lastError: null,
          status: SUBTASK_STATUS.RUNNING,
        });

        this.runningWorkerSessions.set(preparedSubTask.id, {
          exitPromise: createDeferredPromise(),
          runtime,
          sessionId: runningSession.id,
        });

        runtime.onOutput((chunk) => {
          void this.#handleWorkerOutput(task.id, preparedSubTask.id, runningSession.id, chunk);
        });
        runtime.onExit((exitCode) => {
          this.runningWorkerSessions.get(preparedSubTask.id)?.exitPromise.resolve(exitCode);
          void this.#handleWorkerExit(task.id, preparedSubTask.id, runningSession.id, exitCode);
        });

        this.#publishSubTaskStatus(task.id, runningSubTask);
        this.#publishSessionEvent(task.id, "session:started", runningSession);

        return {
          ok: true,
          session: runningSession,
          subTask: runningSubTask,
          task,
        };
      } catch (error) {
        await this.taskRepository.updateSession(session.id, {
          endedAt: new Date().toISOString(),
          exitCode: null,
          status: SESSION_STATUS.FAILED,
        });

        return this.#failSubTaskLaunch(task, preparedSubTask, error?.message ?? "Worker session failed to start.");
      }
    } catch (error) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
        error?.message ?? "Worker session failed to start.",
        { subTaskId, taskId },
      );
    } finally {
      this.pendingWorkerLaunches.delete(subTaskId);
    }
  }

  async #prepareSubTaskWorkspace(task, project, subTask) {
    let nextSubTask = subTask;

    try {
      return this.#withProjectGitLock(project.path, async () => {
        if (!nextSubTask.branchName) {
          const desiredBranchName = computeDeterministicBranchName(task.id, nextSubTask.branchSuffix);
          const resolvedBranchName = await resolveUniqueBranchName(project.path, desiredBranchName);
          const startCommitSha = await this.#resolveTaskMainlineHeadCommit(task, project);

          if (!startCommitSha) {
            throw new Error(`Failed to resolve the task mainline branch for ${task.title}.`);
          }

          nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
            branchName: resolvedBranchName,
            startCommitSha,
          });

          if (resolvedBranchName !== desiredBranchName) {
            this.#publish(task.id, "branch:renamed", {
              originalName: desiredBranchName,
              resolvedName: resolvedBranchName,
              subtaskId: nextSubTask.id,
              taskId: task.id,
            });
          }
        }

        await ensureBranchExists(project.path, nextSubTask.branchName, nextSubTask.startCommitSha ?? task.baseCommitSha);

        if (!nextSubTask.worktreePath) {
          const worktreePath = await resolveWorktreePath(project.path, task.id, nextSubTask.branchSuffix);
          await ensureWorktree(project.path, worktreePath, nextSubTask.branchName);
          nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
            worktreePath,
          });
        } else {
          await ensureWorktree(project.path, nextSubTask.worktreePath, nextSubTask.branchName);
        }

        if (nextSubTask.status !== SUBTASK_STATUS.READY) {
          nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
            lastError: null,
            status: SUBTASK_STATUS.READY,
          });
          this.#publishSubTaskStatus(task.id, nextSubTask);
        }

        return {
          ok: true,
          subTask: nextSubTask,
        };
      });
    } catch (error) {
      return this.#failSubTaskLaunch(
        task,
        nextSubTask,
        error?.message ?? "Failed to prepare the worker branch or worktree.",
        { actionRequired: true },
      );
    }
  }

  async #failSubTaskLaunch(task, subTask, message, options = {}) {
    if (options.actionRequired === true) {
      await this.taskRepository.createMessage({
        content: buildLaunchFailureMessage({
          kind: classifyLaunchFailure(message),
          reason: message,
          subTaskId: subTask.id,
        }),
        role: MESSAGE_ROLE.SYSTEM,
        subTaskId: subTask.id,
        taskId: task.id,
      });
    }

    const failedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
      lastError: message,
      status: SUBTASK_STATUS.FAILED,
    });

    this.#publishSubTaskStatus(task.id, failedSubTask);

    let nextTask = task;

    if (options.actionRequired === true) {
      nextTask = await this.#updateTaskStatus(task.id, TASK_STATUS.ACTION_REQUIRED, {
        currentTask: task,
        lastError: message,
        reason: message,
      });
    }

    void this.#maybeStartFinalReview(task.id);

    return failure(TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING, message, {
      subTaskId: subTask.id,
      taskId: task.id,
    });
  }

  async #persistAttachments(task, attachmentsInput) {
    if (!Array.isArray(attachmentsInput) || attachmentsInput.length === 0) {
      return [];
    }

    const targetDirectoryPath = path.join(this.uploadRootPath, task.id);
    await mkdir(targetDirectoryPath, { recursive: true });

    const attachments = [];

    for (const attachmentInput of attachmentsInput) {
      const targetFilePath = path.join(
        targetDirectoryPath,
        `${attachmentInput.idPrefix}-${sanitizeFileName(attachmentInput.fileName)}`,
      );

      await writeFile(targetFilePath, attachmentInput.buffer);

      attachments.push(await this.taskRepository.createAttachment({
        fileName: attachmentInput.fileName,
        filePath: targetFilePath,
        fileType: attachmentInput.fileType,
        id: attachmentInput.idPrefix,
        mimeType: attachmentInput.mimeType,
        size: attachmentInput.size,
        taskId: task.id,
      }));
    }

    return attachments;
  }

  async #handleLeadOutput(taskId, sessionId, chunk) {
    if (this.closed) {
      return;
    }

    const normalizedChunk = normalizeOutputChunk(chunk);

    if (!normalizedChunk) {
      return;
    }

    const outputPersistPromise = this.#appendSessionOutput(sessionId, normalizedChunk);
    const messagePromise = this.taskRepository.createMessage({
      content: normalizedChunk.trim(),
      role: MESSAGE_ROLE.LEAD_AGENT,
      taskId,
    });

    const task = await this.taskRepository.findTaskById(taskId);

    if (task?.status === TASK_STATUS.PLANNING) {
      this.#capturePlanDraftChunk(taskId, normalizedChunk);
    }

    const [, message] = await Promise.all([outputPersistPromise, messagePromise]);

    this.#publish(taskId, "session:output", {
      chunk: normalizedChunk,
      sessionId,
      taskId,
    });
    this.#publish(taskId, "task:lead-message", {
      content: message.content,
      messageId: message.id,
      taskId,
    });
  }

  async #handleLeadExit(taskId, sessionId, exitCode) {
    if (this.closed) {
      return;
    }

    this.runningLeadSessions.delete(taskId);
    this.pendingPlanDrafts.delete(taskId);

    const wasCancelled = this.cancelledLeadSessionIds.delete(sessionId);
    const sessionStatus = wasCancelled
      ? SESSION_STATUS.CANCELLED
      : exitCode === 0
        ? SESSION_STATUS.COMPLETED
        : SESSION_STATUS.FAILED;
    const nextSession = await this.taskRepository.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      exitCode: wasCancelled ? null : exitCode,
      status: sessionStatus,
    });

    const task = await this.taskRepository.findTaskById(taskId);

    if (!wasCancelled && [TASK_STATUS.CLARIFYING, TASK_STATUS.PLANNING].includes(task?.status) && exitCode !== 0) {
      await this.#updateTaskStatus(taskId, TASK_STATUS.ACTION_REQUIRED, {
        currentTask: task,
        lastError: task.status === TASK_STATUS.PLANNING
          ? "Lead session ended unexpectedly during planning."
          : "Lead session ended unexpectedly during clarification.",
      });
    }

    this.#publishSessionEvent(taskId, "session:ended", nextSession ?? {
      exitCode: wasCancelled ? null : exitCode,
      id: sessionId,
      status: sessionStatus,
      taskId,
    });
  }

  async #handleWorkerOutput(taskId, subTaskId, sessionId, chunk) {
    if (this.closed) {
      return;
    }

    const normalizedChunk = normalizeOutputChunk(chunk);

    if (!normalizedChunk) {
      return;
    }

    void this.#appendSessionOutput(sessionId, normalizedChunk);
    this.#publish(taskId, "session:output", {
      chunk: normalizedChunk,
      sessionId,
      subtaskId: subTaskId,
      taskId,
    });
  }

  async #handleWorkerExit(taskId, subTaskId, sessionId, exitCode) {
    if (this.closed) {
      return;
    }

    this.runningWorkerSessions.delete(subTaskId);
    await this.sessionOutputAppends.get(sessionId);

    const wasCancelled = this.cancelledWorkerSessionIds.delete(sessionId);
    const sessionStatus = wasCancelled
      ? SESSION_STATUS.CANCELLED
      : exitCode === 0
        ? SESSION_STATUS.COMPLETED
        : SESSION_STATUS.FAILED;
    const nextSession = await this.taskRepository.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      exitCode: wasCancelled ? null : exitCode,
      status: sessionStatus,
    });
    const nextSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      lastError: wasCancelled ? null : exitCode === 0 ? null : `Worker exited with code ${exitCode}.`,
      status: wasCancelled ? SUBTASK_STATUS.CANCELLED : exitCode === 0 ? SUBTASK_STATUS.REVIEW_PENDING : SUBTASK_STATUS.FAILED,
    });

    this.#publishSessionEvent(taskId, "session:ended", nextSession ?? {
      exitCode,
      id: sessionId,
      status: sessionStatus,
      subTaskId,
      taskId,
    });
    this.#publishSubTaskStatus(taskId, nextSubTask);

    if (wasCancelled) {
      await this.#progressDependencySchedule(taskId);
      await this.#maybeStartFinalReview(taskId);
      return;
    }

    if (exitCode === 0) {
      const reviewResult = await this.#runIncrementalReview(taskId, subTaskId, sessionId);
      const decision = reviewResult?.decision;

      if (decision === "REWORK") {
        const subTask = await this.taskRepository.findSubTaskById(subTaskId);

        if (subTask && (subTask.retryCount ?? 0) < MAX_AUTO_REWORK_RETRIES) {
          await this.#autoReworkSubTask(taskId, subTaskId, subTask);
        }

        await this.#progressDependencySchedule(taskId);
        await this.#maybeStartFinalReview(taskId);
        return;
      }

      if (decision === "REJECTED") {
        await this.#progressDependencySchedule(taskId);
        await this.#maybeStartFinalReview(taskId);
        return;
      }

      const syncResult = await this.#syncSubTaskIntoTaskMainline(taskId, subTaskId);

      if (!syncResult.ok) {
        return;
      }

      await this.#createDependencyHandoffMessages(taskId, subTaskId, sessionId);
    }

    await this.#progressDependencySchedule(taskId);
    await this.#maybeStartFinalReview(taskId);
  }

  async #syncSubTaskIntoTaskMainline(taskId, subTaskId) {
    return this.#withTaskMainlineSyncLock(taskId, async () => {
      if (this.closed) {
        return { ok: false };
      }

      const [task, subTask] = await Promise.all([
        this.taskRepository.findTaskById(taskId),
        this.taskRepository.findSubTaskById(subTaskId),
      ]);

      if (!task || !subTask || subTask.taskId !== taskId) {
        return { ok: false };
      }

      const project = await this.projectRepository.findProjectById(task.projectId);

      if (!project) {
        await this.#setTaskActionRequired(taskId, "Project not found while updating the task mainline branch.");
        return { ok: false };
      }

      return this.#withProjectGitLock(project.path, async () => {
        const taskBranchName = this.#resolveTaskMainlineBranchName(task);

        if (!taskBranchName || !subTask.branchName || taskBranchName === subTask.branchName) {
          return { ok: true };
        }

        const branchReady = await this.#ensureBranchReady(project, taskBranchName);

        if (!branchReady.ok) {
          await this.#setTaskActionRequired(taskId, branchReady.reason);
          return { ok: false };
        }

        if (await isBranchMergedInto(project.path, subTask.branchName, taskBranchName)) {
          return { ok: true };
        }

        const mergeResult = await mergeBranch(project.path, subTask.branchName);

        if (mergeResult.ok) {
          await this.taskRepository.createMessage({
            content: `Task mainline updated: merged ${subTask.branchName} into ${taskBranchName}.`,
            role: MESSAGE_ROLE.SYSTEM,
            taskId,
          });

          this.#publish(taskId, "task:mainline-updated", {
            sourceBranch: subTask.branchName,
            subtaskId: subTask.id,
            targetBranch: taskBranchName,
            taskId,
          });

          return { ok: true };
        }

        const conflictSummary = await this.#buildMergeConflictSummary(
          project.path,
          subTask,
          { baseBranch: taskBranchName },
          mergeResult,
        );

        await abortMerge(project.path).catch(() => null);
        await this.taskRepository.createMergeRecord({
          completedAt: new Date().toISOString(),
          conflictSummary,
          operation: MERGE_OPERATION.MERGE,
          sourceBranch: subTask.branchName,
          status: MERGE_STATUS.CONFLICT,
          subTaskId: subTask.id,
          targetBranch: taskBranchName,
        });

        const conflictedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
          lastError: conflictSummary,
        });

        if (conflictedSubTask) {
          this.#publishSubTaskStatus(taskId, conflictedSubTask);
        }

        await this.taskRepository.createMessage({
          content: `Task mainline sync blocked: ${conflictSummary}`,
          role: MESSAGE_ROLE.SYSTEM,
          taskId,
        });
        await this.#setTaskActionRequired(
          taskId,
          `Task mainline branch ${taskBranchName} could not absorb ${subTask.branchName}. ${conflictSummary}`,
        );

        return { ok: false };
      });
    });
  }

  async #withTaskMainlineSyncLock(taskId, operation) {
    const previous = this.pendingTaskMainlineSyncs.get(taskId) ?? Promise.resolve();
    let releaseLock;
    const current = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const lock = previous.catch(() => {}).then(() => current);
    this.pendingTaskMainlineSyncs.set(taskId, lock);

    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      releaseLock();

      if (this.pendingTaskMainlineSyncs.get(taskId) === lock) {
        this.pendingTaskMainlineSyncs.delete(taskId);
      }
    }
  }

  async #runIncrementalReview(taskId, subTaskId, sessionId) {
    if (this.closed) {
      return;
    }

    const [task, subTask, session] = await Promise.all([
      this.taskRepository.findTaskById(taskId),
      this.taskRepository.findSubTaskById(subTaskId),
      this.taskRepository.findSessionById(sessionId),
    ]);

    if (!task || !subTask || !session || subTask.taskId !== taskId) {
      return;
    }

    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      return;
    }

    const agentFactory = this.agentService.agentRegistry.get(task.leadAgentType);

    if (!agentFactory?.capabilities?.canOrchestrate) {
      return;
    }

    const health = await this.agentService.getHealth({ force: true });
    const agentHealth = health.agents?.[task.leadAgentType] ?? null;

    if (!agentHealth?.available) {
      return;
    }

    let reviewResponse;

    try {
      reviewResponse = await collectAgentResponse(await agentFactory.spawnSession({
        attachments: [],
        branchName: task.baseBranch,
        prompt: await buildIncrementalReviewPrompt(task, subTask, session, {
          diffSummary: await buildSubTaskDiffSummary(task, project, subTask),
        }),
        sandbox: {
          type: selectLeadSandboxType(agentFactory.capabilities.supportedSandboxTypes),
        },
        sessionType: SESSION_TYPE.LEAD,
        workDir: project.path,
      }));
    } catch {
      return;
    }

    if (this.closed) {
      return;
    }

    const parsedReview = parseIncrementalReviewResponse(reviewResponse);

    if (!parsedReview.ok) {
      return;
    }

    const persistedReview = await this.taskRepository.createReviewRecord({
      decision: parsedReview.review.decision,
      phase: REVIEW_PHASE.INCREMENTAL,
      sessionId: null,
      subTaskId,
      summary: parsedReview.review.summary,
    });

    const nextStatus = mapIncrementalReviewDecisionToSubTaskStatus(persistedReview.decision);
    const reviewedSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      latestReviewDecision: persistedReview.decision,
      latestReviewPhase: persistedReview.phase,
      latestReviewSummary: persistedReview.summary,
      ...(nextStatus ? { status: nextStatus } : {}),
    });

    if (!reviewedSubTask) {
      return { decision: null };
    }

    this.#publish(taskId, "subtask:review", {
      decision: reviewedSubTask.latestReviewDecision,
      phase: reviewedSubTask.latestReviewPhase,
      summary: reviewedSubTask.latestReviewSummary,
      subtaskId: reviewedSubTask.id,
      taskId,
    });

    if (nextStatus) {
      this.#publishSubTaskStatus(taskId, reviewedSubTask);
    }

    return { decision: persistedReview.decision };
  }

  async #autoReworkSubTask(taskId, subTaskId, subTask) {
    if (this.closed) {
      return;
    }

    if (await this.#hasLiveWorkerSession(subTaskId)) {
      return;
    }

    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: SUBTASK_STATUS.PENDING,
    });

    this.#publish(taskId, "subtask:rework", {
      description: subTask.description,
      subtaskId: subTaskId,
      taskId,
    });
    this.#publishSubTaskStatus(taskId, pendingSubTask);

    await this.#launchSubTask(taskId, subTaskId);
  }

  async #maybeStartFinalReview(taskId) {
    if (this.closed) {
      return;
    }

    if (this.pendingTaskMainlineSyncs.has(taskId)) {
      return;
    }

    if (this.pendingFinalReviews.has(taskId)) {
      return;
    }

    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || ![TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task.status)) {
      return;
    }

    const [sessions, subTasks] = await Promise.all([
      this.taskRepository.listSessionsByTaskId(taskId),
      this.taskRepository.listSubTasksByTaskId(taskId),
    ]);

    const hasLiveWorkerSession = sessions.some((session) => (
      session.sessionType === SESSION_TYPE.WORKER && WORKER_LIVE_STATUSES.has(session.status)
    ));

    if (hasLiveWorkerSession || subTasks.some((subTask) => (
      [SUBTASK_STATUS.PENDING, SUBTASK_STATUS.READY, SUBTASK_STATUS.RUNNING].includes(subTask.status)
    ))) {
      return;
    }

    const blockedSubTasks = subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.BLOCKED);

    if (blockedSubTasks.length > 0) {
      await this.#setTaskActionRequired(taskId, buildBlockedDependencyReason(blockedSubTasks, subTasks));
      return;
    }

    const reviewPendingSubTasks = subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.REVIEW_PENDING);

    if (reviewPendingSubTasks.length === 0) {
      await this.#routeTaskForFinalReviewOutcome(taskId);
      return;
    }

    if (reviewPendingSubTasks.some((subTask) => isEarlyReworkEligible(subTask))) {
      return;
    }

    this.pendingFinalReviews.add(taskId);

    try {
      await this.#updateTaskStatus(taskId, TASK_STATUS.REVIEWING, {
        currentTask: task,
        lastError: null,
      });

      queueMicrotask(() => {
        void this.#runFinalReview(taskId);
      });
    } catch (error) {
      this.pendingFinalReviews.delete(taskId);
      throw error;
    }
  }

  async #runFinalReview(taskId) {
    if (this.closed) {
      this.pendingFinalReviews.delete(taskId);
      return;
    }

    try {
      const finalReviewInput = await this.#buildFinalReviewInput(taskId);

      if (!finalReviewInput.ok) {
        await this.#routeTaskForFinalReviewOutcome(taskId);
        return;
      }

      const health = await this.agentService.getHealth({ force: true });
      const agentHealth = health.agents?.[finalReviewInput.task.leadAgentType] ?? null;

      if (!agentHealth?.available) {
        await this.#setTaskActionRequired(
          taskId,
          `Lead agent is unavailable for final review: ${agentHealth?.failureReason?.message ?? "health check failed."}`,
        );
        return;
      }

      let reviewResponse;

      try {
        reviewResponse = await collectAgentResponse(await finalReviewInput.agentFactory.spawnSession({
          attachments: [],
          branchName: finalReviewInput.task.baseBranch,
          prompt: buildFinalReviewPrompt(finalReviewInput.review),
          sandbox: {
            type: selectLeadSandboxType(finalReviewInput.agentFactory.capabilities.supportedSandboxTypes),
          },
          sessionType: SESSION_TYPE.LEAD,
          workDir: finalReviewInput.project.path,
        }));
      } catch (error) {
        await this.#setTaskActionRequired(
          taskId,
          error?.message ?? "Lead final review session failed to start.",
        );
        return;
      }

      if (this.closed) {
        return;
      }

      const parsedReview = parseFinalReviewResponse(
        reviewResponse,
        finalReviewInput.review.subTasks.map((subTask) => subTask.id),
      );

      if (!parsedReview.ok) {
        await this.#setTaskActionRequired(
          taskId,
          "Final review did not return a valid authoritative decision payload.",
        );
        return;
      }

      for (const decision of parsedReview.reviews) {
        const persistedReview = await this.taskRepository.createReviewRecord({
          decision: decision.decision,
          phase: REVIEW_PHASE.FINAL,
          sessionId: null,
          subTaskId: decision.subTaskId,
          summary: decision.summary,
        });
        const reviewedSubTask = await this.taskRepository.updateSubTask(decision.subTaskId, {
          latestReviewDecision: persistedReview.decision,
          latestReviewPhase: persistedReview.phase,
          latestReviewSummary: persistedReview.summary,
          status: mapFinalReviewDecisionToSubTaskStatus(persistedReview.decision),
        });

        if (!reviewedSubTask) {
          continue;
        }

        this.#publish(taskId, "subtask:review", {
          decision: reviewedSubTask.latestReviewDecision,
          phase: reviewedSubTask.latestReviewPhase,
          summary: reviewedSubTask.latestReviewSummary,
          subtaskId: reviewedSubTask.id,
          taskId,
        });
        this.#publishSubTaskStatus(taskId, reviewedSubTask);
      }

      await this.#routeTaskForFinalReviewOutcome(taskId);
    } finally {
      this.pendingFinalReviews.delete(taskId);
    }
  }

  async #buildFinalReviewInput(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || task.status !== TASK_STATUS.REVIEWING) {
      return { ok: false };
    }

    const [project, subTasks, sessions] = await Promise.all([
      this.projectRepository.findProjectById(task.projectId),
      this.taskRepository.listSubTasksByTaskId(taskId),
      this.taskRepository.listSessionsByTaskId(taskId),
    ]);

    if (!project) {
      return { ok: false };
    }

    const agentFactory = this.agentService.agentRegistry.get(task.leadAgentType);

    if (!agentFactory?.capabilities?.canOrchestrate) {
      return { ok: false };
    }

    const reviewableSubTasks = subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.REVIEW_PENDING);

    if (reviewableSubTasks.length === 0) {
      return { ok: false };
    }

    const approvedPlan = parseCurrentPlanJson(task.approvedPlanJson);
    const subTaskReviews = await Promise.all(reviewableSubTasks.map(async (subTask) => {
      const incrementalHistory = (await this.taskRepository.listReviewRecordsBySubTaskId(subTask.id))
        .filter((record) => record.phase === REVIEW_PHASE.INCREMENTAL);
      const latestSuccessfulSession = resolveLatestSuccessfulWorkerSession(sessions, subTask.id);

      return {
        branchName: subTask.branchName ?? null,
        description: subTask.description,
        diffSummary: await buildSubTaskDiffSummary(task, project, subTask),
        id: subTask.id,
        incrementalHistory,
        latestSuccessfulSession: latestSuccessfulSession
          ? {
              agentType: latestSuccessfulSession.agentType,
              endedAt: latestSuccessfulSession.endedAt ?? null,
              id: latestSuccessfulSession.id,
              logExcerpt: await readSessionLogExcerpt(latestSuccessfulSession, MAX_FINAL_REVIEW_LOG_BYTES),
              logPath: latestSuccessfulSession.logPath ?? null,
              outputBuffer: latestSuccessfulSession.outputBuffer ?? "",
            }
          : null,
        retryCount: subTask.retryCount ?? 0,
        title: subTask.title,
      };
    }));

    return {
      ok: true,
      agentFactory,
      project,
      review: {
        approvedPlan,
        baseBranch: task.baseBranch,
        baseCommitSha: task.baseCommitSha,
        leadAgentType: task.leadAgentType,
        subTasks: subTaskReviews,
        taskBranchName: task.taskBranchName ?? null,
        taskDescription: task.description,
        taskId: task.id,
        taskTitle: task.title,
      },
      task,
    };
  }

  async #routeTaskForFinalReviewOutcome(taskId) {
    const [task, subTasks] = await Promise.all([
      this.taskRepository.findTaskById(taskId),
      this.taskRepository.listSubTasksByTaskId(taskId),
    ]);

    if (!task || subTasks.length === 0) {
      return task;
    }

    const mergeReadyStatuses = new Set([
      SUBTASK_STATUS.ACCEPTED,
      SUBTASK_STATUS.CANCELLED,
      SUBTASK_STATUS.DISCARDED,
    ]);
    const actionRequiredStatuses = new Set([
      SUBTASK_STATUS.BLOCKED,
      SUBTASK_STATUS.CANCELLED,
      SUBTASK_STATUS.DISCARD_PENDING,
      SUBTASK_STATUS.FAILED,
      SUBTASK_STATUS.REWORK_REQUIRED,
    ]);

    if (subTasks.every((subTask) => mergeReadyStatuses.has(subTask.status))) {
      const acceptedSubTasks = subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.ACCEPTED);

      if (acceptedSubTasks.length === 0) {
        return this.#completeTaskIfMergeResolved(taskId);
      }

      return this.#updateTaskStatus(taskId, TASK_STATUS.MERGING, {
        currentTask: task,
        lastError: null,
      });
    }

    const unresolvedSubTasks = subTasks.filter((subTask) => actionRequiredStatuses.has(subTask.status));

    if (unresolvedSubTasks.length > 0) {
      return this.#setTaskActionRequired(taskId, buildFinalReviewActionRequiredReason(unresolvedSubTasks));
    }

    return task;
  }

  async #setTaskActionRequired(taskId, reason) {
    return this.#updateTaskStatus(taskId, TASK_STATUS.ACTION_REQUIRED, {
      lastError: reason,
      reason,
    });
  }

  async #createMailboxMessage(input) {
    const message = await this.taskRepository.createMailboxMessage(input);

    this.#publish(message.taskId, "mailbox:message", {
      message,
      taskId: message.taskId,
    });

    return message;
  }

  async #createDependencyHandoffMessages(taskId, upstreamSubTaskId, sessionId) {
    if (this.closed) {
      return;
    }

    const [upstreamSubTask, session, subTasks] = await Promise.all([
      this.taskRepository.findSubTaskById(upstreamSubTaskId),
      this.taskRepository.findSessionById(sessionId),
      this.taskRepository.listSubTasksByTaskId(taskId),
    ]);

    if (!upstreamSubTask || !session || upstreamSubTask.taskId !== taskId) {
      return;
    }

    const downstreamSubTasks = subTasks.filter((subTask) => (
      subTask.id !== upstreamSubTask.id
      && subTask.dependencyBranchSuffixes.includes(upstreamSubTask.branchSuffix)
    ));

    if (downstreamSubTasks.length === 0) {
      return;
    }

    const automaticHandoff = buildAutomaticHandoffMessage(upstreamSubTask, session);

    await Promise.all(downstreamSubTasks.map((downstreamSubTask) => (
      this.#createMailboxMessage({
        artifactRefs: automaticHandoff.artifactRefs,
        branchRef: automaticHandoff.branchRef,
        content: automaticHandoff.content,
        fileRefs: automaticHandoff.fileRefs,
        messageType: automaticHandoff.messageType,
        requiresAck: false,
        schemaJson: automaticHandoff.schemaJson,
        senderSubTaskId: upstreamSubTask.id,
        senderType: MAILBOX_PARTICIPANT_TYPE.SUBTASK,
        targetSubTaskId: downstreamSubTask.id,
        targetType: MAILBOX_TARGET_TYPE.SUBTASK,
        taskId,
      })
    )));
  }

  #decorateSession(session) {
    return {
      ...session,
      launchMetadata: sanitizeLaunchMetadata(this.workerSessionMetadata.get(session.id)),
    };
  }

  #decorateSubTask(subTask) {
    return {
      ...subTask,
      assignmentSource: subTask.assignmentSource
        ?? (subTask.autoAssigned ? SUBTASK_ASSIGNMENT_SOURCE.LEAD : SUBTASK_ASSIGNMENT_SOURCE.OPERATOR),
      displayName: subTask.displayName ?? subTask.title,
      launchMetadata: sanitizeLaunchMetadata(this.workerLaunchMetadata.get(subTask.id)),
      role: subTask.role ?? subTask.branchSuffix ?? "worker",
      runSummary: subTask.runSummary ?? buildDerivedRunSummary(subTask),
    };
  }

  #buildTaskTeamView(task, sessions, subTasks) {
    const latestLeadSession = sessions
      .filter((session) => session.sessionType === SESSION_TYPE.LEAD)
      .at(-1) ?? null;
    const members = subTasks.map((subTask, index) => {
      const latestWorkerSession = sessions
        .filter((session) => session.sessionType === SESSION_TYPE.WORKER && session.subTaskId === subTask.id)
        .at(-1) ?? null;

      return {
        agentType: subTask.agentType,
        assignmentSource: subTask.assignmentSource
          ?? (subTask.autoAssigned ? SUBTASK_ASSIGNMENT_SOURCE.LEAD : SUBTASK_ASSIGNMENT_SOURCE.OPERATOR),
        autoAssigned: Boolean(subTask.autoAssigned),
        branchName: subTask.branchName ?? null,
        branchSuffix: subTask.branchSuffix,
        displayName: subTask.displayName ?? subTask.title,
        executionOrder: subTask.executionOrder ?? index + 1,
        latestSessionId: latestWorkerSession?.id ?? null,
        latestSessionStatus: latestWorkerSession?.status ?? null,
        role: subTask.role ?? subTask.branchSuffix ?? "worker",
        runSummary: subTask.runSummary ?? buildDerivedRunSummary(subTask),
        status: subTask.status,
        subtaskId: subTask.id,
        taskId: task.id,
        title: subTask.title,
        worktreePath: subTask.worktreePath ?? null,
      };
    });

    return {
      lead: {
        agentType: task.leadAgentType,
        lastError: task.lastError ?? null,
        sessionId: latestLeadSession?.id ?? null,
        status: latestLeadSession?.status ?? deriveLeadLifecycleStatus(task.status),
      },
      members,
      task: {
        id: task.id,
        status: task.status,
        taskBranchName: task.taskBranchName ?? null,
        title: task.title,
      },
    };
  }

  #buildTaskIntegrationView(task, context) {
    const integrationRuns = Array.isArray(context?.integrationRuns) ? context.integrationRuns : [];
    const subTasks = Array.isArray(context?.subTasks) ? context.subTasks : [];
    const queueItemsByIntegrationRunId = context?.queueItemsByIntegrationRunId instanceof Map
      ? context.queueItemsByIntegrationRunId
      : new Map();
    const gateResultsByIntegrationRunId = context?.gateResultsByIntegrationRunId instanceof Map
      ? context.gateResultsByIntegrationRunId
      : new Map();
    const subTaskById = new Map(subTasks.map((subTask) => [subTask.id, subTask]));
    const runs = integrationRuns.map((integrationRun) => ({
      ...integrationRun,
      gateResults: gateResultsByIntegrationRunId.get(integrationRun.id) ?? [],
      queueItems: (queueItemsByIntegrationRunId.get(integrationRun.id) ?? []).map((queueItem) => ({
        ...queueItem,
        subTask: subTaskById.get(queueItem.subTaskId) ?? null,
      })),
    }));
    const latestRun = runs.at(-1) ?? null;

    return {
      latestRun,
      runs,
      task: {
        id: task.id,
        status: task.status,
        taskBranchName: task.taskBranchName ?? null,
        title: task.title,
      },
    };
  }

  #buildTaskBoardSnapshot(task, context) {
    const subTasks = Array.isArray(context?.subTasks) ? context.subTasks : [];
    const sessions = Array.isArray(context?.sessions) ? context.sessions : [];
    const mailboxMessages = Array.isArray(context?.mailboxMessages) ? context.mailboxMessages : [];
    const reviewRecords = Array.isArray(context?.reviewRecords) ? context.reviewRecords : [];
    const messages = Array.isArray(context?.messages) ? context.messages : [];
    const integrationRuns = Array.isArray(context?.integrationRuns) ? context.integrationRuns : [];
    const queueItemsByIntegrationRunId = context?.queueItemsByIntegrationRunId instanceof Map
      ? context.queueItemsByIntegrationRunId
      : new Map();
    const gateResultsByIntegrationRunId = context?.gateResultsByIntegrationRunId instanceof Map
      ? context.gateResultsByIntegrationRunId
      : new Map();
    const subTaskById = new Map(subTasks.map((subTask) => [subTask.id, subTask]));
    const subTaskByBranchSuffix = new Map(subTasks.map((subTask) => [subTask.branchSuffix, subTask]));
    const mailboxMessagesByTargetSubTaskId = groupMailboxMessagesByTargetSubTaskId(mailboxMessages);
    const mailboxMessagesBySenderSubTaskId = groupMailboxMessagesBySenderSubTaskId(mailboxMessages);
    const launchFailures = messages.map((message) => parseLaunchFailureMessage(message)).filter(Boolean);
    const latestActivityBySubTaskId = new Map();
    const activity = buildBoardActivityEntries({
      launchFailures,
      mailboxMessages,
      reviewRecords,
      sessions,
      subTasks,
    });

    for (const entry of activity) {
      if (entry.subTaskId && !latestActivityBySubTaskId.has(entry.subTaskId)) {
        latestActivityBySubTaskId.set(entry.subTaskId, entry);
      }
    }

    const actionRequiredItems = buildBoardActionRequiredItems({
      gateResultsByIntegrationRunId,
      integrationRuns,
      launchFailures,
      mailboxMessages,
      queueItemsByIntegrationRunId,
      subTasks,
      task,
    });
    const graphNodes = subTasks.map((subTask) => {
      const latestSession = sessions
        .filter((session) => session.subTaskId === subTask.id)
        .at(-1) ?? null;
      const latestMergeRecord = Array.isArray(subTask.mergeRecords) ? subTask.mergeRecords.at(-1) ?? null : null;
      const targetMessages = mailboxMessagesByTargetSubTaskId.get(subTask.id) ?? [];
      const sentMessages = mailboxMessagesBySenderSubTaskId.get(subTask.id) ?? [];
      const latestActivity = latestActivityBySubTaskId.get(subTask.id) ?? null;

      return {
        subtaskId: subTask.id,
        title: subTask.title,
        role: subTask.role ?? subTask.branchSuffix ?? "worker",
        status: subTask.status,
        agentType: subTask.agentType,
        branchName: subTask.branchName ?? null,
        executionOrder: subTask.executionOrder ?? null,
        mailboxInboxCount: targetMessages.length,
        mailboxOutboxCount: sentMessages.length,
        latestActivitySummary: latestActivity?.summary ?? subTask.runSummary ?? null,
        latestMergeStatus: latestMergeRecord?.status ?? null,
        latestSessionStatus: latestSession?.status ?? null,
        requiresAction: actionRequiredItems.some((item) => item.subTaskId === subTask.id),
        unresolvedMailboxBlockers: targetMessages.filter((message) => message.messageType === MAILBOX_MESSAGE_TYPE.BLOCKER).length,
      };
    });
    const graphEdges = subTasks.flatMap((subTask) => (
      normalizeDependencyBranchSuffixes(subTask.dependencyBranchSuffixes).map((branchSuffix) => {
        const upstreamSubTask = subTaskByBranchSuffix.get(branchSuffix) ?? null;
        const dependencySatisfied = DEPENDENCY_SATISFIED_SUBTASK_STATUSES.has(upstreamSubTask?.status);
        const handoffCount = mailboxMessages.filter((message) => (
          message.senderSubTaskId === upstreamSubTask?.id
          && message.targetSubTaskId === subTask.id
        )).length;
        const unresolvedBlockerCount = mailboxMessages.filter((message) => (
          message.targetSubTaskId === subTask.id
          && [MAILBOX_MESSAGE_TYPE.BLOCKER, MAILBOX_MESSAGE_TYPE.REVIEW_REQUEST, MAILBOX_MESSAGE_TYPE.TEST_REQUEST].includes(message.messageType)
        )).length;

        return {
          from: upstreamSubTask?.id ?? branchSuffix,
          fromBranchSuffix: branchSuffix,
          handoffCount,
          isBlocking: !dependencySatisfied || unresolvedBlockerCount > 0,
          state: !dependencySatisfied
            ? "BLOCKING"
            : unresolvedBlockerCount > 0
              ? "ATTENTION"
              : handoffCount > 0
                ? "HANDOFF_READY"
                : "SATISFIED",
          to: subTask.id,
          unresolvedBlockerCount,
        };
      })
    ));

    return {
      activity,
      actionRequiredItems,
      graph: {
        edges: graphEdges,
        nodes: graphNodes,
      },
      integration: this.#buildTaskIntegrationView(task, {
        gateResultsByIntegrationRunId,
        integrationRuns,
        queueItemsByIntegrationRunId,
        subTasks,
      }),
      list: {
        members: subTasks.map((subTask) => {
          const latestSession = sessions
            .filter((session) => session.subTaskId === subTask.id)
            .at(-1) ?? null;

          return {
            agentType: subTask.agentType,
            branchName: subTask.branchName ?? null,
            dependencyBranchSuffixes: normalizeDependencyBranchSuffixes(subTask.dependencyBranchSuffixes),
            latestSessionStatus: latestSession?.status ?? null,
            role: subTask.role ?? subTask.branchSuffix ?? "worker",
            runSummary: subTask.runSummary ?? buildDerivedRunSummary(subTask),
            status: subTask.status,
            subtaskId: subTask.id,
            title: subTask.title,
          };
        }),
      },
      riskSummary: {
        integrationFailures: integrationRuns.reduce((count, integrationRun) => (
          count + (gateResultsByIntegrationRunId.get(integrationRun.id) ?? [])
            .filter((gateResult) => gateResult.status === GATE_RESULT_STATUS.FAILED)
            .length
        ), 0),
        failedLaunches: launchFailures.length,
        mailboxBlockers: mailboxMessages.filter((message) => message.messageType === MAILBOX_MESSAGE_TYPE.BLOCKER).length,
        mergeConflicts: subTasks.filter((subTask) => (
          Array.isArray(subTask.mergeRecords) && subTask.mergeRecords.some((record) => record.status === MERGE_STATUS.CONFLICT)
        )).length,
        reviewRequired: subTasks.filter((subTask) => (
          [SUBTASK_STATUS.REWORK_REQUIRED, SUBTASK_STATUS.DISCARD_PENDING].includes(subTask.status)
        )).length,
        requiresAck: mailboxMessages.filter((message) => message.requiresAck).length,
      },
      summary: {
        accepted: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.ACCEPTED).length,
        actionRequired: actionRequiredItems.length,
        blocked: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.BLOCKED).length,
        failed: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.FAILED).length,
        merged: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.MERGED).length,
        pending: subTasks.filter((subTask) => [SUBTASK_STATUS.PENDING, SUBTASK_STATUS.READY].includes(subTask.status)).length,
        reviewPending: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.REVIEW_PENDING).length,
        running: subTasks.filter((subTask) => subTask.status === SUBTASK_STATUS.RUNNING).length,
      },
      workflow: buildBoardWorkflowSummary({
        actionRequiredItems,
        subTasks,
      }),
      task: {
        id: task.id,
        lastError: task.lastError ?? null,
        status: task.status,
        title: task.title,
      },
    };
  }

  #publishSubTaskStatus(taskId, subTask) {
    const decoratedSubTask = this.#decorateSubTask(subTask);

    this.#publish(taskId, "subtask:status", {
      ...decoratedSubTask,
      attachments: decoratedSubTask.launchMetadata,
      subtaskId: decoratedSubTask.id,
      taskId,
    });
  }

  async #hasLiveWorkerSession(subTaskId) {
    if (this.pendingWorkerLaunches.has(subTaskId)) {
      return true;
    }

    if (this.runningWorkerSessions.has(subTaskId)) {
      return true;
    }

    const sessions = await this.taskRepository.listSessionsBySubTaskId(subTaskId);
    return sessions.some((session) => WORKER_LIVE_STATUSES.has(session.status));
  }

  #publish(taskId, eventName, data) {
    this.eventBus?.publish(taskId, eventName, data);

    const boardActivity = buildBoardActivityEvent(eventName, data);

    if (boardActivity) {
      this.eventBus?.publish(taskId, "board:activity", {
        ...boardActivity,
        taskId,
      });
    }
  }

  async #publishTeamUpdated(taskId) {
    const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId).catch(() => []);

    this.#publish(taskId, "team:updated", {
      memberCount: subTasks.length,
      taskId,
    });
  }

  #publishSessionEvent(taskId, eventName, session) {
    const decoratedSession = this.#decorateSession(session);

    this.#publish(taskId, eventName, {
      ...decoratedSession,
      attachments: decoratedSession.launchMetadata,
      sessionId: decoratedSession.id,
      subtaskId: decoratedSession.subTaskId ?? null,
      taskId,
    });
  }

  async #createTrackedSession(input) {
    const sessionId = input.id ?? randomUUID();
    const logPath = this.#buildSessionLogPath({
      sessionId,
      sessionType: input.sessionType,
      subTaskId: input.subTaskId ?? null,
      taskId: input.taskId,
    });

    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, "", "utf8");

    const session = await this.taskRepository.createSession({
      ...input,
      id: sessionId,
      logPath,
    });

    this.sessionLogPaths.set(session.id, logPath);
    return session;
  }

  async #appendSessionOutput(sessionId, chunk) {
    if (this.closed) {
      return;
    }

    const previousAppend = this.sessionOutputAppends.get(sessionId) ?? Promise.resolve();
    const nextAppend = previousAppend
      .catch(() => {})
      .then(async () => {
        if (this.closed) {
          return;
        }

        const knownLogPath = this.sessionLogPaths.get(sessionId);
        let logPath = knownLogPath ?? null;

        if (!logPath) {
          const session = await this.taskRepository.findSessionById(sessionId);
          logPath = session?.logPath ?? null;

          if (logPath) {
            this.sessionLogPaths.set(sessionId, logPath);
          }
        }

        if (logPath) {
          await mkdir(path.dirname(logPath), { recursive: true });
          await writeFile(logPath, chunk, {
            encoding: "utf8",
            flag: "a",
          });
        }

        await this.taskRepository.appendSessionOutput(sessionId, chunk);
      });

    this.sessionOutputAppends.set(sessionId, nextAppend);
    await nextAppend.finally(() => {
      if (this.sessionOutputAppends.get(sessionId) === nextAppend) {
        this.sessionOutputAppends.delete(sessionId);
      }
    });
  }

  #buildSessionLogPath({ taskId, sessionId, sessionType, subTaskId }) {
    const baseDirectoryPath = path.join(this.uploadRootPath, taskId, "sessions");
    const fileNamePrefix = sessionType === SESSION_TYPE.WORKER
      ? `worker-${subTaskId ?? "unknown"}`
      : "lead";

    return path.join(baseDirectoryPath, `${fileNamePrefix}-${sessionId}.log`);
  }

  #capturePlanDraftChunk(taskId, chunk) {
    if (this.closed) {
      return;
    }

    const nextBuffer = `${this.pendingPlanDrafts.get(taskId)?.buffer ?? ""}\n${chunk}`.trim();

    if (!looksLikeCompletePlanText(nextBuffer)) {
      this.pendingPlanDrafts.set(taskId, {
        buffer: nextBuffer,
        parseError: null,
        parsedDraft: null,
      });
      return;
    }

    const parsedDraft = parsePlanDraftText(nextBuffer);

    this.pendingPlanDrafts.set(taskId, {
      buffer: nextBuffer,
      parsedDraft: parsedDraft.ok ? parsedDraft : null,
      parseError: parsedDraft.ok ? null : parsedDraft.error,
    });

    void this.#processPlanDraftAttempt(taskId, parsedDraft);
  }

  async #processPlanDraftAttempt(taskId, parsedDraft) {
    if (this.closed) {
      return;
    }

    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || task.status !== TASK_STATUS.PLANNING) {
      return;
    }

    if (!parsedDraft.ok) {
      await this.#requestPlanRegeneration(task, parsedDraft.error.message);
      return;
    }

    const nextPlanVersion = (task.planVersion ?? 0) + 1;
    const taskWithIncrementedVersion = await this.taskRepository.updateTask(taskId, {
      lastError: null,
      planVersion: nextPlanVersion,
    });
    const health = await this.agentService.getHealth();
    const validation = validatePlanDraft(parsedDraft.payload, {
      agentHealth: health.agents,
    });

    if (this.closed) {
      return;
    }

    if (!validation.ok) {
      await this.#requestPlanRegeneration(taskWithIncrementedVersion ?? task, validation.error.message, validation.error.details);
      return;
    }

    const currentPlanJson = JSON.stringify(validation.plan);
    const planReviewTask = await this.taskRepository.updateTask(taskId, {
      currentPlanJson,
      lastError: null,
      status: TASK_STATUS.PLAN_REVIEW,
    });

    await this.taskRepository.createPlanSnapshot({
      payload: currentPlanJson,
      source: PLAN_SNAPSHOT_SOURCE.LEAD_GENERATED,
      taskId,
      version: planReviewTask.planVersion,
    });

    this.pendingPlanDrafts.delete(taskId);
    this.#publish(taskId, "task:status", {
      taskId,
      status: planReviewTask.status,
    });
    this.#publish(taskId, "task:plan-generated", {
      currentPlan: validation.plan,
      planVersion: planReviewTask.planVersion,
      taskId,
    });
  }

  async #requestPlanRegeneration(task, reason, details) {
    if (this.closed) {
      return;
    }

    this.pendingPlanDrafts.delete(task.id);

    const updatedTask = await this.taskRepository.updateTask(task.id, {
      lastError: reason,
      status: TASK_STATUS.PLANNING,
    });
    await this.taskRepository.createMessage({
      content: `Plan validation failed: ${reason}`,
      role: MESSAGE_ROLE.SYSTEM,
      taskId: task.id,
    });

    const activeSession = this.runningLeadSessions.get(task.id);

    if (activeSession) {
      try {
        await activeSession.runtime.sendInput(buildPlanRegenerationPrompt(reason, details));
      } catch {
        // Keep the task in PLANNING so the user can retry manually once recovery flows exist.
      }
    }

    if (updatedTask?.status === TASK_STATUS.PLANNING) {
      this.#publish(task.id, "task:status", {
        reason,
        taskId: task.id,
        status: updatedTask.status,
      });
    }
  }

  async #validatePlanPayload(payload) {
    const health = await this.agentService.getHealth();
    const validation = validatePlanDraft(payload, {
      agentHealth: health.agents,
    });

    if (!validation.ok) {
      return failure(
        TASK_SERVICE_ERROR_CODES.INVALID_PLAN,
        validation.error.message,
        validation.error.details,
      );
    }

    return validation;
  }

  async #prepareTaskCreationInput(input) {
    const projectId = normalizeRequiredString(input?.projectId);
    const title = normalizeRequiredString(input?.title);
    const description = normalizeRequiredString(input?.description);
    const baseBranch = normalizeRequiredString(input?.baseBranch);
    const baseBranchMode = input?.baseBranchMode === "new" ? "new" : "existing";
    const baseBranchStartPoint = normalizeRequiredString(input?.baseBranchStartPoint);
    const leadAgentType = normalizeRequiredString(input?.leadAgentType);

    if (!projectId) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project is required.");
    }

    if (!baseBranch) {
      return failure(TASK_SERVICE_ERROR_CODES.BASE_BRANCH_REQUIRED, "Base branch is required.");
    }

    if (!leadAgentType) {
      return failure(TASK_SERVICE_ERROR_CODES.LEAD_AGENT_REQUIRED, "Lead agent type is required.");
    }

    if (!title) {
      return failure(TASK_SERVICE_ERROR_CODES.TITLE_REQUIRED, "Task title is required.");
    }

    if (!description) {
      return failure(TASK_SERVICE_ERROR_CODES.DESCRIPTION_REQUIRED, "Task description is required.");
    }

    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId });
    }

    const agentFactory = this.agentService.agentRegistry.get(leadAgentType);

    if (!agentFactory?.capabilities?.canOrchestrate) {
      return failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_INVALID,
        "Lead agent must be a registered orchestrator.",
        { leadAgentType },
      );
    }

    const health = await this.agentService.getHealth();
    const agentHealth = health.agents?.[leadAgentType] ?? null;

    if (!agentHealth?.available) {
      return failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_UNHEALTHY,
        "Lead agent is unhealthy and cannot be used for task creation.",
        {
          failureReason: agentHealth?.failureReason ?? null,
          leadAgentType,
        },
      );
    }

    let resolvedBaseBranch = baseBranch;
    let baseCommitSha = null;
    let resolvedTaskBranchName = null;

    const branchPreparation = await this.#withProjectGitLock(project.path, async () => {
      let nextResolvedBaseBranch = baseBranch;
      let nextBaseCommitSha = null;

      if (baseBranchMode === "new") {
        const startPoint = baseBranchStartPoint;

        if (!startPoint) {
          return failure(TASK_SERVICE_ERROR_CODES.BASE_BRANCH_REQUIRED, "Base branch start point is required.");
        }

        const startPointCommitSha = await resolveBranchHeadCommit(project.path, startPoint);

        if (!startPointCommitSha) {
          return failure(
            TASK_SERVICE_ERROR_CODES.BASE_BRANCH_NOT_FOUND,
            "Selected base branch could not be resolved to a commit.",
            { baseBranch: startPoint },
          );
        }

        nextResolvedBaseBranch = await resolveUniqueBranchName(project.path, baseBranch);

        try {
          await ensureBranchExists(project.path, nextResolvedBaseBranch, startPointCommitSha);
        } catch {
          return failure(
            TASK_SERVICE_ERROR_CODES.BASE_BRANCH_CREATE_FAILED,
            "Requested base branch could not be created.",
            {
              baseBranch: nextResolvedBaseBranch,
              sourceBranch: startPoint,
            },
          );
        }

        nextBaseCommitSha = await resolveBranchHeadCommit(project.path, nextResolvedBaseBranch);
      } else {
        nextBaseCommitSha = await resolveBranchHeadCommit(project.path, baseBranch);
      }

      if (!nextBaseCommitSha) {
        return failure(
          TASK_SERVICE_ERROR_CODES.BASE_BRANCH_NOT_FOUND,
          "Selected base branch could not be resolved to a commit.",
          { baseBranch: nextResolvedBaseBranch },
        );
      }

      const desiredTaskBranchName = buildTaskMainlineBranchName(title);
      let nextResolvedTaskBranchName = await resolveUniqueBranchName(project.path, desiredTaskBranchName);

      try {
        await ensureBranchExists(project.path, nextResolvedTaskBranchName, nextBaseCommitSha);
      } catch {
        return failure(
          TASK_SERVICE_ERROR_CODES.BASE_BRANCH_CREATE_FAILED,
          "Task execution branch could not be created.",
          {
            baseBranch: nextResolvedTaskBranchName,
            sourceBranch: nextResolvedBaseBranch,
          },
        );
      }

      if (!nextResolvedTaskBranchName) {
        nextResolvedTaskBranchName = nextResolvedBaseBranch;
      }

      return {
        ok: true,
        baseCommitSha: nextBaseCommitSha,
        resolvedBaseBranch: nextResolvedBaseBranch,
        resolvedTaskBranchName: nextResolvedTaskBranchName,
      };
    });

    if (!branchPreparation.ok) {
      return branchPreparation;
    }

    resolvedBaseBranch = branchPreparation.resolvedBaseBranch;
    baseCommitSha = branchPreparation.baseCommitSha;
    resolvedTaskBranchName = branchPreparation.resolvedTaskBranchName;

    const normalizedAttachments = await Promise.all((input?.attachments ?? []).map((attachment) => (
      normalizeAttachmentInput(attachment)
    )));

    return {
      ok: true,
      normalizedAttachments,
      taskInput: {
        baseBranch: resolvedBaseBranch,
        baseCommitSha,
        description,
        leadAgentType,
        projectId,
        taskBranchName: resolvedTaskBranchName,
        title,
      },
    };
  }

  async #createTaskRecord(prepared) {
    const task = await this.taskRepository.createTask(prepared.taskInput);
    const attachments = await this.#persistAttachments(task, prepared.normalizedAttachments);

    return {
      attachments,
      task,
    };
  }

  async #resolveDefaultTemplateAgentType(task, requestedAgentType) {
    const explicitAgentType = normalizeRequiredString(requestedAgentType);

    if (explicitAgentType) {
      return explicitAgentType;
    }

    const directory = await this.agentService.getAgentDirectory();
    const selectableWorker = directory.workerCandidates?.find((candidate) => candidate.selectable);

    if (selectableWorker?.agentName) {
      return selectableWorker.agentName;
    }

    return task.leadAgentType;
  }

  async #getPlanningAgentContext(defaultAgentType) {
    const directory = await this.agentService.getAgentDirectory().catch(() => null);
    const availableAgentNames = directory?.workerCandidates
      ?.filter((candidate) => candidate.selectable)
      .map((candidate) => candidate.agentName)
      ?? [];

    if (!availableAgentNames.includes(defaultAgentType)) {
      availableAgentNames.push(defaultAgentType);
    }

    return {
      availableAgentNames,
      defaultAgentType,
    };
  }

  async #spawnLeadSession(task, project, transcriptMessages = []) {
    const agentFactory = this.agentService.agentRegistry.get(task.leadAgentType);
    const health = await this.agentService.getHealth();
    const agentHealth = health.agents?.[task.leadAgentType] ?? null;

    if (!agentFactory?.capabilities?.canOrchestrate) {
      throw failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_INVALID,
        "Lead agent must be a registered orchestrator.",
        { leadAgentType: task.leadAgentType },
      ).error;
    }

    if (!agentHealth?.available) {
      throw failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_UNHEALTHY,
        "Lead agent is unhealthy and cannot start clarification.",
        {
          failureReason: agentHealth?.failureReason ?? null,
          leadAgentType: task.leadAgentType,
        },
      ).error;
    }

    const session = await this.#createTrackedSession({
      agentType: task.leadAgentType,
      sandboxType: selectLeadSandboxType(agentFactory.capabilities.supportedSandboxTypes),
      sessionType: SESSION_TYPE.LEAD,
      status: SESSION_STATUS.STARTING,
      taskId: task.id,
    });
    const runtime = await agentFactory.spawnSession({
      attachments: (await this.taskRepository.listAttachmentsByTaskId(task.id)).map((attachment) => ({
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        fileType: attachment.fileType,
      })),
      branchName: task.baseBranch,
      prompt: buildClarificationPrompt(task, transcriptMessages),
      sandbox: {
        type: session.sandboxType,
      },
      sessionType: SESSION_TYPE.LEAD,
      workDir: project.path,
    });
    const runningSession = await this.taskRepository.updateSession(session.id, {
      containerId: runtime.containerId ?? null,
      pid: runtime.pid ?? null,
      startedAt: new Date().toISOString(),
      status: SESSION_STATUS.RUNNING,
    });

    this.runningLeadSessions.set(task.id, {
      exitPromise: createDeferredPromise(),
      runtime,
      sessionId: session.id,
    });

    runtime.onOutput((chunk) => {
      void this.#handleLeadOutput(task.id, session.id, chunk);
    });
    runtime.onExit((exitCode) => {
      this.runningLeadSessions.get(task.id)?.exitPromise.resolve(exitCode);
      void this.#handleLeadExit(task.id, session.id, exitCode);
    });

    this.#publishSessionEvent(task.id, "session:started", runningSession);

    return {
      runningSession,
      runtime,
    };
  }

  async #stopTaskSessions(task, subTasks, options = {}) {
    const persistCancellation = options.persistCancellation === true;
    const cancelledAt = new Date().toISOString();
    const sessions = await this.taskRepository.listSessionsByTaskId(task.id);
    const exitWaits = [];

    const activeLeadSession = this.runningLeadSessions.get(task.id) ?? null;
    if (activeLeadSession) {
      this.cancelledLeadSessionIds.add(activeLeadSession.sessionId);
      await activeLeadSession.runtime?.kill?.().catch(() => null);
      exitWaits.push(waitForDeferredPromise(activeLeadSession.exitPromise, SESSION_STOP_WAIT_TIMEOUT_MS));
    }

    for (const subTask of subTasks) {
      const runningSession = this.runningWorkerSessions.get(subTask.id) ?? null;

      if (runningSession?.sessionId) {
        this.cancelledWorkerSessionIds.add(runningSession.sessionId);
        await runningSession.runtime?.kill?.().catch(() => null);
        exitWaits.push(waitForDeferredPromise(runningSession.exitPromise, SESSION_STOP_WAIT_TIMEOUT_MS));
      }
    }

    if (exitWaits.length > 0) {
      await Promise.allSettled(exitWaits);
    }

    if (!persistCancellation) {
      return;
    }

    const liveSessions = sessions.filter((session) => WORKER_LIVE_STATUSES.has(session.status));
    for (const session of liveSessions) {
      await this.taskRepository.updateSession(session.id, {
        endedAt: cancelledAt,
        exitCode: null,
        status: SESSION_STATUS.CANCELLED,
      });
    }

    for (const subTask of subTasks) {
      if (!ARCHIVE_CANCELLABLE_SUBTASK_STATUSES.has(subTask.status)) {
        continue;
      }

      await this.taskRepository.updateSubTask(subTask.id, {
        assignmentSource: SUBTASK_ASSIGNMENT_SOURCE.OPERATOR,
        lastError: null,
        status: SUBTASK_STATUS.CANCELLED,
      });
    }
  }

  async #cleanupTaskBranches(task, subTasks) {
    const project = await this.projectRepository.findProjectById(task.projectId);

    if (!project) {
      return failure(
        TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND,
        "Project not found.",
        { projectId: task.projectId, taskId: task.id },
      );
    }

    return this.#withProjectGitLock(project.path, async () => {
      const cleanedBranches = [];
      const cleanedWorktrees = [];
      const failures = [];

      for (const subTask of subTasks) {
        const worktreePath = normalizeRequiredString(subTask.worktreePath);

        if (!worktreePath) {
          continue;
        }

        const cleanupResult = await this.#removeWorktreeWithRetries(project.path, worktreePath);

        if (!cleanupResult.ok) {
          failures.push({
            reason: cleanupResult.stderr || cleanupResult.stdout || "Failed to remove worktree.",
            target: worktreePath,
            type: "WORKTREE",
          });
          continue;
        }

        cleanedWorktrees.push(worktreePath);
      }

      const taskMainlineBranchName = normalizeRequiredString(task.taskBranchName);
      const protectedBranchNames = new Set(uniqueStrings([
        normalizeRequiredString(task.baseBranch),
      ]));
      const branchNames = uniqueStrings([
        taskMainlineBranchName,
        ...subTasks.map((subTask) => normalizeRequiredString(subTask.branchName)),
      ]).filter((branchName) => !protectedBranchNames.has(branchName));

      for (const branchName of branchNames) {
        const deletionResult = await this.#deleteBranchWithRetries(project.path, branchName);

        if (!deletionResult.ok) {
          failures.push({
            reason: deletionResult.stderr || deletionResult.stdout || "Failed to delete branch.",
            target: branchName,
            type: "BRANCH",
          });
          continue;
        }

        if (!deletionResult.skipped) {
          cleanedBranches.push(branchName);
        }
      }

      if (failures.length > 0) {
        return failure(
          TASK_SERVICE_ERROR_CODES.TASK_BRANCH_CLEANUP_FAILED,
          "Task branch cleanup failed.",
          {
            cleanedBranches,
            cleanedWorktrees,
            failures,
            taskId: task.id,
          },
        );
      }

      return {
        ok: true,
        cleanedBranches,
        cleanedWorktrees,
      };
    });
  }

  #clearTaskRuntimeState(taskId, subTasks, sessions) {
    this.runningLeadSessions.delete(taskId);
    this.cancelledLeadSessionIds.delete(taskId);
    this.pendingPlanDrafts.delete(taskId);
    this.pendingFinalReviews.delete(taskId);
    this.pendingMergeExecutions.delete(taskId);
    this.pendingCleanupTasks.delete(taskId);
    this.pendingTaskMainlineSyncs.delete(taskId);

    for (const subTask of subTasks) {
      this.pendingWorkerLaunches.delete(subTask.id);
      this.runningWorkerSessions.delete(subTask.id);
      this.workerLaunchMetadata.delete(subTask.id);
      this.workerSessionMetadata.delete(subTask.id);
    }

    for (const session of sessions) {
      this.sessionLogPaths.delete(session.id);
      this.sessionOutputAppends.delete(session.id);
      this.cancelledLeadSessionIds.delete(session.id);
      this.cancelledWorkerSessionIds.delete(session.id);
    }
  }

  async #removeWorktreeWithRetries(repoPath, worktreePath) {
    return retryCleanupOperation(
      () => removeWorktree(repoPath, worktreePath),
      CLEANUP_RETRY_ATTEMPTS,
      CLEANUP_RETRY_DELAY_MS,
    );
  }

  async #deleteBranchWithRetries(repoPath, branchName) {
    return retryCleanupOperation(
      () => deleteBranch(repoPath, branchName),
      CLEANUP_RETRY_ATTEMPTS,
      CLEANUP_RETRY_DELAY_MS,
    );
  }

  close() {
    this.closed = true;
    for (const activeSession of this.runningLeadSessions.values()) {
      void activeSession.runtime?.kill?.().catch(() => null);
    }

    for (const activeSession of this.runningWorkerSessions.values()) {
      void activeSession.runtime?.kill?.().catch(() => null);
    }

    this.pendingFinalReviews.clear();
    this.pendingIntegrationExecutions.clear();
    this.pendingMergeExecutions.clear();
    this.pendingCleanupTasks.clear();
    this.pendingTaskMainlineSyncs.clear();
    this.pendingProjectGitLocks.clear();
    this.pendingWorkerLaunches.clear();
    this.runningLeadSessions.clear();
    this.cancelledLeadSessionIds.clear();
    this.runningWorkerSessions.clear();
    this.cancelledWorkerSessionIds.clear();
  }

  async #withProjectGitLock(projectPath, operation) {
    const key = normalizeRequiredString(projectPath);

    if (!key) {
      return operation();
    }

    const previous = this.pendingProjectGitLocks.get(key) ?? Promise.resolve();
    let releaseLock = null;
    const current = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const lock = previous.catch(() => {}).then(() => current);
    this.pendingProjectGitLocks.set(key, lock);

    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      releaseLock?.();

      if (this.pendingProjectGitLocks.get(key) === lock) {
        this.pendingProjectGitLocks.delete(key);
      }
    }
  }
}

class TaskServiceError extends Error {
  constructor(payload) {
    super(payload.message);
    this.name = "TaskServiceError";
    this.payload = payload;
  }
}

async function normalizeAttachmentInput(input) {
  const fileName = normalizeRequiredString(input?.fileName);

  if (!fileName) {
    throw new TaskServiceError({
      code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_NAME_REQUIRED,
      message: "Attachment fileName is required.",
    });
  }

  const declaredMimeType = normalizeRequiredString(input?.mimeType) ?? "application/octet-stream";
  const declaredType = normalizeRequiredString(input?.fileType) ?? inferAttachmentType(fileName, declaredMimeType);

  if (!declaredType || !Object.values(ATTACHMENT_TYPES).includes(declaredType)) {
    throw new TaskServiceError({
      code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_TYPE_UNSUPPORTED,
      message: "Attachment type is not supported.",
      details: { fileName },
    });
  }

  const inferredType = inferAttachmentType(fileName, declaredMimeType);

  if (inferredType !== declaredType) {
    throw new TaskServiceError({
      code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_MIME_MISMATCH,
      message: "Attachment type does not match the supplied file name or MIME type.",
      details: { fileName, fileType: declaredType, mimeType: declaredMimeType },
    });
  }

  const { buffer, size } = await readAttachmentBytes(input, fileName);

  if (size > MAX_ATTACHMENT_BYTES) {
    throw new TaskServiceError({
      code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_SIZE_EXCEEDED,
      message: "Attachment exceeds the current size limit.",
      details: { fileName, maxBytes: MAX_ATTACHMENT_BYTES, size },
    });
  }

  return {
    buffer,
    fileName,
    fileType: inferredType,
    idPrefix: cryptoRandomId(),
    mimeType: declaredMimeType,
    size,
  };
}

async function readAttachmentBytes(input, fileName) {
  if (typeof input?.contentBase64 === "string" && input.contentBase64.length > 0) {
    try {
      const buffer = Buffer.from(input.contentBase64, "base64");
      return { buffer, size: buffer.byteLength };
    } catch {
      throw new TaskServiceError({
        code: TASK_SERVICE_ERROR_CODES.INVALID_ATTACHMENT_PAYLOAD,
        message: "Attachment contentBase64 payload is not valid base64.",
        details: { fileName },
      });
    }
  }

  const filePath = normalizeRequiredString(input?.filePath);

  if (!filePath) {
    throw new TaskServiceError({
      code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_CONTENT_REQUIRED,
      message: "Attachment contentBase64 or filePath is required.",
      details: { fileName },
    });
  }

  try {
    const fileStats = await stat(filePath);
    const buffer = await readFile(filePath);
    return { buffer, size: fileStats.size };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new TaskServiceError({
        code: TASK_SERVICE_ERROR_CODES.ATTACHMENT_PATH_NOT_FOUND,
        message: "Attachment filePath does not exist.",
        details: { fileName, filePath },
      });
    }

    throw error;
  }
}

function inferAttachmentType(fileName, mimeType) {
  const extension = path.extname(fileName).toLowerCase();
  const normalizedMimeType = typeof mimeType === "string" ? mimeType.toLowerCase() : "";

  if (IMAGE_EXTENSIONS.has(extension) || normalizedMimeType.startsWith("image/")) {
    return ATTACHMENT_TYPES.IMAGE;
  }

  if (
    DOCUMENT_EXTENSIONS.has(extension)
    || normalizedMimeType === "application/pdf"
    || normalizedMimeType === "text/markdown"
    || normalizedMimeType === "text/plain"
  ) {
    return ATTACHMENT_TYPES.DOCUMENT;
  }

  if (
    CODE_EXTENSIONS.has(extension)
    || normalizedMimeType.startsWith("text/")
    || normalizedMimeType.includes("json")
    || normalizedMimeType.includes("javascript")
    || normalizedMimeType.includes("xml")
  ) {
    return ATTACHMENT_TYPES.CODE;
  }

  return null;
}

function parseCurrentPlanJson(currentPlanJson) {
  if (typeof currentPlanJson !== "string" || currentPlanJson.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(currentPlanJson);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function cryptoRandomId() {
  return `att_${randomUUID()}`;
}

function buildClarificationPrompt(task, transcriptMessages = []) {
  const transcriptSection = transcriptMessages.length > 0
    ? [
        "Existing clarification transcript:",
        ...transcriptMessages.map((message) => {
          const role = message.role === MESSAGE_ROLE.USER
            ? "Operator"
            : message.role === MESSAGE_ROLE.LEAD_AGENT
              ? "Leader"
              : "System";

          return `${role}: ${String(message.content ?? "").trim()}`;
        }),
        "Resume from this transcript. Do not repeat already-answered questions unless you are resolving ambiguity.",
      ].join("\n")
    : "The operator will send the first clarification message after the session starts.";

  return [
    "You are the lead agent for EAT clarification.",
    "You are speaking only with the human operator. Do not address sub-agents or pretend implementation has started.",
    "Your immediate goal is to produce a confirmable task document, not an execution plan yet.",
    `Task title: ${task.title}`,
    `Requirement description: ${task.description}`,
    transcriptSection,
    "Your job is to gather the missing delivery contract for the task document before planning: target outcome, scope boundaries, affected repo areas, constraints, acceptance criteria, testing expectations, deployment expectations, and any branch or base-branch constraints.",
    "Ask concise follow-up questions, keep the conversation focused on producing that task document, and do not start planning until the operator explicitly confirms the task document is correct.",
    "When the request is clear enough, summarize the agreed task document clearly under short sections and ask for explicit confirmation to begin planning.",
  ].join("\n");
}

function buildTaskMainlineBranchName(title) {
  const normalizedTitle = typeof title === "string" ? title.normalize("NFKC").trim() : "";
  const sanitized = normalizedTitle
    .replaceAll(/[\u0000-\u001F\u007F~^:?*[\]\\]/g, " ")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/\.\.+/g, ".")
    .replaceAll(/@{/g, "-")
    .replaceAll(/^-+/g, "")
    .replaceAll(/-+$/g, "");
  const fallback = sanitized.length > 0 ? sanitized : "task";

  return `eat-${fallback}`.slice(0, 96);
}

function normalizeOutputChunk(chunk) {
  if (typeof chunk !== "string") {
    return null;
  }

  const normalized = chunk.replaceAll(/\r\n/g, "\n");
  return normalized.trim().length > 0 ? normalized : null;
}

function selectLeadSandboxType(supportedSandboxTypes) {
  if (supportedSandboxTypes.includes("HOST")) {
    return "HOST";
  }

  return supportedSandboxTypes[0] ?? "DOCKER";
}

function selectWorkerSandboxType(supportedSandboxTypes) {
  if (supportedSandboxTypes.includes(SESSION_SANDBOX_TYPES.DOCKER)) {
    return SESSION_SANDBOX_TYPES.DOCKER;
  }

  throw new Error("Assigned worker agent does not support the required DOCKER sandbox.");
}

function sanitizeFileName(fileName) {
  return fileName.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

function normalizeRequiredString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()))];
}

function normalizeOptionalJsonObject(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeMailboxTargetType(value) {
  const normalizedValue = normalizeOptionalString(value) ?? MAILBOX_TARGET_TYPE.SUBTASK;
  return Object.values(MAILBOX_TARGET_TYPE).includes(normalizedValue) ? normalizedValue : null;
}

function normalizeMailboxMessageType(value) {
  const normalizedValue = normalizeOptionalString(value) ?? MAILBOX_MESSAGE_TYPE.NOTE;
  return Object.values(MAILBOX_MESSAGE_TYPE).includes(normalizedValue) ? normalizedValue : null;
}

async function defaultIntegrationGateRunner() {
  return DEFAULT_INTEGRATION_GATE_TYPES.map((gateType) => ({
    detailsJson: {
      mode: "default-pass",
    },
    gateType,
    status: GATE_RESULT_STATUS.PASSED,
    summary: "No project-specific integration gate runner is configured. The default local gate passed.",
  }));
}

async function normalizeIntegrationGateResults(results) {
  const entries = Array.isArray(results) && results.length > 0
    ? results
    : await defaultIntegrationGateRunner();

  return entries.map((entry, index) => ({
    detailsJson: normalizeOptionalJsonObject(entry?.detailsJson) ?? null,
    gateType: normalizeRequiredString(entry?.gateType) ?? `GATE_${index + 1}`,
    status: entry?.status === GATE_RESULT_STATUS.FAILED ? GATE_RESULT_STATUS.FAILED : GATE_RESULT_STATUS.PASSED,
    summary: normalizeRequiredString(entry?.summary) ?? "Integration gate completed.",
  }));
}

function failure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function buildPlanRegenerationPrompt(reason, details) {
  const detailText = details ? `Validation details: ${JSON.stringify(details)}` : null;

  return [
    "The previous plan draft was invalid. Regenerate the full plan as JSON only.",
    `Validation failure: ${reason}`,
    detailText,
    "Return a complete replacement object with `subtasks` and optional `notes`.",
  ].filter(Boolean).join("\n");
}

function buildWorkerPrompt(task, subTask, context = {}) {
  const planNode = findPlanNodeForSubTask(task, subTask);
  const mailboxSummary = formatWorkerPromptMailboxNotes(context.mailboxMessages, context.subTasks);
  const acceptanceCriteria = formatAcceptanceCriteriaForPrompt(planNode?.acceptance_criteria);

  return [
    "You are the worker agent for one approved EAT subtask.",
    "You are one member of a supervised agent team. The human operator talks to the lead, not to you.",
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    `Task mainline branch: ${task.taskBranchName ?? task.baseBranch}`,
    `Subtask title: ${subTask.title}`,
    `Subtask description: ${subTask.description}`,
    `Subtask role: ${planNode?.role ?? subTask.role ?? "worker"}`,
    planNode?.deliverable ? `Expected deliverable: ${planNode.deliverable}` : null,
    `Branch: ${subTask.branchName}`,
    subTask.dependencyBranchSuffixes.length > 0
      ? `Depends on: ${subTask.dependencyBranchSuffixes.join(", ")}`
      : "Depends on: none",
    acceptanceCriteria ? `Acceptance criteria:\n${acceptanceCriteria}` : null,
    "Structured mailbox handoff context:",
    mailboxSummary,
    "Execution rules:",
    "1. Work only inside the provided worktree and stay on the assigned branch.",
    "2. Coordinate with other members through concrete deliverables and mailbox-ready outputs, not vague status claims.",
    "3. Leave the branch in a reviewable state with the required file changes actually present.",
    "4. Run the smallest relevant validation or test commands for your slice before finishing.",
    "5. If validation cannot run, say exactly what you tried, what blocked it, and what remains.",
    "6. Do not claim completion unless the deliverable, changed files, and validation evidence all align.",
    "Use the supplied attachments when relevant.",
  ].filter(Boolean).join("\n");
}

function formatWorkerPromptMailboxNotes(mailboxMessages = [], subTasks = []) {
  if (!Array.isArray(mailboxMessages) || mailboxMessages.length === 0) {
    return "(no structured mailbox handoff messages were recorded for this subtask)";
  }

  const subTaskMap = new Map(subTasks.map((subTask) => [subTask.id, subTask]));
  const prioritizedMessages = prioritizeMailboxMessagesForPrompt(mailboxMessages);
  const contractMessages = prioritizedMessages.filter((message) => MAILBOX_CONTRACT_TYPES.has(message.messageType));
  const actionableMessages = prioritizedMessages.filter((message) => (
    [MAILBOX_MESSAGE_TYPE.BLOCKER, MAILBOX_MESSAGE_TYPE.DELIVERABLE_READY, MAILBOX_MESSAGE_TYPE.TEST_REQUEST, MAILBOX_MESSAGE_TYPE.REVIEW_REQUEST].includes(message.messageType)
  ));
  const noteMessages = prioritizedMessages.filter((message) => message.messageType === MAILBOX_MESSAGE_TYPE.NOTE).slice(0, 2);
  const sections = [];

  if (contractMessages.length > 0) {
    sections.push([
      "Latest contracts:",
      ...contractMessages.map((message, index) => formatMailboxPromptEntry(message, subTaskMap, index + 1)),
    ].join("\n"));
  }

  if (actionableMessages.length > 0) {
    sections.push([
      "Actionable blockers and handoffs:",
      ...actionableMessages.map((message, index) => formatMailboxPromptEntry(message, subTaskMap, index + 1)),
    ].join("\n"));
  }

  if (noteMessages.length > 0) {
    sections.push([
      "Recent notes:",
      ...noteMessages.map((message, index) => formatMailboxPromptEntry(message, subTaskMap, index + 1)),
    ].join("\n"));
  }

  return sections.join("\n\n");
}

function buildMailboxSenderLabel(message, subTaskMap) {
  if (message?.senderType === MAILBOX_PARTICIPANT_TYPE.SUBTASK) {
    const senderSubTask = subTaskMap.get(message.senderSubTaskId);

    if (senderSubTask) {
      return `subtask "${senderSubTask.title}" on ${senderSubTask.branchName ?? senderSubTask.branchSuffix}`;
    }

    return `subtask ${message.senderSubTaskId ?? "unknown"}`;
  }

  if (message?.senderType === MAILBOX_PARTICIPANT_TYPE.SYSTEM) {
    return "system";
  }

  return "lead";
}

function prioritizeMailboxMessagesForPrompt(mailboxMessages) {
  const latestByType = new Map();
  const notes = [];

  for (const message of mailboxMessages) {
    if (message.messageType === MAILBOX_MESSAGE_TYPE.NOTE) {
      notes.push(message);
      continue;
    }

    latestByType.set(`${message.messageType}:${message.senderSubTaskId ?? "lead"}:${message.targetSubTaskId ?? message.targetType}`, message);
  }

  const priorityRank = new Map(MAILBOX_PRIORITY_TYPES.map((type, index) => [type, index]));
  const prioritizedNonNotes = [...latestByType.values()].sort((left, right) => {
    const rankDifference = (priorityRank.get(left.messageType) ?? 999) - (priorityRank.get(right.messageType) ?? 999);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    return String(right.createdAt).localeCompare(String(left.createdAt));
  });

  return [
    ...prioritizedNonNotes,
    ...notes.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))),
  ];
}

function formatMailboxPromptEntry(message, subTaskMap, index) {
  const metadata = [
    `from ${buildMailboxSenderLabel(message, subTaskMap)}`,
    `type ${message.messageType ?? MAILBOX_MESSAGE_TYPE.NOTE}`,
    message.branchRef ? `branch ${message.branchRef}` : null,
    Array.isArray(message.fileRefs) && message.fileRefs.length > 0 ? `files ${message.fileRefs.join(", ")}` : null,
    Array.isArray(message.artifactRefs) && message.artifactRefs.length > 0 ? `artifacts ${message.artifactRefs.join(", ")}` : null,
    message.requiresAck ? "ack required" : null,
    message.createdAt ? `at ${message.createdAt}` : null,
  ].filter(Boolean).join(" · ");

  const schemaSummary = message.schemaJson
    ? `Schema: ${tailUtf8(stripAnsiControlCodes(JSON.stringify(message.schemaJson)), MAX_MAILBOX_PROMPT_MESSAGE_BYTES)}`
    : null;

  return [
    `${index}. ${metadata}`,
    tailUtf8(stripAnsiControlCodes(message.content ?? ""), MAX_MAILBOX_PROMPT_MESSAGE_BYTES),
    schemaSummary,
  ].filter(Boolean).join("\n");
}

function buildAutomaticHandoffMessage(subTask, session) {
  const reviewLine = subTask.latestReviewDecision
    ? `Latest incremental review: ${subTask.latestReviewDecision}${subTask.latestReviewSummary ? ` - ${subTask.latestReviewSummary}` : ""}`
    : "Latest incremental review: unavailable";
  const outputExcerpt = tailUtf8(
    stripAnsiControlCodes(session.outputBuffer ?? ""),
    MAX_MAILBOX_PROMPT_MESSAGE_BYTES,
  ) || "(no worker output captured)";

  return {
    artifactRefs: [
      `session:${session.id}`,
      `subtask:${subTask.id}`,
    ],
    branchRef: subTask.branchName ?? subTask.branchSuffix,
    content: [
      `Upstream subtask "${subTask.title}" finished successfully.`,
      `Branch: ${subTask.branchName ?? subTask.branchSuffix}`,
      reviewLine,
      "Worker output excerpt:",
      outputExcerpt,
    ].join("\n"),
    fileRefs: [],
    messageType: MAILBOX_MESSAGE_TYPE.DELIVERABLE_READY,
    schemaJson: {
      latestReviewDecision: subTask.latestReviewDecision ?? null,
      latestReviewSummary: subTask.latestReviewSummary ?? null,
      sourceSessionId: session.id,
      upstreamBranchSuffix: subTask.branchSuffix,
    },
  };
}

async function buildIncrementalReviewPrompt(task, subTask, session, context = {}) {
  const planNode = findPlanNodeForSubTask(task, subTask);
  const persistedLog = session.logPath
    ? await readFile(session.logPath, "utf8").catch(() => null)
    : null;
  const logExcerpt = tailUtf8(
    persistedLog ?? session.outputBuffer ?? "",
    MAX_INCREMENTAL_REVIEW_LOG_BYTES,
  );
  const acceptanceCriteria = formatAcceptanceCriteriaForPrompt(planNode?.acceptance_criteria);

  return [
    "You are the lead reviewer for one completed EAT subtask.",
    "This is an incremental advisory review only. Do not imply final authority.",
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    `Subtask title: ${subTask.title}`,
    `Subtask description: ${subTask.description}`,
    `Worker agent: ${subTask.agentType}`,
    `Worker branch: ${subTask.branchName ?? "unknown"}`,
    planNode?.deliverable ? `Expected deliverable: ${planNode.deliverable}` : null,
    acceptanceCriteria ? `Acceptance criteria:\n${acceptanceCriteria}` : null,
    "Return JSON only with this exact shape:",
    '{"decision":"ACCEPTED|REWORK|REJECTED","summary":"one concise actionable paragraph"}',
    "Use REWORK for fixable issues and REJECTED for major misalignment or unusable output.",
    "Base the decision on actual deliverables in the branch plus the worker log, not on log claims alone.",
    "If the log claims work that is missing from the diff summary or deliverable evidence, use REWORK or REJECTED.",
    "Git diff summary from the current branch/worktree:",
    context.diffSummary ?? "(diff summary unavailable)",
    "Persisted worker log excerpt follows:",
    logExcerpt || "(no worker output captured)",
  ].filter(Boolean).join("\n");
}

function findPlanNodeForSubTask(task, subTask) {
  const approvedPlan = parseCurrentPlanJson(task?.approvedPlanJson) ?? parseCurrentPlanJson(task?.currentPlanJson);

  if (!approvedPlan || !subTask?.branchSuffix) {
    return null;
  }

  return getPlanNodes(approvedPlan).find((node) => node?.branch_suffix === subTask.branchSuffix) ?? null;
}

function formatAcceptanceCriteriaForPrompt(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry, index) => `${index + 1}. ${entry.trim()}`)
    .join("\n");
}

function buildFinalReviewPrompt(review) {
  return [
    "You are the lead reviewer for an authoritative final review across completed EAT subtasks.",
    "This is the authoritative final review. Return final decisions for each listed subtask.",
    "Return JSON only with this exact shape:",
    '{"reviews":[{"subtask_id":"string","decision":"ACCEPTED|REWORK|REJECTED","summary":"one concise actionable paragraph"}]}',
    "Use ACCEPTED for merge-ready work, REWORK for issues that should be rerun, and REJECTED for work that should be discarded instead of merged.",
    `Task id: ${review.taskId}`,
    `Task title: ${review.taskTitle}`,
    `Task description: ${review.taskDescription}`,
    `Base branch: ${review.baseBranch}`,
    review.taskBranchName ? `Task mainline branch: ${review.taskBranchName}` : null,
    `Base commit: ${review.baseCommitSha}`,
    `Lead agent: ${review.leadAgentType}`,
    "Approved plan snapshot:",
    JSON.stringify(review.approvedPlan ?? {}, null, 2),
    "Review the following subtasks in order:",
    JSON.stringify(review.subTasks.map((subTask) => ({
      branch_name: subTask.branchName,
      description: subTask.description,
      diff_summary: subTask.diffSummary,
      incremental_history: subTask.incrementalHistory.map((record) => ({
        created_at: record.createdAt,
        decision: record.decision,
        summary: record.summary,
      })),
      latest_successful_session: subTask.latestSuccessfulSession
        ? {
            agent_type: subTask.latestSuccessfulSession.agentType,
            ended_at: subTask.latestSuccessfulSession.endedAt,
            log_excerpt: subTask.latestSuccessfulSession.logExcerpt,
          }
        : null,
      retry_count: subTask.retryCount,
      subtask_id: subTask.id,
      title: subTask.title,
    })), null, 2),
  ].filter(Boolean).join("\n");
}

function parseIncrementalReviewResponse(response) {
  const rawResponse = typeof response === "string" ? response.trim() : "";

  if (rawResponse.length === 0) {
    return { ok: false };
  }

  const jsonCandidate = extractJsonObject(rawResponse);

  if (!jsonCandidate) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    const decision = normalizeRequiredString(parsed?.decision)?.toUpperCase() ?? null;
    const summary = normalizeRequiredString(parsed?.summary);

    if (!decision || !INCREMENTAL_REVIEW_DECISIONS.has(decision) || !summary) {
      return { ok: false };
    }

    return {
      ok: true,
      review: {
        decision,
        summary,
      },
    };
  } catch {
    return { ok: false };
  }
}

function parseFinalReviewResponse(response, expectedSubTaskIds) {
  const rawResponse = typeof response === "string" ? response.trim() : "";

  if (rawResponse.length === 0) {
    return { ok: false };
  }

  const jsonCandidate = extractJsonObject(rawResponse);

  if (!jsonCandidate) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    const reviews = Array.isArray(parsed?.reviews)
      ? parsed.reviews.map((review) => ({
          decision: normalizeRequiredString(review?.decision)?.toUpperCase() ?? null,
          subTaskId: normalizeRequiredString(review?.subtask_id),
          summary: normalizeRequiredString(review?.summary),
        }))
      : [];

    if (reviews.length !== expectedSubTaskIds.length) {
      return { ok: false };
    }

    const expectedIds = new Set(expectedSubTaskIds);
    const seenIds = new Set();

    for (const review of reviews) {
      if (
        !review.subTaskId
        || !review.summary
        || !FINAL_REVIEW_DECISIONS.has(review.decision)
        || !expectedIds.has(review.subTaskId)
        || seenIds.has(review.subTaskId)
      ) {
        return { ok: false };
      }

      seenIds.add(review.subTaskId);
    }

    return {
      ok: true,
      reviews,
    };
  } catch {
    return { ok: false };
  }
}

function extractJsonObject(value) {
  const startIndex = value.indexOf("{");
  const endIndex = value.lastIndexOf("}");

  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  return value.slice(startIndex, endIndex + 1);
}

function resolveLatestSuccessfulWorkerSession(sessions, subTaskId) {
  return sessions
    .filter((session) => session.subTaskId === subTaskId && session.sessionType === SESSION_TYPE.WORKER)
    .filter((session) => session.status === SESSION_STATUS.COMPLETED && session.exitCode === 0)
    .at(-1) ?? null;
}

async function readSessionLogExcerpt(session, maxBytes) {
  if (!session) {
    return null;
  }

  const persistedLog = session.logPath
    ? await readFile(session.logPath, "utf8").catch(() => null)
    : null;

  return tailUtf8(
    persistedLog ?? session.outputBuffer ?? "",
    maxBytes,
  );
}

async function buildSubTaskDiffSummary(task, project, subTask) {
  if (!subTask.worktreePath && !subTask.branchName) {
    return "(branch not ready)";
  }

  try {
    const worktreeOrRepoPath = subTask.worktreePath ?? project.path;
    const diffBase = subTask.worktreePath
      ? (subTask.startCommitSha ?? task.baseCommitSha)
      : `${subTask.startCommitSha ?? task.baseCommitSha}..${subTask.branchName}`;
    const { stdout } = await execFileAsync("git", [
      "-C",
      worktreeOrRepoPath,
      "diff",
      "--stat",
      "--patch",
      "--unified=0",
      diffBase,
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });

    const trimmed = stdout.trim();
    return trimmed.length > 0
      ? tailUtf8(trimmed, MAX_FINAL_REVIEW_DIFF_BYTES)
      : "(no diff detected)";
  } catch (error) {
    return `Diff unavailable: ${error?.message ?? "git diff failed."}`;
  }
}

function mapFinalReviewDecisionToSubTaskStatus(decision) {
  switch (decision) {
    case "ACCEPTED":
      return SUBTASK_STATUS.ACCEPTED;
    case "REWORK":
      return SUBTASK_STATUS.REWORK_REQUIRED;
    case "REJECTED":
      return SUBTASK_STATUS.DISCARD_PENDING;
    default:
      return SUBTASK_STATUS.REVIEW_PENDING;
  }
}

function mapIncrementalReviewDecisionToSubTaskStatus(decision) {
  switch (decision) {
    case "REWORK":
      return SUBTASK_STATUS.REWORK_REQUIRED;
    case "REJECTED":
      return SUBTASK_STATUS.REWORK_REQUIRED;
    case "ACCEPTED":
      return null;
    default:
      return null;
  }
}

function buildFinalReviewActionRequiredReason(subTasks) {
  const titles = subTasks.map((subTask) => `${subTask.title} (${subTask.status})`);
  return `Final review requires user action for: ${titles.join(", ")}.`;
}

function buildMergeConflictActionRequiredReason(subTask, summary) {
  return `Merge blocked on ${subTask.title}. ${summary}`;
}

function buildDirtyTargetBranchReason(baseBranch) {
  return `Target branch ${baseBranch} is dirty. Clean the repository working tree before resuming merge.`;
}

function buildBaseBranchCheckoutFailureReason(baseBranch, checkoutResult) {
  const details = [checkoutResult?.stderr, checkoutResult?.stdout].filter(Boolean).join("\n").trim();

  if (details.length > 0) {
    return `Could not switch the repository back to ${baseBranch} before merge. ${tailUtf8(details, 512)}`;
  }

  return `Could not switch the repository back to ${baseBranch} before merge.`;
}

function buildCleanupWarningMessage(warning) {
  return `${CLEANUP_WARNING_MESSAGE_PREFIX}${JSON.stringify({
    reason: warning.reason,
    worktreePath: warning.worktreePath,
  })}`;
}

function buildTaskDocumentSnapshotMessage(snapshot) {
  return `${TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX}${JSON.stringify(snapshot)}`;
}

function buildLaunchFailureMessage(failure) {
  return `${LAUNCH_FAILURE_MESSAGE_PREFIX}${JSON.stringify({
    kind: failure.kind,
    reason: failure.reason,
    subTaskId: failure.subTaskId,
  })}`;
}

function parseCleanupWarningsFromMessages(messages) {
  return (messages ?? [])
    .map((message) => parseCleanupWarningMessage(message))
    .filter(Boolean);
}

function parseTaskDocumentSnapshotMessage(message) {
  if (
    message?.role !== MESSAGE_ROLE.SYSTEM
    || typeof message.content !== "string"
    || !message.content.startsWith(TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX.length));
    const goal = normalizeOptionalString(parsed?.goal);
    const scope = normalizeOptionalString(parsed?.scope);
    const constraints = normalizeOptionalString(parsed?.constraints);
    const acceptance = normalizeOptionalString(parsed?.acceptance);
    const context = parsed?.context && typeof parsed.context === "object" ? parsed.context : null;

    if (!goal && !scope && !constraints && !acceptance) {
      return null;
    }

    return {
      acceptance,
      confirmedAt: normalizeOptionalString(parsed?.confirmedAt) ?? message.createdAt,
      constraints,
      context: context
        ? {
            attachments: Array.isArray(context.attachments)
              ? context.attachments.map((item) => normalizeOptionalString(item)).filter(Boolean)
              : [],
            baseBranch: normalizeOptionalString(context.baseBranch),
          }
        : null,
      goal,
      scope,
    };
  } catch {
    return null;
  }
}

function parseCleanupWarningMessage(message) {
  if (
    message?.role !== MESSAGE_ROLE.SYSTEM
    || typeof message.content !== "string"
    || !message.content.startsWith(CLEANUP_WARNING_MESSAGE_PREFIX)
  ) {
    return null;
  }

  const payload = message.content.slice(CLEANUP_WARNING_MESSAGE_PREFIX.length);

  try {
    const parsed = JSON.parse(payload);
    const worktreePath = normalizeRequiredString(parsed?.worktreePath);
    const reason = normalizeRequiredString(parsed?.reason);

    if (!worktreePath || !reason) {
      return null;
    }

    return {
      createdAt: message.createdAt,
      reason,
      worktreePath,
    };
  } catch {
    return null;
  }
}

function parseLaunchFailureMessage(message) {
  if (
    message?.role !== MESSAGE_ROLE.SYSTEM
    || typeof message.content !== "string"
    || !message.content.startsWith(LAUNCH_FAILURE_MESSAGE_PREFIX)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(LAUNCH_FAILURE_MESSAGE_PREFIX.length));
    const kind = normalizeRequiredString(parsed?.kind);
    const reason = normalizeRequiredString(parsed?.reason);
    const subTaskId = normalizeRequiredString(parsed?.subTaskId);

    if (!kind || !reason) {
      return null;
    }

    return {
      createdAt: message.createdAt,
      kind,
      reason,
      subTaskId,
      taskId: message.taskId,
    };
  } catch {
    return null;
  }
}

function synthesizeTaskDocumentSnapshot(task, messages, attachments = []) {
  const existingSnapshot = [...(messages ?? [])]
    .reverse()
    .map((message) => parseTaskDocumentSnapshotMessage(message))
    .find(Boolean);

  if (existingSnapshot) {
    return {
      ...existingSnapshot,
      confirmedAt: new Date().toISOString(),
      context: {
        attachments: attachments.map((attachment) => attachment.fileName).filter(Boolean),
        baseBranch: task.baseBranch,
      },
    };
  }

  const structuredLeadDocument = extractStructuredLeadTaskDocument(messages);
  const conversationLines = collectTaskDocumentConversationLines(messages);
  const clarificationNotes = (messages ?? [])
    .filter((message) => message?.role === MESSAGE_ROLE.USER)
    .map((message) => normalizeOptionalString(message.content))
    .filter(Boolean)
    .slice(1)
    .join("\n\n");

  return {
    acceptance: structuredLeadDocument?.acceptance
      || pickTaskDocumentHighlights(conversationLines, ["验收", "测试", "验证", "acceptance", "review", "部署", "发布"])
      || null,
    confirmedAt: new Date().toISOString(),
    constraints: structuredLeadDocument?.constraints
      || pickTaskDocumentHighlights(conversationLines, ["约束", "限制", "必须", "不要", "constraint", "must", "should", "sandbox", "docker"])
      || null,
    context: {
      attachments: attachments.map((attachment) => attachment.fileName).filter(Boolean),
      baseBranch: task.baseBranch,
    },
    goal: structuredLeadDocument?.goal || normalizeOptionalString(task.description) || normalizeOptionalString(task.title),
    scope: structuredLeadDocument?.scope
      || pickTaskDocumentHighlights(conversationLines, ["范围", "边界", "scope", "api", "接口", "页面", "数据库", "schema", "ui", "cli"])
      || normalizeOptionalString(clarificationNotes)
      || null,
  };
}

function extractStructuredLeadTaskDocument(messages) {
  const leadMessages = (messages ?? [])
    .filter((message) => message?.role === MESSAGE_ROLE.LEAD_AGENT)
    .map((message) => normalizeOptionalString(message.content))
    .filter(Boolean);

  for (let index = leadMessages.length - 1; index >= 0; index -= 1) {
    const parsed = parseStructuredTaskDocumentSections(leadMessages[index]);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseStructuredTaskDocumentSections(text) {
  const lines = String(text ?? "").split(/\r?\n/u);
  const sections = {};
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = matchTaskDocumentHeading(line);

    if (heading) {
      currentKey = heading.key;

      if (heading.body) {
        sections[currentKey] = appendTaskDocumentSectionValue(sections[currentKey], heading.body);
      }
      continue;
    }

    if (!currentKey) {
      continue;
    }

    sections[currentKey] = appendTaskDocumentSectionValue(sections[currentKey], stripTaskDocumentLine(line));
  }

  const normalizedSections = Object.fromEntries(
    Object.entries(sections)
      .map(([key, value]) => [key, normalizeOptionalString(value)])
      .filter(([, value]) => Boolean(value)),
  );

  return Object.keys(normalizedSections).length >= 2 ? normalizedSections : null;
}

function matchTaskDocumentHeading(line) {
  const matchers = [
    /^#{1,6}\s*(.+?)\s*$/u,
    /^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/u,
    /^([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff ()/_-]{1,30})\s*[:：]\s*(.*)$/u,
  ];

  for (const matcher of matchers) {
    const match = line.match(matcher);

    if (!match) {
      continue;
    }

    const label = normalizeOptionalString(match[1]);
    const key = resolveTaskDocumentSectionKey(label);

    if (!key) {
      continue;
    }

    return {
      body: stripTaskDocumentLine(match[2] ?? ""),
      key,
    };
  }

  return null;
}

function resolveTaskDocumentSectionKey(label) {
  const normalizedLabel = String(label ?? "").trim().toLowerCase();

  if (!normalizedLabel) {
    return null;
  }

  if (
    normalizedLabel.includes("任务目标")
    || normalizedLabel.includes("需求目标")
    || normalizedLabel.includes("目标")
    || normalizedLabel.includes("goal")
    || normalizedLabel.includes("objective")
    || normalizedLabel.includes("outcome")
  ) {
    return "goal";
  }

  if (
    normalizedLabel.includes("工作范围")
    || normalizedLabel.includes("范围")
    || normalizedLabel.includes("边界")
    || normalizedLabel.includes("scope")
    || normalizedLabel.includes("in scope")
    || normalizedLabel.includes("out of scope")
  ) {
    return "scope";
  }

  if (
    normalizedLabel.includes("约束")
    || normalizedLabel.includes("限制")
    || normalizedLabel.includes("constraint")
    || normalizedLabel.includes("assumption")
    || normalizedLabel.includes("non-goal")
  ) {
    return "constraints";
  }

  if (
    normalizedLabel.includes("验收")
    || normalizedLabel.includes("测试")
    || normalizedLabel.includes("完成标准")
    || normalizedLabel.includes("acceptance")
    || normalizedLabel.includes("definition of done")
    || normalizedLabel.includes("verification")
  ) {
    return "acceptance";
  }

  return null;
}

function appendTaskDocumentSectionValue(currentValue, nextLine) {
  const normalizedLine = normalizeOptionalString(nextLine);

  if (!normalizedLine) {
    return currentValue ?? "";
  }

  return currentValue ? `${currentValue}\n${normalizedLine}` : normalizedLine;
}

function stripTaskDocumentLine(line) {
  return String(line ?? "").replace(/^[-*•\d.)\s]+/u, "").trim();
}

function collectTaskDocumentConversationLines(messages) {
  return (messages ?? [])
    .filter((message) => message?.role === MESSAGE_ROLE.USER || message?.role === MESSAGE_ROLE.LEAD_AGENT)
    .flatMap((message) => String(message.content ?? "").split(/\r?\n/u))
    .map((line) => stripTaskDocumentLine(line))
    .filter((line) => line.length >= 4);
}

function pickTaskDocumentHighlights(lines, keywords, maxItems = 4) {
  const seen = new Set();
  const matches = [];

  for (const line of lines ?? []) {
    const normalizedLine = String(line).toLowerCase();

    if (!keywords.some((keyword) => normalizedLine.includes(String(keyword).toLowerCase()))) {
      continue;
    }

    if (seen.has(line)) {
      continue;
    }

    seen.add(line);
    matches.push(line);

    if (matches.length >= maxItems) {
      break;
    }
  }

  return matches.length > 0 ? matches.join("\n") : null;
}

function classifyLaunchFailure(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (normalizedMessage.includes("docker") || normalizedMessage.includes("sandbox")) {
    return "SANDBOX_LAUNCH_FAILURE";
  }

  return "WORKER_LAUNCH_FAILURE";
}

function buildCleanupFailureReason(cleanupResult) {
  if (cleanupResult?.timedOut === true) {
    return "Worktree cleanup timed out while waiting for the worktree to be released.";
  }

  const details = [cleanupResult?.stderr, cleanupResult?.stdout].filter(Boolean).join("\n").trim();

  if (details.length > 0) {
    return tailUtf8(details, 512);
  }

  return "Worktree cleanup failed.";
}

function isMergeResumeEligible(subTasks) {
  if (!Array.isArray(subTasks) || subTasks.length === 0) {
    return false;
  }

  return subTasks.every((subTask) => (
    [
      SUBTASK_STATUS.ACCEPTED,
      SUBTASK_STATUS.CANCELLED,
      SUBTASK_STATUS.DISCARDED,
      SUBTASK_STATUS.MERGED,
    ].includes(subTask.status)
  ));
}

function areSubTaskDependenciesSatisfied(subTask, subTasks) {
  const dependencyBranchSuffixes = normalizeDependencyBranchSuffixes(subTask?.dependencyBranchSuffixes);

  if (dependencyBranchSuffixes.length === 0) {
    return true;
  }

  const subTaskByBranchSuffix = new Map((subTasks ?? []).map((entry) => [entry.branchSuffix, entry]));

  return dependencyBranchSuffixes.every((branchSuffix) => (
    DEPENDENCY_SATISFIED_SUBTASK_STATUSES.has(subTaskByBranchSuffix.get(branchSuffix)?.status)
  ));
}

function buildBlockedDependencyReason(blockedSubTasks, allSubTasks) {
  const subTaskByBranchSuffix = new Map((allSubTasks ?? []).map((subTask) => [subTask.branchSuffix, subTask]));
  const summaries = blockedSubTasks.map((subTask) => {
    const blockers = normalizeDependencyBranchSuffixes(subTask.dependencyBranchSuffixes)
      .map((branchSuffix) => {
        const dependencySubTask = subTaskByBranchSuffix.get(branchSuffix);
        return dependencySubTask
          ? `${branchSuffix} (${dependencySubTask.status})`
          : `${branchSuffix} (missing)`;
      });

    return `${subTask.title} is blocked by ${blockers.join(", ")}.`;
  });

  return summaries.join(" ");
}

function normalizeDependencyBranchSuffixes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function groupMailboxMessagesByTargetSubTaskId(messages) {
  const grouped = new Map();

  for (const message of messages ?? []) {
    if (!message.targetSubTaskId) {
      continue;
    }

    const entry = grouped.get(message.targetSubTaskId) ?? [];
    entry.push(message);
    grouped.set(message.targetSubTaskId, entry);
  }

  return grouped;
}

function groupMailboxMessagesBySenderSubTaskId(messages) {
  const grouped = new Map();

  for (const message of messages ?? []) {
    if (!message.senderSubTaskId) {
      continue;
    }

    const entry = grouped.get(message.senderSubTaskId) ?? [];
    entry.push(message);
    grouped.set(message.senderSubTaskId, entry);
  }

  return grouped;
}

function groupRecordsBySubTaskId(records) {
  const grouped = new Map();

  for (const record of records ?? []) {
    const entry = grouped.get(record.subTaskId) ?? [];
    entry.push(record);
    grouped.set(record.subTaskId, entry);
  }

  return grouped;
}

function buildBoardActionRequiredItems(context) {
  const subTasks = Array.isArray(context?.subTasks) ? context.subTasks : [];
  const mailboxMessages = Array.isArray(context?.mailboxMessages) ? context.mailboxMessages : [];
  const launchFailures = Array.isArray(context?.launchFailures) ? context.launchFailures : [];
  const integrationRuns = Array.isArray(context?.integrationRuns) ? context.integrationRuns : [];
  const gateResultsByIntegrationRunId = context?.gateResultsByIntegrationRunId instanceof Map
    ? context.gateResultsByIntegrationRunId
    : new Map();
  const queueItemsByIntegrationRunId = context?.queueItemsByIntegrationRunId instanceof Map
    ? context.queueItemsByIntegrationRunId
    : new Map();
  const task = context?.task ?? null;
  const items = [];

  for (const subTask of subTasks) {
    if (subTask.status === SUBTASK_STATUS.REWORK_REQUIRED) {
      items.push({
        createdAt: subTask.updatedAt ?? subTask.createdAt ?? null,
        kind: "REWORK_REQUIRED",
        owner: resolveBoardActionOwner("REWORK_REQUIRED"),
        primaryAction: "REWORK",
        severity: 20,
        subTaskId: subTask.id,
        summary: subTask.latestReviewSummary ?? `${subTask.title} requires another worker pass.`,
      });
    }

    if (subTask.status === SUBTASK_STATUS.DISCARD_PENDING) {
      items.push({
        createdAt: subTask.updatedAt ?? subTask.createdAt ?? null,
        kind: "DISCARD_PENDING",
        owner: resolveBoardActionOwner("DISCARD_PENDING"),
        primaryAction: "CONFIRM_DISCARD",
        severity: 10,
        subTaskId: subTask.id,
        summary: subTask.latestReviewSummary ?? `${subTask.title} is waiting for discard confirmation.`,
      });
    }

    if (subTask.status === SUBTASK_STATUS.FAILED) {
      items.push({
        createdAt: subTask.updatedAt ?? subTask.createdAt ?? null,
        kind: "FAILED_SUBTASK",
        owner: resolveBoardActionOwner("FAILED_SUBTASK"),
        primaryAction: "REASSIGN",
        severity: 15,
        subTaskId: subTask.id,
        summary: subTask.lastError ?? `${subTask.title} failed and needs operator intervention.`,
      });
    }

    const latestMergeConflict = Array.isArray(subTask.mergeRecords)
      ? [...subTask.mergeRecords].reverse().find((record) => record.status === MERGE_STATUS.CONFLICT) ?? null
      : null;

    if (latestMergeConflict) {
      items.push({
        createdAt: latestMergeConflict.completedAt ?? latestMergeConflict.createdAt ?? null,
        kind: "MERGE_CONFLICT",
        owner: resolveBoardActionOwner("MERGE_CONFLICT"),
        primaryAction: "REBASE_RETRY",
        severity: 5,
        subTaskId: subTask.id,
        summary: latestMergeConflict.conflictSummary ?? `${subTask.title} hit a merge conflict.`,
      });
    }
  }

  for (const failure of launchFailures) {
    items.push({
      createdAt: failure.createdAt ?? null,
      kind: failure.kind,
      owner: resolveBoardActionOwner(failure.kind),
      primaryAction: "REASSIGN",
      severity: 12,
      subTaskId: failure.subTaskId ?? null,
      summary: failure.reason,
    });
  }

  for (const message of mailboxMessages) {
    if (![MAILBOX_MESSAGE_TYPE.BLOCKER, MAILBOX_MESSAGE_TYPE.REVIEW_REQUEST, MAILBOX_MESSAGE_TYPE.TEST_REQUEST].includes(message.messageType)) {
      continue;
    }

    items.push({
      createdAt: message.createdAt ?? null,
      kind: message.messageType,
      owner: resolveBoardActionOwner(message.messageType),
      primaryAction: message.targetType === MAILBOX_TARGET_TYPE.LEAD ? "OPEN_MAILBOX" : "SEND_NOTE",
      severity: message.messageType === MAILBOX_MESSAGE_TYPE.BLOCKER ? 18 : 25,
      subTaskId: message.targetSubTaskId ?? message.senderSubTaskId ?? null,
      summary: tailUtf8(message.content ?? "", 280),
      targetType: message.targetType,
    });
  }

  const latestIntegrationRun = integrationRuns.at(-1) ?? null;

  if (
    task?.status === TASK_STATUS.ACTION_REQUIRED
    && latestIntegrationRun
    && [INTEGRATION_RUN_STATUS.ACTION_REQUIRED, INTEGRATION_RUN_STATUS.FAILED, INTEGRATION_RUN_STATUS.ROLLED_BACK].includes(latestIntegrationRun.status)
  ) {
    const failedGateResults = (gateResultsByIntegrationRunId.get(latestIntegrationRun.id) ?? [])
      .filter((gateResult) => gateResult.status === GATE_RESULT_STATUS.FAILED);
    const failedQueueItem = (queueItemsByIntegrationRunId.get(latestIntegrationRun.id) ?? [])
      .find((queueItem) => queueItem.status === INTEGRATION_QUEUE_ITEM_STATUS.FAILED) ?? null;

    items.push({
      createdAt: latestIntegrationRun.updatedAt ?? latestIntegrationRun.endedAt ?? latestIntegrationRun.createdAt ?? null,
      kind: "INTEGRATION_ATTENTION",
      owner: resolveBoardActionOwner("INTEGRATION_ATTENTION"),
      primaryAction: "OPEN_INTEGRATION",
      severity: 6,
      subTaskId: failedQueueItem?.subTaskId ?? null,
      summary: failedGateResults.at(-1)?.summary ?? task.lastError ?? "Latest integration run requires operator action.",
    });
  }

  if (task?.status === TASK_STATUS.ACTION_REQUIRED && subTasks.length > 0 && isMergeResumeEligible(subTasks)) {
    items.push({
      createdAt: null,
      kind: "TASK_RESUME_MERGE",
      owner: resolveBoardActionOwner("TASK_RESUME_MERGE"),
      primaryAction: "RESUME_MERGE",
      severity: 8,
      subTaskId: null,
      summary: "All merge blockers are resolved. Resume merge to continue integration.",
    });
  }

  return items
    .sort((left, right) => {
      const severityDiff = (left.severity ?? 999) - (right.severity ?? 999);

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
    })
    .map((item, index) => ({
      ...item,
      id: `${item.kind}:${item.subTaskId ?? "task"}:${index}`,
    }));
}

function resolveBoardActionOwner(kind) {
  switch (kind) {
    case "MERGE_CONFLICT":
    case "FAILED_SUBTASK":
    case "INTEGRATION_ATTENTION":
    case "SANDBOX_LAUNCH_FAILURE":
    case "TASK_RESUME_MERGE":
    case "WORKER_LAUNCH_FAILURE":
      return "USER";
    default:
      return "LEADER";
  }
}

function buildBoardWorkflowSummary(context) {
  const subTasks = Array.isArray(context?.subTasks) ? context.subTasks : [];
  const actionRequiredItems = Array.isArray(context?.actionRequiredItems) ? context.actionRequiredItems : [];
  const completed = subTasks.filter((subTask) => (
    [SUBTASK_STATUS.ACCEPTED, SUBTASK_STATUS.CANCELLED, SUBTASK_STATUS.DISCARDED, SUBTASK_STATUS.MERGED].includes(subTask.status)
  )).length;
  const manualAttentionCount = actionRequiredItems.filter((item) => item.owner === "USER").length;
  const systemAttentionCount = actionRequiredItems.filter((item) => item.owner !== "USER").length;
  const waiting = subTasks.filter((subTask) => (
    [SUBTASK_STATUS.BLOCKED, SUBTASK_STATUS.PENDING, SUBTASK_STATUS.READY, SUBTASK_STATUS.REVIEW_PENDING].includes(subTask.status)
  )).length;

  return {
    completed,
    manualAttentionCount,
    systemAttentionCount,
    total: subTasks.length,
    waiting,
  };
}

function buildBoardActivityEntries(context) {
  const subTasks = Array.isArray(context?.subTasks) ? context.subTasks : [];
  const sessions = Array.isArray(context?.sessions) ? context.sessions : [];
  const mailboxMessages = Array.isArray(context?.mailboxMessages) ? context.mailboxMessages : [];
  const reviewRecords = Array.isArray(context?.reviewRecords) ? context.reviewRecords : [];
  const launchFailures = Array.isArray(context?.launchFailures) ? context.launchFailures : [];
  const subTaskById = new Map(subTasks.map((subTask) => [subTask.id, subTask]));
  const entries = [];

  for (const session of sessions) {
    if (session.startedAt) {
      entries.push({
        createdAt: session.startedAt,
        id: `session-start:${session.id}`,
        kind: "SESSION_STARTED",
        subTaskId: session.subTaskId ?? null,
        summary: session.subTaskId
          ? `${subTaskById.get(session.subTaskId)?.title ?? session.subTaskId} session started.`
          : "Lead session started.",
      });
    }

    if (session.endedAt) {
      entries.push({
        createdAt: session.endedAt,
        id: `session-end:${session.id}`,
        kind: "SESSION_ENDED",
        subTaskId: session.subTaskId ?? null,
        summary: session.subTaskId
          ? `${subTaskById.get(session.subTaskId)?.title ?? session.subTaskId} session ended with ${session.status}.`
          : `Lead session ended with ${session.status}.`,
      });
    }
  }

  for (const message of mailboxMessages) {
    const senderSubTask = message.senderSubTaskId ? subTaskById.get(message.senderSubTaskId) : null;
    const targetSubTask = message.targetSubTaskId ? subTaskById.get(message.targetSubTaskId) : null;
    entries.push({
      createdAt: message.createdAt,
      id: `mailbox:${message.id}`,
      kind: "MAILBOX_MESSAGE",
      subTaskId: message.targetSubTaskId ?? message.senderSubTaskId ?? null,
      summary: `${senderSubTask?.title ?? message.senderType.toLowerCase()} sent ${message.messageType} to ${targetSubTask?.title ?? message.targetType.toLowerCase()}.`,
    });
  }

  for (const reviewRecord of reviewRecords) {
    const subTask = subTaskById.get(reviewRecord.subTaskId);
    entries.push({
      createdAt: reviewRecord.createdAt,
      id: `review:${reviewRecord.id}`,
      kind: "REVIEW",
      subTaskId: reviewRecord.subTaskId,
      summary: `${subTask?.title ?? reviewRecord.subTaskId} received ${reviewRecord.phase} review: ${reviewRecord.decision}.`,
    });
  }

  for (const subTask of subTasks) {
    for (const mergeRecord of subTask.mergeRecords ?? []) {
      entries.push({
        createdAt: mergeRecord.completedAt ?? mergeRecord.createdAt,
        id: `merge:${mergeRecord.id}`,
        kind: "MERGE",
        subTaskId: subTask.id,
        summary: `${subTask.title} ${String(mergeRecord.operation).toLowerCase()} finished with ${String(mergeRecord.status).toLowerCase()}.`,
      });
    }
  }

  for (const failure of launchFailures) {
    entries.push({
      createdAt: failure.createdAt ?? null,
      id: `launch-failure:${failure.subTaskId ?? failure.kind}:${failure.createdAt ?? ""}`,
      kind: failure.kind,
      subTaskId: failure.subTaskId ?? null,
      summary: failure.reason,
    });
  }

  return entries
    .filter((entry) => entry.createdAt)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 50);
}

function buildBoardActivityEvent(eventName, data) {
  if (!eventName || eventName === "board:activity") {
    return null;
  }

  const createdAt = new Date().toISOString();

  switch (eventName) {
    case "mailbox:message":
      return {
        createdAt,
        kind: "MAILBOX_MESSAGE",
        subTaskId: data?.message?.targetSubTaskId ?? data?.message?.senderSubTaskId ?? null,
        summary: `Mailbox ${data?.message?.messageType ?? "NOTE"} recorded.`,
      };
    case "session:started":
      return {
        createdAt,
        kind: "SESSION_STARTED",
        subTaskId: data?.subtaskId ?? null,
        summary: data?.subtaskId ? `Worker session started for ${data.subtaskId}.` : "Lead session started.",
      };
    case "session:ended":
      return {
        createdAt,
        kind: "SESSION_ENDED",
        subTaskId: data?.subtaskId ?? null,
        summary: data?.subtaskId ? `Worker session ended for ${data.subtaskId}.` : "Lead session ended.",
      };
    case "subtask:review":
      return {
        createdAt,
        kind: "REVIEW",
        subTaskId: data?.subtaskId ?? data?.id ?? null,
        summary: `Review recorded: ${data?.decision ?? "PENDING"}.`,
      };
    case "merge:status":
      return {
        createdAt,
        kind: "MERGE",
        subTaskId: data?.subtaskId ?? null,
        summary: `Merge status changed to ${data?.status ?? "PENDING"}.`,
      };
    case "task:cleanup-warning":
      return {
        createdAt,
        kind: "CLEANUP_WARNING",
        subTaskId: null,
        summary: data?.reason ?? "Cleanup warning recorded.",
      };
    default:
      return null;
  }
}

async function listConflictPaths(repoPath) {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "diff",
      "--name-only",
      "--diff-filter=U",
    ], {
      encoding: "utf8",
    });

    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function collectAgentResponse(runtime) {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    runtime.onOutput((chunk) => {
      if (typeof chunk !== "string") {
        return;
      }

      output += chunk.replaceAll(/\r\n/g, "\n");
    });

    runtime.onExit((exitCode) => {
      if (settled) {
        return;
      }

      settled = true;

      if (exitCode === 0) {
        resolve(output);
        return;
      }

      reject(new Error(`Lead review session exited with code ${exitCode}.`));
    });
  });
}

function tailUtf8(value, maxBytes) {
  return Buffer.from(String(value ?? ""), "utf8").subarray(-maxBytes).toString("utf8");
}

function stripAnsiControlCodes(value) {
  return String(value ?? "").replaceAll(/\u001b\[[0-9;]*m/g, "");
}

function buildWorkerLaunchMetadata(attachments, capabilities) {
  const included = [];
  const excluded = [];

  for (const attachment of attachments) {
    if (attachment.fileType === ATTACHMENT_TYPES.IMAGE && capabilities.supportsVision !== true) {
      excluded.push({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        fileType: attachment.fileType,
        reason: "Assigned agent does not support vision.",
      });
      continue;
    }

    included.push({
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      filePath: attachment.filePath,
      fileType: attachment.fileType,
    });
  }

  return {
    excluded,
    included,
  };
}

function sanitizeLaunchMetadata(launchMetadata) {
  if (!launchMetadata) {
    return null;
  }

  return {
    excluded: launchMetadata.excluded.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      reason: attachment.reason,
    })),
    included: launchMetadata.included.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
    })),
  };
}

function isEarlyReworkEligible(subTask) {
  return subTask?.status === SUBTASK_STATUS.REVIEW_PENDING
    && ["REJECTED", "REWORK"].includes(subTask.latestReviewDecision);
}

function isSubTaskReassignEligible(task, subTask) {
  return [TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task?.status)
    && [
      SUBTASK_STATUS.BLOCKED,
      SUBTASK_STATUS.CANCELLED,
      SUBTASK_STATUS.FAILED,
      SUBTASK_STATUS.PENDING,
      SUBTASK_STATUS.READY,
      SUBTASK_STATUS.REVIEW_PENDING,
      SUBTASK_STATUS.REWORK_REQUIRED,
    ].includes(subTask?.status);
}

function isSubTaskCancelEligible(task, subTask) {
  return [TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task?.status)
    && [
      SUBTASK_STATUS.BLOCKED,
      SUBTASK_STATUS.FAILED,
      SUBTASK_STATUS.PENDING,
      SUBTASK_STATUS.READY,
      SUBTASK_STATUS.REVIEW_PENDING,
      SUBTASK_STATUS.REWORK_REQUIRED,
      SUBTASK_STATUS.RUNNING,
    ].includes(subTask?.status);
}

function isAgentChangeEligible(task, subTask) {
  return [TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task?.status)
    && [
      SUBTASK_STATUS.CANCELLED,
      SUBTASK_STATUS.FAILED,
      SUBTASK_STATUS.REVIEW_PENDING,
      SUBTASK_STATUS.REWORK_REQUIRED,
    ].includes(subTask?.status);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function createDeferredPromise() {
  let settled = false;
  let resolvePromise = () => {};

  const promise = new Promise((resolve) => {
    resolvePromise = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

async function waitForDeferredPromise(deferred, timeoutMs) {
  if (!deferred?.promise) {
    return;
  }

  await Promise.race([
    deferred.promise,
    sleep(timeoutMs),
  ]);
}

async function retryCleanupOperation(operation, attempts, delayMs) {
  let lastResult = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastResult = await operation();

    if (lastResult?.ok) {
      return lastResult;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return lastResult ?? {
    ok: false,
    stderr: "",
    stdout: "",
  };
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function buildEmptyTaskCleanupResult() {
  return {
    ok: true,
    cleanedBranches: [],
    cleanedWorktrees: [],
  };
}

function resolveLatestLiveWorkerSession(sessions) {
  return [...(sessions ?? [])]
    .reverse()
    .find((session) => WORKER_LIVE_STATUSES.has(session.status)) ?? null;
}

function deriveLeadLifecycleStatus(taskStatus) {
  if ([TASK_STATUS.CLARIFYING, TASK_STATUS.PLANNING, TASK_STATUS.REVIEWING].includes(taskStatus)) {
    return SESSION_STATUS.RUNNING;
  }

  if ([TASK_STATUS.EXECUTING, TASK_STATUS.MERGING, TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.COMPLETED].includes(taskStatus)) {
    return SESSION_STATUS.COMPLETED;
  }

  if ([TASK_STATUS.FAILED, TASK_STATUS.CANCELLED].includes(taskStatus)) {
    return SESSION_STATUS.FAILED;
  }

  return SESSION_STATUS.PENDING;
}

function buildPausedTaskReason(status) {
  return `${TASK_PAUSED_REASON_PREFIX}${status}.`;
}

function isPausedTask(task) {
  return task?.status === TASK_STATUS.ACTION_REQUIRED
    && typeof task?.lastError === "string"
    && task.lastError.startsWith(TASK_PAUSED_REASON_PREFIX);
}

function isTaskPauseAllowed(task) {
  return [
    TASK_STATUS.CLARIFYING,
    TASK_STATUS.EXECUTING,
    TASK_STATUS.MERGING,
    TASK_STATUS.PLANNING,
    TASK_STATUS.PLAN_REVIEW,
    TASK_STATUS.REVIEWING,
  ].includes(task?.status);
}

function isTaskDeleteAllowed(task) {
  return [
    TASK_STATUS.CANCELLED,
    TASK_STATUS.COMPLETED,
    TASK_STATUS.DRAFT,
    TASK_STATUS.FAILED,
  ].includes(task?.status) || isPausedTask(task);
}

function buildDerivedRunSummary(subTask) {
  switch (subTask?.status) {
    case SUBTASK_STATUS.BLOCKED:
      return Array.isArray(subTask?.dependencyBranchSuffixes) && subTask.dependencyBranchSuffixes.length > 0
        ? `Waiting on ${subTask.dependencyBranchSuffixes.join(", ")} before this member can run.`
        : "Waiting on upstream prerequisites.";
    case SUBTASK_STATUS.PENDING:
      return "Queued for team execution.";
    case SUBTASK_STATUS.READY:
      return "Workspace prepared. Waiting for worker launch.";
    case SUBTASK_STATUS.RUNNING:
      return subTask?.worktreePath
        ? `Running inside ${subTask.worktreePath}.`
        : "Worker session is running.";
    case SUBTASK_STATUS.REVIEW_PENDING:
      return "Worker run finished. Lead review will continue automatically.";
    case SUBTASK_STATUS.ACCEPTED:
      return "Accepted by the lead and waiting for integration.";
    case SUBTASK_STATUS.REWORK_REQUIRED:
      return normalizeRequiredString(subTask?.latestReviewSummary) ?? "Lead requested another worker pass before integration.";
    case SUBTASK_STATUS.DISCARD_PENDING:
      return normalizeRequiredString(subTask?.latestReviewSummary) ?? "Lead marked this result to stay out of the merge set.";
    case SUBTASK_STATUS.MERGED:
      return "Merged into the task base branch.";
    case SUBTASK_STATUS.FAILED:
      return normalizeRequiredString(subTask?.lastError) ?? "Worker execution failed.";
    case SUBTASK_STATUS.CANCELLED:
      return "Removed from the current team run.";
    case SUBTASK_STATUS.DISCARDED:
      return "Discarded from the merge set.";
    default:
      return "Waiting for team lifecycle events.";
  }
}

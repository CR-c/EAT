import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ATTACHMENT_TYPES, SESSION_SANDBOX_TYPES } from "../agents/agent-contract.js";
import {
  abortMerge,
  abortRebase,
  checkoutBranch,
  computeDeterministicBranchName,
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
const CLEANUP_WARNING_MESSAGE_PREFIX = "Cleanup warning: ";
const LAUNCH_FAILURE_MESSAGE_PREFIX = "Launch failure: ";

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
  TASK_MESSAGE_REQUIRED: "TASK_MESSAGE_REQUIRED",
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
    this.pendingCleanupTasks = new Set();
    this.closed = false;
  }

  async createTask(input) {
    const projectId = normalizeRequiredString(input?.projectId);
    const title = normalizeRequiredString(input?.title);
    const description = normalizeRequiredString(input?.description);
    const baseBranch = normalizeRequiredString(input?.baseBranch);
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

    const baseCommitSha = await resolveBranchHeadCommit(project.path, baseBranch);

    if (!baseCommitSha) {
      return failure(
        TASK_SERVICE_ERROR_CODES.BASE_BRANCH_NOT_FOUND,
        "Selected base branch could not be resolved to a commit.",
        { baseBranch },
      );
    }

    try {
      const normalizedAttachments = await Promise.all((input?.attachments ?? []).map((attachment) => (
        normalizeAttachmentInput(attachment)
      )));

      const task = await this.taskRepository.createTask({
        baseBranch,
        baseCommitSha,
        description,
        leadAgentType,
        projectId,
        title,
      });

      const attachments = await this.#persistAttachments(task, normalizedAttachments);

      return {
        ok: true,
        attachments,
        task,
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

  async listProjectTasks(projectId) {
    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { projectId });
    }

    const tasks = await this.taskRepository.listTasksByProjectId(projectId);
    return {
      ok: true,
      tasks,
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

  async startClarification(taskId) {
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

    const agentFactory = this.agentService.agentRegistry.get(task.leadAgentType);
    const health = await this.agentService.getHealth();
    const agentHealth = health.agents?.[task.leadAgentType] ?? null;

    if (!agentFactory?.capabilities?.canOrchestrate) {
      return failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_INVALID,
        "Lead agent must be a registered orchestrator.",
        { leadAgentType: task.leadAgentType },
      );
    }

    if (!agentHealth?.available) {
      return failure(
        TASK_SERVICE_ERROR_CODES.LEAD_AGENT_UNHEALTHY,
        "Lead agent is unhealthy and cannot start clarification.",
        {
          failureReason: agentHealth?.failureReason ?? null,
          leadAgentType: task.leadAgentType,
        },
      );
    }

    const session = await this.#createTrackedSession({
      agentType: task.leadAgentType,
      sandboxType: selectLeadSandboxType(agentFactory.capabilities.supportedSandboxTypes),
      sessionType: SESSION_TYPE.LEAD,
      status: SESSION_STATUS.STARTING,
      taskId: task.id,
    });

    try {
      const runtime = await agentFactory.spawnSession({
        attachments: (await this.taskRepository.listAttachmentsByTaskId(task.id)).map((attachment) => ({
          fileName: attachment.fileName,
          filePath: attachment.filePath,
          fileType: attachment.fileType,
        })),
        branchName: task.baseBranch,
        prompt: buildClarificationPrompt(task),
        sandbox: {
          type: session.sandboxType,
        },
        sessionType: SESSION_TYPE.LEAD,
        workDir: project.path,
      });

      const startedAt = new Date().toISOString();
      const runningSession = await this.taskRepository.updateSession(session.id, {
        containerId: runtime.containerId ?? null,
        pid: runtime.pid ?? null,
        startedAt,
        status: SESSION_STATUS.RUNNING,
      });
      const clarifyingTask = await this.#updateTaskStatus(task.id, TASK_STATUS.CLARIFYING, {
        currentTask: task,
        lastError: null,
        publish: false,
      });

      if ((await this.taskRepository.listMessagesByTaskId(task.id)).length === 0) {
        await this.taskRepository.createMessage({
          content: buildInitialUserMessage(task),
          role: MESSAGE_ROLE.USER,
          taskId: task.id,
        });
      }

      this.runningLeadSessions.set(task.id, {
        runtime,
        sessionId: session.id,
      });

      runtime.onOutput((chunk) => {
        void this.#handleLeadOutput(task.id, session.id, chunk);
      });
      runtime.onExit((exitCode) => {
        void this.#handleLeadExit(task.id, session.id, exitCode);
      });

      this.#publish(task.id, "task:status", {
        taskId: task.id,
        status: clarifyingTask.status,
      });
      this.#publishSessionEvent(task.id, "session:started", runningSession);

      return {
        ok: true,
        session: runningSession,
        task: clarifyingTask,
      };
    } catch (error) {
      await this.taskRepository.updateSession(session.id, {
        endedAt: new Date().toISOString(),
        exitCode: null,
        status: SESSION_STATUS.FAILED,
      });
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

    if (task.status !== TASK_STATUS.CLARIFYING) {
      return failure(
        TASK_SERVICE_ERROR_CODES.TASK_NOT_CLARIFYING,
        "Messages can only be sent while the task is clarifying.",
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

    const activeSession = this.runningLeadSessions.get(taskId);

    if (!activeSession) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING,
        "Lead session is not running.",
        { taskId },
      );
    }

    const message = await this.taskRepository.createMessage({
      content,
      role: MESSAGE_ROLE.USER,
      taskId,
    });

    await activeSession.runtime.sendInput(content);

    return {
      ok: true,
      message,
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
    const confirmationMessage = await this.taskRepository.createMessage({
      content: "User confirmed that requirements are clear.",
      role: MESSAGE_ROLE.SYSTEM,
      taskId,
    });

    const activeSession = this.runningLeadSessions.get(taskId);

    if (activeSession) {
      try {
        await activeSession.runtime.sendInput(buildPlanningPrompt(confirmedTask));
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
    this.#queueMergeExecution(taskId);

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

    if (
      task.status !== TASK_STATUS.ACTION_REQUIRED
      || subTask.status !== SUBTASK_STATUS.ACCEPTED
      || !latestMergeRecord
      || latestMergeRecord.operation !== MERGE_OPERATION.MERGE
      || latestMergeRecord.status !== MERGE_STATUS.CONFLICT
    ) {
      return failure(
        TASK_SERVICE_ERROR_CODES.SUBTASK_REBASE_RETRY_NOT_ALLOWED,
        "Rebase & Retry is only available for accepted subtasks whose latest merge attempt conflicted.",
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
    const rebaseResult = await rebaseBranch(rebasedSubTask.worktreePath, task.baseBranch);

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
        targetBranch: task.baseBranch,
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
      targetBranch: task.baseBranch,
    });

    const nextSubTask = await this.taskRepository.updateSubTask(rebasedSubTask.id, {
      lastError: null,
    });
    const resumedTask = await this.#updateTaskStatus(task.id, TASK_STATUS.MERGING, {
      currentTask: task,
      lastError: null,
    });

    this.#publish(task.id, "merge:status", {
      status: MERGE_STATUS.SUCCEEDED,
      subtaskId: rebasedSubTask.id,
      summary: `Rebased ${rebasedSubTask.branchName} onto ${task.baseBranch}. Retrying merge.`,
    });
    this.#publishSubTaskStatus(task.id, nextSubTask);
    this.#queueMergeExecution(task.id);

    return {
      ok: true,
      mergeStatus: MERGE_STATUS.SUCCEEDED,
      subTask: this.#decorateSubTask(nextSubTask),
      task: resumedTask,
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
      await this.#attemptTaskCleanup(nextTask);
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

        const cleanupResult = await removeWorktree(project.path, subTask.worktreePath);

        if (!cleanupResult.ok) {
          const reason = buildCleanupFailureReason(cleanupResult);
          await this.#recordCleanupWarning(task.id, subTask.worktreePath, reason);
        }
      }
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

  async #ensureMergeTargetReady(task, project) {
    if (await isWorkingTreeDirty(project.path)) {
      return {
        ok: false,
        reason: buildDirtyTargetBranchReason(task.baseBranch),
      };
    }

    const currentBranch = await getCurrentBranch(project.path);

    if (currentBranch === task.baseBranch) {
      return { ok: true };
    }

    const checkoutResult = await checkoutBranch(project.path, task.baseBranch);

    if (!checkoutResult.ok) {
      return {
        ok: false,
        reason: buildBaseBranchCheckoutFailureReason(task.baseBranch, checkoutResult),
      };
    }

    return { ok: true };
  }

  async #ensureMergeWorkspace(task, project, subTask) {
    let nextSubTask = subTask;

    try {
      if (!nextSubTask.branchName) {
        const desiredBranchName = computeDeterministicBranchName(task.id, nextSubTask.branchSuffix);
        await ensureBranchExists(project.path, desiredBranchName, task.baseCommitSha);
        nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
          branchName: desiredBranchName,
        });
      }

      await ensureBranchExists(project.path, nextSubTask.branchName, task.baseCommitSha);

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
          runtime,
          sessionId: runningSession.id,
        });

        runtime.onOutput((chunk) => {
          void this.#handleWorkerOutput(task.id, preparedSubTask.id, runningSession.id, chunk);
        });
        runtime.onExit((exitCode) => {
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
      if (!nextSubTask.branchName) {
        const desiredBranchName = computeDeterministicBranchName(task.id, nextSubTask.branchSuffix);
        const resolvedBranchName = await resolveUniqueBranchName(project.path, desiredBranchName);

        nextSubTask = await this.taskRepository.updateSubTask(nextSubTask.id, {
          branchName: resolvedBranchName,
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

      await ensureBranchExists(project.path, nextSubTask.branchName, task.baseCommitSha);

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

    const sessionStatus = exitCode === 0 ? SESSION_STATUS.COMPLETED : SESSION_STATUS.FAILED;
    const nextSession = await this.taskRepository.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      exitCode,
      status: sessionStatus,
    });

    const task = await this.taskRepository.findTaskById(taskId);

    if ([TASK_STATUS.CLARIFYING, TASK_STATUS.PLANNING].includes(task?.status) && exitCode !== 0) {
      await this.#updateTaskStatus(taskId, TASK_STATUS.ACTION_REQUIRED, {
        currentTask: task,
        lastError: task.status === TASK_STATUS.PLANNING
          ? "Lead session ended unexpectedly during planning."
          : "Lead session ended unexpectedly during clarification.",
      });
    }

    this.#publishSessionEvent(taskId, "session:ended", nextSession ?? {
      exitCode,
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
      await this.#runIncrementalReview(taskId, subTaskId, sessionId);
      await this.#createDependencyHandoffMessages(taskId, subTaskId, sessionId);
    }

    await this.#progressDependencySchedule(taskId);
    await this.#maybeStartFinalReview(taskId);
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
        prompt: await buildIncrementalReviewPrompt(task, subTask, session),
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
    const reviewedSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      latestReviewDecision: persistedReview.decision,
      latestReviewPhase: persistedReview.phase,
      latestReviewSummary: persistedReview.summary,
    });

    if (!reviewedSubTask) {
      return;
    }

    this.#publish(taskId, "subtask:review", {
      decision: reviewedSubTask.latestReviewDecision,
      phase: reviewedSubTask.latestReviewPhase,
      summary: reviewedSubTask.latestReviewSummary,
      subtaskId: reviewedSubTask.id,
      taskId,
    });
  }

  async #maybeStartFinalReview(taskId) {
    if (this.closed) {
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
      const mergingTask = await this.#updateTaskStatus(taskId, TASK_STATUS.MERGING, {
        currentTask: task,
        lastError: null,
      });
      this.#queueMergeExecution(taskId);

      return mergingTask;
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

  close() {
    this.closed = true;
    for (const activeSession of this.runningLeadSessions.values()) {
      void activeSession.runtime?.kill?.().catch(() => null);
    }

    for (const activeSession of this.runningWorkerSessions.values()) {
      void activeSession.runtime?.kill?.().catch(() => null);
    }

    this.pendingFinalReviews.clear();
    this.pendingMergeExecutions.clear();
    this.pendingCleanupTasks.clear();
    this.pendingWorkerLaunches.clear();
    this.runningLeadSessions.clear();
    this.runningWorkerSessions.clear();
    this.cancelledWorkerSessionIds.clear();
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

function buildClarificationPrompt(task) {
  return [
    "You are the lead agent for EAT clarification.",
    `Task title: ${task.title}`,
    `Requirement description: ${task.description}`,
    "Ask concise clarification questions until the user explicitly confirms requirements.",
  ].join("\n");
}

function buildInitialUserMessage(task) {
  return [
    `Task title: ${task.title}`,
    `Requirement description: ${task.description}`,
  ].join("\n");
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
  const mailboxSummary = formatWorkerPromptMailboxNotes(context.mailboxMessages, context.subTasks);

  return [
    "You are the worker agent for one approved EAT subtask.",
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    `Subtask title: ${subTask.title}`,
    `Subtask description: ${subTask.description}`,
    `Branch: ${subTask.branchName}`,
    subTask.dependencyBranchSuffixes.length > 0
      ? `Depends on: ${subTask.dependencyBranchSuffixes.join(", ")}`
      : "Depends on: none",
    "Structured mailbox handoff context:",
    mailboxSummary,
    "Work only inside the provided worktree and use the supplied attachments when relevant.",
  ].join("\n");
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

async function buildIncrementalReviewPrompt(task, subTask, session) {
  const persistedLog = session.logPath
    ? await readFile(session.logPath, "utf8").catch(() => null)
    : null;
  const logExcerpt = tailUtf8(
    persistedLog ?? session.outputBuffer ?? "",
    MAX_INCREMENTAL_REVIEW_LOG_BYTES,
  );

  return [
    "You are the lead reviewer for one completed EAT subtask.",
    "This is an incremental advisory review only. Do not imply final authority.",
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    `Subtask title: ${subTask.title}`,
    `Subtask description: ${subTask.description}`,
    `Worker agent: ${subTask.agentType}`,
    `Worker branch: ${subTask.branchName ?? "unknown"}`,
    "Return JSON only with this exact shape:",
    '{"decision":"ACCEPTED|REWORK|REJECTED","summary":"one concise actionable paragraph"}',
    "Use REWORK for fixable issues and REJECTED for major misalignment or unusable output.",
    "Persisted worker log excerpt follows:",
    logExcerpt || "(no worker output captured)",
  ].join("\n");
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
  ].join("\n");
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
      ? task.baseCommitSha
      : `${task.baseCommitSha}..${subTask.branchName}`;
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

function classifyLaunchFailure(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();

  if (normalizedMessage.includes("docker") || normalizedMessage.includes("sandbox")) {
    return "SANDBOX_LAUNCH_FAILURE";
  }

  return "WORKER_LAUNCH_FAILURE";
}

function buildCleanupFailureReason(cleanupResult) {
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

function groupRecordsBySubTaskId(records) {
  const grouped = new Map();

  for (const record of records ?? []) {
    const entry = grouped.get(record.subTaskId) ?? [];
    entry.push(record);
    grouped.set(record.subTaskId, entry);
  }

  return grouped;
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
      return "Worker run finished. Waiting for review outcome.";
    case SUBTASK_STATUS.ACCEPTED:
      return "Accepted for integration.";
    case SUBTASK_STATUS.REWORK_REQUIRED:
      return normalizeRequiredString(subTask?.latestReviewSummary) ?? "Needs another worker pass before integration.";
    case SUBTASK_STATUS.DISCARD_PENDING:
      return normalizeRequiredString(subTask?.latestReviewSummary) ?? "Marked for discard and waiting for operator confirmation.";
    case SUBTASK_STATUS.MERGED:
      return "Merged into the task base branch.";
    case SUBTASK_STATUS.FAILED:
      return normalizeRequiredString(subTask?.lastError) ?? "Worker execution failed.";
    case SUBTASK_STATUS.CANCELLED:
      return "Cancelled by the operator.";
    case SUBTASK_STATUS.DISCARDED:
      return "Discarded from the merge set.";
    default:
      return "Waiting for team lifecycle events.";
  }
}

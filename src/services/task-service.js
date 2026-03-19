import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { ATTACHMENT_TYPES, SESSION_SANDBOX_TYPES } from "../agents/agent-contract.js";
import {
  computeDeterministicBranchName,
  ensureBranchExists,
  ensureWorktree,
  resolveUniqueBranchName,
  resolveWorktreePath,
} from "./git-workspace-service.js";
import { resolveBranchHeadCommit } from "./repo-validation-service.js";
import {
  buildPlanningPrompt,
  looksLikeCompletePlanText,
  parsePlanDraftText,
  validatePlanDraft,
} from "./plan-draft.js";
import {
  PLAN_SNAPSHOT_SOURCE,
  MESSAGE_ROLE,
  REVIEW_PHASE,
  SESSION_STATUS,
  SESSION_TYPE,
  SUBTASK_STATUS,
  TASK_STATUS,
} from "../repositories/task-repository.js";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_INCREMENTAL_REVIEW_LOG_BYTES = 32_768;
const INCREMENTAL_REVIEW_DECISIONS = new Set(["ACCEPTED", "REJECTED", "REWORK"]);

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
  PLAN_SNAPSHOT_NOT_FOUND: "PLAN_SNAPSHOT_NOT_FOUND",
  REQUIREMENTS_ALREADY_CONFIRMED: "REQUIREMENTS_ALREADY_CONFIRMED",
  SESSION_NOT_RUNNING: "SESSION_NOT_RUNNING",
  TASK_MESSAGE_REQUIRED: "TASK_MESSAGE_REQUIRED",
  TASK_NOT_CLARIFYING: "TASK_NOT_CLARIFYING",
  TASK_NOT_DRAFT: "TASK_NOT_DRAFT",
  TASK_NOT_PLAN_REVIEW: "TASK_NOT_PLAN_REVIEW",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  SUBTASK_ACTIVE_SESSION_EXISTS: "SUBTASK_ACTIVE_SESSION_EXISTS",
  SUBTASK_CHANGE_AGENT_NOT_ALLOWED: "SUBTASK_CHANGE_AGENT_NOT_ALLOWED",
  SUBTASK_NOT_FOUND: "SUBTASK_NOT_FOUND",
  SUBTASK_REWORK_NOT_ALLOWED: "SUBTASK_REWORK_NOT_ALLOWED",
  SUBTASK_RETRY_NOT_ALLOWED: "SUBTASK_RETRY_NOT_ALLOWED",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TITLE_REQUIRED: "TITLE_REQUIRED",
});

const WORKER_LIVE_STATUSES = new Set([
  SESSION_STATUS.PENDING,
  SESSION_STATUS.RUNNING,
  SESSION_STATUS.STARTING,
  SESSION_STATUS.STOPPING,
]);

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
    this.sessionLogPaths = new Map();
    this.sessionOutputAppends = new Map();
    this.workerLaunchMetadata = new Map();
    this.workerSessionMetadata = new Map();
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

    const sessions = await this.taskRepository.listSessionsByTaskId(task.id);
    const subTasks = await this.taskRepository.listSubTasksByTaskId(task.id);

    return {
      ok: true,
      attachments: await this.taskRepository.listAttachmentsByTaskId(task.id),
      messages: await this.taskRepository.listMessagesByTaskId(task.id),
      planSnapshots: await this.taskRepository.listPlanSnapshotsByTaskId(task.id),
      sessions: sessions.map((session) => this.#decorateSession(session)),
      subTasks: subTasks.map((subTask) => this.#decorateSubTask(subTask)),
      task,
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
      const clarifyingTask = await this.taskRepository.updateTask(task.id, {
        lastError: null,
        status: TASK_STATUS.CLARIFYING,
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

    const confirmedTask = await this.taskRepository.updateTask(taskId, {
      lastError: null,
      status: TASK_STATUS.PLANNING,
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
      const subTasks = await Promise.all(validation.plan.subtasks.map((subtask) => repository.createSubTask({
        agentType: subtask.recommended_agent,
        autoAssigned: true,
        branchName: null,
        branchSuffix: subtask.branch_suffix,
        description: subtask.description,
        status: SUBTASK_STATUS.PENDING,
        taskId,
        title: subtask.title,
        worktreePath: null,
      })));
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
        this.#publish(taskId, "subtask:status", {
          status: subTask.status,
          subtaskId: subTask.id,
          taskId,
        });
      }

      queueMicrotask(() => {
        void this.#launchApprovedSubTasks(taskId);
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
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      description: nextDescription,
      lastError: null,
      retryCount: (subTask.retryCount ?? 0) + 1,
      status: SUBTASK_STATUS.PENDING,
    });

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
      task: launchResult.task,
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
      ? await this.taskRepository.updateTask(task.id, {
          lastError: null,
          status: TASK_STATUS.EXECUTING,
        })
      : task;
    const pendingSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      agentType: nextAgentType,
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

  async #launchApprovedSubTasks(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);

    if (!task || task.status !== TASK_STATUS.EXECUTING) {
      return;
    }

    const subTasks = await this.taskRepository.listSubTasksByTaskId(taskId);
    await Promise.allSettled(subTasks.map((subTask) => this.#launchSubTask(taskId, subTask.id)));
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
        const runtime = await agentFactory.spawnSession({
          attachments: launchMetadata.included.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            fileName: attachment.fileName,
            filePath: attachment.filePath,
            fileType: attachment.fileType,
          })),
          branchName: preparedSubTask.branchName,
          prompt: buildWorkerPrompt(task, preparedSubTask),
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
    const failedSubTask = await this.taskRepository.updateSubTask(subTask.id, {
      lastError: message,
      status: SUBTASK_STATUS.FAILED,
    });

    this.#publishSubTaskStatus(task.id, failedSubTask);

    let nextTask = task;

    if (options.actionRequired === true) {
      nextTask = await this.taskRepository.updateTask(task.id, {
        lastError: message,
        status: TASK_STATUS.ACTION_REQUIRED,
      });

      this.#publish(task.id, "task:status", {
        reason: message,
        taskId: task.id,
        status: nextTask.status,
      });
    }

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
    this.runningLeadSessions.delete(taskId);
    this.pendingPlanDrafts.delete(taskId);

    const sessionStatus = exitCode === 0 ? SESSION_STATUS.COMPLETED : SESSION_STATUS.FAILED;
    const nextSession = await this.taskRepository.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      exitCode,
      status: sessionStatus,
    });

    const task = await this.taskRepository.findTaskById(taskId);

    if (task?.status === TASK_STATUS.CLARIFYING && exitCode !== 0) {
      const actionRequiredTask = await this.taskRepository.updateTask(taskId, {
        lastError: "Lead session ended unexpectedly during clarification.",
        status: TASK_STATUS.ACTION_REQUIRED,
      });

      this.#publish(taskId, "task:status", {
        taskId,
        status: actionRequiredTask.status,
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
    this.runningWorkerSessions.delete(subTaskId);
    await this.sessionOutputAppends.get(sessionId);

    const sessionStatus = exitCode === 0 ? SESSION_STATUS.COMPLETED : SESSION_STATUS.FAILED;
    const nextSession = await this.taskRepository.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      exitCode,
      status: sessionStatus,
    });
    const nextSubTask = await this.taskRepository.updateSubTask(subTaskId, {
      lastError: exitCode === 0 ? null : `Worker exited with code ${exitCode}.`,
      status: exitCode === 0 ? SUBTASK_STATUS.REVIEW_PENDING : SUBTASK_STATUS.FAILED,
    });

    this.#publishSessionEvent(taskId, "session:ended", nextSession ?? {
      exitCode,
      id: sessionId,
      status: sessionStatus,
      subTaskId,
      taskId,
    });
    this.#publishSubTaskStatus(taskId, nextSubTask);

    if (exitCode === 0) {
      await this.#runIncrementalReview(taskId, subTaskId, sessionId);
    }
  }

  async #runIncrementalReview(taskId, subTaskId, sessionId) {
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

  #decorateSession(session) {
    return {
      ...session,
      launchMetadata: sanitizeLaunchMetadata(this.workerSessionMetadata.get(session.id)),
    };
  }

  #decorateSubTask(subTask) {
    return {
      ...subTask,
      launchMetadata: sanitizeLaunchMetadata(this.workerLaunchMetadata.get(subTask.id)),
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
    const previousAppend = this.sessionOutputAppends.get(sessionId) ?? Promise.resolve();
    const nextAppend = previousAppend
      .catch(() => {})
      .then(async () => {
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

function buildWorkerPrompt(task, subTask) {
  return [
    "You are the worker agent for one approved EAT subtask.",
    `Task title: ${task.title}`,
    `Task description: ${task.description}`,
    `Subtask title: ${subTask.title}`,
    `Subtask description: ${subTask.description}`,
    `Branch: ${subTask.branchName}`,
    "Work only inside the provided worktree and use the supplied attachments when relevant.",
  ].join("\n");
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

function extractJsonObject(value) {
  const startIndex = value.indexOf("{");
  const endIndex = value.lastIndexOf("}");

  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  return value.slice(startIndex, endIndex + 1);
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

function isAgentChangeEligible(task, subTask) {
  return [TASK_STATUS.ACTION_REQUIRED, TASK_STATUS.EXECUTING].includes(task?.status)
    && (subTask?.status === SUBTASK_STATUS.FAILED || isEarlyReworkEligible(subTask));
}

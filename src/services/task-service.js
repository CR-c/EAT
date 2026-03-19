import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { ATTACHMENT_TYPES } from "../agents/agent-contract.js";
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
  SESSION_STATUS,
  SESSION_TYPE,
  TASK_STATUS,
} from "../repositories/task-repository.js";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
  BASE_BRANCH_NOT_FOUND: "BASE_BRANCH_NOT_FOUND",
  BASE_BRANCH_REQUIRED: "BASE_BRANCH_REQUIRED",
  DESCRIPTION_REQUIRED: "DESCRIPTION_REQUIRED",
  INVALID_ATTACHMENT_PAYLOAD: "INVALID_ATTACHMENT_PAYLOAD",
  LEAD_AGENT_INVALID: "LEAD_AGENT_INVALID",
  LEAD_AGENT_UNHEALTHY: "LEAD_AGENT_UNHEALTHY",
  LEAD_AGENT_REQUIRED: "LEAD_AGENT_REQUIRED",
  REQUIREMENTS_ALREADY_CONFIRMED: "REQUIREMENTS_ALREADY_CONFIRMED",
  SESSION_NOT_RUNNING: "SESSION_NOT_RUNNING",
  TASK_MESSAGE_REQUIRED: "TASK_MESSAGE_REQUIRED",
  TASK_NOT_CLARIFYING: "TASK_NOT_CLARIFYING",
  TASK_NOT_DRAFT: "TASK_NOT_DRAFT",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TITLE_REQUIRED: "TITLE_REQUIRED",
});

export class TaskService {
  constructor(options) {
    this.projectRepository = options.projectRepository;
    this.taskRepository = options.taskRepository;
    this.agentService = options.agentService;
    this.eventBus = options.eventBus ?? null;
    this.uploadRootPath = options.uploadRootPath ?? DEFAULT_UPLOAD_ROOT;
    this.runningLeadSessions = new Map();
    this.pendingPlanDrafts = new Map();
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

    return {
      ok: true,
      attachments: await this.taskRepository.listAttachmentsByTaskId(task.id),
      messages: await this.taskRepository.listMessagesByTaskId(task.id),
      planSnapshots: await this.taskRepository.listPlanSnapshotsByTaskId(task.id),
      sessions: await this.taskRepository.listSessionsByTaskId(task.id),
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

    const session = await this.taskRepository.createSession({
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
      this.#publish(task.id, "session:started", {
        sessionId: runningSession.id,
        taskId: task.id,
        status: runningSession.status,
      });

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

    await this.taskRepository.appendSessionOutput(sessionId, normalizedChunk);
    const message = await this.taskRepository.createMessage({
      content: normalizedChunk.trim(),
      role: MESSAGE_ROLE.LEAD_AGENT,
      taskId,
    });

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

    const task = await this.taskRepository.findTaskById(taskId);

    if (task?.status === TASK_STATUS.PLANNING) {
      this.#capturePlanDraftChunk(taskId, normalizedChunk);
    }
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

    this.#publish(taskId, "session:ended", {
      exitCode,
      sessionId,
      status: nextSession?.status ?? sessionStatus,
      taskId,
    });
  }

  #publish(taskId, eventName, data) {
    this.eventBus?.publish(taskId, eventName, data);
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

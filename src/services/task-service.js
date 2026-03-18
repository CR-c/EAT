import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { ATTACHMENT_TYPES } from "../agents/agent-contract.js";
import { resolveBranchHeadCommit } from "./repo-validation-service.js";
import { TASK_STATUS } from "../repositories/task-repository.js";

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
  LEAD_AGENT_REQUIRED: "LEAD_AGENT_REQUIRED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TITLE_REQUIRED: "TITLE_REQUIRED",
});

export class TaskService {
  constructor(options) {
    this.projectRepository = options.projectRepository;
    this.taskRepository = options.taskRepository;
    this.agentService = options.agentService;
    this.uploadRootPath = options.uploadRootPath ?? DEFAULT_UPLOAD_ROOT;
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
      sessions: await this.taskRepository.listSessionsByTaskId(task.id),
      task,
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

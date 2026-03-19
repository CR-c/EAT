import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SqliteProjectRepository } from "../repositories/project-repository.js";
import { SqliteTaskRepository } from "../repositories/task-repository.js";
import { AgentService } from "../services/agent-service.js";
import { ProjectService, PROJECT_SERVICE_ERROR_CODES } from "../services/project-service.js";
import { DockerSandboxManager, SystemService } from "../services/sandbox-manager.js";
import { TaskService, TASK_SERVICE_ERROR_CODES } from "../services/task-service.js";
import { TaskEventBus } from "../services/task-event-bus.js";

const uiDirectoryPath = fileURLToPath(new URL("../ui/", import.meta.url));
const STATIC_ROUTES = new Map([
  ["/", { contentType: "text/html; charset=utf-8", filePath: path.join(uiDirectoryPath, "index.html") }],
  ["/app.css", { contentType: "text/css; charset=utf-8", filePath: path.join(uiDirectoryPath, "app.css") }],
  ["/app.js", { contentType: "text/javascript; charset=utf-8", filePath: path.join(uiDirectoryPath, "app.js") }],
  ["/view-model.js", { contentType: "text/javascript; charset=utf-8", filePath: path.join(uiDirectoryPath, "view-model.js") }],
]);

export function createApp(options = {}) {
  const projectRepository = options.projectRepository ?? new SqliteProjectRepository(options.repositoryOptions);
  const taskRepository = options.taskRepository ?? new SqliteTaskRepository(options.repositoryOptions);
  const projectService = options.projectService ?? new ProjectService({ projectRepository });
  const sandboxManager = options.sandboxManager ?? new DockerSandboxManager({
    uploadRootPath: options.uploadRootPath,
  });
  const agentService = options.agentService ?? new AgentService({
    ...options.agentServiceOptions,
    sandboxManager,
  });
  const systemService = options.systemService ?? new SystemService({ sandboxManager });
  const eventBus = options.eventBus ?? new TaskEventBus();
  const taskService = options.taskService ?? new TaskService({
    agentService,
    eventBus,
    projectRepository,
    sandboxManager,
    taskRepository,
    uploadRootPath: options.uploadRootPath,
  });

  const server = http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, { agentService, projectService, systemService, taskService });
    } catch (error) {
      respondJson(response, 500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred.",
        },
      });
    }
  });

  server.on("close", () => {
    projectRepository.close?.();
    taskRepository.close?.();
  });

  return server;
}

async function routeRequest(request, response, services) {
  const { agentService, projectService, systemService, taskService } = services;
  const url = new URL(request.url, "http://127.0.0.1");
  const pathName = url.pathname;
  const staticRoute = STATIC_ROUTES.get(pathName);

  if (request.method === "GET" && staticRoute) {
    return respondFile(response, staticRoute.filePath, staticRoute.contentType);
  }

  if (request.method === "POST" && pathName === "/api/projects") {
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await projectService.registerProject(body.value);
    return respondServiceResult(response, result, 201);
  }

  if (request.method === "GET" && pathName === "/api/projects") {
    const result = await projectService.listProjects();
    return respondServiceResult(response, result);
  }

  if (request.method === "GET" && pathName === "/api/agents") {
    const result = await agentService.getAgentDirectory({
      force: url.searchParams.get("refresh") === "1",
    });
    return respondJson(response, 200, result);
  }

  if (request.method === "GET" && pathName === "/api/agents/health") {
    const health = await agentService.getHealth({
      force: url.searchParams.get("refresh") === "1",
    });
    const selection = await agentService.getAgentDirectory();

    return respondJson(response, 200, {
      agents: health.agents,
      checkedAt: health.checkedAt,
      leadCandidates: selection.leadCandidates,
      staleAt: health.staleAt,
      ttlMs: health.ttlMs,
      workerCandidates: selection.workerCandidates,
    });
  }

  if (request.method === "GET" && pathName === "/api/system/docker-health") {
    const result = await systemService.getDockerHealth();
    return respondServiceResult(response, result);
  }

  if (request.method === "GET" && pathName === "/api/system/sandbox-policy") {
    const result = await systemService.getSandboxPolicy();
    return respondServiceResult(response, result);
  }

  if (request.method === "POST" && pathName === "/api/tasks") {
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.createTask(body.value);
    return respondServiceResult(response, result, 201);
  }

  const repoStatusMatch = pathName.match(/^\/api\/projects\/([^/]+)\/repo-status$/);

  if (request.method === "GET" && repoStatusMatch) {
    const projectId = decodeURIComponent(repoStatusMatch[1]);
    const result = await projectService.getProjectRepoStatus(projectId);
    return respondServiceResult(response, result);
  }

  const projectMatch = pathName.match(/^\/api\/projects\/([^/]+)$/);

  if (request.method === "GET" && projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const result = await projectService.getProject(projectId);
    return respondServiceResult(response, result);
  }

  const projectTasksMatch = pathName.match(/^\/api\/projects\/([^/]+)\/tasks$/);

  if (request.method === "GET" && projectTasksMatch) {
    const projectId = decodeURIComponent(projectTasksMatch[1]);
    const result = await taskService.listProjectTasks(projectId);
    return respondServiceResult(response, result);
  }

  const taskMatch = pathName.match(/^\/api\/tasks\/([^/]+)$/);

  if (request.method === "GET" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const result = await taskService.getTask(taskId);
    return respondServiceResult(response, result);
  }

  const taskEventsMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/events$/);

  if (request.method === "GET" && taskEventsMatch) {
    const taskId = decodeURIComponent(taskEventsMatch[1]);
    return respondTaskEventStream(request, response, eventBus, taskId);
  }

  const taskStartClarificationMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/start-clarification$/);

  if (request.method === "POST" && taskStartClarificationMatch) {
    const taskId = decodeURIComponent(taskStartClarificationMatch[1]);
    const result = await taskService.startClarification(taskId);
    return respondServiceResult(response, result);
  }

  const taskMessagesMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/messages$/);

  if (request.method === "POST" && taskMessagesMatch) {
    const taskId = decodeURIComponent(taskMessagesMatch[1]);
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.sendTaskMessage(taskId, body.value);
    return respondServiceResult(response, result, 201);
  }

  const taskConfirmRequirementsMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/confirm-requirements$/);

  if (request.method === "POST" && taskConfirmRequirementsMatch) {
    const taskId = decodeURIComponent(taskConfirmRequirementsMatch[1]);
    const result = await taskService.confirmRequirements(taskId);
    return respondServiceResult(response, result);
  }

  const taskCurrentPlanMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/current-plan$/);

  if (request.method === "PUT" && taskCurrentPlanMatch) {
    const taskId = decodeURIComponent(taskCurrentPlanMatch[1]);
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.updateCurrentPlanDraft(taskId, body.value);
    return respondServiceResult(response, result);
  }

  const taskApprovePlanMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/approve-plan$/);

  if (request.method === "POST" && taskApprovePlanMatch) {
    const taskId = decodeURIComponent(taskApprovePlanMatch[1]);
    const result = await taskService.approvePlan(taskId);
    return respondServiceResult(response, result);
  }

  const taskRestorePlanSnapshotMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/restore-plan-snapshot$/);

  if (request.method === "POST" && taskRestorePlanSnapshotMatch) {
    const taskId = decodeURIComponent(taskRestorePlanSnapshotMatch[1]);
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.restorePlanSnapshot(taskId, body.value?.snapshotId);
    return respondServiceResult(response, result);
  }

  const subTaskRetryMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/retry$/);

  if (request.method === "POST" && subTaskRetryMatch) {
    const subTaskId = decodeURIComponent(subTaskRetryMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.retrySubTask(subTaskId, body.value);
    return respondServiceResult(response, result);
  }

  const subTaskReworkMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/rework$/);

  if (request.method === "POST" && subTaskReworkMatch) {
    const subTaskId = decodeURIComponent(subTaskReworkMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.reworkSubTask(subTaskId, body.value);
    return respondServiceResult(response, result);
  }

  const subTaskChangeAgentMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/change-agent$/);

  if (request.method === "POST" && subTaskChangeAgentMatch) {
    const subTaskId = decodeURIComponent(subTaskChangeAgentMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.changeSubTaskAgent(subTaskId, body.value);
    return respondServiceResult(response, result);
  }

  const subTaskConfirmDiscardMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/confirm-discard$/);

  if (request.method === "POST" && subTaskConfirmDiscardMatch) {
    const subTaskId = decodeURIComponent(subTaskConfirmDiscardMatch[1]);
    const result = await taskService.confirmDiscardSubTask(subTaskId);
    return respondServiceResult(response, result);
  }

  return respondJson(response, 404, {
    error: {
      code: "NOT_FOUND",
      message: "Route not found.",
    },
  });
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {
      ok: false,
      error: {
        code: PROJECT_SERVICE_ERROR_CODES.INVALID_REQUEST_BODY,
        message: "Request body must be valid JSON.",
      },
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: PROJECT_SERVICE_ERROR_CODES.INVALID_REQUEST_BODY,
        message: "Request body must be valid JSON.",
      },
    };
  }
}

async function readOptionalJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {
      ok: true,
      value: {},
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: PROJECT_SERVICE_ERROR_CODES.INVALID_REQUEST_BODY,
        message: "Request body must be valid JSON.",
      },
    };
  }
}

function respondServiceResult(response, result, successStatus = 200) {
  if (result.ok) {
    return respondJson(response, successStatus, stripOk(result));
  }

  const statusCode = mapErrorCodeToStatus(result.error.code);
  return respondJson(response, statusCode, { error: result.error });
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function respondFile(response, filePath, contentType) {
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType,
    });
    response.end(body);
  } catch {
    respondJson(response, 500, {
      error: {
        code: "STATIC_ASSET_READ_ERROR",
        message: "Unable to load the requested UI asset.",
      },
    });
  }
}

function stripOk(result) {
  const payload = { ...result };
  delete payload.ok;
  return payload;
}

function mapErrorCodeToStatus(errorCode) {
  switch (errorCode) {
    case PROJECT_SERVICE_ERROR_CODES.INVALID_REQUEST_BODY:
    case PROJECT_SERVICE_ERROR_CODES.PATH_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_CONTENT_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_MIME_MISMATCH:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_NAME_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_SIZE_EXCEEDED:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_TYPE_UNSUPPORTED:
    case TASK_SERVICE_ERROR_CODES.AGENT_TYPE_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.BASE_BRANCH_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.BASE_BRANCH_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.DESCRIPTION_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.INVALID_ATTACHMENT_PAYLOAD:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_INVALID:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_UNHEALTHY:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.INVALID_PLAN:
    case TASK_SERVICE_ERROR_CODES.REQUIREMENTS_ALREADY_CONFIRMED:
    case TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING:
    case TASK_SERVICE_ERROR_CODES.TASK_MESSAGE_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_CLARIFYING:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_DRAFT:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW:
    case TASK_SERVICE_ERROR_CODES.TITLE_REQUIRED:
      return 400;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_ALREADY_REGISTERED:
      return 409;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_PATH_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.PLAN_SNAPSHOT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND:
      return 404;
    case TASK_SERVICE_ERROR_CODES.SUBTASK_RETRY_NOT_ALLOWED:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_REWORK_NOT_ALLOWED:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_CHANGE_AGENT_NOT_ALLOWED:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_DISCARD_NOT_ALLOWED:
      return 400;
    case TASK_SERVICE_ERROR_CODES.SUBTASK_ACTIVE_SESSION_EXISTS:
      return 409;
    default:
      return 400;
  }
}

function respondTaskEventStream(request, response, eventBus, taskId) {
  response.writeHead(200, {
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
  });
  response.write(": connected\n\n");

  const unsubscribe = eventBus.subscribe(taskId, (event) => {
    response.write(`event: ${event.eventName}\n`);
    response.write(`data: ${JSON.stringify(event.data)}\n\n`);
  });
  const keepAlive = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 15_000);

  response.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

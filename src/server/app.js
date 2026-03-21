import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SqliteProjectRepository } from "../repositories/project-repository.js";
import { SqliteTaskRepository } from "../repositories/task-repository.js";
import { AgentService } from "../services/agent-service.js";
import { MetricsService } from "../services/metrics-service.js";
import { ProjectService, PROJECT_SERVICE_ERROR_CODES } from "../services/project-service.js";
import { DockerSandboxManager, SystemService } from "../services/sandbox-manager.js";
import { TaskService, TASK_SERVICE_ERROR_CODES } from "../services/task-service.js";
import { TaskEventBus } from "../services/task-event-bus.js";

const uiDirectoryPath = fileURLToPath(new URL("../ui/", import.meta.url));
const STATIC_CACHE_CONTROL = "no-store";
const STATIC_ROUTES = new Map([
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
  const metricsService = options.metricsService ?? new MetricsService({
    taskRepository,
  });
  const uiAssetVersion = options.uiAssetVersion ?? createUiAssetVersion();
  const taskService = options.taskService ?? new TaskService({
    agentService,
    eventBus,
    projectRepository,
    sandboxManager,
    taskRepository,
    ...options.taskServiceOptions,
    uploadRootPath: options.uploadRootPath,
  });

  const server = http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, {
        agentService,
        eventBus,
        metricsService,
        projectService,
        systemService,
        taskService,
        uiAssetVersion,
      });
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
    taskService.close?.();
  });

  return server;
}

async function routeRequest(request, response, services) {
  const {
    agentService,
    eventBus,
    metricsService,
    projectService,
    systemService,
    taskService,
    uiAssetVersion,
  } = services;
  const url = new URL(request.url, "http://127.0.0.1");
  const pathName = url.pathname;
  const staticRoute = STATIC_ROUTES.get(pathName);

  if (request.method === "GET" && pathName === "/") {
    return respondIndexHtml(response, uiAssetVersion);
  }

  if (request.method === "GET" && staticRoute) {
    return respondStaticAsset(response, staticRoute.filePath, staticRoute.contentType, uiAssetVersion);
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

  if (request.method === "GET" && pathName === "/api/projects/browse") {
    const result = await projectService.browseDirectories({
      includeHidden: url.searchParams.get("hidden") === "1",
      path: url.searchParams.get("path"),
    });
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

  if (request.method === "GET" && pathName === "/api/metrics/summary") {
    const result = await metricsService.getSummary();
    return respondServiceResult(response, result);
  }

  if (request.method === "GET" && pathName === "/api/metrics/export") {
    const result = await metricsService.exportMetrics();
    return respondServiceResult(response, result);
  }

  if (request.method === "GET" && pathName === "/api/task-templates") {
    const result = await taskService.listPlanTemplates();
    return respondServiceResult(response, result);
  }

  if (request.method === "POST" && pathName === "/api/guided-tasks") {
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.createGuidedTask(body.value);
    return respondServiceResult(response, result, 201);
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
    const result = await taskService.listProjectTasks(projectId, {
      includeArchived: url.searchParams.get("includeArchived") === "1",
    });
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

  const taskTeamMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/team$/);

  if (request.method === "GET" && taskTeamMatch) {
    const taskId = decodeURIComponent(taskTeamMatch[1]);
    const result = await taskService.getTaskTeam(taskId);
    return respondServiceResult(response, result);
  }

  const taskBoardMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/board$/);

  if (request.method === "GET" && taskBoardMatch) {
    const taskId = decodeURIComponent(taskBoardMatch[1]);
    const result = await taskService.getTaskBoard(taskId);
    return respondServiceResult(response, result);
  }

  const taskStartClarificationMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/start-clarification$/);

  if (request.method === "POST" && taskStartClarificationMatch) {
    const taskId = decodeURIComponent(taskStartClarificationMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.startClarification(taskId, body.value);
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

  const taskStopLeadSessionMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/stop-lead-session$/);

  if (request.method === "POST" && taskStopLeadSessionMatch) {
    const taskId = decodeURIComponent(taskStopLeadSessionMatch[1]);
    const result = await taskService.stopLeadSession(taskId);
    return respondServiceResult(response, result);
  }

  const taskConfirmRequirementsMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/confirm-requirements$/);

  if (request.method === "POST" && taskConfirmRequirementsMatch) {
    const taskId = decodeURIComponent(taskConfirmRequirementsMatch[1]);
    const result = await taskService.confirmRequirements(taskId);
    return respondServiceResult(response, result);
  }

  const taskMailboxMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/mailbox$/);

  if (request.method === "POST" && taskMailboxMatch) {
    const taskId = decodeURIComponent(taskMailboxMatch[1]);
    const body = await readJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.sendMailboxMessage(taskId, body.value);
    return respondServiceResult(response, result, 201);
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

  const taskPlanSeedMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/plan-seed$/);

  if (request.method === "POST" && taskPlanSeedMatch) {
    const taskId = decodeURIComponent(taskPlanSeedMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.applyPlanTemplateSeed(taskId, body.value);
    return respondServiceResult(response, result);
  }

  const taskApprovePlanMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/approve-plan$/);

  if (request.method === "POST" && taskApprovePlanMatch) {
    const taskId = decodeURIComponent(taskApprovePlanMatch[1]);
    const result = await taskService.approvePlan(taskId);
    return respondServiceResult(response, result);
  }

  const taskArchiveMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/archive$/);

  if (request.method === "POST" && taskArchiveMatch) {
    const taskId = decodeURIComponent(taskArchiveMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.archiveTask(taskId, body.value);
    return respondServiceResult(response, result);
  }

  const taskUnarchiveMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/unarchive$/);

  if (request.method === "POST" && taskUnarchiveMatch) {
    const taskId = decodeURIComponent(taskUnarchiveMatch[1]);
    const result = await taskService.unarchiveTask(taskId);
    return respondServiceResult(response, result);
  }

  if (request.method === "DELETE" && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.deleteTask(taskId, body.value);
    return respondServiceResult(response, result);
  }

  const taskResumeMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/resume$/);

  if (request.method === "POST" && taskResumeMatch) {
    const taskId = decodeURIComponent(taskResumeMatch[1]);
    const result = await taskService.resumeTask(taskId);
    return respondServiceResult(response, result);
  }

  const taskIntegrationRunsMatch = pathName.match(/^\/api\/tasks\/([^/]+)\/integration-runs$/);

  if (request.method === "POST" && taskIntegrationRunsMatch) {
    const taskId = decodeURIComponent(taskIntegrationRunsMatch[1]);
    const result = await taskService.startIntegrationRun(taskId);
    return respondServiceResult(response, result, 201);
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

  const integrationRunRetryMatch = pathName.match(/^\/api\/integration-runs\/([^/]+)\/retry$/);

  if (request.method === "POST" && integrationRunRetryMatch) {
    const integrationRunId = decodeURIComponent(integrationRunRetryMatch[1]);
    const result = await taskService.retryIntegrationRun(integrationRunId);
    return respondServiceResult(response, result);
  }

  const integrationRunRollbackMatch = pathName.match(/^\/api\/integration-runs\/([^/]+)\/rollback$/);

  if (request.method === "POST" && integrationRunRollbackMatch) {
    const integrationRunId = decodeURIComponent(integrationRunRollbackMatch[1]);
    const result = await taskService.rollbackIntegrationRun(integrationRunId);
    return respondServiceResult(response, result);
  }

  const integrationQueueItemDequeueMatch = pathName.match(/^\/api\/integration-queue-items\/([^/]+)\/dequeue$/);

  if (request.method === "POST" && integrationQueueItemDequeueMatch) {
    const integrationQueueItemId = decodeURIComponent(integrationQueueItemDequeueMatch[1]);
    const result = await taskService.dequeueIntegrationQueueItem(integrationQueueItemId);
    return respondServiceResult(response, result);
  }

  const subTaskCancelMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/cancel$/);

  if (request.method === "POST" && subTaskCancelMatch) {
    const subTaskId = decodeURIComponent(subTaskCancelMatch[1]);
    const result = await taskService.cancelSubTask(subTaskId);
    return respondServiceResult(response, result);
  }

  const subTaskReassignMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/reassign$/);

  if (request.method === "POST" && subTaskReassignMatch) {
    const subTaskId = decodeURIComponent(subTaskReassignMatch[1]);
    const body = await readOptionalJsonBody(request);

    if (!body.ok) {
      return respondJson(response, 400, { error: body.error });
    }

    const result = await taskService.reassignSubTask(subTaskId, body.value);
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

  const subTaskRebaseRetryMatch = pathName.match(/^\/api\/subtasks\/([^/]+)\/rebase-retry$/);

  if (request.method === "POST" && subTaskRebaseRetryMatch) {
    const subTaskId = decodeURIComponent(subTaskRebaseRetryMatch[1]);
    const result = await taskService.rebaseRetrySubTask(subTaskId);
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
      "cache-control": STATIC_CACHE_CONTROL,
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

async function respondStaticAsset(response, filePath, contentType, uiAssetVersion) {
  try {
    const body = await readFile(filePath, "utf8");
    const output = filePath.endsWith("app.js")
      ? body.replace('from "./view-model.js";', `from "./view-model.js?v=${uiAssetVersion}";`)
      : body;
    response.writeHead(200, {
      "cache-control": STATIC_CACHE_CONTROL,
      "content-type": contentType,
    });
    response.end(output);
  } catch {
    respondJson(response, 500, {
      error: {
        code: "STATIC_ASSET_READ_ERROR",
        message: "Unable to load the requested UI asset.",
      },
    });
  }
}

async function respondIndexHtml(response, uiAssetVersion) {
  try {
    const body = await readFile(path.join(uiDirectoryPath, "index.html"), "utf8");
    const output = body
      .replace('href="/app.css"', `href="/app.css?v=${uiAssetVersion}"`)
      .replace('src="/app.js"', `src="/app.js?v=${uiAssetVersion}"`);

    response.writeHead(200, {
      "cache-control": STATIC_CACHE_CONTROL,
      "content-type": "text/html; charset=utf-8",
    });
    response.end(output);
  } catch {
    respondJson(response, 500, {
      error: {
        code: "STATIC_ASSET_READ_ERROR",
        message: "Unable to load the requested UI asset.",
      },
    });
  }
}

function createUiAssetVersion() {
  return Date.now().toString(36);
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
    case TASK_SERVICE_ERROR_CODES.BASE_BRANCH_CREATE_FAILED:
    case TASK_SERVICE_ERROR_CODES.BASE_BRANCH_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.BASE_BRANCH_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.DESCRIPTION_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.INVALID_ATTACHMENT_PAYLOAD:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_INVALID:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_UNHEALTHY:
    case TASK_SERVICE_ERROR_CODES.LEAD_AGENT_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.INVALID_PLAN:
    case TASK_SERVICE_ERROR_CODES.MAILBOX_MESSAGE_TYPE_INVALID:
    case TASK_SERVICE_ERROR_CODES.MAILBOX_MESSAGE_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.MAILBOX_NOT_AVAILABLE:
    case TASK_SERVICE_ERROR_CODES.MAILBOX_SCHEMA_INVALID:
    case TASK_SERVICE_ERROR_CODES.MAILBOX_TARGET_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.REQUIREMENTS_ALREADY_CONFIRMED:
    case TASK_SERVICE_ERROR_CODES.SESSION_NOT_RUNNING:
    case TASK_SERVICE_ERROR_CODES.TASK_BRANCH_CLEANUP_FAILED:
    case TASK_SERVICE_ERROR_CODES.TASK_MESSAGE_REQUIRED:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_CLARIFYING:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_DRAFT:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_PLAN_REVIEW:
    case TASK_SERVICE_ERROR_CODES.TITLE_REQUIRED:
      return 400;
    case PROJECT_SERVICE_ERROR_CODES.PATH_ACCESS_DENIED:
      return 403;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_ALREADY_REGISTERED:
      return 409;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.ATTACHMENT_PATH_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.TASK_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.PLAN_TEMPLATE_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.PLAN_SNAPSHOT_NOT_FOUND:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_NOT_FOUND:
      return 404;
    case TASK_SERVICE_ERROR_CODES.SUBTASK_RETRY_NOT_ALLOWED:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_CANCEL_NOT_ALLOWED:
    case TASK_SERVICE_ERROR_CODES.SUBTASK_REASSIGN_NOT_ALLOWED:
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

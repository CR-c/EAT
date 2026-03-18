import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SqliteProjectRepository } from "../repositories/project-repository.js";
import { ProjectService, PROJECT_SERVICE_ERROR_CODES } from "../services/project-service.js";

const uiDirectoryPath = fileURLToPath(new URL("../ui/", import.meta.url));
const STATIC_ROUTES = new Map([
  ["/", { contentType: "text/html; charset=utf-8", filePath: path.join(uiDirectoryPath, "index.html") }],
  ["/app.css", { contentType: "text/css; charset=utf-8", filePath: path.join(uiDirectoryPath, "app.css") }],
  ["/app.js", { contentType: "text/javascript; charset=utf-8", filePath: path.join(uiDirectoryPath, "app.js") }],
  ["/view-model.js", { contentType: "text/javascript; charset=utf-8", filePath: path.join(uiDirectoryPath, "view-model.js") }],
]);

export function createApp(options = {}) {
  const projectRepository = options.projectRepository ?? new SqliteProjectRepository(options.repositoryOptions);
  const projectService = options.projectService ?? new ProjectService({ projectRepository });

  const server = http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, projectService);
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
  });

  return server;
}

async function routeRequest(request, response, projectService) {
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
      return 400;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_ALREADY_REGISTERED:
      return 409;
    case PROJECT_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND:
      return 404;
    default:
      return 400;
  }
}

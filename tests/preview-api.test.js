import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/server/app.js";
import { PREVIEW_SERVICE_ERROR_CODES } from "../src/services/preview-service.js";

test("serves task preview endpoints through the preview service contract", async () => {
  const calls = [];
  const previewService = {
    close() {},
    async getTaskPreview(taskId) {
      calls.push({ method: "get", taskId });
      return successPreview(taskId, "STOPPED");
    },
    async startTaskPreview(taskId, input) {
      calls.push({ input, method: "start", taskId });
      return successPreview(taskId, "STARTING");
    },
    async stopTaskPreview(taskId) {
      calls.push({ method: "stop", taskId });
      return successPreview(taskId, "STOPPED");
    },
  };

  const server = createApp({
    previewService,
    repositoryOptions: {
      databasePath: ":memory:",
    },
  });

  await listen(server);

  try {
    const getResponse = await requestJson(server, "/api/tasks/task-1/preview");
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.preview.session?.status, "STOPPED");

    const startResponse = await requestJson(server, "/api/tasks/task-1/preview/start", {
      body: {
        appRoot: "apps/web",
        command: "pnpm dev -- --host 0.0.0.0 --port 4173",
        targetId: "subtask:sub-1",
      },
      method: "POST",
    });
    assert.equal(startResponse.status, 200);
    assert.equal(startResponse.body.preview.session?.status, "STARTING");

    const stopResponse = await requestJson(server, "/api/tasks/task-1/preview/stop", {
      method: "POST",
    });
    assert.equal(stopResponse.status, 200);
    assert.equal(stopResponse.body.preview.session?.status, "STOPPED");

    assert.deepEqual(
      calls.map((call) => call.method),
      ["get", "start", "stop"],
    );
    assert.equal(calls[1].input.targetId, "subtask:sub-1");
  } finally {
    await close(server);
  }
});

test("maps preview service errors to the expected HTTP status codes", async () => {
  const previewService = {
    close() {},
    async getTaskPreview() {
      return failure(PREVIEW_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.");
    },
    async startTaskPreview() {
      return failure(PREVIEW_SERVICE_ERROR_CODES.PREVIEW_COMMAND_REQUIRED, "Missing command.");
    },
    async stopTaskPreview() {
      return failure(PREVIEW_SERVICE_ERROR_CODES.PREVIEW_STOP_FAILED, "Unable to stop preview.");
    },
  };

  const server = createApp({
    previewService,
    repositoryOptions: {
      databasePath: ":memory:",
    },
  });

  await listen(server);

  try {
    const getResponse = await requestJson(server, "/api/tasks/task-1/preview");
    assert.equal(getResponse.status, 404);

    const startResponse = await requestJson(server, "/api/tasks/task-1/preview/start", {
      body: {},
      method: "POST",
    });
    assert.equal(startResponse.status, 400);

    const stopResponse = await requestJson(server, "/api/tasks/task-1/preview/stop", {
      method: "POST",
    });
    assert.equal(stopResponse.status, 400);
  } finally {
    await close(server);
  }
});

function successPreview(taskId, status) {
  return {
    ok: true,
    preview: {
      appRoots: [
        {
          command: "pnpm dev -- --host 0.0.0.0 --port 4173",
          framework: "vite-react",
          label: "apps/web · vite-react",
          packageManager: "pnpm",
          path: "apps/web",
          recommended: true,
        },
      ],
      available: true,
      defaults: {
        appRoot: "apps/web",
        command: "pnpm dev -- --host 0.0.0.0 --port 4173",
        path: "/",
        port: 4173,
        targetId: "task-mainline",
        targetType: "TASK_MAINLINE",
      },
      recommendation: {
        label: "任务主线 · eat/task-main",
        targetId: "task-mainline",
        targetType: "TASK_MAINLINE",
      },
      session: {
        appRoot: "apps/web",
        branchName: "eat/task-main",
        command: "pnpm dev -- --host 0.0.0.0 --port 4173",
        logs: `preview-log-${taskId}`,
        note: "Preview session note",
        port: 4173,
        startedAt: "2026-03-23T00:00:00.000Z",
        status,
        targetId: "task-mainline",
        targetLabel: "任务主线 · eat/task-main",
        updatedAt: "2026-03-23T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        worktreePath: `/tmp/${taskId}`,
      },
      targets: [
        {
          branchName: "eat/task-main",
          description: "Task mainline",
          id: "task-mainline",
          label: "任务主线 · eat/task-main",
          recommended: true,
          type: "TASK_MAINLINE",
        },
      ],
    },
  };
}

function failure(code, message) {
  return {
    error: {
      code,
      message,
    },
    ok: false,
  };
}

async function requestJson(server, routePath, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    method: options.method ?? "GET",
  });

  return {
    body: await response.json(),
    status: response.status,
  };
}

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

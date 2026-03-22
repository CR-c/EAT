import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PREVIEW_SERVICE_ERROR_CODES, PreviewService } from "../src/services/preview-service.js";

test("builds task preview payload with recommended targets and app roots", async () => {
  const fixturePath = await mkdtemp(path.join(os.tmpdir(), "eat-preview-service-"));

  try {
    await writeFile(
      path.join(fixturePath, "package.json"),
      JSON.stringify({
        name: "preview-root",
        scripts: { dev: "vite" },
        dependencies: { vite: "^5.0.0", react: "^18.0.0" },
      }),
      "utf8",
    );

    const service = new PreviewService({
      projectRepository: {
        async findProjectById(projectId) {
          return { id: projectId, name: "Preview Repo", path: fixturePath };
        },
      },
      taskRepository: {
        async findTaskById(taskId) {
          return {
            id: taskId,
            projectId: "proj-1",
            baseBranch: "main",
            taskBranchName: "eat/task-mainline",
          };
        },
        async listIntegrationRunsByTaskId() {
          return [{ id: "run-1", integrationBranch: "eat/integration/task-1" }];
        },
        async listSubTasksByTaskId() {
          return [{ id: "sub-1", branchName: "eat/task/member-ui", title: "Member UI", status: "ACCEPTED" }];
        },
      },
    });

    const response = await service.getTaskPreview("task-1");

    assert.equal(response.ok, true);
    assert.equal(response.preview.available, true);
    assert.equal(response.preview.recommendation?.targetType, "INTEGRATION_RUN");
    assert.equal(response.preview.defaults.targetType, "INTEGRATION_RUN");
    assert.equal(response.preview.targets.length >= 4, true);
    assert.equal(response.preview.appRoots.length >= 1, true);
    assert.equal(response.preview.appRoots[0].path, ".");
    assert.match(response.preview.appRoots[0].command, /run dev/);
    assert.equal(response.preview.session, null);
  } finally {
    await rm(fixturePath, { force: true, recursive: true });
  }
});

test("starts and stops a preview process with detached worktree cleanup", async () => {
  const fixturePath = await mkdtemp(path.join(os.tmpdir(), "eat-preview-start-stop-"));
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "eat-preview-runtime-"));
  const sandboxHarness = createSandboxHarness();
  const gitCommands = [];

  try {
    const service = new PreviewService({
      execFile: async (binary, args) => {
        assert.equal(binary, "git");
        gitCommands.push(args);

        if (args.includes("add")) {
          const worktreePath = args[5];
          await mkdir(path.join(worktreePath, "apps", "web"), { recursive: true });
          await writeFile(
            path.join(worktreePath, "apps", "web", "package.json"),
            JSON.stringify({
              name: "preview-web",
              scripts: { dev: "vite" },
              dependencies: { vite: "^5.0.0", react: "^18.0.0" },
              packageManager: "pnpm@9.0.0",
            }),
            "utf8",
          );
          return { stdout: "", stderr: "" };
        }

        if (args.includes("remove")) {
          const worktreePath = args[5];
          await rm(worktreePath, { force: true, recursive: true });
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      },
      fetchImpl: async (url) => {
        if (sandboxHarness.isReady(url)) {
          return { status: 200 };
        }

        throw new Error("Preview is not reachable yet.");
      },
      previewRoot,
      projectRepository: {
        async findProjectById(projectId) {
          return { id: projectId, name: "Preview Repo", path: fixturePath };
        },
      },
      readyIntervalMs: 5,
      readyTimeoutMs: 80,
      sandboxManager: {
        worktreeRootPath: previewRoot,
        async spawnContainerSession(input) {
          sandboxHarness.lastInput = input;
          return sandboxHarness.createSession();
        },
      },
      sleep: wait,
      taskRepository: {
        async findTaskById(taskId) {
          return {
            id: taskId,
            projectId: "proj-1",
            baseBranch: "main",
            taskBranchName: "eat/task-mainline",
          };
        },
        async listIntegrationRunsByTaskId() {
          return [];
        },
        async listSubTasksByTaskId() {
          return [{ id: "sub-1", branchName: "eat/task/member-ui", status: "ACCEPTED", title: "Member UI" }];
        },
      },
    });

    const startResponse = await service.startTaskPreview("task-1", {
      targetId: "sub-1",
      appRoot: "apps/web",
      port: 5123,
    });

    assert.equal(startResponse.ok, true);
    assert.equal(startResponse.preview.session?.branchName, "eat/task/member-ui");
    assert.equal(startResponse.preview.session?.port, 5123);
    assert.match(startResponse.preview.session?.command, /pnpm run dev/);
    assert.match(startResponse.preview.session?.appRoot ?? "", /apps\/web$/);
    assert.deepEqual(
      sandboxHarness.lastInput?.sandbox?.publishedPorts,
      [{ containerPort: 5123, hostPort: 5123 }],
    );
    assert.equal(
      sandboxHarness.lastInput?.sandbox?.worktreePath.startsWith(previewRoot),
      true,
    );

    sandboxHarness.emitOutput("ready at http://127.0.0.1:5123/\n");
    sandboxHarness.markReady("http://127.0.0.1:5123/");
    await wait(20);

    const runningResponse = await service.getTaskPreview("task-1");
    assert.equal(runningResponse.ok, true);
    assert.equal(runningResponse.preview.session?.status, "RUNNING");
    assert.equal(runningResponse.preview.session?.url, "http://127.0.0.1:5123/");
    assert.match(runningResponse.preview.session?.logs, /ready at/);

    const stopResponse = await service.stopTaskPreview("task-1");
    assert.equal(stopResponse.ok, true);
    assert.equal(stopResponse.preview.session?.status, "STOPPED");
    assert.match(stopResponse.preview.session?.note, /Stopped by operator/i);
    assert.equal(sandboxHarness.stopCalled, true);
    assert.equal(gitCommands.some((args) => args.includes("add")), true);
    assert.equal(gitCommands.some((args) => args.includes("remove")), true);
  } finally {
    await rm(fixturePath, { force: true, recursive: true });
    await rm(previewRoot, { force: true, recursive: true });
  }
});

test("returns PREVIEW_TARGET_NOT_FOUND when requested preview target does not exist", async () => {
  const service = new PreviewService({
    projectRepository: {
      async findProjectById(projectId) {
        return { id: projectId, path: "/tmp/repo", name: "repo" };
      },
    },
    sandboxManager: {
      worktreeRootPath: "/tmp/.eat-preview-worktrees",
      async spawnContainerSession() {
        throw new Error("should not be called");
      },
    },
    taskRepository: {
      async findTaskById(taskId) {
        return {
          id: taskId,
          projectId: "proj-1",
          baseBranch: "main",
          taskBranchName: "eat/task-mainline",
        };
      },
      async listIntegrationRunsByTaskId() {
        return [];
      },
      async listSubTasksByTaskId() {
        return [];
      },
    },
  });

  const response = await service.startTaskPreview("task-1", {
    targetId: "missing",
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PREVIEW_SERVICE_ERROR_CODES.PREVIEW_TARGET_NOT_FOUND);
});

test("returns PREVIEW_SANDBOX_UNAVAILABLE when Docker preview support is missing", async () => {
  const service = new PreviewService({
    projectRepository: {
      async findProjectById(projectId) {
        return { id: projectId, path: "/tmp/repo", name: "repo" };
      },
    },
    taskRepository: {
      async findTaskById(taskId) {
        return {
          id: taskId,
          projectId: "proj-1",
          baseBranch: "main",
          taskBranchName: "eat/task-mainline",
        };
      },
      async listIntegrationRunsByTaskId() {
        return [];
      },
      async listSubTasksByTaskId() {
        return [];
      },
    },
  });

  const response = await service.startTaskPreview("task-1");

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PREVIEW_SERVICE_ERROR_CODES.PREVIEW_SANDBOX_UNAVAILABLE);
});

function createSandboxHarness() {
  const outputListeners = new Set();
  const exitListeners = new Set();
  const readyUrls = new Set();

  return {
    lastInput: null,
    stopCalled: false,
    createSession() {
      const harness = this;
      return {
        onExit(callback) {
          exitListeners.add(callback);
        },
        onOutput(callback) {
          outputListeners.add(callback);
        },
        async stop() {
          harness.stopCalled = true;
        },
      };
    },
    emitExit(code = 0) {
      for (const listener of exitListeners) {
        listener(code);
      }
    },
    emitOutput(chunk) {
      for (const listener of outputListeners) {
        listener(chunk);
      }
    },
    isReady(url) {
      return readyUrls.has(url);
    },
    markReady(url) {
      readyUrls.add(url);
    },
  };
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

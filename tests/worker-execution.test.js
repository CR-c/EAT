import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createApp } from "../src/server/app.js";
import { AgentRegistry } from "../src/agents/agent-registry.js";
import { AgentService } from "../src/services/agent-service.js";
import { TaskEventBus } from "../src/services/task-event-bus.js";
import { SESSION_SANDBOX_TYPES } from "../src/agents/agent-contract.js";

const execFileAsync = promisify(execFile);

test("resolves branch collisions, persists worktrees, and emits branch rename events", async () => {
  const fixture = await makeTempDir("eat-worker-branch-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const { agentService } = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend slice",
            description: "Implement the backend worker flow.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-slice",
          },
        ],
      },
    });
    const server = await startServer({
      agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "branch-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Exercise branch collision handling.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Branch collision",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await git(repo.repoPath, ["branch", `eat/${taskId}/backend-slice`, "main"]);
        await moveTaskToPlanReview(server, taskId, events);

        const approvalResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`,
          { method: "POST" },
        );
        assert.equal(approvalResponse.status, 200);

        const renamedEvent = await nextEvent(events, (event) => event.eventName === "branch:renamed");
        assert.equal(renamedEvent.data.originalName, `eat/${taskId}/backend-slice`);
        assert.equal(renamedEvent.data.resolvedName, `eat/${taskId}/backend-slice-1`);

        await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks[0].branchName, `eat/${taskId}/backend-slice-1`);
        assert.equal(detailResponse.body.subTasks[0].status, "REVIEW_PENDING");
        assert.ok(detailResponse.body.subTasks[0].worktreePath);
        await access(detailResponse.body.subTasks[0].worktreePath);
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("launches concurrent worker sessions and exposes attachment filtering metadata", async () => {
  const fixture = await makeTempDir("eat-worker-concurrency-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const documentPath = path.join(fixture.path, "requirements.md");
    const imagePath = path.join(fixture.path, "flow.png");
    await writeFile(documentPath, "# requirements\n", "utf8");
    await writeFile(imagePath, "png\n", "utf8");

    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend slice A",
            description: "Run worker A.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-a",
          },
          {
            title: "Backend slice B",
            description: "Run worker B.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-b",
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 200,
        exitCode: 0,
        output: "worker completed\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "concurrency-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          attachments: [
            {
              fileName: "requirements.md",
              filePath: documentPath,
              fileType: "DOCUMENT",
              mimeType: "text/markdown",
            },
            {
              fileName: "flow.png",
              filePath: imagePath,
              fileType: "IMAGE",
              mimeType: "image/png",
            },
          ],
          baseBranch: "main",
          description: "Launch two workers at once.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Concurrent execution",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await moveTaskToPlanReview(server, taskId, events);
        await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`, { method: "POST" });

        const startedEvents = [
          await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId),
        ];

        for (const startedEvent of startedEvents) {
          assert.equal(startedEvent.data.attachments.included.length, 1);
          assert.equal(startedEvent.data.attachments.included[0].fileName, "requirements.md");
          assert.equal(startedEvent.data.attachments.excluded.length, 1);
          assert.equal(startedEvent.data.attachments.excluded[0].fileName, "flow.png");
          assert.equal(startedEvent.data.attachments.excluded[0].reason, "Assigned agent does not support vision.");
        }

        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);

        assert.equal(phase08.stats.maxConcurrent, 2);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks.length, 2);
        assert.equal(detailResponse.body.subTasks[0].launchMetadata.included[0].fileName, "requirements.md");
        assert.equal(detailResponse.body.subTasks[0].launchMetadata.excluded[0].fileName, "flow.png");
        assert.equal(detailResponse.body.subTasks[1].status, "REVIEW_PENDING");
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("persists full worker logs to logPath while keeping a bounded output buffer", async () => {
  const fixture = await makeTempDir("eat-worker-logs-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const eventBus = new TaskEventBus();
    const fullOutput = `${"0123456789abcdef".repeat(5000)}\n`;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Verbose worker",
            description: "Emit a large amount of output.",
            recommended_agent: "worker-agent",
            branch_suffix: "verbose-worker",
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: fullOutput,
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
      uploadRootPath,
    });

    try {
      const repo = await createRepository(fixture.path, "log-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Persist worker session logs.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Worker logs",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await moveTaskToPlanReview(server, taskId, events);
        await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`, { method: "POST" });

        await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);

        const workerSession = detailResponse.body.sessions.find((session) => session.sessionType === "WORKER");
        assert.ok(workerSession);
        assert.ok(workerSession.logPath);
        assert.match(workerSession.logPath, new RegExp(`^${escapeRegExp(uploadRootPath)}`));

        await access(workerSession.logPath);

        const persistedLog = await readFile(workerSession.logPath, "utf8");
        assert.equal(persistedLog, fullOutput);
        assert.ok(workerSession.outputBuffer.length < fullOutput.length);
        assert.equal(workerSession.outputBuffer, tailUtf8(fullOutput, workerSession.outputBufferMaxBytes));
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("retries on the same branch and worktree while blocking duplicate live sessions", async () => {
  const fixture = await makeTempDir("eat-worker-retry-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const attempts = new Map();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Retryable slice",
            description: "First attempt fails.",
            recommended_agent: "worker-agent",
            branch_suffix: "retryable-slice",
          },
        ],
      },
      workerBehavior: (config) => {
        const attempt = (attempts.get(config.workDir) ?? 0) + 1;
        attempts.set(config.workDir, attempt);

        return attempt === 1
          ? {
              delayMs: 20,
              exitCode: 1,
              output: "attempt failed\n",
            }
          : {
              delayMs: 80,
              exitCode: 0,
              output: "attempt succeeded\n",
            };
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "retry-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Retry after one failed worker attempt.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Retry flow",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await moveTaskToPlanReview(server, taskId, events);
        await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`, { method: "POST" });
        await nextEvent(
          events,
          (event) => event.eventName === "subtask:status" && event.data.status === "FAILED",
        );

        const beforeRetry = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const subTask = beforeRetry.body.subTasks[0];
        const originalBranchName = subTask.branchName;
        const originalWorktreePath = subTask.worktreePath;

        const retryResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(subTask.id)}/retry`,
          {
            body: {
              description: "Retry after fixing the worker precondition.",
            },
            method: "POST",
          },
        );
        assert.equal(retryResponse.status, 200);

        const duplicateRetryResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(subTask.id)}/retry`,
          {
            body: {
              description: "This duplicate retry should be rejected.",
            },
            method: "POST",
          },
        );
        assert.equal(duplicateRetryResponse.status, 409);
        assert.equal(duplicateRetryResponse.body.error.code, "SUBTASK_ACTIVE_SESSION_EXISTS");

        await nextEvent(
          events,
          (event) => event.eventName === "subtask:status" && event.data.status === "REVIEW_PENDING",
        );

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks[0].retryCount, 1);
        assert.equal(detailResponse.body.subTasks[0].description, "Retry after fixing the worker precondition.");
        assert.equal(detailResponse.body.subTasks[0].branchName, originalBranchName);
        assert.equal(detailResponse.body.subTasks[0].worktreePath, originalWorktreePath);
        assert.equal(
          detailResponse.body.sessions.filter((session) => session.subTaskId === subTask.id && session.sessionType === "WORKER").length,
          2,
        );
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("moves the task to ACTION_REQUIRED when the assigned worker lacks DOCKER sandbox support", async () => {
  const fixture = await makeTempDir("eat-worker-action-required-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Host-only slice",
            description: "This worker cannot launch in Docker.",
            recommended_agent: "host-only-worker",
            branch_suffix: "host-only-slice",
          },
        ],
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "action-required-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Fail worker launch on unsupported sandbox.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Unsupported sandbox",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await moveTaskToPlanReview(server, taskId, events);
        await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`, { method: "POST" });

        const actionRequiredEvent = await nextEvent(
          events,
          (event) => event.eventName === "task:status" && event.data.status === "ACTION_REQUIRED",
        );
        assert.equal(actionRequiredEvent.data.status, "ACTION_REQUIRED");

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "ACTION_REQUIRED");
        assert.equal(detailResponse.body.subTasks[0].status, "FAILED");
        assert.match(detailResponse.body.subTasks[0].lastError, /DOCKER sandbox/i);
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

function createPhase08AgentService(options) {
  const registry = new AgentRegistry();
  const plan = options.plan;
  const stats = {
    active: 0,
    maxConcurrent: 0,
  };

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Lead adapter for Phase 08 tests.",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
      supportsInteractiveInput: true,
      supportsVision: true,
    },
    async healthCheck() {
      return {
        available: true,
        version: "1.0.0-test",
      };
    },
    name: "healthy-lead",
    async spawnSession() {
      const outputListeners = new Set();
      const exitListeners = new Set();

      setTimeout(() => {
        for (const listener of outputListeners) {
          listener("Confirm the task, then I will emit the plan.\n");
        }
      }, 0);

      return {
        containerId: null,
        pid: 4100,
        sessionId: "lead-session",
        async kill() {
          for (const listener of exitListeners) {
            listener(1);
          }
        },
        onExit(callback) {
          exitListeners.add(callback);
        },
        onOutput(callback) {
          outputListeners.add(callback);
        },
        async sendInput(message) {
          if (message.includes("Generate the execution plan as JSON only")) {
            for (const listener of outputListeners) {
              listener(`${JSON.stringify(plan, null, 2)}\n`);
            }
            return;
          }

          for (const listener of outputListeners) {
            listener(`Confirmed: ${message}\n`);
          }
        },
        async stop() {
          for (const listener of exitListeners) {
            listener(0);
          }
        },
      };
    },
  });

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: false,
      description: "Worker adapter for Phase 08 tests.",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      supportsInteractiveInput: true,
      supportsVision: false,
    },
    async healthCheck() {
      return {
        available: true,
        version: "1.0.0-test",
      };
    },
    name: "worker-agent",
    async spawnSession(config) {
      const outputListeners = new Set();
      const exitListeners = new Set();
      const behavior = options.workerBehavior?.(config) ?? {
        delayMs: 20,
        exitCode: 0,
        output: "worker completed\n",
      };

      stats.active += 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.active);

      setTimeout(() => {
        for (const listener of outputListeners) {
          listener(behavior.output);
        }
      }, 0);

      setTimeout(() => {
        stats.active -= 1;
        for (const listener of exitListeners) {
          listener(behavior.exitCode);
        }
      }, behavior.delayMs);

      return {
        containerId: `container-${path.basename(config.workDir)}`,
        pid: 5200 + stats.maxConcurrent,
        sessionId: `worker-${path.basename(config.workDir)}`,
        async kill() {},
        onExit(callback) {
          exitListeners.add(callback);
        },
        onOutput(callback) {
          outputListeners.add(callback);
        },
        async sendInput() {},
        async stop() {},
      };
    },
  });

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: false,
      description: "Host-only worker for negative launch tests.",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
      supportsInteractiveInput: true,
      supportsVision: false,
    },
    async healthCheck() {
      return {
        available: true,
        version: "1.0.0-test",
      };
    },
    name: "host-only-worker",
    async spawnSession() {
      throw new Error("host-only worker should never spawn");
    },
  });

  return {
    agentService: new AgentService({ agentRegistry: registry }),
    stats,
  };
}

async function moveTaskToPlanReview(server, taskId, events) {
  const startResponse = await requestJson(
    server,
    `/api/tasks/${encodeURIComponent(taskId)}/start-clarification`,
    { method: "POST" },
  );
  assert.equal(startResponse.status, 200);

  const confirmResponse = await requestJson(
    server,
    `/api/tasks/${encodeURIComponent(taskId)}/confirm-requirements`,
    { method: "POST" },
  );
  assert.equal(confirmResponse.status, 200);

  await nextEvent(events, (event) => event.eventName === "task:plan-generated");
}

async function startServer(options = {}) {
  const server = createApp({
    agentService: options.agentService,
    eventBus: options.eventBus,
    repositoryOptions: {
      databasePath: options.databasePath,
    },
    uploadRootPath: options.uploadRootPath,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return server;
}

async function stopServer(server) {
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

async function requestJson(server, routePath, options = {}) {
  const address = server.address();
  const url = new URL(routePath, `http://127.0.0.1:${address.port}`);
  const requestBody = options.body ? JSON.stringify(options.body) : undefined;

  const response = await fetch(url, {
    body: requestBody,
    headers: requestBody ? { "content-type": "application/json" } : undefined,
    method: options.method ?? "GET",
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function createRepository(rootPath, name, options = {}) {
  const repoPath = path.join(rootPath, name);
  const defaultBranch = options.defaultBranch ?? "main";

  await mkdir(repoPath);
  await git(rootPath, ["init", `--initial-branch=${defaultBranch}`, repoPath]);
  await git(repoPath, ["config", "user.name", "EAT Test"]);
  await git(repoPath, ["config", "user.email", "eat@example.com"]);
  await writeFile(path.join(repoPath, "README.md"), "seed\n", "utf8");
  await git(repoPath, ["add", "README.md"]);
  await git(repoPath, ["commit", "-m", "seed"]);

  return { repoPath };
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });

  return stdout.trim();
}

async function nextEvent(events, predicate, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const index = events.findIndex(predicate);

    if (index >= 0) {
      const [event] = events.splice(index, 1);
      return event;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error("Timed out waiting for worker execution event.");
}

async function makeTempDir(prefix) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDir,
    async dispose() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

function tailUtf8(value, maxBytes) {
  return Buffer.from(value, "utf8").subarray(-maxBytes).toString("utf8");
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createApp } from "../src/server/app.js";
import { AgentRegistry } from "../src/agents/agent-registry.js";
import { AgentService } from "../src/services/agent-service.js";
import { TaskEventBus } from "../src/services/task-event-bus.js";
import { SESSION_SANDBOX_TYPES } from "../src/agents/agent-contract.js";
import { SqliteTaskRepository } from "../src/repositories/task-repository.js";

const execFileAsync = promisify(execFile);

test("runs clarification flow, triggers planning, and keeps the task in planning while the draft is parsed", async () => {
  const fixture = await makeTempDir("eat-clarification-flow-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "clarification-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need a lead clarification loop before planning.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Clarify task scope",
        },
        method: "POST",
      });

      const events = [];
      const unsubscribe = eventBus.subscribe(taskResponse.body.task.id, (event) => {
        events.push(event);
      });

      try {
        const startResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
          { method: "POST" },
        );
        assert.equal(startResponse.status, 200);
        assert.equal(startResponse.body.task.status, "CLARIFYING");
        assert.equal(startResponse.body.session.sessionType, "LEAD");

        const startedEvent = await nextEvent(events, (entry) => entry.eventName === "task:status");
        assert.equal(startedEvent.event, "task:status");
        assert.equal(startedEvent.data.status, "CLARIFYING");

        const sessionStartedEvent = await nextEvent(events, (entry) => entry.eventName === "session:started");
        assert.equal(sessionStartedEvent.event, "session:started");

        const leadOutputEvent = await nextEvent(events, (entry) => entry.eventName === "task:lead-message");
        assert.match(leadOutputEvent.data.content, /parallel-only/i);

        const messageResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/messages`,
          {
            body: {
              content: "The task must stay within Phase 04 and exclude planning UI.",
            },
            method: "POST",
          },
        );
        assert.equal(messageResponse.status, 201);

        const followUpEvent = await nextEvent(events, (entry) => entry.eventName === "task:lead-message" && entry.data.messageId !== leadOutputEvent.data.messageId);
        assert.match(followUpEvent.data.content, /Confirmed/i);

        const confirmResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
          { method: "POST" },
        );
        assert.equal(confirmResponse.status, 200);
        assert.equal(confirmResponse.body.task.status, "PLANNING");

        const planningEvent = await nextEvent(
          events,
          (entry) => entry.eventName === "task:status" && entry.data.status === "PLANNING",
        );
        assert.equal(planningEvent.data.status, "PLANNING");

        const planningOutputEvent = await nextEvent(
          events,
          (entry) => entry.eventName === "task:lead-message" && entry.data.content.includes("\"subtasks\""),
        );
        assert.match(planningOutputEvent.data.content, /```json/i);

        const planGeneratedEvent = await nextEvent(
          events,
          (entry) => entry.eventName === "task:plan-generated",
        );
        assert.equal(planGeneratedEvent.data.planVersion, 1);
        assert.equal(planGeneratedEvent.data.currentPlan.subtasks[0].branch_suffix, "backend-slice");

        const detailResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
        );
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "PLAN_REVIEW");
        assert.equal(detailResponse.body.task.planVersion, 1);
        assert.equal(typeof detailResponse.body.task.currentPlanJson, "string");
        assert.deepEqual(
          detailResponse.body.messages.map((message) => message.role),
          ["USER", "LEAD_AGENT", "USER", "LEAD_AGENT", "SYSTEM", "LEAD_AGENT"],
        );
        assert.equal(detailResponse.body.sessions.length, 1);
        assert.equal(detailResponse.body.sessions[0].status, "RUNNING");
        assert.equal(detailResponse.body.planSnapshots.length, 1);
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

test("regenerates after an invalid syntactically valid plan and only snapshots the valid retry", async () => {
  const fixture = await makeTempDir("eat-plan-regeneration-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const server = await startServer({
      agentService: createRegeneratingAgentService(),
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "planning-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need validation and regeneration handling.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Regenerate invalid plan",
        },
        method: "POST",
      });

      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
        { method: "POST" },
      );
      const confirmResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
        { method: "POST" },
      );
      assert.equal(confirmResponse.status, 200);

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.task.status, "PLAN_REVIEW");
      assert.equal(detailResponse.body.task.planVersion, 2);
      assert.equal(detailResponse.body.planSnapshots.length, 1);
      assert.match(detailResponse.body.messages.at(-2).content, /Plan validation failed/i);
      assert.equal(
        JSON.parse(detailResponse.body.task.currentPlanJson).subtasks[0].branch_suffix,
        "valid-retry",
      );

      const taskRepository = new SqliteTaskRepository({ databasePath });
      try {
        const snapshots = await taskRepository.listPlanSnapshotsByTaskId(taskResponse.body.task.id);
        assert.equal(snapshots.length, 1);
        assert.equal(snapshots[0].version, 2);
      } finally {
        taskRepository.close();
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

function createClarificationAgentService() {
  const registry = new AgentRegistry();

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Lead clarification test adapter",
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
          listener("Do subtasks need to remain parallel-only, and are attachments task-critical?\n");
        }
      }, 0);

      return {
        containerId: null,
        pid: 4321,
        sessionId: "lead-runtime-1",
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
              listener([
                "```json",
                "{",
                '  "subtasks": [',
                "    {",
                '      "title": "Plan the backend slice",',
                '      "description": "Keep the work independent and parallel-safe.",',
                '      "recommended_agent": "healthy-lead",',
                '      "branch_suffix": "backend-slice"',
                "    }",
                "  ]",
                "}",
                "```",
                "",
              ].join("\n"));
            }
            return;
          }

          if (message.includes("Requirements are confirmed")) {
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

  return new AgentService({ agentRegistry: registry });
}

function createRegeneratingAgentService() {
  const registry = new AgentRegistry();
  let planningAttempt = 0;

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Lead planning regeneration adapter",
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
          listener("Clarify first, then I will propose the plan.\n");
        }
      }, 0);

      return {
        containerId: null,
        pid: 6789,
        sessionId: "lead-runtime-regen",
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
            planningAttempt += 1;

            for (const listener of outputListeners) {
              listener(planningAttempt === 1
                ? `{
  "subtasks": [
    {
      "title": "Broken plan",
      "description": "This branch suffix is invalid.",
      "recommended_agent": "healthy-lead",
      "branch_suffix": "Invalid Suffix"
    }
  ]
}\n`
                : `{
  "subtasks": [
    {
      "title": "Valid retry",
      "description": "This retry should pass validation.",
      "recommended_agent": "healthy-lead",
      "branch_suffix": "valid-retry"
    }
  ]
}\n`);
            }
            return;
          }

          if (message.includes("The previous plan draft was invalid")) {
            planningAttempt += 1;

            for (const listener of outputListeners) {
              listener(`{
  "subtasks": [
    {
      "title": "Valid retry",
      "description": "This retry should pass validation.",
      "recommended_agent": "healthy-lead",
      "branch_suffix": "valid-retry"
    }
  ]
}\n`);
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

  return new AgentService({ agentRegistry: registry });
}

async function startServer(options = {}) {
  const server = createApp({
    agentService: options.agentService,
    eventBus: options.eventBus,
    repositoryOptions: {
      databasePath: options.databasePath,
    },
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

async function nextEvent(events, predicate, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const index = events.findIndex(predicate);

    if (index >= 0) {
      const [event] = events.splice(index, 1);
      return {
        data: event.data,
        event: event.eventName,
      };
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error("Timed out waiting for clarification event.");
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

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createApp } from "../src/server/app.js";
import { AgentRegistry } from "../src/agents/agent-registry.js";
import { AgentService } from "../src/services/agent-service.js";
import { SESSION_SANDBOX_TYPES } from "../src/agents/agent-contract.js";
import { SqliteTaskRepository } from "../src/repositories/task-repository.js";

const execFileAsync = promisify(execFile);

test("creates a task from a fresh baseline branch, snapshots the derived commit, and persists task-scoped attachments", async () => {
  const fixture = await makeTempDir("eat-task-api-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "task-repo", { defaultBranch: "main" });
    const attachmentPath = path.join(fixture.path, "brief.md");
    await writeFile(attachmentPath, "# brief\n", "utf8");

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const expectedSha = await git(repo.repoPath, ["rev-parse", "main^{commit}"]);
      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          attachments: [
            {
              fileName: "brief.md",
              filePath: attachmentPath,
              fileType: "DOCUMENT",
              mimeType: "text/markdown",
            },
          ],
          baseBranch: "task/main/lead-clarification",
          baseBranchMode: "new",
          baseBranchStartPoint: "main",
          description: "Clarify the implementation scope.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Lead clarification",
        },
        method: "POST",
      });

      assert.equal(createResponse.status, 201);
      assert.equal(createResponse.body.task.status, "DRAFT");
      assert.equal(createResponse.body.task.baseBranch, "task/main/lead-clarification");
      assert.equal(createResponse.body.task.baseCommitSha, expectedSha);
      assert.equal(createResponse.body.task.taskBranchName, "eat-Lead-clarification");
      assert.equal(createResponse.body.attachments.length, 1);
      assert.equal(
        await git(repo.repoPath, ["rev-parse", "task/main/lead-clarification^{commit}"]),
        expectedSha,
      );
      assert.equal(
        await git(repo.repoPath, ["rev-parse", "eat-Lead-clarification^{commit}"]),
        expectedSha,
      );

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(createResponse.body.task.id)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.attachments.length, 1);
      assert.match(
        detailResponse.body.attachments[0].filePath,
        new RegExp(`^${escapeRegExp(path.join(uploadRootPath, createResponse.body.task.id))}`),
      );
      assert.equal(
        await readFile(detailResponse.body.attachments[0].filePath, "utf8"),
        "# brief\n",
      );

      const projectTasksResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks`,
      );
      assert.equal(projectTasksResponse.status, 200);
      assert.equal(projectTasksResponse.body.tasks.length, 1);
      assert.equal(projectTasksResponse.body.tasks[0].id, createResponse.body.task.id);
      assert.equal(projectTasksResponse.body.tasks[0].taskBranchName, "eat-Lead-clarification");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("rejects unsupported attachments before task creation completes", async () => {
  const fixture = await makeTempDir("eat-task-api-invalid-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "invalid-task-repo", { defaultBranch: "main" });
    const invalidAttachmentPath = path.join(fixture.path, "binary.exe");
    await writeFile(invalidAttachmentPath, "binary\n", "utf8");

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          attachments: [
            {
              fileName: "binary.exe",
              filePath: invalidAttachmentPath,
              mimeType: "application/octet-stream",
            },
          ],
          baseBranch: "main",
          description: "This should fail before persistence.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Rejected task",
        },
        method: "POST",
      });

      assert.equal(createResponse.status, 400);
      assert.equal(createResponse.body.error.code, "ATTACHMENT_TYPE_UNSUPPORTED");

      const projectTasksResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks`,
      );
      assert.equal(projectTasksResponse.status, 200);
      assert.deepEqual(projectTasksResponse.body.tasks, []);
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("rejects task creation when the selected lead agent is unhealthy", async () => {
  const fixture = await makeTempDir("eat-task-api-unhealthy-lead-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "unhealthy-lead-repo", { defaultBranch: "main" });

    const server = await startServer({
      agentService: createLeadAgentService({ healthy: false }),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "This should be blocked by the lead health guard.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Blocked unhealthy lead",
        },
        method: "POST",
      });

      assert.equal(createResponse.status, 400);
      assert.equal(createResponse.body.error.code, "LEAD_AGENT_UNHEALTHY");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("requires an explicit first operator message before starting clarification", async () => {
  const fixture = await makeTempDir("eat-task-api-start-clarification-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "clarification-start-repo", { defaultBranch: "main" });

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need a real operator opening message.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Opening brief required",
        },
        method: "POST",
      });

      const startResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
        { method: "POST" },
      );

      assert.equal(startResponse.status, 400);
      assert.equal(startResponse.body.error.code, "TASK_MESSAGE_REQUIRED");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("archives, restores, and deletes tasks while optionally cleaning the task mainline branch", async () => {
  const fixture = await makeTempDir("eat-task-api-archive-delete-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "archive-delete-repo", { defaultBranch: "main" });

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Archive and delete flows should work.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Archive delete task",
        },
        method: "POST",
      });
      const taskId = createResponse.body.task.id;
      const taskBranchName = createResponse.body.task.taskBranchName;

      const archiveResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}/archive`,
        {
          body: { deleteBranches: false },
          method: "POST",
        },
      );
      assert.equal(archiveResponse.status, 200);
      assert.ok(archiveResponse.body.task.archivedAt);

      const defaultTasksResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks`,
      );
      assert.equal(defaultTasksResponse.status, 200);
      assert.deepEqual(defaultTasksResponse.body.tasks, []);

      const archivedTasksResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks?includeArchived=1`,
      );
      assert.equal(archivedTasksResponse.status, 200);
      assert.equal(archivedTasksResponse.body.tasks.length, 1);
      assert.ok(archivedTasksResponse.body.tasks[0].archivedAt);

      const restoreResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}/unarchive`,
        { method: "POST" },
      );
      assert.equal(restoreResponse.status, 200);
      assert.equal(restoreResponse.body.task.archivedAt, null);

      const deleteResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          body: { deleteBranches: true },
          method: "DELETE",
        },
      );
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleteResponse.body.branchCleanup.cleanedBranches.includes(taskBranchName), true);

      const afterDeleteResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks?includeArchived=1`,
      );
      assert.equal(afterDeleteResponse.status, 200);
      assert.deepEqual(afterDeleteResponse.body.tasks, []);

      await assert.rejects(
        git(repo.repoPath, ["rev-parse", `${taskBranchName}^{commit}`]),
      );
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("requires pausing an active task before deletion", async () => {
  const fixture = await makeTempDir("eat-task-api-pause-before-delete-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "pause-before-delete-repo", { defaultBranch: "main" });

    const server = await startServer({
      agentService: createInteractiveLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Deleting an active task should require an explicit pause first.",
          leadAgentType: "interactive-lead",
          projectId: registerResponse.body.project.id,
          title: "Pause before delete",
        },
        method: "POST",
      });
      const taskId = createResponse.body.task.id;

      const startResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}/start-clarification`,
        {
          body: { content: "Start a live clarification session." },
          method: "POST",
        },
      );
      assert.equal(startResponse.status, 200);
      assert.equal(startResponse.body.task.status, "CLARIFYING");

      const blockedDeleteResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          body: { deleteBranches: false },
          method: "DELETE",
        },
      );
      assert.equal(blockedDeleteResponse.status, 400);
      assert.equal(blockedDeleteResponse.body.error.code, "TASK_DELETE_REQUIRES_PAUSE");

      const pauseResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}/pause`,
        { method: "POST" },
      );
      assert.equal(pauseResponse.status, 200);
      assert.equal(pauseResponse.body.task.status, "ACTION_REQUIRED");
      assert.match(pauseResponse.body.task.lastError, /^Paused by operator from CLARIFYING\./);

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.task.status, "ACTION_REQUIRED");
      assert.match(detailResponse.body.task.lastError, /^Paused by operator from CLARIFYING\./);
      assert.equal(detailResponse.body.sessions.at(-1)?.status, "CANCELLED");

      const deleteResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          body: { deleteBranches: false },
          method: "DELETE",
        },
      );
      assert.equal(deleteResponse.status, 200);

      const afterDeleteResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks?includeArchived=1`,
      );
      assert.equal(afterDeleteResponse.status, 200);
      assert.deepEqual(afterDeleteResponse.body.tasks, []);
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("deletes a paused task even when historical taskBranchName data falls back to the base branch", async () => {
  const fixture = await makeTempDir("eat-task-api-delete-base-branch-cleanup-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "delete-base-branch-cleanup-repo", { defaultBranch: "master" });
    const repository = new SqliteTaskRepository({ databasePath });

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const createResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "master",
          description: "Delete a paused task without trying to delete the protected base branch.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Delete paused task with protected base branch cleanup",
        },
        method: "POST",
      });

      assert.equal(createResponse.status, 201);
      const taskId = createResponse.body.task.id;
      const taskBranchName = createResponse.body.task.taskBranchName;

      await repository.updateTask(taskId, {
        lastError: "Paused by operator from EXECUTING.",
        status: "ACTION_REQUIRED",
        taskBranchName: "master",
      });

      const deleteResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          body: { deleteBranches: true },
          method: "DELETE",
        },
      );

      assert.equal(deleteResponse.status, 200);
      assert.equal(deleteResponse.body.branchCleanup.cleanedBranches.includes("master"), false);
      assert.equal(deleteResponse.body.branchCleanup.cleanedBranches.includes(taskBranchName), false);

      const afterDeleteResponse = await requestJson(
        server,
        `/api/projects/${encodeURIComponent(registerResponse.body.project.id)}/tasks?includeArchived=1`,
      );
      assert.equal(afterDeleteResponse.status, 200);
      assert.deepEqual(afterDeleteResponse.body.tasks, []);

      assert.equal(
        await git(repo.repoPath, ["rev-parse", "master^{commit}"]),
        await git(repo.repoPath, ["rev-parse", "HEAD^{commit}"]),
      );
      assert.equal(
        await git(repo.repoPath, ["rev-parse", `${taskBranchName}^{commit}`]),
        await git(repo.repoPath, ["rev-parse", "master^{commit}"]),
      );
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("creates a guided task in PLAN_REVIEW from a built-in golden-path template", async () => {
  const fixture = await makeTempDir("eat-guided-task-api-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const uploadRootPath = path.join(fixture.path, "uploads");
    const repo = await createRepository(fixture.path, "guided-task-repo", { defaultBranch: "main" });

    const server = await startServer({
      agentService: createLeadAgentService(),
      databasePath,
      uploadRootPath,
    });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const templatesResponse = await requestJson(server, "/api/task-templates");
      assert.equal(templatesResponse.status, 200);
      assert.ok(templatesResponse.body.templates.some((template) => template.id === "full-stack-web-app"));
      assert.ok(templatesResponse.body.templates.some((template) => template.id === "backend-api"));
      assert.ok(templatesResponse.body.templates.some((template) => template.id === "frontend-feature"));
      assert.ok(templatesResponse.body.templates.some((template) => template.id === "repo-wide-refactor"));

      const guidedResponse = await requestJson(server, "/api/guided-tasks", {
        body: {
          baseBranch: "main",
          description: "Build a full-stack Todo app with auth, database, and React frontend.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          templateId: "full-stack-web-app",
          title: "Todo golden path",
        },
        method: "POST",
      });

      assert.equal(guidedResponse.status, 201);
      assert.equal(guidedResponse.body.task.status, "PLAN_REVIEW");
      assert.equal(guidedResponse.body.task.planVersion, 1);
      assert.equal(guidedResponse.body.currentPlan.template_id, "full-stack-web-app");
      assert.equal(guidedResponse.body.currentPlan.nodes.length, 6);
      assert.deepEqual(
        guidedResponse.body.currentPlan.nodes.map((node) => node.role),
        ["architect", "backend", "database", "frontend", "tester", "integration"],
      );

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(guidedResponse.body.task.id)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.task.status, "PLAN_REVIEW");
      assert.equal(JSON.parse(detailResponse.body.task.currentPlanJson).template_id, "full-stack-web-app");
      assert.equal(detailResponse.body.planSnapshots.length, 1);
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

function createLeadAgentService(options = {}) {
  const registry = new AgentRegistry();
  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Healthy lead test adapter",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
      supportsInteractiveInput: true,
      supportsVision: true,
    },
    async healthCheck() {
      if (options.healthy === false) {
        return {
          available: false,
          reason: {
            code: "AUTH_MISSING",
            message: "Login required.",
          },
        };
      }

      return {
        available: true,
        version: "1.0.0-test",
      };
    },
    name: "healthy-lead",
    async spawnSession() {
      throw new Error("not used in CRC-35 tests");
    },
  });

  return new AgentService({ agentRegistry: registry });
}

function createInteractiveLeadAgentService() {
  const registry = new AgentRegistry();

  registry.register({
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Interactive lead test adapter",
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
    name: "interactive-lead",
    async spawnSession() {
      const outputListeners = new Set();
      const exitListeners = new Set();
      let killed = false;

      return {
        onExit(listener) {
          exitListeners.add(listener);
        },
        onOutput(listener) {
          outputListeners.add(listener);
        },
        async sendInput(input) {
          if (killed) {
            throw new Error("Session already stopped.");
          }

          for (const listener of outputListeners) {
            listener(`Lead received: ${input}\n`);
          }
        },
        async kill() {
          if (killed) {
            return;
          }

          killed = true;
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

async function makeTempDir(prefix) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: tempDir,
    async dispose() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

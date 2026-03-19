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

test("revalidates edited drafts on save and blocks approval when the stored plan becomes invalid", async () => {
  const fixture = await makeTempDir("eat-plan-review-save-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
    });

    try {
      const repo = await createRepository(fixture.path, "plan-review-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need editable draft validation before approval.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Plan review validation",
        },
        method: "POST",
      });

      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
        { method: "POST" },
      );
      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
        { method: "POST" },
      );

      const updatedPlan = {
        notes: "Edited before approval.",
        subtasks: [
          {
            title: "Edited backend slice",
            description: "Keep the server work parallel-safe after user edits.",
            recommended_agent: "healthy-lead",
            branch_suffix: "edited-backend-slice",
          },
        ],
      };

      const saveResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/current-plan`,
        {
          body: updatedPlan,
          method: "PUT",
        },
      );
      assert.equal(saveResponse.status, 200);
      assert.equal(saveResponse.body.task.planVersion, 1);
      assert.equal(JSON.parse(saveResponse.body.task.currentPlanJson).notes, updatedPlan.notes);
      assert.equal(
        JSON.parse(saveResponse.body.task.currentPlanJson).subtasks[0].branch_suffix,
        "edited-backend-slice",
      );

      const invalidSaveResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/current-plan`,
        {
          body: {
            subtasks: [
              {
                title: "Broken duplicate one",
                description: "Invalid duplicate suffix.",
                recommended_agent: "healthy-lead",
                branch_suffix: "dup-suffix",
              },
              {
                title: "Broken duplicate two",
                description: "Still invalid duplicate suffix.",
                recommended_agent: "healthy-lead",
                branch_suffix: "dup-suffix",
              },
            ],
          },
          method: "PUT",
        },
      );
      assert.equal(invalidSaveResponse.status, 400);
      assert.equal(invalidSaveResponse.body.error.code, "INVALID_PLAN");

      const repository = new SqliteTaskRepository({ databasePath });

      try {
        const task = await repository.findTaskById(taskResponse.body.task.id);
        assert.equal(JSON.parse(task.currentPlanJson).subtasks[0].branch_suffix, "edited-backend-slice");

        await repository.updateTask(task.id, {
          currentPlanJson: JSON.stringify({
            subtasks: [
              {
                title: "Now invalid",
                description: "This stored plan should be blocked at approval time.",
                recommended_agent: "healthy-lead",
                branch_suffix: "Invalid Suffix",
              },
            ],
          }),
        });
      } finally {
        repository.close();
      }

      const approvalResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/approve-plan`,
        { method: "POST" },
      );
      assert.equal(approvalResponse.status, 400);
      assert.equal(approvalResponse.body.error.code, "INVALID_PLAN");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("lists plan templates and seeds a role-aware DAG draft that can be approved", async () => {
  const fixture = await makeTempDir("eat-plan-template-seed-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "plan-template-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need a full-stack team seed before approval.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Template seeded plan",
        },
        method: "POST",
      });

      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
        { method: "POST" },
      );
      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
        { method: "POST" },
      );

      const templatesResponse = await requestJson(server, "/api/task-templates");
      assert.equal(templatesResponse.status, 200);
      assert.ok(templatesResponse.body.templates.some((template) => template.id === "full-stack-web-app"));

      const seedResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/plan-seed`,
        {
          body: { templateId: "full-stack-web-app" },
          method: "POST",
        },
      );
      assert.equal(seedResponse.status, 200);
      assert.equal(seedResponse.body.currentPlan.template_id, "full-stack-web-app");
      assert.equal(seedResponse.body.currentPlan.nodes.length, 5);
      assert.equal(seedResponse.body.currentPlan.nodes[0].role, "architect");
      assert.equal(seedResponse.body.currentPlan.nodes.at(-1).branch_suffix, "tester");

      const approvalResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/approve-plan`,
        { method: "POST" },
      );
      assert.equal(approvalResponse.status, 200);
      assert.equal(approvalResponse.body.subTasks.length, 5);
      assert.deepEqual(
        approvalResponse.body.subTasks.map((subTask) => subTask.role),
        ["architect", "backend", "database", "frontend", "tester"],
      );
      assert.equal(approvalResponse.body.subTasks[0].status, "PENDING");
      assert.equal(approvalResponse.body.subTasks[1].status, "BLOCKED");
      assert.equal(approvalResponse.body.subTasks.at(-1).status, "BLOCKED");

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(JSON.parse(detailResponse.body.task.approvedPlanJson).template_id, "full-stack-web-app");
      assert.equal(JSON.parse(detailResponse.body.task.approvedPlanJson).nodes.length, 5);
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("restores a historical plan snapshot into the current draft and appends restore audit history", async () => {
  const fixture = await makeTempDir("eat-plan-restore-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "plan-restore-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need restore-from-history before approval.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Plan snapshot restore",
        },
        method: "POST",
      });
      const events = [];
      const unsubscribe = eventBus.subscribe(taskResponse.body.task.id, (event) => {
        events.push(event);
      });

      try {
        await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
          { method: "POST" },
        );
        await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
          { method: "POST" },
        );

        const detailBeforeEdit = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
        );
        const originalSnapshotId = detailBeforeEdit.body.planSnapshots[0].id;

        await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/current-plan`,
          {
            body: {
              subtasks: [
                {
                  title: "User edited draft",
                  description: "This should be replaced by the restored payload.",
                  recommended_agent: "healthy-lead",
                  branch_suffix: "user-edited-draft",
                },
              ],
            },
            method: "PUT",
          },
        );

        const restoreResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/restore-plan-snapshot`,
          {
            body: { snapshotId: originalSnapshotId },
            method: "POST",
          },
        );
        assert.equal(restoreResponse.status, 200);
        assert.equal(
          JSON.parse(restoreResponse.body.task.currentPlanJson).subtasks[0].branch_suffix,
          "backend-slice",
        );

        const restoredEvent = await nextEvent(events, (entry) => entry.eventName === "task:plan-restored");
        assert.equal(restoredEvent.data.snapshotId, originalSnapshotId);
        assert.equal(restoredEvent.data.currentPlan.subtasks[0].branch_suffix, "backend-slice");

        const detailAfterRestore = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
        );
        assert.equal(detailAfterRestore.body.planSnapshots.length, 2);
        assert.equal(detailAfterRestore.body.planSnapshots[0].source, "RESTORED_FROM_HISTORY");
        assert.equal(
          JSON.parse(detailAfterRestore.body.task.currentPlanJson).subtasks[0].branch_suffix,
          "backend-slice",
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

test("approves the validated plan by freezing approvedPlanJson and appending an approved snapshot", async () => {
  const fixture = await makeTempDir("eat-plan-approve-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "plan-approve-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need approved plan persistence before execution starts.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Approve plan draft",
        },
        method: "POST",
      });
      const events = [];
      const unsubscribe = eventBus.subscribe(taskResponse.body.task.id, (event) => {
        events.push(event);
      });

      try {
        await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
          { method: "POST" },
        );
        await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
          { method: "POST" },
        );

        const approvalResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/approve-plan`,
          { method: "POST" },
        );

        assert.equal(approvalResponse.status, 200);
        assert.equal(approvalResponse.body.approvedSnapshot.source, "APPROVED");
        assert.equal(approvalResponse.body.idempotent, false);
        assert.equal(approvalResponse.body.task.status, "EXECUTING");
        assert.equal(
          approvalResponse.body.task.approvedPlanJson,
          approvalResponse.body.task.currentPlanJson,
        );
        assert.equal(approvalResponse.body.subTasks.length, 1);
        assert.equal(approvalResponse.body.subTasks[0].title, "Plan the backend slice");
        assert.equal(approvalResponse.body.subTasks[0].description, "Keep the work independent and parallel-safe.");
        assert.equal(approvalResponse.body.subTasks[0].branchSuffix, "backend-slice");
        assert.equal(approvalResponse.body.subTasks[0].agentType, "healthy-lead");
        assert.equal(approvalResponse.body.subTasks[0].status, "PENDING");
        assert.equal(approvalResponse.body.subTasks[0].branchName, null);
        assert.equal(approvalResponse.body.subTasks[0].worktreePath, null);

        const taskStatusEvent = await nextEvent(
          events,
          (entry) => entry.eventName === "task:status" && entry.data.status === "EXECUTING",
        );
        assert.equal(taskStatusEvent.data.taskId, taskResponse.body.task.id);

        const subTaskStatusEvent = await nextEvent(
          events,
          (entry) => entry.eventName === "subtask:status" && entry.data.status === "PENDING",
        );
        assert.equal(subTaskStatusEvent.data.taskId, taskResponse.body.task.id);
        assert.equal(subTaskStatusEvent.data.subtaskId, approvalResponse.body.subTasks[0].id);

        const duplicateApprovalResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/approve-plan`,
          { method: "POST" },
        );
        assert.equal(duplicateApprovalResponse.status, 200);
        assert.equal(duplicateApprovalResponse.body.idempotent, true);
        assert.equal(duplicateApprovalResponse.body.task.status, "EXECUTING");
        assert.equal(duplicateApprovalResponse.body.subTasks.length, 1);

        const detailResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
        );
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "EXECUTING");
        assert.equal(detailResponse.body.task.approvedPlanJson, detailResponse.body.task.currentPlanJson);
        assert.equal(detailResponse.body.planSnapshots.length, 2);
        assert.equal(detailResponse.body.subTasks.length, 1);
        assert.equal(detailResponse.body.planSnapshots[0].source, "APPROVED");
        assert.equal(detailResponse.body.planSnapshots[1].source, "LEAD_GENERATED");

        await nextEvent(
          events,
          (entry) => entry.eventName === "session:ended" && entry.data.subtaskId === approvalResponse.body.subTasks[0].id,
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

test("rolls back approval writes when subtask materialization fails", async () => {
  const fixture = await makeTempDir("eat-plan-approve-failure-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const taskRepository = new FailingSubTaskRepository({ databasePath });
    const server = await startServer({
      agentService: createClarificationAgentService(),
      databasePath,
      taskRepository,
    });

    try {
      const repo = await createRepository(fixture.path, "plan-approve-failure-repo", { defaultBranch: "main" });
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Need rollback if approval materialization fails.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Approve plan rollback",
        },
        method: "POST",
      });

      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/start-clarification`,
        { method: "POST" },
      );
      await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/confirm-requirements`,
        { method: "POST" },
      );

      const approvalResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}/approve-plan`,
        { method: "POST" },
      );
      assert.equal(approvalResponse.status, 500);

      const detailResponse = await requestJson(
        server,
        `/api/tasks/${encodeURIComponent(taskResponse.body.task.id)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.task.status, "PLAN_REVIEW");
      assert.equal(detailResponse.body.task.approvedPlanJson, null);
      assert.equal(detailResponse.body.planSnapshots.length, 1);
      assert.equal(detailResponse.body.planSnapshots[0].source, "LEAD_GENERATED");
      assert.deepEqual(detailResponse.body.subTasks, []);
    } finally {
      await stopServer(server);
      taskRepository.close();
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
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
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
    async spawnSession(config) {
      if (config?.sandbox?.type === SESSION_SANDBOX_TYPES.DOCKER) {
        const outputListeners = new Set();
        const exitListeners = new Set();

        setTimeout(() => {
          for (const listener of outputListeners) {
            listener("Worker completed.\n");
          }
        }, 0);
        setTimeout(() => {
          for (const listener of exitListeners) {
            listener(0);
          }
        }, 10);

        return {
          containerId: "worker-container-1",
          pid: 5432,
          sessionId: "worker-runtime-1",
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
      }

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
    projectRepository: options.projectRepository,
    repositoryOptions: {
      databasePath: options.databasePath,
    },
    taskRepository: options.taskRepository,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return server;
}

async function stopServer(server) {
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

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

class FailingSubTaskRepository extends SqliteTaskRepository {
  async createSubTask() {
    throw new Error("Subtask materialization failed.");
  }
}

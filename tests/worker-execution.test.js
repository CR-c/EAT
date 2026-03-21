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
import { REVIEW_PHASE, SqliteTaskRepository } from "../src/repositories/task-repository.js";

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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks[0].branchName, `eat/${taskId}/backend-slice-1`);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].status, "ACCEPTED");
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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        assert.equal(phase08.stats.maxConcurrent, 2);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks.length, 2);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].launchMetadata.included[0].fileName, "requirements.md");
        assert.equal(detailResponse.body.subTasks[0].launchMetadata.excluded[0].fileName, "flow.png");
        assert.ok(detailResponse.body.subTasks.every((subTask) => subTask.status === "ACCEPTED"));
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

test("keeps dependent subtasks blocked until prerequisites finish and auto-launches them afterward", async () => {
  const fixture = await makeTempDir("eat-worker-dependencies-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const startedBranches = [];
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend contract",
            description: "Design and implement the shared backend contract first.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-contract",
          },
          {
            title: "React frontend",
            description: "Build the frontend after the backend contract is ready.",
            recommended_agent: "worker-agent",
            branch_suffix: "react-frontend",
            depends_on: ["backend-contract"],
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        startedBranches.push(config.branchName);
      },
      workerBehavior: (config) => config.branchName.endsWith("backend-contract")
        ? {
            delayMs: 80,
            exitCode: 0,
            output: "backend complete\n",
          }
        : {
            delayMs: 20,
            exitCode: 0,
            output: "frontend complete\n",
          },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "dependency-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Run backend first, then the frontend.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Dependent execution",
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

        await nextEvent(events, (event) => (
          event.eventName === "subtask:status"
          && event.data.status === "BLOCKED"
          && Array.isArray(event.data.dependencyBranchSuffixes)
          && event.data.dependencyBranchSuffixes.includes("backend-contract")
        ));

        const firstStartedEvent = await nextEvent(
          events,
          (event) => event.eventName === "session:started" && event.data.subtaskId,
        );
        const firstStartedDetail = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const backendSubTask = firstStartedDetail.body.subTasks.find((subTask) => subTask.branchSuffix === "backend-contract");
        const frontendSubTask = firstStartedDetail.body.subTasks.find((subTask) => subTask.branchSuffix === "react-frontend");

        assert.equal(backendSubTask.status, "RUNNING");
        assert.equal(frontendSubTask.status, "BLOCKED");
        assert.deepEqual(frontendSubTask.dependencyBranchSuffixes, ["backend-contract"]);
        assert.equal(startedBranches.length, 1);

        await nextEvent(
          events,
          (event) => event.eventName === "session:ended" && event.data.subtaskId === firstStartedEvent.data.subtaskId,
        );
        await nextEvent(
          events,
          (event) => event.eventName === "subtask:status" && event.data.status === "PENDING" && event.data.branchSuffix === "react-frontend",
        );
        const secondStartedEvent = await nextEvent(
          events,
          (event) => (
            event.eventName === "session:started"
            && event.data.subtaskId
            && event.data.subtaskId !== firstStartedEvent.data.subtaskId
          ),
        );

        assert.equal(startedBranches.length, 2);
        assert.match(startedBranches[0], /backend-contract$/);
        assert.match(startedBranches[1], /react-frontend$/);

        await nextEvent(
          events,
          (event) => event.eventName === "session:ended" && event.data.subtaskId === secondStartedEvent.data.subtaskId,
        );
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.ok(detailResponse.body.subTasks.every((subTask) => ["ACCEPTED", "MERGED"].includes(subTask.status)));
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

test("returns a team view with lead status, member ordering, and persisted orchestration fields", async () => {
  const fixture = await makeTempDir("eat-team-view-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Architecture Lead",
            description: "Define the API and database contracts.",
            recommended_agent: "worker-agent",
            branch_suffix: "architect",
          },
          {
            title: "Frontend Worker",
            description: "Implement the React application after the contracts are ready.",
            recommended_agent: "worker-agent",
            branch_suffix: "frontend",
            depends_on: ["architect"],
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 120,
        exitCode: 0,
        output: "worker complete\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "team-view-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Expose a leader orchestration team view.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Team view",
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
        await nextEvent(events, (event) => event.eventName === "team:updated");

        const teamResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/team`);
        assert.equal(teamResponse.status, 200);
        assert.equal(teamResponse.body.team.task.id, taskId);
        assert.equal(teamResponse.body.team.lead.agentType, "healthy-lead");
        assert.equal(teamResponse.body.team.members.length, 2);
        assert.equal(teamResponse.body.team.members[0].role, "architect");
        assert.equal(teamResponse.body.team.members[0].displayName, "Architecture Lead");
        assert.equal(teamResponse.body.team.members[0].executionOrder, 1);
        assert.equal(teamResponse.body.team.members[0].assignmentSource, "LEAD");
        assert.match(teamResponse.body.team.members[0].runSummary, /queued|running|workspace/i);
        assert.equal(teamResponse.body.team.members[1].role, "frontend");
        assert.equal(teamResponse.body.team.members[1].executionOrder, 2);
        assert.equal(teamResponse.body.team.members[1].status, "BLOCKED");

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.team.members.length, 2);
        assert.equal(detailResponse.body.team.members[0].displayName, "Architecture Lead");
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

test("branches downstream subtasks from the updated task mainline instead of the original base commit", async () => {
  const fixture = await makeTempDir("eat-task-mainline-branching-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    let taskMainlineBranchName = null;
    let downstreamLaunchTaskHead = null;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Upstream foundation",
            description: "Create the upstream foundation first.",
            recommended_agent: "worker-agent",
            branch_suffix: "upstream-foundation",
          },
          {
            title: "Downstream feature",
            description: "Build on top of the upstream foundation.",
            recommended_agent: "worker-agent",
            branch_suffix: "downstream-feature",
            depends_on: ["upstream-foundation"],
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        if (config.branchName.endsWith("upstream-foundation")) {
          await commitWorktreeChange(config.workDir, "foundation.txt", "foundation\n");
        }
      },
      workerBehavior: (config) => config.branchName.endsWith("upstream-foundation")
        ? {
            delayMs: 40,
            exitCode: 0,
            output: "upstream complete\n",
          }
        : {
            delayMs: 20,
            exitCode: 0,
            output: "downstream complete\n",
          },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "mainline-repo");
      const initialBaseSha = await git(repo.repoPath, ["rev-parse", "main^{commit}"]);
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Ensure downstream work starts from the task mainline head.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Task mainline branching",
        },
        method: "POST",
      });
      const taskId = taskResponse.body.task.id;
      taskMainlineBranchName = taskResponse.body.task.taskBranchName;
      const events = [];
      const unsubscribe = eventBus.subscribe(taskId, (event) => {
        events.push(event);
      });

      try {
        await moveTaskToPlanReview(server, taskId, events);
        await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/approve-plan`, { method: "POST" });

        const firstStartedEvent = await nextEvent(
          events,
          (event) => event.eventName === "session:started" && event.data.subtaskId,
        );
        await nextEvent(
          events,
          (event) => event.eventName === "session:ended" && event.data.subtaskId === firstStartedEvent.data.subtaskId,
        );
        await nextEvent(
          events,
          (event) => event.eventName === "task:mainline-updated" && event.data.subtaskId === firstStartedEvent.data.subtaskId,
        );
        downstreamLaunchTaskHead = await git(repo.repoPath, [
          "rev-parse",
          `${taskMainlineBranchName}^{commit}`,
        ]);
        await nextEvent(
          events,
          (event) => event.eventName === "session:started" && event.data.subtaskId !== firstStartedEvent.data.subtaskId,
        );

        let detailResponse = null;

        for (let attempt = 0; attempt < 50; attempt += 1) {
          detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
          const downstreamCandidate = detailResponse.body.subTasks.find((subTask) => subTask.branchSuffix === "downstream-feature");

          if (downstreamCandidate?.branchName && downstreamCandidate?.startCommitSha) {
            break;
          }

          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });
        }

        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.taskBranchName, taskMainlineBranchName);

        const upstreamSubTask = detailResponse.body.subTasks.find((subTask) => subTask.branchSuffix === "upstream-foundation");
        const downstreamSubTask = detailResponse.body.subTasks.find((subTask) => subTask.branchSuffix === "downstream-feature");
        assert.ok(downstreamSubTask.branchName);
        assert.ok(downstreamSubTask.startCommitSha);

        assert.ok(upstreamSubTask.startCommitSha);
        assert.equal(upstreamSubTask.startCommitSha, initialBaseSha);
        assert.ok(downstreamLaunchTaskHead);
        assert.equal(downstreamSubTask.startCommitSha, downstreamLaunchTaskHead);
        assert.notEqual(downstreamSubTask.startCommitSha, initialBaseSha);
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

test("serializes repo-level task mainline updates when multiple tasks share one project", async () => {
  const fixture = await makeTempDir("eat-project-lock-shared-project-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Shared project slice",
            description: "Write one task-specific artifact.",
            recommended_agent: "worker-agent",
            branch_suffix: "shared-project-slice",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        const taskId = config.branchName.match(/^eat\/([^/]+)\//u)?.[1] ?? "unknown";
        await commitWorktreeChange(config.workDir, `${taskId}.txt`, `${taskId}\n`);
      },
      workerBehavior: () => ({
        delayMs: 10,
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
      const repo = await createRepository(fixture.path, "shared-project-lock-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      const taskRecords = [];

      for (const title of ["Shared project task A", "Shared project task B", "Shared project task C"]) {
        const taskResponse = await requestJson(server, "/api/tasks", {
          body: {
            baseBranch: "main",
            description: "Verify same-project tasks do not collide while updating task mainline branches.",
            leadAgentType: "healthy-lead",
            projectId: registerResponse.body.project.id,
            title,
          },
          method: "POST",
        });
        const events = [];
        const unsubscribe = eventBus.subscribe(taskResponse.body.task.id, (event) => {
          events.push(event);
        });
        taskRecords.push({
          events,
          taskId: taskResponse.body.task.id,
          unsubscribe,
        });
      }

      try {
        for (const taskRecord of taskRecords) {
          await moveTaskToPlanReview(server, taskRecord.taskId, taskRecord.events);
        }

        await Promise.all(taskRecords.map((taskRecord) => requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskRecord.taskId)}/approve-plan`,
          { method: "POST" },
        )));

        await Promise.all(taskRecords.map((taskRecord) => nextEvent(
          taskRecord.events,
          (event) => event.eventName === "task:mainline-updated",
        )));

        for (const taskRecord of taskRecords) {
          let detailResponse = null;

          await waitFor(async () => {
            detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskRecord.taskId)}`);
            return detailResponse.status === 200 && detailResponse.body.task.status !== "EXECUTING";
          }, 400);

          assert.equal(detailResponse.status, 200);
          assert.notEqual(detailResponse.body.task.status, "ACTION_REQUIRED");
          assert.doesNotMatch(
            detailResponse.body.task.lastError ?? "",
            /(dirty|cannot lock ref|update_ref failed|checkout)/iu,
          );
          assert.ok(
            detailResponse.body.messages.some((message) => /Task mainline updated:/u.test(message.content)),
          );
        }
      } finally {
        for (const taskRecord of taskRecords) {
          taskRecord.unsubscribe();
        }
      }
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("persists web-posted lead mailbox notes and exposes them in task detail", async () => {
  const fixture = await makeTempDir("eat-mailbox-api-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Frontend implementation",
            description: "Build the React application shell.",
            recommended_agent: "worker-agent",
            branch_suffix: "frontend-implementation",
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 200,
        exitCode: 0,
        output: "frontend complete\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "mailbox-api-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Send a lead handoff note from the web API.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Mailbox API",
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

        const detailBefore = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const targetSubTask = detailBefore.body.subTasks[0];

        const mailboxResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/mailbox`,
          {
            body: {
              artifactRefs: ["contract:layout-shell"],
              branchRef: `eat/${taskId}/lead`,
              content: "Keep the route layout aligned with the backend contract.",
              fileRefs: ["src/ui/routes.jsx", "docs/contracts/ui-shell.md"],
              messageType: "API_CONTRACT",
              requiresAck: true,
              schemaJson: {
                pages: ["login", "dashboard"],
              },
              targetType: "SUBTASK",
              targetSubTaskId: targetSubTask.id,
            },
            method: "POST",
          },
        );

        assert.equal(mailboxResponse.status, 201);
        assert.equal(mailboxResponse.body.message.senderType, "LEAD");
        assert.equal(mailboxResponse.body.message.messageType, "API_CONTRACT");
        assert.equal(mailboxResponse.body.message.targetSubTaskId, targetSubTask.id);
        assert.equal(mailboxResponse.body.message.branchRef, `eat/${taskId}/lead`);
        assert.deepEqual(mailboxResponse.body.message.artifactRefs, ["contract:layout-shell"]);
        assert.deepEqual(mailboxResponse.body.message.fileRefs, ["src/ui/routes.jsx", "docs/contracts/ui-shell.md"]);
        assert.equal(mailboxResponse.body.message.requiresAck, true);

        const mailboxEvent = await nextEvent(events, (event) => event.eventName === "mailbox:message");
        assert.equal(mailboxEvent.data.message.targetSubTaskId, targetSubTask.id);
        assert.equal(mailboxEvent.data.message.messageType, "API_CONTRACT");

        const detailAfter = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailAfter.status, 200);
        assert.equal(detailAfter.body.mailboxMessages.length, 1);
        assert.equal(detailAfter.body.mailboxMessages[0].content, "Keep the route layout aligned with the backend contract.");
        assert.equal(detailAfter.body.mailboxMessages[0].messageType, "API_CONTRACT");
        assert.deepEqual(detailAfter.body.mailboxMessages[0].schemaJson, {
          pages: ["login", "dashboard"],
        });
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

test("builds a live operations board snapshot and emits board activity events", async () => {
  const fixture = await makeTempDir("eat-operations-board-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend contract",
            description: "Define the API contract first.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-contract",
            role: "architect",
          },
          {
            title: "Frontend implementation",
            description: "Wait for the contract before building the UI.",
            recommended_agent: "worker-agent",
            branch_suffix: "frontend-ui",
            depends_on: ["backend-contract"],
            role: "frontend",
          },
        ],
      },
      workerBehavior: (config) => config.branchName.includes("backend-contract")
        ? {
            delayMs: 400,
            exitCode: 0,
            output: "backend contract ready\n",
          }
        : {
            delayMs: 20,
            exitCode: 0,
            output: "frontend ready\n",
          },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "operations-board-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Expose a board-first view for live execution supervision.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Operations board",
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

        const detailBefore = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const blockedSubTask = detailBefore.body.subTasks.find((subTask) => subTask.branchSuffix === "frontend-ui");
        assert.ok(blockedSubTask);
        assert.equal(blockedSubTask.status, "BLOCKED");

        const mailboxResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/mailbox`,
          {
            body: {
              content: "Waiting for backend auth contract handoff.",
              messageType: "BLOCKER",
              targetSubTaskId: blockedSubTask.id,
              targetType: "SUBTASK",
            },
            method: "POST",
          },
        );
        assert.equal(mailboxResponse.status, 201);

        const boardActivityEvent = await nextEvent(
          events,
          (event) => event.eventName === "board:activity" && event.data.kind === "MAILBOX_MESSAGE",
        );
        assert.equal(boardActivityEvent.data.taskId, taskId);

        const boardResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}/board`);
        assert.equal(boardResponse.status, 200);
        assert.equal(boardResponse.body.board.task.id, taskId);
        assert.equal(boardResponse.body.board.summary.running, 1);
        assert.equal(boardResponse.body.board.summary.blocked, 1);
        assert.ok(boardResponse.body.board.summary.actionRequired >= 1);
        assert.ok(
          boardResponse.body.board.actionRequiredItems.some((item) => (
            item.kind === "BLOCKER" && item.subTaskId === blockedSubTask.id
          )),
        );
        assert.ok(
          boardResponse.body.board.graph.nodes.some((node) => (
            node.subtaskId === blockedSubTask.id && node.mailboxInboxCount === 1
          )),
        );
        assert.ok(
          boardResponse.body.board.graph.edges.some((edge) => (
            edge.to === blockedSubTask.id && edge.state === "BLOCKING"
          )),
        );
        assert.ok(
          boardResponse.body.board.activity.some((entry) => (
            entry.kind === "SESSION_STARTED" || entry.kind === "MAILBOX_MESSAGE"
          )),
        );

        const detailAfter = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailAfter.status, 200);
        assert.ok(detailAfter.body.board);
        assert.ok(
          detailAfter.body.board.actionRequiredItems.some((item) => (
            item.kind === "BLOCKER" && item.subTaskId === blockedSubTask.id
          )),
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

test("supports subtask-to-lead mailbox blocker messages", async () => {
  const fixture = await makeTempDir("eat-mailbox-subtask-lead-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend worker",
            description: "Implement the backend slice.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-worker",
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 200,
        exitCode: 0,
        output: "backend worker active\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "mailbox-subtask-lead-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Allow a subtask to proactively notify the lead about a blocker.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Subtask to lead mailbox",
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

        const detailBefore = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const senderSubTask = detailBefore.body.subTasks[0];

        const mailboxResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/mailbox`,
          {
            body: {
              content: "Need the lead to confirm whether auth refresh should stay cookie-based.",
              messageType: "BLOCKER",
              senderSubTaskId: senderSubTask.id,
              targetType: "LEAD",
            },
            method: "POST",
          },
        );

        assert.equal(mailboxResponse.status, 201);
        assert.equal(mailboxResponse.body.message.senderType, "SUBTASK");
        assert.equal(mailboxResponse.body.message.targetType, "LEAD");
        assert.equal(mailboxResponse.body.message.targetSubTaskId, null);
        assert.equal(mailboxResponse.body.message.messageType, "BLOCKER");

        const mailboxEvent = await nextEvent(events, (event) => event.eventName === "mailbox:message");
        assert.equal(mailboxEvent.data.message.targetType, "LEAD");
        assert.equal(mailboxEvent.data.message.messageType, "BLOCKER");

        const detailAfter = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailAfter.status, 200);
        assert.equal(detailAfter.body.mailboxMessages.length, 1);
        assert.equal(detailAfter.body.mailboxMessages[0].senderSubTaskId, senderSubTask.id);
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

test("supports subtask-to-subtask structured API contracts with refs and schema", async () => {
  const fixture = await makeTempDir("eat-mailbox-subtask-contract-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Architect",
            description: "Define the API contract.",
            recommended_agent: "worker-agent",
            branch_suffix: "architect",
          },
          {
            title: "Backend",
            description: "Implement the backend API.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend",
          },
        ],
      },
      workerBehavior: () => ({
        delayMs: 200,
        exitCode: 0,
        output: "worker running\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "mailbox-subtask-contract-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Allow a subtask to deliver a structured API contract to another subtask.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Subtask contract mailbox",
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
        await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId);

        const detailBefore = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const [architect, backend] = detailBefore.body.subTasks;

        const mailboxResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/mailbox`,
          {
            body: {
              artifactRefs: ["contract:auth-api"],
              branchRef: architect.branchName,
              content: "Use POST /api/auth/login and preserve the JWT payload keys.",
              fileRefs: ["docs/contracts/auth-api.md"],
              messageType: "API_CONTRACT",
              schemaJson: {
                request: { body: { email: "string", password: "string" } },
                response: { body: { token: "string", refreshToken: "string" } },
              },
              senderSubTaskId: architect.id,
              targetSubTaskId: backend.id,
              targetType: "SUBTASK",
            },
            method: "POST",
          },
        );

        assert.equal(mailboxResponse.status, 201);
        assert.equal(mailboxResponse.body.message.senderType, "SUBTASK");
        assert.equal(mailboxResponse.body.message.targetSubTaskId, backend.id);
        assert.equal(mailboxResponse.body.message.messageType, "API_CONTRACT");
        assert.equal(mailboxResponse.body.message.branchRef, architect.branchName);
        assert.deepEqual(mailboxResponse.body.message.artifactRefs, ["contract:auth-api"]);

        const mailboxEvent = await nextEvent(events, (event) => event.eventName === "mailbox:message");
        assert.equal(mailboxEvent.data.message.messageType, "API_CONTRACT");
        assert.equal(mailboxEvent.data.message.targetSubTaskId, backend.id);

        const detailAfter = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailAfter.status, 200);
        assert.equal(detailAfter.body.mailboxMessages.length, 1);
        assert.deepEqual(detailAfter.body.mailboxMessages[0].schemaJson, {
          request: { body: { email: "string", password: "string" } },
          response: { body: { token: "string", refreshToken: "string" } },
        });
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

test("cancels and reassigns one member from the web orchestration lifecycle APIs", async () => {
  const fixture = await makeTempDir("eat-team-lifecycle-actions-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend Worker",
            description: "Keep the backend worker running in parallel.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-worker",
          },
          {
            title: "Frontend Worker",
            description: "Cancel and reassign this member during execution.",
            recommended_agent: "worker-agent",
            branch_suffix: "frontend-worker",
          },
        ],
      },
      workerBehavior: (config) => ({
        delayMs: config.branchName.endsWith("frontend-worker") ? 500 : 350,
        exitCode: 0,
        output: `${config.branchName} finished\n`,
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "team-lifecycle-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Cancel and reassign one running team member.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Team lifecycle actions",
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
        await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId);

        const beforeCancel = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const targetSubTask = beforeCancel.body.subTasks.find((subTask) => subTask.branchSuffix === "frontend-worker");
        assert.ok(targetSubTask);

        const cancelResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(targetSubTask.id)}/cancel`,
          { method: "POST" },
        );
        assert.equal(cancelResponse.status, 200);

        const cancelledEvent = await nextEvent(events, (event) => (
          event.eventName === "subtask:cancelled" && event.data.subtaskId === targetSubTask.id
        ));
        assert.equal(cancelledEvent.data.status, "CANCELLED");

        const afterCancel = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const cancelledMember = afterCancel.body.subTasks.find((subTask) => subTask.id === targetSubTask.id);
        assert.equal(cancelledMember.status, "CANCELLED");
        assert.equal(cancelledMember.assignmentSource, "OPERATOR");

        const reassignResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(targetSubTask.id)}/reassign`,
          {
            body: {
              description: "Relaunch the frontend worker from the operator team view.",
            },
            method: "POST",
          },
        );
        assert.equal(reassignResponse.status, 200);

        const assignedEvent = await nextEvent(events, (event) => (
          event.eventName === "subtask:assigned"
          && event.data.subtaskId === targetSubTask.id
          && event.data.assignmentSource === "OPERATOR"
        ));
        assert.equal(assignedEvent.data.assignmentSource, "OPERATOR");
        await nextEvent(events, (event) => (
          event.eventName === "session:started" && event.data.subtaskId === targetSubTask.id
        ));

        const finalDetail = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const reassignedMember = finalDetail.body.subTasks.find((subTask) => subTask.id === targetSubTask.id);
        assert.equal(reassignedMember.assignmentSource, "OPERATOR");
        assert.equal(reassignedMember.retryCount, 1);
        assert.equal(reassignedMember.description, "Relaunch the frontend worker from the operator team view.");
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

test("auto-generates dependency handoff notes and injects them into downstream worker prompts", async () => {
  const fixture = await makeTempDir("eat-mailbox-handoff-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const workerPrompts = [];
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Backend contract",
            description: "Finalize auth and todo API contracts.",
            recommended_agent: "worker-agent",
            branch_suffix: "backend-contract",
          },
          {
            title: "React frontend",
            description: "Build the frontend after the backend contract is ready.",
            recommended_agent: "worker-agent",
            branch_suffix: "react-frontend",
            depends_on: ["backend-contract"],
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        workerPrompts.push({
          branchName: config.branchName,
          prompt: config.prompt,
        });
      },
      reviewBehavior: (config) => ({
        decision: "ACCEPTED",
        summary: config.prompt.includes("Backend contract")
          ? "Backend contract accepted for downstream work."
          : "Frontend pass accepted.",
      }),
      workerBehavior: (config) => config.branchName.endsWith("backend-contract")
        ? {
            delayMs: 40,
            exitCode: 0,
            output: "backend routes ready\n",
          }
        : {
            delayMs: 20,
            exitCode: 0,
            output: "frontend ready\n",
          },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "mailbox-handoff-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Pass upstream backend context into the frontend worker prompt.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Mailbox prompt handoff",
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

        const mailboxEvent = await nextEvent(events, (event) => (
          event.eventName === "mailbox:message"
          && event.data.message.senderType === "SUBTASK"
        ));
        assert.ok(mailboxEvent.data.message.content.includes("Upstream subtask \"Backend contract\" finished successfully."));
        assert.equal(mailboxEvent.data.message.messageType, "DELIVERABLE_READY");

        await waitFor(() => workerPrompts.some((entry) => entry.branchName.endsWith("react-frontend")));
        const frontendPrompt = workerPrompts.find((entry) => entry.branchName.endsWith("react-frontend"))?.prompt ?? "";

        assert.match(frontendPrompt, /Structured mailbox handoff context:/);
        assert.match(frontendPrompt, /Actionable blockers and handoffs:/);
        assert.match(frontendPrompt, /type DELIVERABLE_READY/);
        assert.match(frontendPrompt, /Upstream subtask "Backend contract" finished successfully\./);
        assert.match(frontendPrompt, /Latest incremental review: ACCEPTED - Backend contract accepted for downstream work\./);
        assert.match(frontendPrompt, /backend routes ready/);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.mailboxMessages.length, 1);
        assert.equal(detailResponse.body.mailboxMessages[0].senderType, "SUBTASK");
        assert.equal(detailResponse.body.mailboxMessages[0].messageType, "DELIVERABLE_READY");
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

test("triggers incremental review after a successful worker run and exposes advisory state", async () => {
  const fixture = await makeTempDir("eat-worker-incremental-review-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Reviewable worker",
            description: "Generate a worker result that needs follow-up.",
            recommended_agent: "worker-agent",
            branch_suffix: "reviewable-worker",
          },
        ],
      },
      reviewBehavior: () => ({
        decision: "REWORK",
        summary: "Implementation completed, but the worker skipped the validation branch and needs a focused rerun.",
      }),
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed with TODOs\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "incremental-review-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Run incremental review after worker completion.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Incremental review",
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

        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);
        const reviewEvent = await nextEvent(events, (event) => event.eventName === "subtask:review");

        assert.equal(reviewEvent.data.phase, "INCREMENTAL");
        assert.equal(reviewEvent.data.decision, "REWORK");
        assert.match(reviewEvent.data.summary, /needs a focused rerun/i);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.subTasks[0].status, "REVIEW_PENDING");
        assert.equal(detailResponse.body.subTasks[0].latestReviewDecision, "REWORK");
        assert.equal(detailResponse.body.subTasks[0].latestReviewPhase, "INCREMENTAL");
        assert.match(detailResponse.body.subTasks[0].latestReviewSummary, /skipped the validation branch/i);
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

test("includes coordinated delivery, testing, and diff-based review guidance in worker execution prompts", async () => {
  const fixture = await makeTempDir("eat-worker-prompt-guidance-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    let capturedWorkerPrompt = null;
    let capturedReviewPrompt = null;
    const phase08 = createPhase08AgentService({
      plan: {
        nodes: [
          {
            acceptance_criteria: [
              "Implement the Todo route.",
              "Run the relevant tests before finishing.",
            ],
            branch_suffix: "todo-foundation",
            deliverable: "A reviewable Todo foundation slice committed on the assigned branch.",
            description: "Add the local Todo route and supporting state.",
            recommended_agent: "worker-agent",
            role: "senior-developer",
            template_hint: "foundation-slice",
            title: "Todo foundation",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        capturedWorkerPrompt = config.prompt;
      },
      reviewBehavior: (config) => {
        capturedReviewPrompt = config.prompt;

        return {
          decision: "REWORK",
          summary: "Review prompt captured with diff-aware guidance.",
        };
      },
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed with reviewable output\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "worker-prompt-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Ship a Todo foundation slice with real testing guidance.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Prompt guidance",
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

        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "subtask:review");

        assert.match(capturedWorkerPrompt, /The human operator talks to the lead, not to you\./);
        assert.match(capturedWorkerPrompt, /Expected deliverable: A reviewable Todo foundation slice committed on the assigned branch\./);
        assert.match(capturedWorkerPrompt, /Acceptance criteria:\n1\. Implement the Todo route\./);
        assert.match(capturedWorkerPrompt, /Run the smallest relevant validation or test commands for your slice before finishing\./);
        assert.match(capturedReviewPrompt, /Base the decision on actual deliverables in the branch plus the worker log, not on log claims alone\./);
        assert.match(capturedReviewPrompt, /Git diff summary from the current branch\/worktree:/);
        assert.match(capturedReviewPrompt, /Acceptance criteria:\n1\. Implement the Todo route\./);
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

test("reworks a reviewed subtask on the same branch and worktree while keeping the task executing", async () => {
  const fixture = await makeTempDir("eat-worker-early-rework-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    let reviewAttempt = 0;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Early rework slice",
            description: "First pass needs a focused rewrite.",
            recommended_agent: "worker-agent",
            branch_suffix: "early-rework-slice",
          },
        ],
      },
      reviewBehavior: () => {
        reviewAttempt += 1;
        return reviewAttempt === 1
          ? {
              decision: "REWORK",
              summary: "The first pass is close, but it needs a targeted rerun with stricter validation coverage.",
            }
          : {
              decision: "ACCEPTED",
              summary: "The rerun addressed the earlier validation gap.",
            };
      },
      workerBehavior: (config) => ({
        delayMs: 20,
        exitCode: 0,
        output: `worker run for ${path.basename(config.workDir)}\n`,
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "early-rework-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Allow early rework after advisory review.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Early rework",
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

        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "subtask:review" && event.data.decision === "REWORK");

        const beforeRework = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const subTask = beforeRework.body.subTasks[0];
        const originalBranchName = subTask.branchName;
        const originalWorktreePath = subTask.worktreePath;

        const reworkResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(subTask.id)}/rework`,
          {
            body: {
              description: "Tighten validation handling and rerun on the existing workspace.",
            },
            method: "POST",
          },
        );
        assert.equal(reworkResponse.status, 200);

        const reworkEvent = await nextEvent(events, (event) => event.eventName === "subtask:rework");
        assert.equal(reworkEvent.data.description, "Tighten validation handling and rerun on the existing workspace.");

        await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId === subTask.id);
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.subtaskId === subTask.id
          && event.data.phase === "FINAL"
          && event.data.decision === "ACCEPTED"
        ));

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].status, "ACCEPTED");
        assert.equal(detailResponse.body.subTasks[0].retryCount, 1);
        assert.equal(
          detailResponse.body.subTasks[0].description,
          "Tighten validation handling and rerun on the existing workspace.",
        );
        assert.equal(detailResponse.body.subTasks[0].branchName, originalBranchName);
        assert.equal(detailResponse.body.subTasks[0].worktreePath, originalWorktreePath);
        assert.equal(detailResponse.body.subTasks[0].latestReviewDecision, "ACCEPTED");
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

test("changes agent before relaunch, revalidates attachments, and keeps the task executing", async () => {
  const fixture = await makeTempDir("eat-worker-change-agent-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const imagePath = path.join(fixture.path, "flow.png");
    await writeFile(imagePath, "png\n", "utf8");

    let reviewAttempt = 0;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Switchable worker",
            description: "Needs a vision-capable rerun.",
            recommended_agent: "worker-agent",
            branch_suffix: "switchable-worker",
          },
        ],
      },
      reviewBehavior: () => {
        reviewAttempt += 1;
        return reviewAttempt === 1
          ? {
              decision: "REWORK",
              summary: "Switch to a vision-capable worker before relaunch so the image attachment can be used.",
            }
          : {
              decision: "ACCEPTED",
              summary: "The vision-capable rerun used the attachment and resolved the gap.",
            };
      },
      workerBehavior: (config) => ({
        delayMs: 20,
        exitCode: 0,
        output: `worker run for ${path.basename(config.workDir)} via ${config.branchName}\n`,
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "change-agent-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          attachments: [
            {
              fileName: "flow.png",
              filePath: imagePath,
              fileType: "IMAGE",
              mimeType: "image/png",
            },
          ],
          baseBranch: "main",
          description: "Switch worker agent during early rework.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Change agent",
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

        const initialStarted = await nextEvent(events, (event) => event.eventName === "session:started" && event.data.subtaskId);
        assert.equal(initialStarted.data.attachments.included.length, 0);
        assert.equal(initialStarted.data.attachments.excluded[0].fileName, "flow.png");

        await nextEvent(events, (event) => event.eventName === "subtask:review" && event.data.decision === "REWORK");

        const beforeChange = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const subTask = beforeChange.body.subTasks[0];
        const originalBranchName = subTask.branchName;
        const originalWorktreePath = subTask.worktreePath;

        const changeAgentResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(subTask.id)}/change-agent`,
          {
            body: {
              agentType: "vision-worker",
              description: "Use the screenshot attachment during the rerun.",
            },
            method: "POST",
          },
        );
        assert.equal(changeAgentResponse.status, 200);

        const changedEvent = await nextEvent(events, (event) => event.eventName === "subtask:agent-changed");
        assert.equal(changedEvent.data.oldAgentType, "worker-agent");
        assert.equal(changedEvent.data.newAgentType, "vision-worker");

        const relaunchedEvent = await nextEvent(
          events,
          (event) => event.eventName === "session:started" && event.data.subtaskId === subTask.id,
        );
        assert.equal(relaunchedEvent.data.attachments.included[0].fileName, "flow.png");
        assert.equal(relaunchedEvent.data.attachments.excluded.length, 0);

        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.subtaskId === subTask.id
          && event.data.phase === "FINAL"
          && event.data.decision === "ACCEPTED"
        ));

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].status, "ACCEPTED");
        assert.equal(detailResponse.body.subTasks[0].agentType, "vision-worker");
        assert.equal(detailResponse.body.subTasks[0].retryCount, 1);
        assert.equal(detailResponse.body.subTasks[0].description, "Use the screenshot attachment during the rerun.");
        assert.equal(detailResponse.body.subTasks[0].branchName, originalBranchName);
        assert.equal(detailResponse.body.subTasks[0].worktreePath, originalWorktreePath);
        assert.equal(detailResponse.body.subTasks[0].launchMetadata.included[0].fileName, "flow.png");
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

test("emits session lifecycle and output events with session-scoped metadata", async () => {
  const fixture = await makeTempDir("eat-worker-stream-events-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Worker alpha",
            description: "Emit alpha output.",
            recommended_agent: "worker-agent",
            branch_suffix: "worker-alpha",
          },
          {
            title: "Worker beta",
            description: "Emit beta output.",
            recommended_agent: "worker-agent",
            branch_suffix: "worker-beta",
          },
        ],
      },
      workerBehavior: (config) => ({
        delayMs: 40,
        exitCode: 0,
        output: `${path.basename(config.workDir)} output\n`,
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "stream-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Verify session events are routed by session.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Session events",
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
        const outputEvents = [
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
        ];
        const endedEvents = [
          await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId),
        ];

        const startedSessionIds = new Set(startedEvents.map((event) => event.data.sessionId));
        const outputSessionIds = new Set(outputEvents.map((event) => event.data.sessionId));
        const endedSessionIds = new Set(endedEvents.map((event) => event.data.sessionId));

        assert.equal(startedSessionIds.size, 2);
        assert.deepEqual(outputSessionIds, startedSessionIds);
        assert.deepEqual(endedSessionIds, startedSessionIds);

        for (const startedEvent of startedEvents) {
          assert.equal(startedEvent.data.sessionType, "WORKER");
          assert.equal(startedEvent.data.status, "RUNNING");
          assert.equal(startedEvent.data.taskId, taskId);
          assert.ok(startedEvent.data.logPath);
        }

        for (const outputEvent of outputEvents) {
          assert.match(outputEvent.data.chunk, /output/);
          assert.ok(startedSessionIds.has(outputEvent.data.sessionId));
          assert.ok(outputEvent.data.subtaskId);
        }

        for (const endedEvent of endedEvents) {
          assert.equal(endedEvent.data.sessionType, "WORKER");
          assert.equal(endedEvent.data.status, "COMPLETED");
          assert.equal(endedEvent.data.exitCode, 0);
        }
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

test("keeps noisy concurrent output routed to the correct session buffers", async () => {
  const fixture = await makeTempDir("eat-worker-noisy-output-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Noisy alpha",
            description: "Emit many alpha chunks.",
            recommended_agent: "worker-agent",
            branch_suffix: "noisy-alpha",
          },
          {
            title: "Noisy beta",
            description: "Emit many beta chunks.",
            recommended_agent: "worker-agent",
            branch_suffix: "noisy-beta",
          },
        ],
      },
      workerBehavior: (config) => {
        const label = path.basename(config.workDir);

        return {
          delayMs: 50,
          exitCode: 0,
          outputChunks: [
            `${label}: chunk-1\n`,
            `${label}: chunk-2\n`,
            `${label}: chunk-3\n`,
          ],
          outputSpacingMs: 5,
        };
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "noisy-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Verify noisy output routing.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Noisy routing",
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
        const outputEvents = [
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
          await nextEvent(events, (event) => event.eventName === "session:output" && event.data.subtaskId),
        ];

        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);
        await nextEvent(events, (event) => event.eventName === "session:ended" && event.data.subtaskId);

        const chunksBySessionId = new Map();

        for (const outputEvent of outputEvents) {
          const existing = chunksBySessionId.get(outputEvent.data.sessionId) ?? "";
          chunksBySessionId.set(outputEvent.data.sessionId, `${existing}${outputEvent.data.chunk}`);
        }

        assert.equal(chunksBySessionId.size, 2);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);

        for (const startedEvent of startedEvents) {
          const session = detailResponse.body.sessions.find((entry) => entry.id === startedEvent.data.sessionId);

          assert.ok(session);
          assert.equal(session.outputBuffer, chunksBySessionId.get(session.id));
          assert.match(session.outputBuffer, /chunk-1/);
          assert.match(session.outputBuffer, /chunk-3/);
        }
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
          (event) => event.eventName === "subtask:review" && event.data.phase === "FINAL" && event.data.decision === "ACCEPTED",
        );

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].status, "ACCEPTED");
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

test("enters REVIEWING and assembles final review inputs after all worker runs finish", async () => {
  const fixture = await makeTempDir("eat-worker-final-review-inputs-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const finalReviewPrompts = [];
    const phase08 = createPhase08AgentService({
      finalReviewBehavior: (config) => {
        finalReviewPrompts.push(config.prompt);
        return {
          reviews: extractPromptSubtaskIds(config.prompt).map((subTaskId) => ({
            decision: "ACCEPTED",
            subtask_id: subTaskId,
            summary: "Final review accepted the generated change for merge.",
          })),
        };
      },
      plan: {
        subtasks: [
          {
            title: "Reviewable worker",
            description: "Produce a final-reviewable change.",
            recommended_agent: "worker-agent",
            branch_suffix: "reviewable-worker",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        await writeFile(path.join(config.workDir, "README.md"), "seed\nphase11 change\n", "utf8");
      },
      reviewBehavior: () => ({
        decision: "ACCEPTED",
        summary: "Incremental review accepted the generated change for final review.",
      }),
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed final-reviewable change\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "final-review-inputs-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Collect final review inputs after worker completion.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Final review inputs",
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
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.phase === "INCREMENTAL"
          && event.data.decision === "ACCEPTED"
        ));
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "REVIEWING");
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        await waitFor(() => finalReviewPrompts.length === 1);
        assert.match(finalReviewPrompts[0], /authoritative final review/i);
        assert.match(finalReviewPrompts[0], /Approved plan snapshot:/);
        assert.match(finalReviewPrompts[0], /Incremental review accepted the generated change/i);
        assert.match(finalReviewPrompts[0], /retry_count/);
        assert.match(finalReviewPrompts[0], /README\.md/);

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.equal(detailResponse.body.subTasks[0].status, "ACCEPTED");
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

test("persists FINAL review records and writes authoritative subtask statuses", async () => {
  const fixture = await makeTempDir("eat-worker-final-review-writeback-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const taskRepository = new SqliteTaskRepository({ databasePath });
    const phase08 = createPhase08AgentService({
      finalReviewBehavior: (config) => {
        const [acceptedId, reworkId, rejectedId] = extractPromptSubtaskIds(config.prompt);

        return {
          reviews: [
            {
              decision: "ACCEPTED",
              subtask_id: acceptedId,
              summary: "Final review accepted this subtask for merge.",
            },
            {
              decision: "REWORK",
              subtask_id: reworkId,
              summary: "Final review requires another worker pass.",
            },
            {
              decision: "REJECTED",
              subtask_id: rejectedId,
              summary: "Final review marked this subtask for discard.",
            },
          ],
        };
      },
      plan: {
        subtasks: [
          {
            title: "Accepted worker",
            description: "This subtask should be accepted.",
            recommended_agent: "worker-agent",
            branch_suffix: "accepted-worker",
          },
          {
            title: "Rework worker",
            description: "This subtask should require rework.",
            recommended_agent: "worker-agent",
            branch_suffix: "rework-worker",
          },
          {
            title: "Rejected worker",
            description: "This subtask should be discarded.",
            recommended_agent: "worker-agent",
            branch_suffix: "rejected-worker",
          },
        ],
      },
      reviewBehavior: () => ({
        decision: "ACCEPTED",
        summary: "Incremental review accepted the worker result.",
      }),
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed for final review writeback\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "final-review-writeback-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Persist final review records and authoritative decisions.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Final review writeback",
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
        await nextEvent(events, (event) => (
          event.eventName === "task:status" && event.data.status === "REVIEWING"
        ));
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.phase === "FINAL"
          && event.data.decision === "ACCEPTED"
        ));
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.phase === "FINAL"
          && event.data.decision === "REWORK"
        ));
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.phase === "FINAL"
          && event.data.decision === "REJECTED"
        ));

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);

        assert.deepEqual(
          detailResponse.body.subTasks.map((subTask) => subTask.status).sort(),
          ["ACCEPTED", "DISCARD_PENDING", "REWORK_REQUIRED"],
        );
        assert.deepEqual(
          detailResponse.body.subTasks.map((subTask) => subTask.latestReviewDecision).sort(),
          ["ACCEPTED", "REJECTED", "REWORK"],
        );
        assert.ok(detailResponse.body.subTasks.every((subTask) => subTask.latestReviewPhase === "FINAL"));
        assert.equal(detailResponse.body.task.status, "ACTION_REQUIRED");
        assert.match(detailResponse.body.task.lastError, /Final review requires user action/i);

        for (const subTask of detailResponse.body.subTasks) {
          const reviewRecords = await taskRepository.listReviewRecordsBySubTaskId(subTask.id);
          assert.equal(reviewRecords.filter((record) => record.phase === REVIEW_PHASE.FINAL).length, 1);
          assert.equal(reviewRecords.filter((record) => record.phase === REVIEW_PHASE.INCREMENTAL).length, 1);
        }
      } finally {
        unsubscribe();
      }
    } finally {
      await stopServer(server);
      taskRepository.close();
    }
  } finally {
    await fixture.dispose();
  }
});

test("confirms discard and routes the task to MERGING when all remaining subtasks are resolved", async () => {
  const fixture = await makeTempDir("eat-worker-discard-confirm-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      finalReviewBehavior: (config) => {
        const [acceptedId, rejectedId] = extractPromptSubtaskIds(config.prompt);

        return {
          reviews: [
            {
              decision: "ACCEPTED",
              subtask_id: acceptedId,
              summary: "Final review accepted this subtask.",
            },
            {
              decision: "REJECTED",
              subtask_id: rejectedId,
              summary: "Final review rejected this subtask for discard.",
            },
          ],
        };
      },
      plan: {
        subtasks: [
          {
            title: "Accepted worker",
            description: "This subtask should be accepted.",
            recommended_agent: "worker-agent",
            branch_suffix: "accepted-worker",
          },
          {
            title: "Rejected worker",
            description: "This subtask should be discarded.",
            recommended_agent: "worker-agent",
            branch_suffix: "rejected-worker",
          },
        ],
      },
      reviewBehavior: () => ({
        decision: "ACCEPTED",
        summary: "Incremental review accepted the worker result.",
      }),
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed for discard confirm\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "discard-confirm-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Confirm discard after final review.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Discard confirmation",
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
        await nextEvent(events, (event) => (
          event.eventName === "task:status" && event.data.status === "ACTION_REQUIRED"
        ));

        const beforeConfirm = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const discardPendingSubTask = beforeConfirm.body.subTasks.find((subTask) => subTask.status === "DISCARD_PENDING");
        assert.ok(discardPendingSubTask);

        const confirmResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(discardPendingSubTask.id)}/confirm-discard`,
          { method: "POST" },
        );
        assert.equal(confirmResponse.status, 200);

        await nextEvent(events, (event) => (
          event.eventName === "subtask:confirm-discard" && event.data.subtaskId === discardPendingSubTask.id
        ));
        await nextEvent(events, (event) => (
          event.eventName === "task:status" && event.data.status === "MERGING"
        ));

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "MERGING");
        assert.deepEqual(
          detailResponse.body.subTasks.map((subTask) => subTask.status).sort(),
          ["ACCEPTED", "DISCARDED"],
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

test("keeps the task ACTION_REQUIRED when final review finishes with unresolved failed subtasks", async () => {
  const fixture = await makeTempDir("eat-worker-final-review-failed-mix-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      finalReviewBehavior: (config) => {
        const [acceptedId] = extractPromptSubtaskIds(config.prompt);

        return {
          reviews: [
            {
              decision: "ACCEPTED",
              subtask_id: acceptedId,
              summary: "Final review accepted the successful subtask.",
            },
          ],
        };
      },
      plan: {
        subtasks: [
          {
            title: "Accepted worker",
            description: "This worker should succeed.",
            recommended_agent: "worker-agent",
            branch_suffix: "accepted-worker",
          },
          {
            title: "Failed worker",
            description: "This worker cannot launch in Docker.",
            recommended_agent: "host-only-worker",
            branch_suffix: "failed-worker",
          },
        ],
      },
      reviewBehavior: () => ({
        decision: "ACCEPTED",
        summary: "Incremental review accepted the worker result.",
      }),
      workerBehavior: () => ({
        delayMs: 20,
        exitCode: 0,
        output: "worker completed for failed mix route\n",
      }),
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "failed-mix-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Keep action required when a subtask failed before final review.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Failed mix route",
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
        await nextEvent(events, (event) => (
          event.eventName === "subtask:review"
          && event.data.phase === "FINAL"
          && event.data.decision === "ACCEPTED"
        ));

        const detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "ACTION_REQUIRED");
        assert.match(detailResponse.body.task.lastError, /FAILED/);
        assert.ok(detailResponse.body.subTasks.some((subTask) => subTask.status === "FAILED"));
        assert.ok(detailResponse.body.subTasks.some((subTask) => subTask.status === "ACCEPTED"));
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

test("runs accepted subtasks through an explicit integration branch and completes after release gates pass", async () => {
  const fixture = await makeTempDir("eat-phase12-merge-success-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Alpha merge",
            description: "Add the alpha artifact.",
            recommended_agent: "worker-agent",
            branch_suffix: "alpha-merge",
          },
          {
            title: "Beta merge",
            description: "Add the beta artifact.",
            recommended_agent: "worker-agent",
            branch_suffix: "beta-merge",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        if (config.workDir.includes("alpha-merge")) {
          await commitWorktreeChange(config.workDir, "alpha.txt", "alpha\n");
          return;
        }

        if (config.workDir.includes("beta-merge")) {
          await commitWorktreeChange(config.workDir, "beta.txt", "beta\n");
        }
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "phase12-merge-success-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Merge the accepted subtasks in a deterministic order.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Phase 12 merge success",
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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const integrationResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/integration-runs`,
          { method: "POST" },
        );
	        assert.equal(integrationResponse.status, 201);

	        await nextEvent(events, (event) => event.eventName === "integration:queued");
	        await nextEvent(events, (event) => event.eventName === "integration:completed" && event.data.status === "COMPLETED");

        let detailResponse = null;
        await waitFor(async () => {
          detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
          return detailResponse.status === 200 && detailResponse.body.task.status === "COMPLETED";
        }, 400);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "COMPLETED");
        assert.deepEqual(
          detailResponse.body.subTasks.map((subTask) => subTask.status),
          ["MERGED", "MERGED"],
        );
        assert.deepEqual(detailResponse.body.cleanupWarnings, []);
        assert.ok(detailResponse.body.subTasks.every((subTask) => subTask.mergeRecords.length === 1));
        assert.ok(detailResponse.body.subTasks.every((subTask) => subTask.mergeRecords[0].status === "SUCCEEDED"));
        assert.equal(detailResponse.body.integration.latestRun.status, "COMPLETED");
        assert.deepEqual(
          detailResponse.body.integration.latestRun.queueItems.map((queueItem) => queueItem.status),
          ["RELEASED", "RELEASED"],
        );
        assert.equal(await readFile(path.join(repo.repoPath, "alpha.txt"), "utf8"), "alpha\n");
        assert.equal(await readFile(path.join(repo.repoPath, "beta.txt"), "utf8"), "beta\n");

        const mergeSubjects = (await git(repo.repoPath, ["log", "main", "--merges", "--reverse", "--format=%s"]))
          .split("\n")
          .filter(Boolean);
        assert.equal(mergeSubjects.length, 3);
        assert.match(mergeSubjects[0], /alpha-merge/);
        assert.match(mergeSubjects[1], /beta-merge/);
        assert.match(mergeSubjects[2], /integration-1/);
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

test("keeps the base branch clean on gate failure and completes after integration retry", async () => {
  const fixture = await makeTempDir("eat-phase21-gate-retry-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    let gateRunCount = 0;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Retryable integration change",
            description: "Fail the release gate once, then retry cleanly.",
            recommended_agent: "worker-agent",
            branch_suffix: "gate-retry",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        await commitWorktreeChange(config.workDir, "gate-retry.txt", "retry me\n");
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
      taskServiceOptions: {
        integrationGateRunner: async () => {
          gateRunCount += 1;

          if (gateRunCount === 1) {
            return [{
              gateType: "TEST",
              status: "FAILED",
              summary: "Intentional integration gate failure for retry coverage.",
            }];
          }

          return [{
            gateType: "TEST",
            status: "PASSED",
            summary: "Integration gate passed on retry.",
          }];
        },
      },
    });

    try {
      const repo = await createRepository(fixture.path, "phase21-gate-retry-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Keep base clean when release gates fail, then retry integration.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Phase 21 gate retry",
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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const startResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/integration-runs`,
          { method: "POST" },
        );
        assert.equal(startResponse.status, 201);

        await nextEvent(events, (event) => event.eventName === "integration:queued");
        await nextEvent(events, (event) => event.eventName === "integration:started");
        const failedGateEvent = await nextEvent(
          events,
          (event) => event.eventName === "integration:gate-result" && event.data.status === "FAILED",
        );
        assert.match(failedGateEvent.data.summary, /intentional integration gate failure/i);
        await nextEvent(events, (event) => event.eventName === "integration:failed" && event.data.status === "ACTION_REQUIRED");
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "ACTION_REQUIRED");

        const blockedResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(blockedResponse.status, 200);
        assert.equal(blockedResponse.body.task.status, "ACTION_REQUIRED");
        assert.equal(blockedResponse.body.integration.latestRun.status, "ACTION_REQUIRED");
        await assert.rejects(git(repo.repoPath, ["show", "main:gate-retry.txt"]));

        const retryResponse = await requestJson(
          server,
          `/api/integration-runs/${encodeURIComponent(blockedResponse.body.integration.latestRun.id)}/retry`,
          { method: "POST" },
        );
        assert.equal(retryResponse.status, 200);

        await nextEvent(events, (event) => event.eventName === "integration:queued");
        await nextEvent(events, (event) => event.eventName === "integration:started");
        await nextEvent(events, (event) => event.eventName === "integration:gate-result" && event.data.status === "PASSED");
        await nextEvent(events, (event) => event.eventName === "integration:completed" && event.data.status === "COMPLETED");

        let detailResponse = null;
        await waitFor(async () => {
          detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
          return detailResponse.status === 200 && detailResponse.body.task.status === "COMPLETED";
        }, 400);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "COMPLETED");
        assert.equal(detailResponse.body.subTasks[0].status, "MERGED");
        assert.deepEqual(detailResponse.body.cleanupWarnings, []);
        assert.equal(detailResponse.body.subTasks[0].mergeRecords.length, 2);
        assert.ok(detailResponse.body.subTasks[0].mergeRecords.every((record) => record.status === "SUCCEEDED"));
        assert.equal(detailResponse.body.integration.runs.length, 2);
        assert.equal(detailResponse.body.integration.runs[0].gateResults[0].status, "FAILED");
        assert.equal(detailResponse.body.integration.latestRun.status, "COMPLETED");
        assert.equal(await readFile(path.join(repo.repoPath, "gate-retry.txt"), "utf8"), "retry me\n");
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

test("persists cleanup warnings and keeps completed tasks terminal when worktree cleanup fails", async () => {
  const fixture = await makeTempDir("eat-phase13-cleanup-warning-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    let gateRunCount = 0;
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Cleanup warning merge",
            description: "Reach completion with a poisoned cleanup path.",
            recommended_agent: "worker-agent",
            branch_suffix: "cleanup-warning",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        await commitWorktreeChange(config.workDir, "cleanup-warning.txt", "cleanup warning\n");
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
      taskServiceOptions: {
        integrationGateRunner: async () => {
          gateRunCount += 1;

          if (gateRunCount === 1) {
            return [{
              gateType: "TEST",
              status: "FAILED",
              summary: "Pause before cleanup warning verification.",
            }];
          }

          return [{
            gateType: "TEST",
            status: "PASSED",
            summary: "Cleanup warning retry gate passed.",
          }];
        },
      },
    });

    try {
      const repo = await createRepository(fixture.path, "phase13-cleanup-warning-repo");
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Persist cleanup warnings without reopening the task.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Phase 13 cleanup warning",
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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const startResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/integration-runs`,
          { method: "POST" },
        );
        assert.equal(startResponse.status, 201);

        await nextEvent(events, (event) => event.eventName === "integration:queued");
        await nextEvent(events, (event) => event.eventName === "integration:started");
        await nextEvent(events, (event) => event.eventName === "integration:gate-result" && event.data.status === "FAILED");
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "ACTION_REQUIRED");

        const repository = new SqliteTaskRepository({ databasePath });
        const blockedResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        const subTask = blockedResponse.body.subTasks[0];
        await repository.updateSubTask(subTask.id, {
          worktreePath: repo.repoPath,
        });

        const retryResponse = await requestJson(
          server,
          `/api/integration-runs/${encodeURIComponent(blockedResponse.body.integration.latestRun.id)}/retry`,
          { method: "POST" },
        );
        assert.equal(retryResponse.status, 200);

        let detailResponse = null;
        await waitFor(async () => {
          detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
          return (
            detailResponse.status === 200
            && detailResponse.body.task.status === "COMPLETED"
            && detailResponse.body.cleanupWarnings.length > 0
          );
        }, 1000);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "COMPLETED");
        assert.equal(detailResponse.body.subTasks[0].status, "MERGED");
        assert.equal(detailResponse.body.cleanupWarnings.length, 1);
        assert.equal(detailResponse.body.cleanupWarnings[0].worktreePath, repo.repoPath);
        assert.match(detailResponse.body.cleanupWarnings[0].reason, /failed|main working tree|registered worktree|worktree/i);
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

test("records merge conflicts, supports rebase retry, and resumes merge flow after the branch is updated", async () => {
  const fixture = await makeTempDir("eat-phase12-rebase-retry-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const eventBus = new TaskEventBus();
    const phase08 = createPhase08AgentService({
      plan: {
        subtasks: [
          {
            title: "Shared change A",
            description: "Take the first conflicting change.",
            recommended_agent: "worker-agent",
            branch_suffix: "shared-a",
          },
          {
            title: "Shared change B",
            description: "Take the second conflicting change.",
            recommended_agent: "worker-agent",
            branch_suffix: "shared-b",
          },
        ],
      },
      prepareWorkerSession: async (config) => {
        if (config.workDir.includes("shared-a")) {
          await commitWorktreeChange(config.workDir, "shared.txt", "alpha\n");
          return;
        }

        if (config.workDir.includes("shared-b")) {
          await commitWorktreeChange(config.workDir, "shared.txt", "beta\n");
        }
      },
    });
    const server = await startServer({
      agentService: phase08.agentService,
      databasePath,
      eventBus,
    });

    try {
      const repo = await createRepository(fixture.path, "phase12-rebase-retry-repo");
      await writeFile(path.join(repo.repoPath, "shared.txt"), "seed\n", "utf8");
      await git(repo.repoPath, ["add", "shared.txt"]);
      await git(repo.repoPath, ["commit", "-m", "add shared seed"]);

      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      const taskResponse = await requestJson(server, "/api/tasks", {
        body: {
          baseBranch: "main",
          description: "Rebase retry the conflicting branch and continue merging.",
          leadAgentType: "healthy-lead",
          projectId: registerResponse.body.project.id,
          title: "Phase 12 rebase retry",
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
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "ACTION_REQUIRED");

        const blockedResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
        assert.equal(blockedResponse.status, 200);
        assert.equal(blockedResponse.body.task.status, "ACTION_REQUIRED");
        assert.ok(
          blockedResponse.body.subTasks.every((subTask) => (
            [ "ACCEPTED", "REVIEW_PENDING" ].includes(subTask.status)
          )),
        );
        assert.equal(blockedResponse.body.integration.latestRun, null);
        const conflictedSubTask = blockedResponse.body.subTasks.find(
          (subTask) => subTask.mergeRecords.at(-1)?.status === "CONFLICT",
        );
        assert.ok(conflictedSubTask);
        assert.match(conflictedSubTask.mergeRecords.at(-1).conflictSummary ?? "", /conflict/i);
        assert.equal(conflictedSubTask.mergeRecords.at(-1).targetBranch, blockedResponse.body.task.taskBranchName);
        await git(conflictedSubTask.worktreePath, ["reset", "--hard", "main"]);
        await writeFile(path.join(conflictedSubTask.worktreePath, "resolved.txt"), "resolved\n", "utf8");
        await git(conflictedSubTask.worktreePath, ["add", "resolved.txt"]);
        await git(conflictedSubTask.worktreePath, ["commit", "-m", "resolve shared change b"]);

        const rebaseResponse = await requestJson(
          server,
          `/api/subtasks/${encodeURIComponent(conflictedSubTask.id)}/rebase-retry`,
          { method: "POST" },
        );
        assert.equal(rebaseResponse.status, 200);
        assert.equal(rebaseResponse.body.mergeStatus, "SUCCEEDED");

        await nextEvent(events, (event) => (
          event.eventName === "merge:status"
          && event.data.subtaskId === conflictedSubTask.id
          && event.data.status === "SUCCEEDED"
        ));
        await nextEvent(events, (event) => event.eventName === "task:status" && event.data.status === "MERGING");

        const startResponse = await requestJson(
          server,
          `/api/tasks/${encodeURIComponent(taskId)}/integration-runs`,
          { method: "POST" },
        );
        assert.equal(startResponse.status, 201);

        await nextEvent(events, (event) => event.eventName === "integration:completed" && event.data.status === "COMPLETED");

        let detailResponse = null;
        await waitFor(async () => {
          detailResponse = await requestJson(server, `/api/tasks/${encodeURIComponent(taskId)}`);
          return detailResponse.status === 200 && detailResponse.body.task.status === "COMPLETED";
        }, 400);
        assert.equal(detailResponse.status, 200);
        assert.equal(detailResponse.body.task.status, "COMPLETED");
        assert.deepEqual(
          detailResponse.body.subTasks.map((subTask) => subTask.status),
          ["MERGED", "MERGED"],
        );
        const retriedSubTask = detailResponse.body.subTasks.find((subTask) => subTask.id === conflictedSubTask.id);
        assert.deepEqual(
          retriedSubTask.mergeRecords.map((record) => `${record.operation}:${record.status}`),
          ["MERGE:CONFLICT", "REBASE:SUCCEEDED", "MERGE:SUCCEEDED"],
        );
        assert.equal(await readFile(path.join(repo.repoPath, "resolved.txt"), "utf8"), "resolved\n");
        const expectedSharedContent = conflictedSubTask.branchSuffix === "shared-a" ? "beta\n" : "alpha\n";
        assert.equal(await readFile(path.join(repo.repoPath, "shared.txt"), "utf8"), expectedSharedContent);
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
    async spawnSession(config) {
      const outputListeners = new Set();
      const exitListeners = new Set();

      if (typeof config?.prompt === "string" && config.prompt.includes("incremental advisory review")) {
        const review = options.reviewBehavior?.(config) ?? {
          decision: "ACCEPTED",
          summary: "Incremental review accepted the worker run.",
        };

        setTimeout(() => {
          for (const listener of outputListeners) {
            listener(JSON.stringify({
              decision: review.decision ?? "ACCEPTED",
              summary: review.summary ?? "Incremental review accepted the worker run.",
            }));
          }
        }, review.delayMs ?? 0);
        setTimeout(() => {
          for (const listener of exitListeners) {
            listener(review.exitCode ?? 0);
          }
        }, (review.delayMs ?? 0) + 5);
      } else if (typeof config?.prompt === "string" && config.prompt.includes("authoritative final review")) {
        const finalReview = options.finalReviewBehavior?.(config) ?? {
          reviews: extractPromptSubtaskIds(config.prompt).map((subTaskId) => ({
            decision: "ACCEPTED",
            subtask_id: subTaskId,
            summary: "Final review accepted the subtask for merge.",
          })),
        };

        setTimeout(() => {
          for (const listener of outputListeners) {
            listener(JSON.stringify(finalReview));
          }
        }, finalReview.delayMs ?? 0);
        setTimeout(() => {
          for (const listener of exitListeners) {
            listener(finalReview.exitCode ?? 0);
          }
        }, (finalReview.delayMs ?? 0) + 5);
      } else {
        setTimeout(() => {
          for (const listener of outputListeners) {
            listener("Confirm the task, then I will emit the plan.\n");
          }
        }, 0);
      }

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
      await options.prepareWorkerSession?.(config);
      const behavior = options.workerBehavior?.(config) ?? {
        delayMs: 20,
        exitCode: 0,
        output: "worker completed\n",
      };
      const outputChunks = Array.isArray(behavior.outputChunks)
        ? behavior.outputChunks
        : [behavior.output ?? ""];
      const outputSpacingMs = behavior.outputSpacingMs ?? 0;
      const exitDelayMs = Math.max(
        behavior.delayMs,
        outputSpacingMs * Math.max(0, outputChunks.length - 1) + 5,
      );

      stats.active += 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.active);

      for (const [index, outputChunk] of outputChunks.entries()) {
        setTimeout(() => {
          for (const listener of outputListeners) {
            listener(outputChunk);
          }
        }, index * outputSpacingMs);
      }

      setTimeout(() => {
        stats.active -= 1;
        for (const listener of exitListeners) {
          listener(behavior.exitCode);
        }
      }, exitDelayMs);

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
      description: "Vision-capable worker for relaunch tests.",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      supportsInteractiveInput: true,
      supportsVision: true,
    },
    async healthCheck() {
      return {
        available: true,
        version: "1.0.0-test",
      };
    },
    name: "vision-worker",
    async spawnSession(config) {
      const outputListeners = new Set();
      const exitListeners = new Set();
      await options.prepareWorkerSession?.(config);
      const behavior = options.workerBehavior?.(config) ?? {
        delayMs: 20,
        exitCode: 0,
        output: "worker completed\n",
      };
      const outputChunks = Array.isArray(behavior.outputChunks)
        ? behavior.outputChunks
        : [behavior.output ?? ""];
      const outputSpacingMs = behavior.outputSpacingMs ?? 0;
      const exitDelayMs = Math.max(
        behavior.delayMs,
        outputSpacingMs * Math.max(0, outputChunks.length - 1) + 5,
      );

      stats.active += 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.active);

      for (const [index, outputChunk] of outputChunks.entries()) {
        setTimeout(() => {
          for (const listener of outputListeners) {
            listener(outputChunk);
          }
        }, index * outputSpacingMs);
      }

      setTimeout(() => {
        stats.active -= 1;
        for (const listener of exitListeners) {
          listener(behavior.exitCode);
        }
      }, exitDelayMs);

      return {
        containerId: `container-vision-${path.basename(config.workDir)}`,
        pid: 6200 + stats.maxConcurrent,
        sessionId: `vision-worker-${path.basename(config.workDir)}`,
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
    {
      body: { content: "Start clarification before entering the worker execution flow." },
      method: "POST",
    },
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
    taskServiceOptions: options.taskServiceOptions,
    uploadRootPath: options.uploadRootPath,
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

async function commitWorktreeChange(worktreePath, relativePath, content) {
  await writeFile(path.join(worktreePath, relativePath), content, "utf8");
  await git(worktreePath, ["add", relativePath]);
  await git(worktreePath, ["commit", "-m", `update ${relativePath}`]);
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });

  return stdout.trim();
}

async function nextEvent(events, predicate, attempts = 1000) {
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

async function waitFor(predicate, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error("Timed out waiting for worker execution condition.");
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

function extractPromptSubtaskIds(prompt) {
  return [...String(prompt ?? "").matchAll(/"subtask_id":\s*"([0-9a-f-]{36})"/g)]
    .map((match) => match[1]);
}

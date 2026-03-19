import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createApp } from "../src/server/app.js";
import {
  buildAgentRuntimeModeLabel,
  buildAgentStatusLabel,
  buildAttachmentCaption,
  buildBranchList,
  buildCleanlinessLabel,
  buildDockerHealthLabel,
  buildLeadSelectionState,
  buildProjectErrorMessage,
  buildSubTaskStatusLabel,
  buildTaskErrorMessage,
  buildTaskStatusLabel,
} from "../src/ui/view-model.js";

test("serves the Phase 05 planning UI shell and static assets", async () => {
  const server = createApp({
    repositoryOptions: {
      databasePath: path.join(process.cwd(), ".tmp-projects.db"),
    },
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const rootResponse = await request(server, "/");
    const cssResponse = await request(server, "/app.css");
    const jsResponse = await request(server, "/app.js");

    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get("content-type"), /^text\/html/);
    assert.match(rootResponse.body, /Lead Session Chat Flow/);
    assert.match(rootResponse.body, /New clarification task/i);
    assert.match(rootResponse.body, /Lead session transcript/i);
    assert.match(rootResponse.body, /Current plan draft/i);
    assert.match(rootResponse.body, /Add subtask/i);
    assert.match(rootResponse.body, /Save draft/i);
    assert.match(rootResponse.body, /Approve draft/i);
    assert.match(rootResponse.body, /Reset local edits/i);
    assert.match(rootResponse.body, /Planning notes/i);
    assert.match(rootResponse.body, /Subtasks and worker sessions/i);
    assert.match(rootResponse.body, /Docker sandbox/i);

    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type"), /^text\/css/);
    assert.match(cssResponse.body, /transcript__message/);

    assert.equal(jsResponse.status, 200);
    assert.match(jsResponse.headers.get("content-type"), /^text\/javascript/);
    assert.match(jsResponse.body, /loadTaskDetail/);
  } finally {
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
});

test("formats project, task, agent health, and attachment UI messages", () => {
  assert.equal(
    buildProjectErrorMessage({
      code: "PROJECT_ALREADY_REGISTERED",
      details: { path: "/home/code/EAT" },
    }),
    "This repository is already registered at /home/code/EAT.",
  );

  assert.equal(
    buildProjectErrorMessage({
      code: "NOT_GIT_REPOSITORY",
    }),
    "The selected directory is not a non-bare git repository.",
  );

  assert.equal(buildCleanlinessLabel(true), "Dirty working tree");
  assert.equal(buildCleanlinessLabel(false), "Clean working tree");
  assert.deepEqual(buildBranchList([]), ["No recent local branches detected."]);
  assert.deepEqual(buildBranchList(["main", "feature/ui"]), ["main", "feature/ui"]);
  assert.equal(buildAgentStatusLabel({ available: true, checks: [] }), "Healthy");
  assert.equal(buildAgentStatusLabel({ available: false, checks: [] }), "Unavailable");
  assert.equal(buildAgentRuntimeModeLabel({ runtimeMode: "STUB" }, null), "Stub runtime");
  assert.equal(buildDockerHealthLabel({ available: true }), "Ready");
  assert.equal(buildDockerHealthLabel({ available: false, daemonReachable: false }), "Unavailable");
  assert.equal(buildTaskStatusLabel("CLARIFYING"), "Clarifying");
  assert.equal(buildTaskStatusLabel("PLAN_REVIEW"), "Plan review");
  assert.equal(buildTaskStatusLabel("EXECUTING"), "Executing");
  assert.equal(buildSubTaskStatusLabel("REVIEW_PENDING"), "Review pending");
  assert.equal(
    buildTaskErrorMessage({
      code: "ATTACHMENT_TYPE_UNSUPPORTED",
    }),
    "One or more attachments use an unsupported type.",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "TASK_NOT_PLAN_REVIEW",
    }),
    "This action is only available during plan review.",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "PLAN_SNAPSHOT_NOT_FOUND",
    }),
    "The selected plan snapshot no longer exists.",
  );
  assert.equal(
    buildAttachmentCaption({
      fileType: "DOCUMENT",
      mimeType: "text/markdown",
      size: 2048,
    }),
    "DOCUMENT · text/markdown · 2 KB",
  );
  assert.deepEqual(
    buildLeadSelectionState({
      agentName: "codex-cli",
      selectable: false,
      failureReason: { message: "Login required." },
    }),
    {
      disabled: true,
      message: "codex-cli is blocked: Login required.",
      tone: "error",
    },
  );
});

async function request(server, routePath) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

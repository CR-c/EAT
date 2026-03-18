import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createApp } from "../src/server/app.js";
import {
  buildAgentStatusLabel,
  buildBranchList,
  buildCleanlinessLabel,
  buildLeadSelectionState,
  buildProjectErrorMessage,
} from "../src/ui/view-model.js";

test("serves the Phase 02 agent registry UI shell and static assets", async () => {
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
    assert.match(rootResponse.body, /Agent Registry And Health Checks/);
    assert.match(rootResponse.body, /Lead agent selection/i);

    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type"), /^text\/css/);
    assert.match(cssResponse.body, /agent-card/);

    assert.equal(jsResponse.status, 200);
    assert.match(jsResponse.headers.get("content-type"), /^text\/javascript/);
    assert.match(jsResponse.body, /loadAgents/);
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

test("formats project, agent health, and lead gating UI messages", () => {
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

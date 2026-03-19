import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/server/app.js";

test("serves Docker health and sandbox policy from the system API", async () => {
  const server = createApp({
    repositoryOptions: {
      databasePath: ":memory:",
    },
    systemService: {
      async getDockerHealth() {
        return {
          ok: true,
          available: true,
          daemonReachable: true,
          defaultWorkerImage: "node:22-bookworm-slim",
        };
      },
      async getSandboxPolicy() {
        return {
          ok: true,
          policy: {
            defaultSandboxType: "DOCKER",
            defaultWorkerImage: "node:22-bookworm-slim",
          },
        };
      },
    },
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const dockerHealth = await requestJson(server, "/api/system/docker-health");
    const sandboxPolicy = await requestJson(server, "/api/system/sandbox-policy");

    assert.equal(dockerHealth.status, 200);
    assert.equal(dockerHealth.body.available, true);
    assert.equal(dockerHealth.body.defaultWorkerImage, "node:22-bookworm-slim");

    assert.equal(sandboxPolicy.status, 200);
    assert.equal(sandboxPolicy.body.policy.defaultSandboxType, "DOCKER");
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

async function requestJson(server, routePath) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

  return {
    body: await response.json(),
    status: response.status,
  };
}

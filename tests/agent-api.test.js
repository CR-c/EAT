import test from "node:test";
import assert from "node:assert/strict";

import { defineAgentAdapterFactory, SESSION_SANDBOX_TYPES } from "../src/agents/agent-contract.js";
import { AgentRegistry } from "../src/agents/agent-registry.js";
import { createApp } from "../src/server/app.js";
import { AgentService } from "../src/services/agent-service.js";
import { AGENT_HEALTH_FAILURE_CODES } from "../src/services/agent-runtime.js";

test("lists registered agents, roles, and capability metadata", async () => {
  const server = await startServer(createAgentService());

  try {
    const response = await requestJson(server, "/api/agents");

    assert.equal(response.status, 200);
    assert.equal(response.body.agents.length, 3);
    assert.deepEqual(
      response.body.agents.map((agent) => agent.name),
      ["healthy-lead", "healthy-worker", "unhealthy-lead"],
    );
    assert.deepEqual(
      response.body.leadCandidates.map((candidate) => candidate.agentName),
      ["healthy-lead", "unhealthy-lead"],
    );
    assert.deepEqual(
      response.body.workerCandidates.map((candidate) => candidate.agentName),
      ["healthy-worker", "unhealthy-lead"],
    );
    assert.deepEqual(
      response.body.agents[0].capabilities.supportedSandboxTypes,
      [SESSION_SANDBOX_TYPES.DOCKER],
    );
  } finally {
    await stopServer(server);
  }
});

test("returns normalized health snapshots and selectable candidate helpers", async () => {
  const server = await startServer(createAgentService());

  try {
    const response = await requestJson(server, "/api/agents/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.agents["healthy-lead"].available, true);
    assert.equal(response.body.agents["healthy-worker"].checks[0].status, "PASS");
    assert.equal(response.body.agents["unhealthy-lead"].available, false);
    assert.equal(
      response.body.agents["unhealthy-lead"].failureReason.code,
      AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING,
    );
    assert.equal(
      response.body.leadCandidates.find((candidate) => candidate.agentName === "healthy-lead").selectable,
      true,
    );
    assert.equal(
      response.body.leadCandidates.find((candidate) => candidate.agentName === "unhealthy-lead").selectable,
      false,
    );
    assert.equal(response.body.workerCandidates[0].selectable, true);
    assert.equal(response.body.ttlMs, 30_000);
  } finally {
    await stopServer(server);
  }
});

function createAgentService() {
  const registry = new AgentRegistry();

  registry.register(createAdapter({
    capabilities: {
      canOrchestrate: true,
      canExecute: false,
      description: "Healthy lead agent",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      supportsInteractiveInput: true,
      supportsVision: false,
    },
    healthCheck: async () => ({
      available: true,
      checks: [{ name: "binary", status: "PASS", message: "ready" }],
      version: "1.0.0",
    }),
    name: "healthy-lead",
  }));
  registry.register(createAdapter({
    capabilities: {
      canOrchestrate: false,
      canExecute: true,
      description: "Healthy worker agent",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
      supportsInteractiveInput: true,
      supportsVision: true,
    },
    healthCheck: async () => ({
      available: true,
      checks: [{ name: "binary", status: "PASS", message: "ready" }],
      version: "2.0.0",
    }),
    name: "healthy-worker",
  }));
  registry.register(createAdapter({
    capabilities: {
      canOrchestrate: true,
      canExecute: true,
      description: "Unavailable lead agent",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
      supportsInteractiveInput: true,
      supportsVision: true,
    },
    healthCheck: async () => ({
      available: false,
      reason: {
        code: AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING,
        message: "Login required.",
      },
    }),
    name: "unhealthy-lead",
  }));

  return new AgentService({
    agentRegistry: registry,
    cacheTtlMs: 30_000,
  });
}

function createAdapter(overrides) {
  return defineAgentAdapterFactory({
    capabilities: overrides.capabilities,
    healthCheck: overrides.healthCheck,
    name: overrides.name,
    async spawnSession() {
      return {
        async kill() {},
        onExit() {},
        onOutput() {},
        pid: null,
        async sendInput() {},
        sessionId: `session-${overrides.name}`,
        async stop() {},
      };
    },
  });
}

async function startServer(agentService) {
  const server = createApp({
    agentService,
    repositoryOptions: {
      databasePath: ":memory:",
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

async function requestJson(server, routePath) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

  return {
    body: await response.json(),
    status: response.status,
  };
}

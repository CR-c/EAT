import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_CONTRACT_ERROR_CODES,
  AgentContractError,
  SESSION_SANDBOX_TYPES,
  defineAgentAdapterFactory,
  defineAgentCapabilities,
} from "../src/agents/agent-contract.js";
import {
  AGENT_REGISTRY_ERROR_CODES,
  AgentRegistry,
  AgentRegistryError,
} from "../src/agents/agent-registry.js";

test("normalizes and freezes capability metadata", () => {
  const capabilities = defineAgentCapabilities({
    canOrchestrate: true,
    canExecute: true,
    supportsVision: false,
    supportsInteractiveInput: true,
    supportedSandboxTypes: [
      SESSION_SANDBOX_TYPES.DOCKER,
      SESSION_SANDBOX_TYPES.DOCKER,
      SESSION_SANDBOX_TYPES.HOST,
    ],
    description: "  Lead and worker adapter  ",
  });

  assert.deepEqual(capabilities, {
    canOrchestrate: true,
    canExecute: true,
    supportsVision: false,
    supportsInteractiveInput: true,
    supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER, SESSION_SANDBOX_TYPES.HOST],
    description: "Lead and worker adapter",
  });
  assert.throws(() => {
    capabilities.supportedSandboxTypes.push(SESSION_SANDBOX_TYPES.HOST);
  }, TypeError);
});

test("rejects invalid capability metadata", () => {
  assert.throws(() => {
    defineAgentCapabilities({
      canOrchestrate: "yes",
      canExecute: true,
      supportsVision: false,
      supportsInteractiveInput: true,
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      description: "invalid",
    });
  }, (error) => {
    assert.ok(error instanceof AgentContractError);
    assert.equal(error.code, AGENT_CONTRACT_ERROR_CODES.INVALID_CAPABILITIES);
    return true;
  });

  assert.throws(() => {
    defineAgentCapabilities({
      canOrchestrate: true,
      canExecute: true,
      supportsVision: false,
      supportsInteractiveInput: true,
      supportedSandboxTypes: ["VM"],
      description: "invalid sandbox",
    });
  }, (error) => {
    assert.ok(error instanceof AgentContractError);
    assert.equal(error.code, AGENT_CONTRACT_ERROR_CODES.INVALID_SANDBOX_TYPE);
    return true;
  });
});

test("registers, looks up, filters, and unregisters agent adapters", () => {
  const registry = new AgentRegistry();
  const leadOnly = createAdapter({
    capabilities: {
      canOrchestrate: true,
      canExecute: false,
      supportsVision: false,
      supportsInteractiveInput: true,
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
      description: "Lead-only adapter",
    },
    name: "lead-only",
  });
  const workerOnly = createAdapter({
    capabilities: {
      canOrchestrate: false,
      canExecute: true,
      supportsVision: true,
      supportsInteractiveInput: false,
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      description: "Worker-only adapter",
    },
    name: "worker-only",
  });
  const dualRole = createAdapter({
    capabilities: {
      canOrchestrate: true,
      canExecute: true,
      supportsVision: true,
      supportsInteractiveInput: true,
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
      description: "Dual-role adapter",
    },
    name: "dual-role",
  });

  registry.register(leadOnly);
  registry.register(workerOnly);
  registry.register(dualRole);

  assert.equal(registry.get("lead-only")?.name, "lead-only");
  assert.equal(registry.get("missing"), null);
  assert.deepEqual(
    registry.listAll().map((factory) => factory.name),
    ["lead-only", "worker-only", "dual-role"],
  );
  assert.deepEqual(
    registry.listLeadCandidates().map((factory) => factory.name),
    ["lead-only", "dual-role"],
  );
  assert.deepEqual(
    registry.listWorkerCandidates().map((factory) => factory.name),
    ["worker-only", "dual-role"],
  );

  registry.unregister("worker-only");

  assert.equal(registry.get("worker-only"), null);
  assert.deepEqual(
    registry.listAll().map((factory) => factory.name),
    ["lead-only", "dual-role"],
  );
});

test("rejects duplicate registrations and invalid lookup names", () => {
  const registry = new AgentRegistry();
  const adapter = createAdapter({ name: "codex-cli" });

  registry.register(adapter);

  assert.throws(() => {
    registry.register(adapter);
  }, (error) => {
    assert.ok(error instanceof AgentRegistryError);
    assert.equal(error.code, AGENT_REGISTRY_ERROR_CODES.AGENT_ALREADY_REGISTERED);
    return true;
  });

  assert.throws(() => registry.get(""), (error) => {
    assert.ok(error instanceof AgentRegistryError);
    assert.equal(error.code, AGENT_REGISTRY_ERROR_CODES.INVALID_AGENT_NAME);
    return true;
  });
});

function createAdapter(overrides = {}) {
  return defineAgentAdapterFactory({
    name: overrides.name ?? "adapter",
    capabilities: overrides.capabilities ?? {
      canOrchestrate: true,
      canExecute: true,
      supportsVision: false,
      supportsInteractiveInput: true,
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
      description: "Adapter",
    },
    async healthCheck() {
      return { available: true };
    },
    async spawnSession() {
      return {
        sessionId: "session-1",
        pid: null,
        containerId: null,
        async sendInput() {},
        async stop() {},
        async kill() {},
        onOutput() {},
        onExit() {},
      };
    },
  });
}

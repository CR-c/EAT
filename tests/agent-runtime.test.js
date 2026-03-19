import test from "node:test";
import assert from "node:assert/strict";

import { AgentRegistry } from "../src/agents/agent-registry.js";
import {
  AGENT_HEALTH_FAILURE_CODES,
  normalizeAgentHealthSnapshot,
  normalizeHealthFailureReason,
  runAgentHealthCheck,
} from "../src/services/agent-runtime.js";

test("normalizes documented health failure reasons into stable structured codes", () => {
  const binaryMissing = normalizeHealthFailureReason("codex binary missing from PATH");
  const authMissing = normalizeHealthFailureReason("authentication missing: login required");
  const unsupportedSandbox = normalizeHealthFailureReason("unsupported sandbox: DOCKER");
  const unsupportedCapability = normalizeHealthFailureReason("vision not supported by this adapter");

  assert.equal(binaryMissing.code, AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING);
  assert.equal(binaryMissing.category, "DEPENDENCY");
  assert.equal(authMissing.code, AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING);
  assert.equal(authMissing.category, "AUTH");
  assert.equal(unsupportedSandbox.code, AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_SANDBOX);
  assert.equal(unsupportedSandbox.category, "CONFIGURATION");
  assert.equal(unsupportedCapability.code, AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_CAPABILITY);
  assert.equal(unsupportedCapability.category, "CAPABILITY");
});

test("preserves structured checks and failure details in normalized health snapshots", () => {
  const adapter = createAdapter({
    name: "codex-cli",
  });

  const snapshot = normalizeAgentHealthSnapshot(
    adapter,
    {
      available: false,
      checks: [
        {
          details: { binary: "codex" },
          message: "Binary lookup failed.",
          name: "binary",
          status: "FAIL",
        },
      ],
      reason: {
        code: AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING,
        details: {
          binary: "codex",
        },
        message: "Codex CLI is not installed.",
      },
      version: "1.2.3",
    },
    {
      checkedAt: "2026-03-18T08:00:00.000Z",
    },
  );

  assert.deepEqual(snapshot, {
    agentName: "codex-cli",
    available: false,
    capabilities: adapter.capabilities,
    checkedAt: "2026-03-18T08:00:00.000Z",
    checks: [
      {
        details: { binary: "codex" },
        message: "Binary lookup failed.",
        name: "binary",
        status: "FAIL",
      },
    ],
    failureReason: {
      category: "DEPENDENCY",
      code: AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING,
      details: { binary: "codex" },
      message: "Codex CLI is not installed.",
    },
    runtimeMode: null,
    usesSandboxManager: false,
    version: "1.2.3",
  });
});

test("converts thrown health check errors into structured failure snapshots", async () => {
  const adapter = createAdapter({
    healthCheck: async () => {
      throw Object.assign(new Error("login required before running health check"), {
        code: "AUTH_ERROR",
      });
    },
    name: "claude-cli",
  });

  const snapshot = await runAgentHealthCheck(adapter, {
    checkedAt: "2026-03-18T08:05:00.000Z",
  });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.failureReason.code, AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING);
  assert.equal(snapshot.failureReason.category, "AUTH");
  assert.equal(snapshot.checkedAt, "2026-03-18T08:05:00.000Z");
  assert.equal(snapshot.checks.length, 1);
  assert.equal(snapshot.checks[0].status, "FAIL");
  assert.equal(snapshot.version, null);
});

test("runs structured health checks across the registry without mutating adapter metadata", async () => {
  const registry = new AgentRegistry();
  const healthyAdapter = createAdapter({
    healthCheck: async () => ({
      available: true,
      checks: [
        {
          message: "Binary and auth checks passed.",
          name: "bootstrap",
          status: "PASS",
        },
      ],
      version: "2.0.0",
    }),
    name: "healthy-agent",
  });
  const failingAdapter = createAdapter({
    capabilities: {
      canExecute: false,
      canOrchestrate: true,
      description: "Lead-only adapter",
      supportedSandboxTypes: ["HOST"],
      supportsInteractiveInput: true,
      supportsVision: false,
    },
    healthCheck: async () => ({
      available: false,
      reason: "unsupported sandbox: DOCKER",
    }),
    name: "host-only-agent",
  });

  registry.register(healthyAdapter);
  registry.register(failingAdapter);

  const snapshots = await registry.healthCheckAll({
    checkedAt: "2026-03-18T09:00:00.000Z",
  });

  assert.deepEqual(Object.keys(snapshots), ["healthy-agent", "host-only-agent"]);
  assert.equal(snapshots["healthy-agent"].available, true);
  assert.equal(snapshots["healthy-agent"].checks[0].status, "PASS");
  assert.equal(snapshots["healthy-agent"].capabilities.supportedSandboxTypes[0], "DOCKER");
  assert.equal(snapshots["host-only-agent"].available, false);
  assert.equal(
    snapshots["host-only-agent"].failureReason.code,
    AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_SANDBOX,
  );
  assert.equal(snapshots["host-only-agent"].checks[0].name, "availability");
  assert.equal(snapshots["host-only-agent"].checkedAt, "2026-03-18T09:00:00.000Z");
});

function createAdapter(overrides = {}) {
  return {
    capabilities: {
      canExecute: true,
      canOrchestrate: true,
      description: "Test adapter",
      supportedSandboxTypes: ["DOCKER"],
      supportsInteractiveInput: true,
      supportsVision: false,
      ...overrides.capabilities,
    },
    healthCheck: overrides.healthCheck ?? (async () => ({ available: true, version: "1.0.0" })),
    name: overrides.name ?? "test-adapter",
    spawnSession: overrides.spawnSession ?? (async () => ({
      kill: async () => {},
      onExit: () => {},
      onOutput: () => {},
      pid: null,
      sendInput: async () => {},
      sessionId: "session-test",
      stop: async () => {},
    })),
  };
}

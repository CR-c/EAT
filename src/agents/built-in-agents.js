import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

import { defineAgentAdapterFactory, SESSION_SANDBOX_TYPES } from "./agent-contract.js";
import { AgentRegistry } from "./agent-registry.js";
import { AGENT_HEALTH_FAILURE_CODES } from "../services/agent-runtime.js";

const execFileAsync = promisify(execFile);
const BUILT_IN_RUNTIME_MODE = "STUB";

export function createBuiltInAgentRegistry({ registerDefaults = true, sandboxManager = null } = {}) {
  const registry = new AgentRegistry();

  if (registerDefaults) {
    for (const adapter of createBuiltInAgentAdapters({ sandboxManager })) {
      registry.register(adapter);
    }
  }

  return registry;
}

export function createBuiltInAgentAdapters({ sandboxManager = null } = {}) {
  return [
    createBinaryBackedAdapter({
      binaryName: "claude",
      capabilities: {
        canOrchestrate: true,
        canExecute: true,
        description: "Anthropic Claude CLI for lead orchestration and worker execution.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
        supportsInteractiveInput: true,
        supportsVision: true,
      },
      name: "claude-cli",
      sandboxManager,
    }),
    createBinaryBackedAdapter({
      binaryName: "codex",
      capabilities: {
        canOrchestrate: true,
        canExecute: true,
        description: "OpenAI Codex CLI for lead planning and Docker-backed worker execution.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
        supportsInteractiveInput: true,
        supportsVision: false,
      },
      name: "codex-cli",
      sandboxManager,
    }),
    createBinaryBackedAdapter({
      binaryName: "gemini",
      capabilities: {
        canOrchestrate: false,
        canExecute: true,
        description: "Google Gemini CLI as a host-only worker option for execution tasks.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
        supportsInteractiveInput: true,
        supportsVision: true,
      },
      name: "gemini-cli",
      sandboxManager,
    }),
  ];
}

function createBinaryBackedAdapter({ binaryName, capabilities, name, sandboxManager }) {
  return defineAgentAdapterFactory({
    capabilities,
    async healthCheck() {
      if (BUILT_IN_RUNTIME_MODE === "STUB") {
        return {
          available: true,
          checks: [
            {
              details: null,
              message: "Built-in adapter runs in explicit stub mode until a documented real CLI runtime is wired in.",
              name: "runtime",
              status: "WARN",
            },
            {
              details: { binary: binaryName },
              message: "Binary and auth checks are skipped because this adapter is running in stub mode.",
              name: "binary",
              status: "SKIP",
            },
          ],
          version: `${name}@stub`,
        };
      }

      try {
        const { stderr, stdout } = await execFileAsync(binaryName, ["--version"], {
          encoding: "utf8",
          timeout: 4000,
        });

        const version = extractVersion(stdout) ?? extractVersion(stderr);

        return {
          available: true,
          checks: [
            {
              details: { binary: binaryName },
              message: `${binaryName} binary is available.`,
              name: "binary",
              status: "PASS",
            },
            {
              details: null,
              message: "Authentication cannot be verified until task/session flows land in Phase 04.",
              name: "auth",
              status: "SKIP",
            },
          ],
          version,
        };
      } catch (error) {
        if (error?.code === "ENOENT") {
          return {
            available: false,
            checks: [
              {
                details: { binary: binaryName },
                message: `${binaryName} is not installed or not available on PATH.`,
                name: "binary",
                status: "FAIL",
              },
            ],
            reason: {
              code: AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING,
              details: { binary: binaryName },
              message: `${binaryName} is not installed or not available on PATH.`,
            },
          };
        }

        return {
          available: false,
          checks: [
            {
              details: {
                binary: binaryName,
                exitCode: typeof error?.code === "number" ? error.code : null,
              },
              message: error?.stderr?.trim() || error?.message || `Unable to run ${binaryName} --version.`,
              name: "binary",
              status: "FAIL",
            },
          ],
          reason: {
            code: AGENT_HEALTH_FAILURE_CODES.HEALTH_CHECK_FAILED,
            details: { binary: binaryName },
            message: error?.stderr?.trim() || error?.message || `Unable to run ${binaryName} --version.`,
          },
        };
      }
    },
    name,
    runtimeMode: BUILT_IN_RUNTIME_MODE,
    usesSandboxManager: true,
    async spawnSession(config) {
      if (config?.sandbox?.type === SESSION_SANDBOX_TYPES.DOCKER && sandboxManager) {
        return sandboxManager.spawnContainerSession({
          command: buildStubDockerCommand(name, config.sessionType),
          sandbox: config.sandbox,
          sessionLabel: `${name}-${String(config.sessionType ?? "session").toLowerCase()}`,
        });
      }

      return createScriptedLeadSession({
        adapterName: name,
        prompt: config?.prompt,
        sessionType: config?.sessionType,
      });
    },
  });
}

function extractVersion(output) {
  if (typeof output !== "string") {
    return null;
  }

  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.split(/\r?\n/u)[0];
}

function buildStubDockerCommand(adapterName, sessionType) {
  const kind = String(sessionType ?? "SESSION").toLowerCase();

  return [
    "sh",
    "-lc",
    [
      `printf '%s\n' '${adapterName} ${kind} started inside the Docker sandbox.'`,
      "printf '%s\n' 'This built-in adapter is running in explicit stub mode.'",
      "printf '%s\n' 'No real provider CLI was invoked by EAT for this session.'",
    ].join(" && "),
  ];
}

function createScriptedLeadSession({ adapterName, prompt, sessionType }) {
  const sessionId = `session_${randomUUID()}`;
  const outputListeners = new Set();
  const exitListeners = new Set();
  let closed = false;

  setTimeout(() => {
    if (sessionType === "WORKER") {
      emitOutput(
        `${adapterName} worker stub session started.\nThis built-in adapter is running in explicit stub mode.\n`,
      );
      close(0);
      return;
    }

    if (looksLikeIncrementalReviewPrompt(prompt)) {
      emitOutput(JSON.stringify({
        decision: "ACCEPTED",
        summary: `${adapterName} stub incremental review accepted the worker run.`,
      }));
      close(0);
      return;
    }

    emitOutput(
      `${adapterName} lead stub session started.\nThis built-in adapter is running in explicit stub mode.\nPlease confirm the success criteria, constraints, and any must-keep files before planning.\n`,
    );
  }, 0);

  return {
    containerId: null,
    sessionId,
    pid: null,
    async kill() {
      close(1);
    },
    onExit(callback) {
      exitListeners.add(callback);
    },
    onOutput(callback) {
      outputListeners.add(callback);
    },
    async sendInput(message) {
      if (closed) {
        throw new Error("Lead session is no longer running.");
      }

      const normalizedMessage = typeof message === "string" ? message.trim() : "";

      if (normalizedMessage.toLowerCase().includes("phase 05")) {
        emitOutput("Requirements confirmed. Planning will continue through the stub lead adapter.\n");
        return;
      }

      emitOutput(`Noted in stub mode: ${normalizedMessage}\nWhat else should remain in scope for this task?\n`);
    },
    async stop() {
      close(0);
    },
  };

  function emitOutput(chunk) {
    if (closed) {
      return;
    }

    for (const listener of outputListeners) {
      listener(chunk);
    }
  }

  function close(exitCode) {
    if (closed) {
      return;
    }

    closed = true;

    for (const listener of exitListeners) {
      listener(exitCode);
    }
  }
}

function looksLikeIncrementalReviewPrompt(prompt) {
  return typeof prompt === "string" && prompt.includes("incremental advisory review");
}

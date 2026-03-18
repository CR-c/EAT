import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { defineAgentAdapterFactory, SESSION_SANDBOX_TYPES } from "./agent-contract.js";
import { AgentRegistry } from "./agent-registry.js";
import { AGENT_HEALTH_FAILURE_CODES } from "../services/agent-runtime.js";

const execFileAsync = promisify(execFile);

export function createBuiltInAgentRegistry({ registerDefaults = true } = {}) {
  const registry = new AgentRegistry();

  if (registerDefaults) {
    for (const adapter of createBuiltInAgentAdapters()) {
      registry.register(adapter);
    }
  }

  return registry;
}

export function createBuiltInAgentAdapters() {
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
    }),
    createBinaryBackedAdapter({
      binaryName: "codex",
      capabilities: {
        canOrchestrate: true,
        canExecute: true,
        description: "OpenAI Codex CLI for lead planning and Docker-backed worker execution.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.DOCKER],
        supportsInteractiveInput: true,
        supportsVision: false,
      },
      name: "codex-cli",
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
    }),
  ];
}

function createBinaryBackedAdapter({ binaryName, capabilities, name }) {
  return defineAgentAdapterFactory({
    capabilities,
    async healthCheck() {
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
    async spawnSession() {
      throw new Error(`spawnSession() for "${name}" is not implemented until later phases.`);
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

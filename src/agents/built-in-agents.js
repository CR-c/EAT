import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { defineAgentAdapterFactory, SESSION_SANDBOX_TYPES } from "./agent-contract.js";
import { AgentRegistry } from "./agent-registry.js";
import { AGENT_HEALTH_FAILURE_CODES } from "../services/agent-runtime.js";
import { SANDBOX_NETWORK_PROFILES } from "../services/sandbox-manager.js";

const execFileAsync = promisify(execFile);

const REAL_RUNTIME_MODE = "REAL";
const STUB_RUNTIME_MODE = "STUB";

const DEFAULT_CODEX_BINARY = process.env.EAT_CODEX_BINARY ?? "codex";
const DEFAULT_CODEX_PACKAGE_PATH = process.env.EAT_CODEX_PACKAGE_PATH ?? "/usr/local/lib/node_modules/@openai/codex";
const DEFAULT_CODEX_CONFIG_PATH = process.env.EAT_CODEX_CONFIG_PATH ?? path.join(os.homedir(), ".codex", "config.toml");
const DEFAULT_CODEX_AUTH_PATH = process.env.EAT_CODEX_AUTH_PATH ?? path.join(os.homedir(), ".codex", "auth.json");
const DEFAULT_CODEX_RUNTIME_ROOT = process.env.EAT_CODEX_RUNTIME_ROOT ?? path.join(os.tmpdir(), ".eat-codex-runtime");

export function createBuiltInAgentRegistry(options = {}) {
  const registry = new AgentRegistry();

  if (options.registerDefaults !== false) {
    for (const adapter of createBuiltInAgentAdapters(options)) {
      registry.register(adapter);
    }
  }

  return registry;
}

export function createBuiltInAgentAdapters(options = {}) {
  const sharedOptions = {
    codexAuthPath: options.codexAuthPath ?? DEFAULT_CODEX_AUTH_PATH,
    codexBinaryName: options.codexBinaryName ?? DEFAULT_CODEX_BINARY,
    codexConfigPath: options.codexConfigPath ?? DEFAULT_CODEX_CONFIG_PATH,
    codexModel: normalizeNonEmptyString(options.codexModel ?? process.env.EAT_CODEX_MODEL),
    codexPackagePath: options.codexPackagePath ?? DEFAULT_CODEX_PACKAGE_PATH,
    execFileImpl: options.execFileImpl ?? execFileAsync,
    mkdtempImpl: options.mkdtempImpl ?? mkdtemp,
    mkdirImpl: options.mkdirImpl ?? mkdir,
    readFileImpl: options.readFileImpl ?? readFile,
    rmImpl: options.rmImpl ?? rm,
    runtimeHomeRootPath: options.runtimeHomeRootPath ?? DEFAULT_CODEX_RUNTIME_ROOT,
    sandboxManager: options.sandboxManager ?? null,
    spawnProcess: options.spawnProcess ?? spawn,
    writeFileImpl: options.writeFileImpl ?? writeFile,
  };

  return [
    createStubCliAdapter({
      capabilities: {
        canOrchestrate: true,
        canExecute: true,
        description: "Anthropic Claude CLI placeholder adapter until a documented real runtime is wired in.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
        supportsInteractiveInput: true,
        supportsVision: true,
      },
      name: "claude-cli",
      sandboxManager: sharedOptions.sandboxManager,
    }),
    createCodexCliAdapter(sharedOptions),
    createStubCliAdapter({
      capabilities: {
        canOrchestrate: false,
        canExecute: true,
        description: "Google Gemini CLI placeholder adapter until a documented real runtime is wired in.",
        supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST],
        supportsInteractiveInput: true,
        supportsVision: true,
      },
      name: "gemini-cli",
      sandboxManager: sharedOptions.sandboxManager,
    }),
  ];
}

function createCodexCliAdapter(options) {
  const codexBinaryName = options.codexBinaryName;

  return defineAgentAdapterFactory({
    capabilities: {
      canOrchestrate: true,
      canExecute: true,
      description: "OpenAI Codex CLI for host-side lead flows and Docker-sandboxed worker execution.",
      supportedSandboxTypes: [SESSION_SANDBOX_TYPES.HOST, SESSION_SANDBOX_TYPES.DOCKER],
      supportsInteractiveInput: true,
      supportsVision: false,
    },
    async healthCheck() {
      const checks = [];
      let version = null;

      try {
        const versionResult = await options.execFileImpl(codexBinaryName, ["--version"], {
          encoding: "utf8",
          timeout: 4_000,
        });
        version = extractVersion(versionResult.stdout) ?? extractVersion(versionResult.stderr);
        checks.push({
          details: { binary: codexBinaryName },
          message: `${codexBinaryName} binary is available.`,
          name: "binary",
          status: "PASS",
        });
      } catch (error) {
        return unavailableAgentResult(
          AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING,
          `${codexBinaryName} is not installed or not available on PATH.`,
          {
            binary: codexBinaryName,
          },
          {
            details: { binary: codexBinaryName },
            message: `${codexBinaryName} is not installed or not available on PATH.`,
            name: "binary",
          },
        );
      }

      try {
        const loginStatus = await options.execFileImpl(codexBinaryName, ["login", "status"], {
          encoding: "utf8",
          timeout: 4_000,
        });
        const message = normalizeNonEmptyString(loginStatus.stdout) ?? "Codex authentication is configured.";
        checks.push({
          details: null,
          message,
          name: "auth",
          status: "PASS",
        });
      } catch (error) {
        const message = normalizeCommandFailureMessage(error) ?? "Codex authentication is missing or expired.";
        return unavailableAgentResult(
          AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING,
          message,
          {
            binary: codexBinaryName,
          },
          {
            details: { binary: codexBinaryName },
            message,
            name: "auth",
          },
        );
      }

      if (options.sandboxManager) {
        const dockerHealth = await options.sandboxManager.getDockerHealth().catch(() => null);

        if (dockerHealth?.available) {
          checks.push({
            details: {
              image: dockerHealth.defaultWorkerImage,
              networkProfile: dockerHealth.networkProfile,
            },
            message: "Docker worker sandbox is available for Codex worker sessions.",
            name: "worker-sandbox",
            status: "PASS",
          });
        } else {
          checks.push({
            details: {
              image: dockerHealth?.defaultWorkerImage ?? null,
              reasonCode: dockerHealth?.reasonCode ?? null,
            },
            message: dockerHealth?.reason ?? "Docker worker sandbox is unavailable, so worker launches will fail.",
            name: "worker-sandbox",
            status: "WARN",
          });
        }
      }

      return {
        available: true,
        checks,
        version,
      };
    },
    name: "codex-cli",
    runtimeMode: REAL_RUNTIME_MODE,
    usesSandboxManager: options.sandboxManager !== null,
    async spawnSession(config) {
      if (config?.sessionType === "WORKER") {
        return createCodexWorkerRuntime(config, options);
      }

      if (looksLikeReviewPrompt(config?.prompt)) {
        return createCodexOneShotRuntime(config, options);
      }

      return createCodexInteractiveLeadRuntime(config, options);
    },
  });
}

function createStubCliAdapter({ capabilities, name, sandboxManager }) {
  return defineAgentAdapterFactory({
    capabilities,
    async healthCheck() {
      return {
        available: true,
        checks: [
          {
            details: null,
            message: "This built-in adapter is still running in explicit stub mode.",
            name: "runtime",
            status: "WARN",
          },
          {
            details: null,
            message: "Binary and auth checks are skipped until a real runtime is implemented.",
            name: "binary",
            status: "SKIP",
          },
        ],
        version: `${name}@stub`,
      };
    },
    name,
    runtimeMode: STUB_RUNTIME_MODE,
    usesSandboxManager: sandboxManager !== null,
    async spawnSession(config) {
      if (config?.sandbox?.type === SESSION_SANDBOX_TYPES.DOCKER && sandboxManager) {
        return sandboxManager.spawnContainerSession({
          command: buildStubDockerCommand(name, config.sessionType),
          sandbox: {
            attachments: config.attachments,
            worktreePath: config.workDir,
          },
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

function createCodexInteractiveLeadRuntime(config, options) {
  const runtime = createBufferedRuntimeController();
  const sessionId = `codex_lead_${randomUUID()}`;
  const transcript = [];
  const initialPrompt = normalizeNonEmptyString(config?.prompt) ?? "Continue the EAT lead session.";
  let activeChild = null;
  let closed = false;
  let queuedTurn = Promise.resolve();

  const runTurn = async (nextMessage) => {
    if (closed) {
      throw new Error("Lead session is no longer running.");
    }

    const turnPrompt = buildCodexLeadTurnPrompt({
      attachments: config?.attachments,
      branchName: config?.branchName,
      initialPrompt,
      nextMessage,
      transcript,
      workDir: config?.workDir,
    });
    const result = await runCodexHostExec(
      turnPrompt,
      {
        codexBinaryName: options.codexBinaryName,
        codexModel: options.codexModel,
        sandboxMode: "read-only",
        spawnProcess: options.spawnProcess,
        workDir: config?.workDir,
      },
      (childProcess) => {
        activeChild = childProcess;
      },
    );

    if (nextMessage) {
      transcript.push(nextMessage);
    }

    if (result.output) {
      transcript.push({
        content: result.output,
        role: "ASSISTANT",
      });
      runtime.emitOutput(result.output);
    }
  };

  const enqueueTurn = (nextMessage) => {
    queuedTurn = queuedTurn
      .then(() => runTurn(nextMessage))
      .catch((error) => {
        runtime.failAndClose(error);
        throw error;
      })
      .finally(() => {
        activeChild = null;
      });

    return queuedTurn;
  };

  setTimeout(() => {
    void enqueueTurn(null);
  }, 0);

  return {
    containerId: null,
    pid: null,
    sessionId,
    async kill() {
      if (closed) {
        return;
      }

      closed = true;
      activeChild?.kill?.("SIGKILL");
      runtime.close(1);
    },
    onExit(callback) {
      runtime.onExit(callback);
    },
    onOutput(callback) {
      runtime.onOutput(callback);
    },
    async sendInput(message) {
      const normalizedMessage = normalizeRequiredString(message);

      if (!normalizedMessage) {
        throw new Error("Lead message content is required.");
      }

      const role = looksLikeSystemLeadInstruction(normalizedMessage) ? "SYSTEM" : "USER";
      await enqueueTurn({
        content: normalizedMessage,
        role,
      });
    },
    async stop() {
      if (closed) {
        return;
      }

      closed = true;
      activeChild?.kill?.("SIGTERM");
      runtime.close(0);
    },
  };
}

function createCodexOneShotRuntime(config, options) {
  const runtime = createBufferedRuntimeController();
  const sessionId = `codex_exec_${randomUUID()}`;
  let activeChild = null;
  let closed = false;

  setTimeout(() => {
    void runCodexHostExec(
      buildCodexStandalonePrompt(config),
      {
        codexBinaryName: options.codexBinaryName,
        codexModel: options.codexModel,
        sandboxMode: "read-only",
        spawnProcess: options.spawnProcess,
        workDir: config?.workDir,
      },
      (childProcess) => {
        activeChild = childProcess;
      },
    )
      .then((result) => {
        if (closed) {
          return;
        }

        if (result.output) {
          runtime.emitOutput(result.output);
        }

        closed = true;
        runtime.close(0);
      })
      .catch((error) => {
        if (closed) {
          return;
        }

        closed = true;
        runtime.failAndClose(error);
      })
      .finally(() => {
        activeChild = null;
      });
  }, 0);

  return {
    containerId: null,
    pid: null,
    sessionId,
    async kill() {
      if (closed) {
        return;
      }

      closed = true;
      activeChild?.kill?.("SIGKILL");
      runtime.close(1);
    },
    onExit(callback) {
      runtime.onExit(callback);
    },
    onOutput(callback) {
      runtime.onOutput(callback);
    },
    async sendInput() {
      throw new Error("One-shot Codex sessions do not accept follow-up input.");
    },
    async stop() {
      if (closed) {
        return;
      }

      closed = true;
      activeChild?.kill?.("SIGTERM");
      runtime.close(0);
    },
  };
}

async function createCodexWorkerRuntime(config, options) {
  if (!options.sandboxManager) {
    throw new Error("Docker sandbox manager is required for Codex worker sessions.");
  }

  const runtimeHome = await prepareDockerCodexRuntimeHome(options);
  const gitRootPath = await resolveWorktreeGitRoot(config?.workDir, options.readFileImpl);
  const networkProfile = runtimeHome.usesHostNetwork
    ? SANDBOX_NETWORK_PROFILES.HOST
    : SANDBOX_NETWORK_PROFILES.DEFAULT;

  try {
    const dockerRuntime = await options.sandboxManager.spawnContainerSession({
      command: [
        "node",
        path.join(options.codexPackagePath, "bin", "codex.js"),
        ...buildCodexExecArgs({
          approvalPolicy: null,
          bypassApprovalsAndSandbox: true,
          codexModel: options.codexModel,
          prompt: buildCodexStandalonePrompt(config),
          sandboxMode: null,
          workDir: config?.workDir,
        }),
      ],
      env: {
        CODEX_HOME: path.join(runtimeHome.runtimeHomePath, ".codex"),
        HOME: runtimeHome.runtimeHomePath,
      },
      sandbox: {
        allowedExtraReadonlyRoots: [
          options.codexPackagePath,
          "/etc/ssl/certs",
        ],
        allowedExtraReadwriteRoots: [
          gitRootPath,
          options.runtimeHomeRootPath,
        ],
        attachments: config?.attachments,
        containerUser: resolveContainerUser(),
        extraReadonlyMounts: [
          options.codexPackagePath,
          "/etc/ssl/certs",
        ],
        extraReadwriteMounts: [
          gitRootPath,
          runtimeHome.runtimeHomePath,
        ],
        networkProfile,
        worktreePath: config?.workDir,
      },
      sessionLabel: `codex-worker-${randomUUID()}`,
    });

    return wrapCodexJsonRuntime(dockerRuntime, {
      cleanup: async () => {
        await options.rmImpl(runtimeHome.runtimeHomePath, { force: true, recursive: true }).catch(() => null);
      },
    });
  } catch (error) {
    await options.rmImpl(runtimeHome.runtimeHomePath, { force: true, recursive: true }).catch(() => null);
    throw error;
  }
}

async function runCodexHostExec(prompt, options, onChildProcess) {
  return new Promise((resolve, reject) => {
    const child = options.spawnProcess(
      options.codexBinaryName,
      buildCodexExecArgs({
        approvalPolicy: "never",
        bypassApprovalsAndSandbox: false,
        codexModel: options.codexModel,
        prompt,
        sandboxMode: options.sandboxMode,
        workDir: options.workDir,
      }),
      {
        cwd: options.workDir ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    onChildProcess?.(child);

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderrBuffer += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(
          normalizeNonEmptyString(stderrBuffer)
          ?? normalizeNonEmptyString(stdoutBuffer)
          ?? `Codex CLI exited with code ${exitCode}.`,
        ));
        return;
      }

      const parsedOutput = extractCodexJsonOutput(stdoutBuffer);

      resolve({
        output: parsedOutput,
      });
    });
  });
}

async function prepareDockerCodexRuntimeHome(options) {
  const authPayload = await options.readFileImpl(options.codexAuthPath, "utf8").catch(() => null);

  if (!authPayload) {
    throw new Error(`Codex auth file is missing at ${options.codexAuthPath}.`);
  }

  await access(path.join(options.codexPackagePath, "bin", "codex.js"));
  await options.mkdirImpl(options.runtimeHomeRootPath, { recursive: true });

  const runtimeHomePath = await options.mkdtempImpl(path.join(options.runtimeHomeRootPath, "session-"));
  const codexHomePath = path.join(runtimeHomePath, ".codex");
  await options.mkdirImpl(codexHomePath, { recursive: true });

  const hostConfig = await options.readFileImpl(options.codexConfigPath, "utf8").catch(() => null);
  const normalizedConfig = buildDockerCodexConfig(hostConfig, {
    codexModel: options.codexModel,
  });

  await options.writeFileImpl(path.join(codexHomePath, "auth.json"), authPayload, { encoding: "utf8", mode: 0o600 });
  await options.writeFileImpl(path.join(codexHomePath, "config.toml"), normalizedConfig.text, { encoding: "utf8", mode: 0o600 });

  return {
    runtimeHomePath,
    usesHostNetwork: normalizedConfig.usesHostNetwork,
  };
}

async function resolveWorktreeGitRoot(worktreePath, readFileImpl) {
  const normalizedWorktreePath = normalizeRequiredString(worktreePath);

  if (!normalizedWorktreePath) {
    throw new Error("Worktree path is required for Codex worker sessions.");
  }

  const gitFilePath = path.join(normalizedWorktreePath, ".git");
  const gitFileContent = await readFileImpl(gitFilePath, "utf8").catch(() => null);

  if (!gitFileContent) {
    throw new Error(`Unable to resolve Git metadata for worktree ${normalizedWorktreePath}.`);
  }

  const gitDirMatch = gitFileContent.match(/^gitdir:\s*(.+)\s*$/imu);

  if (!gitDirMatch?.[1]) {
    throw new Error(`Worktree ${normalizedWorktreePath} does not expose a valid gitdir reference.`);
  }

  const gitDirPath = path.resolve(normalizedWorktreePath, gitDirMatch[1].trim());
  const commonDirContent = await readFileImpl(path.join(gitDirPath, "commondir"), "utf8").catch(() => null);

  if (commonDirContent) {
    return path.resolve(gitDirPath, commonDirContent.trim());
  }

  return gitDirPath;
}

function buildDockerCodexConfig(configText, options) {
  let nextText = normalizeNonEmptyString(configText) ?? "";

  nextText = nextText
    .replaceAll("http:/localhost", "http://127.0.0.1")
    .replaceAll("http://localhost", "http://127.0.0.1")
    .replaceAll("https://localhost", "https://127.0.0.1")
    .replaceAll("http:/127.0.0.1", "http://127.0.0.1");

  if (!/\bdisable_response_storage\s*=/u.test(nextText)) {
    nextText = `${nextText}\ndisable_response_storage = true\n`.trim();
  }

  if (options.codexModel && !/\bmodel\s*=/u.test(nextText)) {
    nextText = `${nextText}\nmodel = ${JSON.stringify(options.codexModel)}\n`.trim();
  }

  return {
    text: `${nextText}\n`,
    usesHostNetwork: /base_url\s*=\s*"https?:\/\/127\.0\.0\.1/u.test(nextText),
  };
}

function buildCodexExecArgs({
  approvalPolicy,
  bypassApprovalsAndSandbox,
  codexModel,
  prompt,
  sandboxMode,
  workDir,
}) {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "--json",
  ];

  if (approvalPolicy) {
    args.push("-a", approvalPolicy);
  }

  if (sandboxMode) {
    args.push("-s", sandboxMode);
  }

  if (bypassApprovalsAndSandbox) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }

  if (workDir) {
    args.push("-C", workDir);
  }

  if (codexModel) {
    args.push("-m", codexModel);
  }

  args.push(prompt ?? "");
  return args;
}

function buildCodexStandalonePrompt(config) {
  const attachmentSection = buildAttachmentPromptSection(config?.attachments);

  return [
    config?.prompt ?? "",
    config?.branchName ? `Current branch: ${config.branchName}` : null,
    config?.workDir ? `Working directory: ${config.workDir}` : null,
    attachmentSection,
  ].filter(Boolean).join("\n\n");
}

function buildCodexLeadTurnPrompt({
  attachments,
  branchName,
  initialPrompt,
  nextMessage,
  transcript,
  workDir,
}) {
  const attachmentSection = buildAttachmentPromptSection(attachments);
  const transcriptSection = transcript.length > 0
    ? formatConversationTranscript(transcript)
    : "(no prior conversation yet)";

  return [
    "You are continuing an EAT lead-agent session.",
    "Return only the next assistant message for the current conversation.",
    `Session instructions:\n${initialPrompt}`,
    branchName ? `Current branch: ${branchName}` : null,
    workDir ? `Working directory: ${workDir}` : null,
    attachmentSection,
    `Conversation so far:\n${transcriptSection}`,
    nextMessage ? `New ${nextMessage.role} message:\n${nextMessage.content}` : null,
  ].filter(Boolean).join("\n\n");
}

function buildAttachmentPromptSection(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  const lines = attachments
    .filter((attachment) => normalizeNonEmptyString(attachment?.filePath))
    .map((attachment) => {
      const name = normalizeNonEmptyString(attachment.fileName) ?? path.basename(attachment.filePath);
      const fileType = normalizeNonEmptyString(attachment.fileType) ?? "UNKNOWN";
      return `- ${name} [${fileType}] at ${attachment.filePath}`;
    });

  if (lines.length === 0) {
    return null;
  }

  return [
    "Attachments available on disk:",
    ...lines,
    "Open only the files you need.",
  ].join("\n");
}

function formatConversationTranscript(transcript) {
  return transcript
    .map((entry) => `[${entry.role}]\n${entry.content}`)
    .join("\n\n");
}

function wrapCodexJsonRuntime(runtime, { cleanup }) {
  const controller = createBufferedRuntimeController();
  let cleanedUp = false;

  const cleanOnce = async () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    await cleanup?.();
  };

  let jsonBuffer = "";

  runtime.onOutput((chunk) => {
    if (typeof chunk !== "string" || chunk.length === 0) {
      return;
    }

    jsonBuffer += chunk;

    while (jsonBuffer.includes("\n")) {
      const newlineIndex = jsonBuffer.indexOf("\n");
      const line = jsonBuffer.slice(0, newlineIndex).trim();
      jsonBuffer = jsonBuffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      const text = extractCodexJsonOutput(line);

      if (text) {
        controller.emitOutput(text);
      }
    }
  });

  runtime.onExit((exitCode) => {
    const trailingText = extractCodexJsonOutput(jsonBuffer);

    if (trailingText) {
      controller.emitOutput(trailingText);
    }

    jsonBuffer = "";

    void cleanOnce().finally(() => {
      controller.close(exitCode);
    });
  });

  return {
    containerId: runtime.containerId ?? null,
    pid: runtime.pid ?? null,
    sessionId: runtime.sessionId,
    async kill() {
      await runtime.kill?.();
      await cleanOnce();
    },
    onExit(callback) {
      controller.onExit(callback);
    },
    onOutput(callback) {
      controller.onOutput(callback);
    },
    async sendInput(message) {
      return runtime.sendInput?.(message);
    },
    async stop() {
      await runtime.stop?.();
      await cleanOnce();
    },
  };
}

function createBufferedRuntimeController() {
  const outputListeners = new Set();
  const exitListeners = new Set();
  const bufferedOutput = [];
  let closed = false;
  let exitCode = null;

  return {
    close(nextExitCode) {
      if (closed) {
        return;
      }

      closed = true;
      exitCode = typeof nextExitCode === "number" ? nextExitCode : 0;

      for (const listener of exitListeners) {
        listener(exitCode);
      }
    },
    emitOutput(chunk) {
      if (typeof chunk !== "string" || chunk.length === 0) {
        return;
      }

      bufferedOutput.push(chunk);

      for (const listener of outputListeners) {
        listener(chunk);
      }
    },
    failAndClose(error) {
      this.emitOutput(`${normalizeCommandFailureMessage(error) ?? error?.message ?? "Codex CLI failed."}\n`);
      this.close(1);
    },
    onExit(callback) {
      exitListeners.add(callback);

      if (closed) {
        callback(exitCode);
      }
    },
    onOutput(callback) {
      outputListeners.add(callback);

      for (const chunk of bufferedOutput) {
        callback(chunk);
      }
    },
  };
}

function unavailableAgentResult(code, message, details, check) {
  return {
    available: false,
    checks: [
      {
        ...check,
        status: "FAIL",
      },
    ],
    reason: {
      code,
      details,
      message,
    },
  };
}

function extractCodexJsonOutput(text) {
  const normalizedText = normalizeNonEmptyString(text);

  if (!normalizedText) {
    return null;
  }

  const agentMessages = [];

  for (const line of normalizedText.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine.startsWith("{")) {
      continue;
    }

    try {
      const payload = JSON.parse(trimmedLine);

      if (payload.type === "item.completed" && payload.item?.type === "agent_message") {
        const itemText = normalizeNonEmptyString(payload.item.text);

        if (itemText) {
          agentMessages.push(itemText);
        }
      }
    } catch {
      return normalizedText;
    }
  }

  if (agentMessages.length === 0) {
    return normalizedText;
  }

  return `${agentMessages.join("\n")}\n`;
}

function extractVersion(output) {
  const normalizedOutput = normalizeNonEmptyString(output);

  if (!normalizedOutput) {
    return null;
  }

  return normalizedOutput.split(/\r?\n/u)[0];
}

function normalizeCommandFailureMessage(error) {
  return normalizeNonEmptyString(error?.stderr)
    ?? normalizeNonEmptyString(error?.stdout)
    ?? normalizeNonEmptyString(error?.message);
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

    if (looksLikeFinalReviewPrompt(prompt)) {
      emitOutput(JSON.stringify({
        reviews: [],
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

      if (normalizedMessage.toLowerCase().includes("generate the execution plan as json only")) {
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

function looksLikeReviewPrompt(prompt) {
  return looksLikeIncrementalReviewPrompt(prompt) || looksLikeFinalReviewPrompt(prompt);
}

function looksLikeIncrementalReviewPrompt(prompt) {
  return typeof prompt === "string" && prompt.includes("incremental advisory review");
}

function looksLikeFinalReviewPrompt(prompt) {
  return typeof prompt === "string" && prompt.includes("authoritative final review");
}

function looksLikeSystemLeadInstruction(message) {
  if (typeof message !== "string") {
    return false;
  }

  return message.includes("Generate the execution plan as JSON only")
    || message.includes("Regenerate the full plan as JSON only")
    || message.includes("Return a complete replacement object");
}

function normalizeRequiredString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveContainerUser() {
  if (normalizeNonEmptyString(process.env.EAT_WORKER_CONTAINER_USER)) {
    return process.env.EAT_WORKER_CONTAINER_USER.trim();
  }

  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    return `${process.getuid()}:${process.getgid()}`;
  }

  return "1000:1000";
}

import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { SESSION_SANDBOX_TYPES } from "../agents/agent-contract.js";

const execFileAsync = promisify(execFile);

export const SANDBOX_NETWORK_PROFILES = Object.freeze({
  DEFAULT: "DEFAULT",
  HOST: "HOST",
  ISOLATED: "ISOLATED",
});

export const SANDBOX_HEALTH_REASON_CODES = Object.freeze({
  BINARY_MISSING: "BINARY_MISSING",
  DAEMON_UNREACHABLE: "DAEMON_UNREACHABLE",
  IMAGE_MISSING: "IMAGE_MISSING",
  IMAGE_REQUIREMENTS_UNMET: "IMAGE_REQUIREMENTS_UNMET",
  INVALID_CONFIG: "INVALID_CONFIG",
});

export const DEFAULT_WORKTREE_ROOT = path.join(os.tmpdir(), ".eat-worktrees");
export const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
export const DEFAULT_WORKER_IMAGE = process.env.EAT_WORKER_IMAGE ?? "eat/worker-base:latest";
export const DEFAULT_WORKER_IMAGE_REQUIRED_TOOLS = Object.freeze(["bash", "git", "rg"]);

export class DockerSandboxManager {
  constructor(options = {}) {
    this.defaultWorkerImage = options.defaultWorkerImage ?? DEFAULT_WORKER_IMAGE;
    this.requiredWorkerTools = uniquePaths(
      (options.requiredWorkerTools ?? DEFAULT_WORKER_IMAGE_REQUIRED_TOOLS).map((toolName) => {
        const normalizedToolName = normalizeNonEmptyString(toolName);

        if (!normalizedToolName) {
          throw buildSandboxConfigError(
            SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
            "requiredWorkerTools must only contain non-empty strings.",
          );
        }

        return normalizedToolName;
      }),
    );
    this.defaultContainerUser = options.defaultContainerUser ?? resolveDefaultContainerUser();
    this.execFile = options.execFile ?? execFileAsync;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.uploadRootPath = path.resolve(options.uploadRootPath ?? DEFAULT_UPLOAD_ROOT);
    this.worktreeRootPath = path.resolve(options.worktreeRootPath ?? DEFAULT_WORKTREE_ROOT);
  }

  async getDockerHealth() {
    const dockerVersion = await this.#runDockerJson(["version", "--format", "{{json .Server}}"]);

    if (!dockerVersion.ok) {
      return {
        available: false,
        binaryAvailable: dockerVersion.reasonCode !== SANDBOX_HEALTH_REASON_CODES.BINARY_MISSING,
        daemonReachable: false,
        defaultWorkerImage: this.defaultWorkerImage,
        imageAvailable: false,
        imageToolingReady: false,
        networkProfile: SANDBOX_NETWORK_PROFILES.ISOLATED,
        pullStrategy: "MANUAL_ONLY",
        requiredTools: [...this.requiredWorkerTools],
        reason: dockerVersion.reason,
        reasonCode: dockerVersion.reasonCode,
        serverVersion: null,
      };
    }

    const imageInspect = await this.#runDockerText(["image", "inspect", this.defaultWorkerImage, "--format", "{{.Id}}"]);
    if (!imageInspect.ok) {
      return {
        available: false,
        binaryAvailable: true,
        daemonReachable: true,
        defaultWorkerImage: this.defaultWorkerImage,
        imageAvailable: false,
        imageToolingReady: false,
        networkProfile: SANDBOX_NETWORK_PROFILES.ISOLATED,
        pullStrategy: "MANUAL_ONLY",
        requiredTools: [...this.requiredWorkerTools],
        reason: `Worker image ${this.defaultWorkerImage} is not available locally.`,
        reasonCode: SANDBOX_HEALTH_REASON_CODES.IMAGE_MISSING,
        serverVersion: dockerVersion.value?.Version ?? null,
      };
    }

    const imageTooling = await this.#checkWorkerImageTooling();
    const toolingReady = imageTooling.ok;
    const reason = toolingReady ? null : imageTooling.reason;

    return {
      available: toolingReady,
      binaryAvailable: true,
      daemonReachable: true,
      defaultWorkerImage: this.defaultWorkerImage,
      imageAvailable: true,
      imageToolingReady: toolingReady,
      missingTools: toolingReady ? [] : imageTooling.missingTools,
      networkProfile: SANDBOX_NETWORK_PROFILES.ISOLATED,
      pullStrategy: "MANUAL_ONLY",
      requiredTools: [...this.requiredWorkerTools],
      reason,
      reasonCode: toolingReady ? null : SANDBOX_HEALTH_REASON_CODES.IMAGE_REQUIREMENTS_UNMET,
      serverVersion: dockerVersion.value?.Version ?? null,
    };
  }

  getSandboxPolicy() {
    return {
      blockedHostPaths: ["~", "~/.ssh"],
      defaultSandboxType: SESSION_SANDBOX_TYPES.DOCKER,
      defaultWorkerImage: this.defaultWorkerImage,
      mountPolicy: {
        managedReadonly: ["adapter-declared runtime tool mounts validated against explicit allowlists"],
        managedReadwrite: ["adapter-declared runtime state mounts validated against explicit allowlists"],
        readonly: ["task attachments persisted under the app upload root"],
        readwrite: ["subtask worktree persisted under the app worktree root"],
      },
      networkProfile: SANDBOX_NETWORK_PROFILES.ISOLATED,
      pullStrategy: "MANUAL_ONLY",
      requiredTools: [...this.requiredWorkerTools],
      roots: {
        uploads: this.uploadRootPath,
        worktrees: this.worktreeRootPath,
      },
    };
  }

  createWorkerSandboxConfig(input = {}) {
    if (input.type && input.type !== SESSION_SANDBOX_TYPES.DOCKER) {
      throw buildSandboxConfigError(
        SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
        `Unsupported sandbox type: ${input.type}.`,
      );
    }

    const worktreePath = normalizeAbsolutePath(input.worktreePath, "worktreePath");
    assertAllowedMountPath(worktreePath, this.worktreeRootPath, "worktreePath");

    const readonlyMounts = uniquePaths((input.attachments ?? []).map((attachment) => {
      const filePath = normalizeAbsolutePath(attachment?.filePath, "attachment.filePath");
      assertAllowedMountPath(filePath, this.uploadRootPath, "attachment.filePath");
      return filePath;
    }));
    const extraReadonlyMounts = uniquePaths((input.extraReadonlyMounts ?? []).map((mountPath) => {
      const normalizedPath = normalizeAbsolutePath(mountPath, "extraReadonlyMount");
      assertAllowedMountPathAgainstRoots(
        normalizedPath,
        normalizeAllowedRoots(input.allowedExtraReadonlyRoots, "allowedExtraReadonlyRoots"),
        "extraReadonlyMount",
      );
      return normalizedPath;
    }));
    const extraReadwriteMounts = uniquePaths((input.extraReadwriteMounts ?? []).map((mountPath) => {
      const normalizedPath = normalizeAbsolutePath(mountPath, "extraReadwriteMount");
      assertAllowedMountPathAgainstRoots(
        normalizedPath,
        normalizeAllowedRoots(input.allowedExtraReadwriteRoots, "allowedExtraReadwriteRoots"),
        "extraReadwriteMount",
      );
      return normalizedPath;
    }));

    return {
      containerImage: normalizeNonEmptyString(input.containerImage) ?? this.defaultWorkerImage,
      containerUser: normalizeNonEmptyString(input.containerUser) ?? this.defaultContainerUser,
      networkProfile: input.networkProfile ?? SANDBOX_NETWORK_PROFILES.ISOLATED,
      readonlyMounts: uniquePaths([...readonlyMounts, ...extraReadonlyMounts]),
      readwriteMounts: uniquePaths([worktreePath, ...extraReadwriteMounts]),
      type: SESSION_SANDBOX_TYPES.DOCKER,
      workDir: worktreePath,
    };
  }

  async assertDockerReady() {
    const health = await this.getDockerHealth();

    if (!health.available) {
      throw buildSandboxConfigError(
        health.reasonCode ?? SANDBOX_HEALTH_REASON_CODES.DAEMON_UNREACHABLE,
        health.reason ?? "Docker worker sandbox is unavailable.",
      );
    }

    return health;
  }

  async spawnContainerSession(input = {}) {
    const manager = this;
    const sandbox = this.createWorkerSandboxConfig(input.sandbox);
    await this.assertDockerReady();

    const command = Array.isArray(input.command) && input.command.length > 0
      ? input.command
      : ["sh", "-lc", "printf 'No sandbox command was configured.\\n'"];

    const createArgs = buildDockerCreateArgs({
      command,
      env: input.env ?? {},
      sandbox,
      sessionLabel: input.sessionLabel ?? `eat-${randomUUID()}`,
    });
    const created = await this.#runDockerText(createArgs);

    if (!created.ok) {
      throw buildSandboxConfigError(
        created.reasonCode ?? SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
        created.reason ?? "Failed to create the Docker worker sandbox.",
      );
    }

    const containerId = created.value;
    const process = this.spawnProcess("docker", ["start", "--attach", "--interactive", containerId], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const outputListeners = new Set();
    const exitListeners = new Set();
    let exitCode = null;
    let settled = false;
    let cleanupPromise = null;

    const emitOutput = (chunk) => {
      const text = typeof chunk === "string" ? chunk : chunk?.toString("utf8");

      if (!text) {
        return;
      }

      for (const listener of outputListeners) {
        listener(text);
      }
    };

    process.stdout?.on("data", emitOutput);
    process.stderr?.on("data", emitOutput);
    process.on("close", (code) => {
      exitCode = code;
      if (!cleanupPromise) {
        cleanupPromise = this.#removeContainer(containerId, true);
      }

      void cleanupPromise.finally(() => {
        if (settled) {
          return;
        }

        settled = true;
        for (const listener of exitListeners) {
          listener(exitCode);
        }
      });
    });

    return {
      containerId,
      onExit(callback) {
        exitListeners.add(callback);
      },
      onOutput(callback) {
        outputListeners.add(callback);
      },
      pid: process.pid ?? null,
      async kill() {
        process.kill("SIGKILL");
        await manager.#removeContainer(containerId, true);
      },
      sessionId: `docker_${randomUUID()}`,
      async sendInput(message) {
        if (!process.stdin || process.stdin.destroyed) {
          throw new Error("Sandbox session stdin is no longer writable.");
        }

        process.stdin.write(message);
      },
      async stop() {
        if (process.stdin && !process.stdin.destroyed) {
          process.stdin.end();
        }

        await manager.#stopContainer(containerId);
      },
    };
  }

  async #stopContainer(containerId) {
    await this.#runDockerText(["stop", containerId]);
  }

  async #removeContainer(containerId, force = false) {
    await this.#runDockerText(force ? ["rm", "--force", containerId] : ["rm", containerId]);
  }

  async #runDockerJson(args) {
    const result = await this.#runDockerText(args);

    if (!result.ok) {
      return result;
    }

    try {
      return {
        ok: true,
        value: JSON.parse(result.value),
      };
    } catch {
      return {
        ok: false,
        reason: "Docker returned an invalid JSON response.",
        reasonCode: SANDBOX_HEALTH_REASON_CODES.DAEMON_UNREACHABLE,
      };
    }
  }

  async #checkWorkerImageTooling() {
    const requirementProbe = buildWorkerImageToolProbeCommand(this.requiredWorkerTools);
    const probe = await this.#runDockerText([
      "run",
      "--rm",
      "--entrypoint",
      "/bin/sh",
      this.defaultWorkerImage,
      "-c",
      requirementProbe,
    ]);

    if (probe.ok) {
      return {
        ok: true,
        missingTools: [],
      };
    }

    const missingTools = parseMissingWorkerTools(probe.reason);

    return {
      missingTools,
      ok: false,
      reason: missingTools.length > 0
        ? `Worker image ${this.defaultWorkerImage} is missing required tools: ${missingTools.join(", ")}.`
        : `Worker image ${this.defaultWorkerImage} failed the runtime tooling check.`,
    };
  }

  async #runDockerText(args) {
    try {
      const { stdout } = await this.execFile("docker", args, {
        encoding: "utf8",
      });

      return {
        ok: true,
        value: stdout.trim(),
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: false,
          reason: "Docker is not installed or not available on PATH.",
          reasonCode: SANDBOX_HEALTH_REASON_CODES.BINARY_MISSING,
        };
      }

      const stderr = normalizeNonEmptyString(error?.stderr);
      const message = stderr ?? normalizeNonEmptyString(error?.message) ?? "Docker command failed.";
      const reasonCode = message.toLowerCase().includes("cannot connect")
        || message.toLowerCase().includes("is the docker daemon running")
        ? SANDBOX_HEALTH_REASON_CODES.DAEMON_UNREACHABLE
        : SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG;

      return {
        ok: false,
        reason: message,
        reasonCode,
      };
    }
  }
}

export class SystemService {
  constructor(options = {}) {
    this.sandboxManager = options.sandboxManager;
  }

  async getDockerHealth() {
    return {
      ok: true,
      ...(await this.sandboxManager.getDockerHealth()),
    };
  }

  async getSandboxPolicy() {
    return {
      ok: true,
      policy: this.sandboxManager.getSandboxPolicy(),
    };
  }
}

function buildDockerCreateArgs({ command, env, sandbox, sessionLabel }) {
  const args = [
    "create",
    "--interactive",
    "--init",
    "--label", `eat.session=${sessionLabel}`,
    "--user", sandbox.containerUser,
    "--workdir", sandbox.workDir,
  ];

  if (sandbox.networkProfile === SANDBOX_NETWORK_PROFILES.ISOLATED) {
    args.push("--network", "none");
  } else if (sandbox.networkProfile === SANDBOX_NETWORK_PROFILES.HOST) {
    args.push("--network", "host");
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      args.push("--env", `${key}=${value}`);
    }
  }

  for (const mountPath of sandbox.readwriteMounts) {
    args.push("--mount", `type=bind,src=${mountPath},dst=${mountPath}`);
  }

  for (const mountPath of sandbox.readonlyMounts) {
    args.push("--mount", `type=bind,src=${mountPath},dst=${mountPath},readonly`);
  }

  args.push(sandbox.containerImage, ...command);
  return args;
}

function assertAllowedMountPath(targetPath, allowedRootPath, fieldName) {
  assertAllowedMountPathAgainstRoots(targetPath, [allowedRootPath], fieldName);
}

function assertAllowedMountPathAgainstRoots(targetPath, allowedRootPaths, fieldName) {
  const homeDirectoryPath = path.resolve(os.homedir());
  const sshDirectoryPath = path.join(homeDirectoryPath, ".ssh");
  const normalizedTargetPath = path.resolve(targetPath);

  if (normalizedTargetPath === homeDirectoryPath || normalizedTargetPath.startsWith(`${homeDirectoryPath}${path.sep}`)) {
    throw buildSandboxConfigError(
      SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
      `${fieldName} cannot mount the host home directory.`,
    );
  }

  if (normalizedTargetPath === sshDirectoryPath || normalizedTargetPath.startsWith(`${sshDirectoryPath}${path.sep}`)) {
    throw buildSandboxConfigError(
      SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
      `${fieldName} cannot mount the host SSH directory.`,
    );
  }

  const normalizedAllowedRootPaths = normalizeAllowedRoots(allowedRootPaths, "allowedRootPaths");
  const isAllowed = normalizedAllowedRootPaths.some((allowedRootPath) => (
    normalizedTargetPath === allowedRootPath
    || normalizedTargetPath.startsWith(`${allowedRootPath}${path.sep}`)
  ));

  if (!isAllowed) {
    throw buildSandboxConfigError(
      SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
      `${fieldName} must stay inside ${normalizedAllowedRootPaths.join(", ")}.`,
    );
  }
}

function buildSandboxConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeAbsolutePath(value, fieldName) {
  const normalizedValue = normalizeNonEmptyString(value);

  if (!normalizedValue || !path.isAbsolute(normalizedValue)) {
    throw buildSandboxConfigError(
      SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
      `${fieldName} must be an absolute path.`,
    );
  }

  return path.resolve(normalizedValue);
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function normalizeAllowedRoots(roots, fieldName) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw buildSandboxConfigError(
      SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG,
      `${fieldName} must be a non-empty array.`,
    );
  }

  return uniquePaths(roots.map((rootPath) => normalizeAbsolutePath(rootPath, fieldName)));
}

function resolveDefaultContainerUser() {
  if (normalizeNonEmptyString(process.env.EAT_WORKER_CONTAINER_USER)) {
    return process.env.EAT_WORKER_CONTAINER_USER.trim();
  }

  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    return `${process.getuid()}:${process.getgid()}`;
  }

  return "1000:1000";
}

function buildWorkerImageToolProbeCommand(requiredTools) {
  const checks = requiredTools.map((toolName) => {
    const escapedToolName = shellEscape(toolName);
    return `command -v ${escapedToolName} >/dev/null 2>&1 || missing="$missing ${toolName}"`;
  });

  return [
    "missing=''",
    ...checks,
    "if [ -n \"$missing\" ]; then printf 'EAT_WORKER_IMAGE_MISSING_TOOLS:%s\\n' \"$missing\" >&2; exit 1; fi",
  ].join("; ");
}

function parseMissingWorkerTools(reason) {
  const match = normalizeNonEmptyString(reason)?.match(/EAT_WORKER_IMAGE_MISSING_TOOLS:\s*(.+)$/imu);

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function shellEscape(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

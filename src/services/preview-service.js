import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { promisify } from "node:util";

import {
  SANDBOX_HEALTH_REASON_CODES,
  SANDBOX_NETWORK_PROFILES,
} from "./sandbox-manager.js";

const execFileAsync = promisify(execFile);

export const PREVIEW_SERVICE_ERROR_CODES = Object.freeze({
  APP_ROOT_NOT_FOUND: "APP_ROOT_NOT_FOUND",
  PREVIEW_COMMAND_REQUIRED: "PREVIEW_COMMAND_REQUIRED",
  PREVIEW_SANDBOX_UNAVAILABLE: "PREVIEW_SANDBOX_UNAVAILABLE",
  PREVIEW_START_FAILED: "PREVIEW_START_FAILED",
  PREVIEW_STOP_FAILED: "PREVIEW_STOP_FAILED",
  PREVIEW_TARGET_NOT_FOUND: "PREVIEW_TARGET_NOT_FOUND",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
});

export const PREVIEW_TARGET_TYPE = Object.freeze({
  BASE_BRANCH: "BASE_BRANCH",
  INTEGRATION_RUN: "INTEGRATION_RUN",
  SUBTASK: "SUBTASK",
  TASK_MAINLINE: "TASK_MAINLINE",
});

export const PREVIEW_SESSION_STATUS = Object.freeze({
  FAILED: "FAILED",
  RUNNING: "RUNNING",
  STARTING: "STARTING",
  STOPPED: "STOPPED",
});

const DEFAULT_PREVIEW_HOST = "127.0.0.1";
const DEFAULT_PREVIEW_PATH = "/";
const DEFAULT_PREVIEW_PORT = 4173;
const DEFAULT_READY_INTERVAL_MS = 1_000;
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const PREVIEW_LOG_MAX_CHARS = 24_000;
const PREVIEW_ROOT = path.join(os.tmpdir(), ".eat-preview-worktrees");
const PACKAGE_MANAGER_LOCKFILES = Object.freeze({
  bun: ["bun.lockb", "bun.lock"],
  npm: ["package-lock.json", "npm-shrinkwrap.json"],
  pnpm: ["pnpm-lock.yaml"],
  yarn: ["yarn.lock"],
});
const STARTABLE_SUBTASK_STATUSES = new Set([
  "ACCEPTED",
  "MERGED",
  "REVIEW_PENDING",
  "RUNNING",
]);
const CANDIDATE_IGNORE_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export class PreviewService {
  constructor(options = {}) {
    this.projectRepository = options.projectRepository;
    this.taskRepository = options.taskRepository;
    this.sandboxManager = options.sandboxManager ?? null;
    this.execFile = options.execFile ?? options.execFileImpl ?? execFileAsync;
    this.readFile = options.readFile ?? readFile;
    this.readdir = options.readdir ?? readdir;
    this.access = options.access ?? access;
    this.mkdir = options.mkdir ?? mkdir;
    this.mkdtemp = options.mkdtemp ?? mkdtemp;
    this.rm = options.rm ?? rm;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis) ?? null;
    this.resolveNow = options.resolveNow ?? (() => new Date().toISOString());
    this.defaultHost = options.defaultHost ?? DEFAULT_PREVIEW_HOST;
    this.defaultPath = options.defaultPath ?? DEFAULT_PREVIEW_PATH;
    this.defaultPort = options.defaultPort ?? DEFAULT_PREVIEW_PORT;
    this.readyIntervalMs = options.readyIntervalMs ?? DEFAULT_READY_INTERVAL_MS;
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.sleep = options.sleep ?? ((durationMs) => new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    }));
    this.previewRoot = path.resolve(
      options.previewRoot
        ?? (this.sandboxManager?.worktreeRootPath
          ? path.join(this.sandboxManager.worktreeRootPath, "_preview")
          : PREVIEW_ROOT),
    );
    this.sessionsByTaskId = new Map();
    this.repoLocks = new Map();
  }

  async getTaskPreview(taskId) {
    const context = await this.#loadTaskContext(taskId);
    if (!context.ok) {
      return context;
    }

    const appRoots = await discoverPreviewAppRoots({
      access: this.access,
      readFile: this.readFile,
      readdir: this.readdir,
      rootPath: context.value.project.path,
    }).catch(() => []);
    const recommendation = context.value.targets.find((target) => target.recommended) ?? null;
    const defaultAppRoot = appRoots.find((entry) => entry.recommended) ?? appRoots[0] ?? null;

    return {
      ok: true,
      preview: {
        appRoots: serializePreviewAppRoots(appRoots),
        available: true,
        defaults: {
          appRoot: defaultAppRoot?.path ?? "",
          command: defaultAppRoot?.command ?? "",
          path: this.defaultPath,
          port: this.defaultPort,
          targetId: recommendation?.id ?? "",
          targetType: recommendation?.type ?? "",
        },
        recommendation: recommendation
          ? {
              label: recommendation.label,
              targetId: recommendation.id,
              targetType: recommendation.type,
            }
          : null,
        session: serializePreviewSession(this.sessionsByTaskId.get(taskId) ?? null),
        targets: serializePreviewTargets(context.value.targets),
      },
    };
  }

  async startTaskPreview(taskId, input = {}) {
    const context = await this.#loadTaskContext(taskId);
    if (!context.ok) {
      return context;
    }

    return this.#withRepoLock(context.value.project.path, async () => {
      const targets = context.value.targets;
      const target = targets.find((entry) => entry.id === normalizeNonEmptyString(input.targetId))
        ?? targets.find((entry) => entry.recommended)
        ?? targets[0]
        ?? null;

      if (!target) {
        return failure(
          PREVIEW_SERVICE_ERROR_CODES.PREVIEW_TARGET_NOT_FOUND,
          "No preview target is available for this task yet.",
        );
      }

      if (!this.sandboxManager?.spawnContainerSession) {
        return failure(
          PREVIEW_SERVICE_ERROR_CODES.PREVIEW_SANDBOX_UNAVAILABLE,
          "Docker sandbox is required before starting a built-in preview.",
        );
      }

      await this.#stopPreviewSession(taskId, {
        preserveSession: false,
        repoPath: context.value.project.path,
      }).catch(() => null);

      let worktreePath = null;
      let session = null;

      try {
        const previewBaseDir = path.join(
          this.previewRoot,
          sanitizePathSegment(context.value.project.name ?? path.basename(context.value.project.path) ?? "project"),
          taskId,
        );
        await this.mkdir(previewBaseDir, { recursive: true });
        worktreePath = await this.mkdtemp(path.join(previewBaseDir, "session-"));

        try {
          await ensureDetachedWorktree({
            execFile: this.execFile,
            repoPath: context.value.project.path,
            revision: target.branchName,
            worktreePath,
          });
        } catch {
          await removeDetachedWorktree({
            execFile: this.execFile,
            repoPath: context.value.project.path,
            rm: this.rm,
            worktreePath,
          }).catch(() => null);

          return failure(
            PREVIEW_SERVICE_ERROR_CODES.PREVIEW_TARGET_NOT_FOUND,
            `Preview target ${target.branchName} is unavailable.`,
            { targetId: target.id },
          );
        }

        const appRoots = await discoverPreviewAppRoots({
          access: this.access,
          readFile: this.readFile,
          readdir: this.readdir,
          rootPath: worktreePath,
        });
        const appRootResult = await resolvePreviewAppRoot({
          access: this.access,
          candidates: appRoots,
          requestedAppRoot: normalizeNonEmptyString(input.appRoot),
          worktreePath,
        });

        if (!appRootResult.ok) {
          await removeDetachedWorktree({
            execFile: this.execFile,
            repoPath: context.value.project.path,
            rm: this.rm,
            worktreePath,
          }).catch(() => null);
          return appRootResult;
        }

        const port = normalizePreviewPort(input.port, this.defaultPort);
        const command = normalizeNonEmptyString(input.command)
          ?? resolvePreviewCommand(appRoots, appRootResult.appRoot, port)
          ?? "";
        const appRootPath = path.relative(worktreePath, appRootResult.appRoot) || ".";

        if (!command) {
          await removeDetachedWorktree({
            execFile: this.execFile,
            repoPath: context.value.project.path,
            rm: this.rm,
            worktreePath,
          }).catch(() => null);
          return failure(
            PREVIEW_SERVICE_ERROR_CODES.PREVIEW_COMMAND_REQUIRED,
            "No preview command was detected. Choose an app root or provide a custom command.",
            { appRoot: appRootPath },
          );
        }

        const url = `http://${this.defaultHost}:${port}${normalizePreviewPath(input.path ?? this.defaultPath)}`;
        session = createPreviewSession({
          appRoot: appRootPath,
          branchName: target.branchName,
          command,
          port,
          repoPath: context.value.project.path,
          targetId: target.id,
          targetLabel: target.label,
          targetType: target.type,
          taskId,
          url,
          worktreePath,
          now: this.resolveNow,
        });
        this.sessionsByTaskId.set(taskId, session);

        const runtime = await this.sandboxManager.spawnContainerSession({
          command: ["/bin/bash", "-lc", buildPreviewLaunchCommand(appRootResult.appRoot, command)],
          env: {},
          sandbox: {
            networkProfile: SANDBOX_NETWORK_PROFILES.DEFAULT,
            publishedPorts: [{
              containerPort: port,
              hostPort: port,
            }],
            worktreePath,
          },
          sessionLabel: `eat-preview-${taskId}`,
        });

        session.process = runtime;
        runtime.onOutput?.((chunk) => {
          appendPreviewLog(session, chunk, this.resolveNow);
        });
        runtime.onExit?.((code) => {
          if (session.closed || this.sessionsByTaskId.get(taskId) !== session) {
            return;
          }

          session.exitCode = typeof code === "number" ? code : null;
          session.updatedAt = this.resolveNow();
          if (session.status === PREVIEW_SESSION_STATUS.STOPPED) {
            return;
          }
          session.status = code === 0 ? PREVIEW_SESSION_STATUS.STOPPED : PREVIEW_SESSION_STATUS.FAILED;
          session.note = code === 0
            ? "Preview process exited."
            : `Preview process exited with code ${String(code ?? "unknown")}.`;
        });

        session.note = "Preview process started; waiting for readiness.";
        session.updatedAt = this.resolveNow();
        void this.#watchPreviewReadiness(session);
        return this.getTaskPreview(taskId);
      } catch (error) {
        await this.#stopPreviewSession(taskId, {
          preserveSession: false,
          repoPath: context.value.project.path,
        }).catch(() => null);
        if (worktreePath || session?.worktreePath) {
          await removeDetachedWorktree({
            execFile: this.execFile,
            repoPath: context.value.project.path,
            rm: this.rm,
            worktreePath: worktreePath ?? session?.worktreePath ?? null,
          }).catch(() => null);
        }
        return failure(
          mapPreviewStartErrorCode(error),
          error?.message ?? "Failed to start the preview session.",
        );
      }
    });
  }

  async stopTaskPreview(taskId) {
    const context = await this.#loadTaskContext(taskId);
    if (!context.ok) {
      return context;
    }

    try {
      await this.#stopPreviewSession(taskId, {
        preserveSession: true,
        repoPath: context.value.project.path,
      });
      return this.getTaskPreview(taskId);
    } catch (error) {
      return failure(
        PREVIEW_SERVICE_ERROR_CODES.PREVIEW_STOP_FAILED,
        error?.message ?? "Failed to stop the preview session cleanly.",
      );
    }
  }

  async close() {
    const taskIds = [...this.sessionsByTaskId.keys()];
    await Promise.all(taskIds.map(async (taskId) => {
      try {
        const task = await this.taskRepository.findTaskById(taskId);
        const project = task ? await this.projectRepository.findProjectById(task.projectId) : null;
        await this.#stopPreviewSession(taskId, {
          preserveSession: false,
          repoPath: project?.path ?? null,
        });
      } catch {
        // Best effort only.
      }
    }));
  }

  async #watchPreviewReadiness(session) {
    const deadline = Date.now() + this.readyTimeoutMs;

    while (Date.now() < deadline) {
      if (session.closed || session.exitCode !== null || session.status === PREVIEW_SESSION_STATUS.STOPPED || session.status === PREVIEW_SESSION_STATUS.FAILED) {
        return;
      }

      const readiness = await waitForPreviewReady({
        fetchImpl: this.fetchImpl,
        url: session.url,
      });

      if (readiness.ok) {
        session.status = PREVIEW_SESSION_STATUS.RUNNING;
        session.note = readiness.note;
        session.updatedAt = this.resolveNow();
        return;
      }

      session.note = readiness.note;
      session.updatedAt = this.resolveNow();
      await this.sleep(this.readyIntervalMs);
    }

    if (!session.closed && session.status === PREVIEW_SESSION_STATUS.STARTING) {
      session.status = PREVIEW_SESSION_STATUS.FAILED;
      session.note = "Preview did not become reachable before the readiness timeout.";
      session.updatedAt = this.resolveNow();
    }
  }

  async #loadTaskContext(taskId) {
    const task = await this.taskRepository.findTaskById(taskId);
    if (!task) {
      return failure(PREVIEW_SERVICE_ERROR_CODES.TASK_NOT_FOUND, "Task not found.", { taskId });
    }

    const project = await this.projectRepository.findProjectById(task.projectId);
    if (!project) {
      return failure(PREVIEW_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", { taskId });
    }

    const [subTasks, integrationRuns] = await Promise.all([
      this.taskRepository.listSubTasksByTaskId?.(taskId) ?? [],
      this.taskRepository.listIntegrationRunsByTaskId?.(taskId) ?? [],
    ]);

    return {
      ok: true,
      value: {
        task,
        project,
        subTasks,
        integrationRuns,
        targets: buildPreviewTargets({ task, subTasks, integrationRuns }),
      },
    };
  }

  async #stopPreviewSession(taskId, options = {}) {
    const session = this.sessionsByTaskId.get(taskId);
    if (!session) {
      return;
    }

    session.closed = true;
    session.status = PREVIEW_SESSION_STATUS.STOPPED;
    session.updatedAt = this.resolveNow();
    session.note = "Stopped by operator.";

    if (session.process?.stop) {
      await session.process.stop().catch(() => null);
    }

    const repoPath = options.repoPath ?? session.repoPath ?? null;
    if (repoPath && session.worktreePath) {
      await removeDetachedWorktree({
        execFile: this.execFile,
        repoPath,
        rm: this.rm,
        worktreePath: session.worktreePath,
      }).catch(() => null);
    }

    session.process = null;

    if (options.preserveSession !== true) {
      this.sessionsByTaskId.delete(taskId);
    }
  }

  async #withRepoLock(repoPath, fn) {
    const previous = this.repoLocks.get(repoPath) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const queued = previous.finally(() => current);
    this.repoLocks.set(repoPath, queued);

    await previous;

    try {
      return await fn();
    } finally {
      release();
      if (this.repoLocks.get(repoPath) === queued) {
        this.repoLocks.delete(repoPath);
      }
    }
  }
}

function buildPreviewTargets({ task, subTasks, integrationRuns }) {
  const targets = [];
  const latestIntegrationRun = [...integrationRuns]
    .filter((integrationRun) => integrationRun.integrationBranch && integrationRun.status !== "ROLLED_BACK")
    .at(-1) ?? null;

  if (latestIntegrationRun?.integrationBranch) {
    targets.push({
      type: PREVIEW_TARGET_TYPE.INTEGRATION_RUN,
      id: latestIntegrationRun.id,
      label: `Integration branch (${latestIntegrationRun.integrationBranch})`,
      description: "Preview the latest integration branch candidate.",
      branchName: latestIntegrationRun.integrationBranch,
      recommended: true,
    });
  }

  if (task.taskBranchName) {
    targets.push({
      type: PREVIEW_TARGET_TYPE.TASK_MAINLINE,
      id: "task-mainline",
      label: `Task mainline (${task.taskBranchName})`,
      description: "Preview the task mainline branch with accumulated accepted changes.",
      branchName: task.taskBranchName,
      recommended: targets.length === 0,
    });
  }

  if (task.baseBranch) {
    targets.push({
      type: PREVIEW_TARGET_TYPE.BASE_BRANCH,
      id: "base-branch",
      label: `Base branch (${task.baseBranch})`,
      description: "Preview the task base branch.",
      branchName: task.baseBranch,
      recommended: targets.length === 0,
    });
  }

  for (const subTask of subTasks) {
    const subTaskStatus = normalizeNonEmptyString(subTask?.status);
    if (!subTask?.branchName || (subTaskStatus && !STARTABLE_SUBTASK_STATUSES.has(subTaskStatus))) {
      continue;
    }
    targets.push({
      type: PREVIEW_TARGET_TYPE.SUBTASK,
      id: subTask.id,
      label: `Subtask (${subTask.displayName ?? subTask.title ?? subTask.id})`,
      description: `Preview branch produced by subtask ${subTask.title ?? subTask.id}.`,
      branchName: subTask.branchName,
      recommended: false,
    });
  }

  return targets;
}

async function discoverPreviewAppRoots({ access, readFile, readdir, rootPath }) {
  const queue = [{ depth: 0, targetPath: rootPath }];
  const visited = new Set();
  const candidates = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.targetPath)) {
      continue;
    }
    visited.add(current.targetPath);

    if (current.depth > 4) {
      continue;
    }

    const packageJsonPath = path.join(current.targetPath, "package.json");
    if (await pathExists(access, packageJsonPath)) {
      const pkg = await readJsonFile(readFile, packageJsonPath).catch(() => null);
      if (pkg) {
        const candidate = await buildPackagePreviewCandidate({
          access,
          pkg,
          rootPath,
          targetPath: current.targetPath,
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    const children = await readdir(current.targetPath, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isDirectory() || CANDIDATE_IGNORE_DIRECTORIES.has(child.name)) {
        continue;
      }
      queue.push({
        depth: current.depth + 1,
        targetPath: path.join(current.targetPath, child.name),
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
    .map((candidate, index) => ({
      ...candidate,
      recommended: index === 0,
    }));
}

async function buildPackagePreviewCandidate({ access, pkg, rootPath, targetPath }) {
  const scripts = pkg?.scripts ?? {};
  if (!scripts.dev && !scripts.preview && !scripts.start) {
    return null;
  }

  const dependencies = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };
  const framework = detectFramework(dependencies);
  const packageManager = await detectPackageManager(access, pkg, targetPath);
  const relativePath = path.relative(rootPath, targetPath) || ".";
  const command = buildDetectedCommand({ framework, packageManager, scripts });

  if (!command) {
    return null;
  }

  return {
    absolutePath: targetPath,
    path: relativePath,
    relativePath,
    framework,
    packageManager,
    command,
    label: relativePath === "." ? `Repository root (${framework})` : `${relativePath} (${framework})`,
    score: scorePreviewCandidate({ framework, relativePath, scripts }),
  };
}

async function detectPackageManager(accessImpl, pkg, targetPath) {
  const declaredPackageManager = normalizeNonEmptyString(pkg?.packageManager);
  if (declaredPackageManager?.startsWith("pnpm")) {
    return "pnpm";
  }
  if (declaredPackageManager?.startsWith("yarn")) {
    return "yarn";
  }
  if (declaredPackageManager?.startsWith("bun")) {
    return "bun";
  }
  if (declaredPackageManager?.startsWith("npm")) {
    return "npm";
  }

  for (const [packageManager, lockfiles] of Object.entries(PACKAGE_MANAGER_LOCKFILES)) {
    for (const lockfile of lockfiles) {
      if (await pathExists(accessImpl, path.join(targetPath, lockfile))) {
        return packageManager;
      }
    }
  }

  return "npm";
}

function detectFramework(dependencies) {
  if (dependencies.next) {
    return "next";
  }
  if (dependencies.nuxt || dependencies["nuxt-edge"]) {
    return "nuxt";
  }
  if (dependencies["react-scripts"]) {
    return "react-scripts";
  }
  if (dependencies["@sveltejs/kit"]) {
    return "sveltekit";
  }
  if (dependencies.vite) {
    return dependencies.react ? "vite-react" : "vite";
  }
  if (dependencies.vue) {
    return "vue";
  }
  if (dependencies.react) {
    return "react";
  }
  if (dependencies.express || dependencies.fastify || dependencies.koa) {
    return "node";
  }

  return "web";
}

function buildDetectedCommand({ framework, packageManager, scripts }) {
  const runner = packageManager === "yarn"
    ? "yarn"
    : packageManager === "pnpm"
      ? "pnpm"
      : packageManager === "bun"
        ? "bun"
        : "npm";

  if (scripts.preview) {
    return framework === "next"
      ? `${runner} run preview -- --hostname 0.0.0.0 --port ${DEFAULT_PREVIEW_PORT}`
      : `${runner} run preview -- --host 0.0.0.0 --port ${DEFAULT_PREVIEW_PORT}`;
  }

  if (scripts.dev) {
    if (framework === "next") {
      return `${runner} run dev -- --hostname 0.0.0.0 --port ${DEFAULT_PREVIEW_PORT}`;
    }
    if (framework === "react-scripts") {
      return `HOST=0.0.0.0 PORT=${DEFAULT_PREVIEW_PORT} BROWSER=none ${runner === "npm" ? "npm run start" : `${runner} start`}`;
    }
    if (framework === "node") {
      return runner === "npm" ? "npm run dev" : `${runner} dev`;
    }
    return `${runner} run dev -- --host 0.0.0.0 --port ${DEFAULT_PREVIEW_PORT}`;
  }

  if (scripts.start) {
    if (framework === "react-scripts") {
      return `HOST=0.0.0.0 PORT=${DEFAULT_PREVIEW_PORT} BROWSER=none ${runner === "npm" ? "npm run start" : `${runner} start`}`;
    }
    return runner === "npm" ? "npm run start" : `${runner} start`;
  }

  return "";
}

function scorePreviewCandidate({ framework, relativePath, scripts }) {
  let score = 0;
  if (scripts.preview) {
    score += 6;
  }
  if (scripts.dev) {
    score += 5;
  }
  if (scripts.start) {
    score += 2;
  }
  if (relativePath === "." || relativePath === "apps/web" || relativePath.endsWith("/web")) {
    score += 4;
  } else if (relativePath.startsWith("apps/")) {
    score += 3;
  }
  if (["next", "react", "vite-react", "vite", "vue", "sveltekit", "nuxt"].includes(framework)) {
    score += 2;
  }
  return score;
}

async function resolvePreviewAppRoot({ access, candidates, requestedAppRoot, worktreePath }) {
  if (requestedAppRoot) {
    const fromCandidates = candidates.find((entry) => (
      entry.absolutePath === requestedAppRoot || entry.relativePath === requestedAppRoot
    ));
    const appRoot = fromCandidates?.absolutePath ?? path.resolve(worktreePath, requestedAppRoot);

    if (inside(appRoot, worktreePath) && await pathExists(access, appRoot)) {
      return { ok: true, appRoot };
    }

    return failure(
      PREVIEW_SERVICE_ERROR_CODES.APP_ROOT_NOT_FOUND,
      `Preview app root ${requestedAppRoot} was not found inside the detached worktree.`,
      { appRoot: requestedAppRoot },
    );
  }

  const recommended = candidates.find((entry) => entry.recommended)?.absolutePath
    ?? candidates[0]?.absolutePath
    ?? worktreePath;

  if (inside(recommended, worktreePath) && await pathExists(access, recommended)) {
    return { ok: true, appRoot: recommended };
  }

  return failure(
    PREVIEW_SERVICE_ERROR_CODES.APP_ROOT_NOT_FOUND,
    "No valid preview app root was found for this task.",
  );
}

function resolvePreviewCommand(candidates, appRoot, port) {
  const matched = candidates.find((entry) => entry.absolutePath === appRoot) ?? null;
  if (!matched?.command) {
    return "";
  }
  return matched.command.replaceAll(String(DEFAULT_PREVIEW_PORT), String(port));
}

function buildPreviewLaunchCommand(appRoot, command) {
  return `cd ${shellEscape(appRoot)} && ${command}`;
}

function serializePreviewAppRoots(appRoots) {
  return appRoots.map((entry) => ({
    command: entry.command,
    framework: entry.framework,
    label: entry.label,
    packageManager: entry.packageManager,
    path: entry.relativePath,
    recommended: entry.recommended,
  }));
}

function serializePreviewTargets(targets) {
  return targets.map((target) => ({ ...target }));
}

function serializePreviewSession(session) {
  if (!session) {
    return null;
  }

  return {
    appRoot: session.appRoot,
    branchName: session.branchName,
    command: session.command,
    exitCode: session.exitCode,
    logs: session.logs,
    note: session.note,
    port: session.port,
    startedAt: session.startedAt,
    status: session.status,
    targetId: session.targetId,
    targetLabel: session.targetLabel,
    targetType: session.targetType,
    updatedAt: session.updatedAt,
    url: session.url,
    worktreePath: session.worktreePath,
  };
}

function createPreviewSession(input) {
  const timestamp = input.now();
  return {
    appRoot: input.appRoot,
    branchName: input.branchName,
    closed: false,
    command: input.command,
    exitCode: null,
    logs: "",
    note: "Starting preview process.",
    port: input.port,
    process: null,
    repoPath: input.repoPath,
    startedAt: timestamp,
    status: PREVIEW_SESSION_STATUS.STARTING,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    targetType: input.targetType,
    taskId: input.taskId,
    updatedAt: timestamp,
    url: input.url,
    worktreePath: input.worktreePath,
  };
}

function appendPreviewLog(session, chunk, resolveNow) {
  const text = typeof chunk === "string" ? chunk : chunk?.toString("utf8") ?? "";
  if (!text) {
    return;
  }
  session.logs = trimPreviewLog(`${session.logs}${text}`);
  session.updatedAt = resolveNow();
}

function trimPreviewLog(text) {
  return text.length > PREVIEW_LOG_MAX_CHARS ? text.slice(-PREVIEW_LOG_MAX_CHARS) : text;
}

async function waitForPreviewReady({ fetchImpl, url }) {
  if (typeof fetchImpl !== "function") {
    return {
      ok: true,
      running: true,
      note: "Preview process started. Automatic readiness checks are unavailable in this environment.",
    };
  }

  try {
    const response = await fetchImpl(url, { method: "GET" });
    if (response.status >= 200 && response.status < 500) {
      return {
        ok: true,
        running: true,
        note: `Preview is reachable at ${url}.`,
      };
    }
  } catch {
    // keep waiting
  }

  return {
    ok: false,
    running: true,
    note: `Preview process is still running, but ${url} is not reachable yet.`,
  };
}

async function ensureDetachedWorktree({ execFile: execFileImpl, repoPath, revision, worktreePath }) {
  await execFileImpl("git", ["-C", repoPath, "worktree", "add", "--detach", worktreePath, revision], {
    encoding: "utf8",
  });
}

async function removeDetachedWorktree({ execFile: execFileImpl, repoPath, rm: rmImpl, worktreePath }) {
  if (!worktreePath) {
    return;
  }

  await execFileImpl("git", ["-C", repoPath, "worktree", "remove", "--force", worktreePath], {
    encoding: "utf8",
  }).catch(() => null);
  await rmImpl(worktreePath, { force: true, recursive: true }).catch(() => null);
}

async function readJsonFile(readFileImpl, filePath) {
  return JSON.parse(await readFileImpl(filePath, "utf8"));
}

async function pathExists(accessImpl, targetPath) {
  try {
    await accessImpl(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizePreviewPort(value, fallbackPort) {
  const parsed = Number.parseInt(String(value ?? fallbackPort), 10);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 65_535) {
    return fallbackPort;
  }
  return parsed;
}

function normalizePreviewPath(value) {
  const normalized = normalizeNonEmptyString(value) ?? DEFAULT_PREVIEW_PATH;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizePathSegment(value) {
  return String(value ?? "preview")
    .replaceAll(/[^\w.-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    || "preview";
}

function shellEscape(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function inside(targetPath, rootPath) {
  const target = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function mapPreviewStartErrorCode(error) {
  if (Object.values(SANDBOX_HEALTH_REASON_CODES).includes(error?.code)) {
    return error.code === SANDBOX_HEALTH_REASON_CODES.INVALID_CONFIG
      ? PREVIEW_SERVICE_ERROR_CODES.PREVIEW_START_FAILED
      : PREVIEW_SERVICE_ERROR_CODES.PREVIEW_SANDBOX_UNAVAILABLE;
  }
  return PREVIEW_SERVICE_ERROR_CODES.PREVIEW_START_FAILED;
}

function failure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      ...(details ? { details } : {}),
      message,
    },
  };
}

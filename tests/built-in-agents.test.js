import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";

import { createBuiltInAgentAdapters } from "../src/agents/built-in-agents.js";

test("codex built-in adapter reports a real runtime and passes host health checks", async () => {
  const adapters = createBuiltInAgentAdapters({
    execFileImpl: async (_command, args) => {
      if (args[0] === "--version") {
        return {
          stderr: "",
          stdout: "codex-cli 1.2.3\n",
        };
      }

      if (args[0] === "login" && args[1] === "status") {
        return {
          stderr: "",
          stdout: "Logged in using an API key\n",
        };
      }

      throw new Error(`Unexpected command: ${args.join(" ")}`);
    },
    sandboxManager: {
      async getDockerHealth() {
        return {
          available: true,
          defaultWorkerImage: "node:22-bookworm-slim",
          networkProfile: "ISOLATED",
        };
      },
    },
  });
  const codexAdapter = adapters.find((adapter) => adapter.name === "codex-cli");

  assert.equal(codexAdapter.runtimeMode, "REAL");

  const health = await codexAdapter.healthCheck();

  assert.equal(health.available, true);
  assert.equal(health.version, "codex-cli 1.2.3");
  assert.deepEqual(
    health.checks.map((check) => check.name),
    ["binary", "auth", "worker-sandbox"],
  );
  assert.equal(health.checks[0].status, "PASS");
  assert.equal(health.checks[1].status, "PASS");
  assert.equal(health.checks[2].status, "PASS");
});

test("codex worker adapter prepares docker runtime state, mounts shared git metadata, and requests host networking for localhost providers", async () => {
  const fixturePath = await mkdtemp(path.join(os.tmpdir(), "eat-built-in-agents-"));
  const runtimeHomeRootPath = path.join(fixturePath, "runtime");
  const codexPackagePath = path.join(fixturePath, "codex-package");
  const codexConfigPath = path.join(fixturePath, "codex-config.toml");
  const codexAuthPath = path.join(fixturePath, "codex-auth.json");
  const repoGitPath = path.join(fixturePath, "repo", ".git");
  const worktreeGitDirPath = path.join(repoGitPath, "worktrees", "subtask-1");
  const worktreePath = path.join(fixturePath, "worktree");
  const attachmentPath = path.join(fixturePath, "uploads", "task-1", "brief.md");
  let capturedLaunch = null;

  try {
    await mkdir(path.join(codexPackagePath, "bin"), { recursive: true });
    await writeFile(path.join(codexPackagePath, "bin", "codex.js"), "console.log('codex');\n", "utf8");
    await writeFile(
      codexConfigPath,
      [
        'model_provider = "custom"',
        '[model_providers.custom]',
        'base_url = "http://localhost:3333/v1"',
      ].join("\n"),
      "utf8",
    );
    await writeFile(codexAuthPath, '{"OPENAI_API_KEY":"test"}\n', "utf8");
    await mkdir(worktreeGitDirPath, { recursive: true });
    await writeFile(path.join(worktreeGitDirPath, "commondir"), "../..\n", "utf8");
    await mkdir(worktreePath, { recursive: true });
    await writeFile(path.join(worktreePath, ".git"), `gitdir: ${worktreeGitDirPath}\n`, "utf8");
    await mkdir(path.dirname(attachmentPath), { recursive: true });
    await writeFile(attachmentPath, "# brief\n", "utf8");

    const adapters = createBuiltInAgentAdapters({
      codexAuthPath,
      codexConfigPath,
      codexPackagePath,
      runtimeHomeRootPath,
      sandboxManager: {
        async spawnContainerSession(input) {
          capturedLaunch = input;

          return {
            containerId: "container-123",
            pid: 4321,
            sessionId: "sandbox-session",
            async kill() {},
            onExit() {},
            onOutput() {},
            async sendInput() {},
            async stop() {},
          };
        },
      },
    });
    const codexAdapter = adapters.find((adapter) => adapter.name === "codex-cli");

    const runtime = await codexAdapter.spawnSession({
      attachments: [
        {
          fileName: "brief.md",
          filePath: attachmentPath,
          fileType: "DOCUMENT",
        },
      ],
      branchName: "eat/task/subtask-1",
      prompt: "Implement the approved worker task.",
      sandbox: {
        type: "DOCKER",
      },
      sessionType: "WORKER",
      workDir: worktreePath,
    });

    assert.ok(capturedLaunch);
    assert.equal(capturedLaunch.command[0], "node");
    assert.equal(capturedLaunch.command[1], path.join(codexPackagePath, "bin", "codex.js"));
    assert.ok(capturedLaunch.command.includes("--dangerously-bypass-approvals-and-sandbox"));
    assert.equal(capturedLaunch.sandbox.networkProfile, "HOST");
    assert.ok(capturedLaunch.sandbox.extraReadwriteMounts.includes(repoGitPath));
    assert.ok(capturedLaunch.sandbox.extraReadwriteMounts.some((mountPath) => mountPath.startsWith(runtimeHomeRootPath)));
    assert.ok(capturedLaunch.sandbox.extraReadonlyMounts.includes(codexPackagePath));
    assert.equal(capturedLaunch.env.HOME.startsWith(runtimeHomeRootPath), true);
    assert.equal(capturedLaunch.env.CODEX_HOME, path.join(capturedLaunch.env.HOME, ".codex"));
    assert.equal(runtime.containerId, "container-123");

    await access(path.join(capturedLaunch.env.CODEX_HOME, "config.toml"));
    await access(path.join(capturedLaunch.env.CODEX_HOME, "auth.json"));

    await runtime.stop();

    assert.deepEqual(await readdir(runtimeHomeRootPath), []);
  } finally {
    await rm(fixturePath, { force: true, recursive: true });
  }
});

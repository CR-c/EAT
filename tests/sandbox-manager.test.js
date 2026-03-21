import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  DockerSandboxManager,
  DEFAULT_WORKER_IMAGE,
  SANDBOX_NETWORK_PROFILES,
  SANDBOX_HEALTH_REASON_CODES,
} from "../src/services/sandbox-manager.js";

test("builds a deterministic worker sandbox config inside the allowed roots", () => {
  const manager = new DockerSandboxManager({
    uploadRootPath: "/tmp/eat-uploads",
    worktreeRootPath: "/tmp/.eat-worktrees",
  });

  const sandbox = manager.createWorkerSandboxConfig({
    attachments: [
      { filePath: "/tmp/eat-uploads/task-1/brief.md" },
      { filePath: "/tmp/eat-uploads/task-1/brief.md" },
    ],
    worktreePath: "/tmp/.eat-worktrees/project/task-1/subtask-a",
  });

  assert.equal(sandbox.type, "DOCKER");
  assert.deepEqual(sandbox.readwriteMounts, ["/tmp/.eat-worktrees/project/task-1/subtask-a"]);
  assert.deepEqual(sandbox.readonlyMounts, ["/tmp/eat-uploads/task-1/brief.md"]);
  assert.equal(sandbox.workDir, "/tmp/.eat-worktrees/project/task-1/subtask-a");
});

test("rejects blocked or unrelated mount paths", () => {
  const manager = new DockerSandboxManager({
    uploadRootPath: "/tmp/eat-uploads",
    worktreeRootPath: "/tmp/.eat-worktrees",
  });

  assert.throws(() => {
    manager.createWorkerSandboxConfig({
      worktreePath: path.join(os.homedir(), "repo"),
    });
  }, /home directory/i);

  assert.throws(() => {
    manager.createWorkerSandboxConfig({
      attachments: [{ filePath: "/etc/passwd" }],
      worktreePath: "/tmp/.eat-worktrees/project/task-1/subtask-a",
    });
  }, /must stay inside/i);
});

test("parses Docker health failures into structured reasons", async () => {
  const manager = new DockerSandboxManager({
    async execFile() {
      const error = new Error("Cannot connect to the Docker daemon");
      error.stderr = "Cannot connect to the Docker daemon";
      throw error;
    },
  });

  const health = await manager.getDockerHealth();

  assert.equal(health.available, false);
  assert.equal(health.reasonCode, SANDBOX_HEALTH_REASON_CODES.DAEMON_UNREACHABLE);
});

test("fails Docker health when the worker image is missing required runtime tools", async () => {
  const manager = new DockerSandboxManager({
    async execFile(_command, args) {
      if (args[0] === "version") {
        return {
          stdout: JSON.stringify({ Version: "27.0.0" }),
        };
      }

      if (args[0] === "image" && args[1] === "inspect") {
        return {
          stdout: "sha256:worker-image\n",
        };
      }

      if (args[0] === "run") {
        const error = new Error("runtime tooling check failed");
        error.stderr = "EAT_WORKER_IMAGE_MISSING_TOOLS: git rg\n";
        throw error;
      }

      throw new Error(`Unexpected docker command: ${args.join(" ")}`);
    },
  });

  const health = await manager.getDockerHealth();

  assert.equal(health.available, false);
  assert.equal(health.defaultWorkerImage, DEFAULT_WORKER_IMAGE);
  assert.equal(health.imageAvailable, true);
  assert.equal(health.imageToolingReady, false);
  assert.deepEqual(health.missingTools, ["git", "rg"]);
  assert.equal(health.reasonCode, SANDBOX_HEALTH_REASON_CODES.IMAGE_REQUIREMENTS_UNMET);
  assert.match(health.reason, /missing required tools: git, rg/i);
});

test("allows explicitly allowlisted runtime mounts and host networking for specialized workers", () => {
  const manager = new DockerSandboxManager({
    uploadRootPath: "/tmp/eat-uploads",
    worktreeRootPath: "/tmp/.eat-worktrees",
  });

  const sandbox = manager.createWorkerSandboxConfig({
    allowedExtraReadonlyRoots: ["/opt/codex", "/etc/ssl/certs"],
    allowedExtraReadwriteRoots: ["/tmp/eat-runtime", "/tmp/project/.git"],
    attachments: [{ filePath: "/tmp/eat-uploads/task-1/brief.md" }],
    containerUser: "0:0",
    extraReadonlyMounts: ["/opt/codex", "/etc/ssl/certs"],
    extraReadwriteMounts: ["/tmp/eat-runtime/session-1", "/tmp/project/.git"],
    networkProfile: SANDBOX_NETWORK_PROFILES.HOST,
    worktreePath: "/tmp/.eat-worktrees/project/task-1/subtask-a",
  });

  assert.equal(sandbox.networkProfile, SANDBOX_NETWORK_PROFILES.HOST);
  assert.equal(sandbox.containerUser, "0:0");
  assert.deepEqual(
    sandbox.readonlyMounts,
    ["/tmp/eat-uploads/task-1/brief.md", "/opt/codex", "/etc/ssl/certs"],
  );
  assert.deepEqual(
    sandbox.readwriteMounts,
    ["/tmp/.eat-worktrees/project/task-1/subtask-a", "/tmp/eat-runtime/session-1", "/tmp/project/.git"],
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  DockerSandboxManager,
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

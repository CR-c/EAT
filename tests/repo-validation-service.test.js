import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  REPO_VALIDATION_ERROR_CODES,
  probeRepositoryStatus,
  validateAndProbeRepository,
  validateRepositoryPath,
} from "../src/services/repo-validation-service.js";

const execFileAsync = promisify(execFile);

test("rejects a relative repository path", async () => {
  const result = await validateRepositoryPath("relative/path");

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, REPO_VALIDATION_ERROR_CODES.PATH_NOT_ABSOLUTE);
});

test("rejects a missing repository path", async () => {
  const missingPath = path.join(os.tmpdir(), `eat-missing-${Date.now()}`);
  const result = await validateRepositoryPath(missingPath);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, REPO_VALIDATION_ERROR_CODES.PATH_NOT_FOUND);
});

test("rejects a file path", async () => {
  const tempDir = await makeTempDir();

  try {
    const filePath = path.join(tempDir.path, "repo.txt");

    await writeFile(filePath, "not a directory\n", "utf8");

    const result = await validateRepositoryPath(filePath);

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, REPO_VALIDATION_ERROR_CODES.PATH_NOT_DIRECTORY);
  } finally {
    await tempDir.dispose();
  }
});

test("rejects a directory that is not a git repository", async () => {
  const tempDir = await makeTempDir();

  try {
    const repoPath = path.join(tempDir.path, "not-a-repo");

    await mkdir(repoPath);

    const result = await validateRepositoryPath(repoPath);

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, REPO_VALIDATION_ERROR_CODES.NOT_GIT_REPOSITORY);
  } finally {
    await tempDir.dispose();
  }
});

test("rejects a bare git repository", async () => {
  const tempDir = await makeTempDir();

  try {
    const bareRepoPath = path.join(tempDir.path, "bare.git");

    await runGit(tempDir.path, ["init", "--bare", bareRepoPath]);

    const result = await validateRepositoryPath(bareRepoPath);

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, REPO_VALIDATION_ERROR_CODES.BARE_GIT_REPOSITORY);
  } finally {
    await tempDir.dispose();
  }
});

test("probes default branch, current branch, dirty state, and recent branches", async () => {
  const tempDir = await makeTempDir();

  try {
    const repo = await createRepository(tempDir.path, "probe-repo", { defaultBranch: "main" });

    await commitFile(repo.repoPath, "tracked.txt", "first\n");
    await runGit(repo.repoPath, ["checkout", "-b", "feature/recent"]);
    await commitFile(repo.repoPath, "feature.txt", "feature\n");
    await runGit(repo.repoPath, ["checkout", "main"]);
    await writeFile(path.join(repo.repoPath, "dirty.txt"), "dirty\n", "utf8");

    const result = await validateAndProbeRepository(repo.repoPath);

    assert.equal(result.ok, true);
    assert.deepEqual(result.repoStatus, {
      defaultBranch: "main",
      currentBranch: "main",
      isDirty: true,
      recentBranches: ["feature/recent", "main"],
    });
  } finally {
    await tempDir.dispose();
  }
});

test("detects remote HEAD as default branch when it differs from current branch", async () => {
  const tempDir = await makeTempDir();

  try {
    const remoteRoot = path.join(tempDir.path, "remote-root");
    const localRoot = path.join(tempDir.path, "local-root");
    const remoteRepoPath = path.join(remoteRoot, "remote.git");
    const localRepoPath = path.join(localRoot, "local");

    await mkdir(remoteRoot);
    await mkdir(localRoot);
    await runGit(remoteRoot, ["init", "--bare", "--initial-branch=main", remoteRepoPath]);
    await runGit(localRoot, ["clone", remoteRepoPath, localRepoPath]);
    await configureGitIdentity(localRepoPath);
    await commitFile(localRepoPath, "README.md", "main\n");
    await runGit(localRepoPath, ["push", "-u", "origin", "main"]);
    await runGit(localRepoPath, ["checkout", "-b", "feature/work"]);
    await commitFile(localRepoPath, "feature.txt", "feature\n");

    const status = await probeRepositoryStatus(localRepoPath);

    assert.equal(status.defaultBranch, "main");
    assert.equal(status.currentBranch, "feature/work");
    assert.deepEqual(status.recentBranches, ["feature/work", "main"]);
  } finally {
    await tempDir.dispose();
  }
});

async function createRepository(rootPath, name, options = {}) {
  const repoPath = path.join(rootPath, name);
  const defaultBranch = options.defaultBranch ?? "main";

  await mkdir(repoPath);
  await runGit(rootPath, ["init", `--initial-branch=${defaultBranch}`, repoPath]);
  await configureGitIdentity(repoPath);

  return {
    repoPath,
    defaultBranch,
  };
}

async function commitFile(repoPath, fileName, content) {
  await writeFile(path.join(repoPath, fileName), content, "utf8");
  await runGit(repoPath, ["add", fileName]);
  await runGit(repoPath, ["commit", "-m", `add ${fileName}`]);
}

async function configureGitIdentity(repoPath) {
  await runGit(repoPath, ["config", "user.name", "EAT Test"]);
  await runGit(repoPath, ["config", "user.email", "eat@example.com"]);
}

async function runGit(cwd, args) {
  await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eat-repo-validation-"));

  return {
    async dispose() {
      await rm(tempDir, { recursive: true, force: true });
    },
    path: tempDir,
  };
}

import os from "node:os";
import path from "node:path";
import { access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function computeDeterministicBranchName(taskId, branchSuffix) {
  return `eat/${taskId}/${branchSuffix}`;
}

export async function resolveUniqueBranchName(repoPath, desiredBranchName) {
  let attempt = 0;

  while (true) {
    const candidate = attempt === 0 ? desiredBranchName : `${desiredBranchName}-${attempt}`;

    if (!(await branchExists(repoPath, candidate))) {
      return candidate;
    }

    attempt += 1;
  }
}

export async function ensureBranchExists(repoPath, branchName, baseCommitSha) {
  if (await branchExists(repoPath, branchName)) {
    return;
  }

  await runGit(repoPath, ["branch", branchName, baseCommitSha]);
}

export async function resolveWorktreePath(projectPath, taskId, branchSuffix) {
  const worktreeRootPath = path.join(
    os.tmpdir(),
    ".eat-worktrees",
    path.basename(projectPath),
    taskId,
  );
  const desiredPath = path.join(worktreeRootPath, branchSuffix);
  let attempt = 0;

  await mkdir(worktreeRootPath, { recursive: true });

  while (true) {
    const candidate = attempt === 0 ? desiredPath : `${desiredPath}-${attempt}`;

    if (!(await pathExists(candidate))) {
      return candidate;
    }

    attempt += 1;
  }
}

export async function ensureWorktree(repoPath, worktreePath, branchName) {
  if (await isGitWorktree(worktreePath)) {
    return;
  }

  await runGit(repoPath, ["worktree", "add", "--checkout", worktreePath, branchName]);
}

async function branchExists(repoPath, branchName) {
  try {
    await runGit(repoPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

async function isGitWorktree(worktreePath) {
  try {
    await access(path.join(worktreePath, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(repoPath, args) {
  await execFileAsync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
  });
}

import os from "node:os";
import path from "node:path";
import { access, mkdir, rm } from "node:fs/promises";
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

export async function getCurrentBranch(repoPath) {
  try {
    return await runGitString(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return null;
  }
}

export async function isWorkingTreeDirty(repoPath) {
  try {
    const output = await runGitString(repoPath, ["status", "--porcelain=v1", "--untracked-files=normal"]);
    return output.length > 0;
  } catch {
    return true;
  }
}

export async function checkoutBranch(repoPath, branchName) {
  return runGitCapture(repoPath, ["checkout", branchName]);
}

export async function mergeBranch(repoPath, sourceBranch) {
  return runGitCapture(repoPath, ["merge", "--no-ff", "--no-edit", sourceBranch]);
}

export async function abortMerge(repoPath) {
  return runGitCapture(repoPath, ["merge", "--abort"]);
}

export async function rebaseBranch(repoPath, baseBranch) {
  return runGitCapture(repoPath, ["rebase", baseBranch]);
}

export async function abortRebase(repoPath) {
  return runGitCapture(repoPath, ["rebase", "--abort"]);
}

export async function isBranchMergedInto(repoPath, sourceBranch, targetBranch = "HEAD") {
  try {
    await runGit(repoPath, ["merge-base", "--is-ancestor", sourceBranch, targetBranch]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRevision(repoPath, revision = "HEAD") {
  return runGitString(repoPath, ["rev-parse", `${revision}^{commit}`]);
}

export async function removeWorktree(repoPath, worktreePath) {
  if (!(await pathExists(worktreePath))) {
    await pruneWorktrees(repoPath);
    return { ok: true };
  }

  const removalResult = await runGitCapture(repoPath, ["worktree", "remove", "--force", worktreePath]);

  if (removalResult.ok) {
    await pruneWorktrees(repoPath);
    await rm(worktreePath, { force: true, recursive: true }).catch(() => null);

    if (!(await pathExists(worktreePath))) {
      return { ok: true };
    }

    return {
      ok: false,
      code: null,
      stderr: "Worktree path still exists after removal attempt.",
      stdout: "",
    };
  }

  return removalResult;
}

export async function pruneWorktrees(repoPath) {
  return runGitCapture(repoPath, ["worktree", "prune", "--expire", "now"]);
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

async function runGitString(repoPath, args) {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
  });

  return stdout.trim();
}

async function runGitCapture(repoPath, args) {
  try {
    const { stderr, stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });

    return {
      ok: true,
      stderr: stderr.trim(),
      stdout: stdout.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      code: typeof error?.code === "number" ? error.code : null,
      stderr: String(error?.stderr ?? "").trim(),
      stdout: String(error?.stdout ?? "").trim(),
    };
  }
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REPO_VALIDATION_ERROR_CODES = {
  PATH_NOT_ABSOLUTE: "PATH_NOT_ABSOLUTE",
  PATH_NOT_FOUND: "PATH_NOT_FOUND",
  PATH_NOT_DIRECTORY: "PATH_NOT_DIRECTORY",
  NOT_GIT_REPOSITORY: "NOT_GIT_REPOSITORY",
  BARE_GIT_REPOSITORY: "BARE_GIT_REPOSITORY",
};

const DEFAULT_RECENT_BRANCH_LIMIT = 10;

export async function validateAndProbeRepository(inputPath, options = {}) {
  const validation = await validateRepositoryPath(inputPath);

  if (!validation.ok) {
    return validation;
  }

  const repoStatus = await probeRepositoryStatus(validation.path, options);

  return {
    ok: true,
    path: validation.path,
    repoStatus,
  };
}

export async function validateRepositoryPath(inputPath) {
  if (!path.isAbsolute(inputPath)) {
    return invalid(inputPath, buildError("PATH_NOT_ABSOLUTE", "Repository path must be absolute."));
  }

  const normalizedPath = path.normalize(inputPath);
  const stats = await readPathStats(normalizedPath);

  if (!stats.exists) {
    return invalid(normalizedPath, buildError("PATH_NOT_FOUND", "Repository path does not exist."));
  }

  if (!stats.isDirectory) {
    return invalid(normalizedPath, buildError("PATH_NOT_DIRECTORY", "Repository path must be a directory."));
  }

  const canonicalPath = await fs.realpath(normalizedPath);
  const isBareRepository = await gitBoolean(canonicalPath, ["rev-parse", "--is-bare-repository"]);

  if (isBareRepository.ok && isBareRepository.value) {
    return invalid(
      canonicalPath,
      buildError("BARE_GIT_REPOSITORY", "Bare git repositories are not supported."),
    );
  }

  const insideWorkTree = await gitBoolean(canonicalPath, ["rev-parse", "--is-inside-work-tree"]);

  if (!insideWorkTree.ok || !insideWorkTree.value) {
    return invalid(
      canonicalPath,
      buildError("NOT_GIT_REPOSITORY", "The selected path is not a non-bare git repository."),
    );
  }

  return {
    ok: true,
    path: canonicalPath,
  };
}

export async function probeRepositoryStatus(repoPath, options = {}) {
  const recentBranchLimit = options.recentBranchLimit ?? DEFAULT_RECENT_BRANCH_LIMIT;
  const defaultBranch = await detectDefaultBranch(repoPath);
  const currentBranch = await detectCurrentBranch(repoPath);
  const isDirty = await detectDirtyState(repoPath);
  const recentBranches = await detectRecentBranches(repoPath, recentBranchLimit);

  return {
    defaultBranch,
    currentBranch,
    isDirty,
    recentBranches,
  };
}

async function detectDefaultBranch(repoPath) {
  const remoteHead = await gitString(repoPath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);

  if (remoteHead.ok) {
    return remoteHead.value.replace(/^origin\//, "");
  }

  const localMain = await gitString(repoPath, ["show-ref", "--verify", "--quiet", "refs/heads/main"]);

  if (localMain.ok) {
    return "main";
  }

  const localMaster = await gitString(repoPath, ["show-ref", "--verify", "--quiet", "refs/heads/master"]);

  if (localMaster.ok) {
    return "master";
  }

  const currentBranch = await detectCurrentBranch(repoPath);

  if (currentBranch !== null) {
    return currentBranch;
  }

  const recentBranches = await detectRecentBranches(repoPath, 1);

  return recentBranches[0] ?? null;
}

async function detectCurrentBranch(repoPath) {
  const currentBranch = await gitString(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);

  if (currentBranch.ok) {
    return currentBranch.value;
  }

  return null;
}

async function detectDirtyState(repoPath) {
  const status = await gitString(repoPath, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  return status.ok && status.value.length > 0;
}

async function detectRecentBranches(repoPath, limit) {
  if (limit <= 0) {
    return [];
  }

  const branches = await gitString(repoPath, [
    "for-each-ref",
    `--count=${limit}`,
    "--sort=-committerdate",
    "--format=%(refname:short)",
    "refs/heads",
  ]);

  if (!branches.ok || branches.value.length === 0) {
    return [];
  }

  return branches.value.split("\n").filter(Boolean);
}

async function readPathStats(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return {
      exists: true,
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        exists: false,
        isDirectory: false,
      };
    }

    throw error;
  }
}

async function gitBoolean(repoPath, args) {
  const result = await gitString(repoPath, args);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    value: result.value === "true",
  };
}

async function gitString(repoPath, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
    });

    return {
      ok: true,
      value: stdout.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      code: typeof error.code === "number" ? "GIT_EXIT_NON_ZERO" : error.code ?? "GIT_EXEC_ERROR",
    };
  }
}

function invalid(inputPath, error) {
  return {
    ok: false,
    path: inputPath,
    errors: [error],
  };
}

function buildError(codeKey, message) {
  return {
    code: REPO_VALIDATION_ERROR_CODES[codeKey],
    message,
  };
}

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateAndProbeRepository } from "./repo-validation-service.js";

export const PROJECT_SERVICE_ERROR_CODES = {
  INVALID_REQUEST_BODY: "INVALID_REQUEST_BODY",
  PATH_ACCESS_DENIED: "PATH_ACCESS_DENIED",
  PATH_REQUIRED: "PATH_REQUIRED",
  PROJECT_ALREADY_REGISTERED: "PROJECT_ALREADY_REGISTERED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
};

const DEFAULT_DIRECTORY_ENTRY_LIMIT = 200;

export class ProjectService {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository;
  }

  async registerProject(input) {
    const projectPath = input?.path;

    if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
      return failure(
        PROJECT_SERVICE_ERROR_CODES.PATH_REQUIRED,
        "Project path is required.",
      );
    }

    const validation = await validateAndProbeRepository(projectPath.trim());

    if (!validation.ok) {
      return {
        ok: false,
        error: validation.errors[0],
      };
    }

    const existingProject = await this.projectRepository.findProjectByPath(validation.path);

    if (existingProject) {
      return failure(
        PROJECT_SERVICE_ERROR_CODES.PROJECT_ALREADY_REGISTERED,
        "A project with the same normalized path is already registered.",
        { projectId: existingProject.id, path: existingProject.path },
      );
    }

    const project = await this.projectRepository.createProject({
      defaultBranch: validation.repoStatus.defaultBranch,
      name: path.basename(validation.path),
      path: validation.path,
    });

    return {
      ok: true,
      project,
      repoStatus: validation.repoStatus,
    };
  }

  async listProjects() {
    return {
      ok: true,
      projects: await this.projectRepository.listProjects(),
    };
  }

  async browseDirectories(input = {}) {
    const includeHidden = input?.includeHidden === true;
    const requestedPath = typeof input?.path === "string" && input.path.trim().length > 0
      ? input.path.trim()
      : os.homedir();

    const normalizedPath = normalizeDirectoryPath(requestedPath);

    if (!path.isAbsolute(normalizedPath)) {
      return failure("PATH_NOT_ABSOLUTE", "Directory path must be absolute.");
    }

    const directoryStats = await readDirectoryStats(normalizedPath);

    if (!directoryStats.ok) {
      return failure(directoryStats.code, directoryStats.message, { path: normalizedPath });
    }

    const currentPath = directoryStats.path;
    let entries;
    let roots;
    let isGitRepository;

    try {
      [entries, roots, isGitRepository] = await Promise.all([
        readDirectoryEntries(currentPath, { includeHidden }),
        buildDirectoryRoots(currentPath),
        hasGitMarker(currentPath),
      ]);
    } catch (error) {
      if (error?.code === PROJECT_SERVICE_ERROR_CODES.PATH_ACCESS_DENIED) {
        return failure(error.code, error.message, error.details);
      }

      throw error;
    }

    return {
      ok: true,
      currentPath,
      entries,
      isGitRepository,
      parentPath: getParentDirectory(currentPath),
      roots,
    };
  }

  async getProject(projectId) {
    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(
        PROJECT_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND,
        "Project not found.",
        { projectId },
      );
    }

    const validation = await validateAndProbeRepository(project.path);

    if (!validation.ok) {
      return {
        ok: false,
        error: validation.errors[0],
      };
    }

    return {
      ok: true,
      project,
      repoStatus: validation.repoStatus,
    };
  }

  async getProjectRepoStatus(projectId) {
    const project = await this.projectRepository.findProjectById(projectId);

    if (!project) {
      return failure(
        PROJECT_SERVICE_ERROR_CODES.PROJECT_NOT_FOUND,
        "Project not found.",
        { projectId },
      );
    }

    const validation = await validateAndProbeRepository(project.path);

    if (!validation.ok) {
      return {
        ok: false,
        error: validation.errors[0],
      };
    }

    return {
      ok: true,
      projectId: project.id,
      repoStatus: validation.repoStatus,
    };
  }
}

function failure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function normalizeDirectoryPath(targetPath) {
  if (targetPath === path.sep) {
    return path.sep;
  }

  return path.normalize(targetPath);
}

async function readDirectoryStats(targetPath) {
  let stats;

  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: false,
        code: "PATH_NOT_FOUND",
        message: "Directory path does not exist.",
      };
    }

    if (error?.code === "EACCES" || error?.code === "EPERM") {
      return {
        ok: false,
        code: PROJECT_SERVICE_ERROR_CODES.PATH_ACCESS_DENIED,
        message: "Directory path cannot be read.",
      };
    }

    throw error;
  }

  if (!stats.isDirectory()) {
    return {
      ok: false,
      code: "PATH_NOT_DIRECTORY",
      message: "Directory path must point to a directory.",
    };
  }

  try {
    return {
      ok: true,
      path: await fs.realpath(targetPath),
    };
  } catch (error) {
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      return {
        ok: false,
        code: PROJECT_SERVICE_ERROR_CODES.PATH_ACCESS_DENIED,
        message: "Directory path cannot be read.",
      };
    }

    throw error;
  }
}

async function readDirectoryEntries(currentPath, options = {}) {
  const includeHidden = options.includeHidden === true;
  let dirents;

  try {
    dirents = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      throw {
        code: PROJECT_SERVICE_ERROR_CODES.PATH_ACCESS_DENIED,
        details: { path: currentPath },
        message: "Directory path cannot be read.",
      };
    }

    throw error;
  }

  const directories = [];

  for (const entry of dirents) {
    if (!includeHidden && entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(currentPath, entry.name);
    const directoryMetadata = await readDirectoryEntryMetadata(entry, entryPath);

    if (!directoryMetadata) {
      continue;
    }

    directories.push({
      isGitRepository: directoryMetadata.isGitRepository,
      isSymlink: directoryMetadata.isSymlink,
      name: entry.name,
      path: entryPath,
    });
  }

  directories.sort((left, right) => {
    if (left.isGitRepository !== right.isGitRepository) {
      return left.isGitRepository ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return directories.slice(0, DEFAULT_DIRECTORY_ENTRY_LIMIT);
}

async function readDirectoryEntryMetadata(entry, entryPath) {
  if (entry.isDirectory()) {
    return {
      isGitRepository: await hasGitMarker(entryPath),
      isSymlink: false,
    };
  }

  if (!entry.isSymbolicLink()) {
    return null;
  }

  try {
    const stats = await fs.stat(entryPath);

    if (!stats.isDirectory()) {
      return null;
    }

    return {
      isGitRepository: await hasGitMarker(entryPath),
      isSymlink: true,
    };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EACCES" || error?.code === "EPERM") {
      return null;
    }

    throw error;
  }
}

async function hasGitMarker(targetPath) {
  try {
    await fs.stat(path.join(targetPath, ".git"));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    if (error?.code === "EACCES" || error?.code === "EPERM") {
      return false;
    }

    throw error;
  }
}

async function buildDirectoryRoots(currentPath) {
  const candidates = [
    { kind: "root", path: path.parse(currentPath).root || path.sep },
    { kind: "home", path: os.homedir() },
    { kind: "workspace", path: process.cwd() },
  ];
  const seenPaths = new Set();
  const roots = [];

  for (const candidate of candidates) {
    if (!candidate.path) {
      continue;
    }

    try {
      const resolvedPath = await fs.realpath(candidate.path);

      if (seenPaths.has(resolvedPath)) {
        continue;
      }

      seenPaths.add(resolvedPath);
      roots.push({
        kind: candidate.kind,
        path: resolvedPath,
      });
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES" || error?.code === "EPERM") {
        continue;
      }

      throw error;
    }
  }

  return roots;
}

function getParentDirectory(currentPath) {
  const parentPath = path.dirname(currentPath);
  return parentPath === currentPath ? null : parentPath;
}

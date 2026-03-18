import path from "node:path";

import { validateAndProbeRepository } from "./repo-validation-service.js";

export const PROJECT_SERVICE_ERROR_CODES = {
  INVALID_REQUEST_BODY: "INVALID_REQUEST_BODY",
  PATH_REQUIRED: "PATH_REQUIRED",
  PROJECT_ALREADY_REGISTERED: "PROJECT_ALREADY_REGISTERED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
};

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

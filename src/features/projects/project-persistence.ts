import { Prisma, type PrismaClient, type Project } from "@prisma/client";
import path from "node:path";

import { normalizeProjectPath } from "../../lib/project-path.js";

export interface PersistProjectInput {
  name?: string;
  path: string;
  defaultBranch: string;
}

export class ProjectPersistenceConflictError extends Error {
  constructor(projectPath: string) {
    super(`Project already exists for normalized path: ${projectPath}`);
    this.name = "ProjectPersistenceConflictError";
  }
}

export class ProjectPersistenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPersistenceValidationError";
  }
}

function normalizeProjectName(input: PersistProjectInput, normalizedPath: string): string {
  const normalizedName = input.name?.trim();

  if (normalizedName && normalizedName.length > 0) {
    return normalizedName;
  }

  return path.basename(normalizedPath);
}

function normalizeDefaultBranch(defaultBranch: string): string {
  const normalizedDefaultBranch = defaultBranch.trim();

  if (normalizedDefaultBranch.length === 0) {
    throw new ProjectPersistenceValidationError("Default branch is required.");
  }

  return normalizedDefaultBranch;
}

export async function persistProjectMetadata(
  prisma: PrismaClient,
  input: PersistProjectInput,
): Promise<Project> {
  const normalizedPath = normalizeProjectPath(input.path);
  const projectName = normalizeProjectName(input, normalizedPath);
  const defaultBranch = normalizeDefaultBranch(input.defaultBranch);

  try {
    return await prisma.project.create({
      data: {
        name: projectName,
        path: normalizedPath,
        defaultBranch,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ProjectPersistenceConflictError(normalizedPath);
    }

    throw error;
  }
}

export async function listProjects(prisma: PrismaClient): Promise<Project[]> {
  return prisma.project.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
}

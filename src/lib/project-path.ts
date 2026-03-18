import path from "node:path";

export class ProjectPathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPathValidationError";
  }
}

export function normalizeProjectPath(inputPath: string): string {
  const trimmedPath = inputPath.trim();

  if (trimmedPath.length === 0) {
    throw new ProjectPathValidationError("Project path is required.");
  }

  if (!path.isAbsolute(trimmedPath)) {
    throw new ProjectPathValidationError("Project path must be absolute.");
  }

  return path.normalize(trimmedPath);
}

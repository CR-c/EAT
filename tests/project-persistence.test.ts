import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listProjects,
  persistProjectMetadata,
  ProjectPersistenceConflictError,
  ProjectPersistenceValidationError,
} from "../src/features/projects/project-persistence.js";
import {
  normalizeProjectPath,
  ProjectPathValidationError,
} from "../src/lib/project-path.js";
import { createPrismaClient } from "../src/lib/prisma.js";

const tempDirectories: string[] = [];

async function createTestPrismaClient() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eat-prisma-test-"));
  const databasePath = path.join(tempDir, "test.db");
  tempDirectories.push(tempDir);

  const databaseUrl = `file:${databasePath}`;
  const prisma = createPrismaClient(databaseUrl);
  const migrationSqlPath = path.join(
    process.cwd(),
    "prisma/migrations/20260318000000_init_project/migration.sql",
  );
  const migrationSql = await readFile(migrationSqlPath, "utf8");
  const statements = migrationSql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }

  return prisma;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((tempDir) =>
      rm(tempDir, { recursive: true, force: true }),
    ),
  );
});

describe("normalizeProjectPath", () => {
  it("normalizes an absolute path before persistence", () => {
    expect(normalizeProjectPath("/home/code/EAT/../EAT/.")).toBe("/home/code/EAT");
  });

  it("rejects a relative path", () => {
    expect(() => normalizeProjectPath("./EAT")).toThrow(ProjectPathValidationError);
  });
});

describe("persistProjectMetadata", () => {
  it("persists canonical project metadata including defaultBranch", async () => {
    const prisma = await createTestPrismaClient();

    const project = await persistProjectMetadata(prisma, {
      name: "EAT",
      path: "/home/code/EAT/../EAT/.",
      defaultBranch: "main",
    });

    expect(project.name).toBe("EAT");
    expect(project.path).toBe("/home/code/EAT");
    expect(project.defaultBranch).toBe("main");

    const projects = await listProjects(prisma);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.path).toBe("/home/code/EAT");

    await prisma.$disconnect();
  });

  it("rejects duplicate registrations after path normalization", async () => {
    const prisma = await createTestPrismaClient();

    await persistProjectMetadata(prisma, {
      path: "/home/code/EAT",
      defaultBranch: "main",
    });

    await expect(
      persistProjectMetadata(prisma, {
        path: "/home/code/EAT/.",
        defaultBranch: "main",
      }),
    ).rejects.toThrow(ProjectPersistenceConflictError);

    await prisma.$disconnect();
  });

  it("rejects an empty defaultBranch", async () => {
    const prisma = await createTestPrismaClient();

    await expect(
      persistProjectMetadata(prisma, {
        path: "/home/code/EAT",
        defaultBranch: "   ",
      }),
    ).rejects.toThrow(ProjectPersistenceValidationError);

    await prisma.$disconnect();
  });
});

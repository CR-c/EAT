import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabaseConnection, DEFAULT_DATABASE_PATH } from "./database.js";

export class SqliteProjectRepository {
  constructor(options = {}) {
    this.databasePath = options.databasePath ?? DEFAULT_DATABASE_PATH;
    this.database = null;
  }

  async listProjects() {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          name,
          path,
          default_branch AS defaultBranch,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM projects
        ORDER BY name COLLATE NOCASE ASC, created_at ASC
      `)
      .all();
  }

  async findProjectById(projectId) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          name,
          path,
          default_branch AS defaultBranch,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM projects
        WHERE id = ?
      `)
      .get(projectId) ?? null;
  }

  async findProjectByPath(projectPath) {
    return this.#getDatabase()
      .prepare(`
        SELECT
          id,
          name,
          path,
          default_branch AS defaultBranch,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM projects
        WHERE path = ?
      `)
      .get(projectPath) ?? null;
  }

  async createProject({ defaultBranch, name, path: projectPath }) {
    const timestamp = new Date().toISOString();
    const project = {
      id: randomUUID(),
      name,
      path: projectPath,
      defaultBranch,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#getDatabase()
      .prepare(`
        INSERT INTO projects (
          id,
          name,
          path,
          default_branch,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        project.id,
        project.name,
        project.path,
        project.defaultBranch,
        project.createdAt,
        project.updatedAt,
      );

    return project;
  }

  close() {
    if (this.database) {
      this.database.close();
      this.database = null;
    }
  }

  #getDatabase() {
    if (!this.database) {
      this.database = createDatabaseConnection(this.databasePath);
    }

    return this.database;
  }
}

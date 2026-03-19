import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const DEFAULT_DATABASE_PATH = path.resolve(process.cwd(), ".eat", "eat.db");

const migrationsDirectoryPath = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

export function createDatabaseConnection(databasePath = DEFAULT_DATABASE_PATH) {
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedMigrationNames = new Set(
    database.prepare("SELECT name FROM schema_migrations ORDER BY name ASC").all().map((row) => row.name),
  );
  const insertAppliedMigration = database.prepare(`
    INSERT INTO schema_migrations (name, applied_at)
    VALUES (?, ?)
  `);

  for (const migration of listMigrationFiles()) {
    if (appliedMigrationNames.has(migration.name)) {
      continue;
    }

    database.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      database.exec(readFileSync(migration.filePath, "utf8"));
      insertAppliedMigration.run(migration.name, new Date().toISOString());
      database.exec("COMMIT");
      appliedMigrationNames.add(migration.name);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return database;
}

function listMigrationFiles() {
  return readdirSync(migrationsDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(migrationsDirectoryPath, entry.name, "migration.sql"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

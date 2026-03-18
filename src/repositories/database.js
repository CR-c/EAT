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

  for (const migrationFilePath of listMigrationFilePaths()) {
    database.exec(readFileSync(migrationFilePath, "utf8"));
  }

  return database;
}

function listMigrationFilePaths() {
  return readdirSync(migrationsDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDirectoryPath, entry.name, "migration.sql"))
    .sort((left, right) => left.localeCompare(right));
}

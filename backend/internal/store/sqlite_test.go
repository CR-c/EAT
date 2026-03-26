package store

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenAppliesRepositoryMigrations(t *testing.T) {
	tempDir := t.TempDir()

	db, err := Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRowContext(context.Background(),
		"SELECT COUNT(*) FROM schema_migrations",
	).Scan(&count); err != nil {
		t.Fatalf("count migrations: %v", err)
	}

	if count == 0 {
		t.Fatal("expected repository migrations to be applied")
	}
}

func TestOpenHonorsExplicitMigrationsDirectory(t *testing.T) {
	tempDir := t.TempDir()
	migrationsDir := filepath.Join(tempDir, "migrations")
	migrationPath := filepath.Join(migrationsDir, "0001_test", "migration.sql")

	if err := os.MkdirAll(filepath.Dir(migrationPath), 0o755); err != nil {
		t.Fatalf("mkdir migration dir: %v", err)
	}
	if err := os.WriteFile(migrationPath, []byte("CREATE TABLE explicit_test (id TEXT PRIMARY KEY);"), 0o644); err != nil {
		t.Fatalf("write migration: %v", err)
	}

	t.Setenv("EAT_MIGRATIONS_DIR", migrationsDir)

	db, err := Open(filepath.Join(tempDir, "explicit.db"))
	if err != nil {
		t.Fatalf("open db with explicit migrations dir: %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRowContext(context.Background(),
		"SELECT COUNT(*) FROM schema_migrations WHERE name = ?",
		"0001_test",
	).Scan(&count); err != nil {
		t.Fatalf("count explicit migration: %v", err)
	}

	if count != 1 {
		t.Fatalf("expected explicit migration to be applied once, got %d", count)
	}
}

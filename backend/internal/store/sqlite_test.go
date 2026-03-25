package store

import (
	"context"
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

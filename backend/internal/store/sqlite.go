package store

import (
	"context"
	"database/sql"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
	migrationsDir string
}

func Open(databasePath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o755); err != nil {
		return nil, err
	}

	sqlDB, err := sql.Open("sqlite3", databasePath)
	if err != nil {
		return nil, err
	}

	db := &DB{
		DB:            sqlDB,
		migrationsDir: defaultMigrationsDir(),
	}

	pragmas := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
	}
	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			_ = db.Close()
			return nil, err
		}
	}

	if err := db.ensureSchemaMigrationsTable(); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := db.ApplyMigrations(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func (db *DB) ensureSchemaMigrationsTable() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY NOT NULL,
			applied_at TEXT NOT NULL
		)
	`)
	return err
}

func (db *DB) ApplyMigrations(ctx context.Context) error {
	entries, err := os.ReadDir(db.migrationsDir)
	if err != nil {
		return err
	}

	migrationDirs := make([]fs.DirEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			migrationDirs = append(migrationDirs, entry)
		}
	}

	sort.Slice(migrationDirs, func(i, j int) bool {
		return migrationDirs[i].Name() < migrationDirs[j].Name()
	})

	applied, err := db.appliedMigrationSet(ctx)
	if err != nil {
		return err
	}

	for _, entry := range migrationDirs {
		if applied[entry.Name()] {
			continue
		}

		filePath := filepath.Join(db.migrationsDir, entry.Name(), "migration.sql")
		sqlBytes, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}

		if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback()
			return err
		}

		if _, err := tx.ExecContext(ctx,
			"INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
			entry.Name(),
			time.Now().UTC().Format(time.RFC3339Nano),
		); err != nil {
			_ = tx.Rollback()
			return err
		}

		if err := tx.Commit(); err != nil {
			return err
		}
	}

	return nil
}

func (db *DB) appliedMigrationSet(ctx context.Context) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM schema_migrations ORDER BY name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		result[name] = true
	}

	return result, rows.Err()
}

func defaultMigrationsDir() string {
	if explicitPath := os.Getenv("EAT_MIGRATIONS_DIR"); explicitPath != "" {
		return filepath.Clean(explicitPath)
	}

	if executablePath, err := os.Executable(); err == nil {
		executableDir := filepath.Dir(executablePath)
		candidates := []string{
			filepath.Join(executableDir, "..", "prisma", "migrations"),
			filepath.Join(executableDir, "prisma", "migrations"),
		}
		for _, candidate := range candidates {
			if info, statErr := os.Stat(candidate); statErr == nil && info.IsDir() {
				return filepath.Clean(candidate)
			}
		}
	}

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		panic(errors.New("unable to resolve store source location"))
	}

	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../../../prisma/migrations"))
}

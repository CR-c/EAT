-- Phase 0.1: Add version column for optimistic locking (P4)
ALTER TABLE sub_tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

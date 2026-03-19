CREATE TABLE IF NOT EXISTS plan_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_snapshots_task_id_created_at
  ON plan_snapshots(task_id, created_at, id);

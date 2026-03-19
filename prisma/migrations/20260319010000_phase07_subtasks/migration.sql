CREATE TABLE IF NOT EXISTS sub_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  branch_suffix TEXT NOT NULL,
  branch_name TEXT,
  worktree_path TEXT,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  auto_assigned INTEGER NOT NULL DEFAULT 1,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sub_tasks_task_id_created_at
  ON sub_tasks(task_id, created_at, id);

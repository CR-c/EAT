CREATE TABLE IF NOT EXISTS merge_records (
  id TEXT PRIMARY KEY,
  sub_task_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  operation TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  status TEXT NOT NULL,
  result_commit_sha TEXT,
  conflict_summary TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_merge_records_sub_task_id_created_at
  ON merge_records(sub_task_id, created_at, id);

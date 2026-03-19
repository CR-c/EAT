ALTER TABLE sub_tasks
  ADD COLUMN latest_review_decision TEXT;

ALTER TABLE sub_tasks
  ADD COLUMN latest_review_phase TEXT;

ALTER TABLE sub_tasks
  ADD COLUMN latest_review_summary TEXT;

CREATE TABLE IF NOT EXISTS review_records (
  id TEXT PRIMARY KEY,
  sub_task_id TEXT NOT NULL,
  session_id TEXT,
  phase TEXT NOT NULL,
  decision TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_review_records_sub_task_id_created_at
  ON review_records(sub_task_id, created_at, id);

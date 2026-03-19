CREATE TABLE IF NOT EXISTS integration_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  integration_branch TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_runs_task_id_created_at
  ON integration_runs(task_id, created_at, id);

CREATE TABLE IF NOT EXISTS integration_queue_items (
  id TEXT PRIMARY KEY,
  integration_run_id TEXT NOT NULL,
  sub_task_id TEXT NOT NULL,
  queue_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  merged_commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (integration_run_id) REFERENCES integration_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_queue_items_run_id_queue_order
  ON integration_queue_items(integration_run_id, queue_order, id);

CREATE TABLE IF NOT EXISTS gate_results (
  id TEXT PRIMARY KEY,
  integration_run_id TEXT NOT NULL,
  gate_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (integration_run_id) REFERENCES integration_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gate_results_run_id_created_at
  ON gate_results(integration_run_id, created_at, id);

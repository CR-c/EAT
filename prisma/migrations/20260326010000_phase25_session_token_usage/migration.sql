CREATE TABLE IF NOT EXISTS session_token_usage (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sub_task_id TEXT,
  agent_type TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_token_usage_task_id
  ON session_token_usage(task_id, agent_type, updated_at);

CREATE INDEX IF NOT EXISTS idx_session_token_usage_project_id
  ON session_token_usage(project_id, agent_type, updated_at);

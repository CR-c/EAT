CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  lead_agent_type TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_commit_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  plan_version INTEGER NOT NULL DEFAULT 0,
  current_plan_json TEXT,
  approved_plan_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id_created_at
  ON tasks(project_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sub_task_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_task_id_created_at
  ON messages(task_id, created_at, id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id_created_at
  ON attachments(task_id, created_at, id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sub_task_id TEXT,
  agent_type TEXT NOT NULL,
  session_type TEXT NOT NULL,
  sandbox_type TEXT NOT NULL,
  container_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  pid INTEGER,
  started_at TEXT,
  ended_at TEXT,
  exit_code INTEGER,
  log_path TEXT,
  output_buffer TEXT NOT NULL DEFAULT '',
  output_buffer_max_bytes INTEGER NOT NULL DEFAULT 65536,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_task_id_created_at
  ON agent_sessions(task_id, created_at, id);

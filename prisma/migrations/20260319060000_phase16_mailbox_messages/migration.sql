CREATE TABLE IF NOT EXISTS mailbox_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_sub_task_id TEXT,
  target_type TEXT NOT NULL,
  target_sub_task_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (target_sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_task_id_created_at
  ON mailbox_messages(task_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_target_sub_task_id_created_at
  ON mailbox_messages(target_sub_task_id, created_at, id);

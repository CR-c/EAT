ALTER TABLE mailbox_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'NOTE';
ALTER TABLE mailbox_messages ADD COLUMN artifact_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mailbox_messages ADD COLUMN file_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mailbox_messages ADD COLUMN branch_ref TEXT;
ALTER TABLE mailbox_messages ADD COLUMN schema_json TEXT;
ALTER TABLE mailbox_messages ADD COLUMN requires_ack INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_task_id_message_type_created_at
  ON mailbox_messages(task_id, message_type, created_at, id);

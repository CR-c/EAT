ALTER TABLE review_records RENAME TO review_records_old;

CREATE TABLE review_records (
  id TEXT PRIMARY KEY,
  sub_task_id TEXT NOT NULL,
  session_id TEXT,
  phase TEXT NOT NULL,
  decision TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO review_records (
  id,
  sub_task_id,
  session_id,
  phase,
  decision,
  summary,
  created_at
)
SELECT
  id,
  sub_task_id,
  session_id,
  phase,
  decision,
  summary,
  created_at
FROM review_records_old;

DROP TABLE review_records_old;

CREATE INDEX idx_review_records_sub_task_id_created_at
  ON review_records(sub_task_id, created_at, id);

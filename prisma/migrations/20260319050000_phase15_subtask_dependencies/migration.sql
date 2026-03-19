ALTER TABLE sub_tasks
  ADD COLUMN dependency_branch_suffixes_json TEXT NOT NULL DEFAULT '[]';

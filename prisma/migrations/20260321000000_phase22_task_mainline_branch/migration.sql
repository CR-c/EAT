ALTER TABLE tasks
  ADD COLUMN task_branch_name TEXT;

UPDATE tasks
SET task_branch_name = base_branch
WHERE task_branch_name IS NULL;

ALTER TABLE sub_tasks
  ADD COLUMN start_commit_sha TEXT;

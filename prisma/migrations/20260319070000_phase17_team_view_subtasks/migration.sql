ALTER TABLE sub_tasks
  ADD COLUMN role TEXT;

ALTER TABLE sub_tasks
  ADD COLUMN display_name TEXT;

ALTER TABLE sub_tasks
  ADD COLUMN execution_order INTEGER;

ALTER TABLE sub_tasks
  ADD COLUMN assignment_source TEXT;

ALTER TABLE sub_tasks
  ADD COLUMN run_summary TEXT;

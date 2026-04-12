ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE tasks ADD COLUMN plan_origin TEXT;

UPDATE tasks
SET task_type = CASE
  WHEN current_plan_json IS NOT NULL AND instr(lower(current_plan_json), '"template_id"') > 0 THEN 'GUIDED'
  ELSE 'NORMAL'
END
WHERE task_type IS NULL OR task_type = '';

UPDATE tasks
SET plan_origin = CASE
  WHEN current_plan_json IS NULL AND approved_plan_json IS NULL THEN 'NONE'
  WHEN current_plan_json IS NOT NULL AND instr(lower(current_plan_json), '"template_id"') > 0 AND task_type = 'NORMAL' THEN 'AUTO_GENERATED'
  WHEN current_plan_json IS NOT NULL AND instr(lower(current_plan_json), '"template_id"') > 0 AND task_type = 'GUIDED' THEN 'TEMPLATE_SEEDED'
  WHEN approved_plan_json IS NOT NULL THEN 'APPROVED'
  ELSE 'USER_EDITED'
END
WHERE plan_origin IS NULL OR plan_origin = '';

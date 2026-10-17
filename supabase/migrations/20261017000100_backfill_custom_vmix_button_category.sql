-- Repair legacy rows where the column default masked the category stored in commands.
-- Keep explicitly chosen non-default categories unchanged.
UPDATE public.custom_vmix_buttons
SET category = COALESCE(NULLIF(commands->0->>'_buttonCategory', ''), 'OUTROS')
WHERE category = 'AUDIO'
  AND NULLIF(commands->0->>'_buttonCategory', '') IS NOT NULL;

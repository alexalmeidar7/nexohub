-- Recover legacy button categories from any command, not only the first command.
-- This is idempotent and preserves the command payload and all interaction history.
-- Existing AUDIO defaults are replaced only when recovering the original category
-- from command metadata, or with OUTROS when no category metadata exists.
UPDATE public.custom_vmix_buttons AS button
SET category = COALESCE(
  (SELECT NULLIF(command->>'_buttonCategory', '')
   FROM jsonb_array_elements(COALESCE(button.commands, '[]'::jsonb)) AS command
   WHERE NULLIF(command->>'_buttonCategory', '') IS NOT NULL
   LIMIT 1),
  NULLIF(button.category, 'AUDIO'),
  'OUTROS'
)
WHERE button.category IS NULL OR button.category = 'AUDIO' OR button.category = '';

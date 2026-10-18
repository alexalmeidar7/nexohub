-- Restore categories that were saved only in the first command's JSON metadata.
-- The earlier migration defaulted every existing row to AUDIO, so preserve the
-- legacy selected category when the persisted column still contains that default.
UPDATE public.custom_vmix_buttons
SET category = upper(btrim(commands->0->>'_buttonCategory'))
WHERE category = 'AUDIO'
  AND NULLIF(btrim(commands->0->>'_buttonCategory'), '') IS NOT NULL
  AND upper(btrim(commands->0->>'_buttonCategory')) <> 'AUDIO';

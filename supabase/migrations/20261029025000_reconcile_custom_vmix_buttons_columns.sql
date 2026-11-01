-- Restore the additive custom vMix button fields used by House Mix UI.
-- Existing custom_vmix_buttons rows are preserved. This migration adds missing
-- UI fields and normalizes only NULL/blank categories to AUDIO.

ALTER TABLE public.custom_vmix_buttons
  ADD COLUMN IF NOT EXISTS shortcut text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'AUDIO',
  ADD COLUMN IF NOT EXISTS estudio text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS data_especifica date;

-- Match the original category migration while preserving all non-empty values.
UPDATE public.custom_vmix_buttons
SET category = 'AUDIO'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE public.custom_vmix_buttons
  ALTER COLUMN category SET DEFAULT 'AUDIO',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN color SET DEFAULT '#f59e0b';

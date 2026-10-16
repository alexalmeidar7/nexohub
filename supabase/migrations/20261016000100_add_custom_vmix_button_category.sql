-- Add a persisted category for custom vMix buttons.
ALTER TABLE public.custom_vmix_buttons
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'AUDIO';

UPDATE public.custom_vmix_buttons
SET category = 'AUDIO'
WHERE category IS NULL OR btrim(category) = '';

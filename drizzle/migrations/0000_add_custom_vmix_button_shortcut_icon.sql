ALTER TABLE public.custom_vmix_buttons
  ADD COLUMN IF NOT EXISTS shortcut text,
  ADD COLUMN IF NOT EXISTS icon text;
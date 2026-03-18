ALTER TABLE public.user_settings 
  ADD COLUMN IF NOT EXISTS vmix_user text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vmix_pass text DEFAULT '';
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS vmix_input_mapping JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_settings.vmix_input_mapping IS 'Stores associations between vMix input keys (GUIDs) and their titles for fallback resolution.';
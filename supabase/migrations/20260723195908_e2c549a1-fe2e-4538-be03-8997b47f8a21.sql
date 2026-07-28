ALTER TABLE public.vmix_connections
  ADD COLUMN IF NOT EXISTS last_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ndi_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;

COMMENT ON COLUMN public.vmix_connections.last_inputs IS 'Ultimo snapshot de inputs retornado pela API XML do vMix.';
COMMENT ON COLUMN public.vmix_connections.last_state IS 'Estado operacional sincronizado do vMix: program, preview, stream, recording e overlays.';
COMMENT ON COLUMN public.vmix_connections.ndi_sources IS 'Fontes NDI vistas pelo vMix e armazenadas para hidratacao rapida do painel.';
COMMENT ON COLUMN public.vmix_connections.last_synced_at IS 'Data/hora da ultima sincronizacao bem-sucedida com o vMix.';
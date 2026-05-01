-- Add event_types_config to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS event_types_config JSONB DEFAULT '{
  "live": {"color": "#2563eb", "label": "LIVE"},
  "gravacao": {"color": "#ef4444", "label": "GRAVAÇÃO"},
  "reuniao": {"color": "#8b5cf6", "label": "REUNIÃO"},
  "outro": {"color": "#6b7280", "label": "OUTRO"}
}'::jsonb;

COMMENT ON COLUMN public.profiles.event_types_config IS 'Configuração personalizada de cores e rótulos para tipos de eventos na agenda.';
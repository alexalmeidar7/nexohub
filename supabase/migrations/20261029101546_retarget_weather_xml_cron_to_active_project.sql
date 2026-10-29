-- Enable the supported Supabase scheduling and async HTTP extensions.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Retarget the weather XML updater to the active House Mix Supabase project.
-- The function is configured with verify_jwt = false and uses its own service
-- role key from Edge Function secrets, so no privileged key is stored in cron SQL.
DO $$
BEGIN
  PERFORM cron.unschedule('update-weather-xml-60s');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'update-weather-xml-60s',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/update-weather-xml',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

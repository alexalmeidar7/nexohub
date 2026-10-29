-- Retarget the weather XML updater to the active House Mix Supabase project.
-- Keep a single job name and make the migration safe to re-run.
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

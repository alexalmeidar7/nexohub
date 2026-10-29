-- Keep a single weather updater schedule. Older migrations created
-- overlapping jobs (15 min, 5 min and 1 min) without consistently removing
-- the previous names, which can trigger redundant provider requests.
DO $$
BEGIN
  PERFORM cron.unschedule('update-weather-xml-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('update-weather-xml-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('update-weather-xml-every-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('update-weather-xml-60s');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'update-weather-xml-60s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/update-weather-xml',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

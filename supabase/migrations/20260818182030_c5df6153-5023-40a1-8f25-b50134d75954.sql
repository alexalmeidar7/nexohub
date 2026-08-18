SELECT cron.schedule(
  'update-weather-xml-60s',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/update-weather-xml',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
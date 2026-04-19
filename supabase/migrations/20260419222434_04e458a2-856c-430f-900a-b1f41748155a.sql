
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove old job if exists
DO $$ BEGIN
  PERFORM cron.unschedule('update-weather-xml-every-5min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'update-weather-xml-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/update-weather-xml',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6amZ6eHh2eGJzcGJka29kb2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTUxNDEsImV4cCI6MjA4Njg3MTE0MX0.isUmXafM1scN8AogofAEw5ffcVZSZX4ff-WVusaB1OU"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

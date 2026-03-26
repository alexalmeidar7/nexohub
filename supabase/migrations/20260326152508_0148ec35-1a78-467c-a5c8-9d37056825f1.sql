
-- Remove old job and recreate with direct URL
SELECT cron.unschedule('vmix-scheduler-every-minute');

SELECT cron.schedule(
  'vmix-scheduler-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/vmix-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6amZ6eHh2eGJzcGJka29kb2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTUxNDEsImV4cCI6MjA4Njg3MTE0MX0.isUmXafM1scN8AogofAEw5ffcVZSZX4ff-WVusaB1OU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

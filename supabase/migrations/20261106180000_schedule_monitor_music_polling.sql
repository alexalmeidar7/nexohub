-- Schedule monitor-music function to poll music sources every minute
-- This ensures real-time updates of current music from XML sources or local files

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any old monitor-music jobs
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'monitor-music%';

-- Schedule monitor-music to run every minute (60 seconds)
-- This polls all users' XML sources and records current music instantly
SELECT cron.schedule(
  'monitor-music-every-minute',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/monitor-music',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 50000
    );
  $job$
);

-- The forecast does not need to be rebuilt every minute. The old worker
-- repeatedly re-downloaded the same icon PNGs and occasionally ran for 45-60s.
-- Keep the public XML fresh while preventing overlapping cron executions.
DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('update-weather-xml-60s', 'update-weather-xml-5m')
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'update-weather-xml-5m',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/update-weather-xml',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb
      ) AS request_id;
    $job$
  );
END $$;

-- Agenda a execução da função a cada minuto para processar roteiros agendados
SELECT cron.schedule(
  'process-scheduled-roteiros-every-minute',
  '* * * * *',
  $$ SELECT net.http_post(
    url := '${process.env.SUPABASE_URL}/functions/v1/process-scheduled-roteiros',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ${process.env.SUPABASE_ANON_KEY}')
  ) $$
);

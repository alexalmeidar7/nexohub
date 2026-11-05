-- Leituras individuais de audiência (uma a cada 15 minutos) para calcular a média por programa.
-- Migration aditiva: não altera nem remove dados de audiencia_historico.
create table if not exists public.audiencia_amostras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  programa text not null,
  audio integer,
  video integer,
  coletado_em timestamptz not null default now()
);

create index if not exists audiencia_amostras_user_coletado_idx
  on public.audiencia_amostras (user_id, coletado_em desc);

alter table public.audiencia_amostras enable row level security;

drop policy if exists "audiencia_amostras_select_own" on public.audiencia_amostras;
create policy "audiencia_amostras_select_own"
  on public.audiencia_amostras for select to authenticated
  using (user_id = auth.uid());

revoke all on public.audiencia_amostras from anon;
grant select on public.audiencia_amostras to authenticated;
grant all on public.audiencia_amostras to service_role;

-- A coleta passa de 5 para 15 minutos. Só troca o agendamento; nenhum dado é apagado.
select cron.unschedule(jobid) from cron.job where jobname in ('collect-audience-every-five-minutes', 'collect-audience-every-15-minutes');

select cron.schedule(
  'collect-audience-every-15-minutes',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/collect-audience',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select cron_secret from public.audience_collector_settings where id = true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);

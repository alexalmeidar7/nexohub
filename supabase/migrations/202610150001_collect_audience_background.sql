-- Collect audience snapshots server-side every five minutes, regardless of open browser tabs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.audience_collector_settings (
  id boolean primary key default true check (id),
  cron_secret text not null,
  created_at timestamptz not null default now()
);
alter table public.audience_collector_settings enable row level security;
revoke all on public.audience_collector_settings from anon, authenticated;
grant all on public.audience_collector_settings to service_role;

insert into public.audience_collector_settings (id, cron_secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create index if not exists audiencia_historico_user_created_idx
  on public.audiencia_historico (user_id, created_at desc);

-- Keep six months of history; this does not reset or delete the current day's rows at midnight.
select cron.unschedule(jobid) from cron.job where jobname in ('collect-audience-every-five-minutes', 'prune-audience-history-daily');

select cron.schedule(
  'collect-audience-every-five-minutes',
  '*/5 * * * *',
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

select cron.schedule(
  'prune-audience-history-daily',
  '17 0 * * *',
  $job$
    delete from public.audiencia_historico
    where created_at < now() - interval '6 months';
  $job$
);

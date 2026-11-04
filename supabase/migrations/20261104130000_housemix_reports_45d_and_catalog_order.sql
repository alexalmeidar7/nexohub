-- House Mix consolidated reliability: 45-day operational history and active-project collector.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Preserve the existing collector secret when already configured.
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

-- Folder and video ordering for Player catalogues.
alter table if exists public.streaming_channels
  add column if not exists sort_order integer not null default 0;
create index if not exists streaming_channels_user_sort_order_idx
  on public.streaming_channels (user_id, sort_order, numero_canal);

-- Repoint the background audience collector to the production Supabase project.
do $$
declare job record;
begin
  for job in
    select jobid from cron.job
    where jobname in ('collect-audience-every-five-minutes', 'prune-audience-history-daily')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'collect-audience-every-five-minutes',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/collect-audience',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select cron_secret from public.audience_collector_settings where id = true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $job$
);

-- Keep the latest 45 days for both report datasets; prune once daily.
select cron.schedule(
  'prune-audience-history-daily',
  '23 0 * * *',
  $job$
    delete from public.audiencia_historico
    where created_at < now() - interval '45 days';
    do $$
    begin
      if to_regclass('public.vmix_button_interactions') is not null then
        delete from public.vmix_button_interactions
        where created_at < now() - interval '45 days';
      end if;
    end $$;
  $job$
);

-- Keep weather XML continuously fresh: one successful Edge Function run per minute.
do $$
declare job record;
begin
  for job in
    select jobid from cron.job
    where jobname in ('update-weather-xml-60s', 'update-weather-xml-5m')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'update-weather-xml-60s',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/update-weather-xml',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $job$
);

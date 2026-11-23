-- Restore server-side audience collection for the official House Mix production project.
-- Additive only: no historic data is removed.
create extension if not exists pg_cron;
create extension if not exists pg_net;

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
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.sub_users su
      where su.parent_user_id = audiencia_amostras.user_id
        and su.auth_user_id = (select auth.uid())
        and su.ativo = true
    )
  );
revoke all on public.audiencia_amostras from anon;
grant select on public.audiencia_amostras to authenticated;
grant all on public.audiencia_amostras to service_role;

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

-- Unschedule old jobs (which referenced a decommissioned project) before replacing them.
select cron.unschedule(jobid) from cron.job
  where jobname in ('collect-audience-every-five-minutes', 'collect-audience-every-15-minutes');
select cron.schedule(
  'collect-audience-every-15-minutes',
  '*/15 * * * *',
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

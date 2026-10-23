-- NexoHub Bridge backend schema, compatible with the legacy PR #23 migration.
-- Additive and idempotent: preserve legacy columns/data while exposing the current API contract.

create extension if not exists pgcrypto;

create table if not exists public.vmix_bridge_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vmix_bridge_pairings add column if not exists used_at timestamptz;

create table if not exists public.vmix_bridge_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_name text not null default 'Estúdio',
  token_hash text not null unique,
  revoked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vmix_bridge_devices add column if not exists device_name text;
alter table public.vmix_bridge_devices add column if not exists revoked boolean;

-- Copy legacy device names/revocation flags without dropping the old columns.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vmix_bridge_devices' and column_name = 'name'
  ) then
    execute $sql$
      update public.vmix_bridge_devices
      set device_name = coalesce(nullif(device_name, ''), nullif(name, ''), 'Estúdio')
      where device_name is null or btrim(device_name) = ''
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vmix_bridge_devices' and column_name = 'revoked_at'
  ) then
    execute $sql$
      update public.vmix_bridge_devices
      set revoked = (revoked_at is not null)
      where revoked is null or revoked_at is not null
    $sql$;
  end if;
end $$;

update public.vmix_bridge_devices set device_name = 'Estúdio' where device_name is null or btrim(device_name) = '';
update public.vmix_bridge_devices set revoked = false where revoked is null;
alter table public.vmix_bridge_devices alter column device_name set default 'Estúdio';
alter table public.vmix_bridge_devices alter column device_name set not null;
alter table public.vmix_bridge_devices alter column revoked set default false;
alter table public.vmix_bridge_devices alter column revoked set not null;

create table if not exists public.vmix_bridge_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null references public.vmix_bridge_devices(id) on delete cascade,
  path text not null check (path like '/api/%'),
  method text not null default 'GET' check (method in ('GET','POST')),
  body jsonb,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed')),
  result_status integer,
  result_body text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
alter table public.vmix_bridge_jobs add column if not exists result_status integer;
alter table public.vmix_bridge_jobs add column if not exists result_body text;
alter table public.vmix_bridge_jobs add column if not exists started_at timestamptz;

-- Normalize legacy statuses while retaining all job rows and legacy result/expiry columns.
alter table public.vmix_bridge_jobs drop constraint if exists vmix_bridge_jobs_status_check;
update public.vmix_bridge_jobs
set status = case status
  when 'queued' then 'pending'
  when 'completed' then 'succeeded'
  when 'expired' then 'failed'
  else status
end
where status in ('queued', 'completed', 'expired');

alter table public.vmix_bridge_jobs
  add constraint vmix_bridge_jobs_status_check
  check (status in ('pending','running','succeeded','failed'));

-- Rebuild same-named indexes if they came from the legacy schema with different predicates.
drop index if exists public.vmix_bridge_pairings_expiry_idx;
create index vmix_bridge_pairings_expiry_idx
  on public.vmix_bridge_pairings (expires_at) where used_at is null;

drop index if exists public.vmix_bridge_devices_user_idx;
create index vmix_bridge_devices_user_idx on public.vmix_bridge_devices (user_id);

create index if not exists vmix_bridge_jobs_queue_idx
  on public.vmix_bridge_jobs (device_id, status, created_at);

alter table public.vmix_bridge_pairings enable row level security;
alter table public.vmix_bridge_devices enable row level security;
alter table public.vmix_bridge_jobs enable row level security;

revoke all on public.vmix_bridge_pairings from anon, authenticated;
revoke all on public.vmix_bridge_devices from anon, authenticated;
revoke all on public.vmix_bridge_jobs from anon, authenticated;
grant all on public.vmix_bridge_pairings to service_role;
grant all on public.vmix_bridge_devices to service_role;
grant all on public.vmix_bridge_jobs to service_role;

create or replace function public.claim_next_vmix_bridge_job(p_device_id uuid)
returns table(id uuid, path text, method text, body jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select j.id
    from public.vmix_bridge_jobs j
    where j.device_id = p_device_id
      and j.status = 'pending'
    order by j.created_at
    for update skip locked
    limit 1
  )
  update public.vmix_bridge_jobs j
  set status = 'running', started_at = now()
  from next_job n
  where j.id = n.id
  returning j.id, j.path, j.method, j.body;
end;
$$;

revoke all on function public.claim_next_vmix_bridge_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_vmix_bridge_job(uuid) to service_role;

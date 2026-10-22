-- Backend seguro para pareamento e fila da Ponte remota NexoHub.
create extension if not exists pgcrypto;

create table if not exists public.vmix_bridge_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vmix_bridge_pairings_expiry_idx on public.vmix_bridge_pairings (expires_at) where used_at is null;

create table if not exists public.vmix_bridge_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_name text not null default 'Estúdio',
  token_hash text not null unique,
  revoked boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vmix_bridge_devices_user_idx on public.vmix_bridge_devices (user_id);

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
create index if not exists vmix_bridge_jobs_queue_idx on public.vmix_bridge_jobs (device_id, status, created_at);

alter table public.vmix_bridge_pairings enable row level security;
alter table public.vmix_bridge_devices enable row level security;
alter table public.vmix_bridge_jobs enable row level security;
-- No client policies: only Edge Functions using the service role may access bridge secrets and jobs.

grant all on public.vmix_bridge_pairings to service_role;
grant all on public.vmix_bridge_devices to service_role;
grant all on public.vmix_bridge_jobs to service_role;

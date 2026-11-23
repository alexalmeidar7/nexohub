-- Device inventory / primary election. This registry is NOT an authentication mechanism
-- for LAN; connection to other PCs remains gated by LAN-SECURITY-GATE.md.
create table if not exists public.housemix_station_devices (
  station_id uuid not null,
  device_id uuid not null,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 64),
  registered_by uuid not null,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (station_id,device_id)
);
create table if not exists public.housemix_station_primary (
  station_id uuid primary key,
  device_id uuid not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  foreign key (station_id,device_id)
    references public.housemix_station_devices(station_id,device_id) on delete cascade
);
create index if not exists housemix_station_devices_recent_idx
  on public.housemix_station_devices (station_id,last_seen_at desc);
alter table public.housemix_station_devices enable row level security;
alter table public.housemix_station_primary enable row level security;
revoke all on public.housemix_station_devices from public, anon, authenticated;
revoke all on public.housemix_station_primary from public, anon, authenticated;
grant select on public.housemix_station_devices to authenticated;
grant select on public.housemix_station_primary to authenticated;
grant all on public.housemix_station_devices to service_role;
grant all on public.housemix_station_primary to service_role;

create or replace function public.housemix_is_station_member(p_station uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    auth.uid() = p_station or exists (
      select 1 from public.sub_users su where su.parent_user_id = p_station
        and su.auth_user_id = auth.uid() and su.ativo is true
    )
  );
$$;
revoke all on function public.housemix_is_station_member(uuid) from public;
grant execute on function public.housemix_is_station_member(uuid) to authenticated;

drop policy if exists "housemix_station_devices_read" on public.housemix_station_devices;
create policy "housemix_station_devices_read" on public.housemix_station_devices
  for select to authenticated using (public.housemix_is_station_member(station_id));
drop policy if exists "housemix_station_primary_read" on public.housemix_station_primary;
create policy "housemix_station_primary_read" on public.housemix_station_primary
  for select to authenticated using (public.housemix_is_station_member(station_id));

-- Register / rename only one's own HMD, except station owner can rename any.
create or replace function public.housemix_register_station_device(
  p_station_id uuid, p_device_id uuid, p_display_name text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_display_name, '')); v_updated uuid;
begin
  if not public.housemix_is_station_member(p_station_id) then
    raise exception 'station_access_denied' using errcode='42501';
  end if;
  if p_device_id is null or char_length(v_name) not between 2 and 64
     or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_device_identity_or_name' using errcode='22023';
  end if;
  insert into public.housemix_station_devices
    (station_id,device_id,display_name,registered_by)
  values (p_station_id,p_device_id,v_name,auth.uid())
  on conflict (station_id,device_id) do update
    set display_name=excluded.display_name, last_seen_at=now()
    where housemix_station_devices.registered_by=auth.uid()
       or auth.uid()=p_station_id
  returning device_id into v_updated;
  if v_updated is null then
    raise exception 'device_name_update_denied' using errcode='42501';
  end if;
end;
$$;
revoke all on function public.housemix_register_station_device(uuid,uuid,text) from public;
grant execute on function public.housemix_register_station_device(uuid,uuid,text) to authenticated;

-- A PRIMARY KEY on station_id serializes concurrent promotions.
-- Last committed promotion wins; all non-elected devices are automatically secondary.
create or replace function public.housemix_select_station_primary(
  p_station_id uuid, p_device_id uuid
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> p_station_id then
    raise exception 'only_station_owner_can_change_primary' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.housemix_station_devices
      where station_id=p_station_id and device_id=p_device_id
  ) then
    raise exception 'device_not_registered' using errcode='22023';
  end if;
  insert into public.housemix_station_primary
    (station_id,device_id,changed_by)
  values (p_station_id,p_device_id,auth.uid())
  on conflict (station_id) do update set
    device_id=excluded.device_id,changed_by=excluded.changed_by,
    changed_at=now();
end;
$$;
revoke all on function public.housemix_select_station_primary(uuid,uuid) from public;
grant execute on function public.housemix_select_station_primary(uuid,uuid) to authenticated;

-- Realtime keeps the display in step. Not used for critical LAN leadership
-- authentication, split-brain prevention, or actual database replication.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public'
        and tablename='housemix_station_devices') then
      alter publication supabase_realtime add table public.housemix_station_devices;
    end if;
    if not exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public'
        and tablename='housemix_station_primary') then
      alter publication supabase_realtime add table public.housemix_station_primary;
    end if;
  end if;
end $$;

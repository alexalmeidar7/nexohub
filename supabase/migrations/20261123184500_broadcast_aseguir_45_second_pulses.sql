-- Transient, per-emissora manual vMix A Seguir pulses (exact 45s TTL).
-- Automatic events remain deterministic based on the existing program schedule.
create table if not exists public.broadcast_aseguir_pulses (
  user_id uuid primary key,
  mode text not null check (mode in ('next','later')),
  triggered_at timestamptz not null,
  expires_at timestamptz not null,
  constraint broadcast_aseguir_pulse_ttl check (
    expires_at > triggered_at and expires_at <= triggered_at + interval '45 seconds'
  )
);
alter table public.broadcast_aseguir_pulses enable row level security;
revoke all on public.broadcast_aseguir_pulses from anon, authenticated;
grant select on public.broadcast_aseguir_pulses to authenticated;
grant all on public.broadcast_aseguir_pulses to service_role;
drop policy if exists "read_station_aseguir_pulses" on public.broadcast_aseguir_pulses;
create policy "read_station_aseguir_pulses"
  on public.broadcast_aseguir_pulses for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.sub_users s
      where s.parent_user_id = broadcast_aseguir_pulses.user_id
        and s.auth_user_id = (select auth.uid()) and s.ativo is true
    )
  );
-- Notify HMD clients of a manual pulse without polling the database continuously.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'broadcast_aseguir_pulses'
    )
  then
    alter publication supabase_realtime add table public.broadcast_aseguir_pulses;
  end if;
end $$;

-- Ensure vMix interaction inserts are broadcast to Supabase Realtime.
-- The report already subscribes to postgres_changes; without publication membership,
-- the callback never runs and users only see new rows after reopening the page.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vmix_button_interactions'
  ) then
    alter publication supabase_realtime
      add table public.vmix_button_interactions;
  end if;
end
$$;

-- Private Broadcast/Presence only. No user data, tables, IDs or relationships
-- are changed. Public channels used by existing features remain unaffected.
create policy "vmix_desktop_studio_receive"
on realtime.messages for select to authenticated
using (
  extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.vmix_connections c
    where (select realtime.topic()) = 'vmix-desktop:' || c.id::text
      and (c.user_id = (select auth.uid()) or c.user_id = (select public.current_parent_user_id()))
  )
);

create policy "vmix_desktop_studio_send"
on realtime.messages for insert to authenticated
with check (
  extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.vmix_connections c
    where (select realtime.topic()) = 'vmix-desktop:' || c.id::text
      and (c.user_id = (select auth.uid()) or c.user_id = (select public.current_parent_user_id()))
  )
);

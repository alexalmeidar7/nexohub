-- Keep the legacy RPC safe if it is used by an older Bridge poller.
-- Additive: replaces only the function body; no tables or stored rows are dropped.

create or replace function public.claim_next_vmix_bridge_job(p_device_id uuid)
returns table(id uuid, path text, method text, body jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vmix_bridge_jobs j
  set status = 'failed',
      result_status = 504,
      result_body = 'Command expired before execution.',
      completed_at = now()
  where j.device_id = p_device_id
    and j.status = 'pending'
    and j.expires_at <= now();

  return query
  with next_job as (
    select j.id
    from public.vmix_bridge_jobs j
    where j.device_id = p_device_id
      and j.status = 'pending'
      and j.expires_at > now()
    order by j.created_at
    for update skip locked
    limit 1
  )
  update public.vmix_bridge_jobs j
  set status = 'running',
      started_at = now()
  from next_job n
  where j.id = n.id
  returning j.id, j.path, j.method, j.body;
end;
$$;

revoke all on function public.claim_next_vmix_bridge_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_vmix_bridge_job(uuid) to service_role;

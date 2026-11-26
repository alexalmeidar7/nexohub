create table public.nexo_tv_devices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique references public.tv_pairing_codes(code) on delete restrict,
  proof_hash text not null check (proof_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid,
  radio_user_id uuid not null,
  auth_session_id uuid unique,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index nexo_tv_devices_owner_radio on public.nexo_tv_devices (user_id, radio_user_id);
alter table public.nexo_tv_devices enable row level security;
revoke all on public.nexo_tv_devices from public, anon, authenticated;
grant select, insert, update on public.nexo_tv_devices to service_role;

create function public.nexo_reserve_tv_session(p_code text, p_proof_hash text)
returns table(device_id uuid, listener_id uuid)
language sql
set search_path = ''
as $$
  update public.nexo_tv_devices as device
     set redeemed_at = clock_timestamp(), user_id = pairing.paired_user_id
    from public.tv_pairing_codes as pairing
   where device.code = p_code
     and pairing.code = device.code
     and pairing.slug_user_id = device.radio_user_id
     and pairing.status = 'claimed'
     and pairing.paired_user_id is not null
     and pairing.expires_at > clock_timestamp()
     and device.proof_hash = p_proof_hash
     and device.redeemed_at is null
     and device.revoked_at is null
  returning device.id, device.user_id;
$$;
revoke all on function public.nexo_reserve_tv_session(text, text) from public, anon, authenticated;
grant execute on function public.nexo_reserve_tv_session(text, text) to service_role;

-- Expire only the linked Auth session. Retain records and refresh-token history.
create function public.nexo_revoke_tv_session(p_device uuid, p_user uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  target_session uuid;
begin
  update public.nexo_tv_devices d
     set revoked_at = coalesce(d.revoked_at, clock_timestamp()), user_id = p_user
    from public.tv_pairing_codes c
   where d.id = p_device and d.code = c.code and c.paired_user_id = p_user and c.status = 'claimed'
     and (d.user_id is null or d.user_id = p_user)
   returning d.auth_session_id into target_session;
  if not found then return false; end if;

  update auth.sessions
     set not_after = least(not_after, clock_timestamp())
   where id = target_session and user_id = p_user;
  update auth.refresh_tokens
     set revoked = true, updated_at = clock_timestamp()
   where session_id = target_session and not coalesce(revoked, false);
  return true;
end;
$$;
revoke all on function public.nexo_revoke_tv_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nexo_revoke_tv_session(uuid, uuid) to service_role;

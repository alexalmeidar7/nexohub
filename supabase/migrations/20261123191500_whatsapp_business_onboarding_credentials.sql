-- Secure business credential vault: service role only. No bearer tokens in wa_config.
create table if not exists public.wa_private_credentials (
  user_id uuid primary key,
  waba_id text not null,
  phone_number_id text not null unique,
  token_ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.wa_private_credentials enable row level security;
revoke all on public.wa_private_credentials from public, anon, authenticated;
grant select,insert,update,delete on public.wa_private_credentials to service_role;
-- Prevent end-users from fabricating "connected" state by editing wa_config.
revoke all on public.wa_config from public, anon, authenticated;
grant select on public.wa_config to authenticated;
-- Do not automatically activate historical manual configurations.

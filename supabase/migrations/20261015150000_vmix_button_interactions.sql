-- Persistent analytics for custom vMix buttons.
-- Apply to the Supabase project used by the deployed NexoHub app.
create table if not exists public.vmix_button_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  locutor_nome text,
  user_email text,
  studio_name text,
  button_id text not null,
  button_name text not null,
  program_name text,
  created_at timestamptz not null default now()
);

create index if not exists vmix_button_interactions_user_created_idx
  on public.vmix_button_interactions (user_id, created_at desc);

create index if not exists vmix_button_interactions_user_locutor_idx
  on public.vmix_button_interactions (user_id, locutor_nome, created_at desc);

alter table public.vmix_button_interactions enable row level security;

drop policy if exists "Users can read their own vMix button interactions" on public.vmix_button_interactions;
create policy "Users can read their own vMix button interactions"
  on public.vmix_button_interactions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own vMix button interactions" on public.vmix_button_interactions;
create policy "Users can insert their own vMix button interactions"
  on public.vmix_button_interactions for insert
  with check (auth.uid() = user_id);

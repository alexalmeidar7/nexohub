-- Private, per-user video library for the in-browser editor.
-- Each user may store at most 50 MiB in total.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-editor-media',
  'video-editor-media',
  false,
  52428800,
  array['video/mp4','video/quicktime','video/webm','video/x-matroska','video/ogg','video/mpeg','video/3gpp','video/x-msvideo']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.video_editor_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  duration double precision not null default 0,
  width integer not null default 1920,
  height integer not null default 1080,
  thumbnail text,
  waveform double precision[],
  created_at timestamptz not null default now()
);

alter table public.video_editor_assets enable row level security;

drop policy if exists "Users read own video editor assets" on public.video_editor_assets;
create policy "Users read own video editor assets"
  on public.video_editor_assets for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own video editor assets" on public.video_editor_assets;
create policy "Users insert own video editor assets"
  on public.video_editor_assets for insert to authenticated
  with check (user_id = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text);

drop policy if exists "Users delete own video editor assets" on public.video_editor_assets;
create policy "Users delete own video editor assets"
  on public.video_editor_assets for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.enforce_video_editor_library_quota()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_bytes bigint;
begin
  -- Serialize quota checks per account so concurrent uploads cannot exceed 50 MiB.
  perform 1 from auth.users where id = new.user_id for update;
  select coalesce(sum(size_bytes), 0)
    into existing_bytes
    from public.video_editor_assets
    where user_id = new.user_id
      and id is distinct from new.id;
  if existing_bytes + new.size_bytes > 52428800 then
    raise exception 'Limite de 50 MB da biblioteca de vídeos excedido para este usuário.';
  end if;
  return new;
end;
$$;

drop trigger if exists video_editor_assets_enforce_quota on public.video_editor_assets;
create trigger video_editor_assets_enforce_quota
  before insert or update of user_id, size_bytes on public.video_editor_assets
  for each row execute function public.enforce_video_editor_library_quota();

-- Enforce the quota at the Storage layer too, not only in the UI.
create or replace function public.enforce_video_editor_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  owner_id uuid;
  existing_bytes bigint;
  incoming_bytes bigint;
begin
  if new.bucket_id <> 'video-editor-media' then
    return new;
  end if;

  begin
    owner_id := split_part(new.name, '/', 1)::uuid;
  exception when others then
    raise exception 'Caminho inválido para a biblioteca de vídeos.';
  end;

  if auth.uid() is distinct from owner_id then
    raise exception 'Você só pode enviar vídeos para a sua própria biblioteca.';
  end if;

  perform 1 from auth.users where id = owner_id for update;

  select coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)
    into existing_bytes
    from storage.objects
    where bucket_id = 'video-editor-media'
      and split_part(name, '/', 1) = owner_id::text;

  incoming_bytes := coalesce((new.metadata->>'size')::bigint, 0);
  if existing_bytes + incoming_bytes > 52428800 then
    raise exception 'Limite de 50 MB da biblioteca de vídeos excedido para este usuário.';
  end if;

  return new;
end;
$$;

drop trigger if exists video_editor_storage_enforce_quota on storage.objects;
create trigger video_editor_storage_enforce_quota
  before insert on storage.objects
  for each row execute function public.enforce_video_editor_storage_quota();

drop policy if exists "Users read own video editor media" on storage.objects;
create policy "Users read own video editor media"
  on storage.objects for select to authenticated
  using (bucket_id = 'video-editor-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload own video editor media" on storage.objects;
create policy "Users upload own video editor media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'video-editor-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own video editor media" on storage.objects;
create policy "Users delete own video editor media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'video-editor-media' and (storage.foldername(name))[1] = auth.uid()::text);

commit;

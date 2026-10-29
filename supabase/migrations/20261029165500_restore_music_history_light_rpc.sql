create or replace function public.get_music_history_light(_user_id uuid, _limit integer default 6)
returns table(id uuid, musica text, artista text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, left(h.musica, 300) as musica, left(h.artista, 300) as artista, h.created_at
  from public.xml_upload_history h
  where h.user_id = _user_id
  order by h.created_at desc
  limit greatest(1, least(coalesce(_limit, 6), 50))
$$;

grant execute on function public.get_music_history_light(uuid, integer) to authenticated, anon, service_role;

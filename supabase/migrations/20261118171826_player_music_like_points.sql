-- Keep the existing favorites and derive one point per distinct saved song.
create function public.save_player_music_like(
  p_radio_user_id uuid,
  p_titulo text,
  p_artista text,
  p_capa text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  listener_id uuid := auth.uid();
  song_title text := trim(p_titulo);
  song_artist text := trim(p_artista);
begin
  if listener_id is null then
    raise exception 'login_required';
  end if;
  if p_radio_user_id is null or coalesce(song_title, '') = '' or coalesce(song_artist, '') = ''
     or length(song_title) > 512 or length(song_artist) > 512 or length(p_capa) > 4096 then
    raise exception 'invalid_song';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(listener_id, p_radio_user_id, lower(song_title), lower(song_artist))::text,
    0
  ));

  if exists (
    select 1 from public.music_likes
    where user_id = listener_id and radio_user_id = p_radio_user_id
      and lower(trim(coalesce(nullif(trim(titulo), ''), musica))) = lower(song_title)
      and lower(trim(artista)) = lower(song_artist)
  ) then
    return false;
  end if;

  insert into public.music_likes (user_id, radio_user_id, titulo, musica, artista, capa)
  values (listener_id, p_radio_user_id, song_title, song_title, song_artist, p_capa);
  return true;
end;
$$;

create function public.get_player_music_like_points(p_radio_user_id uuid)
returns bigint
language sql stable
security invoker
set search_path = ''
as $$
  select count(distinct (
    lower(trim(coalesce(nullif(trim(titulo), ''), musica))),
    lower(trim(artista))
  ))
  from public.music_likes
  where user_id = (select auth.uid())
    and radio_user_id is not distinct from p_radio_user_id
    and coalesce(nullif(trim(titulo), ''), nullif(trim(musica), '')) is not null
    and nullif(trim(artista), '') is not null;
$$;

revoke all on function public.save_player_music_like(uuid, text, text, text) from public, anon;
grant execute on function public.save_player_music_like(uuid, text, text, text) to authenticated;
revoke all on function public.get_player_music_like_points(uuid) from public, anon;
grant execute on function public.get_player_music_like_points(uuid) to authenticated;

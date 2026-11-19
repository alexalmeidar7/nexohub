-- Histórico persistido no banco, independente da abertura da seção InfoMusic.
-- O coletor da rádio deve continuar enviando atualizações ao Supabase.
alter table public.musicas_tocadas add column if not exists capa_url text;

create or replace function public.record_music_history_backend(
  p_user_id uuid, p_title text, p_artist text, p_at timestamptz default now(),
  p_programa text default null, p_capa_url text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_title,''));
  v_artist text := btrim(coalesce(p_artist,''));
  v_day text := to_char(p_at at time zone 'America/Sao_Paulo','YYYY-MM-DD');
  v_time text := to_char(p_at at time zone 'America/Sao_Paulo','HH24:MI:SS');
begin
  if p_user_id is null or v_title = '' or v_artist = '' or
     lower(v_title) in ('sem título','sem titulo','break','standby musical') or
     lower(v_artist) = 'desconhecido' then return; end if;
  insert into public.musicas_tocadas(user_id,dia,horario,programa,artista,musica,created_at,capa_url)
  values (p_user_id,v_day::date,v_time::time,coalesce(p_programa,''),v_artist,v_title,p_at,p_capa_url)
  ;
end $$;
revoke all on function public.record_music_history_backend(uuid,text,text,timestamptz,text,text) from public, anon, authenticated;

create or replace function public.capture_music_from_xml_upload()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.record_music_history_backend(new.user_id,new.musica,new.artista,new.created_at,null,null);
  return new;
end $$;
drop trigger if exists capture_music_from_xml_upload on public.xml_upload_history;
create trigger capture_music_from_xml_upload after insert on public.xml_upload_history
for each row execute function public.capture_music_from_xml_upload();

create or replace function public.capture_music_from_dashboard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_artist text;
begin
  if new.dashboard_items is not distinct from old.dashboard_items then return new; end if;
  v_title := coalesce(new.dashboard_items->>'music_current_title','');
  v_artist := coalesce(new.dashboard_items->>'music_current_artist','');
  if v_title <> coalesce(old.dashboard_items->>'music_current_title','')
     or v_artist <> coalesce(old.dashboard_items->>'music_current_artist','') then
    perform public.record_music_history_backend(new.user_id,v_title,v_artist,now(),
      coalesce(new.dashboard_items->>'music_current_program',''),
      nullif(new.dashboard_items->>'music_current_cover',''));
  end if;
  return new;
end $$;
drop trigger if exists capture_music_from_dashboard on public.user_settings;
create trigger capture_music_from_dashboard after update of dashboard_items on public.user_settings
for each row execute function public.capture_music_from_dashboard();

create index if not exists idx_musicas_tocadas_recent_owner
on public.musicas_tocadas(user_id,created_at desc);

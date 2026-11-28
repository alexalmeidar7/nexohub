alter table public.player_listener_profiles add column if not exists cep text;
create schema if not exists nexo_rewards_private;
revoke all on schema nexo_rewards_private from public,anon,authenticated;
create table if not exists public.nexo_listener_point_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 radio_user_id uuid not null,
 event_key text not null,
 points numeric(8,1) not null check(points>0),
 created_at timestamptz not null default now(),
 primary key(user_id,radio_user_id,event_key)
);
alter table public.nexo_listener_point_events enable row level security;
revoke all on public.nexo_listener_point_events from public,anon,authenticated;
grant select on public.nexo_listener_point_events to authenticated;
create policy nexo_points_own_select on public.nexo_listener_point_events for select to authenticated using(user_id=(select auth.uid()));
create policy player_music_likes_delete_own on public.music_likes for delete to authenticated using(user_id=(select auth.uid()) and radio_user_id is not null);
create function nexo_rewards_private.valid_cpf(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare d text:=regexp_replace(coalesce(value,''),'[^0-9]','','g'); n int; i int; total int; v int;
begin
 if length(d)<>11 or d=repeat(left(d,1),11) then return false; end if;
 for n in 9..10 loop
  total:=0;
  for i in 1..n loop total:=total+substring(d,i,1)::int*(n+2-i); end loop;
  v:=(total*10)%11; if v=10 then v:=0; end if;
  if v<>substring(d,n+1,1)::int then return false; end if;
 end loop;
 return true;
end;$$;
create function nexo_rewards_private.registration_fields(p public.player_listener_profiles) returns table(event_key text) language sql stable set search_path='' as $$
 select 'registration:'||field from (values
 ('nome',length(trim(coalesce(p.nome,'')))>=3),
 ('whatsapp',regexp_replace(coalesce(p.whatsapp,''),'[^0-9]','','g') ~ '^[0-9]{2}[2-9][0-9]{7,8}$'),
 ('cpf',nexo_rewards_private.valid_cpf(p.cpf)),
 ('sexo',length(trim(coalesce(p.sexo,'')))>0),
 ('data_nascimento',p.data_nascimento between date '1900-01-01' and current_date),
 ('estado',upper(trim(coalesce(p.estado,'')))=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
 ('cidade',length(trim(coalesce(p.cidade,'')))>0),
 ('setor',length(trim(coalesce(p.setor,'')))>0),
 ('cep',regexp_replace(coalesce(p.cep,''),'[^0-9]','','g') ~ '^[0-9]{8}$')
 ) as f(field,valid) where valid;
$$;
create function nexo_rewards_private.like_key(title text,artist text) returns text language sql immutable set search_path='' as $$
 select 'like:'||md5(lower(regexp_replace(trim(coalesce(title,'')),'[[:space:]]+',' ','g'))||chr(31)||lower(regexp_replace(trim(coalesce(artist,'')),'[[:space:]]+',' ','g')));
$$;
create function nexo_rewards_private.on_profile_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.auth_user_id is null or new.radio_user_id is null then return new; end if;
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 select new.auth_user_id,new.radio_user_id,f.event_key,10 from nexo_rewards_private.registration_fields(new) f on conflict do nothing;
 return new;
end;$$;
create function nexo_rewards_private.on_like_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is null or new.radio_user_id is null or trim(coalesce(nullif(new.titulo,''),new.musica,''))='' then return new; end if;
 if not exists(select 1 from auth.users u where u.id=new.user_id and not coalesce(u.is_anonymous,false)) then return new; end if;
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 values(new.user_id,new.radio_user_id,nexo_rewards_private.like_key(coalesce(nullif(new.titulo,''),new.musica),new.artista),1) on conflict do nothing;
 return new;
end;$$;
revoke all on all functions in schema nexo_rewards_private from public,anon,authenticated;
create trigger nexo_profile_points after insert or update of nome,whatsapp,cpf,sexo,data_nascimento,estado,cidade,setor,cep on public.player_listener_profiles for each row execute function nexo_rewards_private.on_profile_points();
create trigger nexo_like_points after insert on public.music_likes for each row execute function nexo_rewards_private.on_like_points();
insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
select p.auth_user_id,p.radio_user_id,f.event_key,10 from public.player_listener_profiles p join auth.users u on u.id=p.auth_user_id cross join lateral nexo_rewards_private.registration_fields(p) f where p.radio_user_id is not null and not coalesce(u.is_anonymous,false) on conflict do nothing;
insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
select l.user_id,l.radio_user_id,nexo_rewards_private.like_key(coalesce(nullif(l.titulo,''),l.musica),l.artista),1 from public.music_likes l join auth.users u on u.id=l.user_id where l.radio_user_id is not null and not coalesce(u.is_anonymous,false) and trim(coalesce(nullif(l.titulo,''),l.musica,''))<>'' on conflict do nothing;
create function public.nexo_listener_points_total(p_radio uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(points),0) from public.nexo_listener_point_events where user_id=(select auth.uid()) and radio_user_id=p_radio;
$$;
revoke all on function public.nexo_listener_points_total(uuid) from public,anon;
grant execute on function public.nexo_listener_points_total(uuid) to authenticated;;

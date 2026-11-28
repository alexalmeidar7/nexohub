create or replace function nexo_rewards_private.on_profile_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.auth_user_id is null or new.radio_user_id is null or not exists(select 1 from auth.users u where u.id=new.auth_user_id and not coalesce(u.is_anonymous,false)) then return new; end if;
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 select new.auth_user_id,new.radio_user_id,f.event_key,10 from nexo_rewards_private.registration_fields(new) f on conflict do nothing;
 return new;
end;$$;
create table public.player_listener_friendships(
 id uuid primary key default gen_random_uuid(),
 radio_user_id uuid not null,
 requester_id uuid not null references public.player_listener_profiles(id) on delete cascade,
 recipient_id uuid not null references public.player_listener_profiles(id) on delete cascade,
 requester_name text not null default '',
 recipient_name text not null default '',
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 check(requester_id<>recipient_id)
);
create unique index nexo_friendship_pair on public.player_listener_friendships(radio_user_id,least(requester_id,recipient_id),greatest(requester_id,recipient_id));
create index nexo_friendship_requester on public.player_listener_friendships(requester_id,radio_user_id);
create index nexo_friendship_recipient on public.player_listener_friendships(recipient_id,radio_user_id);
alter table public.player_listener_friendships enable row level security;
revoke all on public.player_listener_friendships from public,anon,authenticated;
grant select,delete on public.player_listener_friendships to authenticated;
grant insert(radio_user_id,requester_id,recipient_id),update(status) on public.player_listener_friendships to authenticated;
create policy nexo_friendship_read on public.player_listener_friendships for select to authenticated using(exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=player_listener_friendships.radio_user_id and p.id in (requester_id,recipient_id)));
create policy nexo_friendship_insert on public.player_listener_friendships for insert to authenticated with check(status='pending' and exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=player_listener_friendships.radio_user_id and p.id=requester_id));
create policy nexo_friendship_accept on public.player_listener_friendships for update to authenticated using(status='pending' and exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=player_listener_friendships.radio_user_id and p.id=recipient_id)) with check(status='accepted' and exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=player_listener_friendships.radio_user_id and p.id=recipient_id));
create policy nexo_friendship_delete on public.player_listener_friendships for delete to authenticated using(exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=player_listener_friendships.radio_user_id and p.id in (requester_id,recipient_id)));
create function nexo_rewards_private.friendship_names() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.player_listener_profiles; b public.player_listener_profiles;
begin
 select * into a from public.player_listener_profiles where id=new.requester_id and radio_user_id=new.radio_user_id;
 select * into b from public.player_listener_profiles where id=new.recipient_id and radio_user_id=new.radio_user_id;
 if auth.uid() is null or a.id is null or b.id is null or a.auth_user_id<>auth.uid() or a.auth_user_id=b.auth_user_id then raise exception 'Amizade inválida'; end if;
 new.requester_name:=left(coalesce(nullif(a.nome,''),'Ouvinte'),120); new.recipient_name:=left(coalesce(nullif(b.nome,''),'Ouvinte'),120);
 new.status:='pending';return new;
end;$$;
create trigger nexo_friendship_names before insert on public.player_listener_friendships for each row execute function nexo_rewards_private.friendship_names();
alter table public.player_chat_messages add column if not exists author_listener_id uuid references public.player_listener_profiles(id) on delete set null;
alter table public.player_chat_messages add column if not exists reply_to_id uuid references public.player_chat_messages(id) on delete set null;
create function nexo_rewards_private.chat_author() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.player_listener_profiles;
begin
 if new.author_listener_id is not null then
  select * into p from public.player_listener_profiles where id=new.author_listener_id;
  if auth.uid() is null or p.id is null or p.auth_user_id<>auth.uid() or new.channel_id<>'radio-'||lower(p.radio_user_id::text) then raise exception 'Autor inválido';end if;
 end if;
 if new.reply_to_id is not null and not exists(select 1 from public.player_chat_messages m where m.id=new.reply_to_id and m.channel_id=new.channel_id) then raise exception 'Resposta inválida';end if;
 return new;
end;$$;
create trigger nexo_chat_author before insert on public.player_chat_messages for each row execute function nexo_rewards_private.chat_author();
create table public.nexo_listener_nudges(
 id uuid primary key default gen_random_uuid(),
 radio_user_id uuid not null,
 sender_id uuid not null references public.player_listener_profiles(id) on delete cascade,
 recipient_id uuid not null references public.player_listener_profiles(id) on delete cascade,
 kind text not null check(kind in ('shake','wave')),
 created_at timestamptz not null default now(),
 minute_bucket bigint not null default 0,
 seen boolean not null default false,
 check(sender_id<>recipient_id),
 unique(radio_user_id,sender_id,recipient_id,kind,minute_bucket)
);
alter table public.nexo_listener_nudges enable row level security;
revoke all on public.nexo_listener_nudges from public,anon,authenticated;
grant select on public.nexo_listener_nudges to authenticated;
grant insert(radio_user_id,sender_id,recipient_id,kind),update(seen) on public.nexo_listener_nudges to authenticated;
create policy nexo_nudges_read on public.nexo_listener_nudges for select to authenticated using(exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=nexo_listener_nudges.radio_user_id and p.id in (sender_id,recipient_id)));
create policy nexo_nudges_send on public.nexo_listener_nudges for insert to authenticated with check(exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=nexo_listener_nudges.radio_user_id and p.id=sender_id) and exists(select 1 from public.player_listener_friendships f where f.radio_user_id=nexo_listener_nudges.radio_user_id and f.status='accepted' and ((f.requester_id=sender_id and f.recipient_id=recipient_id) or (f.recipient_id=sender_id and f.requester_id=nexo_listener_nudges.recipient_id))));
create policy nexo_nudges_seen on public.nexo_listener_nudges for update to authenticated using(exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=nexo_listener_nudges.radio_user_id and p.id=recipient_id)) with check(seen and exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=nexo_listener_nudges.radio_user_id and p.id=recipient_id));
create function nexo_rewards_private.nudge_bucket() returns trigger language plpgsql set search_path='' as $$ begin new.minute_bucket:=floor(extract(epoch from now())/60);return new;end;$$;
create trigger nexo_nudge_bucket before insert on public.nexo_listener_nudges for each row execute function nexo_rewards_private.nudge_bucket();
create function nexo_rewards_private.on_poll_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 select new.voter_id,p.user_id,'poll:'||new.poll_id,2 from public.enquetes_agendadas p join auth.users u on u.id=new.voter_id where p.id=new.poll_id and p.user_id is not null and not coalesce(u.is_anonymous,false) on conflict do nothing;return new;
end;$$;
create trigger nexo_poll_points after insert on public.player_poll_votes for each row execute function nexo_rewards_private.on_poll_points();
create function nexo_rewards_private.on_battle_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 select new.voter_id,b.user_id,'battle:'||new.battle_id,2 from public.batalhas_agendadas b join auth.users u on u.id=new.voter_id where b.id=new.battle_id and b.user_id is not null and not coalesce(u.is_anonymous,false) on conflict do nothing;return new;
end;$$;
create trigger nexo_battle_points after insert on nexo_tv_private.battle_votes_v24 for each row execute function nexo_rewards_private.on_battle_points();
create function nexo_rewards_private.on_chat_points() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or trim(coalesce(new.message,''))='' then return new; end if;
 insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points)
 select p.auth_user_id,p.radio_user_id,'chat:'||new.id,1 from public.player_listener_profiles p join auth.users u on u.id=p.auth_user_id where p.auth_user_id=auth.uid() and new.channel_id='radio-'||lower(p.radio_user_id::text) and not coalesce(u.is_anonymous,false) on conflict do nothing;return new;
end;$$;
create trigger nexo_chat_points after insert on public.player_chat_messages for each row execute function nexo_rewards_private.on_chat_points();
insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points) select v.voter_id,p.user_id,'poll:'||v.poll_id,2 from public.player_poll_votes v join public.enquetes_agendadas p on p.id=v.poll_id join auth.users u on u.id=v.voter_id where p.user_id is not null and not coalesce(u.is_anonymous,false) on conflict do nothing;
insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points) select v.voter_id,b.user_id,'battle:'||v.battle_id,2 from nexo_tv_private.battle_votes_v24 v join public.batalhas_agendadas b on b.id=v.battle_id join auth.users u on u.id=v.voter_id where b.user_id is not null and not coalesce(u.is_anonymous,false) on conflict do nothing;
revoke all on all functions in schema nexo_rewards_private from public,anon,authenticated;;

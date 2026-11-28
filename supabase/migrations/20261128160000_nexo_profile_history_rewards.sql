create table if not exists nexo_rewards_private.profile_history_seen(user_id uuid not null,radio_user_id uuid not null,profile_id text not null,item_key text not null,primary key(user_id,radio_user_id,profile_id,item_key));
create or replace function public.nexo_profile_points_total(p_radio uuid,p_profile text) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(points),0) from public.nexo_listener_point_events where user_id=auth.uid() and radio_user_id=p_radio and case when coalesce(p_profile,'')='' then event_key not like 'subprofile:%' else left(event_key,length('subprofile:'||p_profile||':'))='subprofile:'||p_profile||':' end;
$$;
revoke all on function public.nexo_profile_points_total(uuid,text) from public,anon;
grant execute on function public.nexo_profile_points_total(uuid,text) to authenticated;
create or replace function public.nexo_profile_history_reward(p_radio uuid,p_items jsonb,p_profile text) returns numeric language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); k text; total int; prefix text; awarded int;
begin
 if uid is null or coalesce((select is_anonymous from auth.users where id=uid),true) then raise exception 'login_required'; end if;
 if coalesce(p_profile,'')='' then return public.nexo_history_reward(p_radio,p_items);end if;
 if not exists(select 1 from public.player_listener_profiles p cross join lateral jsonb_array_elements(p.sub_profiles::jsonb) v where p.auth_user_id=uid and p.radio_user_id=p_radio and v->>'id'=p_profile) then raise exception 'invalid_profile';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>8 then raise exception 'invalid_batch';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_radio::text||p_profile,0));
 for k in select distinct value from jsonb_array_elements_text(p_items) loop
 if length(k)<=512 and exists(select 1 from public.musicas_tocadas m where m.user_id=p_radio and concat_ws('|',m.dia::text,left(m.horario::text,8),m.musica,m.artista)=k and m.created_at>now()-interval '7 days') then insert into nexo_rewards_private.profile_history_seen values(uid,p_radio,p_profile,k) on conflict do nothing;end if;
 end loop;
 prefix:='subprofile:'||p_profile||':history8:';
 select count(*) into total from nexo_rewards_private.profile_history_seen where user_id=uid and radio_user_id=p_radio and profile_id=p_profile;
 select count(*) into awarded from public.nexo_listener_point_events where user_id=uid and radio_user_id=p_radio and left(event_key,length(prefix))=prefix;
 if total/8>awarded then insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points) values(uid,p_radio,prefix||(awarded+1),1) on conflict do nothing;end if;
 return public.nexo_profile_points_total(p_radio,p_profile);
end;$$;
revoke all on function public.nexo_profile_history_reward(uuid,jsonb,text) from public,anon;
grant execute on function public.nexo_profile_history_reward(uuid,jsonb,text) to authenticated;

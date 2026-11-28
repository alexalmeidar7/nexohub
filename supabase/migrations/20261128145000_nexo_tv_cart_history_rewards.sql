-- TV saved products and bounded history rewards.
create table public.nexo_tv_saved_products (
 user_id uuid not null references auth.users(id) on delete cascade,
 radio_user_id uuid not null, link text not null check(length(link)<=2048 and link ~ '^https://'),
 title text not null, price text not null default '', image text not null default '',
 created_at timestamptz not null default now(), primary key(user_id,radio_user_id,link)
);
alter table public.nexo_tv_saved_products enable row level security;
revoke all on public.nexo_tv_saved_products from public,anon,authenticated;
grant select on public.nexo_tv_saved_products to authenticated;
create policy own_tv_saved_products on public.nexo_tv_saved_products for select to authenticated using(user_id=(select auth.uid()));
create function public.nexo_save_tv_product(p_radio uuid,p_link text,p_title text,p_price text,p_image text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((select is_anonymous from auth.users where id=auth.uid()),true) then raise exception 'login_required';end if;
 if not exists(select 1 from public.player_listener_profiles where auth_user_id=auth.uid() and radio_user_id=p_radio) then raise exception 'profile_required';end if;
 insert into public.nexo_tv_saved_products(user_id,radio_user_id,link,title,price,image) values(auth.uid(),p_radio,p_link,left(p_title,300),left(coalesce(p_price,''),60),left(coalesce(p_image,''),2048)) on conflict do nothing;
end;$$;
revoke all on function public.nexo_save_tv_product(uuid,text,text,text,text) from public,anon;
grant execute on function public.nexo_save_tv_product(uuid,text,text,text,text) to authenticated;
create table nexo_rewards_private.history_seen(user_id uuid not null,radio_user_id uuid not null,item_key text not null,primary key(user_id,radio_user_id,item_key));
create function public.nexo_history_reward(p_radio uuid,p_items jsonb) returns numeric language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n int; key text; total int; awarded int;
begin
 if uid is null or coalesce((select is_anonymous from auth.users where id=uid),true) then raise exception 'login_required';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>8 then raise exception 'invalid_batch';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_radio::text,0));
 for key in select distinct value from jsonb_array_elements_text(p_items) loop
  if length(key)<=512 and exists(select 1 from public.musicas_tocadas m where m.user_id=p_radio and concat_ws('|',m.dia::text,left(m.horario::text,8),m.musica,m.artista)=key and m.created_at>now()-interval '7 days') then
   insert into nexo_rewards_private.history_seen values(uid,p_radio,key) on conflict do nothing;
  end if;
 end loop;
 select count(*) into total from nexo_rewards_private.history_seen where user_id=uid and radio_user_id=p_radio;
 select count(*) into awarded from public.nexo_listener_point_events where user_id=uid and radio_user_id=p_radio and event_key like 'history8:%';
 for n in awarded+1..least(total/8,awarded+1) loop
  insert into public.nexo_listener_point_events(user_id,radio_user_id,event_key,points) values(uid,p_radio,'history8:'||n,1) on conflict do nothing;
 end loop;
 return (select coalesce(sum(points),0) from public.nexo_listener_point_events where user_id=uid and radio_user_id=p_radio);
end;$$;
revoke all on function public.nexo_history_reward(uuid,jsonb) from public,anon;
grant execute on function public.nexo_history_reward(uuid,jsonb) to authenticated;

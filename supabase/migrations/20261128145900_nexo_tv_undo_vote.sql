create function public.nexo_tv_undo_vote(p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((select is_anonymous from auth.users where id=auth.uid()),true) then raise exception 'login_required';end if;
 if p_kind='poll' then
 delete from public.player_poll_votes where poll_id=p_id and voter_id=auth.uid();
 elsif p_kind='battle' then
 delete from nexo_tv_private.battle_votes_v24 where battle_id=p_id and voter_id=auth.uid();
 else raise exception 'invalid_kind';end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.nexo_tv_undo_vote(text,uuid) from public,anon;
grant execute on function public.nexo_tv_undo_vote(text,uuid) to authenticated;

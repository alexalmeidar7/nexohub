-- Replace only the authenticated listener's answer, keeping the same vote row.
create or replace function public.submit_player_poll_vote(p_poll_id uuid, p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  listener_id uuid := auth.uid();
  active_poll public.enquetes_agendadas%rowtype;
  answers text[];
  saved_vote public.player_poll_votes%rowtype;
  local_minute timestamp := date_trunc('minute', timezone('America/Sao_Paulo', now()));
  starts_at time;
  ends_at time;
begin
  if listener_id is null then raise exception 'login_required'; end if;
  select * into active_poll from public.enquetes_agendadas where id = p_poll_id for share;
  if not found then raise exception 'poll_unavailable'; end if;

  starts_at := left((active_poll.horario_inicio::time)::text, 5)::time;
  ends_at := left((active_poll.horario_fim::time)::text, 5)::time;
  if active_poll.data_enquete::date is distinct from local_minute::date or
     not coalesce(case when starts_at <= ends_at
       then local_minute::time between starts_at and ends_at
       else local_minute::time >= starts_at or local_minute::time <= ends_at end, false) then
    raise exception 'poll_closed';
  end if;

  select array_agg(answer order by position) into answers
    from unnest(array[active_poll.resposta1, active_poll.resposta2, active_poll.resposta3, active_poll.resposta4])
      with ordinality as choice(answer, position)
    where nullif(trim(answer), '') is not null;
  if p_answer_index is null or p_answer_index < 0 or p_answer_index >= coalesce(array_length(answers, 1), 0) then
    raise exception 'invalid_answer';
  end if;

  insert into public.player_poll_votes(poll_id, voter_id, radio_user_id, answer_index, answer_text)
    values (p_poll_id, listener_id, active_poll.user_id, p_answer_index, answers[p_answer_index + 1])
    on conflict (poll_id, voter_id) do update
      set answer_index = excluded.answer_index, answer_text = excluded.answer_text
    returning * into saved_vote;
  return jsonb_build_object('ok', true, 'answer_index', saved_vote.answer_index, 'answer', saved_vote.answer_text);
end;
$$;

create function public.get_player_poll_vote(p_poll_id uuid)
returns integer
language sql stable
security invoker
set search_path = ''
as $$
  select answer_index
  from public.player_poll_votes
  where poll_id = p_poll_id and voter_id = (select auth.uid());
$$;

revoke all on function public.submit_player_poll_vote(uuid, integer) from public, anon;
grant execute on function public.submit_player_poll_vote(uuid, integer) to authenticated;
revoke all on function public.get_player_poll_vote(uuid) from public, anon;
grant execute on function public.get_player_poll_vote(uuid) to authenticated;

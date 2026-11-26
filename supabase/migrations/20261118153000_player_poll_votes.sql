-- Additive only: preserve all existing polls and user data.
create table public.player_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.enquetes_agendadas(id) on delete restrict,
  voter_id uuid not null references auth.users(id) on delete restrict,
  radio_user_id uuid not null,
  answer_index integer not null check (answer_index between 0 and 3),
  answer_text text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)
);
alter table public.player_poll_votes enable row level security;
revoke all on public.player_poll_votes from anon, authenticated;
grant select on public.player_poll_votes to authenticated;
create policy "Voter and station can read poll votes" on public.player_poll_votes
  for select to authenticated using (auth.uid() = voter_id or auth.uid() = radio_user_id);

-- Only this RPC can insert; identity, active period and answer are checked server-side.
create function public.submit_player_poll_vote(p_poll_id uuid, p_answer_index integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_poll public.enquetes_agendadas%rowtype;
  v_answers text[];
  v_answer text;
  v_existing public.player_poll_votes%rowtype;
  v_now timestamp := timezone('America/Sao_Paulo', now());
begin
  if v_uid is null then raise exception 'login_required'; end if;
  select * into v_poll from public.enquetes_agendadas where id = p_poll_id;
  if not found then raise exception 'poll_unavailable'; end if;
  if v_poll.data_enquete::date <> v_now::date or v_now::time < v_poll.horario_inicio::time
    or v_now::time > v_poll.horario_fim::time then raise exception 'poll_closed'; end if;
  select array_agg(answer order by ordinal) into v_answers
    from unnest(array[v_poll.resposta1,v_poll.resposta2,v_poll.resposta3,v_poll.resposta4])
      with ordinality as a(answer, ordinal) where nullif(trim(answer),'') is not null;
  if p_answer_index is null or p_answer_index < 0 or p_answer_index >= coalesce(array_length(v_answers,1),0)
    then raise exception 'invalid_answer'; end if;
  v_answer := v_answers[p_answer_index + 1];
  insert into public.player_poll_votes(poll_id,voter_id,radio_user_id,answer_index,answer_text)
    values(p_poll_id,v_uid,v_poll.user_id,p_answer_index,v_answer)
    on conflict(poll_id,voter_id) do nothing;
  select * into v_existing from public.player_poll_votes where poll_id=p_poll_id and voter_id=v_uid;
  return jsonb_build_object('ok',true,'answer_index',v_existing.answer_index,'answer',v_existing.answer_text);
end;
$$;
revoke all on function public.submit_player_poll_vote(uuid,integer) from public, anon;
grant execute on function public.submit_player_poll_vote(uuid,integer) to authenticated;

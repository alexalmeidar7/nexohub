drop policy nexo_nudges_send on public.nexo_listener_nudges;
create policy nexo_nudges_send on public.nexo_listener_nudges for insert to authenticated with check(
 exists(select 1 from public.player_listener_profiles p where p.auth_user_id=(select auth.uid()) and p.radio_user_id=nexo_listener_nudges.radio_user_id and p.id=nexo_listener_nudges.sender_id)
 and exists(select 1 from public.player_listener_friendships f where f.radio_user_id=nexo_listener_nudges.radio_user_id and f.status='accepted' and ((f.requester_id=nexo_listener_nudges.sender_id and f.recipient_id=nexo_listener_nudges.recipient_id) or (f.recipient_id=nexo_listener_nudges.sender_id and f.requester_id=nexo_listener_nudges.recipient_id)))
);;

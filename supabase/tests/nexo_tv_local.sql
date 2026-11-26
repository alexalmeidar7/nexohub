-- Run only in the disposable PostgreSQL harness with the two new migrations.
begin;

insert into public.user_settings(user_id, dashboard_items) values
  ('00000000-0000-0000-0000-000000000001', '{"pontuacao_rules_cadastro":{"nome":3,"telefone":7}}'),
  ('00000000-0000-0000-0000-000000000002', '{}');
insert into public.ouvintes(id, user_id, nome, email, telefone, pontuacao) values
  ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000002', 'Nome existente', 'GOOGLE@example.test', '99999999999', 89);
insert into public.tv_pairing_codes(code, slug_user_id, user_slug, tv_session_id, status, paired_user_id, expires_at) values
  ('1281', '00000000-0000-0000-0000-000000000001', 'a', 'tv-a', 'claimed', '00000000-0000-0000-0000-000000000003', now() + interval '5 minutes'),
  ('1282', '00000000-0000-0000-0000-000000000002', 'b', 'tv-b', 'claimed', '00000000-0000-0000-0000-000000000003', now() + interval '5 minutes'),
  ('1283', '00000000-0000-0000-0000-000000000001', 'a', 'tv-c', 'claimed', '00000000-0000-0000-0000-000000000003', now() - interval '1 minute');
insert into public.nexo_tv_devices(id, code, radio_user_id, proof_hash) values
  ('00000000-0000-0000-0000-000000000011', '1281', '00000000-0000-0000-0000-000000000001', repeat('a', 64)),
  ('00000000-0000-0000-0000-000000000012', '1282', '00000000-0000-0000-0000-000000000002', repeat('b', 64)),
  ('00000000-0000-0000-0000-000000000013', '1283', '00000000-0000-0000-0000-000000000001', repeat('c', 64));
insert into auth.sessions(id, user_id) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000003');
insert into auth.refresh_tokens(session_id, revoked) values
  ('00000000-0000-0000-0000-000000000021', false),
  ('00000000-0000-0000-0000-000000000022', false);

set local role service_role;
do $$
declare
  account constant uuid := '00000000-0000-0000-0000-000000000003';
  stranger constant uuid := '00000000-0000-0000-0000-000000000004';
  tv_a constant uuid := '00000000-0000-0000-0000-000000000011';
  tv_b constant uuid := '00000000-0000-0000-0000-000000000012';
  defaults constant jsonb := '{"nome":10,"email":10,"cpf":15,"telefone":15,"cidade":5}';
  result jsonb;
begin
  if exists (select from public.nexo_reserve_tv_session('1281', repeat('f',64))) then raise exception 'accepted wrong proof'; end if;
  if not exists (select from public.nexo_reserve_tv_session('1281', repeat('a',64))) then raise exception 'valid proof rejected'; end if;
  if exists (select from public.nexo_reserve_tv_session('1281', repeat('a',64))) then raise exception 'accepted replay'; end if;
  if exists (select from public.nexo_reserve_tv_session('1283', repeat('c',64))) then raise exception 'accepted expired code'; end if;

  result := public.nexo_enroll_player_listener(tv_a, stranger, 'google', 'google@example.test', 'Nome Google', null, '{}', defaults);
  if result ->> 'reason' is distinct from 'device_not_found' then raise exception 'cross-account access: %', result; end if;
  result := public.nexo_enroll_player_listener(tv_a, account, 'google', 'google@example.test', 'Nome Google', 'https://image.test/avatar', '{}', defaults);
  if result ->> 'total' is distinct from '13' or result -> 'fields' ->> 'foto' is distinct from 'https://image.test/avatar' then raise exception 'Google import or scoring: %', result; end if;
  result := public.nexo_enroll_player_listener(tv_a, account, 'google', 'google@example.test', 'Nome Google', null, '{"telefone":"11988888888"}', defaults);
  if result ->> 'total' is distinct from '20' or result ->> 'earned' is distinct from '7' then raise exception 'field scoring: %', result; end if;
  result := public.nexo_enroll_player_listener(tv_a, account, 'google', 'google@example.test', 'Outro', null, '{"telefone":"11900000000"}', defaults);
  if result ->> 'total' is distinct from '20' or result ->> 'earned' is distinct from '0'
    or result -> 'fields' ->> 'telefone' is distinct from '11988888888' then raise exception 'retry or overwrite: %', result; end if;
  result := public.nexo_enroll_player_listener(tv_b, account, 'google', 'google@example.test', 'Outro', null, '{}', defaults);
  if result ->> 'total' is distinct from '89' or result -> 'fields' ->> 'nome' is distinct from 'Nome existente' then raise exception 'legacy preservation: %', result; end if;
  if (select count(*) from public.ouvintes) <> 2 then raise exception 'duplicates'; end if;
  update public.nexo_tv_devices set auth_session_id = '00000000-0000-0000-0000-000000000021' where id = tv_a;
  if public.nexo_revoke_tv_session(tv_a, stranger) then raise exception 'third-party revoke'; end if;
  if not public.nexo_revoke_tv_session(tv_a, account) then raise exception 'unlink rejected'; end if;
  if not public.nexo_revoke_tv_session(tv_b, account) then raise exception 'unlink before redeem rejected'; end if;
  if exists (select from public.nexo_reserve_tv_session('1282', repeat('b',64))) then raise exception 'revoked code redeemed'; end if;
end;
$$;

reset role;
do $$
begin
  if has_table_privilege('anon', 'public.nexo_tv_devices', 'select') or
     has_function_privilege('authenticated', 'public.nexo_revoke_tv_session(uuid,uuid)', 'execute') then raise exception 'unexpected public privileges'; end if;
  if (select count(*) from auth.refresh_tokens where revoked) <> 1 or
     (select count(*) from auth.sessions where not_after is not null) <> 1 then raise exception 'revocation affected another session'; end if;
end;
$$;
rollback;

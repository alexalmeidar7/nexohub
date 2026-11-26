create table public.nexo_player_listener_links (
  radio_user_id uuid not null,
  listener_user_id uuid not null,
  google_subject text not null,
  listener_id uuid not null unique references public.ouvintes(id) on delete restrict,
  avatar_url text,
  uf text,
  source text not null default 'nexo_player' check (source = 'nexo_player'),
  primary key (radio_user_id, listener_user_id),
  unique (radio_user_id, google_subject)
);
create table public.nexo_player_listener_field_credits (
  listener_id uuid not null references public.nexo_player_listener_links(listener_id) on delete restrict,
  field text not null,
  points numeric not null check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (listener_id, field)
);

alter table public.nexo_player_listener_links enable row level security;
alter table public.nexo_player_listener_field_credits enable row level security;
revoke all on public.nexo_player_listener_links, public.nexo_player_listener_field_credits from public, anon, authenticated;
grant select, insert, update on public.nexo_player_listener_links to service_role;
grant select, insert on public.nexo_player_listener_field_credits to service_role;
create index nexo_ouvintes_station_normalized_email on public.ouvintes (user_id, lower(btrim(email))) where email is not null;

create function public.nexo_enroll_player_listener(
  p_device uuid, p_user uuid, p_subject text, p_email text, p_name text,
  p_avatar text, p_fields jsonb, p_defaults jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  station uuid;
  link public.nexo_player_listener_links%rowtype;
  listener public.ouvintes%rowtype;
  candidates uuid[];
  prior jsonb;
  current_fields jsonb;
  rules jsonb;
  gained numeric;
  field_name text;
  fields constant text[] := array['nome','email','cpf','telefone','sexo','data_nascimento','uf','cidade','setor','escolaridade','renda','foto'];
begin
  select d.radio_user_id into station
    from public.nexo_tv_devices d join public.tv_pairing_codes c on c.code = d.code
   where d.id = p_device and d.revoked_at is null and c.paired_user_id = p_user and c.status = 'claimed'
     and (d.auth_session_id is not null or c.expires_at > clock_timestamp())
   for share of d;
  if not found then return jsonb_build_object('ok', false, 'reason', 'device_not_found'); end if;
  p_email := lower(btrim(p_email));
  if nullif(p_email, '') is null or nullif(p_subject, '') is null or nullif(btrim(p_name), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_identity');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(station::text || ':subject:' || p_subject, 0));
  perform pg_advisory_xact_lock(hashtextextended(station::text || ':email:' || p_email, 0));
  select * into link from public.nexo_player_listener_links
   where radio_user_id = station and (listener_user_id = p_user or google_subject = p_subject)
   limit 1 for update;
  if found then
    if link.google_subject <> p_subject or link.listener_user_id <> p_user then
      return jsonb_build_object('ok', false, 'reason', 'identity_conflict');
    end if;
    select * into listener from public.ouvintes where id = link.listener_id and user_id = station for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'listener_not_found'); end if;
  else
    select array_agg(matches.id) into candidates from (
      select o.id from public.ouvintes o
       where o.user_id = station and lower(btrim(o.email)) = p_email limit 2
    ) matches;
    if cardinality(candidates) > 1 then return jsonb_build_object('ok', false, 'reason', 'ambiguous_listener'); end if;
    if cardinality(candidates) = 1 then
      select * into listener from public.ouvintes where id = candidates[1] and user_id = station
        and lower(btrim(email)) = p_email for update;
      if not found then return jsonb_build_object('ok', false, 'reason', 'listener_changed'); end if;
      if listener.banido then return jsonb_build_object('ok', false, 'reason', 'listener_unavailable'); end if;
      if exists (select 1 from public.nexo_player_listener_links where listener_id = listener.id) then
        return jsonb_build_object('ok', false, 'reason', 'identity_conflict');
      end if;
      prior := to_jsonb(listener);
    else
      insert into public.ouvintes(user_id, nome, email, pontuacao)
      values (station, p_name, p_email, 0) returning * into listener;
    end if;
    insert into public.nexo_player_listener_links(radio_user_id, listener_user_id, google_subject, listener_id, avatar_url, uf)
    values (station, p_user, p_subject, listener.id, p_avatar, substring(upper(listener.cidade) from '/([A-Z]{2})$')) returning * into link;
    -- Legacy fields are a baseline. Existing totals may already include them.
    insert into public.nexo_player_listener_field_credits(listener_id, field, points)
    select listener.id, key, 0 from unnest(fields) as field(key)
    where nullif(btrim(prior ->> key), '') is not null or (key = 'uf' and link.uf is not null)
    on conflict do nothing;
  end if;
  if listener.banido then return jsonb_build_object('ok', false, 'reason', 'listener_unavailable'); end if;

  -- The mobile form completes empty fields only. It cannot overwrite a legacy
  -- value or update the station, email, flags, or point total from its payload.
  for field_name in select unnest(fields) loop
    if field_name in ('nome','email','foto','uf') or nullif(btrim(to_jsonb(listener) ->> field_name), '') is not null then continue; end if;
    if nullif(p_fields ->> field_name, '') is not null then
      listener := jsonb_populate_record(listener, jsonb_build_object(field_name, p_fields ->> field_name));
    end if;
  end loop;
  if link.uf is null and nullif(p_fields ->> 'uf', '') is not null then
    update public.nexo_player_listener_links set uf = p_fields ->> 'uf' where listener_id = listener.id returning * into link;
  end if;

  current_fields := to_jsonb(listener) || jsonb_build_object('uf', link.uf, 'foto', link.avatar_url);
  select u.dashboard_items -> 'pontuacao_rules_cadastro' into rules from public.user_settings u where u.user_id = station;
  rules := p_defaults || case when jsonb_typeof(rules) = 'object' then rules else '{}'::jsonb end;
  with credits as (
    insert into public.nexo_player_listener_field_credits(listener_id, field, points)
    select listener.id, key,
      case when jsonb_typeof(rules -> key) = 'number' then greatest(0, (rules ->> key)::numeric) else 0 end
    from unnest(fields) as field(key)
    where nullif(btrim(current_fields ->> key), '') is not null
      and (key <> 'foto' or jsonb_typeof(rules -> 'foto') = 'number')
    on conflict do nothing returning points
  ) select coalesce(sum(points), 0) into gained from credits;

  update public.ouvintes o set cpf = listener.cpf, telefone = listener.telefone, sexo = listener.sexo,
    data_nascimento = listener.data_nascimento, cidade = listener.cidade, setor = listener.setor,
    escolaridade = listener.escolaridade, renda = listener.renda, pontuacao = coalesce(o.pontuacao, 0) + gained
  where o.id = listener.id and o.user_id = station
    and (gained <> 0 or (o.cpf, o.telefone, o.sexo, o.data_nascimento, o.cidade, o.setor, o.escolaridade, o.renda)
      is distinct from (listener.cpf, listener.telefone, listener.sexo, listener.data_nascimento, listener.cidade, listener.setor, listener.escolaridade, listener.renda));

  return jsonb_build_object('ok', true, 'fields', (select jsonb_object_agg(key, current_fields -> key) from unnest(fields) field(key)),
    'earned', gained, 'total', coalesce(listener.pontuacao, 0) + gained, 'rules', rules);
end;
$$;
revoke all on function public.nexo_enroll_player_listener(uuid, uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.nexo_enroll_player_listener(uuid, uuid, text, text, text, text, jsonb, jsonb) to service_role;

-- The hosted project also has tenant policies for radio operators. Add
-- self-service access for the listener's own rows without replacing them.
create policy "Nexo Player listener reads own profiles"
on public.player_listener_profiles for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy "Nexo Player listener adds own profiles"
on public.player_listener_profiles for insert to authenticated
with check (auth_user_id = (select auth.uid()));

create policy "Nexo Player listener updates own profiles"
on public.player_listener_profiles for update to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

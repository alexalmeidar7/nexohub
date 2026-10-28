-- Reconcile production schema with the forms and workflows audited in House Mix.
-- Additive/idempotent only: existing rows and IDs are preserved.

alter table public.ouvintes
  add column if not exists origem_cadastro text not null default 'manual',
  add column if not exists sexo text,
  add column if not exists banido boolean not null default false,
  add column if not exists banido_at timestamptz,
  add column if not exists banido_motivo text;

alter table public.programas add column if not exists deleted_at timestamptz;

alter table public.logos_patrocinadores
  add column if not exists nome text,
  add column if not exists cnpj text,
  add column if not exists telefone text,
  add column if not exists endereco text,
  add column if not exists excluido boolean not null default false,
  add column if not exists excluido_at timestamptz;

alter table public.empresa_config
  add column if not exists ativo boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists cnpj text,
  add column if not exists executiva_venda text,
  add column if not exists cliente_desde date,
  add column if not exists plano text not null default 'free',
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists background_url text,
  add column if not exists instagram_subs integer,
  add column if not exists facebook_subs integer,
  add column if not exists youtube_subs integer,
  add column if not exists youtube_api_key text,
  add column if not exists youtube_channel_id text,
  add column if not exists audio_sources jsonb not null default '[]'::jsonb,
  add column if not exists video_sources jsonb not null default '[]'::jsonb,
  add column if not exists audio_stream_api_url text,
  add column if not exists audio_stream_xpath text,
  add column if not exists video_stream_api_url text,
  add column if not exists video_stream_xpath text;

alter table public.user_settings
  add column if not exists cenario_config jsonb,
  add column if not exists dashboard_items jsonb,
  add column if not exists infomusic_ai_enabled boolean not null default false,
  add column if not exists infomusic_ai_last_reset timestamptz,
  add column if not exists infomusic_ai_monthly_count integer not null default 0,
  add column if not exists infomusic_excecoes text,
  add column if not exists infomusic_excecoes_artista_url text,
  add column if not exists infomusic_excecoes_capa_url text,
  add column if not exists last_manual_curiosity_id uuid,
  add column if not exists music_source_device text,
  add column if not exists music_source_mode text not null default 'xml',
  add column if not exists shopping_active boolean not null default false,
  add column if not exists vmix_input_mapping jsonb,
  add column if not exists vmix_pass text,
  add column if not exists vmix_shortcuts jsonb,
  add column if not exists vmix_url text,
  add column if not exists vmix_user text,
  add column if not exists weather_city text,
  add column if not exists weather_lat double precision,
  add column if not exists weather_lon double precision;

alter table public.roteiros
  add column if not exists agendado_para_envio timestamptz,
  add column if not exists apresentador_editado boolean,
  add column if not exists configuracoes jsonb,
  add column if not exists editado_at timestamptz,
  add column if not exists enviado_agendamento boolean not null default false,
  add column if not exists share_login text,
  add column if not exists share_token text,
  add column if not exists tickertitulos text,
  add column if not exists xml_pushed_at timestamptz;

alter table public.sorteio_sorteios
  add column if not exists apresentador_nome text,
  add column if not exists programa_id uuid,
  add column if not exists programa_nome text,
  add column if not exists entrega_pin text,
  add column if not exists entrega_token uuid default gen_random_uuid(),
  add column if not exists foto_entrega_url text,
  add column if not exists entrega_registrada_em timestamptz;

update public.sorteio_sorteios set entrega_token = gen_random_uuid() where entrega_token is null;
alter table public.sorteio_sorteios
  alter column entrega_token set default gen_random_uuid(),
  alter column entrega_token set not null;
create unique index if not exists sorteio_sorteios_entrega_token_key on public.sorteio_sorteios(entrega_token);

alter table public.xml_upload_history
  add column if not exists artista text,
  add column if not exists musica text;

insert into storage.buckets (id, name, public)
values
  ('empresa-assets', 'empresa-assets', true),
  ('comercial', 'comercial', true),
  ('programas', 'programas', true),
  ('xml-files', 'xml-files', true),
  ('entregas', 'entregas', false)
on conflict (id) do nothing;

-- Authenticated uploads are restricted to the account's own first-level folder.
-- Sub-users may also write to their parent account's folder.
do $$
declare
  bucket_name text;
  policy_suffix text;
  policy_command text;
  policy_clause text;
  policy_name text;
  folder_check text;
begin
  foreach bucket_name in array array['empresa-assets', 'comercial', 'programas', 'xml-files', 'entregas']
  loop
    folder_check := format(
      'bucket_id = %L and (storage.foldername(name))[1] in (auth.uid()::text, coalesce(public.current_parent_user_id()::text, ''''))',
      bucket_name
    );
    foreach policy_suffix in array array['select', 'insert', 'update', 'delete']
    loop
      policy_name := 'house_mix_' || bucket_name || '_' || policy_suffix;
      if exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = policy_name
      ) then
        continue;
      end if;

      if policy_suffix = 'select' then
        policy_command := 'SELECT';
        policy_clause := 'using (' || folder_check || ')';
      elsif policy_suffix = 'insert' then
        policy_command := 'INSERT';
        policy_clause := 'with check (' || folder_check || ')';
      elsif policy_suffix = 'update' then
        policy_command := 'UPDATE';
        policy_clause := 'using (' || folder_check || ') with check (' || folder_check || ')';
      else
        policy_command := 'DELETE';
        policy_clause := 'using (' || folder_check || ')';
      end if;

      execute format(
        'create policy %I on storage.objects for %s to authenticated %s',
        policy_name, policy_command, policy_clause
      );
    end loop;
  end loop;
end $$;

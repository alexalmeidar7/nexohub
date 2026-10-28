-- Reconcile production schema with the forms and workflows audited in House Mix.
-- All changes are additive and idempotent; existing rows and IDs are preserved.

-- Presenters/listeners/programs
alter table public.ouvintes
  add column if not exists origem_cadastro text not null default 'manual',
  add column if not exists sexo text,
  add column if not exists banido boolean not null default false,
  add column if not exists banido_at timestamptz,
  add column if not exists banido_motivo text;

alter table public.programas
  add column if not exists deleted_at timestamptz;

-- Client records shown in Cadastro > Clientes.
alter table public.logos_patrocinadores
  add column if not exists nome text,
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

-- Preferences used by Cadastro > Cidade/Tempo and Música no Ar.
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

-- Roteiro editor, scheduling and publication fields.
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

-- Sorteio winner delivery, PIN and photo workflow.
alter table public.sorteio_sorteios
  add column if not exists apresentador_nome text,
  add column if not exists programa_id uuid,
  add column if not exists programa_nome text,
  add column if not exists entrega_pin text,
  add column if not exists entrega_token uuid default gen_random_uuid(),
  add column if not exists foto_entrega_url text,
  add column if not exists entrega_registrada_em timestamptz;

update public.sorteio_sorteios
set entrega_token = gen_random_uuid()
where entrega_token is null;

alter table public.sorteio_sorteios
  alter column entrega_token set default gen_random_uuid(),
  alter column entrega_token set not null;

create unique index if not exists sorteio_sorteios_entrega_token_key
  on public.sorteio_sorteios(entrega_token);

-- Music history records displayed by the Music on Air module.
alter table public.xml_upload_history
  add column if not exists artista text,
  add column if not exists musica text;

-- Buckets used by the audited image/XML flows. Public image/XML buckets retain
-- public read access; proof-of-delivery photos stay private and use signed URLs.
insert into storage.buckets (id, name, public)
values
  ('empresa-assets', 'empresa-assets', true),
  ('comercial', 'comercial', true),
  ('programas', 'programas', true),
  ('xml-files', 'xml-files', true),
  ('entregas', 'entregas', false)
on conflict (id) do nothing;

-- Scope authenticated writes to the user's own first-level storage folder.
-- Parent-account IDs are accepted for authorized sub-user sessions.
do $$
declare
  bucket_name text;
  policy_record record;
begin
  foreach bucket_name in array array['empresa-assets', 'comercial', 'programas', 'xml-files', 'entregas']
  loop
    for policy_record in
      select *
      from (values
        ('select', 'SELECT'),
        ('insert', 'INSERT'),
        ('update', 'UPDATE'),
        ('delete', 'DELETE')
      ) as p(suffix, command_name)
    loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'house_mix_' || bucket_name || '_' || policy_record.suffix
      ) then
        execute format(
          'create policy %I on storage.objects for %s to authenticated %s using (bucket_id = %L and (storage.foldername(name))[1] in (auth.uid()::text, coalesce(public.current_parent_user_id()::text, ''''))) %s',
          'house_mix_' || bucket_name || '_' || policy_record.suffix,
          policy_record.command_name,
          case when policy_record.command_name = 'INSERT' then '' else '' end,
          bucket_name,
          case when policy_record.command_name in ('INSERT', 'UPDATE')
            then format('with check (bucket_id = %L and (storage.foldername(name))[1] in (auth.uid()::text, coalesce(public.current_parent_user_id()::text, '''')))', bucket_name)
            else ''
          end
        );
      end if;
    end loop;
  end loop;
end $$;

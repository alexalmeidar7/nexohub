-- Align agenda_events with the fields used by AgendaPage.
-- Idempotent because these columns may already exist in restored environments.
alter table public.agenda_eventos
  add column if not exists artes_urls text[],
  add column if not exists edicao_concluida boolean not null default false,
  add column if not exists edicao_notas text not null default '',
  add column if not exists excecoes jsonb not null default '[]'::jsonb,
  add column if not exists horario_gravacao text,
  add column if not exists horario_gravacao_fim text,
  add column if not exists periodo_inicio text,
  add column if not exists periodo_fim text,
  add column if not exists status text not null default 'ativo',
  add column if not exists tipo_evento text not null default 'ao_vivo',
  add column if not exists youtube_descricao text not null default '',
  add column if not exists youtube_titulo text not null default '',
  add column if not exists youtube_url text;

-- Core scheduling domain for each isolated radio database.
-- Tenant identity is implicit in the database; no cross-radio user_id column.

CREATE TABLE IF NOT EXISTS housemix.programas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 200),
  descricao TEXT,
  horario_inicio TIME NOT NULL,
  horario_fim TIME NOT NULL,
  dias_semana TEXT[] NOT NULL DEFAULT '{}',
  apresentador_id UUID,
  apresentadores_ids UUID[] NOT NULL DEFAULT '{}',
  tipo_programa TEXT,
  classificacao_etaria TEXT,
  estudio TEXT,
  selo TEXT,
  capa TEXT,
  thumb TEXT,
  variavel BOOLEAN NOT NULL DEFAULT false,
  data_variavel DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programas_active_schedule
  ON housemix.programas (ativo, horario_inicio)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS housemix.agenda_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  descricao TEXT,
  recorrencia TEXT NOT NULL DEFAULT 'unico',
  prioridade TEXT NOT NULL DEFAULT 'normal',
  tipo_evento TEXT NOT NULL DEFAULT 'live',
  horario_gravacao TIME,
  horario_gravacao_fim TIME,
  status TEXT NOT NULL DEFAULT 'agendado',
  programa_id UUID REFERENCES housemix.programas(id) ON DELETE SET NULL,
  local TEXT NOT NULL DEFAULT '',
  periodo_inicio DATE,
  periodo_fim DATE,
  excecoes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(excecoes) = 'array'),
  artes_urls TEXT[] NOT NULL DEFAULT '{}',
  edicao_concluida BOOLEAN NOT NULL DEFAULT false,
  edicao_notas TEXT NOT NULL DEFAULT '',
  youtube_url TEXT,
  youtube_titulo TEXT NOT NULL DEFAULT '',
  youtube_descricao TEXT NOT NULL DEFAULT '',
  row_version BIGINT NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim >= periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_date
  ON housemix.agenda_eventos (data, status);
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_programa
  ON housemix.agenda_eventos (programa_id)
  WHERE programa_id IS NOT NULL;

REVOKE ALL ON housemix.programas, housemix.agenda_eventos FROM PUBLIC;

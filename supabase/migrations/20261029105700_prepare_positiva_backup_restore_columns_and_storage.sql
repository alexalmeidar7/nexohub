-- Additive preparation for the Positiva recovery. No existing rows are deleted.
ALTER TABLE public.custom_vmix_buttons
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS data_especifica date,
  ADD COLUMN IF NOT EXISTS estudio text,
  ADD COLUMN IF NOT EXISTS shortcut text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'AUDIO';

ALTER TABLE public.logos_patrocinadores
  ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS excluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_at timestamptz;

ALTER TABLE public.preset_commands
  ADD COLUMN IF NOT EXISTS custom_horario text;

ALTER TABLE public.programas
  ADD COLUMN IF NOT EXISTS tipo_programa text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.testemunhais
  ADD COLUMN IF NOT EXISTS programa_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.vmix_connections
  ADD COLUMN IF NOT EXISTS last_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ndi_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('empresa-assets', 'empresa-assets', true),
  ('comercial', 'comercial', true)
ON CONFLICT (id) DO NOTHING;

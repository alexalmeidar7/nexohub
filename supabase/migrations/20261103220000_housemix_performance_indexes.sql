-- House Mix performance indexes identified from live pg_stat_statements and page query patterns.
-- Additive only: no rows or existing indexes are removed.

CREATE INDEX IF NOT EXISTS idx_programas_user_ativo_horario
  ON public.programas (user_id, ativo, horario_inicio);

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_user_data
  ON public.agenda_eventos (user_id, data);

CREATE INDEX IF NOT EXISTS idx_enquetes_agendadas_user_data
  ON public.enquetes_agendadas (user_id, data_enquete);

CREATE INDEX IF NOT EXISTS idx_custom_vmix_buttons_user_estudio
  ON public.custom_vmix_buttons (user_id, estudio);

CREATE INDEX IF NOT EXISTS idx_logos_patrocinadores_user_ativo_excluido
  ON public.logos_patrocinadores (user_id, ativo, excluido);

ANALYZE public.programas;
ANALYZE public.agenda_eventos;
ANALYZE public.enquetes_agendadas;
ANALYZE public.custom_vmix_buttons;
ANALYZE public.logos_patrocinadores;

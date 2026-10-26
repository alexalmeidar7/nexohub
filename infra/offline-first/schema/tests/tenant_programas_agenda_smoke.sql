\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS housemix;
\ir ../tenant/006_programas_agenda.sql
DO $$
DECLARE
  program_id UUID;
  event_id UUID;
  v BIGINT;
BEGIN
  INSERT INTO housemix.programas (nome, horario_inicio, horario_fim, dias_semana)
  VALUES ('Programa smoke', '08:00', '09:00', ARRAY['segunda','quarta'])
  RETURNING id, row_version INTO program_id, v;
  IF v <> 1 THEN RAISE EXCEPTION 'program initial version must be 1'; END IF;

  INSERT INTO housemix.agenda_eventos (data, tipo_evento, programa_id)
  VALUES (DATE '2026-10-26', 'live', program_id)
  RETURNING id INTO event_id;

  IF NOT EXISTS (SELECT 1 FROM housemix.agenda_eventos WHERE id = event_id AND programa_id = program_id) THEN
    RAISE EXCEPTION 'agenda/programa relationship failed';
  END IF;

  UPDATE housemix.programas SET row_version = row_version + 1, updated_at = now()
  WHERE id = program_id;
  IF (SELECT row_version FROM housemix.programas WHERE id = program_id) <> 2 THEN
    RAISE EXCEPTION 'program version increment failed';
  END IF;

  DELETE FROM housemix.programas WHERE id = program_id;
  IF (SELECT programa_id FROM housemix.agenda_eventos WHERE id = event_id) IS NOT NULL THEN
    RAISE EXCEPTION 'agenda FK must null program reference on delete';
  END IF;
END $$;
ROLLBACK;

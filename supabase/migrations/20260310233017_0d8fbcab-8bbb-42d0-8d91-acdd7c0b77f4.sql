CREATE UNIQUE INDEX IF NOT EXISTS idx_musicas_tocadas_dedup ON public.musicas_tocadas (user_id, musica, artista, dia, (horario::text));

-- Remove existing duplicates, keeping the one with a programa value (or the oldest)
DELETE FROM public.musicas_tocadas a
USING public.musicas_tocadas b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.musica = b.musica
  AND a.artista = b.artista
  AND a.dia = b.dia
  AND a.horario::text = b.horario::text;
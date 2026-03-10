-- Remove duplicates keeping earliest entry per user+song+day
DELETE FROM public.musicas_tocadas
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, musica, artista, dia) id
  FROM public.musicas_tocadas
  ORDER BY user_id, musica, artista, dia, horario ASC
);

CREATE UNIQUE INDEX idx_musicas_tocadas_user_song ON public.musicas_tocadas (user_id, musica, artista, dia);
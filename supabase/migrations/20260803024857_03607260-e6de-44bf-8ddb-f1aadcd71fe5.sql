INSERT INTO public.infomusic_excecoes (user_id, termo)
SELECT user_id, trim(t)
FROM (
  SELECT user_id, unnest(string_to_array(infomusic_excecoes, ',')) as t
  FROM public.user_settings
  WHERE infomusic_excecoes IS NOT NULL AND infomusic_excecoes != ''
) sub
WHERE trim(t) != ''
ON CONFLICT (user_id, termo) DO NOTHING;
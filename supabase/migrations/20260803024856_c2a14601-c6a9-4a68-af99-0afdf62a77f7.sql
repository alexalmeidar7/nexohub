INSERT INTO public.infomusic_excecoes (user_id, termo)
SELECT 'd17e65af-e407-466f-9b60-b55c43399513', trim(t)
FROM unnest(string_to_array((SELECT infomusic_excecoes FROM public.user_settings WHERE user_id = 'd17e65af-e407-466f-9b60-b55c43399513'), ',')) AS t
WHERE trim(t) != ''
ON CONFLICT (user_id, termo) DO NOTHING;
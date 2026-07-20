ALTER TABLE public.musicas_tocadas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.musicas_tocadas;
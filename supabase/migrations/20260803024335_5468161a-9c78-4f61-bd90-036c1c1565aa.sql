
CREATE TABLE IF NOT EXISTS public.infomusic_excecoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    termo TEXT NOT NULL, 
    capa_url TEXT,
    background_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, termo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.infomusic_excecoes TO authenticated;
GRANT ALL ON public.infomusic_excecoes TO service_role;

ALTER TABLE public.infomusic_excecoes ENABLE ROW LEVEL SECURITY;

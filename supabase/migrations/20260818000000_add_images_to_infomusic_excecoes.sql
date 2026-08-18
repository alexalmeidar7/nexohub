-- Adiciona colunas para imagem da capa e imagem do artista na tabela de exceções
ALTER TABLE public.infomusic_excecoes ADD COLUMN IF NOT EXISTS capa_url TEXT;
ALTER TABLE public.infomusic_excecoes ADD COLUMN IF NOT EXISTS artista_url TEXT;

-- As permissões já existem se a tabela existir, mas garantimos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.infomusic_excecoes TO authenticated;
GRANT ALL ON public.infomusic_excecoes TO service_role;

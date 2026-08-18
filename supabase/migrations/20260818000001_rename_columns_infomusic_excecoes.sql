-- Renomeia colunas para o padrão solicitado pelo usuário: capa_url e artista_url
-- A migração anterior já adicionou capa_url, vamos garantir que artista_url exista e remover background_url se necessário ou apenas adicionar artista_url.
ALTER TABLE public.infomusic_excecoes ADD COLUMN IF NOT EXISTS artista_url TEXT;

-- Se background_url existia, podemos migrar os dados se fizer sentido, mas o pedido é para novos campos.
-- GRANTs já configurados na migração anterior.

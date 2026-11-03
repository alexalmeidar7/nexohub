-- Additive reconciliation for fields used by current House Mix forms and screens.
-- Preserves existing rows; no table drops, truncates, or data replacement.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS event_types_config jsonb,
  ADD COLUMN IF NOT EXISTS journalistic_prompt text,
  ADD COLUMN IF NOT EXISTS setor text,
  ADD COLUMN IF NOT EXISTS sub_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_news_sites
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.custom_news_sites(id) ON DELETE CASCADE;

ALTER TABLE public.infomusic
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deezer_artist_img text;
CREATE INDEX IF NOT EXISTS idx_infomusic_user_id ON public.infomusic(user_id);

ALTER TABLE public.infomusic_excecoes
  ADD COLUMN IF NOT EXISTS artista_url text;

ALTER TABLE public.music_likes
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS capa text;
UPDATE public.music_likes
   SET titulo = COALESCE(NULLIF(titulo, ''), musica)
 WHERE titulo IS NULL OR titulo = '';
ALTER TABLE public.music_likes
  ALTER COLUMN titulo SET DEFAULT '',
  ALTER COLUMN titulo SET NOT NULL;

ALTER TABLE public.streaming_channels
  ADD COLUMN IF NOT EXISTS catalog_name text,
  ADD COLUMN IF NOT EXISTS classificacao_etaria text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS estudio text,
  ADD COLUMN IF NOT EXISTS horario_fim text,
  ADD COLUMN IF NOT EXISTS horario_inicio text,
  ADD COLUMN IF NOT EXISTS is_hd boolean,
  ADD COLUMN IF NOT EXISTS is_stereo boolean,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS numero_canal text;

ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.selected_news
  ADD COLUMN IF NOT EXISTS resumo text;
ALTER TABLE public.escalada_news
  ADD COLUMN IF NOT EXISTS resumo text;

ALTER TABLE public.wa_broadcasts
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS radio_user_id uuid;

ALTER TABLE public.teleprompters
  ADD COLUMN IF NOT EXISTS is_html boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz,
  ADD COLUMN IF NOT EXISTS texto_atual text DEFAULT '';

ALTER TABLE public.quiz_agendados
  ADD COLUMN IF NOT EXISTS explicacao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS imagem_resposta text NOT NULL DEFAULT '';

ALTER TABLE public.ouvintes
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text;
CREATE INDEX IF NOT EXISTS idx_ouvintes_whatsapp_message_id
  ON public.ouvintes(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

ALTER TABLE public.comercial_mockups
  ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.expire_overdue_sorteios(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt integer := 0;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid()
     AND _user_id IS DISTINCT FROM public.current_parent_user_id() THEN
    RAISE EXCEPTION 'not authorized to expire sorteios for this account' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT s.id, s.premio_id, s.observacoes, COALESCE(p.dias_validade, 7) AS dias
      FROM public.sorteio_sorteios s
      JOIN public.sorteio_premios p ON p.id = s.premio_id
     WHERE s.user_id = _user_id
       AND s.entregue = false
       AND s.expirado = false
       AND s.data_sorteio + (COALESCE(p.dias_validade, 7) || ' days')::interval < now()
  LOOP
    UPDATE public.sorteio_sorteios
       SET expirado = true,
           data_expiracao = now(),
           observacoes = COALESCE(observacoes || E'\n', '') || '[PRÊMIO NÃO RETIRADO no prazo de ' || r.dias || ' dias — devolvido ao estoque]'
     WHERE id = r.id AND user_id = _user_id;

    UPDATE public.sorteio_premios
       SET quantidade_estoque = quantidade_estoque + 1
     WHERE id = r.premio_id AND user_id = _user_id;

    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_overdue_sorteios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_overdue_sorteios(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_comercial()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  owner_ids uuid[];
BEGIN
  owner_ids := ARRAY[auth.uid(), public.current_parent_user_id()];
  DELETE FROM public.testemunhais
   WHERE user_id = ANY(owner_ids) AND data_fim < CURRENT_DATE;
  DELETE FROM public.promocoes
   WHERE user_id = ANY(owner_ids) AND data_fim < CURRENT_DATE;
  UPDATE public.logos_patrocinadores
     SET ativo = false
   WHERE user_id = ANY(owner_ids) AND data_final < CURRENT_DATE AND ativo = true;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_comercial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_comercial() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Add image column to wa_broadcasts so ADS > Chatbot campaigns can include an image
ALTER TABLE public.wa_broadcasts ADD COLUMN IF NOT EXISTS image_url text;

-- Site banners table (ADS > Site)
CREATE TABLE IF NOT EXISTS public.site_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  image_url text NOT NULL,
  link_url text,
  posicao text NOT NULL DEFAULT 'topo',
  data_inicial date,
  data_final date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_banners TO authenticated;
GRANT SELECT ON public.site_banners TO anon;
GRANT ALL ON public.site_banners TO service_role;

ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own site banners"
  ON public.site_banners FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view active site banners"
  ON public.site_banners FOR SELECT
  USING (ativo = true);

CREATE TRIGGER update_site_banners_updated_at
  BEFORE UPDATE ON public.site_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

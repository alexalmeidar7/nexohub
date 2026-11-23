-- Public link-in-bio pages per station. Public read exposes only published business links.
CREATE TABLE IF NOT EXISTS public.link_bio_pages (
  user_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  station_name text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  background_top text NOT NULL DEFAULT '#260000',
  background_bottom text NOT NULL DEFAULT '#ee1116',
  button_color text NOT NULL DEFAULT '#f00810',
  whatsapp_url text NOT NULL DEFAULT '',
  site_url text NOT NULL DEFAULT '',
  map_url text NOT NULL DEFAULT '',
  ios_store_url text NOT NULL DEFAULT '',
  android_store_url text NOT NULL DEFAULT '',
  instagram_url text NOT NULL DEFAULT '',
  facebook_url text NOT NULL DEFAULT '',
  youtube_url text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT link_bio_station_name_limit CHECK(length(station_name)<=120),
  CONSTRAINT link_bio_links_limit CHECK(
    length(whatsapp_url)<=2048 AND length(site_url)<=2048 AND length(map_url)<=2048
    AND length(ios_store_url)<=2048 AND length(android_store_url)<=2048
    AND length(instagram_url)<=2048 AND length(facebook_url)<=2048 AND length(youtube_url)<=2048
    AND length(logo_url)<=2048),
  CONSTRAINT link_bio_colors_valid CHECK (
    background_top ~ '^#[0-9a-fA-F]{6}$' AND
    background_bottom ~ '^#[0-9a-fA-F]{6}$' AND
    button_color ~ '^#[0-9a-fA-F]{6}$')
);
ALTER TABLE public.link_bio_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.link_bio_pages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.link_bio_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.link_bio_pages TO authenticated;
GRANT ALL ON public.link_bio_pages TO service_role;

DROP POLICY IF EXISTS "Public can read published link bio" ON public.link_bio_pages;
CREATE POLICY "Public can read published link bio" ON public.link_bio_pages
 FOR SELECT TO anon, authenticated USING (published = true OR user_id = auth.uid());
DROP POLICY IF EXISTS "Station owner can create link bio" ON public.link_bio_pages;
CREATE POLICY "Station owner can create link bio" ON public.link_bio_pages
 FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Station owner can change link bio" ON public.link_bio_pages;
CREATE POLICY "Station owner can change link bio" ON public.link_bio_pages
 FOR UPDATE TO authenticated USING (user_id = auth.uid())
 WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Station owner can delete link bio" ON public.link_bio_pages;
CREATE POLICY "Station owner can delete link bio" ON public.link_bio_pages
 FOR DELETE TO authenticated USING (user_id = auth.uid());

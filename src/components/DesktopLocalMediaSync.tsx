import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSlug } from "@/hooks/useUserSlug";
import { findClientAccountById } from "@/lib/clientAuthAccounts";
import { localizeXmlImageUrls } from "@/lib/desktopLocalXml";
import { cachePromotionBanners, rotateDesktopBanner, hasRotatingPromotionBanners, saveDesktopXml, BANNER_DURATION_MS, type PromotionBanner } from "@/lib/desktopPromotionBanners";
import { createOwnedRealtimeChannel } from "@/lib/ownedRealtimeChannel";
import { createDesktopXmlRefresh } from "@/lib/desktopXmlRefresh";
import { MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { toast } from "sonner";

const XML_FEEDS = [
  ["geral.xml", "serve-xml-geral"], ["tempo.xml", "serve-xml-tempo"],
  ["roteiro.xml", "serve-xml-roteiro-estudio"], ["musica.xml", "serve-xml-broadcast", "tipo=musica"],
  ["logos.xml", "serve-xml-logos"], ["broadcast.xml", "serve-xml-broadcast"],
  ["batalha.xml", "serve-xml-batalha"], ["enquete.xml", "serve-xml-enquete"],
  ["cenarios-estudio.xml", "serve-xml-cenarios-estudio"], ["quiz.xml", "serve-xml-quiz"],
  ["tclock-shows.xml", "serve-xml-tclock-shows"], ["vmix-live.xml", "serve-xml-vmix-live"],
] as const;

const IMAGE_FIELDS: Array<[string, Array<[string, string]>]> = [
  ["apresentadores", [["foto", "apresentadores"], ["background_url", "fundos"]]],
  ["programas", [["thumb", "capas"], ["capa", "capas"], ["selo", "selos"]]],
  ["empresa_config", [["logo", "logos"], ["background_url", "fundos"]]],
  ["logos_patrocinadores", [["logo_url", "logos"]]],
  ["infomusic_excecoes", [["artista_url", "deezer"], ["background_url", "deezer"], ["capa_url", "capas"]]],
  ["user_settings", [["infomusic_excecoes_artista_url", "deezer"], ["infomusic_excecoes_capa_url", "capas"]]],
  ["streaming_channels", [["background_url", "player logo-canal"], ["cover_url", "player capa-canal"], ["logo_url", "player thumb-canal"]]],
  ["shopping_products", [["image_url", "diversas"]]],
  ["comercial_preroll", [["background_url", "banners"]]],
];

function collectUrls(value: unknown, urls: Set<string>) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.add(value);
  } else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectUrls(item, urls));
}

export default function DesktopLocalMediaSync() {
  const { user, loading } = useAuth();
  const account = findClientAccountById(user?.id);
  const ownerId = account?.parentUserId || account?.id || user?.id;
  const slug = useUserSlug(ownerId);

  useEffect(() => {
    const desktop = window.houseMixDesktop;
    if (!desktop || loading || !ownerId || !slug) return;
    let stopped = false;
    let running = false;
    let pending = false;
    let delay = 60_000;
    let refreshTimer: ReturnType<typeof setTimeout>;
    let rotationTimer: ReturnType<typeof setTimeout>;
    let lastWarning = "";
    const rotate = async () => {
      try {
        if (hasRotatingPromotionBanners(slug)) {
          await Promise.all(["broadcast.xml", "geral.xml"].map(file =>
            rotateDesktopBanner(desktop, slug, file).catch(() => {})));
        }
      } finally {
        if (!stopped) rotationTimer = setTimeout(() => void rotate(), BANNER_DURATION_MS - Date.now() % BANNER_DURATION_MS);
      }
    };
    const refresh = async () => {
      if (stopped) return;
      if (running) { pending = true; return; }
      clearTimeout(refreshTimer);
      running = true;
      try {
        let promotions: PromotionBanner[];
        if (!navigator.onLine) {
          const cached = localStorage.getItem(`nexohub_promocoes_${ownerId}`);
          if (!cached) return;
          promotions = JSON.parse(cached);
        } else {
          const { data, error } = await supabase.from("promocoes")
            .select("id,user_id,nome,imagem_url,banner_l_url,data_inicio,data_fim").eq("user_id", ownerId).order("id");
          if (error) {
            const fallback = await supabase.functions.invoke("public-promo-data", { body: { slug: ownerId } });
            if (fallback.error || !Array.isArray(fallback.data?.promocoes)) throw fallback.error || error;
            promotions = fallback.data.promocoes;
          } else promotions = data || [];
        }
        if (stopped || !Array.isArray(promotions)) return;
        await desktop.initializeLocalAssets(slug);
        const result = await cachePromotionBanners(promotions, ownerId, slug, desktop);
        if (stopped) return;
        const warning = result.failed.join(", ");
        if (warning && warning !== lastWarning) toast.warning("Alguns banners L precisam de atenção", {
          description: `Arquivo indisponível na origem: ${warning}. Os demais continuam em rodízio.`, duration: 12000,
        });
        lastWarning = warning;
        delay = result.failed.length ? Math.min(delay * 2, 300_000) : 60_000;
        await Promise.all(["broadcast.xml", "geral.xml"].map(file => rotateDesktopBanner(desktop, slug, file).catch(() => {})));
      } catch (error) {
        delay = Math.min(delay * 2, 300_000);
        console.warn("Falha ao sincronizar banners de promoções", error);
      } finally {
        running = false;
        if (!stopped) {
          refreshTimer = setTimeout(() => void refresh(), pending ? 0 : delay);
          pending = false;
        }
      }
    };
    const onChange = () => void refresh();
    const channel = createOwnedRealtimeChannel(supabase.realtime, `desktop-promo-banners-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "promocoes", filter: `user_id=eq.${ownerId}` }, onChange)
      .subscribe();
    window.addEventListener("online", onChange);
    window.addEventListener("promocoes:updated", onChange);
    void refresh();
    void rotate();
    return () => {
      stopped = true;
      clearTimeout(refreshTimer);
      clearTimeout(rotationTimer);
      window.removeEventListener("online", onChange);
      window.removeEventListener("promocoes:updated", onChange);
      void supabase.removeChannel(channel);
    };
  }, [loading, ownerId, slug]);

  useEffect(() => {
    const desktop = window.houseMixDesktop;
    if (!desktop || loading || !ownerId || !slug) return;
    let stopped = false;
    let imagesRunning = false;
    let lastImages = 0;
    const localizing = new Set<string>();

    const sync = async () => {
      if (stopped) return;
      try {
        await desktop.initializeLocalAssets(slug);
        const supabaseBase = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseBase) return;

        const syncXml = async () => {
          await Promise.all(XML_FEEDS.map(async ([filename, fn, extra]) => {
            if (stopped) return;
            if (!navigator.onLine) return;
            const params = new URLSearchParams({ user_id: ownerId });
            if (fn === "serve-xml-geral" || fn === "serve-xml-enquete" || fn === "serve-xml-quiz") params.set("slug", slug);
            if (fn === "serve-xml-cenarios-estudio") { params.delete("user_id"); params.set("uid", ownerId); }
            if (extra) new URLSearchParams(extra).forEach((value, key) => params.set(key, value));
            if (fn === "serve-xml-roteiro-estudio") params.set("estudio", "Estudio FM");
            try {
              const response = await fetch(`${supabaseBase}/functions/v1/${fn}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
              if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
              const xml = (await response.text()).trim();
              if (xml.startsWith("<") && !xml.includes("<!DOCTYPE html>") && !xml.includes("<error>")) {
                // Publish current text immediately using already-cached artwork.
                // Slow/missing image downloads must never hold back program changes.
                const localXml = await localizeXmlImageUrls(xml, slug, desktop, true);
                if (stopped) return;
                await saveDesktopXml(desktop, slug, filename, localXml);
                if (!localizing.has(filename)) {
                  localizing.add(filename);
                  void (async () => {
                    const downloaded = await localizeXmlImageUrls(xml, slug, desktop);
                    if (!stopped && downloaded !== localXml) {
                      // Persist newly downloaded local file:// paths immediately, without
                      // waiting for another remote XML request or Realtime event.
                      await saveDesktopXml(desktop, slug, filename, downloaded);
                    }
                  })().catch(error => console.warn(`Local XML artwork ${filename}`, error))
                    .finally(() => localizing.delete(filename));
                }
              }
            } catch (error) {
              // One unavailable feed must not freeze any other XML file.
              if (!stopped) console.warn(`Local XML refresh failed: ${filename}`, error);
            }
          }));
        };

        const syncImages = async () => {
          if (!navigator.onLine) return;
          const urls = new Map<string, string>();
          for (const [table, mappedFields] of IMAGE_FIELDS) {
            if (stopped) return;
            try {
              const fields = mappedFields.map(([field]) => field);
              const { data } = await (supabase.from(table as any) as any).select(fields.join(",")).eq("user_id", ownerId);
              for (const row of data || []) for (const [field, category] of mappedFields) {
                const found = new Set<string>(); collectUrls(row[field], found);
                found.forEach((url) => urls.set(url, `${category} ${field}`));
              }
            } catch { /* A table not enabled for this account does not stop the other downloads. */ }
          }
          const items = [...urls.entries()];
          let index = 0;
          const worker = async () => {
            while (!stopped) {
              const item = items[index++];
              if (!item) return;
              await desktop.cacheImage(item[0], item[1], slug).catch(() => null);
            }
          };
          await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
        };

        if (!imagesRunning && Date.now() - lastImages >= 4 * 60 * 60 * 1000) {
          imagesRunning = true;
          void syncImages().then(() => { lastImages = Date.now(); })
            .catch(error => console.warn("Local artwork refresh failed", error))
            .finally(() => { imagesRunning = false; });
        }
        await syncXml();
      } catch (error) { if (!stopped) console.warn("Local XML sync failed", error); }
    };

    const refresh = createDesktopXmlRefresh(sync);
    const onChange = () => refresh.request();
    let lastMusic = "";
    const onMusic = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; data?: Record<string, unknown> }>).detail;
      if (detail?.userId !== ownerId) return;
      const data = detail.data || {};
      const signature = JSON.stringify([data.titulo, data.artista, data.capa, data.deezer_artist_img]);
      if (signature === lastMusic) return;
      lastMusic = signature; refresh.request();
    };
    const channel = createOwnedRealtimeChannel(supabase.realtime, `desktop-local-xml-${ownerId}`);
    for (const table of ["programas", "roteiros", "agenda_eventos", "apresentadores", "empresa_config", "user_settings", "logos_patrocinadores", "promocoes", "enquetes_agendadas", "quiz_agendados", "batalhas_agendadas", "musicas_tocadas", "cenario_estudio_grupos", "cenario_estudio_tvs"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${ownerId}` }, onChange);
    }
    channel.subscribe(status => { if (status === "SUBSCRIBED") refresh.request(); });
    window.addEventListener("online", onChange);
    window.addEventListener(MUSIC_DATA_EVENT, onMusic);
    refresh.request();
    return () => {
      stopped = true; refresh.stop();
      window.removeEventListener("online", onChange);
      window.removeEventListener(MUSIC_DATA_EVENT, onMusic);
      void supabase.removeChannel(channel);
    };
  }, [loading, ownerId, slug]);

  return null;
}

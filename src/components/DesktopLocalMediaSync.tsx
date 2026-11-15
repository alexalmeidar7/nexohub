import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSlug } from "@/hooks/useUserSlug";
import { findClientAccountById } from "@/lib/clientAuthAccounts";

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

    const sync = async () => {
      if (running || stopped) return;
      running = true;
      try {
        await desktop.initializeLocalAssets(slug);
        const supabaseBase = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseBase) return;

        const syncXml = async () => {
          for (const [filename, fn, extra] of XML_FEEDS) {
            if (stopped) return;
            const params = new URLSearchParams({ user_id: ownerId });
            if (fn === "serve-xml-geral" || fn === "serve-xml-enquete" || fn === "serve-xml-quiz") params.set("slug", slug);
            if (fn === "serve-xml-cenarios-estudio") { params.delete("user_id"); params.set("uid", ownerId); }
            if (extra) new URLSearchParams(extra).forEach((value, key) => params.set(key, value));
            if (fn === "serve-xml-roteiro-estudio") params.set("estudio", "Estudio FM");
            try {
              const response = await fetch(`${supabaseBase}/functions/v1/${fn}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
              if (!response.ok) continue;
              const xml = (await response.text()).trim();
              if (xml.startsWith("<") && !xml.includes("<!DOCTYPE html>") && !xml.includes("<error>")) await desktop.saveXml(slug, filename, xml);
            } catch { /* Preserve the most recent local XML while offline. */ }
          }
        };

        const syncImages = async () => {
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

        await Promise.all([syncXml(), syncImages()]);
      } finally { running = false; }
    };

    void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void sync(), 4 * 60 * 60 * 1000);
    return () => { stopped = true; window.removeEventListener("online", onOnline); window.clearInterval(timer); };
  }, [loading, ownerId, slug]);

  return null;
}

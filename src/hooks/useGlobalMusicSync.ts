import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normalizeMusicText } from "@/lib/textEncoding";

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";

function parseXml(xmlStr: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const titulo = normalizeMusicText(doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título");
    const artista = normalizeMusicText(doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido");
    const duracaoStr = doc.querySelector("duracao")?.textContent || doc.querySelector("duration")?.textContent || "0";
    const capa = doc.querySelector("capa")?.textContent || doc.querySelector("cover")?.textContent || "";
    let duracao = 0;
    if (duracaoStr.includes(":")) {
      const parts = duracaoStr.split(":").map(Number);
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      duracao = parseFloat(duracaoStr) || 0;
      if (duracao > 600) duracao = duracao / 1000;
    }
    return { titulo, artista, duracao, capa };
  } catch { return null; }
}

/**
 * Polls the user's XML music source and keeps localStorage in sync.
 * Can be used from Dashboard, PlayerHome, or any page that needs live music data.
 */
export function useGlobalMusicSync() {
  const { user } = useAuth();
  const coverCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    const fetchAndSync = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const url = settings?.music_xml_url;
      if (!url) return;

      try {
        const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
          body: { url },
        });
        if (rssError || !rssData?.content) return;

        const text = rssData.content;
        const data = parseXml(text);
        if (!data) return;

        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            data.capa = coverCacheRef.current[cacheKey];
          } else {
            try {
              const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
              const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
              const itunesData = await itunesRes.json();
              if (itunesData.results?.length > 0) {
                const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                if (cover) {
                  data.capa = cover;
                  coverCacheRef.current[cacheKey] = cover;
                }
              }
            } catch {}
          }
        }

        const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
        const prev = prevRaw ? JSON.parse(prevRaw) : null;
        if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
          localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
        } else if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
        }
      } catch {}
    };

    const startTimer = setTimeout(fetchAndSync, 1500);
    const interval = setInterval(fetchAndSync, 5000);
    return () => { clearTimeout(startTimer); clearInterval(interval); };
  }, [user]);
}

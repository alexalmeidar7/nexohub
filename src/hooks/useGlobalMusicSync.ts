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

function getCurrentProgram(
  programas: { nome: string; horario_inicio: string; horario_fim: string; dias_semana: string[] | null; variavel: boolean; data_variavel: string | null; ativo: boolean }[]
): string {
  const now = new Date();
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const diaAtual = dias[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayStr = now.toISOString().slice(0, 10);

  for (const p of programas) {
    if (!p.ativo) continue;
    if (p.variavel) {
      if (p.data_variavel === todayStr && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) return p.nome;
    } else {
      if (p.dias_semana?.includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) return p.nome;
    }
  }
  return "";
}

/**
 * Polls the user's XML music source every 3s, keeps localStorage in sync,
 * and records song changes to musicas_tocadas for history.
 */
export function useGlobalMusicSync() {
  const { user } = useAuth();
  const coverCacheRef = useRef<Record<string, string>>({});
  const cachedUrlRef = useRef<string | null>(null);
  const urlFetchedRef = useRef(false);
  const lastRecordedRef = useRef<string>("");
  const useDirectFetchRef = useRef<boolean | null>(null); // null = not tested, true = CORS ok

  useEffect(() => {
    if (!user) return;

    const recordToHistory = async (titulo: string, artista: string) => {
      const key = `${artista}||${titulo}`;
      if (lastRecordedRef.current === key) return;
      lastRecordedRef.current = key;

      try {
        const { data: programas } = await supabase
          .from("programas")
          .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
          .eq("user_id", user.id)
          .eq("ativo", true);

        const programa = getCurrentProgram(programas || []);
        const now = new Date();

        await supabase.from("musicas_tocadas").upsert({
          user_id: user.id,
          dia: now.toISOString().slice(0, 10),
          horario: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
          programa,
          artista,
          musica: titulo,
        }, { onConflict: "user_id,musica,artista,dia", ignoreDuplicates: true });
      } catch {}
    };

    const fetchAndSync = async () => {
      // Cache URL to avoid re-fetching settings every poll
      if (!urlFetchedRef.current) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("music_xml_url")
          .eq("user_id", user.id)
          .maybeSingle();
        cachedUrlRef.current = settings?.music_xml_url || null;
        urlFetchedRef.current = true;
      }

      const url = cachedUrlRef.current;
      if (!url) return;

      try {
        let text: string | null = null;

        // Try direct fetch first (much faster, ~200ms vs ~2s edge function)
        if (useDirectFetchRef.current !== false) {
          try {
            const directRes = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (directRes.ok) {
              text = await directRes.text();
              useDirectFetchRef.current = true;
            }
          } catch {
            // CORS or network error — mark as unavailable, use edge function
            if (useDirectFetchRef.current === null) useDirectFetchRef.current = false;
          }
        }

        // Fallback to edge function
        if (!text) {
          const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
            body: { url },
          });
          if (rssError || !rssData?.content) return;
          text = rssData.content;
        }

        if (!text) return;
        const data = parseXml(text);
        if (!data) return;

        // Fetch cover from iTunes if missing (non-blocking)
        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            data.capa = coverCacheRef.current[cacheKey];
          } else {
            // Fire and forget - don't block sync
            const fetchCover = async () => {
              try {
                const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
                const itunesData = await itunesRes.json();
                if (itunesData.results?.length > 0) {
                  const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                  if (cover) {
                    coverCacheRef.current[cacheKey] = cover;
                    const curRaw = localStorage.getItem(MUSIC_DATA_KEY);
                    if (curRaw) {
                      const cur = JSON.parse(curRaw);
                      if (cur.titulo === data.titulo && cur.artista === data.artista && !cur.capa) {
                        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...cur, capa: cover }));
                      }
                    }
                  }
                }
              } catch {}
            };
            fetchCover();
          }
        }

        const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
        const prev = prevRaw ? JSON.parse(prevRaw) : null;
        const songChanged = !prev || prev.titulo !== data.titulo || prev.artista !== data.artista;

        if (songChanged) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
          localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
          // Record to history
          if (data.titulo && data.titulo !== "Sem título") {
            recordToHistory(data.titulo, data.artista);
          }
        } else if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
        }
      } catch {}
    };

    // Start immediately, poll every 3s
    fetchAndSync();
    const interval = setInterval(fetchAndSync, 3000);

    // Refresh cached URL every 60s in case user changes it
    const urlRefresh = setInterval(() => { urlFetchedRef.current = false; }, 60000);

    return () => { clearInterval(interval); clearInterval(urlRefresh); };
  }, [user]);
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";
const BOT_XML_LAST_RUN_KEY = "bot_xml_last_run";
const LOCAL_SOURCE_GRACE_MS = 15000;

function isPlaceholderTrack(data: { titulo?: string; artista?: string }) {
  const titulo = (data.titulo || "").trim().toLowerCase();
  const artista = (data.artista || "").trim().toLowerCase();
  return (titulo === "" || titulo === "sem título" || titulo === "sem titulo") && (artista === "" || artista === "desconhecido");
}

/** Returns parsed data, or "stopped" if the XML is valid but has no track, or null on parse error */
function parseXml(xmlStr: string): { titulo: string; artista: string; duracao: number; capa: string } | "stopped" | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const rawTitulo = doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "";
    const rawArtista = doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "";
    const titulo = normalizeMusicText(rawTitulo);
    const artista = normalizeMusicText(rawArtista);
    const categoria = (doc.querySelector("categoria")?.textContent || "").trim().toUpperCase();
    if (!titulo && !artista) return categoria === "STOPPED" || categoria === "" ? "stopped" : null;
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
    return {
      titulo: titulo || "Sem título",
      artista: artista || "Desconhecido",
      duracao,
      capa,
    };
  } catch { return null; }
}

function buildFreshUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_lvcb", Date.now().toString());
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_lvcb=${Date.now()}`;
  }
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
  const cachedSettingsRef = useRef<{ url: string | null; mode: string; localFileName: string | null }>({
    url: null,
    mode: "online",
    localFileName: null,
  });
  const settingsFetchedRef = useRef(false);
  const lastRecordedRef = useRef<string>("");
  const directFetchOkRef = useRef<boolean | null>(null);
  const fetchCountRef = useRef(0);
  const lastLocalSyncAtRef = useRef(0);
  const onlineStoppedRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const recordToHistory = async (titulo: string, artista: string) => {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const key = `${day}||${artista}||${titulo}`;
      if (lastRecordedRef.current === key) return;

      try {
        const { data: programas } = await supabase
          .from("programas")
          .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
          .eq("user_id", user.id)
          .eq("ativo", true);

        const programa = getCurrentProgram(programas || []);

        const { error } = await supabase.from("musicas_tocadas").upsert({
          user_id: user.id,
          dia: day,
          horario: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
          programa,
          artista,
          musica: titulo,
        }, { onConflict: "user_id,musica,artista,dia", ignoreDuplicates: true });

        if (!error) {
          lastRecordedRef.current = key;
        } else {
          console.warn("[MusicSync] History insert error:", error.message);
        }
      } catch (e) {
        console.warn("[MusicSync] History error:", e);
      }
    };

    const applyMusicData = (data: { titulo: string; artista: string; duracao: number; capa: string }) => {
      const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      const prevHasRealTrack = !!prev && !isPlaceholderTrack(prev);
      if (prevHasRealTrack && isPlaceholderTrack(data)) return;

      const songChanged = !prev || prev.titulo !== data.titulo || prev.artista !== data.artista;

      if (songChanged) {
        // Guard: if localStorage was updated very recently (< 5s) with a different song,
        // another source (e.g. MusicaNoAr local file monitor) likely has fresher data — skip
        const existingStartStr = localStorage.getItem(MUSIC_START_KEY);
        if (existingStartStr && prev) {
          const age = Date.now() - parseInt(existingStartStr, 10);
          if (age < 5000) return; // recent update — don't overwrite
        }

        const now = Date.now();
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
        localStorage.setItem(MUSIC_START_KEY, now.toString());
        // Persist start time to DB for cross-session/device continuity
        (async () => {
          try {
            await mergeUserDashboardItems(user.id, {
              music_start_time: now,
              music_current_title: data.titulo,
              music_current_artist: data.artista,
              music_current_cover: data.capa || "",
            });
          } catch {}
        })();
      } else if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
        // Persist cover to DB so public users get it too
        (async () => {
          try {
            await mergeUserDashboardItems(user.id, { music_current_cover: data.capa });
          } catch {}
        })();
      }

      if (!isPlaceholderTrack(data)) {
        void recordToHistory(data.titulo, data.artista || "Desconhecido");
      }
    };

    const fetchCoverAsync = (data: { titulo: string; artista: string; capa: string }) => {
      if (data.capa) return;
      const cacheKey = `${data.artista}-${data.titulo}`;
      if (coverCacheRef.current[cacheKey]) {
        data.capa = coverCacheRef.current[cacheKey];
        return;
      }
      const fetchCover = async () => {
        try {
          const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
          const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`, { signal: AbortSignal.timeout(3000) });
          const itunesData = await itunesRes.json();
          if (itunesData.results?.length > 0) {
            const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
            if (cover) {
              coverCacheRef.current[cacheKey] = cover;
              const curRaw = localStorage.getItem(MUSIC_DATA_KEY);
              if (!curRaw) return;

              const cur = JSON.parse(curRaw) as { titulo?: string; artista?: string; capa?: string };
              const sameTrack = cur.titulo === data.titulo && cur.artista === data.artista;
              if (!sameTrack || cur.capa === cover) return;

              localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...cur, capa: cover }));

              if (user?.id) {
                void mergeUserDashboardItems(user.id, {
                  music_current_title: data.titulo,
                  music_current_artist: data.artista,
                  music_current_cover: cover,
                }).catch(() => {});
              }
            }
          }
        } catch {}
      };
      void fetchCover();
    };

    const fetchXmlFromUrl = async (url: string): Promise<string | null> => {
      // Reset direct fetch flag every 20 cycles (~60s) to retry CORS
      if (fetchCountRef.current % 20 === 0) {
        directFetchOkRef.current = null;
      }

      // Try direct fetch first
      if (directFetchOkRef.current !== false) {
        try {
          const directRes = await fetch(buildFreshUrl(url), {
            headers: {
              "Cache-Control": "no-cache, no-store, max-age=0",
              Pragma: "no-cache",
            },
            signal: AbortSignal.timeout(4000),
            cache: "no-store",
          });
          if (directRes.ok) {
            directFetchOkRef.current = true;
            return await directRes.text();
          }
        } catch {
          if (directFetchOkRef.current === null) directFetchOkRef.current = false;
        }
      }

      // Fallback to edge function
      try {
        const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
          body: { url },
        });
        if (!rssError && rssData?.content) {
          return rssData.content;
        }
        console.warn("[MusicSync] Edge fetch-rss failed:", rssError?.message);
      } catch (e) {
        console.warn("[MusicSync] Edge fetch-rss exception:", e);
      }

      return null;
    };

    const fetchAndSync = async () => {
      fetchCountRef.current++;

      // Cache settings to avoid re-fetching every poll
      if (!settingsFetchedRef.current) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("music_xml_url, music_source_mode, dashboard_items")
          .eq("user_id", user.id)
          .maybeSingle();

        const dashboardItems = settings?.dashboard_items as { local_xml_filename?: string } | null;
        cachedSettingsRef.current = {
          url: settings?.music_xml_url || null,
          mode: settings?.music_source_mode || "online",
          localFileName: dashboardItems?.local_xml_filename || null,
        };
        settingsFetchedRef.current = true;
      }

      const { url, mode, localFileName } = cachedSettingsRef.current;
      const useOnline = mode === "online" || mode === "both";
      const useLocal = mode === "pasta" || mode === "both";

      const syncLocalFromStorage = async (): Promise<boolean> => {
        if (!useLocal || !localFileName) return false;
        try {
          const filePath = `local-xml-${user.id}.xml`;
          const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(filePath);
          if (!urlData?.publicUrl) return false;
          const res = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, {
            signal: AbortSignal.timeout(4000),
            cache: "no-store",
          });
          if (!res.ok) return false;
          const text = await res.text();
          if (!text) return false;
          const data = parseXml(text);
          if (!data || data === "stopped") return false;
          if (isPlaceholderTrack(data)) return false;
          lastLocalSyncAtRef.current = Date.now();
          fetchCoverAsync(data);
          applyMusicData(data);
          localStorage.setItem(BOT_XML_LAST_RUN_KEY, Date.now().toString());
          return true;
        } catch {
          // keep online source running
          return false;
        }
      };

      const syncOnline = async (): Promise<"ok" | "stopped" | "skip"> => {
        if (!useOnline || !url) return "skip";

        // When online is NOT stopped, respect local source grace period
        const localSourceHealthy = !onlineStoppedRef.current
          && useLocal
          && !!localFileName
          && lastLocalSyncAtRef.current > 0
          && Date.now() - lastLocalSyncAtRef.current < LOCAL_SOURCE_GRACE_MS;

        if (localSourceHealthy) return "skip";

        const text = await fetchXmlFromUrl(url);
        if (!text) return "skip";

        const data = parseXml(text);
        if (data === "stopped") {
          onlineStoppedRef.current = true;
          return "stopped";
        }
        if (!data) return "skip";

        onlineStoppedRef.current = false;
        fetchCoverAsync(data);
        applyMusicData(data);
        localStorage.setItem(BOT_XML_LAST_RUN_KEY, Date.now().toString());
        return "ok";
      };

      // Run online FIRST so we can detect STOPPED before local runs
      const onlineResult = await syncOnline();

      // If online is STOPPED, try local — it might have fresher data
      // If online is OK, still try local (it will be skipped if same data)
      const localSynced = await syncLocalFromStorage();

      // If online is STOPPED and local also didn't provide real data,
      // clear stale music from localStorage so UI shows "Aguardando"
      if (onlineResult === "stopped" && !localSynced) {
        const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
        const prevStart = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
        if (prevRaw && prevStart > 0) {
          const ageMs = Date.now() - prevStart;
          const prev = JSON.parse(prevRaw) as { duracao?: number };
          const maxAge = Math.max(15 * 60 * 1000, (prev.duracao || 0) * 1000 + 120000);
          if (ageMs > maxAge) {
            localStorage.removeItem(MUSIC_DATA_KEY);
            localStorage.removeItem(MUSIC_START_KEY);
          }
        }
      }

      // If no configured source, still keep history from current canonical localStorage
      if ((!useOnline || !url) && (!useLocal || !localFileName)) {
        try {
          const raw = localStorage.getItem(MUSIC_DATA_KEY);
          if (!raw) return;
          const localMusic = JSON.parse(raw) as { titulo?: string; artista?: string };
          const titulo = normalizeMusicText(localMusic?.titulo || "");
          const artista = normalizeMusicText(localMusic?.artista || "") || "Desconhecido";
          if (titulo && titulo !== "Sem título") {
            void recordToHistory(titulo, artista);
          }
        } catch {}
        return;
      }

    };

    // Start immediately, poll every 3s
    fetchAndSync();
    const interval = setInterval(fetchAndSync, 2000);

    // Refresh cached settings every 15s in case user changes sources
    const urlRefresh = setInterval(() => { settingsFetchedRef.current = false; }, 15000);

    return () => { clearInterval(interval); clearInterval(urlRefresh); };
  }, [user]);
}

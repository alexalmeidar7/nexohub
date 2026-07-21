import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { musicDataKey, musicStartKey, botXmlLastRunKey, writeMusicData } from "@/lib/musicStorageKeys";
import { applyTrackChangeWithCuriosityGuard } from "@/lib/musicTrackUpdate";
import { isJornalFmTxtPayload, jornalFmTxtToPseudoXml } from "@/lib/jornalFmTxt";
import { fetchArtistImageCached } from "@/lib/artistImageCache";


const LOCAL_SOURCE_GRACE_MS = 15000;

const BREAK_LABELS = new Set(["break", "ebs curtas", "intervalo", "commercial break"]);

function isBreakTrack(data: { titulo?: string; artista?: string }) {
  const t = (data.titulo || "").trim().toLowerCase();
  const a = (data.artista || "").trim().toLowerCase();
  return BREAK_LABELS.has(t) || BREAK_LABELS.has(a);
}

function isStandbyTrack(data: { titulo?: string; artista?: string }) {
  const s = "standby musical";
  const t = (data.titulo || "").trim().toLowerCase();
  const a = (data.artista || "").trim().toLowerCase();
  return t === s || a === s;
}


function isPlaceholderTrack(data: { titulo?: string; artista?: string }) {
  const titulo = (data.titulo || "").trim().toLowerCase();
  const artista = (data.artista || "").trim().toLowerCase();
  return (titulo === "" || titulo === "sem título" || titulo === "sem titulo") && (artista === "" || artista === "desconhecido");
}

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

export function useGlobalMusicSync(enabled: boolean = true) {
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
  const standbyPresenterRef = useRef<{ photo: string; ts: number }>({ photo: "", ts: 0 });

  useEffect(() => {
    if (!user || !enabled) return;
    const MUSIC_DATA_KEY = musicDataKey(user.id)!;
    const MUSIC_START_KEY = musicStartKey(user.id)!;
    const BOT_XML_LAST_RUN_KEY = botXmlLastRunKey(user.id)!;

    // Quando o XML devolve "STANDBY MUSICAL" (título ou artista), usamos a
    // foto do locutor do programa que está no ar como capa/imagem do artista.
    const getOnAirPresenterPhoto = async (): Promise<string> => {
      const now = Date.now();
      if (standbyPresenterRef.current.photo && now - standbyPresenterRef.current.ts < 30_000) {
        return standbyPresenterRef.current.photo;
      }
      try {
        const { data } = await supabase
          .from("programas")
          .select("horario_inicio, horario_fim, dias_semana, ativo, variavel, data_variavel, apresentadores(foto)")
          .eq("user_id", user.id)
          .eq("ativo", true)
          .ilike("estudio", "%fm%");
        const d = new Date();
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        const diaAtual = dias[d.getDay()];
        const horaAtual = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const todayStr = d.toISOString().slice(0, 10);
        const match = (data || []).find((p: any) => {
          if (!p.ativo) return false;
          if (p.variavel) return p.data_variavel === todayStr && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim;
          return p.dias_semana?.includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim;
        });
        const photo = (match as any)?.apresentadores?.foto || "";
        standbyPresenterRef.current = { photo, ts: now };
        return photo;
      } catch {
        return "";
      }
    };

    const processTrackData = async (data: { titulo: string; artista: string; duracao: number; capa: string }) => {
      if (isStandbyTrack(data)) {
        const photo = await getOnAirPresenterPhoto();
        if (photo) data.capa = photo;
        applyMusicData(data);
        if (photo && user?.id) {
          void mergeUserDashboardItems(user.id, {
            music_current_title: data.titulo,
            music_current_artist: data.artista,
            music_current_cover: photo,
            music_deezer_artist_img: photo,
          }).catch(() => {});
        }
        return;
      }
      fetchCoverAndArtistImg(data);
      applyMusicData(data);
    };



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

      const dataIsBreak = isBreakTrack(data);
      const prevIsBreak = prev ? isBreakTrack(prev) : false;
      const existingStartStr = localStorage.getItem(MUSIC_START_KEY);
      const prevAgeMs = existingStartStr ? Date.now() - parseInt(existingStartStr, 10) : Infinity;

      // Anti ping-pong: quando uma fonte retorna BREAK mas ainda temos uma
      // faixa real recente (< 4 min), ignore o BREAK. Isso evita o widget
      // alternar entre artista e "Intervalo" a cada poucos segundos quando
      // as duas fontes (online + local) discordam.
      if (dataIsBreak && prevHasRealTrack && !prevIsBreak && prevAgeMs < 4 * 60 * 1000) {
        return;
      }

      const songChanged = !prev || prev.titulo !== data.titulo || prev.artista !== data.artista;

      if (songChanged) {
        // Debounce rapid switches — BUT never let a BREAK/intervalo entry
        // hold the widget hostage. If the previous stored track is a BREAK
        // label, always accept the new incoming track immediately.
        if (!prevIsBreak && existingStartStr && prev) {
          if (prevAgeMs < 5000) return;
        }

        const now = Date.now();
        writeMusicData(user.id, data);
        localStorage.setItem(MUSIC_START_KEY, now.toString());

        (async () => {
          await applyTrackChangeWithCuriosityGuard({
            userId: user.id,
            now,
            data,
            merge: mergeUserDashboardItems,
            fetchCuriosity: async () => {
              const { data: curData } = await supabase.functions.invoke("get-music-curiosity", {
                body: {
                  artista: data.artista,
                  musica: data.titulo,
                  userId: user.id,
                  deezerArtistImg: data.capa,
                },
              });
              return curData as { curiosidade?: string } | null | undefined;
            },
            isStillCurrent: () => localStorage.getItem(MUSIC_START_KEY) === now.toString(),
            onError: (e) => console.warn("[MusicSync] Error generating curiosity/merging:", e),
          });
        })();
      } else if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        writeMusicData(user.id, { ...prev, capa: data.capa });
        (async () => {
          try {
            await mergeUserDashboardItems(user.id, { music_current_cover: data.capa });
          } catch {}
        })();
      }

      if (!isPlaceholderTrack(data) && !isBreakTrack(data)) {
        void recordToHistory(data.titulo, data.artista || "Desconhecido");
      }
    };


    const fetchCoverAndArtistImg = (data: { titulo: string; artista: string; capa: string }) => {
      const cacheKey = `${data.artista}-${data.titulo}`;
      
      const fetchAll = async () => {
        try {
          if (!data.capa) {
            if (coverCacheRef.current[cacheKey]) {
              data.capa = coverCacheRef.current[cacheKey];
            } else {
              const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
              const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`, { signal: AbortSignal.timeout(3000) });
              const itunesData = await itunesRes.json();
              if (itunesData.results?.length > 0) {
                const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                if (cover) {
                  data.capa = cover;
                  coverCacheRef.current[cacheKey] = cover;
                }
              }
            }
          }

          let artistImg = "";
          if (data.artista && data.artista !== "Desconhecido") {
            artistImg = (await fetchArtistImageCached(data.artista)) || "";
          }

          const curRaw = localStorage.getItem(MUSIC_DATA_KEY);
          if (!curRaw) return;

          const cur = JSON.parse(curRaw);
          const sameTrack = cur.titulo === data.titulo && cur.artista === data.artista;
          if (!sameTrack) return;

          if (data.capa && cur.capa !== data.capa) {
            writeMusicData(user.id, { ...cur, capa: data.capa });
          }

          if (user?.id) {
            void mergeUserDashboardItems(user.id, {
              music_current_title: data.titulo,
              music_current_artist: data.artista,
              music_current_cover: data.capa || "",
              music_deezer_artist_img: artistImg || "",
            }).catch(() => {});
          }
        } catch (e) {
          console.warn("[MusicSync] fetchAll error:", e);
        }
      };
      
      void fetchAll();
    };

    const fetchXmlFromUrl = async (url: string): Promise<string | null> => {
      if (fetchCountRef.current % 20 === 0) directFetchOkRef.current = null;

      if (directFetchOkRef.current !== false) {
        try {
          const directRes = await fetch(buildFreshUrl(url), {
            headers: { "Cache-Control": "no-cache, no-store, max-age=0", Pragma: "no-cache" },
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

      try {
        const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
          body: { url },
        });
        if (!rssError && rssData?.content) return rssData.content;
      } catch (e) {
        console.warn("[MusicSync] Edge fetch-rss exception:", e);
      }
      return null;
    };

    const fetchAndSync = async () => {
      fetchCountRef.current++;

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

      const syncLocalFromStorage = async (): Promise<boolean | "stopped"> => {
        if (!useLocal || !localFileName) return false;
        // Try the new auth-prefixed path first (written by MusicaNoAr.syncToStorage);
        // fall back to the legacy flat path for older tenants.
        const candidates = [
          `${user.id}/local-xml-${user.id}.xml`,
          `local-xml-${user.id}.xml`,
        ];
        for (const filePath of candidates) {
          try {
            const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(filePath);
            if (!urlData?.publicUrl) continue;
            const res = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, {
              signal: AbortSignal.timeout(4000),
              cache: "no-store",
            });
            if (!res.ok) continue;
            const rawText = await res.text();
            if (!rawText) continue;
            // Jornal FM: se o arquivo local é TXT ("ARTISTA - MUSICA"),
            // convertemos on-the-fly para o pseudo-XML antes de parsear.
            const text = isJornalFmTxtPayload(user.id, rawText)
              ? (jornalFmTxtToPseudoXml(rawText) ?? rawText)
              : rawText;
            const data = parseXml(text);

            if (data === "stopped") {
              // Automação sem música — não confia em paths legados stale.
              // Retorna "stopped" para que o caller decida limpar.
              return "stopped";
            }
            if (!data) continue;
            if (isPlaceholderTrack(data)) return "stopped";
            lastLocalSyncAtRef.current = Date.now();
            void processTrackData(data);

            localStorage.setItem(BOT_XML_LAST_RUN_KEY, Date.now().toString());
            return true;
          } catch {
            // try next candidate
          }
        }
        return false;
      };


      const syncOnline = async (): Promise<"ok" | "stopped" | "skip"> => {
        if (!useOnline || !url) return "skip";

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
        fetchCoverAndArtistImg(data);
        applyMusicData(data);
        localStorage.setItem(BOT_XML_LAST_RUN_KEY, Date.now().toString());
        return "ok";
      };

      const onlineResult = await syncOnline();
      const localResult = await syncLocalFromStorage();
      const localSynced = localResult === true;
      const localStopped = localResult === "stopped";

      // When both sources agree there's no song playing (or the only active
      // source reports stopped), clear the on-air track and the mirrored DB
      // fields so downstream widgets don't keep the previous song frozen.
      const onlineStopped = onlineResult === "stopped" || (!useOnline);
      const localStoppedOrIdle = localStopped || (!useLocal || !localFileName);
      if (!localSynced && (onlineResult === "stopped" || localStopped) && onlineStopped && localStoppedOrIdle) {
        const hadTrack = !!localStorage.getItem(MUSIC_DATA_KEY);
        localStorage.removeItem(MUSIC_DATA_KEY);
        localStorage.removeItem(MUSIC_START_KEY);
        if (hadTrack) {
          try {
            await mergeUserDashboardItems(user.id, {
              music_start_time: null,
              music_current_title: "",
              music_current_artist: "",
              music_current_cover: "",
              music_current_curiosity: "",
            });
          } catch {}
        }
      } else if (onlineResult === "stopped" && !localSynced) {
        // Legacy safety net: eventually expire very old cached tracks
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
    };


    fetchAndSync();
    const interval = setInterval(fetchAndSync, 2000);
    const urlRefresh = setInterval(() => { settingsFetchedRef.current = false; }, 15000);

    return () => { clearInterval(interval); clearInterval(urlRefresh); };
  }, [user, enabled]);
}
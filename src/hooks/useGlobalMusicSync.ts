import { decodeMusicBytes } from "@/lib/musicByteEncoding";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import {
  musicDataKey,
  musicStartKey,
  botXmlLastRunKey,
  writeMusicData,
  readMusicData,
  writeMusicStart,
  writeBotXmlLastRun,
  parseHorarioToTimestamp,
} from "@/lib/musicStorageKeys";
import { applyTrackChangeWithCuriosityGuard } from "@/lib/musicTrackUpdate";
import { isJornalFmTxtPayload, jornalFmTxtToPseudoXml } from "@/lib/jornalFmTxt";
import { isCulturaFmXmlPayload, culturaFmXmlToPseudoXml } from "@/lib/culturaFmXml";
import { fetchArtistImageCached } from "@/lib/artistImageCache";
import { matchesMusicException } from "@/lib/musicExceptions";
import { fetchTrackCover, getTrackCoverSync } from "@/lib/musicCoverResolver";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { startMusicSyncPolling } from "@/lib/musicSyncPolling";



const LOCAL_SOURCE_GRACE_MS = 15000;

/**
 * Este navegador está lendo o arquivo local/online neste momento?
 * Nesse caso a leitura local é a autoridade e o sync não deve interferir.
 */
function isReaderActiveOnThisClient(): boolean {
  try {
    const localTs = parseInt(localStorage.getItem("masterview_local_reader_active") || "0", 10);
    if (Date.now() - localTs < 30_000) return true;
    const onlineTs = parseInt(localStorage.getItem("masterview_online_reader_active") || "0", 10);
    if (Date.now() - onlineTs < 30_000) return true;
  } catch {}
  return false;
}

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

function parseXml(xmlStr: string): { titulo: string; artista: string; duracao: number; capa: string; horario?: string; fileModifiedAt?: number } | "stopped" | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const rawTitulo = doc.querySelector("nome_musica,musica_atual")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "";
    const rawArtista = doc.querySelector("interprete,artista_atual")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "";
    const titulo = normalizeMusicText(rawTitulo);
    const artista = normalizeMusicText(rawArtista);
    const categoria = (doc.querySelector("categoria")?.textContent || "").trim().toUpperCase();
    if (!titulo && !artista) return categoria === "STOPPED" || categoria === "" ? "stopped" : null;
    const duracaoStr = doc.querySelector("duracao")?.textContent || doc.querySelector("duration")?.textContent || "0";
    const capa = doc.querySelector("capa,musica_capa")?.textContent || doc.querySelector("cover")?.textContent || "";
    let duracao = 0;
    if (duracaoStr.includes(":")) {
      const parts = duracaoStr.split(":").map(Number);
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      duracao = parseFloat(duracaoStr) || 0;
      if (duracao > 600) duracao = duracao / 1000;
    }
    const rawHorario = (
      doc.querySelector("horario")?.textContent ||
      doc.querySelector("hora")?.textContent ||
      doc.querySelector("hora_inicio")?.textContent ||
      doc.querySelector("horainicio")?.textContent ||
      doc.querySelector("time")?.textContent ||
      doc.querySelector("start_time")?.textContent ||
      doc.querySelector("data_hora")?.textContent ||
      ""
    ).trim();

    return {
      titulo: titulo || "Sem título",
      artista: artista || "Desconhecido",
      duracao,
      capa,
      horario: rawHorario || undefined,
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

export function useGlobalMusicSync(overrideUserId?: string | null, enabled: boolean = true, playerMode: boolean = false) {
  const dashboardAuth = useAuth();
  const playerAuth = usePlayerAuth();
  const user = playerMode ? playerAuth.user : dashboardAuth.user;
  const db = playerMode ? playerSupabase : supabase;
  const acc = (overrideUserId && findClientAccountById(overrideUserId)) || (user?.id && findClientAccountById(user.id)) || (user?.email && findClientAccountByEmail(user?.email));
  const stationUserId = overrideUserId || acc?.parentUserId || acc?.id || user?.id;
  const userSlug = acc?.slug || (user as any)?.user_metadata?.slug || (acc?.email ? acc.email.split("@")[0].toLowerCase() : "");

  const coverCacheRef = useRef<Record<string, string>>({});
  const cachedSettingsRef = useRef<{ url: string | null; mode: string; localFileName: string | null; localStoragePath: string | null }>({
    url: null,
    mode: "online",
    localFileName: null,
    localStoragePath: null,
  });
  const settingsFetchedRef = useRef(false);
  const excecoesRef = useRef<any[]>([]);
  const lastRecordedRef = useRef<string>("");
  const directFetchOkRef = useRef<boolean | null>(null);
  const fetchCountRef = useRef(0);
  const lastLocalSyncAtRef = useRef(0);
  const onlineStoppedRef = useRef(false);
  const standbyPresenterRef = useRef<{ photo: string; ts: number }>({ photo: "", ts: 0 });

  useEffect(() => {
    if (!user || !enabled) return;
    const targetId = stationUserId || user.id;
    const MUSIC_DATA_KEY = musicDataKey(targetId);
    const MUSIC_START_KEY = musicStartKey(targetId);
    if (!MUSIC_DATA_KEY || !MUSIC_START_KEY) return;
    settingsFetchedRef.current = false;
    lastRecordedRef.current = "";
    lastLocalSyncAtRef.current = 0;
    directFetchOkRef.current = null;
    cachedSettingsRef.current = { url: null, mode: "online", localFileName: null, localStoragePath: null };
    let settingsReadAt = 0;
    let disposed = false;
    let realtimeConnected = false;
    const enrichmentDone = new Set<string>();
    const enrichmentPending = new Set<string>();
    
    // Reset enrichment cache every hour to force re-fetching of images that may have failed
    const ENRICHMENT_CACHE_RESET_MS = 60 * 60 * 1000; // 1 hour
    const enrichmentResetInterval = setInterval(() => {
      enrichmentDone.clear();
      enrichmentPending.clear();
    }, ENRICHMENT_CACHE_RESET_MS);

    // Quando o XML devolve "STANDBY MUSICAL" (título ou artista), usamos a
    // foto do locutor do programa que está no ar como capa/imagem do artista.
    const getOnAirPresenterPhoto = async (): Promise<string> => {
      const now = Date.now();
      if (standbyPresenterRef.current.photo && now - standbyPresenterRef.current.ts < 30_000) {
        return standbyPresenterRef.current.photo;
      }
      try {
        const { data } = await db
          .from("programas")
          .select("horario_inicio, horario_fim, dias_semana, ativo, variavel, data_variavel, apresentadores(foto)")
          .eq("user_id", targetId)
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
      // Exceções cadastradas em INFO MUSIC: essa faixa não deve aparecer em
      // nenhum lugar do player como nome/artista, e as imagens de capa/fundo
      // devem ser as cadastradas na exceção (ou locutor como fallback).
      const matchedExcecao = matchesMusicException(excecoesRef.current, data.artista, data.titulo);
      if (matchedExcecao) {
        const photo = await getOnAirPresenterPhoto();
        
        // Se a exceção tiver capa/fundo próprios, usamos eles.
        // O nome da música e artista ficam em BRANCO conforme solicitado.
        const masked = {
          titulo: "",
          artista: "",
          duracao: 0,
          capa: matchedExcecao.capa_url || photo || "",
          excecao: matchedExcecao, // Store exception details for other widgets
        };

        writeMusicData(targetId, masked);
        writeMusicStart(targetId, Date.now());
        if (targetId) {
          void mergeUserDashboardItems(targetId, {
            music_current_title: "",
            music_current_artist: "",
            music_current_cover: matchedExcecao.capa_url || photo || "",
            music_deezer_artist_img: matchedExcecao.background_url || matchedExcecao.capa_url || photo || "",
            music_current_curiosity: "",
            music_current_excecao: matchedExcecao,
          }).catch(() => {});
        }
        return;
      }

      if (isStandbyTrack(data)) {
        const photo = await getOnAirPresenterPhoto();
        if (photo) data.capa = photo;
        applyMusicData(data);
        if (photo && targetId) {
          void mergeUserDashboardItems(targetId, {
            music_current_title: data.titulo,
            music_current_artist: data.artista,
            music_current_cover: photo,
            music_deezer_artist_img: photo,
            music_current_excecao: null,
          }).catch(() => {});
        }
        return;
      }
      if (!data.capa) {
        const syncCover = getTrackCoverSync(data.titulo, data.artista);
        if (syncCover) data.capa = syncCover;
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
        const { data: programas } = await db
          .from("programas")
          .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
          .eq("user_id", targetId)
          .eq("ativo", true);

        const programa = getCurrentProgram(programas || []);

        const { error } = await db.from("musicas_tocadas").upsert({
          user_id: targetId,
          dia: day,
          horario: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
          programa,
          artista,
          musica: titulo,
          created_at: now.toISOString(),
        }, { onConflict: "user_id,musica,artista,dia" });

        if (!error) {
          lastRecordedRef.current = key;
        }
      } catch (e) {
        console.warn("[MusicSync] History error:", e);
      }
    };

    const isReaderActiveOnClient = () => {
      try {
        const localTs = parseInt(localStorage.getItem("masterview_local_reader_active") || "0", 10);
        if (Date.now() - localTs < 30_000) return true;
        const onlineTs = parseInt(localStorage.getItem("masterview_online_reader_active") || "0", 10);
        if (Date.now() - onlineTs < 30_000) return true;
      } catch {}
      return false;
    };

    const applyMusicData = (data: { titulo: string; artista: string; duracao: number; capa: string; horario?: string; fileModifiedAt?: number }) => {
      if (isReaderActiveOnClient()) {
        // O leitor físico em disco ou online está ativo nesta máquina — não interferir no localStorage
        return;
      }
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
        // Nunca pule a persistência da faixa atual: o XML do Broadcast lê
        // dashboard_items no servidor. Se a gravação for ignorada aqui, a faixa
        // seguinte pode ser igual ao localStorage e não haverá nova tentativa,
        // deixando <musica_atual> congelado até outra troca de música.
        // O histórico continua protegido pelo próprio upsert/debounce abaixo.
        const skipWrite = false;
        if (!skipWrite) {
          let songStartTime = parseHorarioToTimestamp(data.horario);
          if (!songStartTime || Math.abs(Date.now() - songStartTime) > 12 * 3600 * 1000) {
            songStartTime = null;
          }
          if (!songStartTime && typeof data.fileModifiedAt === "number" && data.fileModifiedAt > 0) {
            const age = Date.now() - data.fileModifiedAt;
            if (age >= 0 && age < Math.max(600_000, (data.duracao || 180) * 1000)) {
              songStartTime = data.fileModifiedAt;
            }
          }
          const now = songStartTime || Date.now();
          writeMusicData(targetId, data);
          writeMusicStart(targetId, now);

          // Trigger async image fetching
          fetchCoverAndArtistImg(data);

          (async () => {
            await applyTrackChangeWithCuriosityGuard({
              userId: targetId,
              now,
              data,
              merge: mergeUserDashboardItems,
              fetchCuriosity: async () => {
                const { data: curData } = await db.functions.invoke("get-music-curiosity", {
                  body: {
                    artista: data.artista,
                    musica: data.titulo,
                    userId: targetId,
                    deezerArtistImg: data.capa,
                  },
                });
                return curData as { curiosidade?: string } | null | undefined;
              },
              isStillCurrent: () => localStorage.getItem(MUSIC_START_KEY) === now.toString(),
              onError: (e) => console.warn("[MusicSync] Error generating curiosity/merging:", e),
            });
          })();
        }
      } else if (data.capa && (!prev?.capa || prev.capa !== data.capa)) {
        writeMusicData(targetId, { ...(prev as any), capa: data.capa });
        (async () => {
          try {
            await mergeUserDashboardItems(targetId, { music_current_cover: data.capa });
          } catch {}
        })();
      }


      if (
        !isPlaceholderTrack(data) &&
        !isBreakTrack(data) &&
        !isStandbyTrack(data) &&
        !matchesMusicException(excecoesRef.current, data.artista, data.titulo)
      ) {
        void recordToHistory(data.titulo, data.artista || "Desconhecido");
      }
    };


    const fetchCoverAndArtistImg = (data: { titulo: string; artista: string; capa: string }) => {
      console.log(`[MusicSync] fetchCoverAndArtistImg called for: "${data.titulo}" / "${data.artista}"`);
      const cacheKey = `${data.artista}-${data.titulo}`;
      
      if (enrichmentDone.has(cacheKey)) {
        console.log(`[MusicSync] Track already enriched (cached), skipping`);
        return;
      }
      
      if (enrichmentPending.has(cacheKey)) {
        console.log(`[MusicSync] Track enrichment already pending, skipping`);
        return;
      }
      
      enrichmentPending.add(cacheKey);
      
      const fetchAll = async () => {
        try {
          if (!data.capa) {
            const cover = await fetchTrackCover(data.titulo, data.artista);
            console.log(`[MusicSync] fetchTrackCover result for "${data.titulo}" / "${data.artista}":`, cover);
            if (cover) {
              data.capa = cover;
            }
          }

          let artistImg = "";
          if (data.artista && data.artista !== "Desconhecido") {
            artistImg = (await fetchArtistImageCached(data.artista)) || "";
            console.log(`[MusicSync] fetchArtistImageCached result for "${data.artista}":`, artistImg);
          }

          const curRaw = localStorage.getItem(MUSIC_DATA_KEY);
          if (!curRaw) {
            return;
          }

          const cur = JSON.parse(curRaw);
          const sameTrack = cur.titulo === data.titulo && cur.artista === data.artista;
          if (!sameTrack) {
            return;
          }

          if (data.capa && cur.capa !== data.capa) {
            writeMusicData(targetId, { ...cur, capa: data.capa });
          }

          if (targetId) {
            console.log(`[MusicSync] About to merge with cover="${data.capa}" and artistImg="${artistImg}"`);
            try {
              await mergeUserDashboardItems(targetId, {
                music_current_title: data.titulo,
                music_current_artist: data.artista,
                music_current_cover: data.capa || "",
                music_current_excecao: null,
                music_deezer_artist_img: artistImg || "",
              });
              console.log(`[MusicSync] Merge SUCCESS`);
            } catch (mergeErr) {
              console.error(`[MusicSync] Merge FAILED:`, mergeErr);
              throw mergeErr;
            }
          }
          enrichmentDone.add(cacheKey);
        } catch (e) {
          console.warn("[MusicSync] fetchAll error:", e);
        } finally {
          enrichmentPending.delete(cacheKey);
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
            return decodeMusicBytes(await directRes.arrayBuffer(), directRes.headers.get("content-type") || "");
          }
        } catch {
          if (directFetchOkRef.current === null) directFetchOkRef.current = false;
        }
      }

      try {
        const { data: rssData, error: rssError } = await db.functions.invoke("fetch-rss", {
          body: { url },
        });
        if (!rssError && rssData?.content) return rssData.content;
      } catch (e) {
        console.warn("[MusicSync] Edge fetch-rss exception:", e);
      }
      return null;
    };

    const fetchAndSync = async () => {
      if (disposed) return;
      fetchCountRef.current++;

      if (!settingsFetchedRef.current || Date.now() - settingsReadAt >= 60_000) {
        const [settingsRes, exceptionsRes] = await Promise.all([
          db
            .from("user_settings")
            .select("music_xml_url, music_source_mode, dashboard_items, infomusic_excecoes_capa_url, infomusic_excecoes_artista_url")
            .eq("user_id", targetId)
            .maybeSingle(),
          db
            .from("infomusic_excecoes")
            .select("id, termo, capa_url, artista_url, background_url")
            .eq("user_id", targetId)
        ]);

        if (settingsRes.error) throw settingsRes.error;
        if (exceptionsRes.error) throw exceptionsRes.error;
        if (disposed) return;
        const settings = settingsRes.data;
        const dashboardItems = settings?.dashboard_items as { local_xml_filename?: string; local_xml_storage_path?: string } | null;
        
        cachedSettingsRef.current = {
          url: settings?.music_xml_url || null,
          mode: settings?.music_source_mode || "online",
          localFileName: dashboardItems?.local_xml_filename || null,
          localStoragePath: dashboardItems?.local_xml_storage_path || null,
        };
        
        // Imagens gerais da lista de exceções: valem quando o termo não tem imagem própria
        const defCapa = (settings as any)?.infomusic_excecoes_capa_url || null;
        const defArtista = (settings as any)?.infomusic_excecoes_artista_url || null;
        excecoesRef.current = (exceptionsRes.data || []).map((e: any) => ({
          ...e,
          capa_url: e.capa_url || defCapa,
          artista_url: e.artista_url || defArtista,
          background_url: e.background_url || defArtista,
        }));

        settingsFetchedRef.current = true;
        settingsReadAt = Date.now();
      }

      // Se este navegador estiver monitorando ativamente um arquivo local (MusicaNoAr),
      // o arquivo local é a autoridade absoluta. NÃO interferir com sync online, storage ou DB!
      if (isReaderActiveOnThisClient()) {
        return;
      }

      const { url, mode, localFileName, localStoragePath } = cachedSettingsRef.current;
      const useOnline = mode === "online" || mode === "both";
      const useLocal = mode === "pasta" || mode === "both";

      const syncLocalFromStorage = async (): Promise<boolean | "stopped"> => {
        if (!useLocal || !localFileName) return false;
        // Try the new auth-prefixed path first (written by MusicaNoAr.syncToStorage);
        // fall back to the legacy flat path for older tenants.
        const candidates = [
          localStoragePath,
          `${targetId}/local-xml-${targetId}.xml`,
          `local-xml-${targetId}.xml`,
        ].filter(Boolean) as string[];
        for (const filePath of candidates) {
          try {
            const { data: urlData } = db.storage.from("xml-files").getPublicUrl(filePath);
            if (!urlData?.publicUrl) continue;
            const res = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, {
              signal: AbortSignal.timeout(4000),
              cache: "no-store",
            });
            if (!res.ok) continue;
            const lastModHeader = res.headers.get("last-modified");
            const fileModifiedAt = lastModHeader ? new Date(lastModHeader).getTime() : undefined;
            const rawText = decodeMusicBytes(await res.arrayBuffer(), res.headers.get("content-type") || "");
            if (!rawText) continue;
            // Jornal FM: se o arquivo local é TXT ("ARTISTA - MUSICA"),
            // convertemos on-the-fly para o pseudo-XML antes de parsear.
            const text = isJornalFmTxtPayload(targetId, rawText)
              ? (jornalFmTxtToPseudoXml(rawText) ?? rawText)
              : isCulturaFmXmlPayload(targetId, rawText)
              ? (culturaFmXmlToPseudoXml(rawText) ?? rawText)
              : rawText;
            const data = parseXml(text);

            if (data === "stopped") {
              // Automação sem música — não confia em paths legados stale.
              // Retorna "stopped" para que o caller decida limpar.
              return "stopped";
            }
            if (!data) continue;
            if (isPlaceholderTrack(data)) return "stopped";
            if (fileModifiedAt && !data.fileModifiedAt) {
              data.fileModifiedAt = fileModifiedAt;
            }
            lastLocalSyncAtRef.current = Date.now();
            void processTrackData(data);
            writeBotXmlLastRun(targetId, Date.now());
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
        void processTrackData(data);
        writeBotXmlLastRun(targetId, Date.now());
        return "ok";
      };

      const onlineResult = await syncOnline();
      const localResult = await syncLocalFromStorage();
      const localSynced = localResult === true;
      const localStopped = localResult === "stopped";

      // 3. Fallback do banco de dados (se o cliente da rádio estiver salvando pelo navegador local direto em user_settings ou musicas_tocadas)
      if (!localSynced && onlineResult !== "ok") {
        try {
          const targetUids = [targetId].filter(Boolean);

          // 3a-0. Verificar servidor local de sincronização direta (/api/sync-music)
          try {
            if (userSlug) {
              const syncResp = await fetch(`/api/sync-music?slug=${encodeURIComponent(userSlug)}&userId=${encodeURIComponent(targetId)}`, { cache: "no-store" });
              if (syncResp.ok) {
                const syncJson = await syncResp.json();
                const liveMusic = syncJson?.music;
                const musicAge = liveMusic?.startTime
                  ? (Date.now() - Number(liveMusic.startTime))
                  : (liveMusic?.updated_at ? (Date.now() - new Date(liveMusic.updated_at).getTime()) : 0);
                const isFresh = musicAge >= 0 && musicAge < 24 * 60 * 60 * 1000;
                if (isFresh && liveMusic?.titulo && liveMusic.titulo.toLowerCase() !== "sem título" && liveMusic.titulo !== "Aguardando leitura...") {
                  const cur = readMusicData(targetId);
                  const isSameTrack = cur && cur.titulo === liveMusic.titulo && cur.artista === liveMusic.artista;
                  if (!isSameTrack || (liveMusic.capa && cur?.capa !== liveMusic.capa)) {
                    void processTrackData({
                      titulo: liveMusic.titulo,
                      artista: liveMusic.artista || "Desconhecido",
                      duracao: Number(liveMusic.duracao) || 180,
                      capa: liveMusic.capa || getTrackCoverSync(liveMusic.titulo, liveMusic.artista) || "",
                    });
                  }
                  return;
                }
              }
            }
          } catch {}

          // 3a. Verificar primeiro user_settings (dashboard_items) que armazena a faixa ativa em tempo real com capa
          for (const targetUid of targetUids) {
            const { data: settings, error: settingsError } = await db
              .from("user_settings")
              .select("dashboard_items")
              .eq("user_id", targetUid)
              .maybeSingle();
            if (settingsError) throw settingsError;
            if (disposed) return;

            const di = (settings?.dashboard_items || {}) as Record<string, any>;
            const curTitle = (di.music_current_title || "").toString().trim();
            const curArtist = (di.music_current_artist || "").toString().trim();
            const curCover = (di.music_current_cover || "").toString().trim();
            const curDur = typeof di.music_current_duration === "number" && di.music_current_duration > 0
              ? di.music_current_duration
              : 180;

            if (curTitle && curTitle.toLowerCase() !== "sem título" && curTitle.toLowerCase() !== "sem titulo" && curTitle.toLowerCase() !== "aguardando leitura...") {
              let t = curTitle;
              let a = curArtist;
              if (t.toUpperCase().startsWith("!SB - ")) {
                t = t.replace(/^!SB\s*-\s*/i, "").trim();
              }
              if ((a.toUpperCase().includes("STANDBY") || !a) && t.includes(" - ")) {
                const parts = t.split(" - ");
                a = parts[0].trim();
                t = parts.slice(1).join(" - ").trim();
              }

              const cur = readMusicData(targetId);
              const isSameTrack = cur && cur.titulo === t && cur.artista === a;
              if (!isSameTrack || (curCover && cur?.capa !== curCover)) {
                void processTrackData({
                  titulo: t,
                  artista: a || "Desconhecido",
                  duracao: curDur,
                  capa: curCover || getTrackCoverSync(t, a) || "",
                });
              }
              return;
            }
          }

          let foundTrack: { titulo: string; artista: string; created_at?: string } | null = null;

          for (const targetUid of targetUids) {
            const { data: lastPlayed, error: historyError } = await db
              .from("musicas_tocadas")
              .select("musica, artista, horario, dia, created_at")
              .eq("user_id", targetUid)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (historyError) throw historyError;
            if (disposed) return;

            let dbMusica = (lastPlayed?.musica || "").trim();
            let dbArtista = (lastPlayed?.artista || "").trim();

            if (!dbMusica) {
              try {
                const edgeResp = await fetch(
                  `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/public-music-history?user_id=${encodeURIComponent(targetUid)}&limit=1`,
                  {
                    headers: {
                      apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    },
                  }
                );
                const edgeJson = await edgeResp.json();
                if (edgeJson?.ok && Array.isArray(edgeJson.items) && edgeJson.items.length > 0) {
                  dbMusica = (edgeJson.items[0].musica || "").trim();
                  dbArtista = (edgeJson.items[0].artista || "").trim();
                }
              } catch {}
            }

            if (dbMusica && dbMusica.toUpperCase().startsWith("!SB - ")) {
              dbMusica = dbMusica.replace(/^!SB\s*-\s*/i, "").trim();
            }
            if ((dbArtista.toUpperCase().includes("STANDBY") || !dbArtista) && dbMusica.includes(" - ")) {
              const parts = dbMusica.split(" - ");
              dbArtista = parts[0].trim();
              dbMusica = parts.slice(1).join(" - ").trim();
            }

            if (dbMusica && dbMusica.toLowerCase() !== "sem título" && dbMusica.toLowerCase() !== "sem titulo" && dbMusica.toLowerCase() !== "aguardando leitura...") {
              foundTrack = { titulo: dbMusica, artista: dbArtista || "Desconhecido", created_at: lastPlayed?.created_at };
              break;
            }
          }

          if (foundTrack) {
            const cur = readMusicData(targetId);
            const curStartStr = localStorage.getItem(musicStartKey(targetId));
            const curStart = curStartStr ? parseInt(curStartStr, 10) : 0;
            const curAgeMs = curStart > 0 ? Date.now() - curStart : Infinity;
            const curHasActiveSong = cur && !isPlaceholderTrack(cur) && !isBreakTrack(cur) && curAgeMs < ((cur.duracao || 180) + 60) * 1000;

            // Se já existe uma música tocando e ativa, NUNCA sobrescrever com o histórico de musicas_tocadas
            if (curHasActiveSong) {
              return;
            }

            const isSameTrack = cur && cur.titulo === foundTrack.titulo && cur.artista === foundTrack.artista;
            if (!isSameTrack) {
              const initialCover = getTrackCoverSync(foundTrack.titulo, foundTrack.artista) || "";
              void processTrackData({
                titulo: foundTrack.titulo,
                artista: foundTrack.artista,
                duracao: 180,
                capa: initialCover,
              });
            }
            return;
          }
        } catch (error) {
          // Let the scheduler back off instead of hammering a paused backend.
          throw error;
        }
      }

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
            await mergeUserDashboardItems(targetId, {
              music_start_time: null,
              music_current_title: "",
              music_current_artist: "",
              music_current_cover: "",
              music_current_excecao: null,
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


    // Instant live sync via Supabase Realtime broadcast across all computers/browsers
    const liveSyncChannel = db
      .channel(`music-live-sync:${targetId}`)
      .on("broadcast", { event: "track_change" }, (payload: any) => {
        const d = payload.payload || payload;
        if (!disposed && d && (d.titulo || d.excecao)) {
          void processTrackData({
            titulo: d.titulo || "",
            artista: d.artista || "",
            duracao: Number(d.duracao) || 180,
            capa: d.capa || "",
          });
        }
      })
      .subscribe((status) => { realtimeConnected = status === "SUBSCRIBED"; });

    const polling = startMusicSyncPolling(fetchAndSync, () => realtimeConnected, {
      desktop: Boolean(window.houseMixDesktop?.isDesktop),
    });
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      settingsFetchedRef.current = false;
      polling.refresh();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);

    return () => {
      disposed = true;
      clearInterval(enrichmentResetInterval);
      polling.stop();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      void db.removeChannel(liveSyncChannel).catch(() => {});
    };
  }, [user?.id, stationUserId, userSlug, enabled]);
}
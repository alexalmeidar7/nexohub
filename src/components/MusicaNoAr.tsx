import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { Music, User, Loader2, Check, Globe, FolderOpen, Clock, Upload, Monitor, ChevronDown, ChevronUp, AlertTriangle, Circle, Sparkles, X, Settings, ArrowLeft, Minimize2 } from "lucide-react";
const InfoMusicSection = lazy(() => import("./InfoMusicSection"));
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findCurrentProgram } from "./OnAirWidget";
import { getApresentadores } from "./ApresentadorForm";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { useCoverPalette, getPaletteContrast } from "@/lib/coverPalette";
import { matchesMusicException } from "@/lib/musicExceptions";
import { BackButton } from "@/components/ui/back-button";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

interface UploadLogEntry {
  source: "pasta" | "online";
  date: string;
  time: string;
  deviceName?: string;
  artista?: string;
  musica?: string;
}

type SourceMode = "online" | "pasta" | "both" | "none";

// MUSIC_DATA_KEY / MUSIC_START_KEY are now per-user — see musicStorageKeys.ts
const UPLOAD_HISTORY_KEY = "masterview_xml_upload_history";
const SOURCE_MODE_KEY = "masterview_source_mode";
const DEVICE_NAME_KEY = "masterview_device_name";
const DEVICE_ID_KEY = "masterview_device_id";
const DEFAULT_XML_URL = "";
const LOCAL_SOURCE_GRACE_MS = 15000;

function isValidXmlUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.toLowerCase().endsWith(".xml");
  } catch {
    return false;
  }
}

function buildSourceMode(onlineEnabled: boolean, localEnabled: boolean): SourceMode {
  if (onlineEnabled && localEnabled) return "both";
  if (onlineEnabled) return "online";
  if (localEnabled) return "pasta";
  return "none";
}

/** Get or create a unique device ID for this browser */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Derive a short device label from userAgent */
function deriveDeviceName(): string {
  const ua = navigator.userAgent;
  let os = "PC";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "Mac";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let browser = "";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";

  return `${os}${browser ? " - " + browser : ""} (${getDeviceId()})`;
}

function getDeviceName(): string {
  return localStorage.getItem(DEVICE_NAME_KEY) || deriveDeviceName();
}

/** Detect encoding from XML declaration or byte-order, then decode */
async function readFileWithEncoding(file: File): Promise<string> {
  const headSlice = file.slice(0, 200);
  const headText = await headSlice.text();
  const encMatch = headText.match(/encoding=["']([^"']+)["']/i);
  const declared = encMatch?.[1]?.toLowerCase() || "";

  const latin = ["iso-8859-1", "latin1", "windows-1252", "iso_8859-1"];
  if (latin.some(e => declared.includes(e))) {
    const buf = await file.arrayBuffer();
    return new TextDecoder("windows-1252").decode(buf);
  }
  const utf8 = await file.text();
  if (utf8.includes("\uFFFD") || /\u00C3[\u00A0-\u00BF]/.test(utf8)) {
    const buf = await file.arrayBuffer();
    return new TextDecoder("windows-1252").decode(buf);
  }
  return utf8;
}

function parseXmlString(xmlStr: string): MusicData | null {
  try {
    // Strip XML declaration to avoid DOMParser encoding conflicts
    const cleaned = xmlStr.replace(/<\?xml[^?]*\?>\s*/i, "");
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      console.warn("[MusicaNoAr] XML parser error node:", errorNode.textContent);
      // Fallback: try parsing as text/xml if application/xml fails
      const doc2 = parser.parseFromString(cleaned, "text/xml");
      if (!doc2.querySelector("parsererror")) return extractMusicFromDoc(doc2);
      return null;
    }

    return extractMusicFromDoc(doc);
  } catch (err) {
    console.warn("[MusicaNoAr] XML parse error:", err);
    return null;
  }
}

/**
 * Detects a "no track playing" XML — either explicit STOPPED category,
 * or empty <interprete>/<titulo> (common between songs on Pulsar/RadioBoss).
 * Returning true means we should CLEAR the current on-air track instead of
 * leaving the previous song stuck on screen.
 */
function isStoppedXmlPayload(xmlStr: string): boolean {
  try {
    const cleaned = xmlStr.replace(/<\?xml[^?]*\?>\s*/i, "");
    const parser = new DOMParser();
    let doc = parser.parseFromString(cleaned, "application/xml");
    if (doc.querySelector("parsererror")) {
      doc = parser.parseFromString(cleaned, "text/xml");
      if (doc.querySelector("parsererror")) return false;
    }
    const categoria = (doc.querySelector("categoria")?.textContent || "").trim().toUpperCase();
    if (categoria === "STOPPED") return true;
    const rawTitulo = (
      doc.querySelector("nome_musica")?.textContent
      || doc.querySelector("titulo")?.textContent
      || doc.querySelector("title")?.textContent
      || ""
    ).trim();
    const rawArtista = (
      doc.querySelector("interprete")?.textContent
      || doc.querySelector("nome_interprete")?.textContent
      || doc.querySelector("artista")?.textContent
      || doc.querySelector("artist")?.textContent
      || ""
    ).trim();
    // Only treat as "stopped" when the <musica> block exists but is empty
    // (avoids clearing on unrelated XMLs).
    const hasMusicaNode = !!doc.querySelector("musica, music, track, song");
    return hasMusicaNode && !rawTitulo && !rawArtista;
  } catch {
    return false;
  }
}

// Jornal FM: origem local TXT "ARTISTA - MUSICA" → helpers em lib/jornalFmTxt.ts
import {
  JORNAL_FM_USER_ID,
  isJornalFmTxtPayload as isJornalFmTxt,
  jornalFmTxtToPseudoXml as txtToPseudoXml,
} from "@/lib/jornalFmTxt";
import {
  CULTURA_FM_USER_ID,
  isCulturaFmXmlPayload as isCulturaFmXml,
  culturaFmXmlToPseudoXml as culturaXmlToPseudoXml,
} from "@/lib/culturaFmXml";





function extractMusicFromDoc(doc: Document): MusicData | null {
  const rawTitulo =
    doc.querySelector("nome_musica")?.textContent ||
    doc.querySelector("titulo")?.textContent ||
    doc.querySelector("title")?.textContent ||
    "";
  const rawArtista =
    doc.querySelector("interprete")?.textContent ||
    doc.querySelector("nome_interprete")?.textContent ||
    doc.querySelector("artista")?.textContent ||
    doc.querySelector("artist")?.textContent ||
    "";

  const titulo = normalizeMusicText(rawTitulo);
  const artista = normalizeMusicText(rawArtista);
  if (!titulo && !artista) return null;

  const categoria = (doc.querySelector("categoria")?.textContent || "").trim().toUpperCase();
  if (categoria === "STOPPED" && !titulo && !artista) return null;

  const duracaoStr =
    doc.querySelector("duracao")?.textContent ||
    doc.querySelector("duration")?.textContent ||
    "0";
  const capa =
    doc.querySelector("capa")?.textContent ||
    doc.querySelector("cover")?.textContent ||
    "";

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
    titulo: titulo || "Sem titulo",
    artista: artista || "Desconhecido",
    duracao,
    capa,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTimeMs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

async function fetchCoverFromiTunes(titulo: string, artista: string): Promise<string> {
  try {
    const query = encodeURIComponent(`${artista} ${titulo}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
    }
  } catch { }
  return "";
}

async function loadUploadHistoryFromDb(userId: string): Promise<UploadLogEntry[]> {
  try {
    const { data } = await supabase
      .from("xml_upload_history")
      .select("id, source, created_at, artista, musica")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    if (!data) return [];
    return data.map((row: any) => {
      const d = new Date(row.created_at);
      const [rawSource, deviceName] = (row.source as string).split("|");
      return {
        source: (rawSource === "pasta" ? "pasta" : "online") as "pasta" | "online",
        date: d.toLocaleDateString("pt-BR"),
        time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        deviceName: deviceName || undefined,
        artista: row.artista || undefined,
        musica: row.musica || undefined,
      };
    });
  } catch { return []; }
}

async function addUploadLogToDb(
  userId: string,
  source: "pasta" | "online",
  deviceName?: string,
  artista?: string,
  musica?: string,
): Promise<UploadLogEntry[]> {
  const sourceValue = source === "pasta" && deviceName ? `pasta|${deviceName}` : source;
  await supabase.from("xml_upload_history").insert({
    user_id: userId,
    source: sourceValue,
    artista: artista || null,
    musica: musica || null,
  } as any);
  // Mantém apenas os 3 registros mais recentes por usuário
  try {
    const { data: keep } = await supabase
      .from("xml_upload_history")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    const keepIds = (keep || []).map((r: any) => r.id);
    if (keepIds.length > 0) {
      await supabase
        .from("xml_upload_history")
        .delete()
        .eq("user_id", userId)
        .not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
    }
  } catch {}
  return loadUploadHistoryFromDb(userId);
}

import { getMusicData } from "@/lib/musicData";
export { getMusicData } from "@/lib/musicData";

export default function MusicaNoAr({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const dataUserId = effectiveUserId || user?.id || null;
  // Per-user scoped localStorage keys (prevents cross-tenant music leak)
  const MUSIC_DATA_KEY = dataUserId ? `masterview_music_data::${dataUserId}` : "masterview_music_data::__none__";
  const MUSIC_START_KEY = dataUserId ? `masterview_music_start::${dataUserId}` : "masterview_music_start::__none__";
  const [xmlUrl, setXmlUrl] = useState(DEFAULT_XML_URL);
  const [music, setMusic] = useState<MusicData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coverCacheRef = useRef<Record<string, string>>({});
  const [sliderResetting, setSliderResetting] = useState(false);
  const prevProgressRef = useRef(0);
  const [loadingCover, setLoadingCover] = useState(false);
  const [presenterFallback, setPresenterFallback] = useState<{ nome: string; foto: string } | null>(null);
  const [curiosidade, setCuriosidade] = useState<string>("");
  const curiosidadeFetchedKeyRef = useRef<string>("");
  const curiosityShownAtRef = useRef<number | null>(null);
  const curiosityDurationRef = useRef<number>(30_000);
  const curiosityKeyRef = useRef<string>("");
  const [, forceCuriosityTick] = useState(0);
  const manualCuriosityRef = useRef<string | null>(null);

  const [sourceMode, setSourceModeState] = useState<SourceMode>("online");
  const [sourceModeLoaded, setSourceModeLoaded] = useState(false);
  const [localFileContent, setLocalFileContent] = useState<string | null>(null);
  const localFileContentRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileRef = useRef<File | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  // localPollRef removed — using Web Worker timer instead
  const [uploadHistory, setUploadHistory] = useState<UploadLogEntry[]>([]);
  const [localFileName, setLocalFileName] = useState<string>("");
  const [localMonitoring, setLocalMonitoring] = useState(false);
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState(() => getDeviceName());
  const [currentDeviceName, setCurrentDeviceName] = useState(() => getDeviceName());
  const [culturaLastSync, setCulturaLastSync] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("cultura-fm-last-sync");
      return raw ? Number(raw) : null;
    } catch { return null; }
  });
  const culturaLastSignatureRef = useRef<string>("");
  const [, forceCulturaTick] = useState(0);
  useEffect(() => {
    if (dataUserId !== CULTURA_FM_USER_ID) return;
    const t = setInterval(() => forceCulturaTick(n => n + 1), 15000);
    return () => clearInterval(t);
  }, [dataUserId]);
  useEffect(() => {
    if (dataUserId !== CULTURA_FM_USER_ID || !localFileContent) return;
    if (!isCulturaFmXml(dataUserId, localFileContent)) return;
    const parsed = parseXmlString(localFileContent);
    if (!parsed?.titulo && !parsed?.artista) return;
    const sig = `${parsed.titulo}::${parsed.artista}`;
    if (sig === culturaLastSignatureRef.current) return;
    culturaLastSignatureRef.current = sig;
    const now = Date.now();
    setCulturaLastSync(now);
    try { localStorage.setItem("cultura-fm-last-sync", String(now)); } catch { /* noop */ }
  }, [dataUserId, localFileContent]);


  // Unified tracking: which source provided the last update
  const [lastSource, setLastSource] = useState<"online" | "pasta" | null>(null);
  const [sourceStats, setSourceStats] = useState<{ online: number; pasta: number }>({ online: 0, pasta: 0 });
  const lastSourceRef = useRef<"online" | "pasta" | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Source health tracking — tracks last SUCCESSFUL response (not song change)
  const lastOnlineSuccessRef = useRef<number>(0);
  const lastLocalSuccessRef = useRef<number>(0);
  const [onlineDelay, setOnlineDelay] = useState(false);
  const [localDelay, setLocalDelay] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const onlineFailCountRef = useRef(0);
  const localFailCountRef = useRef(0);
  const onlineStoppedRef = useRef(false);

  const hasValidOnlineUrl = isValidXmlUrl(xmlUrl);
  const hasValidLocalSource = !!localFileName;
  const isOnlineSelected = sourceMode === "online" || sourceMode === "both";
  const isLocalSelected = sourceMode === "pasta" || sourceMode === "both";

  const isLocalSourceHealthy = useCallback(() => {
    return (
      isLocalSelected
      && hasValidLocalSource
      && lastLocalSuccessRef.current > 0
      && Date.now() - lastLocalSuccessRef.current < LOCAL_SOURCE_GRACE_MS
    );
  }, [hasValidLocalSource, isLocalSelected]);

  const setSourceMode = async (mode: SourceMode) => {
    setSourceModeState(mode);
    localStorage.setItem(SOURCE_MODE_KEY, mode);
    if (dataUserId) {
      await supabase.from("user_settings").upsert({
        user_id: dataUserId,
        music_source_mode: mode,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  };

  // Load URL, source mode, and history from DB
  useEffect(() => {
    if (!dataUserId) return;
    const loadData = async () => {
      const [{ data }, history] = await Promise.all([
        supabase
          .from("user_settings")
          .select("music_xml_url, music_source_mode, dashboard_items")
          .eq("user_id", dataUserId)
          .maybeSingle(),
        loadUploadHistoryFromDb(dataUserId),
      ]);
      setUploadHistory(history);
      if (typeof data?.music_xml_url === "string") {
        const isStorageUrl = data.music_xml_url.includes("/storage/v1/object/") || data.music_xml_url.includes("/xml-files/local-xml-");
        if (!isStorageUrl) {
          setXmlUrl(data.music_xml_url);
        } else {
          setXmlUrl(DEFAULT_XML_URL);
          await supabase.from("user_settings").upsert({
            user_id: dataUserId,
            music_xml_url: DEFAULT_XML_URL,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
      } else {
        await supabase.from("user_settings").upsert({
          user_id: dataUserId,
          music_xml_url: DEFAULT_XML_URL,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
      // Restore local filename from DB (persists across computers)
      const di = data?.dashboard_items as any;
      if (di?.local_xml_filename) {
        setLocalFileName(di.local_xml_filename);
      }
      // Restore saved source mode
      const savedMode = (data as any)?.music_source_mode;
      if (savedMode === "pasta" || savedMode === "online" || savedMode === "both" || savedMode === "none") {
        setSourceModeState(savedMode);
        localStorage.setItem(SOURCE_MODE_KEY, savedMode);
      }
      setSourceModeLoaded(true);
    };
    loadData();
  }, [dataUserId]);

  useEffect(() => {
    if (!sourceModeLoaded) return;

    const normalizedMode = buildSourceMode(
      hasValidOnlineUrl && isOnlineSelected,
      hasValidLocalSource && isLocalSelected,
    );

    if (normalizedMode !== sourceMode) {
      void setSourceMode(normalizedMode);
    }
  }, [hasValidOnlineUrl, hasValidLocalSource, isLocalSelected, isOnlineSelected, sourceMode, sourceModeLoaded]);

  // Delay detection: warn if a source hasn't responded successfully
  useEffect(() => {
    const checkDelay = setInterval(() => {
      const now = Date.now();
      if (isOnlineSelected && hasValidOnlineUrl && lastOnlineSuccessRef.current > 0 && now - lastOnlineSuccessRef.current > 30000) {
        setOnlineDelay(true);
      }
      if (isLocalSelected && localMonitoring && lastLocalSuccessRef.current > 0 && now - lastLocalSuccessRef.current > 15000) {
        setLocalDelay(true);
      }
    }, 5000);
    return () => clearInterval(checkDelay);
  }, [hasValidOnlineUrl, isOnlineSelected, isLocalSelected, localMonitoring]);

  useEffect(() => {
    const fetchPresenter = async () => {
      const [{ data: progsData }, apresentadores] = await Promise.all([
        supabase.from("programas").select("*").ilike("estudio", "%fm%"),
        getApresentadores(),
      ]);
      if (!progsData) return;
      const programas = progsData.map((p: any) => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        selo: p.selo || "",
        diasSemana: p.dias_semana || [],
        horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim,
        estudio: p.estudio || "",
        classificacaoEtaria: p.classificacao_etaria || "",
      }));
      const current = findCurrentProgram(programas);
      if (current) {
        const ap = apresentadores.find(a => a.id === current.programa.apresentadorId);
        if (ap) {
          setPresenterFallback({ nome: ap.nome, foto: ap.foto });
        }
      }
    };
    fetchPresenter();
    const interval = setInterval(fetchPresenter, 60000);
    return () => clearInterval(interval);
  }, []);

  const saveUrl = async (url: string) => {
    if (!dataUserId) return;
    const trimmed = url.trim();
    if (trimmed && !isValidXmlUrl(trimmed)) {
      setOnlineError("Informe uma URL válida terminando em .xml");
      return;
    }
    setOnlineError(null);
    setXmlUrl(trimmed);
    await supabase.from("user_settings").upsert({
      user_id: dataUserId,
      music_xml_url: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  };

  /**
   * Clear the current on-air track (used when the XML explicitly reports
   * "no song playing"). Wipes local state, per-user localStorage keys and
   * the mirrored fields in user_settings.dashboard_items so downstream
   * widgets (Home, Player, Cenário) don't keep showing the stale track.
   */
  const clearMusic = useCallback(async (source?: "online" | "pasta") => {
    const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
    if (!prevRaw && !music) return; // already cleared
    localStorage.removeItem(MUSIC_DATA_KEY);
    localStorage.removeItem(MUSIC_START_KEY);
    setMusic(null);
    setStartTime(null);
    setElapsed(0);
    if (source) {
      setLastSource(source);
      lastSourceRef.current = source;
    }
    if (dataUserId) {
      try {
        await mergeUserDashboardItems(dataUserId, {
          music_start_time: null,
          music_current_title: "",
          music_current_artist: "",
          music_current_cover: "",
          music_current_curiosity: "",
        });
      } catch (e) {
        console.warn("[MusicaNoAr] clearMusic merge failed:", e);
      }
    }
  }, [MUSIC_DATA_KEY, MUSIC_START_KEY, dataUserId, music]);

  const processMusic = useCallback(async (data: MusicData, source?: "online" | "pasta") => {
    const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
    const prev: MusicData | null = prevRaw ? JSON.parse(prevRaw) : null;
    const incomingIsPlaceholder = (!data.titulo || data.titulo.toLowerCase() === "sem titulo" || data.titulo.toLowerCase() === "sem título")
      && (!data.artista || data.artista.toLowerCase() === "desconhecido");
    const previousHasReal = !!prev
      && prev.titulo
      && prev.titulo.toLowerCase() !== "sem titulo"
      && prev.titulo.toLowerCase() !== "sem título";

    if (incomingIsPlaceholder && previousHasReal) {
      return;
    }

    if (!data.capa) {
      const cacheKey = `${data.artista}-${data.titulo}`;
      if (coverCacheRef.current[cacheKey]) {
        data.capa = coverCacheRef.current[cacheKey];
      } else {
        setLoadingCover(true);
        const cover = await fetchCoverFromiTunes(data.titulo, data.artista);
        setLoadingCover(false);
        if (cover) {
          data.capa = cover;
          coverCacheRef.current[cacheKey] = cover;
        }
      }
    }

    if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
      // Guard against overwriting a fresher entry from useGlobalMusicSync:
      // if localStorage was updated < 5s ago with a DIFFERENT song, skip writing
      const existingStartStr = localStorage.getItem(MUSIC_START_KEY);
      if (source !== "pasta" && existingStartStr && prev) {
        const existingStart = parseInt(existingStartStr, 10);
        const age = Date.now() - existingStart;
        // If localStorage has recent data (< 5s old) with a different song than
        // what we're about to write, useGlobalMusicSync likely has fresher data
        if (age < 5000 && (prev.titulo !== data.titulo || prev.artista !== data.artista)) {
          // Don't overwrite — just sync component state to localStorage
          setMusic(prev);
          setStartTime(existingStart);
          setElapsed((Date.now() - existingStart) / 1000);
          return;
        }
      }

      const now = Date.now();
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MUSIC_START_KEY, now.toString());
      setMusic(data);
      setStartTime(now);
      setElapsed(0);
      // Log to history with real artist/music (never null — use fallback text so column is always populated)
      if (dataUserId && source) {
        const logArtist = (data.artista && data.artista.trim()) || "Desconhecido";
        const logTitle = (data.titulo && data.titulo.trim()) || "Sem título";
        addUploadLogToDb(dataUserId, source, deviceNameRef.current, logArtist, logTitle)
          .then(setUploadHistory)
          .catch((e) => console.warn("[MusicaNoAr] history log failed:", e));
      }
      // Persist to musicas_tocadas (history table). This runs even when the
      // Storage-based syncer (useGlobalMusicSync) is stale, so the local file
      // reader alone is enough to keep the play history up to date.
      if (dataUserId) {
        (async () => {
          try {
            const titulo = (data.titulo || "").trim();
            const artista = (data.artista || "").trim();
            if (!titulo || titulo.toLowerCase() === "sem título" || titulo.toLowerCase() === "sem titulo") return;
            if (!artista || artista.toLowerCase() === "desconhecido") return;
            const lower = `${titulo} ${artista}`.toLowerCase();
            if (["break", "ebs curtas", "intervalo", "commercial break", "standby musical"].some((k) => lower.includes(k))) return;

            const { data: settings } = await supabase
              .from("user_settings")
              .select("infomusic_excecoes")
              .eq("user_id", dataUserId)
              .maybeSingle();
            const excecoes = ((settings?.infomusic_excecoes || "") as string)
              .split(",").map((s) => s.trim()).filter(Boolean);
            if (matchesMusicException(excecoes, artista, titulo)) return;

            const { data: programas } = await supabase
              .from("programas")
              .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
              .eq("user_id", dataUserId)
              .eq("ativo", true);
            const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
            const d = new Date();
            const diaAtual = dias[d.getDay()];
            const horaAtual = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            const todayStr = d.toISOString().slice(0, 10);
            let programa = "";
            for (const p of (programas || []) as any[]) {
              if (!p.ativo) continue;
              if (p.variavel) {
                if (p.data_variavel === todayStr && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) { programa = p.nome; break; }
              } else if (p.dias_semana?.includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) {
                programa = p.nome; break;
              }
            }

            await supabase.from("musicas_tocadas").upsert({
              user_id: dataUserId,
              dia: todayStr,
              horario: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`,
              programa,
              artista,
              musica: titulo,
            }, { onConflict: "user_id,musica,artista,dia", ignoreDuplicates: true });
          } catch (e) {
            console.warn("[MusicaNoAr] musicas_tocadas insert failed:", e);
          }
        })();
      }
      // Persist to DB
      if (dataUserId) {
        (async () => {
          try {
            // Push fresh track info + clear old curiosity IMMEDIATELY
            const basePatch: Record<string, any> = {
              music_start_time: now,
              music_current_title: data.titulo,
              music_current_artist: data.artista,
              music_current_cover: data.capa || "",
              music_current_curiosity: "",
            };
            await mergeUserDashboardItems(dataUserId, basePatch);

            // Fetch curiosity in background; guard against stale writes if the song changed again
            const { data: curData } = await supabase.functions.invoke("get-music-curiosity", {
              body: {
                artista: data.artista,
                musica: data.titulo,
                userId: dataUserId,
                deezerArtistImg: data.capa,
              },
            });

            if (curData?.curiosidade) {
              const stillCurrent = localStorage.getItem(MUSIC_START_KEY) === String(now);
              if (stillCurrent) {
                await mergeUserDashboardItems(dataUserId, { music_current_curiosity: curData.curiosidade });
              }
            }
          } catch (e) {
            console.warn("[MusicaNoAr] Error generating curiosity/merging:", e);
          }
        })();
      }
      // Track which source detected the change first
      if (source) {
        setLastSource(source);
        lastSourceRef.current = source;
        setSourceStats(prev => ({ ...prev, [source]: prev[source] + 1 }));
      }
    } else {
      if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
      }
      setMusic(prev.capa && !data.capa ? { ...data, capa: prev.capa } : data);
    }
  }, [MUSIC_DATA_KEY, MUSIC_START_KEY, dataUserId]);

  // Online fetch — always active when URL exists (unified mode)
  const fetchXml = useCallback(async () => {
    if (!isOnlineSelected) return;
    const trimmed = xmlUrl.trim();
    if (!trimmed) return;
    if (!isValidXmlUrl(trimmed)) return;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", {
        body: { url: xmlUrl.trim() },
      });
      if (error || !data?.content) {
        onlineFailCountRef.current++;
        if (onlineFailCountRef.current >= 3) {
          setOnlineError(`Falha ao buscar XML online (${onlineFailCountRef.current} tentativas)`);
        }
        return;
      }
      // Success — reset health trackers
      onlineFailCountRef.current = 0;
      lastOnlineSuccessRef.current = Date.now();
      setOnlineDelay(false);
      setOnlineError(null);
      setOnlineActivating(false);
      setOnlineLastReadAt(Date.now());

      const parsed = parseXmlString(data.content);
      if (!parsed) {
        // XML is valid but reports no song — mark as stopped and clear
        // the on-air track so the UI doesn't stay stuck on the previous one.
        if (isStoppedXmlPayload(data.content as string)) {
          onlineStoppedRef.current = true;
          if (!isLocalSourceHealthy()) {
            await clearMusic("online");
          }
        }
        return;
      }

      onlineStoppedRef.current = false;
      // Only defer to local source when online is NOT stopped
      if (isLocalSourceHealthy()) return;
      await processMusic(parsed, "online");
    } catch (err: any) {
      onlineFailCountRef.current++;
      if (onlineFailCountRef.current >= 3) {
        setOnlineError(`Erro de rede: ${err?.message || "conexão recusada"}`);
      }
    }
  }, [isLocalSourceHealthy, isOnlineSelected, xmlUrl, processMusic, clearMusic]);

  // Sync component state from localStorage (useGlobalMusicSync may update it)
  useEffect(() => {
    const syncFromStorage = () => {
      const raw = localStorage.getItem(MUSIC_DATA_KEY);
      const startStr = localStorage.getItem(MUSIC_START_KEY);
      if (!raw || !startStr) return;
      try {
        const stored: MusicData = JSON.parse(raw);
        const storedStart = parseInt(startStr, 10);
        setMusic(prev => {
          if (!prev || prev.titulo !== stored.titulo || prev.artista !== stored.artista) {
            setStartTime(storedStart);
            setElapsed((Date.now() - storedStart) / 1000);
            return stored;
          }
          // Update cover if changed
          if (stored.capa && prev.capa !== stored.capa) {
            return { ...prev, capa: stored.capa };
          }
          return prev;
        });
      } catch {}
    };
    const interval = setInterval(syncFromStorage, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isOnlineSelected || !hasValidOnlineUrl) return;
    fetchXml();
    fetchIntervalRef.current = setInterval(fetchXml, 2500);
    return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
  }, [fetchXml, hasValidOnlineUrl, isOnlineSelected]);

  // Background sync: upload to storage + log history (non-blocking)
  const syncingRef = useRef(false);
  const pendingSyncRef = useRef<string | null>(null);
  const readingRef = useRef(false);
  const lastStorageSyncAttemptRef = useRef(0);

  // Keep stable refs to avoid interval restarts
  const processMusicRef = useRef(processMusic);
  processMusicRef.current = processMusic;
  const clearMusicRef = useRef(clearMusic);
  clearMusicRef.current = clearMusic;
  const dataUserIdRef = useRef<string | null>(dataUserId);
  dataUserIdRef.current = dataUserId;
  const deviceNameRef = useRef(currentDeviceName);
  deviceNameRef.current = currentDeviceName;

  const syncToStorage = useCallback(async (text: string) => {
    const uid = dataUserIdRef.current;
    if (!uid) return;
    if (syncingRef.current) {
      pendingSyncRef.current = text;
      return;
    }
    syncingRef.current = true;
    lastStorageSyncAttemptRef.current = Date.now();
    try {
      // Storage RLS requires foldername[1] = auth.uid() for INSERT and
      // owner = auth.uid() for UPDATE. Prefix path with the authenticated
      // user's id (independent of effectiveUserId used for multi-tenant reads).
      const { data: authData } = await supabase.auth.getUser();
      const authUid = authData?.user?.id;
      if (!authUid) throw new Error("not authenticated");
      const utf8Blob = new Blob([new TextEncoder().encode(text)], { type: "application/xml" });
      const filePath = `${authUid}/local-xml-${uid}.xml`;
      const { error: upErr } = await supabase.storage
        .from("xml-files")
        .upload(filePath, utf8Blob, { upsert: true, contentType: "application/xml" });
      if (upErr) throw upErr;
      await mergeUserDashboardItems(uid, {
        local_xml_storage_path: filePath,
        local_xml_uploaded_at: Date.now(),
        local_xml_upload_error: "",
      });
      // Do NOT overwrite music_xml_url — the online URL is independent from local sync
      // History logging happens inside processMusic (with real artist/music).
    } catch (err) {
      console.warn("[MusicaNoAr] syncToStorage failed:", err);
      try {
        await mergeUserDashboardItems(uid, {
          local_xml_upload_error: err instanceof Error ? err.message : "Falha ao enviar XML local",
        });
      } catch {}
    }
    syncingRef.current = false;
    const queued = pendingSyncRef.current;
    pendingSyncRef.current = null;
    if (queued) syncToStorage(queued);
  }, []); // stable — uses refs

  // Fast local file re-read — no await on processMusic, no blocking
  const readLocalFile = useCallback(async () => {
    // Guard: skip if previous read is still in progress
    if (readingRef.current) return;
    readingRef.current = true;

    try {
      let file: File | null = null;
      if (fileHandleRef.current) {
        try {
          file = await fileHandleRef.current.getFile();
        } catch (err: any) {
          localFailCountRef.current++;
          if (localFailCountRef.current >= 5) {
            setLocalError(`Erro ao acessar arquivo local (${err?.message || "permissão negada"})`);
          }
          readingRef.current = false;
          return;
        }
      } else {
        file = localFileRef.current;
      }
      if (!file) { readingRef.current = false; return; }

      const rawText = await readFileWithEncoding(file);
      // Jornal FM lê um TXT "ARTISTA - MUSICA"; convertemos em XML sintético
      // para reaproveitar todo o pipeline downstream (parser, storage sync).
      const text = isJornalFmTxt(dataUserIdRef.current, rawText)
        ? (txtToPseudoXml(rawText) ?? rawText)
        : isCulturaFmXml(dataUserIdRef.current, rawText)
        ? (culturaXmlToPseudoXml(rawText) ?? rawText)
        : rawText;

      // Success — reset health trackers
      localFailCountRef.current = 0;
      lastLocalSuccessRef.current = Date.now();
      setLocalDelay(false);
      setLocalError(null);
      setLocalActivating(false);
      setLocalLastReadAt(Date.now());

      const parsed = parseXmlString(text);
      if (text === localFileContentRef.current) {
        if (parsed) {
          try {
            const currentRaw = localStorage.getItem(MUSIC_DATA_KEY);
            const current = currentRaw ? JSON.parse(currentRaw) : null;
            if (!current || current.titulo !== parsed.titulo || current.artista !== parsed.artista) {
              processMusicRef.current(parsed, "pasta");
            }
          } catch {
            processMusicRef.current(parsed, "pasta");
          }
        }
        if (Date.now() - lastStorageSyncAttemptRef.current > 10_000) {
          syncToStorage(text);
        }
        readingRef.current = false;
        return;
      }
      localFileContentRef.current = text;
      setLocalFileContent(text);

      if (parsed) {
        // Fire-and-forget: don't block polling with iTunes cover fetch
        processMusicRef.current(parsed, "pasta");
      } else if (isStoppedXmlPayload(text)) {
        // Automação sem música tocando — limpa o card em vez de manter
        // a última música travada.
        clearMusicRef.current("pasta");
      }

      // Background sync (non-blocking)
      syncToStorage(text);

    } catch { }
    readingRef.current = false;
  }, [syncToStorage]); // stable deps

  // Handle file select
  const handleFileSelect = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    let file: File | null = null;
    let handle: FileSystemFileHandle | null = null;

    const isJornalFm = dataUserId === JORNAL_FM_USER_ID;
    if ('showOpenFilePicker' in window && !e) {
      try {
        const pickerTypes = isJornalFm
          ? [{ description: 'TXT ou XML', accept: { 'text/plain': ['.txt'], 'application/xml': ['.xml'] } }]
          : [{ description: 'XML', accept: { 'application/xml': ['.xml'] } }];
        const [h] = await (window as any).showOpenFilePicker({
          types: pickerTypes,
          multiple: false,
        });
        handle = h;
        file = await h.getFile();
      } catch { return; }
    } else if (e) {
      file = e.target.files?.[0] || null;
    }

    if (!file) return;

    fileHandleRef.current = handle;
    localFileRef.current = file;
    setLocalFileName(file.name);

    // Persist local filename to DB so it survives across computers/sessions
    if (dataUserId) {
      await mergeUserDashboardItems(dataUserId, {
        local_xml_filename: file.name,
      });
    }

    const rawText = await readFileWithEncoding(file);
    const text = isJornalFmTxt(dataUserId, rawText)
      ? (txtToPseudoXml(rawText) ?? rawText)
      : isCulturaFmXml(dataUserId, rawText)
      ? (culturaXmlToPseudoXml(rawText) ?? rawText)
      : rawText;
    localFileContentRef.current = text;
    setLocalFileContent(text);

    const parsed = parseXmlString(text);
    if (parsed) await processMusic(parsed, "pasta");

    syncToStorage(text);
    setLocalMonitoring(true);
  };


  // Local polling — active only when local source is selected
  // --- Background-safe polling using Web Worker timer ---
  // Browsers throttle setInterval to ~1min in background tabs.
  // A Web Worker timer keeps firing at full speed regardless of tab focus.
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Create a minimal Web Worker that sends a "tick" message at the given interval
    const blob = new Blob([`
      let timers = {};
      onmessage = function(e) {
        if (e.data.cmd === 'start') {
          if (timers[e.data.id]) clearInterval(timers[e.data.id]);
          timers[e.data.id] = setInterval(function() { postMessage({ id: e.data.id }); }, e.data.interval);
        } else if (e.data.cmd === 'stop') {
          if (timers[e.data.id]) { clearInterval(timers[e.data.id]); delete timers[e.data.id]; }
        } else if (e.data.cmd === 'stopAll') {
          Object.keys(timers).forEach(function(k) { clearInterval(timers[k]); });
          timers = {};
        }
      };
    `], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;
    return () => { worker.postMessage({ cmd: "stopAll" }); worker.terminate(); };
  }, []);

  // Local file polling via Worker
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    if (!localMonitoring || !isLocalSelected) {
      worker.postMessage({ cmd: "stop", id: "localPoll" });
      return;
    }
    if (!localFileRef.current && !fileHandleRef.current) return;

    const handler = (e: MessageEvent) => { if (e.data.id === "localPoll") readLocalFile(); };
    worker.addEventListener("message", handler);
    worker.postMessage({ cmd: "start", id: "localPoll", interval: 1500 });
    return () => {
      worker.removeEventListener("message", handler);
      worker.postMessage({ cmd: "stop", id: "localPoll" });
    };
  }, [isLocalSelected, localMonitoring, readLocalFile]);

  // Remote storage polling via Worker
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !dataUserId || !isLocalSelected || !localFileName) return;
    if (fileHandleRef.current || localFileRef.current) return;

    const pollStorage = async () => {
      try {
        // Try new path (auth.uid()/local-xml-<dataUserId>.xml) then fall back to legacy flat path
        const { data: authData } = await supabase.auth.getUser();
        const authUid = authData?.user?.id || dataUserId;
        const candidates = [
          `${authUid}/local-xml-${dataUserId}.xml`,
          `local-xml-${dataUserId}.xml`,
        ];
        for (const filePath of candidates) {
          const { data } = supabase.storage.from("xml-files").getPublicUrl(filePath);
          if (!data?.publicUrl) continue;
          const res = await fetch(data.publicUrl + `?t=${Date.now()}`);
          if (!res.ok) continue;
          const text = await res.text();
          if (!text) continue;
          if (text === localFileContentRef.current) return;
          localFileContentRef.current = text;
          setLocalFileContent(text);
          lastLocalSuccessRef.current = Date.now();
          setLocalDelay(false);
          setLocalError(null);
          setLocalActivating(false);
          const parsed = parseXmlString(text);
          if (parsed) processMusicRef.current(parsed, "pasta");
          else if (isStoppedXmlPayload(text)) clearMusicRef.current("pasta");
          return;
        }
      } catch {}
    };

    pollStorage();
    setLocalMonitoring(true);

    const handler = (e: MessageEvent) => { if (e.data.id === "storagePoll") pollStorage(); };
    worker.addEventListener("message", handler);
    worker.postMessage({ cmd: "start", id: "storagePoll", interval: 2000 });
    return () => {
      worker.removeEventListener("message", handler);
      worker.postMessage({ cmd: "stop", id: "storagePoll" });
    };
  }, [dataUserId, isLocalSelected, localFileName]);

  // Staleness check via Worker
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const handler = (e: MessageEvent) => {
      if (e.data.id !== "staleCheck") return;
      const now = Date.now();
      const lastRead = Math.max(lastOnlineSuccessRef.current, lastLocalSuccessRef.current);
      if (now - lastRead > 2000) {
        if (isOnlineSelected && hasValidOnlineUrl) void fetchXml();
        if (isLocalSelected && (fileHandleRef.current || localFileRef.current)) void readLocalFile();
      }
    };

    worker.addEventListener("message", handler);
    worker.postMessage({ cmd: "start", id: "staleCheck", interval: 2000 });
    return () => {
      worker.removeEventListener("message", handler);
      worker.postMessage({ cmd: "stop", id: "staleCheck" });
    };
  }, [isOnlineSelected, hasValidOnlineUrl, isLocalSelected, fetchXml, readLocalFile]);

  useEffect(() => {
    if (!music || !startTime) return;
    const tick = () => { const el = (Date.now() - startTime) / 1000; setElapsed(Math.min(el, music.duracao)); };
    intervalRef.current = setInterval(tick, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [music, startTime]);

  // Load music data from localStorage first, then try DB for start time persistence
  useEffect(() => {
    const stored = getMusicData(dataUserId || undefined);
    if (stored) {
      setMusic(stored.music);
      const st = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
      setStartTime(st);
      setElapsed(stored.elapsed);
    }
    // Also try to restore from DB if localStorage has no start time
    if (!dataUserId) return;
    const restoreFromDb = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", dataUserId)
        .maybeSingle();
      const items = settings?.dashboard_items as Record<string, any> | null;
      if (!items?.music_start_time) return;
      const dbStartTime = items.music_start_time as number;
      const dbTitle = items.music_current_title as string;
      const dbArtist = items.music_current_artist as string;
      // Use DB start time if it matches the current song and localStorage doesn't have it or is stale
      const currentRaw = localStorage.getItem(MUSIC_DATA_KEY);
      if (currentRaw) {
        const current = JSON.parse(currentRaw);
        if (current.titulo === dbTitle && current.artista === dbArtist) {
          const localStart = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
          // If localStorage start is newer than DB, keep it; otherwise use DB
          if (!localStart || Math.abs(localStart - dbStartTime) > 5000) {
            localStorage.setItem(MUSIC_START_KEY, dbStartTime.toString());
            setStartTime(dbStartTime);
            const el = (Date.now() - dbStartTime) / 1000;
            setElapsed(Math.min(el, current.duracao || 999));
          }
        }
      }
    };
    restoreFromDb();
  }, [dataUserId, MUSIC_DATA_KEY, MUSIC_START_KEY]);

  const rawProgress = music && music.duracao > 0 ? Math.min(100, (elapsed / music.duracao) * 100) : 0;

  const prevSongRef = useRef("");

  // Detect when progress resets (music changed or reached end)
  useEffect(() => {
    const songKey = `${music?.titulo || ""}|${music?.artista || ""}`;
    const songChanged = prevSongRef.current !== "" && prevSongRef.current !== songKey;
    const progressReset = prevProgressRef.current > 10 && rawProgress < 5;

    if (songChanged || progressReset) {
      setSliderResetting(true);
      const timer = setTimeout(() => setSliderResetting(false), 600);
      prevSongRef.current = songKey;
      prevProgressRef.current = rawProgress;
      return () => clearTimeout(timer);
    }
    prevSongRef.current = songKey;
    prevProgressRef.current = rawProgress;
  }, [rawProgress, music?.titulo, music?.artista]);

  const progress = sliderResetting ? 0 : rawProgress;

  const [onlineActivating, setOnlineActivating] = useState(false);
  const [localActivating, setLocalActivating] = useState(false);
  const [onlineLastReadAt, setOnlineLastReadAt] = useState<number | null>(null);
  const [localLastReadAt, setLocalLastReadAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatAgo = (ts: number | null) => {
    if (!ts) return null;
    const s = Math.max(0, Math.floor((nowTick - ts) / 1000));
    if (s < 5) return "agora";
    if (s < 60) return `há ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    return `há ${h}h`;
  };

  type SourceStatus = { key: "inativa" | "ativando" | "lendo" | "ok" | "atrasado" | "erro"; label: string; bg: string; fg: string; border: string; pulse?: boolean };
  const buildStatus = (opts: {
    selected: boolean;
    activating: boolean;
    error: string | null;
    lastReadAt: number | null;
    hasSource: boolean;
    delayed: boolean;
  }): SourceStatus => {
    if (opts.error) return { key: "erro", label: "ERRO", bg: "#fee2e2", fg: "#b91c1c", border: "#fecaca" };
    if (!opts.selected) return { key: "inativa", label: opts.hasSource ? "INATIVA" : "SEM ORIGEM", bg: "#f1f5f9", fg: "#64748b", border: "#e2e8f0" };
    if (opts.activating) return { key: "ativando", label: "ATIVANDO…", bg: "#dbeafe", fg: "#1d4ed8", border: "#bfdbfe", pulse: true };
    if (!opts.lastReadAt) return { key: "ativando", label: "AGUARDANDO 1ª LEITURA", bg: "#dbeafe", fg: "#1d4ed8", border: "#bfdbfe", pulse: true };
    if (opts.delayed) return { key: "atrasado", label: "ATRASADO", bg: "#fef3c7", fg: "#b45309", border: "#fde68a", pulse: true };
    const ageSec = (nowTick - opts.lastReadAt) / 1000;
    if (ageSec < 10) return { key: "lendo", label: "LENDO", bg: "#0d0446", fg: "#C6F03C", border: "#C6F03C", pulse: true };
    return { key: "ok", label: "OK", bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" };
  };

  const toggleOnlineSource = () => {
    if (!hasValidOnlineUrl) return;
    const willActivate = !isOnlineSelected;
    const nextMode = buildSourceMode(willActivate, isLocalSelected);
    if (willActivate) {
      setOnlineActivating(true);
      // Safety timeout — clear after 12s even if no read arrives
      window.setTimeout(() => setOnlineActivating(false), 12000);
    } else {
      setOnlineActivating(false);
    }
    void setSourceMode(nextMode);
  };

  const toggleLocalSource = () => {
    if (!hasValidLocalSource) return;
    const willActivate = !isLocalSelected;
    const nextMode = buildSourceMode(isOnlineSelected, !isLocalSelected);
    if (willActivate) {
      setLocalActivating(true);
      window.setTimeout(() => setLocalActivating(false), 12000);
    } else {
      setLocalActivating(false);
    }
    void setSourceMode(nextMode);
  };

  const isBreak = !!(music && (
    music.titulo.toUpperCase().trim() === "BREAK" ||
    music.artista.toUpperCase().trim() === "BREAK"
  ));

  const hasCover = music?.capa && music.capa.length > 0;
  const useFallback = !isBreak && !hasCover && presenterFallback;
  const displayTitulo = isBreak ? "Intervalo" : (useFallback ? presenterFallback!.nome : (music?.titulo || "Aguardando leitura..."));
  const displayArtista = isBreak ? "" : (useFallback ? "no ar agora" : (music?.artista || "Interprete"));
  const displayCover = isBreak ? null : (useFallback ? presenterFallback!.foto : (music?.capa || ""));

  // Paleta extraída da capa para gradiente elegante do box de música
  const coverPalette = useCoverPalette(displayCover || null);
  const paletteContrast = getPaletteContrast(coverPalette);
  const musicBoxBg = coverPalette
    ? `linear-gradient(135deg, ${coverPalette.primary} 0%, ${coverPalette.secondary} 100%)`
    : "var(--layout-slider-bg, #0d0d0d)";
  const musicTextColor = paletteContrast?.textColor ?? "#ffffff";
  const musicTextMuted = paletteContrast?.textMutedColor ?? "rgba(255,255,255,0.65)";
  const musicTextShadow = paletteContrast?.textShadow ?? "none";

  // Listen for manual curiosity sends from the settings table
  useEffect(() => {
    const handler = (e: any) => {
      const text = e.detail?.text;
      if (text) {
        manualCuriosityRef.current = text;
        curiosityShownAtRef.current = Date.now();
        setCuriosidade(text);
        forceCuriosityTick(n => n + 1);
      }
    };
    window.addEventListener("manual-music-curiosity" as any, handler);
    return () => window.removeEventListener("manual-music-curiosity" as any, handler);
  }, []);

  // ===== Info Music: fetch IA-generated curiosity when song changes =====
  useEffect(() => {
    if (isBreak || !music?.titulo || !music?.artista || !dataUserId) {
      setCuriosidade("");
      curiosidadeFetchedKeyRef.current = "";
      manualCuriosityRef.current = null;
      return;
    }
    const key = `${dataUserId}::${music.artista}::${music.titulo}`.toLowerCase();
    if (curiosidadeFetchedKeyRef.current === key) return;
    curiosidadeFetchedKeyRef.current = key;
    
    // Clear previous curiosity and reset manual flag for new song
    setCuriosidade("");
    manualCuriosityRef.current = null;
    
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session?.access_token) return;
        if (cancelled) return;
        const { data, error } = await supabase.functions.invoke("get-music-curiosity", {
          body: { artista: music.artista, musica: music.titulo, userId: dataUserId },
        });
        if (cancelled) return;
        if (error) { console.warn("curiosity error", error); return; }
        const txt = (data as { curiosidade?: string })?.curiosidade;
        const isCached = !!(data as { cached?: boolean })?.cached;

        // Only set if user hasn't sent a manual one in the meantime
        if (txt && !manualCuriosityRef.current) {
          setCuriosidade(txt);
          // If curiosity was already cached, push it to XML immediately for 15s
          if (isCached) {
            curiosityShownAtRef.current = Date.now();
            curiosityDurationRef.current = 15_000;
            forceCuriosityTick((n) => n + 1);
          }
        }
      } catch (e) {
        console.warn("curiosity fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [music?.titulo, music?.artista, isBreak, dataUserId]);

  // XML always carries the curiosity of the song currently playing (as long as we have one for it).
  const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xmlCuriosidade = curiosidade ? escapeXml(curiosidade) : "";

  if (!music && !presenterFallback) {
    return (
      <div className="animate-pulse">
        <div className="rounded-2xl overflow-hidden p-5" style={{ background: "var(--layout-header-bg, #0d0446)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Music size={20} style={{ color: "var(--layout-header-text, #ffffff)" }} />
            </div>
            <div className="h-5 w-32 rounded" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--layout-slider-bg, #0d0d0d)" }}>
            <div className="flex gap-4 p-4">
              <div className="w-40 h-40 rounded-xl shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.05)" }} />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-6 w-48 rounded" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                <div className="h-4 w-32 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                <div className="h-2 w-full rounded-full mt-8" style={{ backgroundColor: "rgba(255,255,255,0.05)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const preferredSource = sourceStats.online >= sourceStats.pasta ? "online" : "pasta";
  const bothActive = isOnlineSelected && isLocalSelected;

  // Nexo Form palette (mesmo do Cadastro de Ouvinte)
  const NEXO_CYAN = "#00BFF0";
  const NEXO_CARD_BG = "#D6F4FB";
  const NEXO_DARK = "#0A2540";

  return (
    <div className="animate-fade-in space-y-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* ═══ MAIN MUSIC CARD (Nexo Form style) ═══ */}
      <section
        style={{
          background: NEXO_CARD_BG,
          borderRadius: 28,
          padding: "28px 32px 32px",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center"
              style={{ width: 40, height: 40, borderRadius: 999, background: "#FFFFFF", border: `2px solid ${NEXO_CYAN}` }}
            >
              <Music size={18} style={{ color: NEXO_CYAN }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: NEXO_DARK, textTransform: "uppercase", margin: 0 }}>
                Música no Ar
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {bothActive && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #16a34a", color: "#16a34a" }}>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: "#22c55e" }} />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: "#22c55e" }} />
                    </span>
                    Dual
                  </span>
                )}
                {onlineError && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #ef4444", color: "#ef4444" }}>
                    <AlertTriangle size={10} className="shrink-0" /> Online: erro
                  </span>
                )}
                {!onlineError && onlineDelay && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #eab308", color: "#a16207" }}>
                    <AlertTriangle size={10} className="shrink-0" /> Online: sem resposta +30s
                  </span>
                )}
                {localError && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #ef4444", color: "#ef4444" }}>
                    <AlertTriangle size={10} className="shrink-0" /> Local: erro
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.dispatchEvent(new Event("minimizeMusica"));
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-md shadow-[#00BFF0]/20"
              style={{ background: NEXO_CYAN, color: "#FFFFFF" }}
            >
              <Minimize2 size={14} />
              Minimizar
            </button>
            <BackButton />
          </div>
        </div>


        {/* Song display with gradient progress */}
        <div className="px-4 pb-4">
          <div
            key={`${displayTitulo}-${displayArtista}`}
            className="rounded-2xl overflow-hidden relative animate-fade-in"
            style={{ background: musicBoxBg, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", transition: "background 800ms ease" }}
          >
            {/* Gradient progress fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-2xl pointer-events-none"
              style={{
                width: `${progress}%`,
                minWidth: progress > 0 ? "8px" : "0px",
                background: `linear-gradient(90deg, var(--layout-slider-bg, #0d0d0d) 0%, color-mix(in srgb, var(--layout-slider-bg, #0d0d0d) 50%, var(--layout-accent-color, #268ffa)) 60%, var(--layout-accent-color, #268ffa) 100%)`,
                transition: sliderResetting
                  ? "width 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease"
                  : "width 0.5s linear",
                opacity: sliderResetting ? 0.3 : 0.85,
                zIndex: 1,
              }}
            />
            {/* Shimmer overlay on progress */}
            <div className="absolute inset-y-0 left-0 rounded-2xl overflow-hidden pointer-events-none" style={{ width: `${progress}%`, zIndex: 2 }}>
              <div className="absolute inset-0" style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
                animation: "player-shimmer 3s ease-in-out infinite",
              }} />
            </div>

            {/* Scrim adaptativo por luminância do gradiente */}
            {paletteContrast && (
              <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: paletteContrast.scrimBackground, zIndex: 2 }} />
            )}

            <div className="relative z-10 p-4 flex gap-4 items-center">
              {/* Cover image */}
              <div className="relative w-36 h-36 lg:w-44 lg:h-44 shrink-0 overflow-hidden rounded-xl group" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                {loadingCover && !isBreak && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 backdrop-blur-sm rounded-xl">
                    <Loader2 className="animate-spin" size={28} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                  </div>
                )}
                {isBreak ? (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)" }}>
                    <span className="text-white font-black text-lg tracking-wider uppercase animate-pulse">Intervalo</span>
                  </div>
                ) : displayCover ? (
                  <img src={displayCover} alt="Capa" className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.2)" }}>
                    <Music size={36} />
                    <span className="italic text-[10px]">{music ? "Sem capa" : "Aguardando..."}</span>
                  </div>
                )}
              </div>

              {/* Song Info */}
              <div className="flex-1 flex flex-col justify-center min-w-0 gap-2">
                <h2 className="text-lg lg:text-xl font-black tracking-tight truncate" style={{ color: musicTextColor, textShadow: musicTextShadow }}>
                  {displayTitulo}
                </h2>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: musicTextMuted, textShadow: musicTextShadow }}>
                  <User size={14} />
                  {displayArtista}
                </span>

                {music && music.duracao > 0 && (
                  <div className="mt-2 flex items-center gap-1.5" style={{ textShadow: musicTextShadow }}>
                    <span className="text-sm font-mono font-black tracking-wide" style={{ color: musicTextColor }}>{formatTimeMs(elapsed)}</span>
                    <span className="text-sm font-mono font-bold" style={{ color: musicTextMuted, opacity: 0.6 }}>/</span>
                    <span className="text-sm font-mono font-bold" style={{ color: musicTextMuted }}>{formatTime(music.duracao)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

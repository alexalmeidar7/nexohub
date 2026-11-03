import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { Music, User, Loader2, Check, Globe, FolderOpen, Clock, Upload, Monitor, ChevronDown, ChevronUp, AlertTriangle, Circle, Sparkles, X, Settings, CheckCircle2, Radio, Disc } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";
const InfoMusicSection = lazyRetry(() => import("./InfoMusicSection"));
const TranscricaoStreamingPanel = lazyRetry(() => import("./TranscricaoStreamingPanel"));
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findCurrentProgram } from "./OnAirWidget";
import { getApresentadores } from "./ApresentadorForm";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { useCoverPalette, getPaletteContrast } from "@/lib/coverPalette";
import { matchesMusicException, getMusicExceptions, MusicException } from "@/lib/musicExceptions";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { fetchTrackCover } from "@/lib/musicCoverResolver";
import { getMusicData } from "@/lib/musicData";
import { writeMusicData, writeMusicStart, clearMusicData } from "@/lib/musicStorageKeys";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
  horario?: string;
  fileModifiedAt?: number;
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
    const autoParsed = parseAnyAutomationFile(xmlStr);
    if (autoParsed) {
      if (autoParsed.isStopped) return null;
      if (autoParsed.titulo || autoParsed.artista) {
        return {
          titulo: autoParsed.titulo,
          artista: autoParsed.artista,
          duracao: autoParsed.duracao || 0,
          capa: autoParsed.capa || "",
          horario: autoParsed.horario,
        };
      }
    }

    // Strip XML declaration to avoid DOMParser encoding conflicts
    const cleaned = xmlStr.replace(/<\?xml[^?]*\?>\s*/i, "");
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
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
    const autoParsed = parseAnyAutomationFile(xmlStr);
    if (autoParsed?.isStopped) return true;

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
import { saveLocalFileHandle, getLocalFileHandle } from "@/lib/localFileHandleStorage";
import { parseAnyAutomationFile, convertToStandardXml } from "@/lib/automationFileParser";

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
    titulo: titulo || "Sem titulo",
    artista: artista || "Desconhecido",
    duracao,
    capa,
    horario: rawHorario || undefined,
  };
}

function parseHorarioToTimestamp(horarioStr?: string | null): number | null {
  if (!horarioStr) return null;
  const str = horarioStr.trim();
  // Formato ISO ou com data YYYY-MM-DD HH:MM:SS
  if (str.includes("-") || str.includes("/")) {
    const parsedDate = new Date(str.replace(/\//g, "-"));
    if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }
  // Formato HH:MM:SS ou HH:MM
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const now = new Date();
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3] || "0", 10);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
  const diff = now.getTime() - d.getTime();
  if (diff < -60000) {
    // Horário futuro por mais de 1 min: provavelmente iniciou no dia anterior
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
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
    return await fetchTrackCover(titulo, artista);
  } catch {
    return "";
  }
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

export default function MusicaNoAr({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const clientAcc = user ? (findClientAccountByEmail(user.email || "") || findClientAccountById(user.id)) : null;

  const dataUserId = useMemo(() => {
    if (effectiveUserId) return effectiveUserId;
    if (clientAcc && !clientAcc.isAdmin) return clientAcc.id;
    if (user?.id && !clientAcc?.isAdmin) return user.id;
    // Para admin/desenvolvimento sem rádio explícita no prop, aponta para a emissora principal (Positiva FM)
    return "452ebd1e-61a0-42dd-bf80-231a3f426c83";
  }, [effectiveUserId, clientAcc, user?.id]);

  const candidateUserIds = useMemo(() => {
    const ids = [
      effectiveUserId,
      clientAcc?.id,
      clientAcc?.parentUserId,
      user?.id,
    ].filter(Boolean) as string[];
    if (ids.length === 0) {
      ids.push("452ebd1e-61a0-42dd-bf80-231a3f426c83");
    }
    return Array.from(new Set(ids));
  }, [effectiveUserId, clientAcc?.id, clientAcc?.parentUserId, user?.id]);

  // Per-user scoped localStorage keys (prevents cross-tenant music leak)
  const MUSIC_DATA_KEY = dataUserId ? `masterview_music_data::${dataUserId}` : "masterview_music_data::__none__";
  const MUSIC_START_KEY = dataUserId ? `masterview_music_start::${dataUserId}` : "masterview_music_start::__none__";
  const [xmlUrl, setXmlUrl] = useState(DEFAULT_XML_URL);
  const [music, setMusic] = useState<MusicData | null>(() => {
    try {
      const stored = getMusicData(dataUserId);
      if (stored?.music) return stored.music;
      for (const uid of candidateUserIds) {
        const s = getMusicData(uid);
        if (s?.music) return s.music;
      }
    } catch {}
    return null;
  });
  const [startTime, setStartTime] = useState<number | null>(() => {
    try {
      for (const uid of [dataUserId, ...candidateUserIds]) {
        const raw = localStorage.getItem(`masterview_music_start::${uid}`);
        if (raw) {
          const val = parseInt(raw, 10);
          if (!isNaN(val) && val > 0) return val;
        }
      }
    } catch {}
    return null;
  });
  const [elapsed, setElapsed] = useState<number>(() => {
    try {
      const stored = getMusicData(dataUserId);
      if (stored && typeof stored.elapsed === "number") return stored.elapsed;
      for (const uid of candidateUserIds) {
        const s = getMusicData(uid);
        if (s && typeof s.elapsed === "number") return s.elapsed;
      }
    } catch {}
    return 0;
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coverCacheRef = useRef<Record<string, string>>({});
  const [sliderResetting, setSliderResetting] = useState(false);
  const prevProgressRef = useRef(0);
  const [loadingCover, setLoadingCover] = useState(false);
  const [presenterFallback, setPresenterFallback] = useState<{ nome: string; foto: string } | null>(null);
  // Evita a página ficar "presa" no esqueleto quando nenhuma leitura chega:
  // após 2.5s a interface completa aparece com "Aguardando leitura...".
  const [bootWaiting, setBootWaiting] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setBootWaiting(false), 2500);
    return () => window.clearTimeout(t);
  }, []);

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
  const savedHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [needsFilePermission, setNeedsFilePermission] = useState(false);
  // localPollRef removed — using Web Worker timer instead
  const [uploadHistory, setUploadHistory] = useState<UploadLogEntry[]>([]);
  const [localFileName, setLocalFileName] = useState<string>("");
  const [localMonitoring, setLocalMonitoring] = useState(false);
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState(() => getDeviceName());
  const [currentDeviceName, setCurrentDeviceName] = useState(() => getDeviceName());
  // Computador onde a leitura do arquivo local está acontecendo (persistido no banco),
  // para que a informação apareça igual em qualquer outro computador.
  const [remoteReaderDevice, setRemoteReaderDevice] = useState<string>("");
  // Horário de início da última leitura já aplicada na tela. Garante que a exibição
  // NUNCA volte para uma leitura mais antiga (causa da alternância entre registros).
  const appliedStartRef = useRef<number>(0);
  const syncInFlightRef = useRef(false);
  const canApplyReading = useCallback((start: number) => {
    if (!start || start <= 0) return false;
    return start >= appliedStartRef.current;
  }, []);
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
  // Seção "Configuração das Origens" inicia fechada (expansível)
  const [showConfig, setShowConfig] = useState(false);
  const [allExceptions, setAllExceptions] = useState<MusicException[]>([]);

  useEffect(() => {
    if (!dataUserId) return;
    getMusicExceptions(dataUserId).then(setAllExceptions);
    // Poll exceptions every 60s
    const iv = setInterval(() => getMusicExceptions(dataUserId).then(setAllExceptions), 60000);
    return () => clearInterval(iv);
  }, [dataUserId]);

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

  // Um computador é o leitor físico se, e somente se, possui o FileHandle ou File em memória
  // selecionado ativamente neste navegador. Computadores secundários não possuem o arquivo local
  // em memória e DEVEM sempre sincronizar do banco de dados (Supabase user_settings / musicas_tocadas).
  const isPhysicalLocalReader = useCallback(() => {
    return Boolean(fileHandleRef.current || localFileRef.current);
  }, []);

  const isLocalReaderActive = useCallback(() => {
    return isPhysicalLocalReader() && localMonitoring && isLocalSourceHealthy();
  }, [isPhysicalLocalReader, localMonitoring, isLocalSourceHealthy]);

  // Este computador também é "leitor" quando lê o XML por link online com sucesso recente.
  const isOnlineReaderOnClient = useCallback(() => {
    return Boolean(
      isOnlineSelected && hasValidOnlineUrl && !onlineError &&
      lastOnlineSuccessRef.current > 0 &&
      Date.now() - lastOnlineSuccessRef.current < 60000
    );
  }, [isOnlineSelected, hasValidOnlineUrl, onlineError]);

  const isReaderMachine = useCallback(
    () => isPhysicalLocalReader() || isOnlineReaderOnClient(),
    [isPhysicalLocalReader, isOnlineReaderOnClient]
  );

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

  const notifySyncServer = useCallback((payload: {
    titulo: string;
    artista: string;
    duracao?: number;
    capa?: string;
    horario?: string;
    startTime?: number;
    source?: string;
    deviceName?: string;
  }) => {
    try {
      const targetSlug = clientAcc?.slug || "positivafm";
      const uid = dataUserIdRef.current || dataUserId || targetSlug;
      fetch("/api/sync-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: targetSlug,
          userId: uid,
          titulo: payload.titulo,
          artista: payload.artista,
          duracao: payload.duracao || 180,
          capa: payload.capa || "",
          horario: payload.horario || "",
          startTime: payload.startTime || Date.now(),
          source: payload.source || "pasta",
          deviceName: payload.deviceName || currentDeviceName || "",
        }),
      }).catch(() => {});
    } catch {}
  }, [clientAcc?.slug, dataUserId, currentDeviceName]);

  // Load URL, source mode, and history from DB
  useEffect(() => {
    if (!dataUserId) return;
    const loadData = async () => {
      const [{ data }, history] = await Promise.all([
        supabase
          .from("user_settings")
          .select("music_xml_url, music_source_mode, dashboard_items, music_source_device")
          .eq("user_id", dataUserId)
          .maybeSingle(),
        loadUploadHistoryFromDb(dataUserId),
      ]);
      setUploadHistory(history);
      if (typeof (data as any)?.music_source_device === "string" && (data as any).music_source_device.trim()) {
        setRemoteReaderDevice((data as any).music_source_device.trim());
      }
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
      // Restaurar faixa e tempo real tocando do banco se ainda ativa (evita começar contagem do zero ao entrar na página)
      if (di?.music_current_title && di.music_current_title !== "Sem título" && di.music_current_title !== "Aguardando leitura...") {
        const dbStart = typeof di.music_start_time === "number" && di.music_start_time > 0 ? di.music_start_time : Date.now();
        const dur = typeof di.music_current_duration === "number" && di.music_current_duration > 0
          ? di.music_current_duration
          : (typeof di.music_current_duracao === "number" && di.music_current_duracao > 0 ? di.music_current_duracao : 180);
        const now = Date.now();
        const el = Math.max(0, (now - dbStart) / 1000);
        if (el < dur + 600) {
          const initialMusic: MusicData = {
            titulo: di.music_current_title,
            artista: di.music_current_artist || "Desconhecido",
            duracao: dur,
            capa: di.music_current_cover || "",
          };
          appliedStartRef.current = Math.max(appliedStartRef.current, dbStart);
          if (!isPhysicalLocalReader()) {
            // Em computadores secundários sem o arquivo local em disco, o banco é a verdade absoluta
            setMusic(initialMusic);
            setStartTime(dbStart);
            setElapsed(Math.min(dur, el));
            setLastSource("pasta");
            lastSourceRef.current = "pasta";
            if (!initialMusic.capa) {
              fetchCoverFromiTunes(initialMusic.titulo, initialMusic.artista).then((cov) => {
                if (cov) {
                  setMusic(m => m && m.titulo === initialMusic.titulo ? { ...m, capa: cov } : m);
                  candidateUserIds.forEach(uid => {
                    mergeUserDashboardItems(uid, { music_current_cover: cov }).catch(() => {});
                  });
                }
              }).catch(() => {});
            }
          } else {
            setMusic(prev => prev || initialMusic);
            setStartTime(prev => prev || dbStart);
            setElapsed(prev => (prev > 0 ? prev : Math.min(dur, el)));
          }
          try {
            localStorage.setItem(MUSIC_START_KEY, dbStart.toString());
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(initialMusic));
          } catch {}
        }
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
        supabase.from("programas").select("*, apresentadores_ids").ilike("estudio", "%fm%"),
        getApresentadores(),
      ]);
      if (!progsData) return;
      const programas = progsData.map((p: any) => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        apresentadoresIds: p.apresentadores_ids || [],
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
    candidateUserIds.forEach(uid => {
      clearMusicData(uid);
      try {
        const channel = supabase.channel(`music-live-sync:${uid}`);
        channel.send({
          type: "broadcast",
          event: "track_change",
          payload: {
            titulo: "",
            artista: "",
            capa: "",
            duracao: 0,
          },
        }).catch(() => {});
      } catch {}
    });
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
  }, [MUSIC_DATA_KEY, MUSIC_START_KEY, dataUserId, music, candidateUserIds]);

  const processMusic = useCallback(async (data: MusicData, source?: "online" | "pasta", rawXml?: string, fileModifiedAt?: number) => {
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

    const incomingIsBreak = !!(data && (
      (data.titulo || "").toUpperCase().trim() === "BREAK" ||
      (data.artista || "").toUpperCase().trim() === "BREAK" ||
      (data.titulo || "").toLowerCase().trim() === "intervalo" ||
      (data.artista || "").toLowerCase().trim() === "intervalo" ||
      (data.titulo || "").toLowerCase().trim() === "ebs curtas" ||
      (data.artista || "").toLowerCase().trim() === "ebs curtas" ||
      (data.titulo || "").toLowerCase().trim() === "commercial break" ||
      (data.artista || "").toLowerCase().trim() === "commercial break"
    ));
    const previousIsBreak = !!(prev && (
      (prev.titulo || "").toUpperCase().trim() === "BREAK" ||
      (prev.artista || "").toUpperCase().trim() === "BREAK" ||
      (prev.titulo || "").toLowerCase().trim() === "intervalo" ||
      (prev.artista || "").toLowerCase().trim() === "intervalo" ||
      (prev.titulo || "").toLowerCase().trim() === "ebs curtas" ||
      (prev.artista || "").toLowerCase().trim() === "ebs curtas" ||
      (prev.titulo || "").toLowerCase().trim() === "commercial break" ||
      (prev.artista || "").toLowerCase().trim() === "commercial break"
    ));

    const startStr = localStorage.getItem(MUSIC_START_KEY);
    const prevStart = startStr ? parseInt(startStr, 10) : 0;
    const prevAgeMs = prevStart > 0 ? Date.now() - prevStart : Infinity;

    // Anti ping-pong: se temos uma faixa real recente (< 4 min ou duração da música),
    // ignore BREAK/Intervalo transitório para que a música continue salva e visível.
    if (incomingIsBreak && previousHasReal && !previousIsBreak) {
      const maxTrackAge = Math.max(240_000, ((prev?.duracao || 180) * 1000));
      if (prevAgeMs < maxTrackAge) {
        return;
      }
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
          const currentDev = deviceNameRef.current || "Estúdio";
          candidateUserIds.forEach(uid => {
            mergeUserDashboardItems(uid, { music_current_cover: cover }).catch(() => {});
            writeMusicData(uid, { ...data, capa: cover });
            try {
              const channel = supabase.channel(`music-live-sync:${uid}`);
              channel.send({
                type: "broadcast",
                event: "track_change",
                payload: {
                  titulo: data.titulo,
                  artista: data.artista,
                  capa: cover,
                  duracao: data.duracao,
                  startTime: startTimeRef.current || Date.now(),
                  source: source || "pasta",
                  deviceName: currentDev,
                },
              }).catch(() => {});
            } catch {}
          });
          notifySyncServer({
            titulo: data.titulo,
            artista: data.artista,
            duracao: data.duracao,
            capa: cover,
            horario: data.horario,
            startTime: startTimeRef.current || Date.now(),
            source: source || "pasta",
          });
        }
      }
    }

    const cleanT = (data.titulo || "").trim().toLowerCase();
    const cleanA = (data.artista || "").trim().toLowerCase();

    // 1. Verificar se a faixa já é a mesma que está tocando no estado ou no armazenamento
    let existingStart: number | null = null;

    if (musicRef.current && musicRef.current.titulo?.trim().toLowerCase() === cleanT && musicRef.current.artista?.trim().toLowerCase() === cleanA) {
      if (startTimeRef.current && startTimeRef.current > 0) {
        existingStart = startTimeRef.current;
      }
    }

    if (!existingStart) {
      const startStr = localStorage.getItem(MUSIC_START_KEY);
      if (startStr && prev && prev.titulo?.trim().toLowerCase() === cleanT && prev.artista?.trim().toLowerCase() === cleanA) {
        const parsedStart = parseInt(startStr, 10);
        if (!isNaN(parsedStart) && parsedStart > 0) {
          existingStart = parsedStart;
        }
      }
    }

    if (!existingStart) {
      for (const uid of candidateUserIds) {
        try {
          const rawM = localStorage.getItem(`masterview_music_data::${uid}`);
          const rawS = localStorage.getItem(`masterview_music_start::${uid}`);
          if (rawM && rawS) {
            const parsed = JSON.parse(rawM);
            if (parsed.titulo?.trim().toLowerCase() === cleanT && parsed.artista?.trim().toLowerCase() === cleanA) {
              const st = parseInt(rawS, 10);
              if (!isNaN(st) && st > 0) {
                existingStart = st;
                break;
              }
            }
          }
        } catch {}
      }
    }

    const isSameTrack = !!existingStart || (!!prev && prev.titulo?.trim().toLowerCase() === cleanT && prev.artista?.trim().toLowerCase() === cleanA);

    if (isSameTrack && existingStart) {
      // A faixa NÃO mudou: NÃO reiniciar do zero, manter o momento que leu o arquivo e continuar contagem
      const dur = data.duracao > 0 ? data.duracao : (prev?.duracao && prev.duracao > 0 ? prev.duracao : 180);
      const el = Math.max(0, (Date.now() - existingStart) / 1000);
      setStartTime(existingStart);
      setElapsed(dur > 0 ? Math.min(dur, el) : el);
      
      const activeCover = data.capa || prev?.capa || "";
      if (activeCover && (!prev?.capa || prev.capa !== activeCover)) {
        try {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...data, capa: activeCover }));
          candidateUserIds.forEach(uid => {
            try {
              localStorage.setItem(`masterview_music_data::${uid}`, JSON.stringify({ ...data, capa: activeCover }));
            } catch {}
          });
        } catch {}
        const currentDev = deviceNameRef.current || "Estúdio";
        candidateUserIds.forEach(uid => {
          mergeUserDashboardItems(uid, {
            music_current_cover: activeCover,
            music_current_title: data.titulo,
            music_current_artist: data.artista,
            music_start_time: existingStart,
          }).catch(() => {});
          writeMusicData(uid, { ...data, capa: activeCover });
          try {
            const channel = supabase.channel(`music-live-sync:${uid}`);
            channel.send({
              type: "broadcast",
              event: "track_change",
              payload: {
                titulo: data.titulo,
                artista: data.artista,
                capa: activeCover,
                duracao: dur,
                startTime: existingStart,
                source: source || "pasta",
                deviceName: currentDev,
              },
            }).catch(() => {});
          } catch {}
        });
        notifySyncServer({
          titulo: data.titulo,
          artista: data.artista,
          duracao: dur,
          capa: activeCover,
          startTime: existingStart,
          source: source || "pasta",
        });
      }
      setMusic(prev?.capa && !data.capa ? { ...data, capa: prev.capa } : (activeCover ? { ...data, capa: activeCover } : data));
      return;
    }

    // 2. Faixa REALMENTE nova (trocou título/artista): determinar o momento exato que iniciou
    let songStartTime: number | null = parseHorarioToTimestamp(data.horario);
    if (!songStartTime || Math.abs(Date.now() - songStartTime) > 12 * 3600 * 1000) {
      songStartTime = null;
    }

    // Se for arquivo local (pasta), usa o timestamp de modificação real do arquivo no disco
    if (!songStartTime && source === "pasta" && typeof fileModifiedAt === "number" && fileModifiedAt > 0) {
      const fileAge = Date.now() - fileModifiedAt;
      const maxAge = Math.max(600_000, (data.duracao || 180) * 1000);
      if (fileAge >= 0 && fileAge < maxAge) {
        songStartTime = fileModifiedAt;
      }
    }

    // Se for online com timestamp de modificação
    if (!songStartTime && typeof fileModifiedAt === "number" && fileModifiedAt > 0) {
      const fileAge = Date.now() - fileModifiedAt;
      const maxAge = Math.max(600_000, (data.duracao || 180) * 1000);
      if (fileAge >= 0 && fileAge < maxAge) {
        songStartTime = fileModifiedAt;
      }
    }

    // Fallback: o momento em que este client leu o arquivo novo
    if (!songStartTime) {
      songStartTime = Date.now();
    }

    const dur = data.duracao > 0 ? data.duracao : 180;
    const currentElapsed = Math.max(0, (Date.now() - songStartTime) / 1000);

    try {
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MUSIC_START_KEY, songStartTime.toString());
      candidateUserIds.forEach(uid => {
        try {
          localStorage.setItem(`masterview_music_data::${uid}`, JSON.stringify(data));
          localStorage.setItem(`masterview_music_start::${uid}`, songStartTime!.toString());
        } catch {}
      });
    } catch {}

    // Synchronize to Supabase user_settings for multi-device live propagation
    const currentDeviceName = deviceNameRef.current || "Estúdio";
    const updateDashboardData = {
      music_current_title: data.titulo,
      music_current_artist: data.artista,
      music_current_cover: data.capa || "",
      music_current_duration: dur,
      music_start_time: songStartTime,
      local_reader_device_name: currentDeviceName,
      local_reader_active_at: Date.now(),
    };

    candidateUserIds.forEach(uid => {
      mergeUserDashboardItems(uid, updateDashboardData).catch(() => {});
      writeMusicData(uid, data);
      writeMusicStart(uid, songStartTime!);
      try {
        const channel = supabase.channel(`music-live-sync:${uid}`);
        channel.send({
          type: "broadcast",
          event: "track_change",
          payload: {
            titulo: data.titulo,
            artista: data.artista,
            capa: data.capa || "",
            duracao: dur,
            horario: data.horario,
            startTime: songStartTime,
            source: source || "pasta",
            deviceName: currentDeviceName,
          },
        }).catch(() => {});
      } catch {}
    });

    setMusic(data);
    setStartTime(songStartTime);
    setElapsed(dur > 0 ? Math.min(dur, currentElapsed) : currentElapsed);
    notifySyncServer({
      titulo: data.titulo,
      artista: data.artista,
      duracao: dur,
      capa: data.capa || "",
      horario: data.horario,
      startTime: songStartTime,
      source: source || "pasta",
    });
      
      // Log to history with real artist/music (never null — use fallback text so column is always populated)
      if (dataUserId && source) {
        const logArtist = (data.artista && data.artista.trim()) || "Desconhecido";
        const logTitle = (data.titulo && data.titulo.trim()) || "Sem título";
        addUploadLogToDb(dataUserId, source, deviceNameRef.current, logArtist, logTitle)
          .then(setUploadHistory)
          .catch((e) => console.warn("[MusicaNoAr] history log failed:", e));
      }

      // Force immediate storage sync for Local Source to prevent loss
      if (source === "pasta" && rawXml) {
        syncToStorage(rawXml);
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
              created_at: new Date().toISOString(),
            }, { onConflict: "user_id,musica,artista,dia" });

            // Also ensure the track exists in infomusic so it surfaces under "Músicas sem curiosidades"
            const { data: existingInfo } = await supabase
              .from("infomusic")
              .select("id")
              .eq("user_id", dataUserId)
              .ilike("artista", artista)
              .ilike("musica", titulo)
              .maybeSingle();

            if (!existingInfo) {
              await supabase.from("infomusic").insert({
                user_id: dataUserId,
                artista,
                musica: titulo,
                curiosidade: "",
              });
            }
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
              music_start_time: songStartTime,
              music_current_title: data.titulo,
              music_current_artist: data.artista,
              music_current_cover: data.capa || "",
              music_current_duration: Math.round(data.duracao || 180),
              music_current_curiosity: "",
              music_source_type: source || "pasta",
              music_source_device: deviceNameRef.current,
            };
            await Promise.allSettled(
              candidateUserIds.map(uid => mergeUserDashboardItems(uid, basePatch))
            );

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
              const stillCurrent = localStorage.getItem(MUSIC_START_KEY) === String(songStartTime);
              if (stillCurrent) {
                await Promise.allSettled(
                  candidateUserIds.map(uid => mergeUserDashboardItems(uid, { music_current_curiosity: curData.curiosidade }))
                );
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
  }, [MUSIC_DATA_KEY, MUSIC_START_KEY, dataUserId, candidateUserIds]);

  // Online fetch — always active when URL exists (unified mode)
  const fetchXml = useCallback(async () => {
    if (!isOnlineSelected) return;
    // Se a fonte local estiver ativa no leitor físico, o arquivo local tem soberania absoluta
    if (isLocalReaderActive() && (localMonitoring || isLocalSelected)) return;
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
      try {
        localStorage.setItem("masterview_online_reader_active", Date.now().toString());
      } catch {}

      const parsed = parseXmlString(data.content);
      if (!parsed) {
        // XML is valid but reports no song — mark as stopped and clear
        // the on-air track so the UI doesn't stay stuck on the previous one.
        if (isStoppedXmlPayload(data.content as string)) {
          onlineStoppedRef.current = true;
          if (!isLocalReaderActive()) {
            await clearMusic("online");
          }
        }
        return;
      }

      onlineStoppedRef.current = false;
      // Only defer to local source when online is NOT stopped
      if (isLocalReaderActive()) return;
      await processMusic(parsed, "online", data.content);
    } catch (err: any) {
      onlineFailCountRef.current++;
      if (onlineFailCountRef.current >= 3) {
        setOnlineError(`Erro de rede: ${err?.message || "conexão recusada"}`);
      }
    }
  }, [isLocalReaderActive, localMonitoring, isLocalSelected, xmlUrl, processMusic, clearMusic]);


  // Sync component state from localStorage (useGlobalMusicSync may update it)
  useEffect(() => {
    const syncFromStorage = () => {
      // Se este navegador for o leitor físico ou leitor online ativo, NÃO permitir que mudanças externas de localStorage alterem a música
      const isOnlineActiveOnClient = isOnlineSelected && hasValidOnlineUrl && !onlineError && lastOnlineSuccessRef.current > 0 && (Date.now() - lastOnlineSuccessRef.current < 20000);
      if (isLocalReaderActive() || (fileHandleRef.current && isLocalSelected) || isOnlineActiveOnClient) return;

      const raw = localStorage.getItem(MUSIC_DATA_KEY);
      const startStr = localStorage.getItem(MUSIC_START_KEY);
      if (!raw || !startStr) return;
      try {
        const stored: MusicData = JSON.parse(raw);
        const storedStart = parseInt(startStr, 10);
        // Se a faixa no localStorage for mais antiga do que a faixa que já começou a tocar aqui, não retroceder
        if (startTimeRef.current && storedStart > 0 && storedStart < (startTimeRef.current - 5000)) {
          return;
        }

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
  }, [MUSIC_DATA_KEY, MUSIC_START_KEY, isLocalReaderActive, isOnlineSelected, hasValidOnlineUrl, onlineError, isLocalSelected]);

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
        : (convertToStandardXml(rawText) ?? rawText);


      // Success — reset health trackers
      localFailCountRef.current = 0;
      lastLocalSuccessRef.current = Date.now();
      setLocalDelay(false);
      setLocalError(null);
      setLocalActivating(false);
      setLocalLastReadAt(Date.now());
      try {
        localStorage.setItem("masterview_local_reader_active", Date.now().toString());
      } catch {}

      const parsed = parseXmlString(text);
      if (text === localFileContentRef.current) {
        // O conteúdo do arquivo local NÃO mudou no disco!
        // A última leitura permanece 100% salva e firme sem alternância de registros.
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
        processMusicRef.current(parsed, "pasta", text, file.lastModified);

      } else if (isStoppedXmlPayload(text)) {
        // Automação sem música tocando — limpa o card em vez de manter
        // a última música travada.
        clearMusicRef.current("pasta");
      }

      // Background sync (non-blocking) - already handled above in processMusic if it changed
      // or here if it's a periodic sync
      if (Date.now() - lastStorageSyncAttemptRef.current > 10_000) {
        syncToStorage(text);
      }


    } catch { }
    readingRef.current = false;
  }, [syncToStorage]); // stable deps

  // Reconecta com 1 clique o FileSystemFileHandle salvo no IndexedDB caso a permissão esteja em "prompt"
  const reconnectSavedHandle = useCallback(async () => {
    const handle = savedHandleRef.current || fileHandleRef.current;
    if (!handle) return false;
    try {
      const perm = await (handle as any).requestPermission({ mode: "read" });
      if (perm === "granted") {
        fileHandleRef.current = handle;
        const file = await handle.getFile();
        localFileRef.current = file;
        setLocalFileName(handle.name);
        setLocalMonitoring(true);
        setNeedsFilePermission(false);
        void setSourceMode("pasta");
        setLastSource("pasta");
        lastSourceRef.current = "pasta";
        void readLocalFile();
        return true;
      }
    } catch (err) {
      console.warn("[MusicaNoAr] Permission request failed:", err);
    }
    return false;
  }, [readLocalFile]);

  // Restaura FileSystemFileHandle do IndexedDB para continuar lendo após refresh/navegação
  useEffect(() => {
    let isCancelled = false;
    const restoreHandle = async () => {
      if (!('showOpenFilePicker' in window)) return;
      const keysToTry = [
        dataUserId,
        clientAcc?.slug,
        "current_station",
      ].filter(Boolean) as string[];

      let handle: FileSystemFileHandle | null = null;
      for (const k of keysToTry) {
        handle = await getLocalFileHandle(k);
        if (handle) break;
      }

      if (!handle || isCancelled) return;
      savedHandleRef.current = handle;

      try {
        const perm = await (handle as any).queryPermission({ mode: "read" });
        if (perm === "granted") {
          fileHandleRef.current = handle;
          const file = await handle.getFile();
          if (isCancelled) return;
          localFileRef.current = file;
          setLocalFileName(handle.name);
          setLocalMonitoring(true);
          setNeedsFilePermission(false);
          void readLocalFile();
        } else {
          setLocalFileName(handle.name);
          setNeedsFilePermission(true);
        }
      } catch (err) {
        console.warn("[MusicaNoAr] Error checking handle permission:", err);
      }
    };

    restoreHandle();
    return () => { isCancelled = true; };
  }, [dataUserId, clientAcc?.slug, readLocalFile]);

  // Handle file select
  const handleFileSelect = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    let file: File | null = null;
    let handle: FileSystemFileHandle | null = null;

    if ('showOpenFilePicker' in window && !e) {
      try {
        const pickerTypes = [
          {
            description: 'Arquivos de Automação de Rádio (XML, TXT, LOG)',
            accept: {
              'application/xml': ['.xml'],
              'text/xml': ['.xml'],
              'text/plain': ['.txt', '.log', '.nowplaying'],
              '*/*': ['.xml', '.txt', '.log', '.nowplaying'],
            },
          },
        ];
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
    savedHandleRef.current = handle;
    localFileRef.current = file;
    setLocalFileName(file.name);
    setNeedsFilePermission(false);

    if (handle) {
      if (dataUserId) void saveLocalFileHandle(dataUserId, handle);
      if (clientAcc?.slug) void saveLocalFileHandle(clientAcc.slug, handle);
      void saveLocalFileHandle("current_station", handle);
    }

    // Persist local filename to DB so it survives across computers/sessions
    candidateUserIds.forEach(uid => {
      mergeUserDashboardItems(uid, {
        local_xml_filename: file.name,
      }).catch(() => {});
    });

    void setSourceMode("pasta");
    setLastSource("pasta");
    lastSourceRef.current = "pasta";

    const rawText = await readFileWithEncoding(file);
    const text = isJornalFmTxt(dataUserId, rawText)
      ? (txtToPseudoXml(rawText) ?? rawText)
      : isCulturaFmXml(dataUserId, rawText)
      ? (culturaXmlToPseudoXml(rawText) ?? rawText)
      : (convertToStandardXml(rawText) ?? rawText);
    localFileContentRef.current = text;
    setLocalFileContent(text);

    const parsed = parseXmlString(text);
    if (parsed) await processMusic(parsed, "pasta", text, file.lastModified);

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

  // Remote storage polling via Worker (para máquinas secundárias sem arquivo físico)
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !dataUserId) return;
    if (fileHandleRef.current || localFileRef.current) return;

    const pollStorage = async () => {
      // Este computador virou leitor físico (ou leitor online ativo) enquanto o
      // polling estava rodando: nunca sobrescrever a própria leitura com o
      // arquivo remoto, senão a tela alterna entre a faixa atual e uma antiga.
      if (isPhysicalLocalReader()) return;
      try {
        // Ler somente o arquivo sincronizado pelo leitor no Storage.
        // (O antigo caminho estático /xml/<slug>/local.xml podia estar congelado
        // com uma faixa antiga e era a causa da alternância.)
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
          const lastModHeader = res.headers.get("last-modified");
          const fileModifiedAt = lastModHeader ? new Date(lastModHeader).getTime() : undefined;
          const text = await res.text();
          if (!text) continue;
          if (text === localFileContentRef.current) return;
          // Guarda de recência: não voltar para uma leitura mais antiga do que a já aplicada.
          if (fileModifiedAt && appliedStartRef.current > 0 && fileModifiedAt < appliedStartRef.current - 5000) return;
          localFileContentRef.current = text;
          setLocalFileContent(text);
          lastLocalSuccessRef.current = Date.now();
          setLocalDelay(false);
          setLocalError(null);
          setLocalActivating(false);
          const parsed = parseXmlString(text);
          if (parsed) processMusicRef.current(parsed, "pasta", text, fileModifiedAt);
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
  }, [dataUserId, clientAcc?.slug]);

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

  // Keep startTime in a ref to avoid resetting timer interval on every state update
  const startTimeRef = useRef<number | null>(startTime);
  startTimeRef.current = startTime;
  const musicRef = useRef<MusicData | null>(music);
  musicRef.current = music;

  // Real-time ticking interval that continuously advances elapsed and progress
  useEffect(() => {
    if (!music || !music.duracao || music.duracao <= 0) return;

    let st = startTimeRef.current;
    if (!st || st <= 0) {
      const storedVal = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
      if (storedVal > 0) {
        st = storedVal;
      } else {
        st = Date.now() - Math.max(0, elapsed) * 1000;
        try {
          localStorage.setItem(MUSIC_START_KEY, st.toString());
        } catch {}
      }
      startTimeRef.current = st;
      setStartTime(st);
    }

    const tick = () => {
      // Re-read latest start time if available
      const rawStart = localStorage.getItem(MUSIC_START_KEY);
      const activeStart = (rawStart && parseInt(rawStart, 10)) || startTimeRef.current;
      const currentMusic = musicRef.current;
      if (!activeStart || !currentMusic || !currentMusic.duracao) return;
      const el = (Date.now() - activeStart) / 1000;
      setElapsed(Math.min(currentMusic.duracao, Math.max(0, el)));
    };

    tick();
    const timerId = setInterval(tick, 200);
    return () => clearInterval(timerId);
  }, [music?.titulo, music?.artista, music?.duracao, MUSIC_START_KEY]);


  // Sincronização contínua com o banco de dados (lê o que o cliente na rádio salva em tempo real)
  useEffect(() => {
    // Carregar dados locais iniciais se disponíveis
    const stored = getMusicData(dataUserId || undefined);
    if (stored) {
      setMusic(stored.music);
      let st = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
      if (!st || isNaN(st) || st <= 0) {
        st = Date.now() - Math.max(0, stored.elapsed) * 1000;
        try {
          localStorage.setItem(MUSIC_START_KEY, st.toString());
        } catch {}
      }
      setStartTime(st);
      setElapsed(stored.elapsed);
    }

    if (!dataUserId && candidateUserIds.length === 0) return;
    let isCancelled = false;

    const sanitizeTrackInfo = (rawMusica: string, rawArtista: string) => {
      let t = (rawMusica || "").trim();
      let a = (rawArtista || "").trim();

      // Remove prefixos como !SB - (standby)
      if (t.toUpperCase().startsWith("!SB - ")) {
        t = t.replace(/^!SB\s*-\s*/i, "").trim();
      }

      // Se o artista for genérico como STANDBY'S ou vazio e o título tiver " - ", separar Artista - Título
      if ((a.toUpperCase().includes("STANDBY") || !a) && t.includes(" - ")) {
        const parts = t.split(" - ");
        a = parts[0].trim();
        t = parts.slice(1).join(" - ").trim();
      }

      // Repair values previously persisted from a container XML node, where
      // the title became "artist title" while the artist field stayed empty.
      if (a && t.toLowerCase().startsWith(`${a.toLowerCase()} `)) {
        t = t.slice(a.length).trim();
      }

      return { titulo: t, artista: a || "Desconhecido" };
    };

    const syncFromDatabase = async () => {
      // Apenas computadores secundários sincronizam do banco.
      // Computador com leitor local físico em disco OU leitor online ativo nunca deve sobrescrever a própria leitura.
      const isOnlineActiveOnClient = isOnlineSelected && hasValidOnlineUrl && !onlineError && lastOnlineSuccessRef.current > 0 && (Date.now() - lastOnlineSuccessRef.current < 20000);
      if (isLocalReaderActive() || (fileHandleRef.current && isLocalSelected) || isOnlineActiveOnClient) return;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {

      // The effective account is the single source of truth. Mixing the
      // sub-user, parent and authenticated IDs made older tracks alternate.
      const targetIds = dataUserId ? [dataUserId] : [];

      // Escolher SEMPRE a leitura mais recente entre todos os candidatos.
      // Antes, o primeiro candidato com qualquer título vencia, o que fazia a tela
      // alternar entre leituras diferentes (ex.: "sem reprodução", leitura antiga e a atual).
      const isPlaceholderTitle = (t: string) =>
        !t || t === "sem título" || t === "sem titulo" || t === "aguardando leitura..." || t === "sem reprodução" || t === "sem reproducao";

      let freshest: { uid: string; di: Record<string, any>; start: number } | null = null;
      for (const uid of targetIds) {
        if (isCancelled) return;
        try {
          const { data: s } = await supabase
            .from("user_settings")
            .select("dashboard_items")
            .eq("user_id", uid)
            .maybeSingle();
          if (isCancelled) return;
          const d = (s?.dashboard_items || {}) as Record<string, any>;
          const t = (d.music_current_title || "").toString().trim().toLowerCase();
          if (isPlaceholderTitle(t)) continue;
          const st = typeof d.music_start_time === "number" && d.music_start_time > 0 ? d.music_start_time : 0;
          if (!freshest || st > freshest.start) freshest = { uid, di: d, start: st };
        } catch {}
      }

      for (const uid of freshest ? [freshest.uid] : targetIds) {
        if (isCancelled) return;
        try {
          // 1. Usar a leitura mais recente de user_settings (dashboard_items)
          const di = (freshest && uid === freshest.uid ? freshest.di : {}) as Record<string, any>;
          const dbTitle = (di.music_current_title || "").toString().trim();
          const dbArtist = (di.music_current_artist || "").toString().trim();
          const dbCover = (di.music_current_cover || "").toString();
          const dbStart = typeof di.music_start_time === "number" && di.music_start_time > 0 ? di.music_start_time : null;
          const dbDuracao = typeof di.music_current_duration === "number" && di.music_current_duration > 0
            ? di.music_current_duration
            : (typeof di.music_current_duracao === "number" && di.music_current_duracao > 0 ? di.music_current_duracao : 180);

          if (dbTitle && dbTitle.toLowerCase() !== "sem título" && dbTitle.toLowerCase() !== "sem titulo" && dbTitle.toLowerCase() !== "aguardando leitura...") {
            const { titulo: cleanT, artista: cleanA } = sanitizeTrackInfo(dbTitle, dbArtist);
            
            // Verificar se esta música já é a que está tocando no estado ou no localStorage
            const isSameTrack = (musicRef.current &&
              musicRef.current.titulo?.trim().toLowerCase() === cleanT.toLowerCase() &&
              musicRef.current.artista?.trim().toLowerCase() === cleanA.toLowerCase());

            // Se for uma música diferente, verificar se o registro do banco não é mais antigo que a música já tocando localmente
            if (!isSameTrack && dbStart && !canApplyReading(dbStart)) {
              // O banco está defasado em relação à faixa já ativa — não alternar para trás
              return;
            }
            if (!isSameTrack && dbStart) {
              appliedStartRef.current = Math.max(appliedStartRef.current, dbStart);
            }

            let resolvedStart = dbStart;
            if (isSameTrack && startTimeRef.current && startTimeRef.current > 0) {
              resolvedStart = startTimeRef.current;
            } else if (isSameTrack) {
              const lsStart = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
              if (lsStart > 0) resolvedStart = lsStart;
            }

            if (!resolvedStart || resolvedStart <= 0) {
              resolvedStart = Date.now();
            }

            const now = Date.now();
            const el = Math.max(0, (now - resolvedStart) / 1000);

            const activeSrc: "online" | "pasta" = di.music_source === "online" ? "online" : "pasta";
            setLastSource(activeSrc);
            lastSourceRef.current = activeSrc;

            setMusic((prev) => {
              const activeCapa = dbCover || (prev?.titulo === cleanT && prev?.capa ? prev.capa : "");

              if (!activeCapa) {
                fetchCoverFromiTunes(cleanT, cleanA).then((cov) => {
                  if (cov) {
                    setMusic((m) => (m && m.titulo === cleanT ? { ...m, capa: cov } : m));
                    candidateUserIds.forEach((cuid) => {
                      mergeUserDashboardItems(cuid, { music_current_cover: cov }).catch(() => {});
                    });
                    try {
                      const currRaw = localStorage.getItem(MUSIC_DATA_KEY);
                      if (currRaw) {
                        const parsed = JSON.parse(currRaw);
                        if (parsed.titulo === cleanT) {
                          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...parsed, capa: cov }));
                        }
                      }
                    } catch {}
                  }
                }).catch(() => {});
              }

              if (prev?.titulo === cleanT && prev?.artista === cleanA) {
                if (dbCover && prev.capa !== dbCover) {
                  return { ...prev, capa: dbCover };
                }
                return prev;
              }

              return {
                titulo: cleanT,
                artista: cleanA,
                duracao: dbDuracao,
                capa: activeCapa,
              };
            });

            // NÃO reiniciar contagem se a faixa já estiver tocando, mas manter elapsed sincronizado
            if (!isSameTrack || !startTimeRef.current) {
              setStartTime(resolvedStart);
              setElapsed(Math.min(dbDuracao, el));
            } else {
              setElapsed(Math.min(dbDuracao, el));
            }

            try {
              localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({
                titulo: cleanT,
                artista: cleanA,
                duracao: dbDuracao,
                capa: dbCover,
              }));
              localStorage.setItem(MUSIC_START_KEY, resolvedStart.toString());
            } catch {}
            return;
          }

          // 2. Se dashboard_items não tiver a música, buscar de musicas_tocadas SOMENTE se não houver faixa ativa tocando

          // Neste computador a leitura do arquivo está acontecendo: a música exibida deve ser
          // sempre a que o arquivo indica. NUNCA voltar para o histórico (causava alternância
          // entre o último registro e a música no ar).
          if (isPhysicalLocalReader()) return;

          // Já aplicamos uma leitura válida do leitor: não voltar para o histórico.
          if (appliedStartRef.current > 0) return;

          const hasActiveTrackAlready = Boolean(
            musicRef.current &&
            musicRef.current.titulo &&
            musicRef.current.titulo.toLowerCase() !== "sem título" &&
            startTimeRef.current
          );

          // Se já estamos exibindo uma faixa válida, NUNCA consultar histórico de musicas_tocadas
          if (hasActiveTrackAlready) return;

          const { data: lastPlayed } = await supabase
            .from("musicas_tocadas")
            .select("musica, artista, horario, dia, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (isCancelled) return;

          let trackTitle = (lastPlayed?.musica || "").trim();
          let trackArtist = (lastPlayed?.artista || "").trim();

          let edgeTop: any = null;
          if (!trackTitle) {
            try {
              const edgeResp = await fetch(
                `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/public-music-history?user_id=${encodeURIComponent(uid)}&limit=3`,
                {
                  headers: {
                    apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  },
                }
              );
              const edgeJson = await edgeResp.json();
              if (edgeJson?.ok && Array.isArray(edgeJson.items) && edgeJson.items.length > 0) {
                edgeTop = edgeJson.items[0];
                trackTitle = (edgeTop.musica || "").trim();
                trackArtist = (edgeTop.artista || "").trim();
              }
            } catch (edgeErr) {
              // fallback silent
            }
          }

          if (trackTitle && trackTitle.toLowerCase() !== "sem título" && trackTitle.toLowerCase() !== "sem titulo" && trackTitle.toLowerCase() !== "aguardando leitura...") {
            const { titulo: cleanT, artista: cleanA } = sanitizeTrackInfo(trackTitle, trackArtist);

            const isSameTrack = (musicRef.current &&
              musicRef.current.titulo?.trim().toLowerCase() === cleanT.toLowerCase() &&
              musicRef.current.artista?.trim().toLowerCase() === cleanA.toLowerCase());

            let trackStartTime = parseHorarioToTimestamp(lastPlayed?.horario || edgeTop?.horario);
            if (!trackStartTime && (lastPlayed?.created_at || edgeTop?.created_at)) {
              trackStartTime = new Date(lastPlayed?.created_at || edgeTop?.created_at).getTime();
            }
            if (isSameTrack && startTimeRef.current && startTimeRef.current > 0) {
              trackStartTime = startTimeRef.current;
            }
            if (!trackStartTime || trackStartTime <= 0) {
              trackStartTime = Date.now();
            }

            // Se o histórico for mais antigo que o início do que já está na tela, não retroceder
            if (startTimeRef.current && trackStartTime < (startTimeRef.current - 10000)) {
              return;
            }

            const now = Date.now();
            const el = Math.max(0, (now - trackStartTime) / 1000);

            const activeSrc = isOnlineSelected ? "online" : "pasta";
            setLastSource(activeSrc);
            lastSourceRef.current = activeSrc;

            setMusic((prev) => {
              const currentCapa = (prev?.titulo === cleanT && prev?.capa) ? prev.capa : "";
              // Buscar capa do Deezer / iTunes em background se ainda não existir
              if (!currentCapa) {
                fetchCoverFromiTunes(cleanT, cleanA).then((cov) => {
                  if (cov) {
                    setMusic((m) => (m && m.titulo === cleanT ? { ...m, capa: cov } : m));
                    candidateUserIds.forEach((cuid) => {
                      mergeUserDashboardItems(cuid, { music_current_cover: cov }).catch(() => {});
                    });
                    try {
                      const currRaw = localStorage.getItem(MUSIC_DATA_KEY);
                      if (currRaw) {
                        const parsed = JSON.parse(currRaw);
                        if (parsed.titulo === cleanT) {
                          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...parsed, capa: cov }));
                        }
                      }
                    } catch {}
                  }
                }).catch(() => {});
              }

              if (prev?.titulo === cleanT && prev?.artista === cleanA) {
                return prev;
              }

              return {
                titulo: cleanT,
                artista: cleanA,
                duracao: 180,
                capa: currentCapa,
              };
            });

            if (!isSameTrack || !startTimeRef.current) {
              setStartTime(trackStartTime);
              setElapsed(Math.min(180, el));
            } else {
              setElapsed(Math.min(180, el));
            }

            try {
              const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
              let existingCapa = "";
              if (prevRaw) {
                try {
                  const p = JSON.parse(prevRaw);
                  if (p.titulo === cleanT && p.capa) existingCapa = p.capa;
                } catch {}
              }
              localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({
                titulo: cleanT,
                artista: cleanA,
                duracao: 180,
                capa: existingCapa,
              }));
              localStorage.setItem(MUSIC_START_KEY, trackStartTime.toString());
            } catch {}
            return;
          }
        } catch (err) {
          console.warn(`[MusicaNoAr] Erro ao sincronizar para o uid ${uid}:`, err);
        }
      }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    // Leitura inicial imediata
    syncFromDatabase();

    // Supabase Realtime: escutar atualizações instantâneas de user_settings e musicas_tocadas para todos os candidatos
    const channels = candidateUserIds.map((uid) =>
      supabase
        .channel(`musica-no-ar-realtime-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_settings",
            filter: `user_id=eq.${uid}`,
          },
          () => {
            syncFromDatabase();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "musicas_tocadas",
            filter: `user_id=eq.${uid}`,
          },
          () => {
            syncFromDatabase();
          }
        )
        .subscribe()
    );

    // Polling a cada 2.5s para garantir consistência caso haja latência de rede
    const pollInterval = setInterval(syncFromDatabase, 2500);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [dataUserId, JSON.stringify(candidateUserIds), MUSIC_DATA_KEY, MUSIC_START_KEY, isLocalReaderActive]);

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
    if (ageSec < 10) return { key: "lendo", label: "LENDO", bg: "#eef2ff", fg: "#0055ff", border: "#c7d2fe", pulse: true };
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

  const toggleLocalSource = async () => {
    if (needsFilePermission && savedHandleRef.current) {
      const ok = await reconnectSavedHandle();
      if (ok) return;
    }
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

  const matchedException = matchesMusicException(allExceptions, music?.artista, music?.titulo);
  const isPlayingSong = !!(
    music &&
    music.titulo &&
    music.titulo.trim() !== "" &&
    music.titulo.toLowerCase() !== "sem título" &&
    music.titulo.toLowerCase() !== "sem titulo" &&
    music.titulo.toLowerCase() !== "aguardando leitura..."
  );

  const useFallback = !isBreak && !isPlayingSong && presenterFallback;
  
  const displayTitulo = isBreak
    ? "Intervalo"
    : (isPlayingSong
      ? music!.titulo
      : (presenterFallback ? presenterFallback.nome : (music?.titulo || "Aguardando leitura...")));

  const displayArtista = isBreak
    ? ""
    : (isPlayingSong
      ? music!.artista
      : (presenterFallback ? "no ar agora" : (music?.artista || "Interprete")));

  const displayCover = isBreak
    ? null
    : (matchedException?.artista_url || matchedException?.capa_url || music?.capa || (presenterFallback ? presenterFallback.foto : null));

  // Nexo Form palette (House Mix Modern Standard)
  const NEXO_DARK = "#002132";
  const NEXO_CYAN = "#0055ff";
  const NEXO_CARD_BG = "#ffffff";
  const NEXO_LIME = "#0055ff";
  const NEXO_LIGHT_BLUE = "#f8fafc";

  // Paleta extraída da capa para gradiente elegante do box de música
  const coverPalette = useCoverPalette(displayCover || null);
  const paletteContrast = getPaletteContrast(coverPalette);
  
  // Persist background to avoid "blinking" while new palette is extracted
  const lastValidBgRef = useRef(NEXO_DARK);
  
  // Gradiente elegante pegando dois pontos de cores da imagem da capa
  const musicBoxBg = coverPalette
    ? `linear-gradient(135deg, ${coverPalette.primary} 0%, ${coverPalette.secondary} 100%)`
    : lastValidBgRef.current;

  useEffect(() => {
    if (coverPalette) {
      lastValidBgRef.current = `linear-gradient(135deg, ${coverPalette.primary} 0%, ${coverPalette.secondary} 100%)`;
    }
  }, [coverPalette]);

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



  const bothActive = isOnlineSelected && isLocalSelected;

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      <input ref={fileInputRef} type="file" accept=".xml,.txt,.log,.nowplaying,application/xml,text/xml,text/plain,*/*" onChange={handleFileSelect} className="hidden" />

      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Música no Ar
      </div>
      <div className="animate-fade-in space-y-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* ═══ MAIN MUSIC CARD ═══ */}
      <section
        className="relative space-y-5 rounded-3xl p-6 sm:p-7 transition-all"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        }}
      >
        {/* Header matching the design system of all other sections */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: "#0055ff" }} />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-50 shadow-xs">
                <Radio size={18} style={{ color: "#0055ff" }} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter m-0" style={{ color: "#002132" }}>
                  MÚSICA NO AR
                </h3>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  Sincronização e Monitoramento em Tempo Real
                </span>
              </div>
            </div>
          </div>

          {/* Header Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {bothActive && (
              <span
                className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-xs"
                style={{ backgroundColor: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#22c55e" }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#22c55e" }} />
                </span>
                Dual Ativo
              </span>
            )}

            {/* Source Indicator */}
            <span
              className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-xs"
              style={{
                backgroundColor: lastSource ? "#eff6ff" : "#F1F5F9",
                color: lastSource ? "#0055ff" : "#94A3B8",
                border: lastSource ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
              }}
            >
              {lastSource === "pasta" ? <FolderOpen size={10} /> : lastSource === "online" ? <Globe size={10} /> : null}
              {lastSource === "pasta" ? "Local ativo" : lastSource === "online" ? "Online ativo" : "Aguardando"}
            </span>

            {/* Status badge: No Ar Agora / Intervalo / Aguardando */}
            <span
              className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-xs"
              style={{
                backgroundColor: isBreak ? "#fef2f2" : (music && music.titulo) ? "rgba(38, 143, 250, 0.1)" : "#f8fafc",
                color: isBreak ? "#ef4444" : (music && music.titulo) ? "#0055ff" : "#64748b",
                border: `1px solid ${isBreak ? "#fecaca" : (music && music.titulo) ? "rgba(38, 143, 250, 0.3)" : "#e2e8f0"}`,
              }}
            >
              <span className="relative flex h-2 w-2">
                {isBreak ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                ) : (music && music.titulo) ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0055ff] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0055ff]" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
                )}
              </span>
              {isBreak ? "Intervalo Comercial" : (music && music.titulo) ? "No Ar Agora" : "Standby"}
            </span>

            {onlineError && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 shadow-xs">
                <AlertTriangle size={10} className="shrink-0" /> Online: erro
              </span>
            )}
            {!onlineError && onlineDelay && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
                <AlertTriangle size={10} className="shrink-0" /> Online: sem resposta +30s
              </span>
            )}
            {localError && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 shadow-xs">
                <AlertTriangle size={10} className="shrink-0" /> Local: erro
              </span>
            )}
          </div>
        </div>

        {/* Player card */}
        <div data-nexo-skip="" className="w-full">
          <div
            data-nexo-skip=""
            key={`${displayTitulo}-${displayArtista}`}
            className="rounded-3xl overflow-hidden relative transition-all duration-700 shadow-xl"
            style={{
              background: "linear-gradient(135deg, #0055ff 0%, #003399 28%, #001f5c 55%, #000d26 80%, #000000 100%)",
              border: "1px solid rgba(0, 85, 255, 0.35)",
              boxShadow: "0 20px 40px -15px rgba(0, 85, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
              minHeight: "170px",
            }}
          >
            {/* Dynamic ambient color glow from album cover & Nexo brand */}
            <div
              className="absolute inset-0 pointer-events-none transition-all duration-1000"
              style={{
                background: coverPalette
                  ? `radial-gradient(circle at 15% 50%, ${coverPalette.primary}38 0%, transparent 65%), radial-gradient(circle at 85% 20%, #0055ff30 0%, transparent 60%)`
                  : "radial-gradient(circle at 15% 50%, rgba(38,143,250,0.22) 0%, transparent 65%), radial-gradient(circle at 85% 20%, rgba(0,85,255,0.25) 0%, transparent 60%)",
              }}
            />

            {/* Subtle glass reflection overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 40%, rgba(0, 0, 0, 0.35) 100%)",
                zIndex: 1,
              }}
            />

            <div className="relative z-10 p-5 sm:p-7 flex flex-col lg:flex-row gap-6 items-center justify-between">
              {/* Left Column: Cover + Info + Progress */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 min-w-0 flex-1 w-full">
                {/* Cover image container */}
                <div
                  className="relative w-28 h-28 sm:w-36 sm:h-36 shrink-0 overflow-hidden rounded-2xl bg-black/40 shadow-2xl transition-all duration-300"
                  style={{
                    border: "2px solid rgba(255, 255, 255, 0.2)",
                    boxShadow: "0 12px 28px -6px rgba(0, 0, 0, 0.7), 0 0 20px rgba(38, 143, 250, 0.15)",
                  }}
                >
                  {loadingCover && !isBreak && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 backdrop-blur-xs">
                      <Loader2 className="animate-spin" size={26} style={{ color: "#38bdf8" }} />
                    </div>
                  )}
                  {isBreak ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-rose-800 text-white p-2 text-center">
                      <span className="font-black text-xs sm:text-sm tracking-widest uppercase drop-shadow">Intervalo</span>
                      <span className="text-[9px] font-semibold text-white/80 mt-1 uppercase">Comercial</span>
                    </div>
                  ) : displayCover ? (
                    <>
                      <img
                        key={displayCover}
                        src={displayCover}
                        alt="Capa"
                        className="nexo-cover-anim object-cover w-full h-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-white/10 to-white/5 text-white/50">
                      <Disc size={34} className="text-[#38bdf8]/70" />
                      <span className="italic text-[10px] font-medium tracking-wider uppercase text-white/60">
                        {music ? "Sem capa" : "Aguardando..."}
                      </span>
                    </div>
                  )}

                  {/* Live badge overlay on cover */}
                  {music && music.titulo && !isBreak && (
                    <div className="absolute bottom-2 left-2 right-2 flex justify-center z-10 pointer-events-none">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#22c55e]" />
                        </span>
                        Ao Vivo
                      </span>
                    </div>
                  )}
                </div>

                {/* Song Info & Progress */}
                <div className="flex-1 flex flex-col justify-center min-w-0 w-full gap-3 text-center sm:text-left">
                  <div className="space-y-1.5">
                    {/* Top subtle category / on-air tracker */}
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-1.5 drop-shadow-sm" style={{ color: "#ffffff" }}>
                        <Radio size={12} className={music && music.titulo && !isBreak ? "animate-pulse" : ""} style={{ color: "#ffffff" }} />
                        {isBreak ? "Intervalo" : (music && music.titulo) ? "Em Execução" : "Aguardando Programação"}
                      </span>
                    </div>

                    {/* Title */}
                    <div
                      className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight truncate"
                      style={{ color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}
                      title={displayTitulo}
                    >
                      {displayTitulo}
                    </div>

                    {/* Artist & Badges */}
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-black px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-xs max-w-full" style={{ color: "#ffffff" }}>
                        <User size={13} className="text-[#38bdf8] shrink-0" />
                        <span className="truncate max-w-[260px] sm:max-w-[380px] font-extrabold" style={{ color: "#ffffff" }}>{displayArtista}</span>
                      </span>

                      {lastSource && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
                          {lastSource === "pasta" ? <FolderOpen size={11} className="text-[#38bdf8]" /> : <Globe size={11} className="text-[#38bdf8]" />}
                          <span>{lastSource === "pasta" ? "Local" : "Online"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Computadores que não são o leitor: apenas informações salvas (música, artista e capa) */}
                  {!isReaderMachine() && (remoteReaderDevice || localFileName) && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider self-center sm:self-start" style={{ color: "rgba(255,255,255,0.8)" }}>
                      <FolderOpen size={11} className="text-[#38bdf8]" />
                      <span className="truncate max-w-[260px]">Leitura em: {remoteReaderDevice || localFileName}</span>
                    </div>
                  )}

                  {/* Barra de progresso: computador leitor (arquivo local OU link online) */}
                  {music && music.duracao > 0 && isReaderMachine() && (
                    <div className="space-y-1.5 mt-1.5 w-full max-w-xl">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="flex items-center gap-1.5 drop-shadow-sm" style={{ color: "#ffffff" }}>
                          <Clock size={13} style={{ color: "#ffffff" }} />
                          <span className="font-black text-sm tracking-wide" style={{ color: "#ffffff" }}>{formatTime(elapsed)}</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold tracking-widest uppercase drop-shadow-sm" style={{ color: "rgba(255, 255, 255, 0.75)" }}>
                          Restante -{formatTime(Math.max(0, music.duracao - elapsed))}
                        </span>
                        <span className="font-black text-sm tracking-wide drop-shadow-sm" style={{ color: "#ffffff" }}>
                          {formatTime(music.duracao)}
                        </span>
                      </div>

                      {/* Track with luminous fill */}
                      <div className="w-full h-2.5 rounded-full overflow-hidden bg-black/50 border border-white/15 relative shadow-inner">
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{
                            width: `${Math.max(1, Math.min(100, (elapsed / music.duracao) * 100))}%`,
                            background: "linear-gradient(90deg, #003db8 0%, #0055ff 55%, #268ffa 100%)",
                            boxShadow: "0 0 14px rgba(0, 85, 255, 0.85)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Aurora Gradient Box */}
              <div className="hidden lg:flex flex-col items-center justify-center shrink-0 pl-6 border-l border-white/15">
                {/* Aurora Animated Gradient Container */}
                <div
                  className="relative flex items-center justify-center h-16 w-56 px-3.5 py-1.5 rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(0, 15, 28, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  {/* Organic Aurora Cloud Light Drift */}
                  <div
                    className="absolute -inset-3 pointer-events-none aurora-glow-bg"
                    style={{
                      background: "radial-gradient(circle at 60% 40%, rgba(0, 85, 255, 0.85) 0%, rgba(56, 189, 248, 0.65) 45%, rgba(0, 230, 150, 0.55) 75%, transparent 100%)",
                      filter: "blur(10px)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ═══ COLLAPSIBLE CONFIG SECTION ═══ */}
      <section
        className="group/config relative space-y-5 rounded-3xl p-6 transition-all"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div
          className="flex items-center justify-between mb-2 cursor-pointer group"
          onClick={() => setShowConfig(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: "#0055ff" }} />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-50">
                <Settings size={18} style={{ color: "#0055ff" }} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter m-0" style={{ color: "#002132" }}>
                  CONFIGURAÇÃO DAS ORIGENS
                </h3>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  XML Online, Pasta Local e Sincronização
                </span>
              </div>
            </div>
            <div className="ml-2 transition-transform duration-200" style={{ transform: showConfig ? "rotate(180deg)" : "rotate(0deg)", color: "#002132" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span
              className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider"
              style={{ backgroundColor: lastSource ? "#eff6ff" : "#F1F5F9", color: lastSource ? "#0055ff" : "#94A3B8" }}
            >
              {lastSource === "pasta" ? "Local ativo" : lastSource === "online" ? "Online ativo" : "Aguardando"}
            </span>
            {showConfig && (
              <button
                className="h-8 w-8 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/5"
                onClick={() => setShowConfig(false)}
                title="Fechar seção"
              >
                <ChevronUp size={16} />
              </button>
            )}
          </div>
        </div>

        {showConfig && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch relative">
                {/* ── ONLINE SOURCE ── */}
                <div 
                  className={`rounded-3xl p-7 space-y-6 relative overflow-hidden transition-all duration-300 group/source ${isOnlineSelected ? "nexo-source-active" : ""}`}
                  style={{ 
                    background: "#ffffff", 
                    border: `2px solid ${isOnlineSelected ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
                    boxShadow: isOnlineSelected ? "0 8px 30px rgba(0, 85, 255, 0.12)" : "0 2px 12px rgba(0,0,0,0.02)",
                  }}
                >

                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300" 
                      style={{ 
                        background: isOnlineSelected ? "#0055ff" : "#f1f5f9",
                      }}
                    >
                      <Globe size={22} style={{ color: isOnlineSelected ? "#ffffff" : "#64748b" }} />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-black uppercase tracking-[0.2em] m-0" style={{ color: "#002132" }}>
                        Origem Online
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronização via XML</span>
                    </div>
                  </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">URL do Feed XML</label>
                    <div className="flex items-center gap-3 p-1 rounded-full bg-[#f8fafc] border border-slate-200">
                      <div className="pl-4">
                        <Globe size={16} className="text-slate-400" />
                      </div>
                      <input
                        value={xmlUrl}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setXmlUrl(nextValue);
                          if (!nextValue.trim() || isValidXmlUrl(nextValue)) {
                            setOnlineError(null);
                          }
                        }}
                        className="flex-1 py-2 text-xs font-semibold outline-none bg-transparent"
                        style={{ color: "#002132" }}
                        placeholder="https://exemplo.com/feed.xml"
                      />
                      <button 
                        onClick={() => void saveUrl(xmlUrl)} 
                        className="h-10 px-6 rounded-full flex items-center justify-center font-bold text-xs uppercase tracking-widest transition-all hover:brightness-110 shadow-xs" 
                        style={{ backgroundColor: "#0055ff", color: "#FFFFFF" }}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleOnlineSource}
                    disabled={!hasValidOnlineUrl}
                    className="w-full h-12 flex items-center justify-center gap-2.5 px-6 rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all hover:brightness-105"
                    style={{
                      backgroundColor: isOnlineSelected ? "#0055ff" : "#f8fafc",
                      color: isOnlineSelected ? "#FFFFFF" : "#002132",
                      border: `1px solid ${isOnlineSelected ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
                    }}
                  >
                    {onlineActivating ? <Loader2 size={16} className="animate-spin" /> : isOnlineSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    {onlineActivating ? "Sincronizando..." : isOnlineSelected ? "Ativo" : "Ativar"}
                  </button>
                </div>
              </div>

              {/* ── LOCAL SOURCE (Pasta) ── */}
              <div 
                className={`rounded-3xl p-7 space-y-6 relative overflow-hidden transition-all duration-300 group/source-local ${isLocalSelected ? "nexo-source-active" : ""}`}
                style={{ 
                  background: "#ffffff", 
                  border: `2px solid ${isLocalSelected ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
                  boxShadow: isLocalSelected ? "0 8px 30px rgba(0, 85, 255, 0.12)" : "0 2px 12px rgba(0,0,0,0.02)",
                }}
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300" 
                    style={{ 
                      background: isLocalSelected ? "#0055ff" : "#f1f5f9",
                    }}
                  >
                    <FolderOpen size={22} style={{ color: isLocalSelected ? "#ffffff" : "#64748b" }} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[14px] font-black uppercase tracking-[0.2em] m-0" style={{ color: "#002132" }}>
                      Origem Local
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Leitura de Arquivo Local</span>
                  </div>
                  
                  {/* Device Name inside Local Source Box */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 border border-slate-200 shadow-xs">
                    <Monitor size={12} className="text-slate-400" />
                    {editingDeviceName ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={deviceNameInput}
                          onChange={e => setDeviceNameInput(e.target.value)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold outline-none bg-slate-50"
                          style={{ color: "#002132", width: 100 }}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const v = deviceNameInput.trim() || deriveDeviceName();
                              localStorage.setItem(DEVICE_NAME_KEY, v);
                              setCurrentDeviceName(v);
                              setEditingDeviceName(false);
                            }
                          }}
                        />
                        <button onClick={() => {
                          const v = deviceNameInput.trim() || deriveDeviceName();
                          localStorage.setItem(DEVICE_NAME_KEY, v);
                          setCurrentDeviceName(v);
                          setEditingDeviceName(false);
                        }} className="text-green-600"><Check size={12} /></button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setDeviceNameInput(currentDeviceName); setEditingDeviceName(true); }} 
                        className="text-[10px] font-bold uppercase tracking-wider hover:text-blue-600 transition-colors"
                        style={{ color: "#002132" }}
                      >
                        {currentDeviceName}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Arquivo XML ou TXT</label>
                    <div className="flex items-center gap-3 p-1 rounded-full bg-[#f8fafc] border border-slate-200">
                      <div className="pl-4">
                        <FolderOpen size={16} className="text-slate-400" />
                      </div>
                      <div className="flex-1 py-2 text-xs font-semibold truncate" style={{ color: "#002132" }}>
                        {localFileName || <span className="text-slate-400 font-medium italic">Selecione o arquivo...</span>}
                      </div>
                      <button
                        onClick={() => {
                          if ('showOpenFilePicker' in window) {
                            handleFileSelect();
                          } else {
                            fileInputRef.current?.click();
                          }
                        }}
                        className="h-10 px-6 rounded-full flex items-center justify-center font-bold text-xs uppercase tracking-widest transition-all hover:brightness-110 shadow-xs"
                        style={{ backgroundColor: "#0055ff", color: "#FFFFFF" }}
                      >
                        <Upload size={14} className="mr-2" />
                        Arquivo
                      </button>
                    </div>
                  </div>

                  {needsFilePermission && (
                    <button
                      type="button"
                      onClick={reconnectSavedHandle}
                      className="w-full py-2.5 px-4 rounded-full flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-wider transition-all bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                    >
                      <Radio size={14} className="animate-pulse" />
                      Reconectar Leitura Local (Clique para autorizar)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleLocalSource}
                    disabled={!hasValidLocalSource}
                    className="w-full h-12 flex items-center justify-center gap-2.5 px-6 rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all hover:brightness-105"
                    style={{
                      backgroundColor: isLocalSelected ? "#0055ff" : "#f8fafc",
                      color: isLocalSelected ? "#FFFFFF" : "#002132",
                      border: `1px solid ${isLocalSelected ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
                    }}
                  >
                    {localActivating ? <Loader2 size={16} className="animate-spin" /> : isLocalSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    {localActivating ? "Sincronizando..." : isLocalSelected ? "Ativo" : "Ativar"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
              <div className="space-y-6">


                {/* Status indicators */}
                {(localLastReadAt || localActivating || localError || localDelay) && (() => {
                  const st = buildStatus({ selected: isLocalSelected && localMonitoring, activating: localActivating, error: localError, lastReadAt: localLastReadAt, hasSource: !!localFileName, delayed: !!localDelay });
                  const ago = formatAgo(localLastReadAt);
                  return (
                    <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl" style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {st.key === "ativando" || st.key === "atrasado" ? (
                          <Loader2 size={14} className="animate-spin shrink-0" />
                        ) : (
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            {st.pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: st.fg }} />}
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: st.fg }} />
                          </span>
                        )}
                        <span className="text-[12px] font-black tracking-widest uppercase truncate">{st.label}</span>
                      </div>
                      {ago && st.key !== "inativa" && st.key !== "erro" && (
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 shrink-0">{ago}</span>
                      )}
                    </div>
                  );
                })()}

                {localError && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertTriangle size={14} />
                    <span>{localError}</span>
                  </div>
                )}

                {/* Local monitor indicator inside the box for visual feedback */}
                {localMonitoring && (
                  <div className="absolute bottom-2 right-4 flex items-center gap-2">
                     <span className="text-[8px] font-black tracking-widest text-[#22c55e] opacity-40">AUTO-SYNC ACTIVE</span>
                  </div>
                )}

                {/* Remote device warning */}
                {!localFileName && (() => {
                  const lastLocal = uploadHistory.find(e => e.source === "pasta" && e.deviceName);
                  if (lastLocal?.deviceName && lastLocal.deviceName !== currentDeviceName) {
                    return (
                      <div className="rounded-lg p-2 flex items-start gap-2" style={{ backgroundColor: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}>
                        <Monitor size={12} className="shrink-0 mt-0.5" style={{ color: "#ca8a04" }} />
                        <p className="text-[9px] font-semibold" style={{ color: "var(--layout-page-text, #0d0446)" }}>
                          XML carregado em outro computador: <span className="font-mono" style={{ color: "color-mix(in srgb, var(--layout-page-text, #0d0446) 50%, transparent)" }}>{lastLocal.deviceName}</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        )}


        {/* ═══ UPLOAD HISTORY (Legacy position) ═══ */}
        {showConfig && uploadHistory.length > 0 && (
          <div className="mt-6 px-8 pb-8">
            <div className="rounded-[32px] overflow-hidden" style={{ border: "1px solid #E2E8F0", backgroundColor: "#FFFFFF", boxShadow: "0 10px 30px -10px rgba(10, 37, 64, 0.05)" }}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "#F8FAFC" }}>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Origem</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Data</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Hora</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Música / Artista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadHistory.map((entry, i) => {
                    // Each row must display only its own persisted pair. Mixing the
                    // current track into an older row duplicated the title and hid
                    // the artist whenever that historical record was incomplete.
                    const showArtist = entry.artista || "";
                    const showMusic = entry.musica || "";
                    return (
                      <tr key={i} className="group hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider"
                            style={{ 
                              backgroundColor: entry.source === "pasta" ? "#F7FEE7" : "#ECFEFF",
                              color: entry.source === "pasta" ? "#4D7C0F" : "#0891B2"
                            }}>
                            {entry.source === "pasta" ? <FolderOpen size={10} /> : <Globe size={10} />}
                            {entry.source === "pasta" ? "Local" : "Online"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-500 tabular-nums">{entry.date}</td>
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-500 tabular-nums">{entry.time}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold truncate text-slate-900" title={showMusic}>{showMusic || "—"}</span>
                            <span className="text-[10px] font-semibold text-slate-400 truncate" title={showArtist}>{showArtist || "—"}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ═══ INFO MUSIC & CURIOSIDADES ═══ */}
      <Suspense fallback={<div className="flex items-center justify-center p-20"><Loader2 className="animate-spin" size={40} style={{ color: NEXO_CYAN }} /></div>}>
        <InfoMusicSection 
          music={music} 
          effectiveUserId={dataUserId}
          curiosidade={curiosidade}
          setCuriosidade={setCuriosidade}
          manualCuriosityRef={manualCuriosityRef}
        />
      </Suspense>

      {/* ═══ MONITOR DE TRANSCRIÇÃO DO STREAMING (REALTIME) ═══ */}
      <Suspense fallback={null}>
        <TranscricaoStreamingPanel effectiveUserId={dataUserId} />
      </Suspense>







      </div>
    </div>
  );
}

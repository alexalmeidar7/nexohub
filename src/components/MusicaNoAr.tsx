import { useState, useEffect, useRef, useCallback } from "react";
import { Music, User, Loader2, Pencil, Check, Globe, FolderOpen, Clock, Upload, Monitor, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findCurrentProgram } from "./OnAirWidget";
import { getApresentadores } from "./ApresentadorForm";
import { normalizeMusicText } from "@/lib/textEncoding";

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
}

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";
const UPLOAD_HISTORY_KEY = "masterview_xml_upload_history";
const SOURCE_MODE_KEY = "masterview_source_mode";
const DEVICE_NAME_KEY = "masterview_device_name";
const DEVICE_ID_KEY = "masterview_device_id";
const DEFAULT_XML_URL = "https://positivafm.com.br/storage/pulsar/positivafm.xml";

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
    if (errorNode) return null;

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

    const titulo = normalizeMusicText(rawTitulo) || "Sem titulo";
    const artista = normalizeMusicText(rawArtista) || "Desconhecido";

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

    return { titulo, artista, duracao, capa };
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
      .select("source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!data) return [];
    return data.map((row: any) => {
      const d = new Date(row.created_at);
      // source may contain device name: "pasta|DeviceName" or just "pasta"
      const [rawSource, deviceName] = (row.source as string).split("|");
      return {
        source: (rawSource === "pasta" ? "pasta" : "online") as "pasta" | "online",
        date: d.toLocaleDateString("pt-BR"),
        time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        deviceName: deviceName || undefined,
      };
    });
  } catch { return []; }
}

async function addUploadLogToDb(userId: string, source: "pasta" | "online", deviceName?: string): Promise<UploadLogEntry[]> {
  const sourceValue = source === "pasta" && deviceName ? `pasta|${deviceName}` : source;
  await supabase.from("xml_upload_history").insert({ user_id: userId, source: sourceValue });
  return loadUploadHistoryFromDb(userId);
}

import { getMusicData } from "@/lib/musicData";
export { getMusicData } from "@/lib/musicData";

export default function MusicaNoAr() {
  const { user } = useAuth();
  const [xmlUrl, setXmlUrl] = useState(DEFAULT_XML_URL);
  const [editingUrl, setEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState("");
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

  // Unified mode: both sources always active
  const [sourceMode, setSourceModeState] = useState<"online" | "pasta">("online");
  const [sourceModeLoaded, setSourceModeLoaded] = useState(false);
  const [localFileContent, setLocalFileContent] = useState<string | null>(null);
  const localFileContentRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileRef = useRef<File | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const localPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadLogEntry[]>([]);
  const [localFileName, setLocalFileName] = useState<string>("");
  const [localMonitoring, setLocalMonitoring] = useState(false);
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState(() => getDeviceName());
  const [currentDeviceName, setCurrentDeviceName] = useState(() => getDeviceName());

  // Unified tracking: which source provided the last update
  const [lastSource, setLastSource] = useState<"online" | "pasta" | null>(null);
  const [sourceStats, setSourceStats] = useState<{ online: number; pasta: number }>({ online: 0, pasta: 0 });
  const lastSourceRef = useRef<"online" | "pasta" | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Source delay tracking
  const lastOnlineUpdateRef = useRef<number>(Date.now());
  const lastLocalUpdateRef = useRef<number>(Date.now());
  const [onlineDelay, setOnlineDelay] = useState(false);
  const [localDelay, setLocalDelay] = useState(false);

  // Save source mode to DB + state (kept for UI preference, but both always run)
  const setSourceMode = async (mode: "online" | "pasta") => {
    setSourceModeState(mode);
    localStorage.setItem(SOURCE_MODE_KEY, mode);
    if (user) {
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        music_source_mode: mode,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  };

  // Load URL, source mode, and history from DB
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const [{ data }, history] = await Promise.all([
        supabase
          .from("user_settings")
          .select("music_xml_url, music_source_mode")
          .eq("user_id", user.id)
          .maybeSingle(),
        loadUploadHistoryFromDb(user.id),
      ]);
      setUploadHistory(history);
      if (data?.music_xml_url) {
        setXmlUrl(data.music_xml_url);
      } else {
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          music_xml_url: DEFAULT_XML_URL,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
      // Restore saved source mode
      const savedMode = (data as any)?.music_source_mode;
      if (savedMode === "pasta" || savedMode === "online") {
        setSourceModeState(savedMode);
        localStorage.setItem(SOURCE_MODE_KEY, savedMode);
      }
      setSourceModeLoaded(true);
    };
    loadData();
  }, [user]);

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
    if (!user) return;
    setXmlUrl(url);
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      music_xml_url: url,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  };

  const processMusic = useCallback(async (data: MusicData, source?: "online" | "pasta") => {
    const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
    const prev: MusicData | null = prevRaw ? JSON.parse(prevRaw) : null;

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
      const now = Date.now();
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MUSIC_START_KEY, now.toString());
      setMusic(data);
      setStartTime(now);
      setElapsed(0);
      // Track which source detected the change first
      if (source) {
        setLastSource(source);
        lastSourceRef.current = source;
        setSourceStats(prev => ({ ...prev, [source]: prev[source] + 1 }));
        if (source === "online") { lastOnlineUpdateRef.current = Date.now(); setOnlineDelay(false); }
        if (source === "pasta") { lastLocalUpdateRef.current = Date.now(); setLocalDelay(false); }
      }
    } else {
      if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
      }
      setMusic(prev.capa && !data.capa ? { ...data, capa: prev.capa } : data);
    }
  }, []);

  // Online fetch — always active when URL exists (unified mode)
  const fetchXml = useCallback(async () => {
    if (!xmlUrl.trim()) return;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", {
        body: { url: xmlUrl.trim() },
      });
      if (error || !data?.content) return;
      const parsed = parseXmlString(data.content);
      if (parsed) {
        await processMusic(parsed, "online");
      }
    } catch { }
  }, [xmlUrl, processMusic]);

  useEffect(() => {
    if (!xmlUrl.trim()) return;
    fetchXml();
    fetchIntervalRef.current = setInterval(fetchXml, 5000);
    return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
  }, [fetchXml]);

  // Background sync: upload to storage + log history (non-blocking)
  const syncingRef = useRef(false);
  const pendingSyncRef = useRef<string | null>(null);
  const readingRef = useRef(false);

  // Keep stable refs to avoid interval restarts
  const processMusicRef = useRef(processMusic);
  processMusicRef.current = processMusic;
  const userRef = useRef(user);
  userRef.current = user;
  const deviceNameRef = useRef(currentDeviceName);
  deviceNameRef.current = currentDeviceName;

  const syncToStorage = useCallback(async (text: string) => {
    const u = userRef.current;
    if (!u) return;
    if (syncingRef.current) {
      pendingSyncRef.current = text;
      return;
    }
    syncingRef.current = true;
    try {
      const utf8Blob = new Blob([new TextEncoder().encode(text)], { type: "application/xml" });
      const filePath = `local-xml-${u.id}.xml`;
      await supabase.storage.from("xml-files").upload(filePath, utf8Blob, { upsert: true, contentType: "application/xml" });
      const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(filePath);
      if (urlData?.publicUrl) {
        await supabase.from("user_settings").upsert({
          user_id: u.id,
          music_xml_url: urlData.publicUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        setXmlUrl(urlData.publicUrl);
      }
      setUploadHistory(await addUploadLogToDb(u.id, "pasta", deviceNameRef.current));
    } catch { }
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
        } catch {
          readingRef.current = false;
          return;
        }
      } else {
        file = localFileRef.current;
      }
      if (!file) { readingRef.current = false; return; }

      const text = await readFileWithEncoding(file);
      if (text === localFileContentRef.current) { readingRef.current = false; return; }
      localFileContentRef.current = text;
      setLocalFileContent(text);

      const parsed = parseXmlString(text);
      if (parsed) {
        // Fire-and-forget: don't block polling with iTunes cover fetch
        processMusicRef.current(parsed, "pasta");
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

    if ('showOpenFilePicker' in window && !e) {
      try {
        const [h] = await (window as any).showOpenFilePicker({
          types: [{ description: 'XML', accept: { 'application/xml': ['.xml'] } }],
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

    const text = await readFileWithEncoding(file);
    localFileContentRef.current = text;
    setLocalFileContent(text);

    const parsed = parseXmlString(text);
    if (parsed) await processMusic(parsed, "pasta");

    syncToStorage(text);
    setLocalMonitoring(true);
  };

  // Local polling — always active when monitoring (unified mode, no sourceMode guard)
  useEffect(() => {
    if (!localMonitoring) {
      if (localPollRef.current) clearInterval(localPollRef.current);
      return;
    }
    if (!localFileRef.current && !fileHandleRef.current) return;
    localPollRef.current = setInterval(readLocalFile, 1000);
    return () => { if (localPollRef.current) clearInterval(localPollRef.current); };
  }, [localMonitoring, readLocalFile]);

  useEffect(() => {
    if (!music || !startTime) return;
    const tick = () => { const el = (Date.now() - startTime) / 1000; setElapsed(Math.min(el, music.duracao)); };
    intervalRef.current = setInterval(tick, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [music, startTime]);

  useEffect(() => {
    const stored = getMusicData();
    if (stored) {
      setMusic(stored.music);
      const st = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
      setStartTime(st);
      setElapsed(stored.elapsed);
    }
  }, []);

  const rawProgress = music && music.duracao > 0 ? Math.min(100, (elapsed / music.duracao) * 100) : 0;

  // Detect when progress resets (music changed or reached end)
  useEffect(() => {
    if (prevProgressRef.current > 10 && rawProgress < 5) {
      setSliderResetting(true);
      const timer = setTimeout(() => setSliderResetting(false), 600);
      return () => clearTimeout(timer);
    }
    prevProgressRef.current = rawProgress;
  }, [rawProgress]);

  const progress = sliderResetting ? 0 : rawProgress;

  const hasCover = music?.capa && music.capa.length > 0;
  const useFallback = !hasCover && presenterFallback;
  const displayTitulo = useFallback ? presenterFallback!.nome : (music?.titulo || "Aguardando leitura...");
  const displayArtista = useFallback ? "no ar agora" : (music?.artista || "Interprete");
  const displayCover = useFallback ? presenterFallback!.foto : (music?.capa || "");

  if (!music && !presenterFallback) {
    return (
      <div className="animate-pulse">
        <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <Music size={20} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <div className="h-5 w-32 rounded bg-[#0d0446]/10 mb-1" />
              <div className="h-3 w-48 rounded bg-[#0d0446]/5" />
            </div>
          </div>
          <div className="max-w-md mx-auto rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 4px 20px rgba(13,4,70,0.08)" }}>
            <div className="p-6">
              <div className="h-3 w-16 rounded bg-[#0d0446]/8 mb-2" />
              <div className="h-8 w-full rounded-full bg-[#0d0446]/5 mb-6" />
              <div className="aspect-square rounded-2xl bg-[#0d0446]/5 mb-6" />
              <div className="space-y-3 flex flex-col items-center mb-4">
                <div className="h-6 w-48 rounded bg-[#0d0446]/10" />
                <div className="h-4 w-32 rounded bg-[#268ffa]/15" />
              </div>
              <div className="h-2 w-full rounded-full bg-[#0d0446]/5 mb-2" />
              <div className="flex justify-between">
                <div className="h-2.5 w-10 rounded bg-[#0d0446]/5" />
                <div className="h-2.5 w-10 rounded bg-[#0d0446]/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "16px" }}>
        {/* Header compact */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <Music size={16} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight" style={{ color: "#0d0446" }}>Musica no Ar</h3>
              <p className="text-[9px]" style={{ color: "rgba(13,4,70,0.5)" }}>Monitoramento XML em tempo real</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[8px] uppercase tracking-widest font-bold rounded-full" style={{ backgroundColor: "rgba(38,143,250,0.1)", color: "#268ffa", border: "1px solid rgba(38,143,250,0.2)" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#268ffa" }}></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: "#268ffa" }}></span>
            </span>
            AO VIVO
          </span>
        </div>

        {/* Main 2-column: Cover+Info | XML Config */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">

          {/* LEFT - XML Config + History */}
          <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            {/* Unified mode indicator */}
            <div className="rounded-lg p-2 flex items-center gap-2" style={{
              backgroundColor: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.2)"
            }}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#7c3aed" }}></span>
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#7c3aed" }}></span>
              </span>
              <span className="text-[9px] font-bold" style={{ color: "#0d0446" }}>
                Modo Unificado — monitorando ambas as origens
              </span>
            </div>

            {/* Source status badges */}
            <div className="flex gap-1.5">
              <div className="flex-1 rounded-lg p-1.5 flex items-center gap-1.5" style={{
                backgroundColor: lastSource === "online" ? "rgba(38,143,250,0.12)" : "rgba(38,143,250,0.04)",
                border: `1px solid ${lastSource === "online" ? "rgba(38,143,250,0.3)" : "rgba(38,143,250,0.1)"}`,
              }}>
                <Globe size={10} style={{ color: "#268ffa" }} />
                <span className="text-[8px] font-bold" style={{ color: lastSource === "online" ? "#268ffa" : "rgba(13,4,70,0.4)" }}>
                  Online {sourceStats.online > 0 ? `(${sourceStats.online}x)` : ""}
                </span>
                {lastSource === "online" && <span className="text-[7px] ml-auto font-bold px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(38,143,250,0.15)", color: "#268ffa" }}>ATUAL</span>}
              </div>
              <div className="flex-1 rounded-lg p-1.5 flex items-center gap-1.5" style={{
                backgroundColor: lastSource === "pasta" ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.04)",
                border: `1px solid ${lastSource === "pasta" ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.1)"}`,
              }}>
                <FolderOpen size={10} style={{ color: "#22c55e" }} />
                <span className="text-[8px] font-bold" style={{ color: lastSource === "pasta" ? "#22c55e" : "rgba(13,4,70,0.4)" }}>
                  Local {sourceStats.pasta > 0 ? `(${sourceStats.pasta}x)` : ""}
                </span>
                {lastSource === "pasta" && <span className="text-[7px] ml-auto font-bold px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>ATUAL</span>}
              </div>
            </div>

            {/* Online URL config */}
            <div>
              <p className="text-[8px] mb-1 font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "rgba(13,4,70,0.4)" }}>
                <Globe size={9} /> Origem Online
              </p>
                {editingUrl ? (
                  <div className="flex gap-1.5">
                    <input
                      value={tempUrl}
                      onChange={(e) => setTempUrl(e.target.value)}
                      className="flex-1 text-[10px] px-2 py-1 outline-none"
                      style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446", borderRadius: "8px" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#268ffa"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; }}
                      placeholder="URL do XML"
                    />
                    <button onClick={() => { saveUrl(tempUrl); setEditingUrl(false); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#fff" }}>
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] truncate px-2 py-1 flex-1 rounded-lg" style={{ backgroundColor: "rgba(13,4,70,0.03)", color: "rgba(13,4,70,0.6)", border: "1px solid rgba(13,4,70,0.06)" }}>{xmlUrl}</p>
                    <button onClick={() => { setTempUrl(xmlUrl); setEditingUrl(true); }} className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                      <Pencil size={10} style={{ color: "#268ffa" }} />
                    </button>
                  </div>
                )}
            </div>

            {/* Local File */}
            <div>
              <p className="text-[8px] mb-1 font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "rgba(13,4,70,0.4)" }}>
                <FolderOpen size={9} /> Origem Local
              </p>
                {/* Device name editor */}
                <div className="rounded-lg p-2 mb-2 flex items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.06)" }}>
                  <Monitor size={12} className="shrink-0" style={{ color: "#268ffa" }} />
                  {editingDeviceName ? (
                    <div className="flex-1 flex gap-1">
                      <input
                        value={deviceNameInput}
                        onChange={e => setDeviceNameInput(e.target.value)}
                        className="flex-1 text-[9px] px-1.5 py-0.5 rounded outline-none"
                        style={{ backgroundColor: "#fff", border: "1px solid #268ffa", color: "#0d0446" }}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            localStorage.setItem(DEVICE_NAME_KEY, deviceNameInput);
                            setCurrentDeviceName(deviceNameInput);
                            setEditingDeviceName(false);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          localStorage.setItem(DEVICE_NAME_KEY, deviceNameInput);
                          setCurrentDeviceName(deviceNameInput);
                          setEditingDeviceName(false);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#fff" }}
                      >
                        <Check size={10} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-[9px] font-semibold truncate" style={{ color: "#0d0446" }}>
                        {currentDeviceName}
                      </span>
                      <button
                        onClick={() => { setDeviceNameInput(currentDeviceName); setEditingDeviceName(true); }}
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "rgba(13,4,70,0.04)" }}
                      >
                        <Pencil size={9} style={{ color: "#268ffa" }} />
                      </button>
                    </>
                  )}
                </div>

                {/* Remote device warning */}
                {!localFileName && (() => {
                  const lastLocal = uploadHistory.find(e => e.source === "pasta" && e.deviceName);
                  if (lastLocal && lastLocal.deviceName) {
                    const isRemote = lastLocal.deviceName !== currentDeviceName;
                    if (isRemote) {
                      return (
                        <div className="rounded-lg p-2.5 mb-2 flex items-start gap-2" style={{ backgroundColor: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}>
                          <Monitor size={14} className="shrink-0 mt-0.5" style={{ color: "#ca8a04" }} />
                          <div>
                            <p className="text-[9px] font-semibold leading-tight" style={{ color: "#0d0446" }}>
                              Arquivo XML sendo carregado localmente em outro computador
                            </p>
                            <p className="text-[8px] mt-0.5 font-mono" style={{ color: "rgba(13,4,70,0.5)" }}>
                              {lastLocal.deviceName}
                            </p>
                            <p className="text-[8px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>
                              Selecione um arquivo XML neste computador ou mude para o modo Online.
                            </p>
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}

                <input ref={fileInputRef} type="file" accept=".xml,application/xml,text/xml" onChange={handleFileSelect} className="hidden" />
                <button
                  onClick={() => {
                    // Use showOpenFilePicker if available (enables live re-reads)
                    if ('showOpenFilePicker' in window) {
                      handleFileSelect();
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold border-2 border-dashed"
                  style={{ borderColor: localFileName ? "#22c55e" : "rgba(13,4,70,0.15)", color: localFileName ? "#22c55e" : "rgba(13,4,70,0.4)" }}
                >
                  <Upload size={12} />
                  {localFileName || "Selecionar .XML"}
                </button>

                {localMonitoring && localFileName && (
                  <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-semibold" style={{ backgroundColor: "rgba(34,197,94,0.08)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <span className="relative flex h-1.5 w-1.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#22c55e" }}></span><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: "#22c55e" }}></span></span>
                    Monitorando {localFileName} a cada 1s
                  </div>
                )}
            </div>

            {/* Upload History */}
            {uploadHistory.length > 0 && (
              <div className="flex-1 min-h-0">
                <p className="text-[8px] mb-1 font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "rgba(13,4,70,0.4)" }}>
                  <Clock size={9} /> Historico
                </p>
                <div className="rounded-lg overflow-auto max-h-[140px]" style={{ border: "1px solid rgba(13,4,70,0.06)" }}>
                  <table className="w-full text-[8px]">
                    <thead className="sticky top-0">
                      <tr style={{ backgroundColor: "rgba(13,4,70,0.03)" }}>
                        <th className="text-left px-1.5 py-0.5 font-bold uppercase" style={{ color: "rgba(13,4,70,0.4)" }}>Origem</th>
                        <th className="text-left px-1.5 py-0.5 font-bold uppercase" style={{ color: "rgba(13,4,70,0.4)" }}>Data</th>
                        <th className="text-left px-1.5 py-0.5 font-bold uppercase" style={{ color: "rgba(13,4,70,0.4)" }}>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadHistory.map((entry, i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? "1px solid rgba(13,4,70,0.04)" : undefined }}>
                          <td className="px-1.5 py-0.5 font-semibold" style={{ color: entry.source === "pasta" ? "#22c55e" : "#268ffa" }}>
                            <span className="inline-flex items-center gap-0.5">
                              {entry.source === "pasta" ? <FolderOpen size={8} /> : <Globe size={8} />}
                              {entry.source === "pasta" ? "Pasta" : "Online"}
                            </span>
                          </td>
                          <td className="px-1.5 py-0.5 font-mono" style={{ color: "rgba(13,4,70,0.5)" }}>{entry.date}</td>
                          <td className="px-1.5 py-0.5 font-mono" style={{ color: "rgba(13,4,70,0.5)" }}>{entry.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT - Cover + Song Info with blue progress background */}
          <div
            key={`${displayTitulo}-${displayArtista}`}
            className="rounded-2xl overflow-hidden relative animate-fade-in"
            style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}
          >
            {/* Blue progress fill as background */}
            <div
              className="absolute inset-0"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #0a1a3a, #1a4a8a, #2d8ef3)",
                transition: sliderResetting
                  ? "width 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease"
                  : "width 0.5s linear",
                opacity: sliderResetting ? 0.3 : 1,
              }}
            />

            <div className="relative z-10 p-4 flex gap-5">
              {/* Cover image */}
              <div className="relative w-56 h-56 shrink-0 overflow-hidden rounded-2xl group bg-white" style={{ boxShadow: "0 8px 24px rgba(13,4,70,0.15)" }}>
                {loadingCover && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 backdrop-blur-sm rounded-2xl">
                    <Loader2 className="animate-spin" size={36} style={{ color: "#268ffa" }} />
                  </div>
                )}
                {displayCover ? (
                  <img src={displayCover} alt="Capa" className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.03)", color: "rgba(13,4,70,0.2)" }}>
                    <Music size={40} />
                    <span className="italic text-xs">{music ? "Sem capa" : "Aguardando..."}</span>
                  </div>
                )}
              </div>

              {/* Song Info + Progress */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex flex-col items-start gap-2">
                  <span className="inline-block px-3 py-1 rounded-lg bg-white text-xl font-black tracking-tight truncate max-w-full" style={{ color: "#0d0446" }}>{displayTitulo}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white font-semibold text-sm" style={{ color: "#268ffa" }}>
                    <User size={14} />
                    {displayArtista}
                  </span>
                </div>

                {music && music.duracao > 0 && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white">
                      <span className="text-[11px] font-mono font-bold" style={{ color: "#0d0446" }}>{formatTime(elapsed)}</span>
                      <span className="text-[11px] font-mono font-bold" style={{ color: "rgba(13,4,70,0.4)" }}>{formatTime(music.duracao)}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* XML Output Link - outside the main card */}
      {music && (
        <div className="mt-3">
          <XmlLinkRow label="XML MUSICA AGORA" xmlContent={`<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${displayTitulo}</titulo>\n  <interprete>${displayArtista}</interprete>\n  <capa>${displayCover || ""}</capa>\n</musica_agora>`} dark />
        </div>
      )}
    </div>
  );
}

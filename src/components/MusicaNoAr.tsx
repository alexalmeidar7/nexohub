import { useState, useEffect, useRef, useCallback } from "react";
import { Music, User, Loader2, Pencil, Check, Globe, FolderOpen, Clock, Upload } from "lucide-react";
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
}

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";
const UPLOAD_HISTORY_KEY = "masterview_xml_upload_history";
const DEFAULT_XML_URL = "https://positivafm.com.br/storage/pulsar/positivafm.xml";

function parseXmlString(xmlStr: string): MusicData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) return null;

    const titulo = normalizeMusicText(
      doc.querySelector("nome_musica")?.textContent ||
      doc.querySelector("titulo")?.textContent ||
      doc.querySelector("title")?.textContent ||
      "Sem título"
    );
    const artista = normalizeMusicText(
      doc.querySelector("interprete")?.textContent ||
      doc.querySelector("nome_interprete")?.textContent ||
      doc.querySelector("artista")?.textContent ||
      doc.querySelector("artist")?.textContent ||
      "Desconhecido"
    );
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

function getUploadHistory(): UploadLogEntry[] {
  try {
    const raw = localStorage.getItem(UPLOAD_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addUploadLog(source: "pasta" | "online") {
  const now = new Date();
  const entry: UploadLogEntry = {
    source,
    date: now.toLocaleDateString("pt-BR"),
    time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
  const history = getUploadHistory();
  history.unshift(entry);
  localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  return history.slice(0, 10);
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

  // New state for dual source mode
  const [sourceMode, setSourceMode] = useState<"online" | "pasta">("online");
  const [localFileContent, setLocalFileContent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileRef = useRef<File | null>(null);
  const localPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadLogEntry[]>(getUploadHistory());
  const [localFileName, setLocalFileName] = useState<string>("");

  // Load URL from DB
  useEffect(() => {
    if (!user) return;
    const loadUrl = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.music_xml_url) {
        setXmlUrl(data.music_xml_url);
      } else {
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          music_xml_url: DEFAULT_XML_URL,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    };
    loadUrl();
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

  const processMusic = useCallback(async (data: MusicData) => {
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
    } else {
      if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
      }
      setMusic(prev.capa && !data.capa ? { ...data, capa: prev.capa } : data);
    }
  }, []);

  // Online fetch
  const fetchXml = useCallback(async () => {
    if (sourceMode !== "online" || !xmlUrl.trim()) return;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", {
        body: { url: xmlUrl.trim() },
      });
      if (error || !data?.content) return;
      const parsed = parseXmlString(data.content);
      if (parsed) {
        await processMusic(parsed);
        setUploadHistory(addUploadLog("online"));
      }
    } catch { }
  }, [xmlUrl, processMusic, sourceMode]);

  useEffect(() => {
    if (sourceMode !== "online") {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current);
      return;
    }
    fetchXml();
    fetchIntervalRef.current = setInterval(fetchXml, 2000);
    return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
  }, [fetchXml, sourceMode]);

  // Local file polling - re-read file every 2s
  const readLocalFile = useCallback(async () => {
    const file = localFileRef.current;
    if (!file) return;
    try {
      const text = await file.text();
      if (text === localFileContent) return; // no change
      setLocalFileContent(text);
      const parsed = parseXmlString(text);
      if (parsed) {
        await processMusic(parsed);
        setUploadHistory(addUploadLog("pasta"));
      }
    } catch { }
  }, [processMusic, localFileContent]);

  useEffect(() => {
    if (sourceMode !== "pasta") {
      if (localPollRef.current) clearInterval(localPollRef.current);
      return;
    }
    if (!localFileRef.current) return;
    readLocalFile();
    localPollRef.current = setInterval(readLocalFile, 2000);
    return () => { if (localPollRef.current) clearInterval(localPollRef.current); };
  }, [sourceMode, readLocalFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    localFileRef.current = file;
    setLocalFileName(file.name);
    const text = await file.text();
    setLocalFileContent(text);
    const parsed = parseXmlString(text);
    if (parsed) {
      await processMusic(parsed);
      setUploadHistory(addUploadLog("pasta"));
    }
  };

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

  const progress = music && music.duracao > 0 ? Math.min(100, (elapsed / music.duracao) * 100) : 0;

  const hasCover = music?.capa && music.capa.length > 0;
  const useFallback = !hasCover && presenterFallback;
  const displayTitulo = useFallback ? presenterFallback!.nome : (music?.titulo || "Aguardando leitura...");
  const displayArtista = useFallback ? "no ar agora" : (music?.artista || "Intérprete");
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
              <h3 className="text-sm font-bold leading-tight" style={{ color: "#0d0446" }}>Música no Ar</h3>
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

          {/* LEFT — XML Config + History */}
          <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            {/* Source Tabs */}
            <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
              <button
                onClick={() => setSourceMode("online")}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold transition-all"
                style={sourceMode === "online"
                  ? { background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#fff", boxShadow: "0 2px 6px rgba(38,143,250,0.3)" }
                  : { color: "rgba(13,4,70,0.4)" }
                }
              >
                <Globe size={11} /> Online
              </button>
              <button
                onClick={() => setSourceMode("pasta")}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold transition-all"
                style={sourceMode === "pasta"
                  ? { background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#fff", boxShadow: "0 2px 6px rgba(38,143,250,0.3)" }
                  : { color: "rgba(13,4,70,0.4)" }
                }
              >
                <FolderOpen size={11} /> Local
              </button>
            </div>

            {/* Online URL */}
            {sourceMode === "online" && (
              <div>
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
            )}

            {/* Local File */}
            {sourceMode === "pasta" && (
              <div>
                <input ref={fileInputRef} type="file" accept=".xml,application/xml,text/xml" onChange={handleFileSelect} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold border-2 border-dashed" style={{ borderColor: localFileName ? "#268ffa" : "rgba(13,4,70,0.15)", color: localFileName ? "#268ffa" : "rgba(13,4,70,0.4)" }}>
                  <Upload size={12} />
                  {localFileName || "Selecionar .XML"}
                </button>
                {localFileName && (
                  <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px]" style={{ backgroundColor: "rgba(38,143,250,0.06)", color: "rgba(13,4,70,0.5)" }}>
                    <span className="relative flex h-1.5 w-1.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#22c55e" }}></span><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: "#22c55e" }}></span></span>
                    Monitorando a cada 2s
                  </div>
                )}
              </div>
            )}

            {/* Upload History */}
            {uploadHistory.length > 0 && (
              <div className="flex-1 min-h-0">
                <p className="text-[8px] mb-1 font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "rgba(13,4,70,0.4)" }}>
                  <Clock size={9} /> Histórico
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


            <p className="text-[8px] text-center uppercase tracking-widest font-semibold" style={{ color: "rgba(13,4,70,0.25)" }}>
              {sourceMode === "online" ? "Monitorando online" : "Monitorando local"}
            </p>
          </div>

          {/* RIGHT — Cover + Song Info with blue progress background */}
          <div
            key={`${displayTitulo}-${displayArtista}`}
            className="rounded-2xl overflow-hidden relative animate-fade-in"
            style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}
          >
            {/* Blue progress fill as background */}
            <div
              className="absolute inset-0 transition-all duration-500 ease-linear"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #0a1a3a, #1a4a8a, #2d8ef3)",
              }}
            />

            <div className="relative z-10 p-4 flex gap-5">
              {/* Cover image */}
              <div className="relative w-56 h-56 shrink-0 overflow-hidden rounded-2xl group" style={{ boxShadow: "0 8px 24px rgba(13,4,70,0.15)" }}>
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

      {/* XML Output Link — outside the main card */}
      {music && (
        <div className="mt-3">
          <XmlLinkRow label="XML MUSICA AGORA" xmlContent={`<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${displayTitulo}</titulo>\n  <interprete>${displayArtista}</interprete>\n  <capa>${displayCover || ""}</capa>\n</musica_agora>`} dark />
        </div>
      )}
    </div>
  );
}
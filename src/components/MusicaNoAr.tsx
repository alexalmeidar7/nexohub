import { useState, useEffect, useRef, useCallback } from "react";
import { Music, User, Loader2, FolderOpen } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

const MUSIC_XML_URL_KEY = "masterview_music_xml_url";
const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";

function parseXmlString(xmlStr: string): MusicData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) return null;

    const titulo =
      doc.querySelector("nome_musica")?.textContent ||
      doc.querySelector("titulo")?.textContent ||
      doc.querySelector("title")?.textContent ||
      "Sem título";
    const artista =
      doc.querySelector("interprete")?.textContent ||
      doc.querySelector("nome_interprete")?.textContent ||
      doc.querySelector("artista")?.textContent ||
      doc.querySelector("artist")?.textContent ||
      "Desconhecido";
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
      if (parts.length === 2) {
        // mm:ss
        duracao = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // mm:ss:cc (minutos:segundos:centésimos) — padrão de automação de rádio
        duracao = parts[0] * 60 + parts[1] + parts[2] / 100;
      }
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
  } catch { /* silent */ }
  return "";
}

export function getMusicData(): { music: MusicData; elapsed: number } | null {
  try {
    const raw = localStorage.getItem(MUSIC_DATA_KEY);
    const startStr = localStorage.getItem(MUSIC_START_KEY);
    if (!raw || !startStr) return null;
    const music: MusicData = JSON.parse(raw);
    const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000;
    if (elapsed > music.duracao) return null;
    return { music, elapsed };
  } catch {
    return null;
  }
}

export default function MusicaNoAr() {
  const [xmlUrl, setXmlUrl] = useState(() => localStorage.getItem(MUSIC_XML_URL_KEY) || "");
  const [music, setMusic] = useState<MusicData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [fetchError, setFetchError] = useState("");
  const coverCacheRef = useRef<Record<string, string>>({});
  const [fileLoaded, setFileLoaded] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [loadingCover, setLoadingCover] = useState(false);

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

  const fetchXml = useCallback(async () => {
    if (!xmlUrl.trim()) return;
    try {
      setFetchError("");
      const res = await fetch(xmlUrl.trim(), { cache: "no-store" });
      const text = await res.text();
      const parsed = parseXmlString(text);
      if (parsed) await processMusic(parsed);
    } catch {
      setFetchError("Erro ao carregar arquivo XML");
    }
  }, [xmlUrl, processMusic]);

  const readLocalFile = useCallback(async () => {
    const file = selectedFileRef.current;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseXmlString(text);
      if (parsed) {
        await processMusic(parsed);
        setFetchError("");
      } else {
        setFetchError("Arquivo XML inválido");
      }
    };
    reader.readAsText(file);
  }, [processMusic]);

  // Fetch XML every 5 seconds (URL mode)
  useEffect(() => {
    if (xmlUrl.trim() && !fileLoaded) {
      fetchXml();
      fetchIntervalRef.current = setInterval(fetchXml, 5000);
      return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
    }
  }, [xmlUrl, fetchXml, fileLoaded]);

  // File reload countdown
  useEffect(() => {
    if (!fileLoaded) return;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          readLocalFile();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [fileLoaded, readLocalFile]);

  // Timer - high precision
  useEffect(() => {
    if (!music || !startTime) return;
    const tick = () => {
      const el = (Date.now() - startTime) / 1000;
      setElapsed(Math.min(el, music.duracao));
    };
    intervalRef.current = setInterval(tick, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [music, startTime]);

  // Load stored data on mount
  useEffect(() => {
    const stored = getMusicData();
    if (stored) {
      setMusic(stored.music);
      const st = parseInt(localStorage.getItem(MUSIC_START_KEY) || "0", 10);
      setStartTime(st);
      setElapsed(stored.elapsed);
    }
  }, []);

  // Auto-save URL
  useEffect(() => {
    localStorage.setItem(MUSIC_XML_URL_KEY, xmlUrl.trim());
  }, [xmlUrl]);

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,text/xml,application/xml";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      selectedFileRef.current = file;
      setFileLoaded(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        const parsed = parseXmlString(text);
        if (parsed) {
          await processMusic(parsed);
          setFetchError("");
        } else {
          setFetchError("Arquivo XML inválido");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const progress = music && music.duracao > 0 ? Math.min(100, (elapsed / music.duracao) * 100) : 0;
  const timeLeft = music ? Math.max(0, music.duracao - elapsed) : 0;
  const timeElapsed = music ? Math.min(elapsed, music.duracao) : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] animate-fade-in">
      <div className="bg-zinc-900 p-8 rounded-[2rem] shadow-2xl w-full max-w-md">

        {/* URL input + green file button */}
        <div className="flex gap-2 mb-6">
          <input
            value={xmlUrl}
            onChange={(e) => { setXmlUrl(e.target.value); setFileLoaded(false); selectedFileRef.current = null; }}
            placeholder="URL do arquivo XML (a cada 5s)"
            className="flex-1 bg-zinc-800 border border-zinc-700 p-3 rounded-lg text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-violet-500 text-sm"
          />
          <button
            onClick={handleFileSelect}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold transition-all text-xs whitespace-nowrap"
            style={{ backgroundColor: "#2e7d32" }}
          >
            <FolderOpen size={14} />
            {fileLoaded ? `Atualizando em: ${countdown}s` : "Carregar XML"}
          </button>
        </div>

        {fetchError && <p className="text-red-400 text-xs mb-4">{fetchError}</p>}

        {/* Album artwork */}
        <div className="relative aspect-square mb-8 overflow-hidden rounded-2xl bg-zinc-800 shadow-lg group">
          {loadingCover && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 backdrop-blur-sm">
              <Loader2 className="animate-spin text-violet-500" size={48} />
            </div>
          )}

          {music?.capa ? (
            <img
              src={music.capa}
              alt="Capa do Álbum"
              className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
              <Music size={48} />
              <span className="italic text-sm">
                {music ? "Nenhuma capa encontrada" : "Aguardando leitura..."}
              </span>
            </div>
          )}
        </div>

        {/* Song info */}
        <div className="space-y-2 text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight truncate px-2 text-zinc-100">
            {music?.titulo || "Aguardando leitura..."}
          </h1>
          <p className="text-violet-400 font-semibold flex items-center justify-center gap-2 text-lg">
            <User size={20} />
            {music?.artista || "Intérprete"}
          </p>
        </div>

        {/* XML MUSICA AGORA */}
        {music && (
          <XmlLinkRow label="XML MUSICA AGORA" xmlContent={`<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${music.titulo}</titulo>\n  <interprete>${music.artista}</interprete>\n  <capa>${music.capa || ""}</capa>\n</musica_agora>`} dark />
        )}

        {/* Monitoring indicator */}
        {(fileLoaded || xmlUrl.trim()) && (
          <div className="mt-8 flex justify-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 text-[10px] uppercase tracking-widest font-bold rounded-full border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              {fileLoaded ? `Monitorando: ${selectedFileRef.current?.name}` : "Monitorando URL"}
            </span>
          </div>
        )}

        {/* XML structure hint */}
        <div className="mt-6 bg-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2 font-semibold">Estrutura esperada do XML:</p>
          <pre className="text-[10px] text-zinc-600 font-mono leading-relaxed">{`<musica>
  <nome_musica>Nome da Música</nome_musica>
  <nome_interprete>Artista</nome_interprete>
  <duracao>03:45</duracao>
  <capa>https://url.jpg</capa> <!-- opcional -->
</musica>`}</pre>
        </div>
      </div>
    </div>
  );
}

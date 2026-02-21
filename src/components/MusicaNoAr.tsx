import { useState, useEffect, useRef, useCallback } from "react";
import { Music, User, Loader2, Pencil, Check } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findCurrentProgram } from "./OnAirWidget";
import { getApresentadores } from "./ApresentadorForm";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";
const DEFAULT_XML_URL = "https://positivafm.com.br/storage/pulsar/positivafm.xml";

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
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 60 + parts[1] + parts[2] / 100;
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
  } catch {}
  return "";
}

export function getMusicData(): { music: MusicData; elapsed: number; finished: boolean } | null {
  try {
    const raw = localStorage.getItem(MUSIC_DATA_KEY);
    const startStr = localStorage.getItem(MUSIC_START_KEY);
    if (!raw || !startStr) return null;
    const music: MusicData = JSON.parse(raw);
    const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000;
    const finished = elapsed >= music.duracao;
    return { music, elapsed: Math.min(elapsed, music.duracao), finished };
  } catch {
    return null;
  }
}

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
  const [loadingCover, setLoadingCover] = useState(false);
  const [presenterFallback, setPresenterFallback] = useState<{ nome: string; foto: string } | null>(null);

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
        // Save default
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          music_xml_url: DEFAULT_XML_URL,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    };
    loadUrl();
  }, [user]);

  // Fetch current presenter for fallback
  useEffect(() => {
    const fetchPresenter = async () => {
      const [{ data: progsData }, apresentadores] = await Promise.all([
        supabase.from("programas").select("*"),
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

  const fetchXml = useCallback(async () => {
    if (!xmlUrl.trim()) return;
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(xmlUrl.trim())}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      const text = await res.text();
      const parsed = parseXmlString(text);
      if (parsed) await processMusic(parsed);
    } catch {
      // Silently handle errors - no error messages shown to user
    }
  }, [xmlUrl, processMusic]);

  useEffect(() => {
    fetchXml();
    fetchIntervalRef.current = setInterval(fetchXml, 2000);
    return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
  }, [fetchXml]);

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

  // Determine display data with fallback logic
  const hasCover = music?.capa && music.capa.length > 0;
  const useFallback = !hasCover && presenterFallback;
  const displayTitulo = useFallback ? presenterFallback!.nome : (music?.titulo || "Aguardando leitura...");
  const displayArtista = useFallback ? "no ar agora" : (music?.artista || "Intérprete");
  const displayCover = useFallback ? presenterFallback!.foto : (music?.capa || "");

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] animate-fade-in">
      <div className="bg-zinc-900 p-8 rounded-[2rem] shadow-2xl w-full max-w-md">
        <div className="mb-4">
          <p className="text-zinc-500 text-xs mb-1">URL do XML:</p>
          {editingUrl ? (
            <div className="flex gap-2">
              <input
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="flex-1 text-zinc-400 text-xs bg-zinc-800 rounded-lg px-3 py-2 border border-zinc-700 outline-none focus:border-violet-500"
                placeholder="URL do XML"
              />
              <button
                onClick={() => { saveUrl(tempUrl); setEditingUrl(false); }}
                className="bg-violet-600 text-white rounded-lg px-3 py-2 hover:bg-violet-500 transition-colors"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-zinc-400 text-xs truncate bg-zinc-800 rounded-lg px-3 py-2 border border-zinc-700 flex-1">{xmlUrl}</p>
              <button
                onClick={() => { setTempUrl(xmlUrl); setEditingUrl(true); }}
                className="text-zinc-500 hover:text-violet-400 transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="relative aspect-square mb-8 overflow-hidden rounded-2xl bg-zinc-800 shadow-lg group">
          {loadingCover && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 backdrop-blur-sm">
              <Loader2 className="animate-spin text-violet-500" size={48} />
            </div>
          )}
          {displayCover ? (
            <img src={displayCover} alt="Capa do Álbum" className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
              <Music size={48} />
              <span className="italic text-sm">{music ? "Nenhuma capa encontrada" : "Aguardando leitura..."}</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight truncate px-2 text-zinc-100">{displayTitulo}</h1>
          <p className="text-violet-400 font-semibold flex items-center justify-center gap-2 text-lg">
            <User size={20} />
            {displayArtista}
          </p>
        </div>

        {/* Duration display */}
        {music && music.duracao > 0 && (
          <div className="mb-6">
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-zinc-500 text-xs font-mono">
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(music.duracao)}</span>
            </div>
          </div>
        )}

        {music && (
          <XmlLinkRow label="XML MUSICA AGORA" xmlContent={`<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${music.titulo}</titulo>\n  <interprete>${music.artista}</interprete>\n  <capa>${music.capa || ""}</capa>\n</musica_agora>`} dark />
        )}

        <div className="mt-8 flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 text-[10px] uppercase tracking-widest font-bold rounded-full border border-green-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Monitorando a cada 2s
          </span>
        </div>

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

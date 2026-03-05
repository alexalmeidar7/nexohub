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
    } catch { }
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

  const hasCover = music?.capa && music.capa.length > 0;
  const useFallback = !hasCover && presenterFallback;
  const displayTitulo = useFallback ? presenterFallback!.nome : (music?.titulo || "Aguardando leitura...");
  const displayArtista = useFallback ? "no ar agora" : (music?.artista || "Intérprete");
  const displayCover = useFallback ? presenterFallback!.foto : (music?.capa || "");

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] animate-fade-in">
      <div className="p-8 rounded-2xl shadow-lg w-full max-w-md" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
        <div className="mb-4">
          <p className="text-xs mb-1" style={{ color: "rgba(13,4,70,0.5)" }}>URL do XML:</p>
          {editingUrl ? (
            <div className="flex gap-2">
              <input
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="flex-1 text-xs px-3 py-1.5 outline-none transition-colors"
                style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                placeholder="URL do XML"
              />
              <button
                onClick={() => { saveUrl(tempUrl); setEditingUrl(false); }}
                className="px-3 py-1.5 font-bold transition-all"
                style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#2dbef3"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; }}
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs truncate px-3 py-1.5 flex-1" style={{ backgroundColor: "rgba(13,4,70,0.04)", color: "#0d0446", borderRadius: "20px", border: "1px solid rgba(13,4,70,0.1)" }}>{xmlUrl}</p>
              <button
                onClick={() => { setTempUrl(xmlUrl); setEditingUrl(true); }}
                className="transition-colors"
                style={{ color: "rgba(13,4,70,0.4)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#2dbef3"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(13,4,70,0.4)"; }}
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="relative aspect-square mb-8 overflow-hidden rounded-2xl shadow-lg group" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
          {loadingCover && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 backdrop-blur-sm">
              <Loader2 className="animate-spin" size={48} style={{ color: "#2dbef3" }} />
            </div>
          )}
          {displayCover ? (
            <img src={displayCover} alt="Capa do Álbum" className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: "rgba(13,4,70,0.3)" }}>
              <Music size={48} />
              <span className="italic text-sm">{music ? "Nenhuma capa encontrada" : "Aguardando leitura..."}</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight truncate px-2" style={{ color: "#0d0446" }}>{displayTitulo}</h1>
          <p className="font-semibold flex items-center justify-center gap-2 text-lg" style={{ color: "#2dbef3" }}>
            <User size={20} />
            {displayArtista}
          </p>
        </div>

        {music && music.duracao > 0 && (
          <div className="mb-6">
            <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "rgba(13,4,70,0.1)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: "#2dbef3" }} />
            </div>
            <div className="flex justify-between text-xs font-mono" style={{ color: "rgba(13,4,70,0.4)" }}>
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(music.duracao)}</span>
            </div>
          </div>
        )}

        {music && (
          <XmlLinkRow label="XML MUSICA AGORA" xmlContent={`<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${music.titulo}</titulo>\n  <interprete>${music.artista}</interprete>\n  <capa>${music.capa || ""}</capa>\n</musica_agora>`} dark />
        )}

        <div className="mt-8 flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full" style={{ backgroundColor: "rgba(45,190,243,0.1)", color: "#2dbef3", border: "1px solid rgba(45,190,243,0.2)" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#2dbef3" }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#2dbef3" }}></span>
            </span>
            Monitorando a cada 2s
          </span>
        </div>

        <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
          <p className="text-xs mb-2 font-semibold" style={{ color: "rgba(13,4,70,0.5)" }}>Estrutura esperada do XML:</p>
          <pre className="text-[10px] font-mono leading-relaxed" style={{ color: "rgba(13,4,70,0.4)" }}>{`<musica>\n  <nome_musica>Nome da Música</nome_musica>\n  <nome_interprete>Artista</nome_interprete>\n  <duracao>03:45</duracao>\n  <capa>https://url.jpg</capa> <!-- opcional -->\n</musica>`}</pre>
        </div>
      </div>
    </div>
  );
}

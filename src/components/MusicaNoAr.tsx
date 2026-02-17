import { useState, useEffect, useRef, useCallback } from "react";
import { Music, Disc3, FolderOpen } from "lucide-react";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number; // seconds
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

    const titulo = doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título";
    const artista = doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido";
    const duracaoStr = doc.querySelector("duracao")?.textContent || doc.querySelector("duration")?.textContent || "0";
    const capa = doc.querySelector("capa")?.textContent || doc.querySelector("cover")?.textContent || "";

    let duracao = 0;
    if (duracaoStr.includes(":")) {
      const parts = duracaoStr.split(":").map(Number);
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      duracao = parseFloat(duracaoStr) || 0;
      // If value > 300 and no decimal, likely in milliseconds
      if (duracao > 300) duracao = duracao / 1000;
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
      // Get high-res artwork (replace 100x100 with 600x600)
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

  const processMusic = useCallback(async (data: MusicData) => {
    const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
    const prev: MusicData | null = prevRaw ? JSON.parse(prevRaw) : null;

    // Fetch cover from iTunes if not in XML
    if (!data.capa) {
      const cacheKey = `${data.artista}-${data.titulo}`;
      if (coverCacheRef.current[cacheKey]) {
        data.capa = coverCacheRef.current[cacheKey];
      } else {
        const cover = await fetchCoverFromiTunes(data.titulo, data.artista);
        if (cover) {
          data.capa = cover;
          coverCacheRef.current[cacheKey] = cover;
        }
      }
    }

    // Only reset timer if song changed
    if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
      const now = Date.now();
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MUSIC_START_KEY, now.toString());
      setMusic(data);
      setStartTime(now);
      setElapsed(0);
    } else {
      // Update cover if it was fetched
      if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
      }
      setMusic(data);
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

  // Fetch XML every 5 seconds (auto-refresh)
  useEffect(() => {
    if (xmlUrl.trim()) {
      fetchXml();
      fetchIntervalRef.current = setInterval(fetchXml, 5000);
      return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
    }
  }, [xmlUrl, fetchXml]);

  // Timer - high precision using milliseconds
  useEffect(() => {
    if (!music || !startTime) return;
    const tick = () => {
      const now = performance.now();
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

  // Auto-save URL on change
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

  return (
    <div className="animate-fade-in space-y-6">
      <h3 className="text-xl text-primary">Música no Ar</h3>

      {/* URL input + file button */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={xmlUrl}
            onChange={(e) => setXmlUrl(e.target.value)}
            placeholder="URL do arquivo XML (salva e atualiza automaticamente a cada 5s)"
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button onClick={handleFileSelect}
          className="flex items-center gap-2 bg-muted border border-border px-4 py-2 rounded-lg text-foreground hover:bg-muted/80 transition-all text-xs">
          <FolderOpen size={14} />
          Carregar arquivo XML local
        </button>
      </div>

      {fetchError && <p className="text-destructive text-xs">{fetchError}</p>}

      {/* Now Playing */}
      {music ? (
        <div className="bg-muted rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Music size={16} className="text-primary" />
            <span className="font-bold text-primary text-sm">TOCANDO AGORA</span>
          </div>

          <div className="flex gap-6">
            {/* CD Cover */}
            <div className="shrink-0">
              {music.capa ? (
                <img
                  src={music.capa}
                  alt="Capa do CD"
                  className="w-32 h-32 rounded-xl object-cover border border-border shadow-lg"
                />
              ) : (
                <div className="w-32 h-32 rounded-xl bg-background/50 border border-border flex items-center justify-center">
                  <Disc3 size={48} className="text-muted-foreground animate-spin" style={{ animationDuration: "3s" }} />
                </div>
              )}
            </div>

            {/* Song Info */}
            <div className="flex-1 space-y-2">
              <p className="text-lg font-bold text-foreground">{music.titulo}</p>
              <p className="text-muted-foreground">{music.artista}</p>

              {/* Timer */}
              <div className="flex items-center gap-3 mt-4">
                <span className="text-primary font-mono text-sm">{formatTime(elapsed)}</span>
                <div className="flex-1 h-2 bg-background/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-muted-foreground font-mono text-sm">{formatTime(music.duracao)}</span>
              </div>

              <p className="text-[10px] text-muted-foreground text-right">{Math.round(progress)}% concluído</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-2xl border border-border p-6 text-center">
          <Disc3 size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma música sendo reproduzida. Insira a URL do arquivo XML ou carregue um arquivo local.</p>
        </div>
      )}

      {/* XML structure hint */}
      <div className="bg-muted/50 rounded-xl border border-border p-4">
        <p className="text-xs text-muted-foreground mb-2 font-semibold">Estrutura esperada do XML:</p>
        <pre className="text-[10px] text-muted-foreground font-mono leading-relaxed">{`<musica>
  <titulo>Nome da Música</titulo>
  <artista>Nome do Artista</artista>
  <duracao>03:45</duracao>  <!-- mm:ss ou segundos -->
  <capa>https://url-da-capa.jpg</capa>  <!-- opcional, busca automática via iTunes -->
</musica>`}</pre>
      </div>
    </div>
  );
}

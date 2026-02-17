import { useState, useEffect, useRef, useCallback } from "react";
import { Music, Play, Pause, Disc3 } from "lucide-react";

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

    // Parse duracao - could be "mm:ss" or seconds
    let duracao = 0;
    if (duracaoStr.includes(":")) {
      const parts = duracaoStr.split(":").map(Number);
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      duracao = parseInt(duracaoStr, 10) || 0;
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
  const [xmlInput, setXmlInput] = useState("");
  const [music, setMusic] = useState<MusicData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mode, setMode] = useState<"url" | "manual">("url");
  const [fetchError, setFetchError] = useState("");

  const processMusic = useCallback((data: MusicData) => {
    const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
    const prev: MusicData | null = prevRaw ? JSON.parse(prevRaw) : null;

    // Only reset timer if song changed
    if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
      const now = Date.now();
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MUSIC_START_KEY, now.toString());
      setMusic(data);
      setStartTime(now);
      setElapsed(0);
    } else {
      setMusic(data);
    }
  }, []);

  const fetchXml = useCallback(async () => {
    if (!xmlUrl.trim()) return;
    try {
      setFetchError("");
      const res = await fetch(xmlUrl.trim());
      const text = await res.text();
      const parsed = parseXmlString(text);
      if (parsed) processMusic(parsed);
    } catch {
      setFetchError("Erro ao buscar XML");
    }
  }, [xmlUrl, processMusic]);

  // Fetch XML every 3 seconds
  useEffect(() => {
    if (mode === "url" && xmlUrl.trim()) {
      fetchXml();
      fetchIntervalRef.current = setInterval(fetchXml, 3000);
      return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
    }
  }, [mode, xmlUrl, fetchXml]);

  // Timer
  useEffect(() => {
    if (!music || !startTime) return;
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const el = (now - startTime) / 1000;
      setElapsed(Math.min(el, music.duracao));
    }, 100);
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

  const handleManualXml = () => {
    const parsed = parseXmlString(xmlInput);
    if (parsed) {
      processMusic(parsed);
      setFetchError("");
    } else {
      setFetchError("XML inválido");
    }
  };

  const saveUrl = () => {
    localStorage.setItem(MUSIC_XML_URL_KEY, xmlUrl.trim());
  };

  const progress = music && music.duracao > 0 ? Math.min(100, (elapsed / music.duracao) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <h3 className="text-xl text-primary">Música no Ar</h3>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setMode("url")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === "url" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}>
          URL do XML
        </button>
        <button onClick={() => setMode("manual")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === "manual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}>
          Colar XML
        </button>
      </div>

      {mode === "url" ? (
        <div className="flex gap-2">
          <input
            value={xmlUrl}
            onChange={(e) => setXmlUrl(e.target.value)}
            placeholder="URL do XML da música (atualiza a cada 3s)"
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={saveUrl}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
            Salvar URL
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={xmlInput}
            onChange={(e) => setXmlInput(e.target.value)}
            placeholder={`Cole o XML aqui. Exemplo:\n<musica>\n  <titulo>Nome da Música</titulo>\n  <artista>Nome do Artista</artista>\n  <duracao>03:45</duracao>\n  <capa>https://url-da-capa.jpg</capa>\n</musica>`}
            rows={6}
            className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
          />
          <button onClick={handleManualXml}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
            Processar XML
          </button>
        </div>
      )}

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

              {/* Progress percentage */}
              <p className="text-[10px] text-muted-foreground text-right">{Math.round(progress)}% concluído</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-2xl border border-border p-6 text-center">
          <Disc3 size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma música sendo reproduzida. Insira a URL do XML ou cole o XML manualmente.</p>
        </div>
      )}

      {/* XML structure hint */}
      <div className="bg-muted/50 rounded-xl border border-border p-4">
        <p className="text-xs text-muted-foreground mb-2 font-semibold">Estrutura esperada do XML:</p>
        <pre className="text-[10px] text-muted-foreground font-mono leading-relaxed">{`<musica>
  <titulo>Nome da Música</titulo>
  <artista>Nome do Artista</artista>
  <duracao>03:45</duracao>  <!-- mm:ss ou segundos -->
  <capa>https://url-da-capa.jpg</capa>
</musica>`}</pre>
      </div>
    </div>
  );
}

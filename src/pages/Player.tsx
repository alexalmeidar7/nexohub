import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ChevronUp,
  ChevronDown,
  Play,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface Canal {
  id: string;
  numero_canal: string;
  name: string;
  logo_url: string;
  url: string;
  type: string;
  active: boolean;
  cover_url: string;
  background_url: string;
}

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  ativo: boolean;
  selo: string | null;
}

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

const MUSIC_DATA_KEY = "masterview_music_data";

function getCurrentProgram(programas: Programa[]): Programa | null {
  const now = new Date();
  const dayMap: Record<number, string> = {
    0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
  };
  const today = dayMap[now.getDay()];
  const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

  return (
    programas.find((p) => {
      if (!p.ativo) return false;
      const inDay = !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.includes(today);
      return inDay && currentTime >= p.horario_inicio && currentTime < p.horario_fim;
    }) || null
  );
}

function getNextProgram(programas: Programa[], current: Programa | null): Programa | null {
  if (!current) return programas.find((p) => p.ativo) || null;
  const now = new Date();
  const dayMap: Record<number, string> = {
    0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
  };
  const today = dayMap[now.getDay()];

  const sorted = programas
    .filter((p) => p.ativo && p.horario_inicio >= current.horario_fim)
    .filter((p) => !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.includes(today))
    .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));

  return sorted[0] || null;
}

function getProgramProgress(prog: Programa | null): number {
  if (!prog) return 0;
  const now = new Date();
  const [sh, sm] = prog.horario_inicio.split(":").map(Number);
  const [eh, em] = prog.horario_fim.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin <= startMin) return 50;
  return Math.min(100, Math.max(0, ((nowMin - startMin) / (endMin - startMin)) * 100));
}

export default function PlayerPage() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  const canal = canais[currentIndex] || null;
  const isAudio = canal?.type === "audio_live" || canal?.type === "audio";
  const isYoutube = canal?.type === "youtube";
  const isVideo = canal?.type === "video";

  // Load channels
  useEffect(() => {
    if (!user) return;
    supabase
      .from("streaming_channels")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("numero_canal", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCanais(
            data.map((d: any) => ({
              id: d.id,
              numero_canal: d.numero_canal || "",
              name: d.name,
              logo_url: d.logo_url || "",
              url: d.url,
              type: d.type,
              active: d.active,
              cover_url: d.cover_url || "",
              background_url: d.background_url || "",
            }))
          );
        }
        setLoading(false);
      });
  }, [user]);

  // Load programs
  useEffect(() => {
    if (!user) return;
    supabase
      .from("programas")
      .select("*")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("horario_inicio")
      .then(({ data }) => {
        if (data) setProgramas(data as Programa[]);
      });
  }, [user]);

  // Poll music data from localStorage (set by MusicaNoAr module)
  useEffect(() => {
    const readMusic = () => {
      try {
        const raw = localStorage.getItem(MUSIC_DATA_KEY);
        if (raw) setMusicData(JSON.parse(raw));
      } catch {}
    };
    readMusic();
    const interval = setInterval(readMusic, 3000);
    return () => clearInterval(interval);
  }, []);

  // Buffering detection for video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  // Buffering detection for audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("canplay", onCanPlay);
    return () => {
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  // Play stream
  const playStream = useCallback(
    (url: string, type: string) => {
      // Cleanup previous HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setBuffering(true);

      if (type === "audio_live" || type === "audio") {
        // Stop video
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.src = "";
        }
        // Play audio
        const audio = audioRef.current;
        if (!audio) return;
        if (Hls.isSupported() && url.includes(".m3u8")) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            audio.play().then(() => setBuffering(false)).catch(() => {});
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
        } else {
          audio.src = url;
          audio.play().catch(() => {});
        }
      } else {
        // Stop audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        // Play video
        const video = videoRef.current;
        if (!video) return;
        if (Hls.isSupported() && url.includes(".m3u8")) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().then(() => setBuffering(false)).catch(() => {});
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
        } else {
          video.src = url;
          video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
        }
      }
      setPlaying(true);
    },
    []
  );

  const handlePlayCanal = () => {
    if (!canal) return;
    if (canal.type === "youtube") {
      setPlaying(true);
      setBuffering(false);
      return;
    }
    playStream(canal.url, canal.type);
  };

  const navigateChannel = (dir: 1 | -1) => {
    if (canais.length === 0) return;
    const next = (currentIndex + dir + canais.length) % canais.length;
    setCurrentIndex(next);
    if (playing) {
      setTimeout(() => {
        const c = canais[next];
        if (c) playStream(c.url, c.type);
      }, 100);
    }
  };

  // Fullscreen
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
    if (audioRef.current) audioRef.current.muted = newMuted;
  };

  // Bar hover logic — only trigger on the bottom bar area
  const showBar = () => {
    setBarVisible(true);
    clearTimeout(hideTimeout.current);
  };
  const hideBar = () => {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setBarVisible(false), 500);
  };

  useEffect(() => {
    hideTimeout.current = setTimeout(() => setBarVisible(false), 4000);
    return () => clearTimeout(hideTimeout.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, []);

  const currentProg = getCurrentProgram(programas);
  const nextProg = getNextProgram(programas, currentProg);
  const progress = getProgramProgress(currentProg);

  // Determine background image
  const bgImage = isAudio
    ? canal?.cover_url || canal?.background_url
    : isYoutube
    ? canal?.cover_url || canal?.background_url
    : null;

  // "No Ar" label
  const noArLabel = canal
    ? currentProg
      ? `${canal.name} - ${currentProg.nome}`
      : canal.name
    : "Sem programação";

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <Loader2 className="animate-spin" size={48} style={{ color: "#d30707" }} />
      </div>
    );
  }

  // Extract YouTube playlist ID
  const youtubePlaylistId = isYoutube && canal?.url
    ? (() => {
        const match = canal.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
      })()
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen bg-black overflow-hidden cursor-pointer select-none"
    >
      {/* Background image for audio/youtube channels */}
      {bgImage && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${bgImage})`,
            filter: "blur(8px) brightness(0.4)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Video element (hidden for audio/youtube channels) */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-contain bg-black ${isAudio || isYoutube ? "hidden" : ""}`}
        muted={muted}
        playsInline
        autoPlay={false}
      />

      {/* YouTube playlist iframe */}
      {isYoutube && playing && youtubePlaylistId && (
        <iframe
          className="absolute inset-0 w-full h-full z-10"
          src={`https://www.youtube.com/embed/videoseries?list=${youtubePlaylistId}&autoplay=1`}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          style={{ border: "none" }}
        />
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} muted={muted} />

      {/* Buffering overlay */}
      {buffering && playing && !isYoutube && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <Loader2 className="animate-spin" size={56} style={{ color: "#d30707" }} />
        </div>
      )}

      {/* Audio channel: show music cover */}
      {isAudio && playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          {musicData?.capa ? (
            <img
              src={musicData.capa}
              alt={musicData.titulo}
              className="w-64 h-64 rounded-2xl object-cover shadow-2xl mb-6"
            />
          ) : canal?.logo_url ? (
            <img
              src={canal.logo_url}
              alt={canal.name}
              className="w-48 h-48 rounded-2xl object-contain mb-6"
            />
          ) : null}
          {musicData && (
            <div className="text-center">
              <div className="text-white text-2xl font-bold">{musicData.titulo}</div>
              <div className="text-white/60 text-lg mt-1">{musicData.artista}</div>
            </div>
          )}
        </div>
      )}

      {/* Idle state (no video playing) */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10">
          {canal?.logo_url && (
            <img src={canal.logo_url} alt={canal.name} className="w-32 h-32 object-contain mb-6 rounded-xl" />
          )}
          <h1 className="text-white text-3xl font-bold mb-2">{canal?.name || "Nenhum canal"}</h1>
          {canal && (
            <p className="text-white/50 text-sm mb-8">Canal {canal.numero_canal}</p>
          )}
          {canal && (
            <button
              onClick={handlePlayCanal}
              className="flex items-center gap-2 text-white px-8 py-3 rounded-full font-bold text-lg transition-all"
              style={{ backgroundColor: "#e60000" }}
            >
              <Play size={20} fill="white" /> Assistir
            </button>
          )}
        </div>
      )}

      {/* Control bar hover zone — taller invisible area at the bottom */}
      <div
        className="absolute left-0 right-0 bottom-0 z-30"
        style={{ height: "140px" }}
        onMouseEnter={showBar}
        onMouseLeave={hideBar}
      >
        <div
          className="absolute left-5 right-5 bottom-5 transition-all duration-400 ease-in-out"
          style={{
            opacity: barVisible ? 1 : 0,
            transform: barVisible ? "translateY(0)" : "translateY(20px)",
            pointerEvents: barVisible ? "auto" : "none",
          }}
        >
        <div
          className="flex items-center gap-0 rounded-2xl border border-white/10 px-5 py-3"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}
        >
          {/* Channel Info */}
          <div className="flex items-center gap-3 pr-5 border-r border-white/10 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => navigateChannel(-1)}
                className="text-white/60 hover:text-white transition-colors"
                title="Canal anterior"
              >
                <ChevronUp size={16} />
              </button>
              {canal?.logo_url ? (
                <img src={canal.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                  {canal?.numero_canal || "?"}
                </div>
              )}
              <button
                onClick={() => navigateChannel(1)}
                className="text-white/60 hover:text-white transition-colors"
                title="Próximo canal"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="text-center">
              <div className="text-white text-xs font-bold">{canal?.numero_canal || "--"}</div>
              <button
                onClick={handlePlayCanal}
                className="mt-1 flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all"
                style={{ backgroundColor: "#e60000" }}
              >
                <Play size={10} fill="white" /> Play Canal
              </button>
            </div>
          </div>

          {/* Program Info */}
          <div className="flex-1 px-5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#e60000" }}>No Ar:</span>
            <div className="text-white text-lg font-bold truncate leading-tight mt-0.5">
              {noArLabel}
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress}%`, backgroundColor: "#e60000" }}
              />
            </div>
            <span className="text-[10px] mt-1 inline-block" style={{ color: "#e60000" }}>
              {currentProg
                ? `${currentProg.horario_inicio} - ${currentProg.horario_fim}`
                : "--:-- - --:--"}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 px-5 border-l border-white/10 shrink-0">
            <button className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px] font-bold transition-all" style={{ color: "#e60000" }}>
              CC
            </button>
            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition-colors"
              title={fullscreen ? "Sair tela cheia" : "Tela cheia"}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
            <button className="bg-white/10 hover:bg-white/20 text-white/70 rounded-full w-8 h-8 flex items-center justify-center transition-all">
              <MessageSquare size={14} />
            </button>
            <button
              onClick={toggleMute}
              className="text-white/70 hover:text-white transition-colors"
              title={muted ? "Ativar som" : "Desativar som"}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          {/* Next / Schedule */}
          <div className="pl-5 border-l border-white/10 shrink-0">
            <span className="text-[10px] font-bold uppercase" style={{ color: "#e60000" }}>A seguir:</span>
            <div className="text-white text-sm truncate max-w-[180px]">
              {nextProg?.nome || "Sem programação"}
            </div>
            <span className="text-[10px]" style={{ color: "#e60000" }}>
              {nextProg
                ? `${nextProg.horario_inicio} - ${nextProg.horario_fim}`
                : "--:-- - --:--"}
            </span>
            <div className="mt-1">
              <button className="flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all" style={{ backgroundColor: "#e60000" }}>
                + Grade
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

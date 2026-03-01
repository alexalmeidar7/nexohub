import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, startOfWeek } from "date-fns";
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
  List,
  X,
  Plus,
} from "lucide-react";

interface YoutubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
}

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
  estudio: string | null;
  variavel: boolean;
  data_variavel: string | null;
  capa: string | null;
  descricao: string | null;
}

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

const MUSIC_DATA_KEY = "masterview_music_data";
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function getCurrentProgram(programas: Programa[]): Programa | null {
  const now = new Date();
  const dayMapShort: Record<number, string> = {
    0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
  };
  const dayMapFull: Record<number, string> = {
    0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado",
  };
  const todayShort = dayMapShort[now.getDay()];
  const todayFull = dayMapFull[now.getDay()];
  const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

  return (
    programas.find((p) => {
      if (!p.ativo) return false;
      const dias = p.dias_semana || [];
      const inDay = dias.length === 0 || dias.includes(todayShort) || dias.includes(todayFull);
      return inDay && currentTime >= p.horario_inicio.slice(0, 5) && currentTime < p.horario_fim.slice(0, 5);
    }) || null
  );
}

function getNextProgram(programas: Programa[], current: Programa | null): Programa | null {
  if (!current) return programas.find((p) => p.ativo) || null;
  const now = new Date();
  const dayMapShort: Record<number, string> = {
    0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
  };
  const dayMapFull: Record<number, string> = {
    0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado",
  };
  const todayShort = dayMapShort[now.getDay()];
  const todayFull = dayMapFull[now.getDay()];

  const sorted = programas
    .filter((p) => p.ativo && p.horario_inicio.slice(0, 5) >= current.horario_fim.slice(0, 5))
    .filter((p) => {
      const dias = p.dias_semana || [];
      return dias.length === 0 || dias.includes(todayShort) || dias.includes(todayFull);
    })
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

// Grade helpers for the popup
const DIAS_MAP_FULL: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };

function generateGradeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00:00`);
    slots.push(`${String(h).padStart(2, "0")}:30:00`);
  }
  return slots;
}

export default function PlayerPage() {
  const [detailProg, setDetailProg] = useState<Programa | null>(null);
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
  const [volume, setVolume] = useState(80);
  const [volumeHover, setVolumeHover] = useState(false);
  const volumeHideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<YoutubeVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [clock, setClock] = useState(0); // forces periodic re-render for currentProg
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

  // Fetch YouTube playlist videos when channel is YouTube
  useEffect(() => {
    if (!isYoutube || !canal?.url) {
      setYoutubeVideos([]);
      setSelectedVideoId(null);
      return;
    }
    const match = canal.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (!match) return;
    const playlistId = match[1];
    supabase.functions
      .invoke("youtube-playlist", { body: { playlistId } })
      .then(({ data }) => {
        if (data?.videos) {
          setYoutubeVideos(data.videos);
          setSidebarOpen(true);
        }
      });
  }, [canal?.url, isYoutube]);

  // Poll music data from localStorage every 1s for real-time updates
  useEffect(() => {
    const readMusic = () => {
      try {
        const raw = localStorage.getItem(MUSIC_DATA_KEY);
        if (raw) {
          const parsed: MusicData = JSON.parse(raw);
          // Always set a new object to force re-render
          setMusicData({ ...parsed });
        }
      } catch {}
    };
    readMusic();
    const interval = setInterval(readMusic, 1000);
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

  // Play stream — always fresh URL with cache bust for audio
  const playStream = useCallback(
    (url: string, type: string) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setBuffering(true);

      // Add cache buster for audio streams
      const freshUrl = url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;

      if (type === "audio_live" || type === "audio") {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.src = "";
        }
        const audio = audioRef.current;
        if (!audio) return;
        if (Hls.isSupported() && url.includes(".m3u8")) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            audio.play().then(() => setBuffering(false)).catch(() => {});
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
        } else {
          audio.src = freshUrl;
          audio.play().catch(() => {});
        }
      } else {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        const video = videoRef.current;
        if (!video) return;
        if (Hls.isSupported() && url.includes(".m3u8")) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().then(() => setBuffering(false)).catch(() => {});
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
        } else {
          video.src = freshUrl;
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

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    const v = val / 100;
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = false; }
    if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
    setMuted(val === 0);
  };

  const handleSelectVideo = (videoId: string) => {
    setSelectedVideoId(videoId);
    setPlaying(true);
    setBuffering(false);
  };

  // Volume hover with delay
  const showVolume = () => {
    clearTimeout(volumeHideTimeout.current);
    setVolumeHover(true);
  };
  const hideVolume = () => {
    clearTimeout(volumeHideTimeout.current);
    volumeHideTimeout.current = setTimeout(() => setVolumeHover(false), 800);
  };

  // Bar hover logic
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

  // Periodic clock tick to re-compute currentProg every 30s
  useEffect(() => {
    const interval = setInterval(() => setClock(c => c + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const currentProg = getCurrentProgram(programas);
  const nextProg = getNextProgram(programas, currentProg);
  const progress = getProgramProgress(currentProg);

  

  // "No Ar" label — for audio: show current program from grade; for others: canal + program
  const noArLabel = canal
    ? isAudio
      ? currentProg
        ? currentProg.nome
        : canal.name
      : currentProg
        ? `${canal.name} - ${currentProg.nome}`
        : canal.name
    : "Sem programação";

  // Grade data
  const gradeSlots = useMemo(() => generateGradeSlots(), []);
  const now = new Date();
  const diaAtual = DIAS_MAP_FULL[now.getDay()];
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekDates = useMemo(() => {
    const dates: Record<string, string> = {};
    DIAS_SEMANA.forEach((dia, i) => {
      const date = addDays(weekStart, i);
      dates[dia] = format(date, "dd/MM");
    });
    return dates;
  }, [weekStart.toDateString()]);

  const getDateForDay = (dia: string): string => {
    const idx = DIAS_SEMANA.indexOf(dia);
    const date = addDays(weekStart, idx);
    return format(date, "yyyy-MM-dd");
  };

  // Map programas to grade format with dia names
  const dayShortToFull: Record<string, string> = {
    seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo",
    Segunda: "Segunda", Terça: "Terça", Quarta: "Quarta", Quinta: "Quinta", Sexta: "Sexta", Sábado: "Sábado", Domingo: "Domingo",
  };

  const getProgramaForGradeSlot = (dia: string, slotTime: string) => {
    const dateForDay = getDateForDay(dia);
    const matching = programas.filter(p => {
      if (!p.ativo) return false;
      const dias = (p.dias_semana || []).map(d => dayShortToFull[d] || d);
      return dias.includes(dia) && slotTime >= p.horario_inicio && slotTime < p.horario_fim;
    });
    const variable = matching.find(p => p.variavel && p.data_variavel === dateForDay);
    if (variable) return variable;
    return matching.find(p => !p.variavel) || matching[0] || undefined;
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <Loader2 className="animate-spin" size={48} style={{ color: "#d30707" }} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default"
    >
      {/* Background image for audio/youtube channels */}
      {isAudio && canal?.cover_url && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{
            backgroundImage: `url(${canal.cover_url})`,
          }}
        />
      )}
      {isYoutube && (canal?.cover_url || canal?.background_url) && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{
            backgroundImage: `url(${canal.cover_url || canal.background_url})`,
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

      {/* YouTube video iframe */}
      {isYoutube && selectedVideoId && (
        <iframe
          className="absolute inset-0 w-full h-full z-10"
          style={{ border: "none", left: sidebarOpen ? "320px" : "0", width: sidebarOpen ? "calc(100% - 320px)" : "100%" }}
          src={`https://www.youtube.com/embed/${selectedVideoId}`}
          allow="encrypted-media; fullscreen"
          allowFullScreen
        />
      )}

      {/* YouTube playlist sidebar */}
      {isYoutube && sidebarOpen && (
        <div className="absolute left-0 top-0 bottom-0 w-80 z-20 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.95)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white text-sm font-bold flex items-center gap-2"><List size={14} /> Playlist</span>
            <button onClick={() => setSidebarOpen(false)} className="text-white/50 hover:text-white text-xs">Fechar</button>
          </div>
          <div className="flex flex-col">
            {youtubeVideos.map((v, i) => (
              <button
                key={v.videoId}
                onClick={() => handleSelectVideo(v.videoId)}
                className={`flex items-start gap-3 px-3 py-2 text-left hover:bg-white/10 transition-colors ${selectedVideoId === v.videoId ? "bg-white/10" : ""}`}
              >
                <img src={v.thumbnail} alt="" className="w-28 h-16 rounded object-cover shrink-0" />
                <div className="min-w-0">
                  <div className="text-white text-xs font-semibold line-clamp-2">{v.title}</div>
                  <div className="text-white/40 text-[10px] mt-1">#{i + 1}</div>
                </div>
              </button>
            ))}
            {youtubeVideos.length === 0 && (
              <div className="text-white/40 text-xs text-center py-8">Carregando playlist...</div>
            )}
          </div>
        </div>
      )}

      {/* Toggle sidebar button when closed */}
      {isYoutube && !sidebarOpen && youtubeVideos.length > 0 && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-3 z-20 bg-black/70 hover:bg-black/90 text-white rounded-lg px-3 py-2 text-xs flex items-center gap-1 transition-all"
        >
          <List size={14} /> Playlist
        </button>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} muted={muted} />

      {/* Buffering overlay — only for video, not audio */}
      {buffering && playing && !isYoutube && !isAudio && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <Loader2 className="animate-spin" size={56} style={{ color: "#d30707" }} />
        </div>
      )}

      {/* Audio channel: show music cover + info at left 350px */}
      {isAudio && playing && (
        <div className="absolute inset-0 flex items-center z-10" style={{ paddingLeft: "350px" }}>
          <div className="flex flex-col items-center">
            {musicData?.capa ? (
              <img
                key={musicData.capa}
                src={musicData.capa}
                alt={musicData.titulo}
                className="w-64 h-64 rounded-2xl object-cover shadow-2xl mb-6 transition-all duration-500"
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
                <div className="text-white text-2xl font-bold drop-shadow-lg">{musicData.titulo}</div>
                <div className="text-white/70 text-lg mt-1 drop-shadow-lg">{musicData.artista}</div>
              </div>
            )}
          </div>
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

      {/* Grade Dialog — rendered inside containerRef so it works in fullscreen */}
      {gradeOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <div className="relative w-[95vw] max-h-[90vh] rounded-lg overflow-hidden" style={{ backgroundColor: "#111" }}>
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: "#d30707" }}>
            <div className="text-white text-lg font-bold flex items-center gap-2">
              <span style={{ color: "#d30707" }}>■</span> Grade de Programação
            </div>
            <button onClick={() => { setGradeOpen(false); setDetailProg(null); }} className="hover:opacity-80 transition-opacity" style={{ color: "#d30707" }}>
              <X size={20} />
            </button>
          </div>
          <div
            className="overflow-auto max-h-[75vh] px-4 pb-4 grade-scroll"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#d30707 #222",
            }}
          >
            <style>{`
              .grade-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
              .grade-scroll::-webkit-scrollbar-track { background: #222; border-radius: 4px; }
              .grade-scroll::-webkit-scrollbar-thumb { background: #d30707; border-radius: 4px; }
              .grade-scroll::-webkit-scrollbar-thumb:hover { background: #ff1a1a; }
              .grade-cell:hover { outline: 2px solid #ed0808 !important; outline-offset: -1px; }
            `}</style>
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: "#111" }}>
                <tr>
                  <th className="px-2 py-2 text-left w-20 rounded-lg" style={{ color: "#d30707" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => (
                    <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "font-bold" : ""}`}
                      style={{ color: dia === diaAtual ? "#d30707" : "#999" }}>
                      <div>{dia.slice(0, 3)}</div>
                      <div className="text-[9px] font-normal opacity-70">{weekDates[dia]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const skipMap: Record<string, boolean> = {};
                  const spanMap: Record<string, { prog: Programa; rowSpan: number }> = {};

                  DIAS_SEMANA.forEach(dia => {
                    let i = 0;
                    while (i < gradeSlots.length) {
                      const slot = gradeSlots[i];
                      const prog = getProgramaForGradeSlot(dia, slot);
                      if (prog) {
                        let span = 1;
                        while (i + span < gradeSlots.length) {
                          const nextProg = getProgramaForGradeSlot(dia, gradeSlots[i + span]);
                          if (nextProg && nextProg.id === prog.id) {
                            skipMap[`${dia}-${gradeSlots[i + span]}`] = true;
                            span++;
                          } else break;
                        }
                        spanMap[`${dia}-${slot}`] = { prog, rowSpan: span };
                        i += span;
                      } else {
                        i++;
                      }
                    }
                  });

                  return gradeSlots.map(slot => (
                    <tr key={slot}>
                      <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "#666" }}>{slot.slice(0, 5)}</td>
                      {DIAS_SEMANA.map(dia => {
                        const key = `${dia}-${slot}`;
                        if (skipMap[key]) return null;
                        const cellData = spanMap[key];
                        if (!cellData) {
                          return <td key={dia} className="px-1 py-1 rounded-lg" style={{ backgroundColor: "transparent" }} />;
                        }
                        const { prog, rowSpan } = cellData;
                        const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horario_inicio && currentTimeStr < prog.horario_fim;
                        return (
                          <td
                            key={dia}
                            rowSpan={rowSpan}
                            className="px-1 py-1 text-center rounded-lg transition-all grade-cell relative group"
                            style={{
                              backgroundColor: isOnAir ? "#d30707" : "rgba(211,7,7,0.15)",
                              color: isOnAir ? "#fff" : "#ccc",
                              fontWeight: isOnAir ? "bold" : "normal",
                              verticalAlign: "middle",
                              cursor: "pointer",
                            }}
                            onClick={() => setDetailProg(prog)}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] truncate">{prog.nome}</span>
                              <Plus size={10} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-[8px] opacity-60 mt-0.5">
                              {prog.horario_inicio.slice(0, 5)} - {prog.horario_fim.slice(0, 5)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {/* Program detail popup */}
          {detailProg && (
            <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
              <div className="rounded-xl p-6 max-w-md w-full mx-4 relative" style={{ backgroundColor: "#1a1a1a", border: "1px solid #d30707" }}>
                <button onClick={() => setDetailProg(null)} className="absolute top-3 right-3 hover:opacity-80" style={{ color: "#d30707" }}>
                  <X size={18} />
                </button>
                {detailProg.capa && (
                  <img src={detailProg.capa} alt={detailProg.nome} className="w-full h-40 object-cover rounded-lg mb-4" />
                )}
                {detailProg.selo && !detailProg.capa && (
                  <img src={detailProg.selo} alt={detailProg.nome} className="w-24 h-24 object-contain mx-auto mb-4" />
                )}
                <h3 className="text-white text-lg font-bold mb-1">{detailProg.nome}</h3>
                <div className="text-xs mb-2" style={{ color: "#d30707" }}>
                  {detailProg.horario_inicio.slice(0, 5)} - {detailProg.horario_fim.slice(0, 5)}
                </div>
                {detailProg.estudio && (
                  <div className="text-white/50 text-xs mb-2">Estúdio: {detailProg.estudio}</div>
                )}
                {detailProg.dias_semana && detailProg.dias_semana.length > 0 && (
                  <div className="text-white/50 text-xs mb-2">Dias: {detailProg.dias_semana.join(", ")}</div>
                )}
                {detailProg.descricao && (
                  <p className="text-white/70 text-sm mt-3 leading-relaxed">{detailProg.descricao}</p>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Control bar hover zone */}
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
                className="mt-1 flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all hover:!bg-black"
                style={{ backgroundColor: "#e60000", border: "1px solid transparent" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#ed0808"; e.currentTarget.style.backgroundColor = "#000"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.backgroundColor = "#e60000"; }}
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
            {currentProg && (
              <div className="text-white/50 text-xs mt-0.5 truncate">
                {currentProg.nome} • {currentProg.horario_inicio.slice(0, 5)} - {currentProg.horario_fim.slice(0, 5)}
                {musicData?.titulo && (
                  <span className="ml-2 text-white/70">
                    ♫ {musicData.titulo} — {musicData.artista}
                  </span>
                )}
              </div>
            )}
            {!currentProg && musicData?.titulo && (
              <div className="text-white/50 text-xs mt-0.5 truncate">
                ♫ {musicData.titulo} — {musicData.artista}
              </div>
            )}
            <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress}%`, backgroundColor: "#e60000" }}
              />
            </div>
            <span className="text-[10px] mt-1 inline-block" style={{ color: "#e60000" }}>
              {currentProg
                ? `${currentProg.horario_inicio.slice(0, 5)} - ${currentProg.horario_fim.slice(0, 5)}`
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
            {/* Volume button + slider with extended hover area */}
            <div
              className="relative"
              onMouseEnter={showVolume}
              onMouseLeave={hideVolume}
            >
              <button
                onClick={toggleMute}
                className="text-white/70 hover:text-white transition-colors"
                title={muted ? "Ativar som" : "Desativar som"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              {/* Volume slider popup */}
              {volumeHover && (
                <div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/95 rounded-lg px-3 py-4 flex flex-col items-center"
                  style={{ height: "140px", width: "40px" }}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="h-full appearance-none cursor-pointer"
                    style={{
                      writingMode: "vertical-lr",
                      direction: "rtl",
                      width: "6px",
                      accentColor: "#e60000",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-white/60 text-[9px] mt-1">{volume}</span>
                </div>
              )}
            </div>
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
              <button
                onClick={() => setGradeOpen(true)}
                className="flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all"
                style={{ backgroundColor: "#e60000", border: "1px solid transparent" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#ed0808"; e.currentTarget.style.backgroundColor = "#000"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.backgroundColor = "#e60000"; }}
              >
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

import { useState, useEffect, lazy, Suspense, useRef } from "react";
import { Radio, ChevronRight, Clock, Loader2, ArrowRight, Mic, Music, User, Video, Volume2, VolumeX, MonitorPlay, X, Play, Pause } from "lucide-react";
import { getApresentadores } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const DashboardGradeDialog = lazy(() => import("./DashboardGradeDialog"));

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  selo: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
  classificacaoEtaria: string;
}

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

async function getProgramas(): Promise<Programa[]> {
  const { data } = await supabase.from("programas").select("*").ilike("estudio", "%fm%");
  if (!data) return [];
  return data.map(p => ({
    id: p.id,
    nome: p.nome,
    apresentadorId: p.apresentador_id || "",
    selo: p.selo || "",
    diasSemana: p.dias_semana || [],
    horarioInicio: p.horario_inicio,
    horarioFim: p.horario_fim,
    estudio: p.estudio || "",
    classificacaoEtaria: p.classificacao_etaria || "",
  }));
}

export function findCurrentProgram(programas: Programa[]): { programa: Programa; progress: number } | null {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  for (const p of programas) {
    if (p.diasSemana.includes(diaAtual) && horaAtual >= p.horarioInicio && horaAtual < p.horarioFim) {
      const [sh, sm] = p.horarioInicio.split(":").map(Number);
      const [eh, em] = p.horarioFim.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const progress = Math.min(100, Math.max(0, ((currentMin - startMin) / (endMin - startMin)) * 100));
      return { programa: p, progress };
    }
  }
  return null;
}

function findNextPrograms(programas: Programa[], count: number): Programa[] {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return programas
    .filter(p => p.diasSemana.includes(diaAtual) && p.horarioInicio > horaAtual)
    .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
    .slice(0, count);
}

interface ApresentadorInfo {
  nome: string;
  foto: string;
}

export default function OnAirWidget() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [onAir, setOnAir] = useState<{ programa: Programa; progress: number } | null>(null);
  const [apresentadorNome, setApresentadorNome] = useState("");

  const [nextPrograms, setNextPrograms] = useState<Programa[]>([]);
  const [nextApresentadores, setNextApresentadores] = useState<Record<string, ApresentadorInfo>>({});
  const [musicData, setMusicData] = useState<{ titulo?: string; artista?: string; capa?: string } | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "video">("info");
  const [volume, setVolume] = useState(66);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    const isVideoTab = activeTab === "video";

    if (audio) {
      audio.volume = isMuted ? 0 : volume / 100;
      audio.muted = isMuted;
      
      if (isPlaying && !isVideoTab) {
        audio.play().catch(() => setIsPlaying(false));
      } else {
        audio.pause();
      }
    }

    if (video) {
      video.volume = isMuted ? 0 : volume / 100;
      video.muted = isMuted;

      if (isPlaying && isVideoTab) {
        video.play().catch(() => setIsPlaying(false));
      } else {
        video.pause();
      }
    }
  }, [volume, isMuted, activeTab, isPlaying]);

  useEffect(() => {
    const update = async () => {
      const [programas, apresentadores] = await Promise.all([getProgramas(), getApresentadores()]);
      const current = findCurrentProgram(programas);
      setOnAir(current);
      if (current) {
        const ap = apresentadores.find(a => a.id === current.programa.apresentadorId);
        setApresentadorNome(ap?.nome || "—");
      }
      
      const { data: channels } = await supabase.from("streaming_channels").select("url, type, user_id").eq("active", true).eq("user_id", user?.id);
      
      if (channels && channels.length > 0) {
        const audioChannel = channels.find(c => c.type === 'audio_live');
        const videoChannel = channels.find(c => c.type === 'video_live');
        
        // Verificação extra de segurança para garantir que o user_id dos canais corresponde ao usuário logado
        const unauthorized = channels.some(c => c.user_id !== user?.id);
        
        if (unauthorized) {
          console.error("Segurança: Tentativa de carregar streaming de outro usuário bloqueada.");
          setIsUnauthorized(true);
          setAudioUrl("");
          setVideoUrl("");
          setIsPlaying(false);
        } else {
          setIsUnauthorized(false);
          if (audioChannel?.url) setAudioUrl(audioChannel.url);
          if (videoChannel?.url) setVideoUrl(videoChannel.url);
        }
      } else {
        setAudioUrl("");
        setVideoUrl("");
      }

      const nexts = findNextPrograms(programas, 3);
      setNextPrograms(nexts);
      const apMap: Record<string, ApresentadorInfo> = {};
      nexts.forEach(p => {
        const ap = apresentadores.find(a => a.id === p.apresentadorId);
        apMap[p.id] = { nome: ap?.nome || "—", foto: ap?.foto || "" };
      });
      setNextApresentadores(apMap);
      setLoading(false);
    };
    update();
    const interval = setInterval(update, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const key = `masterview_music_data::${user.id}`;
    const readMusic = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          setMusicData({ 
            titulo: parsed.titulo || parsed.title, 
            artista: parsed.artista || parsed.artist,
            capa: parsed.capa || parsed.cover || parsed.art
          });
        }
      } catch {}
    };
    readMusic();
    const mi = setInterval(readMusic, 3000);
    return () => clearInterval(mi);
  }, [user?.id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="h-full relative flex flex-col no-scrollbar">
      {/* Header removido conforme solicitado */}

      <div className="flex-1 relative min-h-0">
        <div className="h-full relative flex flex-col justify-center py-4">
          <audio 
            ref={audioRef}
            src={audioUrl}
            autoPlay={isPlaying && activeTab === "info"}
            muted={isMuted}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, color-mix(in srgb, var(--layout-accent-color) 8%, transparent), transparent 70%)" }} />

          {/* Video Overlay (Positioned exactly above the music info) */}
          {activeTab === "video" && (
            <div className="fixed md:absolute bottom-full left-4 right-4 md:left-0 md:right-0 z-[999999] h-[220px] mb-4 md:mx-4 flex flex-col rounded-3xl overflow-hidden bg-black shadow-[0_-20px_50px_rgba(0,0,0,0.9)] border border-white/10 animate-in slide-in-from-bottom duration-500">
              <div className="relative flex-1 min-h-0 overflow-hidden">
                <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-accent" size={24} /></div>}>
                  <video 
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    src={videoUrl}
                    autoPlay={isPlaying}
                    playsInline
                    muted={isMuted}
                  />
                </Suspense>
                
                <div className="absolute top-4 right-4">
                  <button 
                    onClick={() => setActiveTab("info")}
                    className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/80 transition-all shadow-xl"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Badge "Ao Vivo" removido conforme solicitado */}
              </div>
            </div>
          )}

          {/* Main Content (Always visible) */}
          <div className="relative z-10 px-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl group/music-card relative flex-shrink-0">
                {musicData?.capa ? (
                  <img src={musicData.capa} alt="Capa" className="w-full h-full object-cover transition-transform duration-700 group-hover/music-card:scale-110" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20 bg-gradient-to-br from-white/10 to-transparent">
                    <Music size={28} style={{ color: "var(--layout-accent-color)" }} />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-white leading-tight truncate mb-1 drop-shadow-sm uppercase tracking-tight">
                  {isUnauthorized ? "Acesso Não Autorizado" : (musicData?.titulo || "Programação Musical")}
                </h3>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: "var(--layout-accent-color)", opacity: 0.8 }}>
                  {isUnauthorized ? "Erro de Segurança" : (musicData?.artista || "Positiva FM")}
                </p>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-all shadow-lg group"
                  >
                    {isPlaying ? (
                      <Pause size={14} className="text-white fill-white group-hover:scale-110 transition-transform" />
                    ) : (
                      <Play size={14} className="text-white fill-white ml-0.5 group-hover:scale-110 transition-transform" />
                    )}
                  </button>

                  <div 
                    className="relative flex items-center"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    {showVolumeSlider && (
                      <div 
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-[9999]"
                        onMouseEnter={() => setShowVolumeSlider(true)}
                      >
                        <div className="h-24 w-1.5 bg-white/10 rounded-full relative cursor-pointer group">
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-white/40 rounded-full transition-all duration-150" 
                            style={{ height: `${isMuted ? 0 : volume}%`, backgroundColor: "var(--layout-accent-color)" }} 
                          />
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setVolume(val);
                              if (isMuted && val > 0) setIsMuted(false);
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none -rotate-180 [writing-mode:bt-lr]"
                            style={{ WebkitAppearance: 'slider-vertical' }}
                          />
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                      {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  </div>

                  <div className="flex items-center p-0.5 bg-white/[0.03] rounded-lg border border-white/5 shadow-inner ml-1">
                    <button 
                      onClick={() => setActiveTab("info")}
                      className={`px-3 py-1.5 rounded-md text-[7px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${activeTab === "info" ? "text-white shadow-lg" : "text-white/20 hover:text-white/40"}`}
                      style={activeTab === "info" ? { backgroundColor: "color-mix(in srgb, var(--layout-accent-color) 40%, #ffffff1a)" } : {}}
                    >
                      Ouvir
                    </button>
                    <button 
                      onClick={() => setActiveTab("video")}
                      className={`px-3 py-1.5 rounded-md text-[7px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${activeTab === "video" ? "text-white shadow-lg" : "text-white/20 hover:text-white/40"}`}
                      style={activeTab === "video" ? { backgroundColor: "color-mix(in srgb, var(--layout-accent-color) 40%, #ffffff1a)" } : {}}
                    >
                      Assistir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Suspense fallback={null}>
        <DashboardGradeDialog open={gradeOpen} onOpenChange={setGradeOpen} />
      </Suspense>
    </div>
  );
}

function UpcomingProgramsList({ programs, apresentadores }: { programs: Programa[]; apresentadores: Record<string, ApresentadorInfo> }) {
  if (programs.length === 0) return null;

  return (
    <div className="space-y-1 mt-2">
      <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1">
        <Clock size={10} /> Próximos
      </p>
      {programs.map(p => (
        <div key={p.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-[10px] truncate">{p.nome}</p>
            <p className="text-white/40 text-[8px] truncate">{apresentadores[p.id]?.nome || "—"}</p>
          </div>
          <p className="text-white/40 text-[8px] whitespace-nowrap font-mono">
            {p.horarioInicio} — {p.horarioFim}
          </p>
        </div>
      ))}
    </div>
  );
}
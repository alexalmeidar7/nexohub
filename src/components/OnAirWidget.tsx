import { useState, useEffect, lazy, Suspense } from "react";
import { Radio, ChevronRight, Clock, Loader2, ArrowRight, Mic, Music, User, Video, Volume2, VolumeX, MonitorPlay } from "lucide-react";
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
  const [apresentadorFoto, setApresentadorFoto] = useState("");
  const [nextPrograms, setNextPrograms] = useState<Programa[]>([]);
  const [nextApresentadores, setNextApresentadores] = useState<Record<string, ApresentadorInfo>>({});
  const [isHovered, setIsHovered] = useState(false);
  const [musicData, setMusicData] = useState<{ titulo?: string; artista?: string; capa?: string } | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [isStereo, setIsStereo] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "video">("info");
  const [isMuted, setIsMuted] = useState(false);

  // Fetch user avatar
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url, nome").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setUserAvatar(data.avatar_url);
      });
  }, [user]);

  // Fetch stereo from streaming channel
  useEffect(() => {
    if (!user) return;
    supabase.from("streaming_channels").select("is_stereo").eq("user_id", user.id).eq("active", true).ilike("estudio", "%fm%").limit(1).maybeSingle()
      .then(({ data }) => { setIsStereo(!!data?.is_stereo); });
  }, [user]);
  useEffect(() => {
    const update = async () => {
      const [programas, apresentadores] = await Promise.all([getProgramas(), getApresentadores()]);
      const current = findCurrentProgram(programas);
      setOnAir(current);
      if (current) {
        const ap = apresentadores.find(a => a.id === current.programa.apresentadorId);
        setApresentadorNome(ap?.nome || "—");
        setApresentadorFoto(ap?.foto || "");
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

  // Poll music data from per-user localStorage (scoped per user)
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

  const firstNext = nextPrograms[0] || null;
  const firstNextAp = firstNext ? nextApresentadores[firstNext.id] : null;

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-pulse">
        {/* NO AR label skeleton */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3.5 h-3.5 rounded-full bg-white/10" />
          <div className="w-12 h-3 rounded bg-white/10" />
        </div>
        {/* Program name skeleton */}
        <div className="flex-1 flex flex-col justify-center gap-2" style={{ maxWidth: "55%" }}>
          <div className="w-full h-5 rounded bg-white/10" />
          <div className="w-3/4 h-5 rounded bg-white/10" />
          <div className="w-24 h-2.5 rounded bg-white/10 mt-1" />
        </div>
        {/* Presenter skeleton */}
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-3 h-3 rounded-full bg-white/10" />
          <div className="w-28 h-3 rounded bg-white/10" />
        </div>
        {/* Progress bar skeleton */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="w-full h-1 bg-white/10" />
        </div>
        {/* Fake presenter photo placeholder */}
        <div className="absolute right-0 bottom-0 w-[50%] h-[80%] rounded-tl-2xl bg-white/5" />
      </div>
    );
  }

  if (!onAir) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <Radio size={16} className="text-white/70" />
          <span className="font-semibold text-white text-sm">NO AR</span>
        </div>
        <p className="text-white/50 text-xs">Nenhum programa no ar neste momento.</p>
        <UpcomingProgramsList programs={nextPrograms} apresentadores={nextApresentadores} />
      </div>
    );
  }

  const { programa, progress } = onAir;

  return (
    <div className="h-full relative overflow-hidden flex flex-col no-scrollbar">
      {/* Tab Switcher - Minimalist Pill Style */}
      <div className="flex items-center p-1 bg-white/[0.03] rounded-2xl mb-4 self-center w-full max-w-[200px] flex-shrink-0">
        <button 
          onClick={() => setActiveTab("info")}
          className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === "info" ? "bg-white/10 text-white shadow-sm" : "text-white/20 hover:text-white/40"}`}
        >
          Informações
        </button>
        <button 
          onClick={() => setActiveTab("video")}
          className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === "video" ? "bg-white/10 text-white shadow-sm" : "text-white/20 hover:text-white/40"}`}
        >
          Vídeo
        </button>
      </div>

      <div className="flex-1 relative min-h-0">
        {activeTab === "info" ? (
          <div className="h-full relative flex flex-col">
            {/* Background Accent Gradient - Subtle */}
            <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-transparent pointer-events-none" />

            {/* Presenter photo - Minimalist ghost effect */}
            {apresentadorFoto && (
              <img
                src={apresentadorFoto}
                alt={apresentadorNome}
                className="absolute object-contain pointer-events-none opacity-10 mix-blend-overlay grayscale transition-opacity duration-700"
                style={{ right: -10, bottom: -10, width: "60%", height: "80%", objectPosition: "right bottom" }}
              />
            )}

            {/* Content Top - Program Info */}
            <div className="relative z-10 flex-1 flex flex-col pt-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                  <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-accent">No Ar</span>
                </div>
                
                <button
                  onClick={() => setGradeOpen(true)}
                  className="p-2 text-white/20 hover:text-accent transition-colors"
                  title="Ver Grade"
                >
                  <Clock size={14} />
                </button>
              </div>

              <h3 className="text-2xl font-black text-white leading-[0.9] tracking-tighter mb-4 line-clamp-2 drop-shadow-sm uppercase italic italic-accent">{programa.nome}</h3>
              
              {/* Music info - Very Clean Card */}
              <div className="z-10 bg-white/[0.02] border border-white/[0.05] rounded-3xl p-4 mb-auto group/music-card hover:bg-white/[0.04] transition-all duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 flex-shrink-0 relative">
                    {musicData?.capa ? (
                      <img src={musicData.capa} alt="Capa" className="w-full h-full object-cover group-hover/music-card:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20">
                        <Music size={18} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-white leading-tight truncate mb-0.5">{musicData?.titulo || "Programação Musical"}</p>
                    <p className="text-[9px] font-bold text-white/30 truncate tracking-wide">{musicData?.artista || "Positiva FM"}</p>
                  </div>
                </div>
              </div>

              {/* Bottom Info - Presenter */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                    <User size={10} className="text-white/40" />
                  </div>
                  <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{apresentadorNome}</span>
                </div>
                
                <span className="text-[9px] font-bold text-white/20 tracking-tighter font-mono">
                  {programa.horarioInicio} — {programa.horarioFim}
                </span>
              </div>
            </div>

            {/* Progress Bar - Minimal line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/[0.02] overflow-hidden">
              <div
                className="h-full transition-all duration-1000"
                style={{ width: `${progress}%`, backgroundColor: "var(--layout-accent-color)" }}
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col rounded-2xl overflow-hidden bg-black/60 border border-white/10">
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-accent" /></div>}>
                <video 
                  className="w-full h-full object-contain"
                  src="https://video04.logicahost.com.br/radiopositivafm/radiopositivafm/chunklist_w896619194.m3u8"
                  autoPlay
                  playsInline
                  muted={isMuted}
                />
              </Suspense>
              
              {/* Video Overlay Controls */}
              <div className="absolute top-2 right-2 flex gap-2">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/80 transition-all"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">Canal de Vídeo Ao Vivo</span>
                </div>
              </div>
            </div>
          </div>
        )}
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

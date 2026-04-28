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
      {/* Tab Switcher */}
      <div className="flex items-center gap-1 mb-4 px-1 flex-shrink-0">
        <button 
          onClick={() => setActiveTab("info")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === "info" ? "bg-accent/15 text-accent shadow-[0_0_15px_rgba(var(--layout-accent-color-rgb),0.1)]" : "bg-white/[0.03] text-white/30 hover:bg-white/[0.08]"}`}
          style={activeTab === "info" ? { border: "1px solid color-mix(in srgb, var(--layout-accent-color) 40%, transparent)" } : {}}
        >
          <Radio size={12} />
          No Ar
        </button>
        <button 
          onClick={() => setActiveTab("video")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === "video" ? "bg-accent/15 text-accent shadow-[0_0_15px_rgba(var(--layout-accent-color-rgb),0.1)]" : "bg-white/[0.03] text-white/30 hover:bg-white/[0.08]"}`}
          style={activeTab === "video" ? { border: "1px solid color-mix(in srgb, var(--layout-accent-color, #c8ff00) 40%, transparent)" } : {}}
        >
          <MonitorPlay size={12} />
          Vídeo
        </button>
      </div>

      <div className="flex-1 relative min-h-0">
        {activeTab === "info" ? (
          <div className="h-full relative flex flex-col">
            {/* Presenter photo - refined opacity and blend */}
            {apresentadorFoto && (
              <img
                src={apresentadorFoto}
                alt={apresentadorNome}
                className="absolute object-contain pointer-events-none opacity-20 mix-blend-overlay grayscale"
                style={{ right: -20, bottom: -10, width: "65%", height: "95%", objectPosition: "right bottom" }}
              />
            )}

            {/* Top right grade button - cleaner */}
            <div className="absolute top-0 right-0 z-20">
              <button
                onClick={() => setGradeOpen(true)}
                className="bg-white/5 backdrop-blur-sm rounded-lg px-2.5 py-1 text-white/40 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all border border-white/5"
              >
                grade
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Radio size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} className="animate-pulse" />
              <span className="font-black text-[9px] uppercase tracking-[0.25em] animate-pulse" style={{ color: "var(--layout-accent-color, #c8ff00)" }}>Ao Vivo</span>
            </div>

            <div className="flex-1 flex flex-col justify-center z-10">
              <div className="flex flex-col gap-1 mb-4">
                <p className="font-black text-white text-2xl leading-none tracking-tighter drop-shadow-2xl line-clamp-2">{programa.nome}</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                    <Clock size={10} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />
                    <span className="text-[10px] font-bold text-white/60 tracking-wider">{programa.horarioInicio} — {programa.horarioFim}</span>
                  </div>
                  {programa.classificacaoEtaria && (
                    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-xl"
                      style={{
                        backgroundColor:
                          programa.classificacaoEtaria === "L" ? "#00a651" :
                          programa.classificacaoEtaria === "10" ? "#0095d9" :
                          programa.classificacaoEtaria === "12" ? "#f5a623" :
                          programa.classificacaoEtaria === "14" ? "#e67e22" :
                          programa.classificacaoEtaria === "16" ? "#e74c3c" :
                          programa.classificacaoEtaria === "18" ? "#1a1a1a" : "#666",
                      }}
                    >
                      {programa.classificacaoEtaria}
                    </span>
                  )}
                </div>
              </div>

              {/* Music info - More balanced */}
              <div className="z-10 bg-white/[0.03] backdrop-blur-xl rounded-2xl p-4 border border-white/5 mb-5 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/10 shadow-inner relative group/cover">
                    {musicData?.capa ? (
                      <img src={musicData.capa} alt="Capa" className="w-full h-full object-cover transition-transform duration-500 group-hover/cover:scale-110" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={20} className="text-white/10" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black text-accent/60 uppercase tracking-[0.2em] mb-1">No Ar agora</p>
                    <p className="text-sm font-black text-white leading-tight truncate drop-shadow-md">{musicData?.titulo || "Aguardando..."}</p>
                    <p className="text-[10px] font-bold text-white/40 truncate tracking-wide">{musicData?.artista || "Programação Musical"}</p>
                  </div>
                </div>
              </div>

              <div className="z-10 flex items-center gap-3 group cursor-pointer" onClick={() => setGradeOpen(true)}>
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20 group-hover:bg-accent/20 group-hover:scale-105 transition-all duration-300">
                  <Mic size={14} className="text-accent" />
                </div>
                <div>
                  <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-0.5">Apresentação</p>
                  <p className="font-black text-white text-[13px] tracking-tight group-hover:text-accent transition-colors">{apresentadorNome}</p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-10 pt-2">
              <div className="w-full h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-1000 shadow-[0_0_10px_rgba(var(--layout-accent-color-rgb),0.3)]"
                  style={{ width: `${progress}%`, backgroundColor: "var(--layout-accent-color, #c8ff00)" }}
                />
              </div>
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

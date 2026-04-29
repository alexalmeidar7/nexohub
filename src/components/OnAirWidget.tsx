import { useState, useEffect, lazy, Suspense } from "react";
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
  const [apresentadorFoto, setApresentadorFoto] = useState("");
  const [nextPrograms, setNextPrograms] = useState<Programa[]>([]);
  const [nextApresentadores, setNextApresentadores] = useState<Record<string, ApresentadorInfo>>({});
  const [musicData, setMusicData] = useState<{ titulo?: string; artista?: string; capa?: string } | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "video">("info");
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

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
    <div className="h-full relative overflow-hidden flex flex-col no-scrollbar">
      <div className="flex-1 relative min-h-0">
        {activeTab === "info" ? (
          <div className="h-full relative flex flex-col justify-center">
            <div className="flex items-center p-1 bg-white/[0.03] rounded-2xl mb-2 self-center w-full max-w-[160px] flex-shrink-0 border border-white/5 shadow-inner relative z-30">
              <button 
                onClick={() => setActiveTab("info")}
                className={`flex-1 py-1 rounded-xl text-[7px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === "info" ? "text-white shadow-xl" : "text-white/20 hover:text-white/40"}`}
                style={activeTab === "info" ? { backgroundColor: "color-mix(in srgb, var(--layout-accent-color) 40%, #ffffff1a)" } : {}}
              >
                Ouvir
              </button>
              <button 
                onClick={() => setActiveTab("video")}
                className="flex-1 py-1 rounded-xl text-[7px] font-black uppercase tracking-[0.2em] transition-all duration-500 text-white/20 hover:text-white/40"
              >
                Assistir
              </button>
            </div>

            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, color-mix(in srgb, var(--layout-accent-color) 8%, transparent), transparent 70%)" }} />

            <div className="relative z-10 px-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl group/music-card relative flex-shrink-0">
                  {musicData?.capa ? (
                    <img src={musicData.capa} alt="Capa" className="w-full h-full object-cover transition-transform duration-700 group-hover/music-card:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-20 bg-gradient-to-br from-white/10 to-transparent">
                      <Music size={24} style={{ color: "var(--layout-accent-color)" }} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/music-card:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                     <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 hover:bg-white/30 transition-all"
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-white leading-tight truncate mb-0.5 drop-shadow-sm uppercase tracking-tight">
                    {musicData?.titulo || "Programação Musical"}
                  </h3>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--layout-accent-color)", opacity: 0.8 }}>
                    {musicData?.artista || "Positiva FM"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button className="text-white/20 hover:text-white transition-colors">
                  <ChevronRight size={16} className="rotate-180" />
                </button>
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-all"
                >
                  {isPlaying ? (
                    <Pause size={16} className="text-white fill-white" />
                  ) : (
                    <Play size={16} className="text-white fill-white ml-0.5" />
                  )}
                </button>
                <button className="text-white/20 hover:text-white transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/[0.03] px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-sm w-[80%]">
              <button onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <VolumeX size={12} className="text-white/40" /> : <Volume2 size={12} className="text-white/40" />}
              </button>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/40 w-2/3" />
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 z-50 flex flex-col rounded-3xl overflow-hidden bg-black shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 animate-scale-in">
            <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
              {/* Internal Tab Switcher for Video View */}
              <div className="flex items-center p-1 bg-black/40 backdrop-blur-md rounded-2xl mt-4 self-center w-full max-w-[180px] flex-shrink-0 border border-white/10 shadow-xl z-50">
                <button 
                  onClick={() => setActiveTab("info")}
                  className="flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white transition-all"
                >
                  Ouvir
                </button>
                <button 
                  className="flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] text-white shadow-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color) 40%, #ffffff1a)" }}
                >
                  Assistir
                </button>
              </div>
              <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-accent" size={24} /></div>}>
                <video 
                  className="w-full h-full object-cover"
                  src="https://video04.logicahost.com.br/radiopositivafm/radiopositivafm/chunklist_w896619194.m3u8"
                  autoPlay
                  playsInline
                  muted={isMuted}
                />
              </Suspense>
              
              <div className="absolute top-4 right-4 flex gap-2">
                <button 
                  onClick={() => setActiveTab("info")}
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/80 transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">Ao Vivo</span>
                </div>

                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                   <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-accent transition-colors">
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-accent w-2/3" />
                  </div>
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
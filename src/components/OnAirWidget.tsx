import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Radio, ChevronRight, Clock, Loader2, ArrowRight, Mic, Music, User } from "lucide-react";
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
  const [musicData, setMusicData] = useState<{ titulo?: string; artista?: string } | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [isStereo, setIsStereo] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Publish this widget's card bottom as a CSS var so all Dialog popups
  // on the Home align "logo abaixo do box No Ar".
  useEffect(() => {
    const anchor = anchorRef.current;
    const target = anchor?.parentElement as HTMLElement | null;
    if (!target) return;
    const update = () => {
      const r = target.getBoundingClientRect();
      const bottom = Math.max(0, Math.round(r.bottom));
      document.documentElement.style.setProperty("--onair-bottom", `${bottom}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    const onWin = () => update();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    const interval = setInterval(update, 1000);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      clearInterval(interval);
      document.documentElement.style.removeProperty("--onair-bottom");
    };
  }, [loading, onAir, isHovered]);


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
      const [programasData, apresentadoresData] = await Promise.all([getProgramas(), getApresentadores()]);
      
      // Filter out programmes that have a cancelled event today
      let filteredProgramas = programasData;
      if (user) {
        const today = new Date().toISOString().split("T")[0];
        const { data: cancelledEvents } = await supabase
          .from("agenda_eventos")
          .select("programa_id")
          .eq("user_id", user.id)
          .eq("data", today)
          .eq("status", "cancelado");
        
        if (cancelledEvents && cancelledEvents.length > 0) {
          const cancelledIds = cancelledEvents.map(e => e.programa_id).filter(Boolean);
          filteredProgramas = programasData.filter(p => !cancelledIds.includes(p.id));
        }
      }

      const current = findCurrentProgram(filteredProgramas);
      setOnAir(current);
      if (current) {
        const ap = apresentadoresData.find(a => a.id === current.programa.apresentadorId);
        setApresentadorNome(ap?.nome || "—");
        setApresentadorFoto(ap?.foto || "");
      }
      const nexts = findNextPrograms(filteredProgramas, 3);
      setNextPrograms(nexts);
      const apMap: Record<string, ApresentadorInfo> = {};
      nexts.forEach(p => {
        const ap = apresentadoresData.find(a => a.id === p.apresentadorId);
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
          setMusicData({ titulo: parsed.titulo || parsed.title, artista: parsed.artista || parsed.artist });
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
        <span ref={anchorRef} className="hidden" aria-hidden="true" />
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
        <span ref={anchorRef} className="hidden" aria-hidden="true" />
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
    <div className="h-full relative overflow-hidden">
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {/* Next program click overlay */}
      {firstNext && (
        <div
          className="absolute inset-0 z-20 flex flex-col transition-all duration-500 ease-in-out"
          style={{
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
          }}
        >
          {firstNextAp?.foto && (
            <img
              src={firstNextAp.foto}
              alt={firstNextAp.nome}
              className="absolute object-contain pointer-events-none"
              style={{ right: 0, bottom: 0, width: "50%", height: "100%", objectPosition: "right bottom" }}
            />
          )}
          {/* Top right buttons */}
          <div className="absolute top-1 right-1 z-30 flex items-center gap-1">
            <button
              onClick={() => setIsHovered(false)}
              className="bg-white/10 rounded-full px-2 py-1 cursor-pointer"
            >
              <ArrowRight size={10} className="text-white/60 rotate-180" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1 pt-1 pl-1">
            <ArrowRight size={14} style={{ color: "var(--layout-accent-color)" }} />
            <span className="font-bold text-[10px]" style={{ color: "var(--layout-accent-color)" }}>PRÓXIMO</span>
          </div>

          <div className="flex-1 flex flex-col justify-center z-10 pl-1">
            <p className="font-bold text-white text-lg leading-tight line-clamp-2" style={{ maxWidth: "55%" }}>{firstNext.nome}</p>
            <p className="text-white/50 text-[10px] whitespace-nowrap mt-1">
              {firstNext.horarioInicio} — {firstNext.horarioFim}
            </p>
          </div>

          <div className="z-10 mb-4 pl-1 flex items-center gap-2">
            <p className="font-semibold text-white/80 text-xs">{firstNextAp?.nome}</p>
            <Avatar className="h-5 w-5 border border-white/20">
              {userAvatar ? <AvatarImage src={userAvatar} alt="Você" /> : null}
              <AvatarFallback className="bg-white/10 text-white/60 text-[8px]">
                <User size={10} />
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => { setIsHovered(false); setGradeOpen(true); }}
              className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Grade de programação"
            >
              <span className="text-white/70 text-[10px] font-bold leading-none">+</span>
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="w-full h-1 bg-white/20 overflow-hidden" />
          </div>
        </div>
      )}

      {/* Current program */}
      <div
        className="h-full relative flex flex-col transition-all duration-500"
        style={{ opacity: isHovered ? 0 : 1 }}
      >
        {/* Presenter photo - anchored to bottom, larger */}
        {apresentadorFoto && (
          <img
            src={apresentadorFoto}
            alt={apresentadorNome}
            className="absolute object-contain pointer-events-none"
            style={{ right: 0, bottom: 0, width: "60%", height: "100%", objectPosition: "right bottom" }}
          />
        )}

        {/* Top right buttons */}
        <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
          <button
            onClick={() => setGradeOpen(true)}
            className="bg-white/10 rounded-full px-2 py-1 text-white/60 text-[9px] font-semibold hover:bg-white/20 transition-colors cursor-pointer"
          >
            grade
          </button>
          {firstNext && (
            <div className="bg-white/10 rounded-full px-2 py-1 cursor-pointer" onClick={() => setIsHovered(true)}>
              <ArrowRight size={10} className="text-white/60" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Radio size={14} style={{ color: "var(--layout-accent-color)" }} className="animate-pulse" />
          <span className="font-bold text-xs animate-pulse" style={{ color: "var(--layout-accent-color)" }}>NO AR</span>
        </div>

        <div className="flex-1 flex flex-col justify-center z-10">
          <div className="flex items-center gap-1.5" style={{ maxWidth: "55%" }}>
            <p className="font-bold text-white text-lg leading-tight line-clamp-2">{programa.nome}</p>
            {programa.classificacaoEtaria && (
              <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold leading-none text-white"
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
                {programa.classificacaoEtaria === "L" ? "L" : `${programa.classificacaoEtaria}`}
              </span>
            )}
            {isStereo && (
              <span className="shrink-0 rounded px-1 py-0.5 text-[7px] font-bold leading-none tracking-wide"
                style={{ color: "var(--layout-accent-color)", border: "1px solid var(--layout-accent-color)", opacity: 0.7 }}
              >
                STEREO
              </span>
            )}
          </div>
          <p className="text-white/50 text-[10px] whitespace-nowrap mt-1">
            {programa.horarioInicio} — {programa.horarioFim}
          </p>
        </div>


        <div className="z-10 mb-4 flex items-center gap-1.5">
          <Mic size={12} style={{ color: "var(--layout-accent-color)" }} />
          <p className="font-semibold text-white/80 text-xs">{apresentadorNome}</p>
          <button
            onClick={() => setGradeOpen(true)}
            className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors cursor-pointer ml-1"
            title="Grade de programação"
          >
            <span className="text-white/70 text-[10px] font-bold leading-none">+</span>
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="w-full h-1 bg-white/20 overflow-hidden">
            <div
              className="h-full transition-all duration-1000"
              style={{ width: `${progress}%`, backgroundColor: "var(--layout-accent-color)" }}
            />
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

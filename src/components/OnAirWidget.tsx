import { useState, useEffect } from "react";
import { Radio, ChevronRight, Clock, Loader2, ArrowRight } from "lucide-react";
import { getApresentadores } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  selo: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
}

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

async function getProgramas(): Promise<Programa[]> {
  const { data } = await supabase.from("programas").select("*");
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
  const [loading, setLoading] = useState(true);
  const [onAir, setOnAir] = useState<{ programa: Programa; progress: number } | null>(null);
  const [apresentadorNome, setApresentadorNome] = useState("");
  const [apresentadorFoto, setApresentadorFoto] = useState("");
  const [nextPrograms, setNextPrograms] = useState<Programa[]>([]);
  const [nextApresentadores, setNextApresentadores] = useState<Record<string, ApresentadorInfo>>({});
  const [isHovered, setIsHovered] = useState(false);

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

  const firstNext = nextPrograms[0] || null;
  const firstNextAp = firstNext ? nextApresentadores[firstNext.id] : null;

  if (loading) {
    return (
      <div className="h-full flex items-center gap-2">
        <Loader2 size={16} className="text-white/50 animate-spin" />
        <span className="text-white/50 text-xs">Carregando dados</span>
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
    <div className="h-full relative overflow-hidden">
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
          <div className="absolute top-2 left-1 z-10 flex items-center gap-2">
            <ArrowRight size={14} className="text-white/60" />
            <span className="font-bold text-white/60 text-[10px]">PRÓXIMO</span>
          </div>
          <div className="absolute bottom-3 left-1 right-0 z-10">
            <p className="font-bold text-white truncate text-sm">{firstNext.nome}</p>
            <p className="text-white/50 text-[10px] truncate">{firstNextAp?.nome} • {firstNext.horarioInicio} — {firstNext.horarioFim}</p>
          </div>
          <button
            onClick={() => setIsHovered(false)}
            className="absolute top-1 right-1 z-30 bg-white/10 rounded-full px-2 py-1 cursor-pointer"
          >
            <ArrowRight size={10} className="text-white/60 rotate-180" />
          </button>
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
            style={{ right: 0, bottom: 0, width: "60%", height: "110%", objectPosition: "right bottom" }}
          />
        )}

        {/* Top right buttons */}
        <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
          <button className="bg-white/10 rounded-full px-2 py-1 text-white/60 text-[9px] font-semibold hover:bg-white/20 transition-colors">
            grade
          </button>
          {firstNext && (
            <div className="bg-white/10 rounded-full px-2 py-1 cursor-pointer">
              <ArrowRight size={10} className="text-white/60" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Radio size={14} style={{ color: "#268ffa" }} className="animate-pulse" />
          <span className="font-bold text-xs animate-pulse" style={{ color: "#268ffa" }}>NO AR</span>
        </div>

        <div className="flex-1 flex flex-col justify-center z-10">
          <p className="font-bold text-white text-lg leading-tight line-clamp-2" style={{ maxWidth: "55%" }}>{programa.nome}</p>
          <p className="text-white/50 text-[10px] whitespace-nowrap mt-1">
            {programa.horarioInicio} — {programa.horarioFim}
          </p>
        </div>

        <div className="z-10 mb-1">
          <p className="font-semibold text-white/80 text-xs">{apresentadorNome}</p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="w-full h-1 bg-white/20 overflow-hidden">
            <div
              className="h-full transition-all duration-1000"
              style={{ width: `${progress}%`, backgroundColor: "#268ffa" }}
            />
          </div>
        </div>
      </div>
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

import { useState, useEffect } from "react";
import { Radio, SkipForward, ChevronRight, Clock, Loader2 } from "lucide-react";
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

function findCurrentProgram(programas: Programa[]): { programa: Programa; progress: number } | null {
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
      <div className="space-y-4">
        <div className="rounded-xl p-5 flex items-start gap-2" style={{ backgroundColor: "#dff06f", height: 330 }}>
          <Loader2 size={16} className="text-gray-600 animate-spin" />
          <span className="text-gray-600 text-xs">Carregando dados</span>
        </div>
      </div>
    );
  }

  if (!onAir) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl p-5" style={{ backgroundColor: "#dff06f", height: 330 }}>
          <div className="flex items-center gap-2 mb-2">
            <Radio size={16} className="text-gray-600" />
            <span className="font-semibold text-gray-600 text-sm">No Ar</span>
          </div>
          <p className="text-gray-500 text-xs">Nenhum programa no ar neste momento.</p>
        </div>
        <UpcomingProgramsList programs={nextPrograms} apresentadores={nextApresentadores} />
      </div>
    );
  }

  const { programa, progress } = onAir;

  return (
    <div className="space-y-4">
      <div
        className="relative"
        style={{ height: 330 }}
        onMouseEnter={() => firstNext && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Next program box - behind, peeking from right */}
        {firstNext && (
          <div
            className="absolute top-0 rounded-xl overflow-hidden flex flex-col transition-all duration-500 ease-in-out"
            style={{
              backgroundColor: "#2d2d2d",
              height: 330,
              right: 0,
              width: isHovered ? "100%" : "0px",
              zIndex: isHovered ? 20 : 5,
              opacity: isHovered ? 1 : 0,
            }}
          >
            {isHovered && (
              <>
                {firstNextAp?.foto && (
                  <img
                    src={firstNextAp.foto}
                    alt={firstNextAp.nome}
                    className="absolute object-contain pointer-events-none"
                    style={{ right: 0, top: 0, width: "60%", height: "100%", objectPosition: "right top" }}
                  />
                )}

                <div className="absolute top-4 left-5 z-10 flex items-center gap-2 animate-fade-in">
                  <SkipForward size={16} className="text-gray-300" />
                  <span className="font-bold text-gray-300 text-sm">PRÓXIMO PROGRAMA</span>
                </div>

                <div className="absolute bottom-4 left-0 right-0 z-10 px-5 animate-fade-in">
                  <p className="font-bold text-white truncate" style={{ fontSize: 14 }}>{firstNext.nome}</p>
                  <p className="text-gray-400 text-xs truncate">{firstNextAp?.nome} • {firstNext.horarioInicio} — {firstNext.horarioFim}</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Current program - main box */}
        <div
          className="rounded-xl relative overflow-hidden flex flex-col transition-all duration-500 ease-in-out"
          style={{
            backgroundColor: "#dff06f",
            height: 330,
            opacity: isHovered ? 0 : 1,
            zIndex: isHovered ? 1 : 10,
          }}
        >
          {apresentadorFoto && (
            <img
              src={apresentadorFoto}
              alt={apresentadorNome}
              className="absolute object-contain pointer-events-none"
              style={{ right: 0, top: 0, width: "60%", height: "100%", objectPosition: "right top" }}
            />
          )}

          {firstNext && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-[#2d2d2d] rounded-full px-3 py-1 cursor-pointer">
              <span className="text-gray-300 text-[10px] font-semibold uppercase tracking-wider">Próximo programa</span>
              <ChevronRight size={12} className="text-gray-300" />
            </div>
          )}

          <div className="absolute top-4 left-5 z-10">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-gray-700 animate-pulse" />
              <span className="font-bold text-gray-700 text-sm animate-pulse">NO AR</span>
            </div>
            {/* Selo do programa abaixo do NO AR */}
            {programa.selo && (
              <img
                src={programa.selo}
                alt="Selo"
                className="mt-2 object-contain"
                style={{ maxHeight: 80, maxWidth: 120, filter: "grayscale(100%) brightness(0.4)" }}
              />
            )}
          </div>

          <div className="absolute bottom-[4px] left-0 right-0 z-10 px-5">
            <p className="font-bold text-gray-800 truncate" style={{ fontSize: 14 }}>{programa.nome}</p>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-gray-600 text-xs truncate">{apresentadorNome}</p>
              <p className="text-gray-600 text-xs whitespace-nowrap">
                {programa.horarioInicio} — {programa.horarioFim}
              </p>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="w-full h-1 bg-gray-300 overflow-hidden">
              <div
                className="h-full bg-gray-700 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <UpcomingProgramsList programs={nextPrograms} apresentadores={nextApresentadores} />
    </div>
  );
}

function UpcomingProgramsList({ programs, apresentadores }: { programs: Programa[]; apresentadores: Record<string, ApresentadorInfo> }) {
  if (programs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
        <Clock size={12} /> Próximos programas
      </p>
      {programs.map(p => (
        <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-300">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-xs truncate">{p.nome}</p>
            <p className="text-gray-500 text-[10px] truncate">{apresentadores[p.id]?.nome || "—"}</p>
          </div>
          <p className="text-gray-500 text-[10px] whitespace-nowrap font-mono">
            {p.horarioInicio} — {p.horarioFim}
          </p>
        </div>
      ))}
    </div>
  );
}

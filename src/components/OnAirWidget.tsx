import { useState, useEffect } from "react";
import { Radio, SkipForward, ChevronRight } from "lucide-react";
import { getApresentadores } from "./ApresentadorForm";

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

function getProgramas(): Programa[] {
  try { return JSON.parse(localStorage.getItem("masterview_programas") || "[]"); } catch { return []; }
}

function getCurrentProgram(): { programa: Programa; progress: number } | null {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const programas = getProgramas();

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

function getNextProgram(): Programa | null {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const programas = getProgramas();

  const todayPrograms = programas
    .filter(p => p.diasSemana.includes(diaAtual) && p.horarioInicio > horaAtual)
    .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

  return todayPrograms.length > 0 ? todayPrograms[0] : null;
}

export default function OnAirWidget() {
  const [onAir, setOnAir] = useState<{ programa: Programa; progress: number } | null>(null);
  const [apresentadorNome, setApresentadorNome] = useState("");
  const [apresentadorFoto, setApresentadorFoto] = useState("");
  const [nextProgram, setNextProgram] = useState<Programa | null>(null);
  const [nextApresentadorNome, setNextApresentadorNome] = useState("");
  const [nextApresentadorFoto, setNextApresentadorFoto] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const update = () => {
      const current = getCurrentProgram();
      setOnAir(current);
      const apresentadores = getApresentadores();
      if (current) {
        const ap = apresentadores.find(a => a.id === current.programa.apresentadorId);
        setApresentadorNome(ap?.nome || "—");
        setApresentadorFoto(ap?.foto || "");
      }
      const next = getNextProgram();
      setNextProgram(next);
      if (next) {
        const ap = apresentadores.find(a => a.id === next.apresentadorId);
        setNextApresentadorNome(ap?.nome || "—");
        setNextApresentadorFoto(ap?.foto || "");
      }
    };
    update();
    const interval = setInterval(update, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!onAir) {
    return (
      <div className="rounded-xl p-5" style={{ backgroundColor: "#dff06f", height: 330 }}>
        <div className="flex items-center gap-2 mb-2">
          <Radio size={16} className="text-gray-600" />
          <span className="font-semibold text-gray-600 text-sm">No Ar</span>
        </div>
        <p className="text-gray-500 text-xs">Nenhum programa no ar neste momento.</p>
      </div>
    );
  }

  const { programa, progress } = onAir;

  return (
    <div
      className="relative"
      style={{ height: 330 }}
      onMouseEnter={() => nextProgram && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Next program box - behind, peeking from right */}
      {nextProgram && (
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

          {/* Full content when expanded */}
          {isHovered && (
            <>
              {nextProgram.selo && (
                <img
                  src={nextProgram.selo}
                  alt="Selo"
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    top: -20,
                    height: "110%",
                    width: "auto",
                    opacity: 0.1,
                    objectFit: "contain",
                    objectPosition: "left top",
                  }}
                />
              )}

              {nextApresentadorFoto && (
                <img
                  src={nextApresentadorFoto}
                  alt={nextApresentadorNome}
                  className="absolute object-contain pointer-events-none"
                  style={{
                    right: 0,
                    top: 0,
                    width: "60%",
                    height: "100%",
                    objectPosition: "right top",
                  }}
                />
              )}

              <div className="absolute top-4 left-5 z-10 flex items-center gap-2 animate-fade-in">
                <SkipForward size={16} className="text-gray-300" />
                <span className="font-bold text-gray-300 text-sm">PRÓXIMO PROGRAMA</span>
              </div>

              {nextProgram.selo && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none animate-fade-in" style={{ bottom: 40 }}>
                  <img
                    src={nextProgram.selo}
                    alt="Selo"
                    className="rounded max-h-[45%] w-auto"
                    style={{ filter: "grayscale(100%) brightness(1.5)" }}
                  />
                </div>
              )}

              <div className="absolute bottom-4 left-0 right-0 z-10 px-5 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <p className="font-bold text-white text-sm sm:text-base truncate">{nextProgram.nome}</p>
                  <p className="text-gray-400 text-xs truncate">{nextApresentadorNome}</p>
                  <p className="text-gray-400 text-xs whitespace-nowrap">
                    {nextProgram.horarioInicio} — {nextProgram.horarioFim}
                  </p>
                </div>
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
        {programa.selo && (
          <img
            src={programa.selo}
            alt="Selo"
            className="absolute pointer-events-none"
            style={{
              left: 0,
              top: -20,
              height: "110%",
              width: "auto",
              opacity: 0.1,
              objectFit: "contain",
              objectPosition: "left top",
            }}
          />
        )}

        {apresentadorFoto && (
          <img
            src={apresentadorFoto}
            alt={apresentadorNome}
            className="absolute object-contain pointer-events-none"
            style={{
              right: 0,
              top: 0,
              width: "60%",
              height: "100%",
              objectPosition: "right top",
            }}
          />
        )}

        {nextProgram && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-[#2d2d2d] rounded-full px-3 py-1 cursor-pointer">
            <span className="text-gray-300 text-[10px] font-semibold uppercase tracking-wider">Próximo programa</span>
            <ChevronRight size={12} className="text-gray-300" />
          </div>
        )}

        <div className="absolute top-4 left-5 z-10 flex items-center gap-2">
          <Radio size={16} className="text-gray-700 animate-pulse" />
          <span className="font-bold text-gray-700 text-sm animate-pulse">NO AR</span>
        </div>

        {programa.selo && (
          <div className="absolute inset-0 z-10 flex items-start justify-start pointer-events-none" style={{ bottom: 40, padding: "40px 0 0 20px" }}>
            <img
              src={programa.selo}
              alt="Selo"
              className="rounded max-h-[110%] w-auto"
              style={{ filter: "grayscale(100%) brightness(0.3)" }}
            />
          </div>
        )}

        <div className="absolute bottom-[4px] left-0 right-0 z-10 px-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-1">
            <p className="font-bold text-gray-800 truncate" style={{ fontSize: 12 }}>{programa.nome}</p>
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
  );
}

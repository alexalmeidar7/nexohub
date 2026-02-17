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

              <div className="relative z-10 p-5 animate-fade-in">
                <div className="flex items-center gap-2">
                  <SkipForward size={16} className="text-gray-300" />
                  <span className="font-bold text-gray-300 text-sm">PRÓXIMO PROGRAMA</span>
                </div>

                {nextProgram.selo && (
                  <img
                    src={nextProgram.selo}
                    alt="Selo"
                    className="rounded mt-3"
                    style={{ filter: "grayscale(100%) brightness(1.5)", width: "45%", height: "auto" }}
                  />
                )}
              </div>

              <div className="relative z-10 mt-auto px-5 pb-4 animate-fade-in">
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                  <p className="font-bold text-white">{nextProgram.nome}</p>
                  <p className="text-gray-400 text-xs">{nextApresentadorNome}</p>
                  <p className="text-gray-400 text-xs">
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

        <div className="relative z-10 p-5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-gray-700 animate-pulse" />
            <span className="font-bold text-gray-700 text-sm animate-pulse">NO AR</span>
          </div>

          {nextProgram && (
            <div className="flex items-center gap-1 bg-[#2d2d2d] rounded-full px-3 py-1 cursor-pointer">
              <span className="text-gray-300 text-[10px] font-semibold uppercase tracking-wider">Próximo programa</span>
              <ChevronRight size={12} className="text-gray-300" />
            </div>
          )}

          {programa.selo && (
            <img
              src={programa.selo}
              alt="Selo"
              className="rounded mt-3"
              style={{ filter: "grayscale(100%) brightness(0.3)", width: "45%", height: "auto" }}
            />
          )}
        </div>

        <div className="relative z-10 mt-auto px-5">
          <div className="flex items-center gap-4 mb-2 flex-wrap">
            <p className="font-bold text-gray-800">{programa.nome}</p>
            <p className="text-gray-600 text-xs">{apresentadorNome}</p>
            <p className="text-gray-600 text-xs">
              {programa.horarioInicio} — {programa.horarioFim}
            </p>
          </div>
        </div>

        <div className="relative z-10">
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

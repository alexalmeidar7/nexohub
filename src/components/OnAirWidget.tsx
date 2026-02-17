import { useState, useEffect } from "react";
import { Radio } from "lucide-react";
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

export default function OnAirWidget() {
  const [onAir, setOnAir] = useState<{ programa: Programa; progress: number } | null>(null);
  const [apresentadorNome, setApresentadorNome] = useState("");
  const [apresentadorFoto, setApresentadorFoto] = useState("");

  useEffect(() => {
    const update = () => {
      const current = getCurrentProgram();
      setOnAir(current);
      if (current) {
        const apresentadores = getApresentadores();
        const ap = apresentadores.find(a => a.id === current.programa.apresentadorId);
        setApresentadorNome(ap?.nome || "—");
        setApresentadorFoto(ap?.foto || "");
      }
    };
    update();
    const interval = setInterval(update, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!onAir) {
    return (
      <div className="rounded-xl p-5 border border-gray-300" style={{ backgroundColor: "#dff06f" }}>
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
    <div className="rounded-xl p-5 border border-gray-300" style={{ backgroundColor: "#dff06f" }}>
      <div className="flex items-center gap-2 mb-3">
        <Radio size={16} className="text-gray-700 animate-pulse" />
        <span className="font-bold text-gray-700 text-sm">NO AR</span>
      </div>
      <div className="flex gap-4">
        {apresentadorFoto && (
          <img
            src={apresentadorFoto}
            alt={apresentadorNome}
            className="w-20 h-20 object-cover rounded-lg border border-gray-300"
          />
        )}
        <div className="flex-1 space-y-1">
          <p className="font-bold text-gray-800">{programa.nome}</p>
          <p className="text-gray-600 text-xs">{apresentadorNome}</p>
          <p className="text-gray-600 text-xs">
            {programa.horarioInicio} — {programa.horarioFim}
          </p>
          <p className="text-gray-500 text-xs">{programa.estudio}</p>
        </div>
        {programa.selo && (
          <img src={programa.selo} alt="Selo" className="h-20 rounded opacity-80" />
        )}
      </div>
      {/* Thinner progress bar */}
      <div className="mt-3">
        <div className="w-full h-1 bg-gray-300 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-700 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-1 text-right">{Math.round(progress)}% concluído</p>
      </div>
    </div>
  );
}

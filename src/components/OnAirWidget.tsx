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
      // Calculate progress
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
      <div className="bg-muted rounded-xl p-5 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Radio size={16} className="text-muted-foreground" />
          <span className="font-semibold text-muted-foreground text-sm">No Ar</span>
        </div>
        <p className="text-muted-foreground text-xs">Nenhum programa no ar neste momento.</p>
      </div>
    );
  }

  const { programa, progress } = onAir;

  return (
    <div className="bg-muted rounded-xl p-5 border border-border">
      <div className="flex items-center gap-2 mb-3">
        <Radio size={16} className="text-destructive animate-pulse" />
        <span className="font-bold text-destructive text-sm">NO AR</span>
      </div>
      <div className="flex gap-4">
        {apresentadorFoto && (
          <img
            src={apresentadorFoto}
            alt={apresentadorNome}
            className="w-16 h-20 object-cover rounded-lg border border-border"
          />
        )}
        <div className="flex-1 space-y-1">
          <p className="font-bold text-foreground">{programa.nome}</p>
          <p className="text-muted-foreground text-xs">{apresentadorNome}</p>
          <p className="text-muted-foreground text-xs">
            {programa.horarioInicio} — {programa.horarioFim}
          </p>
          <p className="text-muted-foreground text-xs">{programa.estudio}</p>
        </div>
        {programa.selo && (
          <img src={programa.selo} alt="Selo" className="h-12 rounded opacity-60" />
        )}
      </div>
      {/* Progress bar */}
      <div className="mt-3">
        <div className="w-full h-1.5 bg-background/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-right">{Math.round(progress)}% concluído</p>
      </div>
    </div>
  );
}

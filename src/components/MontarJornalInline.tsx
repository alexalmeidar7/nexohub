import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Newspaper, Check, X as XIcon, Loader2 } from "lucide-react";

interface Programa {
  id: string;
  nome: string;
}

export interface JornalConfig {
  programaId: string;
  programaNome: string;
  blocos: number;
  tempoBlocoMin: number;
  intervalos: number;
  tempoIntervaloMin: number;
  temTestemunha: boolean;
  horarioTestemunha: string;
  textoTestemunhal: string;
}

interface Props {
  programas: Programa[];
  onFinish: (config: JornalConfig) => void;
  onCancel: () => void;
}

const TOTAL_STEPS = 7;

export default function MontarJornalInline({ programas, onFinish, onCancel }: Props) {
  const [step, setStep] = useState(1);
  const [programaId, setProgramaId] = useState("");
  const [blocos, setBlocos] = useState(3);
  const [tempoBlocoMin, setTempoBlocoMin] = useState(15);
  const [intervalos, setIntervalos] = useState(2);
  const [tempoIntervaloMin, setTempoIntervaloMin] = useState(5);
  const [temTestemunha, setTemTestemunha] = useState<string>("");
  const [horarioTestemunha, setHorarioTestemunha] = useState("");
  const [textoTestemunhal, setTextoTestemunhal] = useState("");
  const [mounting, setMounting] = useState(false);

  const programaNome = programas.find(p => p.id === programaId)?.nome || "";

  const canAdvance = () => {
    switch (step) {
      case 1: return !!programaId;
      case 2: return blocos > 0;
      case 3: return tempoBlocoMin > 0;
      case 4: return intervalos >= 0;
      case 5: return tempoIntervaloMin >= 0;
      case 6: return temTestemunha === "sim" || temTestemunha === "nao";
      case 7: return true;
      default: return true;
    }
  };

  const isLastStep = () => {
    if (step === 6 && temTestemunha === "nao") return true;
    if (step === 7) return true;
    return false;
  };

  const handleNext = () => {
    if (isLastStep()) {
      setMounting(true);
      setTimeout(() => {
        onFinish({
          programaId,
          programaNome,
          blocos,
          tempoBlocoMin,
          intervalos,
          tempoIntervaloMin,
          temTestemunha: temTestemunha === "sim",
          horarioTestemunha,
          textoTestemunhal,
        });
      }, 1200);
      return;
    }
    if (step === 6 && temTestemunha === "nao") return;
    setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const effectiveTotal = temTestemunha === "nao" ? 6 : TOTAL_STEPS;
  const stepLabels = ["Programa", "Blocos", "Tempo Bloco", "Intervalos", "Tempo Intervalo", "Testemunha", "Detalhes Testemunha"];

  const inputStyle = { borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff", color: "#0d0446" };

  if (mounting) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff" }}>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: "#2ec1f7" }} />
          <p className="text-sm font-bold" style={{ color: "#0d0446" }}>Montando Programa...</p>
          <p className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>{programaNome}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff" }}>
      <style>{`
        .jornal-inline-input:focus, .jornal-inline-input:focus-visible, .jornal-inline-input:active {
          outline: none !important;
          box-shadow: none !important;
          border-color: #2ec1f7 !important;
        }
        .jornal-inline-input { color: #0d0446 !important; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 text-white font-bold text-xs" style={{ backgroundColor: "#0d0446" }}>
        <span className="flex items-center gap-2">
          <Newspaper size={12} />
          Montar Jornal
        </span>
        <button onClick={onCancel} className="hover:opacity-70 transition-opacity">
          <XIcon size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Progress */}
        <div className="flex gap-1">
          {Array.from({ length: effectiveTotal }).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full transition-all" style={{ backgroundColor: i < step ? "#2ec1f7" : "rgba(13,4,70,0.1)" }} />
          ))}
        </div>
        <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>
          Passo {step} de {effectiveTotal} — {stepLabels[step - 1]}
        </p>

        {/* Steps */}
        <div className="min-h-[80px]">
          {step === 1 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Nome do Programa</label>
              <Select value={programaId} onValueChange={setProgramaId}>
                <SelectTrigger className="jornal-inline-input text-xs h-8" style={inputStyle}>
                  <SelectValue placeholder="Selecione um programa" />
                </SelectTrigger>
                <SelectContent>
                  {programas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Quantidade de Blocos</label>
              <Input type="number" min={1} max={20} value={blocos} onChange={e => setBlocos(Number(e.target.value))} className="jornal-inline-input text-xs h-8" style={inputStyle} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Tempo de Cada Bloco (min)</label>
              <Input type="number" min={1} max={120} value={tempoBlocoMin} onChange={e => setTempoBlocoMin(Number(e.target.value))} className="jornal-inline-input text-xs h-8" style={inputStyle} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Quantidade de Intervalos</label>
              <Input type="number" min={0} max={20} value={intervalos} onChange={e => setIntervalos(Number(e.target.value))} className="jornal-inline-input text-xs h-8" style={inputStyle} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Tempo do Intervalo (min)</label>
              <Input type="number" min={0} max={60} value={tempoIntervaloMin} onChange={e => setTempoIntervaloMin(Number(e.target.value))} className="jornal-inline-input text-xs h-8" style={inputStyle} />
            </div>
          )}

          {step === 6 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Haverá Testemunha?</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTemTestemunha("sim")}
                  className="flex-1 py-2 rounded-full font-semibold text-xs transition-all"
                  style={{
                    backgroundColor: temTestemunha === "sim" ? "#2ec1f7" : "#ffffff",
                    color: temTestemunha === "sim" ? "#ffffff" : "#0d0446",
                    border: "1.5px solid #2ec1f7",
                  }}
                >
                  Sim
                </button>
                <button
                  onClick={() => setTemTestemunha("nao")}
                  className="flex-1 py-2 rounded-full font-semibold text-xs transition-all"
                  style={{
                    backgroundColor: temTestemunha === "nao" ? "#2ec1f7" : "#ffffff",
                    color: temTestemunha === "nao" ? "#ffffff" : "#0d0446",
                    border: "1.5px solid #2ec1f7",
                  }}
                >
                  Não
                </button>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Horário da Testemunha</label>
              <Input type="time" value={horarioTestemunha} onChange={e => setHorarioTestemunha(e.target.value)} className="jornal-inline-input text-xs h-8" style={inputStyle} />
              <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Texto do Testemunhal</label>
              <Textarea value={textoTestemunhal} onChange={e => setTextoTestemunhal(e.target.value)} placeholder="Texto do testemunhal..." rows={2} className="jornal-inline-input text-xs" style={{ ...inputStyle, borderRadius: "12px" }} />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1 text-xs font-semibold disabled:opacity-30 transition-opacity"
            style={{ color: "#0d0446" }}
          >
            <ChevronLeft size={14} /> Voltar
          </button>
          <button
            onClick={handleNext}
            disabled={!canAdvance()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-bold disabled:opacity-40 transition-all"
            style={{ backgroundColor: "#2ec1f7" }}
          >
            {isLastStep() ? (
              <><Check size={12} /> Montar</>
            ) : (
              <>Próximo <ChevronRight size={12} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
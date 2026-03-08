import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Newspaper, Check, X as XIcon } from "lucide-react";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programas: Programa[];
  onFinish: (config: JornalConfig) => void;
}

const TOTAL_STEPS = 5;

export default function MontarJornalWizard({ open, onOpenChange, programas, onFinish }: Props) {
  const [step, setStep] = useState(1);
  const [programaId, setProgramaId] = useState("");
  const [blocos, setBlocos] = useState(3);
  const [tempoBlocoMin, setTempoBlocoMin] = useState(15);
  const [intervalos, setIntervalos] = useState(2);
  const [tempoIntervaloMin, setTempoIntervaloMin] = useState(5);
  const [mounting, setMounting] = useState(false);

  const reset = () => {
    setStep(1);
    setProgramaId("");
    setBlocos(3);
    setTempoBlocoMin(15);
    setIntervalos(2);
    setTempoIntervaloMin(5);
    setMounting(false);
  };

  const programaNome = programas.find(p => p.id === programaId)?.nome || "";

  const canAdvance = () => {
    switch (step) {
      case 1: return !!programaId;
      case 2: return blocos > 0;
      case 3: return tempoBlocoMin > 0;
      case 4: return intervalos >= 0;
      case 5: return tempoIntervaloMin >= 0;
      default: return true;
    }
  };

  const isLastStep = () => step === TOTAL_STEPS;

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
          temTestemunha: false,
          horarioTestemunha: "",
          textoTestemunhal: "",
        });
        reset();
      }, 1500);
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const stepLabels = [
    "Programa",
    "Blocos",
    "Tempo Bloco",
    "Intervalos",
    "Tempo Intervalo",
  ];

  if (mounting) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(false); } }}>
        <DialogContent className="sm:max-w-md" style={{ backgroundColor: "#ffffff", border: "none" }}>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: "#2ec1f7", borderTopColor: "transparent" }} />
            <p className="text-lg font-bold" style={{ color: "#0d0446" }}>Montando Programa...</p>
            <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>{programaNome}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(false); } }}>
      <DialogContent className="sm:max-w-lg relative" style={{ backgroundColor: "#ffffff", border: "none" }}>
        <button
          onClick={() => { reset(); onOpenChange(false); }}
          className="absolute top-3 right-3 rounded-full p-1 hover:opacity-70 transition-opacity"
          style={{ color: "#0d0446" }}
        >
          <XIcon size={18} />
        </button>
        <style>{`
          .jornal-wizard-input:focus, .jornal-wizard-input:focus-visible, .jornal-wizard-input:active {
            outline: none !important;
            box-shadow: none !important;
            ring: none !important;
            border-color: #2ec1f7 !important;
          }
          .jornal-wizard-input, .jornal-wizard-input::placeholder {
            color: #0d0446 !important;
          }
        `}</style>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "#0d0446" }}>
            <Newspaper size={20} style={{ color: "#2ec1f7" }} />
            Montar Jornal
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1 mb-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full transition-all" style={{ backgroundColor: i < step ? "#2ec1f7" : "rgba(13,4,70,0.1)" }} />
          ))}
        </div>
        <p className="text-xs mb-4" style={{ color: "rgba(13,4,70,0.4)" }}>
          Passo {step} de {TOTAL_STEPS} — {stepLabels[step - 1]}
        </p>

        {/* Steps */}
        <div className="min-h-[120px]">
          {step === 1 && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" style={{ color: "#0d0446" }}>Nome do Programa</label>
              <Select value={programaId} onValueChange={setProgramaId}>
                <SelectTrigger className="jornal-wizard-input" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff", color: "#0d0446" }}>
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
            <div className="space-y-3">
              <label className="text-sm font-semibold" style={{ color: "#0d0446" }}>Quantidade de Blocos</label>
              <Input type="number" min={1} max={20} value={blocos} onChange={e => setBlocos(Number(e.target.value))} className="jornal-wizard-input" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff" }} />
              <p className="text-xs" style={{ color: "rgba(13,4,70,0.4)" }}>Quantos blocos o programa terá?</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" style={{ color: "#0d0446" }}>Tempo de Cada Bloco (minutos)</label>
              <Input type="number" min={1} max={120} value={tempoBlocoMin} onChange={e => setTempoBlocoMin(Number(e.target.value))} className="jornal-wizard-input" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff" }} />
              <p className="text-xs" style={{ color: "rgba(13,4,70,0.4)" }}>Duração em minutos de cada bloco</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" style={{ color: "#0d0446" }}>Quantidade de Intervalos</label>
              <Input type="number" min={0} max={20} value={intervalos} onChange={e => setIntervalos(Number(e.target.value))} className="jornal-wizard-input" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff" }} />
              <p className="text-xs" style={{ color: "rgba(13,4,70,0.4)" }}>Quantos intervalos haverá durante o programa?</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" style={{ color: "#0d0446" }}>Tempo do Intervalo (minutos)</label>
              <Input type="number" min={0} max={60} value={tempoIntervaloMin} onChange={e => setTempoIntervaloMin(Number(e.target.value))} className="jornal-wizard-input" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff" }} />
              <p className="text-xs" style={{ color: "rgba(13,4,70,0.4)" }}>Duração de cada intervalo em minutos</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="gap-1">
            <ChevronLeft size={16} /> Voltar
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canAdvance()}
            className="gap-1 text-white font-bold"
            style={{ backgroundColor: "#2ec1f7" }}
          >
            {isLastStep() ? (
              <>
                <Check size={16} /> Montar Programa
              </>
            ) : (
              <>
                Próximo <ChevronRight size={16} />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

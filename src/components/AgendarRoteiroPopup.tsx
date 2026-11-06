import { DateInput } from "@/components/ui/date-input";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NEXO } from "@/components/nexo/NexoUI";

interface AgendarRoteiroPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roteiroId: string | null;
  onScheduled: () => void;
  onSaveAndSchedule?: (data: string, horario: string) => Promise<boolean>;
  title?: string;
  submitLabel?: string;
}

export default function AgendarRoteiroPopup({ open, onOpenChange, roteiroId, onScheduled, onSaveAndSchedule, title = "Agendar", submitLabel = "Agendar" }: AgendarRoteiroPopupProps) {
  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setData("");
      setHorario("");
    }
  }, [open]);

  const handleSchedule = async () => {
    if (!data || !horario) {
      toast.error("Preencha a data e o horário");
      return;
    }

    setLoading(true);
    try {
      if (onSaveAndSchedule) {
        const saved = await onSaveAndSchedule(data, horario);
        if (!saved) return;
      } else {
        if (!roteiroId) {
          toast.error("Salve o roteiro antes de agendar");
          return;
        }

        const scheduledDateTime = new Date(`${data}T${horario}:00`).toISOString();
        const { error } = await supabase
          .from("roteiros")
          .update({
            agendado_para_envio: scheduledDateTime,
            enviado_agendamento: false,
          } as any)
          .eq("id", roteiroId);

        if (error) throw error;
        toast.success("Roteiro agendado com sucesso!");
        onScheduled();
      }

      onOpenChange(false);
    } catch (e: any) {
      console.error("Erro ao agendar roteiro:", e);
      toast.error("Erro ao agendar: " + (e.message || "Tente novamente"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-md rounded-2xl border-none"
        style={{ backgroundColor: NEXO.CARD_BG, fontFamily: NEXO.FONT }}
        overlayClassName="z-[10000]"
        contentZIndex="z-[10001]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: NEXO.DARK }}>
            <Calendar className="w-5 h-5" style={{ color: NEXO.CYAN }} />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: NEXO.DARK }}>Data</label>
            <div className="relative">
              <DateInput 
                              value={data} 
                onChange={e => setData(e.target.value)}
                className="pl-10 h-11 rounded-full"
                style={{ border: `2px solid ${NEXO.CYAN}`, backgroundColor: NEXO.WHITE, color: NEXO.DARK }}
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: NEXO.CYAN }} />
            </div>
          </div>
          
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: NEXO.DARK }}>Horário</label>
            <div className="relative">
              <Input 
                type="time" 
                value={horario} 
                onChange={e => setHorario(e.target.value)}
                className="pl-10 h-11 rounded-full"
                style={{ border: `2px solid ${NEXO.CYAN}`, backgroundColor: NEXO.WHITE, color: NEXO.DARK }}
              />
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: NEXO.CYAN }} />
            </div>
          </div>
          
          <p className="text-[10px] leading-relaxed italic" style={{ color: NEXO.MUTED }}>
            * O roteiro será enviado automaticamente para o XML na data e hora selecionadas.
          </p>
        </div>

        <DialogFooter className="flex gap-2">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-full font-bold uppercase text-[11px] tracking-wider"
            style={{ color: NEXO.DARK }}
          >
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
          <Button 
            onClick={handleSchedule}
            disabled={loading}
            className="flex-1 rounded-full font-bold uppercase text-[11px] tracking-wider transition-[filter] hover:brightness-110"
            style={{ backgroundColor: NEXO.CYAN, color: NEXO.WHITE }}
          >
            {loading ? "Salvando..." : <><Check className="w-4 h-4 mr-2" /> {submitLabel}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

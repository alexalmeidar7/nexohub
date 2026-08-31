import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AgendarRoteiroPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roteiroId: string | null;
  onScheduled: () => void;
  onSaveAndSchedule?: (data: string, horario: string) => Promise<boolean>;
}

export default function AgendarRoteiroPopup({ open, onOpenChange, roteiroId, onScheduled, onSaveAndSchedule }: AgendarRoteiroPopupProps) {
  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [loading, setLoading] = useState(false);

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
        className="max-w-md rounded-2xl border-none shadow-2xl" 
        style={{ backgroundColor: "#D6F4FB", fontFamily: "'Montserrat', sans-serif" }}
        overlayClassName="z-[10000]"
        contentZIndex="z-[10001]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: "#0A2540" }}>
            <Calendar className="w-5 h-5 text-[#00BFF0]" />
            Agendar Roteiro
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "#0A254099" }}>Data</label>
            <div className="relative">
              <Input 
                type="date" 
                value={data} 
                onChange={e => setData(e.target.value)}
                className="pl-10 h-11 border-2 border-[#00BFF0] rounded-xl bg-white text-[#0A2540]"
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00BFF0]" />
            </div>
          </div>
          
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "#0A254099" }}>Horário</label>
            <div className="relative">
              <Input 
                type="time" 
                value={horario} 
                onChange={e => setHorario(e.target.value)}
                className="pl-10 h-11 border-2 border-[#00BFF0] rounded-xl bg-white text-[#0A2540]"
              />
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00BFF0]" />
            </div>
          </div>
          
          <p className="text-[10px] leading-relaxed italic" style={{ color: "#0A254080" }}>
            * O roteiro será enviado automaticamente para o XML na data e hora selecionadas.
          </p>
        </div>

        <DialogFooter className="flex gap-2">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl font-bold uppercase text-[11px] tracking-wider"
            style={{ color: "#0A2540" }}
          >
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
          <Button 
            onClick={handleSchedule}
            disabled={loading}
            className="flex-1 rounded-xl font-bold uppercase text-[11px] tracking-wider shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: "#00BFF0", color: "#FFFFFF" }}
          >
            {loading ? "Salvando..." : <><Check className="w-4 h-4 mr-2" /> {onSaveAndSchedule ? "Salvar e Agendar" : "Agendar"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  ativo: boolean;
  selo: string | null;
  estudio: string | null;
  variavel: boolean;
  data_variavel: string | null;
  capa: string | null;
  descricao: string | null;
}

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DIAS_MAP_FULL: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };

const dayShortToFull: Record<string, string> = {
  seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo",
  Segunda: "Segunda", Terça: "Terça", Quarta: "Quarta", Quinta: "Quinta", Sexta: "Sexta", Sábado: "Sábado", Domingo: "Domingo",
};

function generateGradeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00:00`);
    slots.push(`${String(h).padStart(2, "0")}:30:00`);
  }
  return slots;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DashboardGradeDialog({ open, onOpenChange }: Props) {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailProg, setDetailProg] = useState<Programa | null>(null);
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const onAirRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from("programas").select("*").then(({ data }) => {
      if (data) setProgramas(data as Programa[]);
      setLoading(false);
    });
  }, [open]);

  // Scroll to current time after load
  useEffect(() => {
    if (!loading && onAirRef.current) {
      requestAnimationFrame(() => onAirRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }, [loading, programas]);

  const now = new Date();
  const diaAtual = DIAS_MAP_FULL[now.getDay()];
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const weekDates = useMemo(() => {
    const dates: Record<string, string> = {};
    DIAS_SEMANA.forEach((dia, i) => {
      dates[dia] = format(addDays(weekStart, i), "dd/MM");
    });
    return dates;
  }, [weekStart.toDateString()]);

  const gradeSlots = useMemo(() => generateGradeSlots(), []);

  const getDateForDay = (dia: string): string => {
    const idx = DIAS_SEMANA.indexOf(dia);
    return format(addDays(weekStart, idx), "yyyy-MM-dd");
  };

  const getProgramaForGradeSlot = (dia: string, slotTime: string) => {
    const dateForDay = getDateForDay(dia);
    const matching = programas.filter(p => {
      if (!p.ativo) return false;
      const dias = (p.dias_semana || []).map(d => dayShortToFull[d] || d);
      return dias.includes(dia) && slotTime >= p.horario_inicio && slotTime < p.horario_fim;
    });
    const variable = matching.find(p => p.variavel && p.data_variavel === dateForDay);
    if (variable) return variable;
    return matching.find(p => !p.variavel) || matching[0] || undefined;
  };

  const { skipMap, spanMap } = useMemo(() => {
    const skip: Record<string, boolean> = {};
    const span: Record<string, { prog: Programa; rowSpan: number }> = {};
    DIAS_SEMANA.forEach(dia => {
      let i = 0;
      while (i < gradeSlots.length) {
        const slot = gradeSlots[i];
        const prog = getProgramaForGradeSlot(dia, slot);
        if (prog) {
          let s = 1;
          while (i + s < gradeSlots.length) {
            const nextProg = getProgramaForGradeSlot(dia, gradeSlots[i + s]);
            if (nextProg && nextProg.id === prog.id) {
              skip[`${dia}-${gradeSlots[i + s]}`] = true;
              s++;
            } else break;
          }
          span[`${dia}-${slot}`] = { prog, rowSpan: s };
          i += s;
        } else i++;
      }
    });
    return { skipMap: skip, spanMap: span };
  }, [programas, gradeSlots]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] p-0 overflow-hidden" style={{ backgroundColor: "#ffffff", border: "2px solid #0d0446" }}>
        <DialogHeader className="px-6 pt-5 pb-3" style={{ borderBottom: "2px solid #0d0446" }}>
          <DialogTitle className="text-lg font-bold flex items-center gap-2" style={{ color: "#0d0446" }}>
            📺 Grade de Programação
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} style={{ color: "#2dbef3" }} />
          </div>
        ) : (
          <div
            ref={gradeScrollRef}
            className="overflow-auto max-h-[75vh] px-4 pb-4 grade-scroll-dashboard"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#0d0446 #f0f0f0" }}
          >
            <style>{`
              .grade-scroll-dashboard::-webkit-scrollbar { width: 8px; height: 8px; }
              .grade-scroll-dashboard::-webkit-scrollbar-track { background: #f0f0f0; border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb { background: #0d0446; border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb:hover { background: #2dbef3; }
              .grade-cell-dash:hover { outline: 2px solid #2dbef3 !important; outline-offset: -1px; }
            `}</style>
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: "#ffffff" }}>
                <tr>
                  <th className="px-2 py-2 text-left w-20 rounded-lg" style={{ color: "#0d0446" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => (
                    <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "font-bold" : ""}`}
                      style={{ color: dia === diaAtual ? "#2dbef3" : "rgba(13,4,70,0.4)" }}>
                      <div>{dia.slice(0, 3)}</div>
                      <div className="text-[9px] font-normal opacity-70">{weekDates[dia]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradeSlots.map(slot => {
                  const onAirKey = `${diaAtual}-${slot}`;
                  const isOnAirRow = spanMap[onAirKey] && (() => {
                    const p = spanMap[onAirKey].prog;
                    return p && currentTimeStr >= p.horario_inicio && currentTimeStr < p.horario_fim;
                  })();

                  return (
                    <tr key={slot} ref={isOnAirRow ? onAirRef : undefined}>
                      <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "rgba(13,4,70,0.3)" }}>{slot.slice(0, 5)}</td>
                      {DIAS_SEMANA.map(dia => {
                        const key = `${dia}-${slot}`;
                        if (skipMap[key]) return null;
                        const cellData = spanMap[key];
                        if (!cellData) return <td key={dia} className="px-1 py-1 rounded-lg" />;
                        const { prog, rowSpan } = cellData;
                        const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horario_inicio && currentTimeStr < prog.horario_fim;
                        return (
                          <td key={dia} rowSpan={rowSpan}
                            className="px-1 py-1 text-center rounded-lg transition-all grade-cell-dash relative group"
                            style={{
                              backgroundColor: isOnAir ? "#0d0446" : "rgba(13,4,70,0.06)",
                              color: isOnAir ? "#fff" : "#0d0446",
                              fontWeight: isOnAir ? "bold" : "normal",
                              verticalAlign: "middle",
                              cursor: "pointer",
                            }}
                            onClick={() => setDetailProg(prog)}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-[10px] truncate">{prog.nome}</span>
                              <Plus size={10} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-[8px] opacity-60 mt-0.5">
                              {prog.horario_inicio.slice(0, 5)} - {prog.horario_fim.slice(0, 5)}
                            </div>
                            {isOnAir && (
                              <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#2dbef3", color: "#fff" }}>
                                no ar
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {detailProg && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
            <div className="rounded-xl max-w-lg w-full mx-4 relative overflow-hidden" style={{ backgroundColor: "#ffffff", border: "2px solid #0d0446" }}>
              <button onClick={() => setDetailProg(null)} className="absolute top-3 right-3 hover:opacity-80 z-10" style={{ color: "#0d0446" }}>
                <X size={18} />
              </button>
              <div className="flex gap-4 p-5">
                <div className="shrink-0">
                  {detailProg.capa ? (
                    <img src={detailProg.capa} alt={detailProg.nome} className="w-36 h-36 object-cover rounded-lg shadow-md" />
                  ) : detailProg.selo ? (
                    <img src={detailProg.selo} alt={detailProg.nome} className="w-36 h-36 object-contain rounded-lg" />
                  ) : (
                    <div className="w-36 h-36 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#0d0446" }}>
                      <span className="text-white text-3xl font-bold">{detailProg.nome.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold mb-1 pr-6" style={{ color: "#0d0446" }}>{detailProg.nome}</h3>
                  <div className="text-xs mb-2" style={{ color: "#2dbef3" }}>
                    {detailProg.horario_inicio.slice(0, 5)} - {detailProg.horario_fim.slice(0, 5)}
                  </div>
                  {detailProg.estudio && <div className="text-xs mb-1" style={{ color: "rgba(13,4,70,0.5)" }}>Estúdio: {detailProg.estudio}</div>}
                  {detailProg.dias_semana && detailProg.dias_semana.length > 0 && (
                    <div className="text-xs mb-1" style={{ color: "rgba(13,4,70,0.5)" }}>Dias: {detailProg.dias_semana.join(", ")}</div>
                  )}
                  {detailProg.descricao && <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(13,4,70,0.7)" }}>{detailProg.descricao}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default memo(DashboardGradeDialog);

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { X, Clock, Calendar, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { format, addDays, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  horarioInicio: string;
  horarioFim: string;
  diasSemana: string[];
  estudio: string;
  ativo: boolean;
  variavel: boolean;
  dataVariavel: string | null;
  capa: string;
  descricao: string;
  selo: string;
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
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailProg, setDetailProg] = useState<Programa | null>(null);
  const needleRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      supabase.from("programas").select("*"),
      getApresentadores(),
    ]).then(([{ data }, aps]) => {
      if (data) {
        setProgramas(data.map(p => ({
          id: p.id, nome: p.nome, apresentadorId: p.apresentador_id || "",
          selo: p.selo || "", capa: (p as any).capa || "",
          diasSemana: p.dias_semana || [], horarioInicio: p.horario_inicio,
          horarioFim: p.horario_fim, estudio: p.estudio || "",
          ativo: (p as any).ativo ?? true, variavel: (p as any).variavel ?? false,
          descricao: (p as any).descricao || "", dataVariavel: (p as any).data_variavel || null,
        })));
      }
      setApresentadores(aps);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (!loading && needleRowRef.current) {
      requestAnimationFrame(() => needleRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
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

  const getProgramaForSlot = (dia: string, slotTime: string) => {
    const dateForDay = getDateForDay(dia);
    const matching = programas.filter(p => {
      if (!p.ativo) return false;
      const dias = p.diasSemana.map(d => dayShortToFull[d] || d);
      return dias.includes(dia) && slotTime >= p.horarioInicio && slotTime < p.horarioFim;
    });
    const variable = matching.find(p => p.variavel && p.dataVariavel === dateForDay);
    if (variable) return variable;
    return matching.find(p => !p.variavel) || matching[0] || undefined;
  };

  const getPresenterName = (apresentadorId: string) => {
    if (!apresentadorId) return null;
    const ap = apresentadores.find(a => a.id === apresentadorId);
    return ap ? ap.nome : null;
  };

  const { skipMap, spanMap } = useMemo(() => {
    const skip: Record<string, boolean> = {};
    const span: Record<string, { prog: Programa; rowSpan: number }> = {};
    DIAS_SEMANA.forEach(dia => {
      let i = 0;
      while (i < gradeSlots.length) {
        const slot = gradeSlots[i];
        const prog = getProgramaForSlot(dia, slot);
        if (prog) {
          let s = 1;
          while (i + s < gradeSlots.length) {
            const nextProg = getProgramaForSlot(dia, gradeSlots[i + s]);
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
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDetailProg(null); }}>
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
            className="overflow-auto max-h-[75vh] px-4 pb-4 grade-scroll-dashboard"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#0d0446 #f0f0f0" }}
          >
            <style>{`
              .grade-scroll-dashboard::-webkit-scrollbar { width: 8px; height: 8px; }
              .grade-scroll-dashboard::-webkit-scrollbar-track { background: #f0f0f0; border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb { background: #0d0446; border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb:hover { background: #2dbef3; }
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
                {gradeSlots.map((slot) => {
                  const slotParts = slot.split(":");
                  const slotMinutes = parseInt(slotParts[0]) * 60 + parseInt(slotParts[1]);
                  const nextSlotMinutes = slotMinutes + 30;
                  const currentParts = currentTimeStr.split(":");
                  const currentMinutes = parseInt(currentParts[0]) * 60 + parseInt(currentParts[1]);
                  const isNeedleRow = currentMinutes >= slotMinutes && currentMinutes < nextSlotMinutes;

                  return (
                    <tr key={slot} ref={isNeedleRow ? needleRowRef : undefined}
                      data-needle-row={isNeedleRow ? "true" : undefined}
                      data-needle-percent={isNeedleRow ? ((currentMinutes - slotMinutes) / 30) * 100 : undefined}
                    >
                      <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "rgba(13,4,70,0.5)" }}>{slot.slice(0, 5)}</td>
                      {DIAS_SEMANA.map(dia => {
                        const key = `${dia}-${slot}`;
                        if (skipMap[key]) return null;
                        const cellData = spanMap[key];
                        if (!cellData) return <td key={dia} className="px-1 py-1 rounded-lg" />;
                        const { prog, rowSpan } = cellData;
                        const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                        const presenterName = getPresenterName(prog.apresentadorId);
                        return (
                          <td key={dia} rowSpan={rowSpan}
                            className="rounded-lg transition-all relative hover:!border-[#2dbef3] hover:border-2"
                            style={{
                              backgroundColor: isOnAir ? "#2dbef3" : "#ffffff",
                              color: isOnAir ? "#ffffff" : "#0d0446",
                              fontWeight: isOnAir ? "bold" : undefined,
                              border: isOnAir ? "2px solid #2dbef3" : "1px solid #ccc",
                              verticalAlign: "top",
                              padding: "8px 10px",
                            }}>
                            <div className="text-[10px] font-bold leading-tight" style={{ wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{prog.nome}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: isOnAir ? "rgba(255,255,255,0.8)" : "rgba(13,4,70,0.5)" }}>
                              {prog.horarioInicio.slice(0, 5)} - {prog.horarioFim.slice(0, 5)}
                            </div>
                            {presenterName && (
                              <div className="text-[9px] font-semibold mt-0.5" style={{ color: isOnAir ? "rgba(255,255,255,0.9)" : "#0d0446" }}>
                                {presenterName}
                              </div>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailProg(prog); }}
                              className="mt-1 px-2 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 transition-colors"
                              style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#2dbef3"; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; }}
                            >
                              + informações
                            </button>
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

        {detailProg && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setDetailProg(null)}>
            <div className="rounded-xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: "#ffffff", padding: "20px" }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm" style={{ color: "#0d0446" }}>
                <X size={18} />
              </button>
              <div className="flex gap-5">
                {detailProg.capa && (
                  <img src={detailProg.capa} alt={detailProg.nome} className="w-48 h-48 object-cover rounded-lg shrink-0" />
                )}
                <div className="space-y-2 flex-1 min-w-0">
                  <h2 className="text-lg font-bold pr-6" style={{ color: "#0d0446" }}>{detailProg.nome}</h2>
                  <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                    <Clock size={12} /> {detailProg.horarioInicio.slice(0, 5)} — {detailProg.horarioFim.slice(0, 5)}
                  </p>
                  <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                    <Calendar size={12} /> {detailProg.diasSemana.join(", ")}
                  </p>
                  {getPresenterName(detailProg.apresentadorId) && (
                    <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>
                      Locutor: {getPresenterName(detailProg.apresentadorId)}
                    </p>
                  )}
                  {detailProg.descricao && (
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(13,4,70,0.7)" }}>{detailProg.descricao}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        , document.body)}
      </DialogContent>
    </Dialog>
  );
}

export default memo(DashboardGradeDialog);

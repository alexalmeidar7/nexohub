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
      supabase.from("programas").select("*").ilike("estudio", "%fm%"),
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
    
    // Calculate next slot time
    const [h, m, s] = slotTime.split(":").map(Number);
    let nextM = m + 30;
    let nextH = h;
    if (nextM >= 60) {
      nextM = 0;
      nextH++;
    }
    const nextSlotTime = `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}:00`;

    const matching = programas.filter(p => {
      if (!p.ativo) return false;
      const dias = p.diasSemana.map(d => dayShortToFull[d] || d);
      
      // Overlap logic: program starts before slot ends AND program ends after slot starts
      const overlaps = p.horarioInicio < nextSlotTime && p.horarioFim > slotTime;
      return dias.includes(dia) && overlaps;
    });

    if (matching.length === 0) return undefined;

    // Variable programs take priority but ONLY on their specific date
    const variable = matching.find(p => p.variavel && p.dataVariavel === dateForDay);
    if (variable) return variable;

    // Priority: show program that starts in this slot if any
    const startsInSlot = matching.find(p => p.horarioInicio >= slotTime && p.horarioInicio < nextSlotTime);
    if (startsInSlot) return startsInSlot;

    // Otherwise show fixed (non-variable) program
    return matching.find(p => !p.variavel) || matching[0];
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

  const ui = {
    pageBg: "var(--layout-page-bg)",
    pageText: "var(--layout-page-text)",
    headerBg: "var(--layout-header-bg)",
    headerText: "var(--layout-header-text)",
    accent: "var(--layout-link-color)",
    buttonBg: "var(--layout-button-bg)",
    buttonText: "var(--layout-button-text)",
    border: "var(--layout-border-color)",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDetailProg(null); }}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] p-0 overflow-hidden" style={{ backgroundColor: ui.pageBg, border: `2px solid ${ui.headerBg}` }}>
        <DialogHeader className="px-6 pt-5 pb-3" style={{ borderBottom: `2px solid ${ui.headerBg}` }}>
          <DialogTitle className="text-lg font-bold flex items-center gap-2" style={{ color: ui.pageText }}>
            📺 Grade de Programação
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="px-4 pb-4 animate-pulse">
            <div className="flex gap-1 mb-3 mt-2">
              <div className="w-20 h-5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-header-bg) 12%, transparent)" }} />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 h-5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-header-bg) 7%, transparent)" }} />
              ))}
            </div>
            {Array.from({ length: 12 }).map((_, row) => (
              <div key={row} className="flex gap-1 mb-1">
                <div className="w-20 h-8 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-header-bg) 7%, transparent)" }} />
                {Array.from({ length: 7 }).map((_, col) => (
                  <div key={col} className="flex-1 h-8 rounded" style={{ backgroundColor: Math.random() > 0.4 ? "color-mix(in srgb, var(--layout-header-bg) 6%, transparent)" : "transparent" }} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="overflow-auto max-h-[75vh] px-4 pb-4 grade-scroll-dashboard"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--layout-header-bg) var(--layout-page-bg)" }}
          >
            <style>{`
              .grade-scroll-dashboard::-webkit-scrollbar { width: 8px; height: 8px; }
              .grade-scroll-dashboard::-webkit-scrollbar-track { background: color-mix(in srgb, var(--layout-page-bg) 92%, black 8%); border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb { background: var(--layout-header-bg); border-radius: 4px; }
              .grade-scroll-dashboard::-webkit-scrollbar-thumb:hover { background: var(--layout-link-color); }
            `}</style>
            <table data-no-row-hover className="w-full text-xs border-separate border-spacing-1">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: ui.pageBg }}>
                <tr>
                  <th className="px-2 py-2 text-left w-20 rounded-lg" style={{ color: ui.pageText }}>Horário</th>
                  {DIAS_SEMANA.map(dia => (
                    <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "font-bold" : ""}`}
                      style={{ color: dia === diaAtual ? ui.accent : "color-mix(in srgb, var(--layout-page-text) 45%, transparent)" }}>
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
                      <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "color-mix(in srgb, var(--layout-page-text) 55%, transparent)" }}>{slot.slice(0, 5)}</td>
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
                            className="rounded-lg transition-all relative"
                            style={{
                              backgroundColor: isOnAir ? ui.accent : ui.pageBg,
                              color: isOnAir ? ui.headerText : ui.pageText,
                              fontWeight: isOnAir ? "bold" : undefined,
                              border: isOnAir ? `2px solid ${ui.accent}` : "1px solid color-mix(in srgb, var(--layout-border-color) 50%, transparent)",
                              verticalAlign: "top",
                              padding: "8px 10px",
                            }}
                            onMouseEnter={(e) => {
                              if (!isOnAir) {
                                e.currentTarget.style.borderColor = "var(--layout-link-color)";
                                e.currentTarget.style.borderWidth = "2px";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isOnAir) {
                                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-border-color) 50%, transparent)";
                                e.currentTarget.style.borderWidth = "1px";
                              }
                            }}>
                            <div className="text-[10px] font-bold leading-tight" style={{ wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{prog.nome}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: isOnAir ? "color-mix(in srgb, var(--layout-header-text) 85%, transparent)" : "color-mix(in srgb, var(--layout-page-text) 55%, transparent)" }}>
                              {prog.horarioInicio.slice(0, 5)} - {prog.horarioFim.slice(0, 5)}
                            </div>
                            {presenterName && (
                              <div className="text-[9px] font-semibold mt-0.5" style={{ color: isOnAir ? "color-mix(in srgb, var(--layout-header-text) 92%, transparent)" : ui.pageText }}>
                                {presenterName}
                              </div>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailProg(prog); }}
                              className="mt-1 px-2 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 transition-colors"
                              style={{ backgroundColor: ui.buttonBg, color: ui.buttonText }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = ui.accent; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ui.buttonBg; }}
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
            <div className="rounded-xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: ui.pageBg, padding: "20px", border: `1px solid ${ui.border}` }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm" style={{ color: ui.pageText }}>
                <X size={18} />
              </button>
              <div className="flex gap-5">
                {detailProg.capa && (
                  <img src={detailProg.capa} alt={detailProg.nome} className="w-48 h-48 object-cover rounded-lg shrink-0" />
                )}
                <div className="space-y-2 flex-1 min-w-0">
                  <h2 className="text-lg font-bold pr-6" style={{ color: ui.pageText }}>{detailProg.nome}</h2>
                  <p className="text-xs flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text) 55%, transparent)" }}>
                    <Clock size={12} /> {detailProg.horarioInicio.slice(0, 5)} — {detailProg.horarioFim.slice(0, 5)}
                  </p>
                  <p className="text-xs flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text) 55%, transparent)" }}>
                    <Calendar size={12} /> {detailProg.diasSemana.join(", ")}
                  </p>
                  {getPresenterName(detailProg.apresentadorId) && (
                    <p className="text-xs font-semibold" style={{ color: ui.pageText }}>
                      Locutor: {getPresenterName(detailProg.apresentadorId)}
                    </p>
                  )}
                  {detailProg.descricao && (
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text) 78%, transparent)" }}>{detailProg.descricao}</p>
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

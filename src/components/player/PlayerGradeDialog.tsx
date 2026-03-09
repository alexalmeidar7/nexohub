import { useState, useRef, useMemo, memo } from "react";
import { X, Plus, Clock, Radio } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";

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
  apresentador_id: string | null;
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

const glassStyle = {
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  backdropFilter: "blur(32px)",
  WebkitBackdropFilter: "blur(32px)",
  boxShadow: "0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
} as const;

interface Props {
  programas: Programa[];
  onClose: () => void;
}

function PlayerGradeDialog({ programas, onClose }: Props) {
  const [detailProg, setDetailProg] = useState<Programa | null>(null);
  const gradeScrollRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const diaAtual = DIAS_MAP_FULL[now.getDay()];
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const weekDates = useMemo(() => {
    const dates: Record<string, string> = {};
    DIAS_SEMANA.forEach((dia, i) => {
      const date = addDays(weekStart, i);
      dates[dia] = format(date, "dd/MM");
    });
    return dates;
  }, [weekStart.toDateString()]);

  const gradeSlots = useMemo(() => generateGradeSlots(), []);

  const getDateForDay = (dia: string): string => {
    const idx = DIAS_SEMANA.indexOf(dia);
    const date = addDays(weekStart, idx);
    return format(date, "yyyy-MM-dd");
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
        } else {
          i++;
        }
      }
    });
    return { skipMap: skip, spanMap: span };
  }, [programas, gradeSlots]);

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center animate-fade-in" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="relative w-[95vw] max-w-[1200px] max-h-[90vh] rounded-2xl overflow-hidden"
        style={glassStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(230,0,0,0.25), rgba(230,0,0,0.1))" }}
            >
              <Radio size={16} style={{ color: "#e60000" }} />
            </div>
            <div>
              <h2 className="text-white text-base font-bold">Grade de Programação</h2>
              <p className="text-white/30 text-[10px]">Semana de {weekDates["Segunda"]} a {weekDates["Domingo"]}</p>
            </div>
          </div>
          <button
            onClick={() => { onClose(); setDetailProg(null); }}
            className="text-white/40 hover:text-white hover:bg-white/10 rounded-xl p-2 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div
          ref={gradeScrollRef}
          className="overflow-y-auto overflow-x-hidden max-h-[75vh] px-4 pb-4 pt-2 grade-scroll"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(230,0,0,0.4) transparent" }}
        >
          <style>{`
            .grade-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
            .grade-scroll::-webkit-scrollbar-track { background: transparent; }
            .grade-scroll::-webkit-scrollbar-thumb { background: rgba(230,0,0,0.3); border-radius: 3px; }
            .grade-scroll::-webkit-scrollbar-thumb:hover { background: rgba(230,0,0,0.5); }
            .grade-cell { transition: all 0.2s ease; }
            .grade-cell:hover { transform: scale(1.02); z-index: 5; }
          `}</style>
          <table data-no-row-hover className="w-full text-xs border-separate table-fixed" style={{ borderSpacing: "3px" }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="px-1.5 py-2.5 text-left rounded-xl text-[10px] uppercase tracking-wider font-semibold"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", width: "48px" }}
                >
                  <Clock size={10} className="inline mr-0.5 opacity-60" />
                  Hora
                </th>
                {DIAS_SEMANA.map(dia => {
                  const isToday = dia === diaAtual;
                  return (
                    <th
                      key={dia}
                      className="px-2 py-2.5 text-center rounded-xl"
                      style={{
                        backgroundColor: isToday ? "rgba(230,0,0,0.15)" : "rgba(255,255,255,0.05)",
                        color: isToday ? "#e60000" : "rgba(255,255,255,0.5)",
                        fontWeight: isToday ? 700 : 500,
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-wider">{dia.slice(0, 3)}</div>
                      <div className="text-[9px] font-normal opacity-60 mt-0.5">{weekDates[dia]}</div>
                      {isToday && <div className="w-4 h-0.5 rounded-full mx-auto mt-1" style={{ backgroundColor: "#e60000" }} />}
                    </th>
                  );
                })}
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
                  <tr key={slot} ref={isOnAirRow ? (el) => {
                    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
                  } : undefined}>
                    <td
                      className="px-2 py-1.5 font-mono rounded-lg text-center"
                      style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}
                    >
                      {slot.slice(0, 5)}
                    </td>
                    {DIAS_SEMANA.map(dia => {
                      const key = `${dia}-${slot}`;
                      if (skipMap[key]) return null;
                      const cellData = spanMap[key];
                      if (!cellData) return <td key={dia} className="px-1 py-1 rounded-xl" />;
                      const { prog, rowSpan } = cellData;
                      const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horario_inicio && currentTimeStr < prog.horario_fim;
                      return (
                        <td
                          key={dia}
                          rowSpan={rowSpan}
                          className="px-1.5 py-1 text-left rounded-xl grade-cell relative cursor-pointer group"
                          style={{
                            background: isOnAir
                              ? "linear-gradient(135deg, #e60000, #b30000)"
                              : "rgba(255,255,255,0.04)",
                            color: isOnAir ? "#fff" : "rgba(255,255,255,0.7)",
                            fontWeight: isOnAir ? 700 : 400,
                            verticalAlign: "top",
                            boxShadow: isOnAir ? "0 4px 16px rgba(230,0,0,0.3)" : "none",
                            border: isOnAir ? "none" : "1px solid rgba(255,255,255,0.05)",
                          }}
                          onClick={() => setDetailProg(prog)}
                        >
                          <div className="flex items-start gap-0.5">
                            <span className="text-[10px] truncate leading-tight text-left">{prog.nome}</span>
                            <Plus size={9} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity mt-0.5" />
                          </div>
                          <div className="text-[8px] opacity-40 mt-0.5 text-left">
                            {prog.horario_inicio.slice(0, 5)} – {prog.horario_fim.slice(0, 5)}
                          </div>
                          {isOnAir && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              <span className="text-[8px] font-bold text-white uppercase tracking-wider">no ar</span>
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

        {/* Detail overlay */}
        {detailProg && (
          <div className="absolute inset-0 z-20 flex items-center justify-center animate-fade-in" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div
              className="rounded-2xl max-w-lg w-full mx-4 relative overflow-hidden"
              style={{
                ...glassStyle,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
              }}
            >
              <button
                onClick={() => setDetailProg(null)}
                className="absolute top-4 right-4 text-white/40 hover:text-white hover:bg-white/10 rounded-xl p-1.5 transition-all z-10"
              >
                <X size={16} />
              </button>
              <div className="flex gap-4 p-5">
                <div className="shrink-0">
                  {detailProg.capa ? (
                    <img src={detailProg.capa} alt={detailProg.nome} className="w-32 h-32 object-cover rounded-xl" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }} />
                  ) : detailProg.selo ? (
                    <img src={detailProg.selo} alt={detailProg.nome} className="w-32 h-32 object-contain rounded-xl" />
                  ) : (
                    <div
                      className="w-32 h-32 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #e60000, #b30000)" }}
                    >
                      <span className="text-white text-3xl font-bold">{detailProg.nome.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-1 pr-8">{detailProg.nome}</h3>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2" style={{ backgroundColor: "rgba(230,0,0,0.15)" }}>
                    <Clock size={10} style={{ color: "#e60000" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "#e60000" }}>
                      {detailProg.horario_inicio.slice(0, 5)} – {detailProg.horario_fim.slice(0, 5)}
                    </span>
                  </div>
                  {detailProg.estudio && (
                    <p className="text-xs text-white/40 mb-1">Estúdio: {detailProg.estudio}</p>
                  )}
                  {detailProg.dias_semana && detailProg.dias_semana.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {detailProg.dias_semana.map(d => (
                        <span key={d} className="text-[9px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                  {detailProg.descricao && (
                    <p className="text-sm text-white/60 mt-2 leading-relaxed">{detailProg.descricao}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PlayerGradeDialog);

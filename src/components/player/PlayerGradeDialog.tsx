import { useState, useRef, useMemo, memo } from "react";
import { X, Plus, Play } from "lucide-react";
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

  // Pre-compute the grade data
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
    <div className="absolute inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
      <div className="relative w-[95vw] max-h-[90vh] rounded-lg overflow-hidden" style={{ backgroundColor: "#111" }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: "#d30707" }}>
          <div className="text-white text-lg font-bold flex items-center gap-2">
            <span style={{ color: "#d30707" }}>■</span> Grade de Programação
          </div>
          <button onClick={() => { onClose(); setDetailProg(null); }} className="hover:opacity-80 transition-opacity" style={{ color: "#d30707" }}>
            <X size={20} />
          </button>
        </div>
        <div
          ref={gradeScrollRef}
          className="overflow-auto max-h-[75vh] px-4 pb-4 grade-scroll"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#d30707 #222" }}
        >
          <style>{`
            .grade-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
            .grade-scroll::-webkit-scrollbar-track { background: #222; border-radius: 4px; }
            .grade-scroll::-webkit-scrollbar-thumb { background: #d30707; border-radius: 4px; }
            .grade-scroll::-webkit-scrollbar-thumb:hover { background: #ff1a1a; }
            .grade-cell:hover { outline: 2px solid #ed0808 !important; outline-offset: -1px; }
          `}</style>
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: "#111" }}>
              <tr>
                <th className="px-2 py-2 text-left w-20 rounded-lg" style={{ color: "#d30707" }}>Horário</th>
                {DIAS_SEMANA.map(dia => (
                  <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "font-bold" : ""}`}
                    style={{ color: dia === diaAtual ? "#d30707" : "#999" }}>
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
                  <tr key={slot} ref={isOnAirRow ? (el) => {
                    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
                  } : undefined}>
                    <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "#666" }}>{slot.slice(0, 5)}</td>
                    {DIAS_SEMANA.map(dia => {
                      const key = `${dia}-${slot}`;
                      if (skipMap[key]) return null;
                      const cellData = spanMap[key];
                      if (!cellData) return <td key={dia} className="px-1 py-1 rounded-lg" />;
                      const { prog, rowSpan } = cellData;
                      const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horario_inicio && currentTimeStr < prog.horario_fim;
                      return (
                        <td key={dia} rowSpan={rowSpan}
                          className="px-1 py-1 text-center rounded-lg transition-all grade-cell relative group"
                          style={{
                            backgroundColor: isOnAir ? "#d30707" : "rgba(211,7,7,0.15)",
                            color: isOnAir ? "#fff" : "#ccc",
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
                            <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ backgroundColor: "#fff", color: "#333" }}>
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

        {detailProg && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
            <div className="rounded-xl p-6 max-w-lg w-full mx-4 relative" style={{ backgroundColor: "#1a1a1a", border: "1px solid #d30707" }}>
              <button onClick={() => setDetailProg(null)} className="absolute top-3 right-3 hover:opacity-80 z-10" style={{ color: "#d30707" }}>
                <X size={18} />
              </button>
              <div className="flex gap-4">
                <div className="shrink-0">
                  {detailProg.capa ? (
                    <img src={detailProg.capa} alt={detailProg.nome} className="w-36 h-36 object-cover rounded-lg" />
                  ) : detailProg.selo ? (
                    <img src={detailProg.selo} alt={detailProg.nome} className="w-36 h-36 object-contain rounded-lg" />
                  ) : (
                    <div className="w-36 h-36 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#d30707" }}>
                      <span className="text-white text-3xl font-bold">{detailProg.nome.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-lg font-bold mb-1 pr-6">{detailProg.nome}</h3>
                  <div className="text-xs mb-2" style={{ color: "#d30707" }}>
                    {detailProg.horario_inicio.slice(0, 5)} - {detailProg.horario_fim.slice(0, 5)}
                  </div>
                  {detailProg.estudio && <div className="text-white/50 text-xs mb-1">Estúdio: {detailProg.estudio}</div>}
                  {detailProg.dias_semana && detailProg.dias_semana.length > 0 && (
                    <div className="text-white/50 text-xs mb-1">Dias: {detailProg.dias_semana.join(", ")}</div>
                  )}
                  {detailProg.descricao && <p className="text-white/70 text-sm mt-2 leading-relaxed">{detailProg.descricao}</p>}
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

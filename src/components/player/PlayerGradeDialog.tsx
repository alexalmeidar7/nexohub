import { useState, useRef, useMemo, useEffect, memo } from "react";
import { X, Clock, Radio, MapPin, Calendar, Tag, Shield, Sparkles, Loader2 } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

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
  thumb?: string | null;
  descricao: string | null;
  apresentador_id: string | null;
}

interface AIAnalysis {
  keywords: string[];
  classificacao: string;
  justificativa: string;
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

const RATING_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "Livre": { bg: "rgba(34,197,94,0.15)", text: "rgb(74,222,128)", label: "Livre" },
  "6": { bg: "rgba(251,191,36,0.15)", text: "rgb(251,191,36)", label: "6 anos" },
  "10": { bg: "rgba(59,130,246,0.15)", text: "rgb(96,165,250)", label: "10 anos" },
  "12": { bg: "rgba(245,158,11,0.15)", text: "rgb(251,191,36)", label: "12 anos" },
  "14": { bg: "rgba(249,115,22,0.15)", text: "rgb(251,146,60)", label: "14 anos" },
  "16": { bg: "rgba(239,68,68,0.15)", text: "rgb(248,113,113)", label: "16 anos" },
  "18": { bg: "rgba(0,0,0,0.3)", text: "rgb(248,113,113)", label: "18 anos" },
};

interface Props {
  programas: Programa[];
  onClose: () => void;
}

function PlayerGradeDialog({ programas, onClose }: Props) {
  const [detailProg, setDetailProg] = useState<Programa | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cellAiData, setCellAiData] = useState<Record<string, AIAnalysis>>({});
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const analysisCache = useRef<Record<string, AIAnalysis>>({});
  const hasScrolledToNow = useRef(false);
  const aiAnalysisDisabled = useRef(false);

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

  // Color palette — only black, gray, red variations
  const getProgColor = (name: string) => {
    const colors = [
      { bg: "rgba(200,0,0,0.10)", border: "rgba(200,0,0,0.25)", text: "rgb(248,140,140)" },
      { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)", text: "rgb(200,200,200)" },
      { bg: "rgba(150,1,1,0.12)", border: "rgba(150,1,1,0.30)", text: "rgb(255,160,160)" },
      { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.10)", text: "rgb(180,180,180)" },
      { bg: "rgba(190,1,1,0.10)", border: "rgba(190,1,1,0.22)", text: "rgb(252,170,170)" },
      { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", text: "rgb(210,210,210)" },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // Batch fetch AI analysis for all unique programs with descriptions
  useEffect(() => {
    const uniqueProgs = programas.filter(p => p.ativo && p.descricao && p.descricao.trim().length > 0);
    const seen = new Set<string>();
    const toFetch: Programa[] = [];
    for (const p of uniqueProgs) {
      if (seen.has(p.id) || analysisCache.current[p.id]) {
        if (analysisCache.current[p.id]) setCellAiData(prev => ({ ...prev, [p.id]: analysisCache.current[p.id] }));
        continue;
      }
      seen.add(p.id);
      toFetch.push(p);
    }
    // Fetch in parallel (max 6 at a time)
    let cancelled = false;
    const fetchBatch = async () => {
      for (let i = 0; i < toFetch.length; i += 6) {
        if (cancelled) return;
        const batch = toFetch.slice(i, i + 6);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            if (aiAnalysisDisabled.current) return { id: p.id, result: { keywords: [], classificacao: "Livre", justificativa: "" } as AIAnalysis };
            const { data, error } = await supabase.functions.invoke("analyze-program", { body: { nome: p.nome, descricao: p.descricao } });
            const status = (error as any)?.context?.status ?? (error as any)?.status;
            const msg = String((data as any)?.error || (error as any)?.message || "");
            if (status === 402 || status === 429 || msg.includes("insuficientes") || msg.includes("Limite")) {
              aiAnalysisDisabled.current = true;
              return { id: p.id, result: { keywords: [], classificacao: "Livre", justificativa: "Análise indisponível no momento." } as AIAnalysis };
            }
            if (error || data?.error) return { id: p.id, result: { keywords: [], classificacao: "Livre", justificativa: "" } as AIAnalysis };
            return { id: p.id, result: data as AIAnalysis };
          })
        );
        if (cancelled) return;
        const updates: Record<string, AIAnalysis> = {};
        for (const r of results) {
          if (r.status === "fulfilled") {
            analysisCache.current[r.value.id] = r.value.result;
            updates[r.value.id] = r.value.result;
          }
        }
        setCellAiData(prev => ({ ...prev, ...updates }));
      }
    };
    fetchBatch();
    return () => { cancelled = true; };
  }, [programas]);

  // Fetch AI analysis when detail popup opens
  useEffect(() => {
    if (!detailProg) { setAiAnalysis(null); return; }

    // Check cache first
    if (analysisCache.current[detailProg.id]) {
      setAiAnalysis(analysisCache.current[detailProg.id]);
      return;
    }

    if (!detailProg.descricao || detailProg.descricao.trim().length === 0) {
      setAiAnalysis({ keywords: [], classificacao: "Livre", justificativa: "Sem descrição disponível." });
      return;
    }

    let cancelled = false;
    setAiLoading(true);
    setAiAnalysis(null);

    if (aiAnalysisDisabled.current) {
      setAiLoading(false);
      setAiAnalysis({ keywords: [], classificacao: "Livre", justificativa: "Análise indisponível no momento." });
      return;
    }

    supabase.functions.invoke("analyze-program", {
      body: { nome: detailProg.nome, descricao: detailProg.descricao },
    }).then(({ data, error }) => {
      if (cancelled) return;
      setAiLoading(false);
      const status = (error as any)?.context?.status ?? (error as any)?.status;
      const msg = String((data as any)?.error || (error as any)?.message || "");

      if (status === 402 || status === 429 || msg.includes("insuficientes") || msg.includes("Limite")) {
        aiAnalysisDisabled.current = true;
        setAiAnalysis({ keywords: [], classificacao: "Livre", justificativa: "Análise indisponível no momento." });
        return;
      }

      if (error || data?.error) {
        setAiAnalysis({ keywords: [], classificacao: "Livre", justificativa: "Não foi possível analisar." });
        return;
      }

      const result = data as AIAnalysis;
      analysisCache.current[detailProg.id] = result;
      setAiAnalysis(result);
    }).catch(() => {
      if (cancelled) return;
      setAiLoading(false);
      aiAnalysisDisabled.current = true;
      setAiAnalysis({ keywords: [], classificacao: "Livre", justificativa: "Análise indisponível no momento." });
    });

    return () => { cancelled = true; };
  }, [detailProg?.id]);

  useEffect(() => {
    if (hasScrolledToNow.current) return;
    const container = gradeScrollRef.current;
    if (!container) return;
    const onAirRow = container.querySelector('tr[data-on-air="true"]') as HTMLTableRowElement | null;
    if (!onAirRow) return;

    hasScrolledToNow.current = true;
    requestAnimationFrame(() => onAirRow.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [spanMap, diaAtual, currentTimeStr]);

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) { onClose(); setDetailProg(null); } }}
    >
      <div
        className="relative w-[96vw] max-w-[1300px] max-h-[92vh] rounded-3xl overflow-hidden"
        style={{
          backgroundColor: "rgba(10, 10, 14, 0.92)",
          backdropFilter: "blur(40px)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {/* Header + Weekday row */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between px-8 py-4">
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))" }}
              >
                <Radio size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white text-lg font-bold tracking-tight">Grade de Programação</h2>
                <p className="text-white/30 text-xs mt-0.5">
                  <Calendar size={10} className="inline mr-1 -mt-0.5" />
                  Semana {weekDates["Segunda"]} — {weekDates["Domingo"]}
                </p>
              </div>
            </div>
            <button
              onClick={() => { onClose(); setDetailProg(null); }}
              className="text-white/30 hover:text-white hover:bg-white/10 rounded-2xl p-2.5 transition-all duration-200"
            >
              <X size={20} />
            </button>
          </div>
          {/* Weekday columns - fixed */}
          <div className="px-5 pb-3">
            <div className="flex" style={{ gap: "2px" }}>
              <div className="flex-shrink-0" style={{ width: "58px" }} />
              {DIAS_SEMANA.map(dia => {
                const isToday = dia === diaAtual;
                return (
                  <div
                    key={dia}
                    className="flex-1 px-2 py-3 text-center rounded-xl transition-colors"
                    style={{
                      backgroundColor: isToday ? "hsla(var(--player-accent) / 0.18)" : "rgba(255,255,255,0.06)",
                      color: isToday ? "hsl(var(--player-accent))" : "hsl(var(--player-foreground))",
                      fontWeight: isToday ? 800 : 700,
                    }}
                  >
                    <div className="text-[12px] uppercase tracking-wider font-bold">{dia.slice(0, 3)}</div>
                    <div className="text-[10px] font-semibold mt-0.5" style={{ color: isToday ? "hsl(var(--player-accent))" : "hsl(var(--player-foreground))" }}>{weekDates[dia]}</div>
                    {isToday && (
                      <div className="w-5 h-[2px] rounded-full mx-auto mt-1.5" style={{ backgroundColor: "hsl(var(--player-accent))" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          ref={gradeScrollRef}
          className="overflow-auto max-h-[70vh] px-5 pb-5 pt-0 grade-scroll"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
        >
          <style>{`
            .grade-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
            .grade-scroll::-webkit-scrollbar-track { background: transparent; }
            .grade-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
            .grade-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
            @keyframes pulseOnAir {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.7; }
            }
          `}</style>
          <table data-no-row-hover className="w-full text-xs border-separate table-fixed" style={{ borderSpacing: "2px" }}>
            <tbody>
              {gradeSlots.map(slot => {
                const onAirKey = `${diaAtual}-${slot}`;
                const isOnAirRow = spanMap[onAirKey] && (() => {
                  const p = spanMap[onAirKey].prog;
                  return p && currentTimeStr >= p.horario_inicio && currentTimeStr < p.horario_fim;
                })();

                return (
                  <tr key={slot} data-on-air={isOnAirRow ? "true" : "false"}>
                    <td
                      className="px-2 py-1 font-mono rounded-lg text-center"
                      style={{ color: "hsl(var(--player-foreground))", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}
                    >
                      {slot.slice(0, 5)}
                    </td>
                    {DIAS_SEMANA.map(dia => {
                      const key = `${dia}-${slot}`;
                      if (skipMap[key]) return null;
                      const cellData = spanMap[key];
                      if (!cellData) return <td key={dia} className="rounded-xl" style={{ background: "rgba(255,255,255,0.01)" }} />;
                      const { prog, rowSpan } = cellData;
                      const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horario_inicio && currentTimeStr < prog.horario_fim;
                      const color = getProgColor(prog.nome);

                      return (
                        <td
                          key={dia}
                          rowSpan={rowSpan}
                          className="px-2.5 py-2 text-left rounded-xl cursor-pointer group transition-all duration-200 hover:scale-[1.02] hover:z-10 relative"
                          style={{
                            background: isOnAir
                              ? "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))"
                              : color.bg,
                            color: isOnAir ? "#fff" : color.text,
                            fontWeight: isOnAir ? 700 : 500,
                            verticalAlign: "top",
                            boxShadow: isOnAir
                              ? "0 4px 20px hsla(var(--player-accent) / 0.4), inset 0 1px 0 rgba(255,255,255,0.15)"
                              : "none",
                            border: isOnAir ? "none" : `1px solid ${color.border}`,
                          }}
                          onClick={() => setDetailProg(prog)}
                        >
                          <span className="text-[10px] font-semibold leading-tight line-clamp-2 block">{prog.nome}</span>
                          <div className="text-[8px] mt-0.5 font-medium" style={{ color: isOnAir ? "rgba(255,255,255,0.7)" : "inherit", opacity: isOnAir ? 1 : 0.6 }}>
                            {prog.horario_inicio.slice(0, 5)}–{prog.horario_fim.slice(0, 5)}
                          </div>
                          {/* AI keywords + rating in cell */}
                          {cellAiData[prog.id] && (
                            <div className="mt-1">
                              <div className="flex flex-wrap items-center gap-0.5">
                                {cellAiData[prog.id].keywords.slice(0, 3).map((kw, ki) => (
                                  <span key={ki} className="text-[7px] px-1 py-0 rounded" style={{ backgroundColor: isOnAir ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", color: isOnAir ? "rgba(255,255,255,0.8)" : "inherit", opacity: isOnAir ? 1 : 0.7 }}>
                                    {kw}
                                  </span>
                                ))}
                              </div>
                              <span className="text-[7px] px-1 py-0 rounded font-bold mt-0.5 inline-block" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: isOnAir ? "rgba(255,255,255,0.7)" : "rgba(200,200,200,0.7)" }}>
                                {(RATING_COLORS[cellAiData[prog.id].classificacao] || RATING_COLORS["Livre"]).label}
                              </span>
                            </div>
                          )}
                          {isOnAir && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                              <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "pulseOnAir 1.5s ease-in-out infinite" }} />
                              <span className="text-[7px] font-bold text-white uppercase tracking-widest">no ar</span>
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
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setDetailProg(null); }}
          >
            <div
              className="rounded-3xl max-w-md w-full mx-4 relative overflow-hidden"
              style={{
                backgroundColor: "rgba(15, 15, 20, 0.95)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
              }}
            >
              {/* Cover image / gradient header */}
              <div className="relative h-52 overflow-hidden" style={{ backgroundColor: "hsl(var(--player-bg))" }}>
                {(detailProg.thumb || detailProg.capa) ? (
                  <img
                    src={detailProg.thumb || detailProg.capa!}
                    alt={detailProg.nome}
                    className="w-full h-full object-contain object-bottom"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)), rgba(0,0,0,0.8))" }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,15,20,1)] via-[rgba(15,15,20,0.4)] to-transparent" />

                {/* Close button */}
                <button
                  onClick={() => setDetailProg(null)}
                  className="absolute top-3 right-3 text-white/50 hover:text-white bg-black/30 hover:bg-black/50 rounded-full p-2 transition-all duration-200 backdrop-blur-sm"
                >
                  <X size={16} />
                </button>

                {/* Program initial if no cover */}
                {!detailProg.capa && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/20 text-7xl font-black">{detailProg.nome.charAt(0)}</span>
                  </div>
                )}

                {/* Selo badge */}
                {detailProg.selo && (
                  <img
                    src={detailProg.selo}
                    alt="selo"
                    className="absolute bottom-3 right-4 h-10 object-contain drop-shadow-lg"
                  />
                )}
              </div>

              {/* Content */}
              <div className="px-6 pb-6 -mt-2 relative z-10">
                <h3 className="text-xl font-bold text-white tracking-tight leading-tight">{detailProg.nome}</h3>

                {/* Metadata chips */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                    style={{
                      backgroundColor: "hsla(var(--player-accent) / 0.12)",
                      color: "hsl(var(--player-accent))",
                    }}
                  >
                    <Clock size={11} />
                    {detailProg.horario_inicio.slice(0, 5)} – {detailProg.horario_fim.slice(0, 5)}
                  </div>

                  {detailProg.estudio && (
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                    >
                      <MapPin size={10} />
                      {detailProg.estudio}
                    </div>
                  )}

                  {/* AI Age rating chip */}
                  {aiAnalysis && (
                    (() => {
                      const rating = RATING_COLORS[aiAnalysis.classificacao] || RATING_COLORS["Livre"];
                      return (
                        <div
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                          style={{ backgroundColor: rating.bg, color: rating.text }}
                          title={aiAnalysis.justificativa}
                        >
                          <Shield size={10} />
                          {rating.label}
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Days of the week */}
                {detailProg.dias_semana && detailProg.dias_semana.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {detailProg.dias_semana.map(d => {
                      const full = dayShortToFull[d] || d;
                      const isToday = full === diaAtual;
                      return (
                        <span
                          key={d}
                          className="text-[10px] px-2.5 py-1 rounded-lg font-medium transition-colors"
                          style={{
                            backgroundColor: isToday ? "hsla(var(--player-accent) / 0.15)" : "rgba(255,255,255,0.05)",
                            color: isToday ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.4)",
                            border: isToday ? "1px solid hsla(var(--player-accent) / 0.3)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {d}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Description */}
                {detailProg.descricao && (
                  <p className="text-sm text-white/50 mt-4 leading-relaxed">{detailProg.descricao}</p>
                )}

                {/* AI Analysis section */}
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={12} style={{ color: "hsl(var(--player-accent))" }} />
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Análise por IA</span>
                  </div>

                  {aiLoading ? (
                    <div className="flex items-center gap-2 py-3">
                      <Loader2 size={14} className="animate-spin text-white/30" />
                      <span className="text-xs text-white/30">Analisando programa...</span>
                    </div>
                  ) : aiAnalysis ? (
                    <div className="space-y-3">
                      {/* Keywords */}
                      {aiAnalysis.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {aiAnalysis.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-medium"
                              style={{
                                backgroundColor: "hsla(var(--player-accent) / 0.1)",
                                color: "hsl(var(--player-accent))",
                                border: "1px solid hsla(var(--player-accent) / 0.2)",
                              }}
                            >
                              <Tag size={8} />
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Age classification with justification */}
                      {aiAnalysis.justificativa && (
                        <div
                          className="rounded-xl p-3"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <div className="flex items-start gap-2">
                            <Shield size={12} className="flex-shrink-0 mt-0.5" style={{ color: RATING_COLORS[aiAnalysis.classificacao]?.text || "rgb(74,222,128)" }} />
                            <div>
                              <span className="text-[11px] font-semibold" style={{ color: RATING_COLORS[aiAnalysis.classificacao]?.text || "rgb(74,222,128)" }}>
                                Classificação: {RATING_COLORS[aiAnalysis.classificacao]?.label || aiAnalysis.classificacao}
                              </span>
                              <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{aiAnalysis.justificativa}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
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

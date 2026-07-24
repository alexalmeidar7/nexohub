import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Clock, Radio, Circle, CheckCircle2, Pencil, ArrowUpRight, Plus } from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Page = string;

interface Evt {
  id: string;
  data: string;
  descricao?: string | null;
  recorrencia: string;
  prioridade: string;
  tipo_evento?: string | null;
  horario_gravacao?: string | null;
  horario_gravacao_fim?: string | null;
  status?: string | null;
  programa_id?: string | null;
  programa?: { id: string; nome: string; horario_inicio?: string; horario_fim?: string } | null;
  synthetic?: boolean;
}

interface Programa {
  id: string;
  nome: string;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dias_semana?: string[] | null;
  ativo?: boolean | null;
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, "sábado": 6,
};

function normalizeDayName(s: string): number | null {
  const k = s.trim().toLowerCase();
  if (k in DAY_NAME_TO_INDEX) return DAY_NAME_TO_INDEX[k];
  return null;
}

function matches(evt: Evt & { periodo_inicio?: string | null; periodo_fim?: string | null; excecoes?: any }, date: Date) {
  if (!evt.data) return false;
  const evtDate = new Date(evt.data + "T12:00:00");
  const check = new Date(format(date, "yyyy-MM-dd") + "T12:00:00");
  const checkStr = format(date, "yyyy-MM-dd");
  let ok = false;
  if (evt.recorrencia === "unico" || !evt.recorrencia) {
    ok = isSameDay(evtDate, check);
  } else if (check < evtDate) {
    ok = false;
  } else if (evt.recorrencia === "programa_semanal") {
    // Segunda a sexta
    const dow = check.getDay();
    ok = dow >= 1 && dow <= 5;
  } else if (evt.recorrencia === "semanal") {
    ok = evtDate.getDay() === check.getDay();
  } else if (evt.recorrencia === "mensal") {
    ok = evtDate.getDate() === check.getDate();
  }
  if (!ok) return false;
  if (evt.recorrencia && evt.recorrencia !== "unico") {
    if (evt.periodo_inicio && checkStr < evt.periodo_inicio) return false;
    if (evt.periodo_fim && checkStr > evt.periodo_fim) return false;
  }
  try {
    const excs = Array.isArray(evt.excecoes) ? evt.excecoes : [];
    const exc = excs.find((e: any) => e?.data === checkStr);
    if (exc && exc.acao === "skip") return false;
  } catch {}
  return true;
}

const typeColors: Record<string, { bg: string; text: string; label: string }> = {
  live: { bg: "#ef4444", text: "#ffffff", label: "LIVE" },
  gravacao: { bg: "#8b5cf6", text: "#ffffff", label: "GRAVAÇÃO" },
  reuniao: { bg: "#3b82f6", text: "#ffffff", label: "REUNIÃO" },
  evento: { bg: "#f59e0b", text: "#111111", label: "EVENTO" },
  outro: { bg: "#64748b", text: "#ffffff", label: "OUTRO" },
};

// Background color used by the Audience widget — reused for weekly-recurring event cards.
const WEEKLY_BG = "#d9ff65";

export default function UpcomingEventsWidget({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evt[]>([]);
  const [programasAll, setProgramasAll] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Date>(new Date());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const [evtsRes, progsRes] = await Promise.all([
        supabase.from("agenda_eventos").select("*").eq("user_id", user.id).order("data"),
        supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const evts = evtsRes.data || [];
      const progs = (progsRes.data || []) as Programa[];
      setProgramasAll(progs);
      const progMap = new Map(progs.map(p => [p.id, p]));
      setEventos(
        evts.map((e: any) => ({
          ...e,
          programa: progMap.get(e.programa_id) ? {
            id: e.programa_id,
            nome: progMap.get(e.programa_id)!.nome,
            horario_inicio: progMap.get(e.programa_id)!.horario_inicio || undefined,
            horario_fim: progMap.get(e.programa_id)!.horario_fim || undefined,
          } : null,
        })) as Evt[]
      );
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel(`upcoming-events-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user]);


  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

  const dayHasEvents = (d: Date) => {
    const nowD = new Date();
    if (d < nowD && !isSameDay(d, nowD)) return false;
    const nowHM = `${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`;
    const hasExplicit = eventos.some(e => {
      if (!matches(e, d)) return false;
      if (e.status === "cancelado" || e.status === "concluido") return false;
      if (isSameDay(d, nowD)) {
        const refT = e.horario_gravacao_fim || e.programa?.horario_fim || e.horario_gravacao || e.programa?.horario_inicio;
        if (refT && refT.slice(0, 5) < nowHM) return false;
      }
      return true;
    });
    if (hasExplicit) return true;
    const DAY_INDEX_TO_NAME = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const dayNameNorm = norm(DAY_INDEX_TO_NAME[d.getDay()]);
    return programasAll.some((p) => {
      if (p.ativo === false || !p.horario_inicio) return false;
      const dias = (p.dias_semana || []).map((x) => norm(x || ""));
      if (!dias.includes(dayNameNorm)) return false;
      if (isSameDay(d, nowD)) {
        const refT = p.horario_fim || p.horario_inicio;
        if (refT && refT.slice(0, 5) < nowHM) return false;
      }
      return true;
    });
  };



  // Timeline por dia a partir do dia selecionado (próximos 14 dias).
  // Cada slot representa um dia com sua lista de eventos (pode estar vazia).
  const timeline = useMemo(() => {
    const nowD = new Date();
    const nowHM = `${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`;
    const days: { date: Date; events: Evt[] }[] = [];
    const DAYS_AHEAD = 14;
    let totalEvents = 0;
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = addDays(selected, i);
      const isTodayD = isSameDay(d, nowD);
      const isPastD = d < nowD && !isTodayD;
      if (isPastD) continue;
      const dayEvts: Evt[] = [];
      for (const evt of eventos) {
        if (!matches(evt, d)) continue;
        if (evt.status === "cancelado" || evt.status === "concluido") continue;
        if (isTodayD) {
          const endT = evt.horario_gravacao_fim || evt.programa?.horario_fim;
          const startT = evt.horario_gravacao || evt.programa?.horario_inicio;
          const refT = endT || startT;
          if (refT && refT.slice(0, 5) < nowHM) continue;
        }
        dayEvts.push(evt);
      }
      dayEvts.sort((a, b) => {
        const at = a.horario_gravacao || a.programa?.horario_inicio || "00:00";
        const bt = b.horario_gravacao || b.programa?.horario_inicio || "00:00";
        return at.localeCompare(bt);
      });
      days.push({ date: d, events: dayEvts });
      totalEvents += dayEvts.length;
      if (totalEvents >= 20 && i >= 6) break;
    }
    return days;
  }, [eventos, selected]);

  const hasAnyUpcoming = useMemo(() => timeline.some((d) => d.events.length > 0), [timeline]);




  const goToday = () => {
    const t = new Date();
    setSelected(t);
    setWeekAnchor(startOfWeek(t, { weekStartsOn: 1 }));
  };

  const openAgenda = (evtId?: string, intent?: "edit") => {
    if (evtId) sessionStorage.setItem("agenda_focus_event", evtId);
    if (intent === "edit" && evtId) sessionStorage.setItem("agenda_edit_event", evtId);
    try {
      sessionStorage.setItem("agenda_focus_date", format(selected, "yyyy-MM-dd"));
      sessionStorage.setItem("agenda_focus_week", format(weekAnchor, "yyyy-MM-dd"));
    } catch {}
    onNavigate?.("agenda" as Page);
  };

  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  const encerrarEvento = (evtId: string) => {
    // Phase 1 — confirmation flash (green glow + check pop)
    setConfirming((cur) => {
      const s = new Set(cur);
      s.add(evtId);
      return s;
    });
    // Phase 2 — smoke out
    window.setTimeout(() => {
      setConfirming((cur) => {
        const s = new Set(cur);
        s.delete(evtId);
        return s;
      });
      setDismissing((cur) => {
        const s = new Set(cur);
        s.add(evtId);
        return s;
      });
    }, 520);
    // Phase 3 — actually remove + persist
    window.setTimeout(async () => {
      const prev = eventos;
      setEventos((cur) => cur.map((e) => (e.id === evtId ? { ...e, status: "concluido" } : e)));
      setDismissing((cur) => {
        const s = new Set(cur);
        s.delete(evtId);
        return s;
      });
      const { error } = await supabase.from("agenda_eventos").update({ status: "concluido" }).eq("id", evtId);
      if (error) setEventos(prev);
    }, 520 + 640);
  };




  const textColor = "var(--layout-widget-text, #ffffff)";
  const accent = "var(--layout-accent-color, #2563eb)";

  if (loading) {
    return (
      <div className="animate-pulse h-full flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-9 rounded bg-white/5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-7 rounded bg-white/5" />
          <div className="h-7 rounded bg-white/5" />
          <div className="h-7 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={12} style={{ color: accent }} />
          <p className="text-[11px] font-bold tracking-tight" style={{ color: textColor }}>
            Próximos Eventos
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider transition-opacity hover:opacity-100"
            style={{ color: textColor, opacity: 0.6, border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}
            title="Hoje"
          >
            hoje
          </button>
          <button
            onClick={() => openAgenda()}
            className="text-[10px] font-semibold hover:opacity-100 flex items-center gap-1"
            style={{ color: textColor, opacity: 0.6 }}
          >
            <ExternalLink size={10} />
          </button>
        </div>
      </div>

      {/* Elegant week strip */}
      <div className="flex items-center gap-1 mb-2 shrink-0">
        <button
          onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
          className="p-0.5 rounded hover:bg-white/10 transition-colors"
          style={{ color: textColor, opacity: 0.5 }}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={12} />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-0.5">
          {weekDays.map((d) => {
            const isToday = isSameDay(d, new Date());
            const isSel = isSameDay(d, selected);
            const hasEv = dayHasEvents(d);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelected(d)}
                className="group flex flex-col items-center justify-center rounded-md py-0.5 transition-all"
                style={{
                  background: isSel ? accent : isToday ? "#ffffff" : "transparent",
                  border: isToday && !isSel ? `1px solid ${accent}` : "1px solid transparent",
                  color: isSel ? "var(--layout-header-text, #ffffff)" : isToday ? "#111111" : textColor,
                }}
              >
                <span className="text-[7.5px] uppercase font-semibold leading-none" style={{ opacity: isSel ? 0.9 : 0.5 }}>
                  {format(d, "EEEEEE", { locale: ptBR })}
                </span>
                <span className="text-[12px] font-bold leading-tight mt-0.5 tabular-nums">
                  {d.getDate()}
                </span>
                <span
                  className="block rounded-full mt-0.5"
                  style={{
                    width: 3,
                    height: 3,
                    background: hasEv ? (isSel ? "var(--layout-header-text, #ffffff)" : accent) : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
          className="p-0.5 rounded hover:bg-white/10 transition-colors"
          style={{ color: textColor, opacity: 0.5 }}
          aria-label="Próxima semana"
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Upcoming timeline feed (grouped by day) */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 scrollbar-hide">
        {!hasAnyUpcoming ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <CalendarDays size={18} className="mb-1" style={{ color: textColor }} />
            <p className="text-[11px] font-semibold" style={{ color: textColor }}>Sem eventos próximos</p>
          </div>
        ) : (
          <>
            {timeline.map(({ date: dayDate, events: dayEvents }) => {
              const dow = dayDate.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isTodayD = isSameDay(dayDate, new Date());
              const weekendLabel = dow === 6 ? "Sábado" : "Domingo";
              const dayNodes: JSX.Element[] = [];

              // Weekend divider box (Sábado / Domingo)
              if (isWeekend) {
                dayNodes.push(
                  <div
                    key={`weekend-${dayDate.toISOString()}`}
                    className="relative rounded-lg px-2.5 py-1.5 flex items-center gap-2 overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, rgba(0,191,240,0.16) 0%, rgba(198,240,60,0.14) 100%)",
                      border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 22%, transparent)",
                    }}
                  >
                    <span
                      className="inline-block w-1 h-6 rounded-full shrink-0"
                      style={{ background: dow === 6 ? "#00BFF0" : "#C6F03C" }}
                    />
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textColor }}>
                        {weekendLabel}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: textColor, opacity: 0.65 }}>
                        {format(dayDate, "dd 'de' MMM", { locale: ptBR })}
                      </span>
                    </div>
                    {isTodayD && (
                      <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded-full" style={{ background: accent, color: "var(--layout-header-text, #ffffff)" }}>
                        hoje
                      </span>
                    )}
                  </div>
                );
              }

              // Empty-day placeholder ("Sem evento neste dia")
              if (dayEvents.length === 0) {
                dayNodes.push(
                  <div
                    key={`empty-${dayDate.toISOString()}`}
                    className="rounded-lg px-2.5 py-1.5 flex items-center gap-2"
                    style={{
                      background: "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 25%, transparent)",
                      border: "1px dashed color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)",
                    }}
                  >
                    <div
                      className="flex flex-col items-center justify-center rounded-md shrink-0"
                      style={{
                        minWidth: 34,
                        padding: "2px 6px",
                        background: "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 45%, transparent)",
                        color: textColor,
                        opacity: 0.65,
                      }}
                    >
                      <span className="text-[8px] uppercase font-bold leading-none">{format(dayDate, "MMM", { locale: ptBR })}</span>
                      <span className="text-[13px] font-black leading-none tabular-nums mt-0.5">{dayDate.getDate()}</span>
                      <span className="text-[7.5px] uppercase font-bold leading-none mt-0.5">{format(dayDate, "EEE", { locale: ptBR }).replace(".", "")}</span>
                    </div>
                    <p className="text-[10.5px] italic font-medium m-0" style={{ color: textColor, opacity: 0.55 }}>
                      Sem evento neste dia
                    </p>
                  </div>
                );
              }

              // Events of the day
              dayEvents.forEach((evt) => {
                const date = dayDate;
                dayNodes.push(renderEventCard(evt, date));
              });

              return (
                <div key={`day-${dayDate.toISOString()}`} className="space-y-1">
                  {dayNodes}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer: Ver agenda completa + Novo evento */}
      <div className="mt-2 shrink-0 flex items-center gap-1.5">
        <button
          onClick={() => openAgenda()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: accent,
            color: "var(--layout-header-text, #ffffff)",
          }}
        >
          <CalendarDays size={12} />
          Ver agenda completa
          <ExternalLink size={11} className="opacity-80" />
        </button>
        <button
          onClick={() => {
            try { sessionStorage.setItem("agenda_open_new", "1"); } catch {}
            onNavigate?.("agenda" as Page);
          }}
          title="Cadastrar novo evento"
          aria-label="Cadastrar novo evento"
          className="shrink-0 flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: "#C6F03C",
            color: "#0a0a0a",
            boxShadow: "0 2px 8px rgba(198,240,60,0.35)",
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Novo
        </button>
      </div>

      <style>{`
        @keyframes evtSmokeOut {
          0%   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px) saturate(1); }
          35%  { opacity: 0.85; transform: translateY(-3px) scale(1.015); filter: blur(1.5px) saturate(1.1); }
          70%  { opacity: 0.35; transform: translateY(-12px) scale(1.05); filter: blur(6px) saturate(0.6); }
          100% { opacity: 0; transform: translateY(-26px) scale(1.09); filter: blur(12px) saturate(0.2); }
        }
        @keyframes evtSmokePuff {
          0%   { opacity: 0; transform: scale(0.6); }
          40%  { opacity: 0.85; transform: scale(1.15); }
          100% { opacity: 0; transform: scale(1.6); }
        }
        @keyframes evtConfirmPulse {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.035); }
          100% { transform: scale(1); }
        }
        @keyframes evtConfirmGlow {
          0%   { opacity: 0; }
          35%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes evtCheckPop {
          0%   { opacity: 0; transform: scale(0.4); }
          45%  { opacity: 1; transform: scale(1.15); }
          70%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
      `}</style>

    </div>
  );
}


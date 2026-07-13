import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Clock, Radio, Circle } from "lucide-react";
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
}

function matches(evt: Evt, date: Date) {
  if (!evt.data) return false;
  const evtDate = new Date(evt.data + "T12:00:00");
  const check = new Date(format(date, "yyyy-MM-dd") + "T12:00:00");
  if (evt.recorrencia === "unico" || !evt.recorrencia) return isSameDay(evtDate, check);
  if (check < evtDate) return false;
  if (evt.recorrencia === "semanal") return evtDate.getDay() === check.getDay();
  if (evt.recorrencia === "mensal") return evtDate.getDate() === check.getDate();
  return false;
}

const typeColors: Record<string, { bg: string; text: string; label: string }> = {
  live: { bg: "#ef4444", text: "#ffffff", label: "LIVE" },
  gravacao: { bg: "#8b5cf6", text: "#ffffff", label: "GRAVAÇÃO" },
  reuniao: { bg: "#3b82f6", text: "#ffffff", label: "REUNIÃO" },
  evento: { bg: "#f59e0b", text: "#111111", label: "EVENTO" },
  outro: { bg: "#64748b", text: "#ffffff", label: "OUTRO" },
};

export default function UpcomingEventsWidget({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Date>(new Date());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: evts } = await supabase
        .from("agenda_eventos")
        .select("*")
        .eq("user_id", user.id)
        .order("data");
      if (cancelled) return;
      if (!evts) { setEventos([]); setLoading(false); return; }
      const ids = Array.from(new Set(evts.map((e: any) => e.programa_id).filter(Boolean)));
      const { data: progs } = ids.length
        ? await supabase.from("programas").select("id, nome, horario_inicio, horario_fim").in("id", ids as string[])
        : { data: [] as any[] };
      if (cancelled) return;
      setEventos(
        evts.map((e: any) => ({
          ...e,
          programa: (progs || []).find((p: any) => p.id === e.programa_id) || null,
        })) as Evt[]
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

  const dayHasEvents = (d: Date) => eventos.some(e => matches(e, d) && e.status !== "cancelado" && e.status !== "concluido");

  // Upcoming events from selected day forward, next 30 days, sorted chronologically
  const upcoming = useMemo(() => {
    const out: { date: Date; evt: Evt }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(selected, i);
      for (const evt of eventos) {
        if (!matches(evt, d)) continue;
        if (evt.status === "cancelado" || evt.status === "concluido") continue;
        out.push({ date: d, evt });
      }
      if (out.length >= 12) break;
    }
    // sort by date + time
    out.sort((a, b) => {
      const dc = a.date.getTime() - b.date.getTime();
      if (dc !== 0) return dc;
      const at = a.evt.horario_gravacao || a.evt.programa?.horario_inicio || "00:00";
      const bt = b.evt.horario_gravacao || b.evt.programa?.horario_inicio || "00:00";
      return at.localeCompare(bt);
    });
    return out.slice(0, 12);
  }, [eventos, selected]);

  const goToday = () => {
    const t = new Date();
    setSelected(t);
    setWeekAnchor(startOfWeek(t, { weekStartsOn: 1 }));
  };

  const openAgenda = (evtId?: string) => {
    if (evtId) sessionStorage.setItem("agenda_focus_event", evtId);
    try {
      sessionStorage.setItem("agenda_focus_date", format(selected, "yyyy-MM-dd"));
      sessionStorage.setItem("agenda_focus_week", format(weekAnchor, "yyyy-MM-dd"));
    } catch {}
    onNavigate?.("agenda" as Page);
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

      {/* Upcoming descriptive list */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 scrollbar-hide">
        {upcoming.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <CalendarDays size={18} className="mb-1" style={{ color: textColor }} />
            <p className="text-[11px] font-semibold" style={{ color: textColor }}>Sem eventos próximos</p>
          </div>
        ) : (
          <>
            {!eventos.some((e) => matches(e, selected) && e.status !== "cancelado" && e.status !== "concluido") && (
              <div
                className="rounded-lg p-2 flex items-center gap-2"
                style={{
                  background: "#ffffff",
                  border: "1px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)",
                }}
              >
                <CalendarDays size={12} style={{ color: accent, opacity: 0.9 }} />
                <p className="text-[10px] leading-tight m-0" style={{ color: "#111111", opacity: 0.85 }}>
                  Nenhum evento em <span className="font-bold">{format(selected, "dd 'de' MMM", { locale: ptBR })}</span>. Próximos abaixo:
                </p>
              </div>
            )}
            {upcoming.map(({ date, evt }) => {
            const type = typeColors[(evt.tipo_evento || "live") as keyof typeof typeColors] || typeColors.live;
            const hora = evt.horario_gravacao || evt.programa?.horario_inicio || "";
            const horaFim = evt.horario_gravacao_fim || evt.programa?.horario_fim || "";
            const isToday = isSameDay(date, new Date());
            return (
              <button
                key={`${evt.id}-${date.toISOString()}`}
                onClick={() => openAgenda(evt.id)}
                className="w-full text-left rounded-lg p-1.5 transition-all hover:bg-white/10 active:scale-[0.99] border flex gap-2 items-stretch"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
                }}
              >
                {/* Date badge */}
                <div
                  className="flex flex-col items-center justify-center rounded-md px-1.5 shrink-0"
                  style={{
                    minWidth: 34,
                    background: isToday ? accent : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 40%, transparent)",
                    color: isToday ? "var(--layout-header-text, #ffffff)" : textColor,
                  }}
                >
                <span className="text-[8px] uppercase font-bold leading-none" style={{ opacity: 0.85 }}>
                    {format(date, "MMM", { locale: ptBR })}
                  </span>
                  <span className="text-[13px] font-black leading-none tabular-nums mt-0.5">
                    {date.getDate()}
                  </span>
                  <span className="text-[7.5px] uppercase font-bold leading-none mt-0.5" style={{ opacity: 0.75 }}>
                    {format(date, "EEE", { locale: ptBR }).replace(".", "")}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-bold truncate leading-tight flex-1" style={{ color: textColor }}>
                      {evt.programa?.nome || evt.descricao?.slice(0, 40) || "Evento"}
                    </p>
                    {evt.tipo_evento === "live" || !evt.tipo_evento ? (
                      <span
                        className="inline-flex items-center gap-1 shrink-0 rounded-full pl-1.5 pr-2 py-[2px] font-black text-[9px] tracking-[0.12em] uppercase"
                        style={{
                          background: "linear-gradient(135deg, #ff2d2d 0%, #b91c1c 100%)",
                          color: "#fff",
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset, 0 2px 6px rgba(239,68,68,0.45)",
                        }}
                      >
                        <span className="relative inline-flex w-1.5 h-1.5">
                          <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "#fff", opacity: 0.75 }} />
                          <span className="relative inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#fff" }} />
                        </span>
                        LIVE
                      </span>
                    ) : evt.tipo_evento === "gravacao" ? (
                      <span
                        className="inline-flex items-center gap-1 shrink-0 rounded-full pl-1.5 pr-2 py-[2px] font-black text-[9px] tracking-[0.12em] uppercase"
                        style={{
                          background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
                          color: "#fff",
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset, 0 2px 6px rgba(139,92,246,0.45)",
                        }}
                      >
                        <Circle size={7} fill="#fff" strokeWidth={0} />
                        REC
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center shrink-0 rounded-full px-2 py-[2px] font-black text-[9px] tracking-[0.12em] uppercase"
                        style={{
                          background: type.bg,
                          color: type.text,
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset",
                        }}
                      >
                        {type.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {hora && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums" style={{ color: textColor, opacity: 0.85 }}>
                        <Clock size={9} />
                        {hora.slice(0, 5)}{horaFim ? `–${horaFim.slice(0, 5)}` : ""}
                      </span>
                    )}
                    {evt.recorrencia && evt.recorrencia !== "unico" && (
                      <span className="text-[9px] uppercase font-bold" style={{ color: accent, opacity: 1 }}>
                        {evt.recorrencia === "semanal" ? "Semanal" : evt.recorrencia === "mensal" ? "Mensal" : evt.recorrencia}
                      </span>
                    )}
                  </div>
                  {evt.descricao && evt.programa?.nome && (
                    <p className="text-[10px] mt-0.5 leading-tight truncate font-medium" style={{ color: textColor, opacity: 0.8 }}>
                      {evt.descricao}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          </>
        )}
      </div>

      {/* Footer: Ver agenda completa */}
      <button
        onClick={() => openAgenda()}
        className="mt-2 shrink-0 w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.98]"
        style={{
          background: accent,
          color: "var(--layout-header-text, #ffffff)",
        }}
      >
        <CalendarDays size={12} />
        Ver agenda completa
        <ExternalLink size={11} className="opacity-80" />
      </button>
    </div>
  );
}

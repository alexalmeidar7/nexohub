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

function matches(evt: Evt, date: Date) {
  if (!evt.data) return false;
  const evtDate = new Date(evt.data + "T12:00:00");
  const check = new Date(format(date, "yyyy-MM-dd") + "T12:00:00");
  if (evt.recorrencia === "unico" || !evt.recorrencia) return isSameDay(evtDate, check);
  if (check < evtDate) return false;
  if (evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal") return evtDate.getDay() === check.getDay();
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
    const dow = d.getDay();
    return programasAll.some(p => {
      if (p.ativo === false) return false;
      if (!p.dias_semana || p.dias_semana.length === 0) return false;
      if (!p.dias_semana.some(name => normalizeDayName(name) === dow)) return false;
      if (isSameDay(d, nowD)) {
        const refT = (p.horario_fim || p.horario_inicio || "").slice(0, 5);
        if (refT && refT < nowHM) return false;
      }
      return true;
    });
  };


  // Upcoming events from selected day forward, next 30 days, sorted chronologically.
  // Includes synthetic recurring events derived from programas.dias_semana so a newly
  // created weekly program appears immediately even without an explicit agenda_eventos row.
  const upcoming = useMemo(() => {
    const out: { date: Date; evt: Evt }[] = [];
    const nowD = new Date();
    const nowHM = `${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`;
    // Build set of (programa_id + date) that already have an explicit event to avoid duplicating synthetics.
    for (let i = 0; i < 30; i++) {
      const d = addDays(selected, i);
      const isTodayD = isSameDay(d, nowD);
      const isPastD = d < nowD && !isTodayD;
      if (isPastD) continue;

      const explicitProgIdsToday = new Set<string>();
      for (const evt of eventos) {
        if (!matches(evt, d)) continue;
        if (evt.status === "cancelado" || evt.status === "concluido") continue;
        if (isTodayD) {
          const endT = evt.horario_gravacao_fim || evt.programa?.horario_fim;
          const startT = evt.horario_gravacao || evt.programa?.horario_inicio;
          const refT = endT || startT;
          if (refT && refT.slice(0, 5) < nowHM) continue;
        }
        if (evt.programa_id) explicitProgIdsToday.add(evt.programa_id);
        out.push({ date: d, evt });
      }

      // Add synthetic weekly events from programas with dias_semana matching this day.
      const dow = d.getDay();
      for (const p of programasAll) {
        if (p.ativo === false) continue;
        if (!p.dias_semana || p.dias_semana.length === 0) continue;
        if (explicitProgIdsToday.has(p.id)) continue;
        const dayMatches = p.dias_semana.some((name) => normalizeDayName(name) === dow);
        if (!dayMatches) continue;
        if (isTodayD) {
          const refT = (p.horario_fim || p.horario_inicio || "").slice(0, 5);
          if (refT && refT < nowHM) continue;
        }
        out.push({
          date: d,
          evt: {
            id: `synthetic-${p.id}-${format(d, "yyyy-MM-dd")}`,
            data: format(d, "yyyy-MM-dd"),
            recorrencia: "programa_semanal",
            prioridade: "normal",
            tipo_evento: "live",
            horario_gravacao: p.horario_inicio || null,
            horario_gravacao_fim: p.horario_fim || null,
            programa_id: p.id,
            programa: { id: p.id, nome: p.nome, horario_inicio: p.horario_inicio || undefined, horario_fim: p.horario_fim || undefined },
            synthetic: true,
          },
        });
      }

      if (out.length >= 20) break;
    }
    out.sort((a, b) => {
      const dc = a.date.getTime() - b.date.getTime();
      if (dc !== 0) return dc;
      const at = a.evt.horario_gravacao || a.evt.programa?.horario_inicio || "00:00";
      const bt = b.evt.horario_gravacao || b.evt.programa?.horario_inicio || "00:00";
      return at.localeCompare(bt);
    });
    return out.slice(0, 12);
  }, [eventos, programasAll, selected]);



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
            const isDismissing = dismissing.has(evt.id);
            const isConfirming = confirming.has(evt.id);
            const isWeekly = evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal";
            const cardBg = isWeekly ? WEEKLY_BG : "transparent";
            const cardText = isWeekly ? "#0A2540" : textColor;
            return (
              <div
                key={`${evt.id}-${date.toISOString()}`}
                className="upcoming-evt-shell"
                style={{
                  maxHeight: isDismissing ? 0 : 200,
                  marginTop: isDismissing ? 0 : undefined,
                  marginBottom: isDismissing ? 0 : undefined,
                  opacity: isDismissing ? 0 : 1,
                  overflow: "hidden",
                  pointerEvents: isDismissing || isConfirming ? "none" : "auto",
                  transition: "max-height 0.6s cubic-bezier(0.4,0,0.2,1), margin 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease",
                }}
              >
              <div
                className="group relative rounded-lg overflow-visible"
                style={{
                  animation: isDismissing
                    ? "evtSmokeOut 0.6s cubic-bezier(0.4,0,0.2,1) forwards"
                    : isConfirming
                      ? "evtConfirmPulse 0.52s cubic-bezier(0.34,1.56,0.64,1) forwards"
                      : undefined,
                  transformOrigin: "50% 40%",
                }}
              >
                {/* Confirmation flash — green glow ring + check pop */}
                {isConfirming && (
                  <>
                    <div
                      className="absolute inset-0 pointer-events-none rounded-lg"
                      style={{
                        animation: "evtConfirmGlow 0.52s ease-out forwards",
                        boxShadow: "0 0 0 2px rgba(34,197,94,0.9), 0 0 24px 4px rgba(34,197,94,0.55)",
                        background:
                          "linear-gradient(135deg, rgba(34,197,94,0.28) 0%, rgba(21,128,61,0.18) 100%)",
                      }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none flex items-center justify-center"
                      style={{ animation: "evtCheckPop 0.52s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 34,
                          height: 34,
                          background: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
                          boxShadow: "0 6px 18px rgba(34,197,94,0.55), 0 0 0 3px rgba(255,255,255,0.9) inset",
                        }}
                      >
                        <CheckCircle2 size={20} strokeWidth={3} style={{ color: "#ffffff" }} />
                      </div>
                    </div>
                  </>
                )}

                {/* Smoke puff overlay */}
                {isDismissing && (
                  <div
                    className="absolute inset-0 pointer-events-none rounded-lg"
                    style={{
                      animation: "evtSmokePuff 0.6s ease-out forwards",
                      background:
                        "radial-gradient(ellipse at center, rgba(220,240,255,0.55) 0%, rgba(200,220,255,0.25) 45%, rgba(255,255,255,0) 75%)",
                      filter: "blur(6px)",
                      mixBlendMode: "screen",
                    }}
                  />
                )}


                {/* Action rail (revealed when card slides left) */}
                <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-1 pl-2 pointer-events-none">
                  <button
                    type="button"
                    title="Encerrar evento"
                    onClick={(e) => { e.stopPropagation(); encerrarEvento(evt.id); }}
                    className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 hover:brightness-110 hover:scale-105 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
                      color: "#ffffff",
                      boxShadow: "0 4px 10px rgba(34,197,94,0.35), 0 0 0 1px rgba(255,255,255,0.15) inset",
                      transitionDelay: "60ms",
                    }}
                  >
                    <CheckCircle2 size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    title="Abrir na agenda"
                    onClick={(e) => { e.stopPropagation(); openAgenda(evt.id); }}
                    className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 hover:brightness-110 hover:scale-105 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)",
                      color: "#111827",
                      boxShadow: "0 4px 10px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06) inset",
                      transitionDelay: "120ms",
                    }}
                  >
                    <ArrowUpRight size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    title="Editar evento"
                    onClick={(e) => { e.stopPropagation(); openAgenda(evt.id, "edit"); }}
                    className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 hover:brightness-110 hover:scale-105 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, var(--layout-accent-color, #2563eb) 0%, color-mix(in srgb, var(--layout-accent-color, #2563eb) 55%, #000) 100%)",
                      color: "var(--layout-header-text, #ffffff)",
                      boxShadow: "0 4px 10px color-mix(in srgb, var(--layout-accent-color, #2563eb) 35%, transparent), 0 0 0 1px rgba(255,255,255,0.15) inset",
                      transitionDelay: "180ms",
                    }}
                  >
                    <Pencil size={13} strokeWidth={2.4} />
                  </button>
                </div>

                {/* Card (slides left on hover to reveal actions behind) */}
                <div
                  onClick={() => openAgenda(evt.id)}
                  className="relative w-full text-left rounded-lg p-1.5 transition-transform duration-300 ease-out will-change-transform group-hover:-translate-x-[112px] active:scale-[0.99] border flex gap-2 items-stretch cursor-pointer"
                  style={{
                    background: cardBg,
                    borderColor: isWeekly
                      ? "rgba(10,37,64,0.18)"
                      : "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
                  }}
                >
                {/* Date badge */}
                <div
                  className="flex flex-col items-center justify-center rounded-md px-1.5 shrink-0"
                  style={{
                    minWidth: 34,
                    background: isToday ? accent : isWeekly ? "rgba(10,37,64,0.12)" : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 40%, transparent)",
                    color: isToday ? "var(--layout-header-text, #ffffff)" : cardText,
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
                    <p className="text-[12px] font-bold truncate leading-tight flex-1" style={{ color: cardText }}>
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
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums" style={{ color: cardText, opacity: 0.85 }}>
                        <Clock size={9} />
                        {hora.slice(0, 5)}{horaFim ? `–${horaFim.slice(0, 5)}` : ""}
                      </span>
                    )}
                    {evt.recorrencia && evt.recorrencia !== "unico" && (
                      <span className="text-[9px] uppercase font-bold" style={{ color: isWeekly ? "#0A2540" : accent, opacity: 1 }}>
                        {evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal" ? "Semanal" : evt.recorrencia === "mensal" ? "Mensal" : evt.recorrencia}
                      </span>
                    )}
                  </div>
                  {evt.descricao && evt.programa?.nome && (
                    <p className="text-[10px] mt-0.5 leading-tight truncate font-medium" style={{ color: cardText, opacity: 0.8 }}>
                      {evt.descricao}
                    </p>
                  )}
                </div>
                </div>
              </div>
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


import { useEffect, useMemo, useRef, memo } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const NEXO_CYAN = "#0055ff";
const NEXO_DARK = "#0A2540";
const HOUR_H = 48; // px per hour
const START_HOUR = 0;
const END_HOUR = 24;

export interface WeekDay<T> {
  dateStr: string;
  date: Date;
  events: T[];
}

export interface GridEvent {
  key: string;
  title: string;
  startMin: number;
  endMin: number;
  color: string;
  subtitle?: string;
  note?: string;
  local?: string;
  recorrencia?: string;
  recorrenciaLabel?: string;
  status?: string;
  statusLabel?: string;
  statusColor?: string;
  participantes?: string[];
  tipoEvento?: string;
  raw: any;
}

interface Props<T> {
  weekDays: WeekDay<T>[];
  now: Date;
  selectedDate?: Date;
  toGridEvent: (evt: T, dateStr: string) => GridEvent | null;
  onSelectDate: (d: Date) => void;
  onEventClick: (evt: T, dateStr: string) => void;
  getFeriadoNome?: (d: Date) => string | null | undefined;
}

function layoutColumns(events: GridEvent[]) {
  // Simple overlap resolution: group overlapping events, split width.
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: { ev: GridEvent; col: number; cols: number }[] = [];
  let cluster: GridEvent[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const cols: GridEvent[][] = [];
    for (const ev of cluster) {
      let placed = false;
      for (const col of cols) {
        if (col[col.length - 1].endMin <= ev.startMin) {
          col.push(ev);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([ev]);
    }
    cols.forEach((col, ci) => col.forEach((ev) => result.push({ ev, col: ci, cols: cols.length })));
    cluster = [];
    clusterEnd = -1;
  };

  for (const ev of sorted) {
    if (cluster.length && ev.startMin >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return result;
}

function GoogleWeekGridComponent<T>({
  weekDays,
  now,
  selectedDate,
  toGridEvent,
  onSelectDate,
  onEventClick,
  getFeriadoNome,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  );

  const laidOut = useMemo(
    () =>
      weekDays.map((d) => ({
        ...d,
        items: layoutColumns(
          d.events.map((e) => toGridEvent(e, d.dateStr)).filter(Boolean) as GridEvent[],
        ),
      })),
    [weekDays, toGridEvent],
  );

  const firstEventStartMin = useMemo(() => {
    const focusDate = selectedDate ?? now;
    const focusedDay = laidOut.find((day) => isSameDay(day.date, focusDate));
    const firstEvent = focusedDay?.items.reduce<GridEvent | null>(
      (earliest, item) => !earliest || item.ev.startMin < earliest.startMin ? item.ev : earliest,
      null,
    );
    return firstEvent?.startMin ?? null;
  }, [laidOut, selectedDate, now]);

  useEffect(() => {
    if (didScroll.current || !scrollRef.current || firstEventStartMin === null) return;
    didScroll.current = true;
    const eventTop = ((firstEventStartMin - START_HOUR * 60) / 60) * HOUR_H;
    // Deixa o primeiro evento inteiro visível logo abaixo do cabeçalho fixo.
    scrollRef.current.scrollTop = Math.max(0, eventTop - 12);
  }, [firstEventStartMin]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMin - START_HOUR * 60) / 60) * HOUR_H;
  const todayIdx = weekDays.findIndex((d) => isSameDay(d.date, now));

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Single scrollable surface: sticky header stays fixed while body scrolls */}
      <div ref={scrollRef} data-testid="week-grid-scroll" className="relative overflow-y-auto flex-1" style={{ minHeight: 0, maxHeight: "min(70vh, 640px)" }}>
        {/* Day header */}
        <div
          className="grid sticky top-0 z-20 shrink-0"
          style={{
            gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`,
            background: "#FFFFFF",
            borderBottom: "1px solid #E5F5FB",
          }}
        >
          <div />
          {weekDays.map(({ date, dateStr }) => {
            const isToday = isSameDay(date, now);
            const isSel = selectedDate && isSameDay(date, selectedDate);
            const feriado = getFeriadoNome?.(date);
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(date)}
                className="flex flex-col items-center gap-1 py-2 transition-colors"
                style={{ borderLeft: "1px solid #EEF6FA", background: isSel ? "#F4FCFF" : "transparent" }}
                title={feriado || undefined}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: isToday ? NEXO_CYAN : feriado ? "#EF4444" : "rgba(10,37,64,0.5)" }}
                >
                  {format(date, "EEE", { locale: ptBR }).replace(".", "").slice(0, 3)}
                </span>
                <span
                  className="flex items-center justify-center rounded-full text-[17px] font-semibold"
                  style={{
                    width: 34,
                    height: 34,
                    background: isToday ? NEXO_CYAN : "transparent",
                    color: isToday ? "#FFFFFF" : NEXO_DARK,
                  }}
                >
                  {format(date, "dd")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Time grid */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}
        >
          {/* Hour gutter */}
          <div className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="relative"
                style={{ height: HOUR_H }}
              >
                <span
                  className="absolute right-2 -top-[7px] text-[10px] font-medium"
                  style={{ color: "rgba(10,37,64,0.45)" }}
                >
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {laidOut.map(({ dateStr, date, items }, dayIdx) => {
            const feriado = getFeriadoNome?.(date);
            return (
              <div
                key={dateStr}
                className="relative"
                style={{
                  borderLeft: "1px solid #EEF6FA",
                  background: feriado ? "rgba(239,68,68,0.03)" : "transparent",
                }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_H, borderTop: "1px solid #F1F7FA" }}
                  />
                ))}

                {/* Now indicator */}
                {dayIdx === todayIdx && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div style={{ height: 2, background: "#EA4335" }} />
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#EA4335",
                        marginTop: -6,
                        marginLeft: -5,
                      }}
                    />
                  </div>
                )}

                {/* Events */}
                {items.map(({ ev, col, cols }) => {
                  const top = ((ev.startMin - START_HOUR * 60) / 60) * HOUR_H;
                  const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * HOUR_H - 2);
                  const widthPct = 100 / cols;
                  const hasTime = height > 30;
                  const hasNote = height > 46 && !!ev.note;
                  const hasMeta = height > 62;
                  const hasPeople = height > 84;
                  return (
                    <button
                      key={ev.key}
                      type="button"
                      data-nexo-skip
                      onClick={() => onEventClick(ev.raw, dateStr)}
                      className="absolute text-left overflow-hidden transition-shadow hover:shadow-md flex flex-col"
                      style={{
                        top,
                        height,
                        left: `calc(${col * widthPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        borderRadius: 0,
                        padding: "4px 6px",
                        background: `color-mix(in srgb, ${ev.color} 10%, #FFFFFF)`,
                        borderLeft: `4px solid ${ev.color}`,
                        borderTop: `1px solid color-mix(in srgb, ${ev.color} 25%, #FFFFFF)`,
                        borderRight: `1px solid color-mix(in srgb, ${ev.color} 20%, #FFFFFF)`,
                        borderBottom: `1px solid color-mix(in srgb, ${ev.color} 20%, #FFFFFF)`,
                        color: NEXO_DARK,
                        lineHeight: 1.25,
                        gap: 1,
                      }}
                      title={`${ev.title}${ev.subtitle ? ` — ${ev.subtitle}` : ""}${ev.note ? `\n${ev.note}` : ""}`}
                    >
                      {hasTime && ev.subtitle && (
                        <span
                          className="block text-[9px] font-bold uppercase tracking-wide truncate"
                          style={{ color: ev.color }}
                        >
                          {ev.subtitle}
                        </span>
                      )}
                      <span className="block text-[11px] font-bold truncate" style={{ letterSpacing: "-0.01em" }}>
                        {ev.title}
                      </span>
                      {hasNote && (
                        <span
                          className="block text-[9.5px] font-medium overflow-hidden"
                          style={{
                            color: "rgba(10,37,64,0.72)",
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: height > 80 ? 3 : 2,
                          }}
                        >
                          {ev.note}
                        </span>
                      )}
                      {hasMeta && (
                        <div className="flex items-center gap-1 flex-wrap mt-auto">
                          {ev.local && (
                            <span className="text-[8.5px] font-semibold uppercase tracking-wide truncate" style={{ color: "rgba(10,37,64,0.55)", maxWidth: "100%" }}>
                              {ev.local}
                            </span>
                          )}
                          {ev.recorrencia && ev.recorrencia !== "unico" && (
                            <span
                              className="text-[8px] font-bold px-1"
                              style={{ backgroundColor: `${ev.color}1F`, color: ev.color, borderRadius: 0 }}
                            >
                              {ev.recorrenciaLabel}
                            </span>
                          )}
                          {ev.status && ev.status !== "ativo" && ev.statusLabel && ev.statusColor && (
                            <span
                              className="text-[8px] font-bold px-1"
                              style={{ backgroundColor: `${ev.statusColor}1F`, color: ev.statusColor, borderRadius: 0 }}
                            >
                              {ev.statusLabel}
                            </span>
                          )}
                        </div>
                      )}
                      {hasPeople && ev.participantes && ev.participantes.length > 0 && (
                        <span className="block text-[8.5px] truncate" style={{ color: "rgba(10,37,64,0.5)" }}>
                          {ev.participantes.slice(0, 3).join(", ")}
                          {ev.participantes.length > 3 && ` +${ev.participantes.length - 3}`}
                        </span>
                      )}
                    </button>
                  );
                })}

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
 
const GoogleWeekGrid = memo(GoogleWeekGridComponent) as typeof GoogleWeekGridComponent;
export default GoogleWeekGrid;

import { useEffect, useMemo, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const NEXO_CYAN = "#00BFF0";
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

export default function GoogleWeekGrid<T>({
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

  useEffect(() => {
    if (didScroll.current || !scrollRef.current) return;
    didScroll.current = true;
    scrollRef.current.scrollTop = Math.max(0, (8 - START_HOUR) * HOUR_H - 16);
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMin - START_HOUR * 60) / 60) * HOUR_H;
  const todayIdx = weekDays.findIndex((d) => isSameDay(d.date, now));

  return (
    <div className="flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Day header */}
      <div
        className="grid sticky top-0 z-20"
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
      <div ref={scrollRef} className="relative overflow-y-auto" style={{ maxHeight: 560 }}>
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
                  return (
                    <button
                      key={ev.key}
                      type="button"
                      onClick={() => onEventClick(ev.raw, dateStr)}
                      className="absolute text-left overflow-hidden transition-shadow hover:shadow-md"
                      style={{
                        top,
                        height,
                        left: `calc(${col * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        borderRadius: 6,
                        padding: "3px 6px",
                        background: `color-mix(in srgb, ${ev.color} 20%, #FFFFFF)`,
                        borderLeft: `3px solid ${ev.color}`,
                        color: NEXO_DARK,
                        lineHeight: 1.15,
                      }}
                      title={`${ev.title}${ev.subtitle ? ` — ${ev.subtitle}` : ""}`}
                    >
                      <span className="block text-[11px] font-semibold truncate">{ev.title}</span>
                      {height > 30 && ev.subtitle && (
                        <span className="block text-[10px] opacity-70 truncate">{ev.subtitle}</span>
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

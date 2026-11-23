/**
 * Pure schedule resolver for the vMix A Seguir / Ainda Hoje text pulse.
 * No database calls or timers: the XML decides the visible values on EVERY read.
 */
export type AseguirMode = "next" | "later";
export type AseguirProgram = {
  id?: string; nome?: string; horario_inicio?: string; dias_semana?: string[];
  variavel?: boolean; data_variavel?: string | null; estudio?: string | null; ativo?: boolean;
};
export type AseguirManual = {
  mode: AseguirMode; triggered_at: string; expires_at: string;
};
export type AseguirFields = {
  t1: string; t2: string; t3: string;
  expiresAt: string; nextTriggerAt: string; mode: "next" | "later" | "";
};
type Event = { program: AseguirProgram; day: number; start: number; delta: number; startKey: string };
const WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_MS = 86400000;
const BLANK = { t1: "", t2: "", t3: "", expiresAt: "", nextTriggerAt: "", mode: "" } as const;

function stationClock(now: Date, timezone: string) {
  const zone = (() => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return timezone; }
    catch { return "America/Sao_Paulo"; }
  })();
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const value = (key: string) => Number(fields.find(part => part.type === key)?.value || 0);
  return {
    day: Math.floor(Date.UTC(value("year"), value("month") - 1, value("day")) / DAY_MS),
    seconds: (value("hour") % 24) * 3600 + value("minute") * 60 + value("second"),
  };
}
function timeInSeconds(raw?: string): number {
  const m = String(raw || "").match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return -1;
  const hours = Number(m[1]), minutes = Number(m[2]);
  return hours < 24 && minutes < 60 ? hours * 3600 + minutes * 60 : -1;
}
function occurrences(programs: AseguirProgram[], now: Date, timezone: string): Event[] {
  const clock = stationClock(now, timezone);
  const result: Event[] = [];
  for (let offset = -1; offset <= 8; offset++) {
    const day = clock.day + offset;
    const date = new Date(day * DAY_MS);
    const dateStr = date.toISOString().slice(0, 10);
    const weekday = WEEK[date.getUTCDay()];
    for (const program of programs) {
      if (program.ativo === false || !program.nome?.trim()) continue;
      const studio = (program.estudio || "").toLowerCase();
      if (studio.includes("podcast") || !studio.includes("fm")) continue;
      const start = timeInSeconds(program.horario_inicio);
      if (start < 0) continue;
      const runs = program.variavel
        ? String(program.data_variavel || "").slice(0, 10) === dateStr
        : Array.isArray(program.dias_semana) && program.dias_semana.includes(weekday);
      if (!runs) continue;
      const delta = offset * 86400 + start - clock.seconds;
      result.push({ program, day, start, delta, startKey: dateStr + ":" + start });
    }
  }
  // Multiple FM studios in the same slot: keep one deterministic item per time.
  result.sort((a, b) => a.delta - b.delta ||
    Number(!!b.program.variavel) - Number(!!a.program.variavel) ||
    String(a.program.id || a.program.nome).localeCompare(String(b.program.id || b.program.nome)));
  return result.filter((event, index, all) => index === 0 || event.startKey !== all[index - 1].startKey);
}
function secondAfter(list: Event[], origin: Event): Event | null {
  const following = list.filter(item => item.delta > origin.delta && item.day === origin.day);
  return following[1] || null;
}
function fields(label: "a seguir:" | "ainda hoje:", event: Event, expiresAt: string, nextTriggerAt = ""): AseguirFields {
  return {
    t1: label, t2: String(event.program.nome || "").trim(),
    t3: String(event.program.horario_inicio || "").slice(0, 5),
    expiresAt, nextTriggerAt, mode: label === "a seguir:" ? "next" : "later",
  };
}
function manualTarget(programs: AseguirProgram[], timestamp: Date, timezone: string, mode: AseguirMode): Event | null {
  const list = occurrences(programs, timestamp, timezone);
  const future = list.filter(event => event.delta > 0);
  if (mode === "next") return future[0] || null;
  const second = future[1];
  return second && second.day === stationClock(timestamp, timezone).day ? second : null;
}
/** Returns a valid target for the requested manual button; null means the grade has no slot. */
export function resolveManualAseguir(programs: AseguirProgram[], now: Date, timezone: string, mode: AseguirMode): Pick<AseguirFields, "t1" | "t2" | "t3"> | null {
  const target = manualTarget(programs, now, timezone, mode);
  if (!target) return null;
  return {
    t1: mode === "next" ? "a seguir:" : "ainda hoje:",
    t2: String(target.program.nome || ""),
    t3: String(target.program.horario_inicio || "").slice(0, 5),
  };
}
/** 45-second automatic/explicit pulses; outside their window all three XML tags are empty. */
export function resolveBroadcastAseguir(
  programs: AseguirProgram[], now: Date, timezone: string, enabled: boolean,
  manual?: AseguirManual | null,
): AseguirFields {
  if (!enabled || !Number.isFinite(now.getTime())) return { ...BLANK };
  const list = occurrences(programs, now, timezone);
  const triggers: Array<{ delay: number; event: Event; mode: AseguirMode; target: Event }> = [];
  for (const event of list) {
    const upcoming = event.delta - 600; // ten minutes before program start
    if (upcoming > -45) triggers.push({ delay: upcoming, event, mode: "next", target: event });
    const afterStart = event.delta + 1800; // thirty minutes after program start
    const second = secondAfter(list, event);
    if (second && afterStart > -45) triggers.push({ delay: afterStart, event, mode: "later", target: second });
  }
  const next = triggers.filter(trigger => trigger.delay > 0).sort((a, b) => a.delay - b.delay)[0];
  const nextTriggerAt = next ? new Date(now.getTime() + next.delay * 1000).toISOString() : "";
  const manualStart = manual ? new Date(manual.triggered_at).getTime() : NaN;
  const manualEnd = manual ? new Date(manual.expires_at).getTime() : NaN;
  if (manual && ["next", "later"].includes(manual.mode) &&
    Number.isFinite(manualStart) && Number.isFinite(manualEnd) &&
    manualEnd > now.getTime() && manualStart <= now.getTime() &&
    manualEnd <= manualStart + 45_000) {
    const target = manualTarget(programs, new Date(manualStart), timezone, manual.mode);
    if (target) {
      return { ...fields(manual.mode === "next" ? "a seguir:" : "ainda hoje:", target, new Date(manualEnd).toISOString(), nextTriggerAt) };
    }
  }
  const active = triggers.filter(trigger => trigger.delay <= 0 && trigger.delay > -45)
    .sort((a, b) => b.delay - a.delay)[0];
  if (!active) return { ...BLANK, nextTriggerAt };
  const expiresAt = new Date(now.getTime() + (45 + active.delay) * 1000).toISOString();
  return fields(active.mode === "next" ? "a seguir:" : "ainda hoje:", active.target, expiresAt, nextTriggerAt);
}

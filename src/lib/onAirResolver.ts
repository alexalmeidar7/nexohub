/**
 * Resolve o programa "efetivamente" no ar, com pré-carregamento do próximo
 * na última fração de minuto do programa atual. Evita o "flash sem programa"
 * quando há 1-2 segundos de gap entre horário_fim e o próximo horário_inicio.
 *
 * Regras:
 *  - Se AGORA está dentro de [inicio, fim) → programa atual.
 *  - Se AGORA está a <= PRELOAD_SECONDS do fim do atual E existe um próximo
 *    no MESMO DIA começando dentro de 120s após o fim → devolve o próximo.
 *  - Se NÃO há atual mas existe um próximo no mesmo dia começando em <= PRELOAD_SECONDS
 *    → devolve o próximo (evita gap na virada).
 *
 * IMPORTANTE: o "agora" é calculado no fuso horário configurado em
 * `empresa_config.timezone` (IANA, ex.: "America/Cuiaba"). Isso permite que
 * emissoras em fusos diferentes de Brasília (ex.: MT/MS = UTC-4) tenham o
 * programa no ar correto mesmo quando o navegador do usuário está em outro fuso.
 */

export const PRELOAD_SECONDS = 60;
const NEXT_MAX_GAP_SECONDS = 120; // até 2 min entre programas ainda "concatena"

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

function normalize(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesDay(dias: string[] | null | undefined, dayFull: string) {
  if (!dias || dias.length === 0) return true;
  const short = normalize(dayFull).slice(0, 3);
  return dias.some((d) => normalize(d).startsWith(short));
}

function toSec(hhmm: string): number {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}

/**
 * Retorna { weekday, hour, minute, second } para o `date` no `timezone` IANA.
 * Se `timezone` for vazio/inválido, usa o fuso local do navegador.
 */
function getZonedParts(date: Date, timezone?: string | null): {
  weekday: number; hour: number; minute: number; second: number;
} {
  if (!timezone) {
    return {
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // Intl retorna "24" à meia-noite em alguns navegadores; normaliza para 0.
    const hRaw = parseInt(get("hour"), 10);
    return {
      weekday: wdMap[get("weekday")] ?? date.getDay(),
      hour: Number.isFinite(hRaw) ? hRaw % 24 : 0,
      minute: parseInt(get("minute"), 10) || 0,
      second: parseInt(get("second"), 10) || 0,
    };
  } catch {
    return {
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

export interface ProgramLike {
  dias_semana?: string[] | null;
  horario_inicio: string;
  horario_fim: string;
  [k: string]: any;
}

export function resolveEffectiveOnAir<T extends ProgramLike>(
  programas: T[],
  now: Date = new Date(),
  timezone?: string | null,
): { current: T | null; isPreloadingNext: boolean } {
  const { weekday, hour, minute, second } = getZonedParts(now, timezone);
  const dayFull = DIAS_MAP[weekday];
  const nowSec = hour * 3600 + minute * 60 + second;

  const todays = programas
    .filter((p) => matchesDay(p.dias_semana, dayFull))
    .map((p) => ({ p, ini: toSec(p.horario_inicio), fim: toSec(p.horario_fim) }))
    .sort((a, b) => a.ini - b.ini);

  const currentEntry = todays.find((e) => nowSec >= e.ini && nowSec < e.fim);

  if (currentEntry) {
    const secToEnd = currentEntry.fim - nowSec;
    if (secToEnd <= PRELOAD_SECONDS) {
      const next = todays.find(
        (e) => e.ini >= currentEntry.fim && e.ini - currentEntry.fim <= NEXT_MAX_GAP_SECONDS,
      );
      if (next) return { current: next.p, isPreloadingNext: true };
    }
    return { current: currentEntry.p, isPreloadingNext: false };
  }

  // Sem programa atual: se tem um começando em <= PRELOAD_SECONDS, adianta
  const upcoming = todays.find((e) => e.ini > nowSec && e.ini - nowSec <= PRELOAD_SECONDS);
  if (upcoming) return { current: upcoming.p, isPreloadingNext: true };

  return { current: null, isPreloadingNext: false };
}

/**
 * Helper para callers: devolve os "dias da semana" (0=dom..6=sab) e o
 * horário HH:mm atual no fuso informado. Útil para lógicas de "próximo
 * programa" que hoje usam `new Date().getDay()` no navegador.
 */
export function getZonedNow(timezone?: string | null, now: Date = new Date()) {
  const { weekday, hour, minute } = getZonedParts(now, timezone);
  return {
    weekday,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

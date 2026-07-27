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

export interface ProgramLike {
  dias_semana?: string[] | null;
  horario_inicio: string;
  horario_fim: string;
  [k: string]: any;
}

export function resolveEffectiveOnAir<T extends ProgramLike>(
  programas: T[],
  now: Date = new Date(),
): { current: T | null; isPreloadingNext: boolean } {
  const dayFull = DIAS_MAP[now.getDay()];
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

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

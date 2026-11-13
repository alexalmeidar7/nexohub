export interface ScheduledProgram {
  id: string;
  nome: string;
  estudio: string | null;
  dias_semana: string[] | null;
  horario_inicio: string | null;
  horario_fim: string | null;
}

export interface SponsorLogo {
  id: string;
  nome: string | null;
  logo_url: string | null;
  programa_id: string | null;
  data_final: string | null;
  created_at: string;
}

const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function seconds(value: string | null): number {
  const [hours = 0, minutes = 0, secs = 0] = (value || "00:00:00").split(":").map(Number);
  return hours * 3600 + minutes * 60 + secs;
}

export function rotationTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  const dayIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(part("weekday"));
  if (dayIndex < 0) throw new Error("Não foi possível determinar o dia da programação.");
  return {
    today: `${part("year")}-${part("month")}-${part("day")}`,
    todayName: days[dayIndex],
    yesterdayName: days[(dayIndex + 6) % 7],
    seconds: seconds(`${part("hour")}:${part("minute")}:${part("second")}`),
    slot: Math.floor(now.getTime() / 5000),
  };
}

export function selectOnAirProgram<T extends ScheduledProgram>(programs: T[], now: Date): T | null {
  const time = rotationTime(now);
  const candidates = programs.filter((program) => {
    if (!program.horario_inicio || !program.horario_fim) return false;
    const start = seconds(program.horario_inicio);
    const end = seconds(program.horario_fim);
    const weekdays = program.dias_semana || [];
    return end <= start
      ? (weekdays.includes(time.todayName) && time.seconds >= start) ||
        (weekdays.includes(time.yesterdayName) && time.seconds < end)
      : weekdays.includes(time.todayName) && time.seconds >= start && time.seconds < end;
  });
  candidates.sort((a, b) => seconds(a.horario_inicio) - seconds(b.horario_inicio) || a.id.localeCompare(b.id));
  return candidates.find((program) => (program.estudio || "").toLowerCase().includes("fm")) || candidates[0] || null;
}

export function selectRotatingSponsor<T extends SponsorLogo>(logos: T[], programId: string | null, now: Date): T | null {
  if (!programId) return null;
  const time = rotationTime(now);
  const eligible = logos.filter((logo) => logo.programa_id === programId && !!logo.data_final && logo.data_final >= time.today);
  eligible.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return eligible.length ? eligible[time.slot % eligible.length] : null;
}

export function imgBlanckUrl(): string {
  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${baseUrl}/storage/v1/object/public/xml-files/broadcast/imgblanck.png`;
}

export function sponsorXml(name: string | null | undefined, logoUrl: string, indent = ""): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\x27/g, "&apos;");
  const resolvedLogoUrl = logoUrl.trim() || imgBlanckUrl();
  return `${indent}<patrocinador>\n${indent}  <nome>${escape(name || "")}</nome>\n${indent}  <logo_url>${escape(resolvedLogoUrl)}</logo_url>\n${indent}</patrocinador>`;
}
export function pngSponsorUrl(value: string): string {
  const clean = value.trim().split(/[?#]/)[0];
  if (!/^https?:\/\//i.test(clean) || !/\.png$/i.test(clean)) {
    throw new Error("Não foi possível gerar uma URL PNG pública para o patrocinador.");
  }
  return clean;
}

export function logosXml(program: ScheduledProgram | null, sponsor: SponsorLogo | null, logoUrl: string, now: Date): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<estudio>
  <programa_no_ar>
    <nome>${escape(program?.nome || "")}</nome>
    <estudio>${escape(program?.estudio || "")}</estudio>
${sponsorXml(sponsor?.nome, logoUrl, "    ")}
    <atualizado_em>${now.toISOString()}</atualizado_em>
  </programa_no_ar>
</estudio>`;
}

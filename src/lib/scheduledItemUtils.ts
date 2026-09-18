import { CLIENT_ACCOUNTS } from "./clientAuthAccounts";

export function getBrasiliaDateTime(): { today: string; currentTime: string } {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const currentTime = `${getPart("hour")}:${getPart("minute")}`;
    return { today, currentTime };
  } catch {
    const now = new Date(Date.now() - 3 * 3600 * 1000);
    return {
      today: now.toISOString().slice(0, 10),
      currentTime: now.toISOString().slice(11, 16),
    };
  }
}

export function normTime(t: any, def = "00:00"): string {
  const str = String(t ?? def).trim();
  const [h, m] = str.split(":");
  return `${(h || "0").padStart(2, "0")}:${(m || "00").slice(0, 2).padEnd(2, "0")}`;
}

export function isScheduleActive(
  itemDate: string,
  startTime: string,
  endTime: string,
  refDate?: string,
  refTime?: string
): boolean {
  if (!itemDate || !startTime || !endTime) return false;
  const { today, currentTime } = getBrasiliaDateTime();
  const targetDate = refDate || today;
  const targetTime = normTime(refTime || currentTime);

  if (itemDate !== targetDate) return false;

  const start = normTime(startTime, "00:00");
  const end = normTime(endTime, "23:59");

  if (start <= end) {
    return targetTime >= start && targetTime <= end;
  }
  // Crosses midnight (e.g. 23:00 to 02:00)
  return targetTime >= start || targetTime <= end;
}

export function getScheduleStatus(
  itemDate: string,
  startTime: string,
  endTime: string
): "active" | "scheduled" | "expired" {
  const { today, currentTime } = getBrasiliaDateTime();
  if (isScheduleActive(itemDate, startTime, endTime, today, currentTime)) {
    return "active";
  }
  if (itemDate > today) return "scheduled";
  if (itemDate === today) {
    const curr = normTime(currentTime);
    const start = normTime(startTime, "00:00");
    const end = normTime(endTime, "23:59");
    if (curr < start) return "scheduled";
    if (curr > end) return "expired";
  }
  return "expired";
}

export function escapeXml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface EnqueteData {
  id?: string;
  pergunta: string;
  resposta1: string;
  resposta2: string;
  resposta3?: string;
  resposta4?: string;
  resposta_correta?: number;
  data_enquete?: string;
  horario_inicio?: string;
  horario_fim?: string;
}

export interface QuizData {
  id?: string;
  pergunta: string;
  resposta1: string;
  resposta2: string;
  resposta3?: string;
  resposta4?: string;
  resposta_correta?: number | string;
  data_quiz?: string;
  horario_inicio?: string;
  horario_fim?: string;
  explicacao?: string;
  imagem_resposta?: string;
}

export interface BatalhaData {
  id?: string;
  artista1_nome: string;
  artista1_musica: string;
  artista1_porcentagem?: number;
  artista1_imagem?: string;
  artista2_nome: string;
  artista2_musica: string;
  artista2_porcentagem?: number;
  artista2_imagem?: string;
  data_batalha: string;
  horario_inicio: string;
  horario_fim: string;
}

export function buildEnqueteXml(enquete?: EnqueteData | null): string {
  if (!enquete || !enquete.pergunta) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta></pergunta>
    <resposta1></resposta1>
    <resposta2></resposta2>
    <resposta3></resposta3>
    <resposta4></resposta4>
  </enquete>
</items>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta>${escapeXml(enquete.pergunta)}</pergunta>
    <resposta1>${escapeXml(enquete.resposta1)}</resposta1>
    <resposta2>${escapeXml(enquete.resposta2)}</resposta2>
    <resposta3>${escapeXml(enquete.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(enquete.resposta4 || "")}</resposta4>
    <resposta_correta>${escapeXml(enquete.resposta_correta || 1)}</resposta_correta>
    <horario_inicio>${escapeXml(enquete.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(enquete.horario_fim || "")}</horario_fim>
  </enquete>
</items>
`;
}

export function buildQuizXml(quiz?: QuizData | null): string {
  if (!quiz || !quiz.pergunta) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <pergunta></pergunta>
    <resposta1></resposta1>
    <resposta2></resposta2>
    <resposta3></resposta3>
    <resposta4></resposta4>
    <resposta_correta></resposta_correta>
    <resposta_correta_texto></resposta_correta_texto>
    <horario_inicio></horario_inicio>
    <horario_fim></horario_fim>
    <explicacao></explicacao>
    <imagem_resposta></imagem_resposta>
  </dados>
</items>
`;
  }

  const corretaNum = Number(quiz.resposta_correta) || 1;
  const corretaTexto =
    corretaNum === 1
      ? quiz.resposta1
      : corretaNum === 2
      ? quiz.resposta2
      : corretaNum === 3
      ? quiz.resposta3
      : quiz.resposta4;

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <pergunta>${escapeXml(quiz.pergunta)}</pergunta>
    <resposta1>${escapeXml(quiz.resposta1)}</resposta1>
    <resposta2>${escapeXml(quiz.resposta2)}</resposta2>
    <resposta3>${escapeXml(quiz.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(quiz.resposta4 || "")}</resposta4>
    <resposta_correta>${escapeXml(quiz.resposta_correta || 1)}</resposta_correta>
    <resposta_correta_texto>${escapeXml(corretaTexto || "")}</resposta_correta_texto>
    <horario_inicio>${escapeXml(quiz.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(quiz.horario_fim || "")}</horario_fim>
    <explicacao>${escapeXml(quiz.explicacao || "")}</explicacao>
    <imagem_resposta>${escapeXml(quiz.imagem_resposta || "")}</imagem_resposta>
  </dados>
</items>
`;
}

export function buildBatalhaXml(batalha?: BatalhaData | null, stationName?: string): string {
  const emissora = stationName || (batalha as any)?.emissora || "";
  if (!batalha || (!batalha.artista1_nome && !batalha.artista2_nome)) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${escapeXml(emissora)}</emissora>
    <artista1_nome></artista1_nome>
    <artista1_musica></artista1_musica>
    <artista1_porcentagem>0%</artista1_porcentagem>
    <artista1_imagem></artista1_imagem>
    <artista2_nome></artista2_nome>
    <artista2_musica></artista2_musica>
    <artista2_porcentagem>0%</artista2_porcentagem>
    <artista2_imagem></artista2_imagem>
    <horario_inicio></horario_inicio>
    <horario_fim></horario_fim>
  </batalha>
</items>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${escapeXml(emissora)}</emissora>
    <artista1_nome>${escapeXml(batalha.artista1_nome)}</artista1_nome>
    <artista1_musica>${escapeXml(batalha.artista1_musica)}</artista1_musica>
    <artista1_porcentagem>${escapeXml(batalha.artista1_porcentagem ?? 0)}%</artista1_porcentagem>
    <artista1_imagem>${escapeXml(batalha.artista1_imagem || "")}</artista1_imagem>
    <artista2_nome>${escapeXml(batalha.artista2_nome)}</artista2_nome>
    <artista2_musica>${escapeXml(batalha.artista2_musica)}</artista2_musica>
    <artista2_porcentagem>${escapeXml(batalha.artista2_porcentagem ?? 0)}%</artista2_porcentagem>
    <artista2_imagem>${escapeXml(batalha.artista2_imagem || "")}</artista2_imagem>
    <horario_inicio>${escapeXml(batalha.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(batalha.horario_fim || "")}</horario_fim>
  </batalha>
</items>
`;
}

export function resolveStationInfo(slugOrUid: string) {
  const clean = (slugOrUid || "").toLowerCase().trim();
  const account = CLIENT_ACCOUNTS.find(
    (c) =>
      c.slug.toLowerCase() === clean ||
      (c.aliases && c.aliases.map((a) => a.toLowerCase()).includes(clean)) ||
      c.id === clean
  );
  return {
    slug: account?.slug || clean || "positivafm",
    uid: account?.parentUserId || account?.id || "d17e65af-e407-466f-9b60-b55c43399513",
    name: account?.nome || "House Mix Emissora",
  };
}

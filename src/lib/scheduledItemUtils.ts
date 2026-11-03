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
  const targetDate = String(refDate || today).slice(0, 10);
  const targetTime = normTime(refTime || currentTime);
  const normalizedItemDate = String(itemDate).slice(0, 10);

  if (normalizedItemDate !== targetDate) return false;

  const start = normTime(startTime, "00:00");
  const end = normTime(endTime, "23:59");

  if (start <= end) {
    return targetTime >= start && targetTime <= end;
  }
  // Crosses midnight (e.g. 23:00 to 02:00)
  return targetTime >= start || targetTime <= end;
}

function getDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let s = (sh || 0) * 60 + (sm || 0);
  let e = (eh || 0) * 60 + (em || 0);
  if (e < s) e += 24 * 60; // crosses midnight
  return e - s;
}

export function getActiveEnquete<T extends { data_enquete?: string; horario_inicio?: string; horario_fim?: string }>(
  list: T[],
  refDate?: string,
  refTime?: string,
  allowFallback = false
): T | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  const { today, currentTime } = getBrasiliaDateTime();
  const targetDate = String(refDate || today).slice(0, 10);
  const targetTime = refTime || currentTime;

  const activeList = list.filter((e) =>
    isScheduleActive(e.data_enquete || "", e.horario_inicio || "", e.horario_fim || "", targetDate, targetTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    // Se múltiplas enquetes estiverem ativas, prioriza a janela mais específica (menor duração) ou início mais recente
    activeList.sort((a, b) => {
      const aStart = normTime(a.horario_inicio, "00:00");
      const bStart = normTime(b.horario_inicio, "00:00");
      const aEnd = normTime(a.horario_fim, "23:59");
      const bEnd = normTime(b.horario_fim, "23:59");
      const aDur = getDurationMinutes(aStart, aEnd);
      const bDur = getDurationMinutes(bStart, bEnd);
      if (aDur !== bDur) return aDur - bDur;
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return 0;
    });
    return activeList[0];
  }

  // Sem enquete ativa no momento: só usa fallback se explicitamente autorizado (preview)
  if (allowFallback) {
    const todayItems = list.filter((e) => String(e.data_enquete || "").slice(0, 10) === targetDate);
    if (todayItems.length > 0) return todayItems[0];
    return list[0] || null;
  }

  return null;
}

export function getActiveQuiz<T extends { data_quiz?: string; horario_inicio?: string; horario_fim?: string }>(
  list: T[],
  refDate?: string,
  refTime?: string,
  allowFallback = false
): T | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  const { today, currentTime } = getBrasiliaDateTime();
  const targetDate = String(refDate || today).slice(0, 10);
  const targetTime = refTime || currentTime;

  const activeList = list.filter((q) =>
    isScheduleActive(q.data_quiz || "", q.horario_inicio || "", q.horario_fim || "", targetDate, targetTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    activeList.sort((a, b) => {
      const aStart = normTime(a.horario_inicio, "00:00");
      const bStart = normTime(b.horario_inicio, "00:00");
      const aEnd = normTime(a.horario_fim, "23:59");
      const bEnd = normTime(b.horario_fim, "23:59");
      const aDur = getDurationMinutes(aStart, aEnd);
      const bDur = getDurationMinutes(bStart, bEnd);
      if (aDur !== bDur) return aDur - bDur;
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return 0;
    });
    return activeList[0];
  }

  if (allowFallback) {
    const todayItems = list.filter((q) => String(q.data_quiz || "").slice(0, 10) === targetDate);
    if (todayItems.length > 0) return todayItems[0];
    return list[0] || null;
  }

  return null;
}

export function getActiveBatalha<T extends { data_batalha?: string; horario_inicio?: string; horario_fim?: string }>(
  list: T[],
  refDate?: string,
  refTime?: string,
  allowFallback = false
): T | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  const { today, currentTime } = getBrasiliaDateTime();
  const targetDate = String(refDate || today).slice(0, 10);
  const targetTime = refTime || currentTime;

  const activeList = list.filter((b) =>
    isScheduleActive(b.data_batalha || "", b.horario_inicio || "", b.horario_fim || "", targetDate, targetTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    activeList.sort((a, b) => {
      const aStart = normTime(a.horario_inicio, "00:00");
      const bStart = normTime(b.horario_inicio, "00:00");
      const aEnd = normTime(b.horario_fim, "23:59");
      const bEnd = normTime(b.horario_fim, "23:59");
      const aDur = getDurationMinutes(aStart, aEnd);
      const bDur = getDurationMinutes(bStart, bEnd);
      if (aDur !== bDur) return aDur - bDur;
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return 0;
    });
    return activeList[0];
  }

  if (allowFallback) {
    const todayItems = list.filter((b) => String(b.data_batalha || "").slice(0, 10) === targetDate);
    if (todayItems.length > 0) return todayItems[0];
    return list[0] || null;
  }

  return null;
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

export function buildEnqueteXml(enquete?: EnqueteData | null, emissora = "House Mix Emissora"): string {
  if (!enquete || !enquete.pergunta) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete ativa="0">
    <emissora>${escapeXml(emissora)}</emissora>
    <pergunta></pergunta>
    <opcao_a></opcao_a>
    <opcao_b></opcao_b>
    <opcao_c></opcao_c>
    <opcao_d></opcao_d>
    <votos_a>0</votos_a>
    <votos_b>0</votos_b>
    <votos_c>0</votos_c>
    <votos_d>0</votos_d>
    <resposta1></resposta1>
    <resposta2></resposta2>
    <resposta3></resposta3>
    <resposta4></resposta4>
    <resposta_correta></resposta_correta>
    <horario_inicio></horario_inicio>
    <horario_fim></horario_fim>
  </enquete>
</items>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete ativa="1">
    <emissora>${escapeXml(emissora)}</emissora>
    <pergunta>${escapeXml(enquete.pergunta)}</pergunta>
    <opcao_a>${escapeXml(enquete.resposta1)}</opcao_a>
    <opcao_b>${escapeXml(enquete.resposta2)}</opcao_b>
    <opcao_c>${escapeXml(enquete.resposta3 || "")}</opcao_c>
    <opcao_d>${escapeXml(enquete.resposta4 || "")}</opcao_d>
    <votos_a>0</votos_a>
    <votos_b>0</votos_b>
    <votos_c>0</votos_c>
    <votos_d>0</votos_d>
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
    <artista1></artista1>
    <musica1></musica1>
    <porcentagem1>0%</porcentagem1>
    <imagem1></imagem1>
    <foto1></foto1>
    <artista2></artista2>
    <musica2></musica2>
    <porcentagem2>0%</porcentagem2>
    <imagem2></imagem2>
    <foto2></foto2>
    <artista_a></artista_a>
    <musica_a></musica_a>
    <porcentagem_a>0%</porcentagem_a>
    <imagem_a></imagem_a>
    <artista_b></artista_b>
    <musica_b></musica_b>
    <porcentagem_b>0%</porcentagem_b>
    <imagem_b></imagem_b>
  </batalha>
</items>
`;
  }

  const p1 = batalha.artista1_porcentagem ?? 0;
  const p2 = batalha.artista2_porcentagem ?? 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${escapeXml(emissora)}</emissora>
    <artista1_nome>${escapeXml(batalha.artista1_nome)}</artista1_nome>
    <artista1_musica>${escapeXml(batalha.artista1_musica)}</artista1_musica>
    <artista1_porcentagem>${escapeXml(p1)}%</artista1_porcentagem>
    <artista1_imagem>${escapeXml(batalha.artista1_imagem || "")}</artista1_imagem>
    <artista2_nome>${escapeXml(batalha.artista2_nome)}</artista2_nome>
    <artista2_musica>${escapeXml(batalha.artista2_musica)}</artista2_musica>
    <artista2_porcentagem>${escapeXml(p2)}%</artista2_porcentagem>
    <artista2_imagem>${escapeXml(batalha.artista2_imagem || "")}</artista2_imagem>
    <horario_inicio>${escapeXml(batalha.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(batalha.horario_fim || "")}</horario_fim>
    <!-- Variantes de tags compatíveis com diferentes títulos vMix -->
    <artista1>${escapeXml(batalha.artista1_nome)}</artista1>
    <musica1>${escapeXml(batalha.artista1_musica)}</musica1>
    <porcentagem1>${escapeXml(p1)}%</porcentagem1>
    <imagem1>${escapeXml(batalha.artista1_imagem || "")}</imagem1>
    <foto1>${escapeXml(batalha.artista1_imagem || "")}</foto1>
    <artista2>${escapeXml(batalha.artista2_nome)}</artista2>
    <musica2>${escapeXml(batalha.artista2_musica)}</musica2>
    <porcentagem2>${escapeXml(p2)}%</porcentagem2>
    <imagem2>${escapeXml(batalha.artista2_imagem || "")}</imagem2>
    <foto2>${escapeXml(batalha.artista2_imagem || "")}</foto2>
    <artista_a>${escapeXml(batalha.artista1_nome)}</artista_a>
    <musica_a>${escapeXml(batalha.artista1_musica)}</musica_a>
    <porcentagem_a>${escapeXml(p1)}%</porcentagem_a>
    <imagem_a>${escapeXml(batalha.artista1_imagem || "")}</imagem_a>
    <artista_b>${escapeXml(batalha.artista2_nome)}</artista_b>
    <musica_b>${escapeXml(batalha.artista2_musica)}</musica_b>
    <porcentagem_b>${escapeXml(p2)}%</porcentagem_b>
    <imagem_b>${escapeXml(batalha.artista2_imagem || "")}</imagem_b>
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
    uid: account?.parentUserId || account?.id || "452ebd1e-61a0-42dd-bf80-231a3f426c83",
    name: account?.nome || "House Mix Emissora",
  };
}

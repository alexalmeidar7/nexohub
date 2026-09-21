import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

// Helper to get Brasilia date, time, weekday and seconds
function getBrasiliaDateTime(): { today: string; currentTime: string; dayName: string; nowSeconds: number } {
  const dayMap: Record<string, string> = {
    domingo: "Domingo",
    "segunda-feira": "Segunda",
    "terça-feira": "Terça",
    "quarta-feira": "Quarta",
    "quinta-feira": "Quinta",
    "sexta-feira": "Sexta",
    sábado: "Sábado",
  };
  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const hh = Number(getPart("hour") || 0);
    const mm = Number(getPart("minute") || 0);
    const ss = Number(getPart("second") || 0);
    const currentTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const dayRaw = (getPart("weekday") || "").toLowerCase();
    const dayName = dayMap[dayRaw] || "Domingo";
    const nowSeconds = hh * 3600 + mm * 60 + ss;
    return { today, currentTime, dayName, nowSeconds };
  } catch {
    const now = new Date(Date.now() - 3 * 3600 * 1000);
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    return {
      today: now.toISOString().slice(0, 10),
      currentTime: now.toISOString().slice(11, 16),
      dayName: dayNames[now.getDay()],
      nowSeconds: now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(),
    };
  }
}

function timeToSeconds(value: string | null | undefined): number {
  if (!value) return -1;
  const [h = "0", m = "0", s = "0"] = String(value).split(":");
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Number.isFinite(total) ? total : -1;
}

function escapeXml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normTime(t: any, def = "00:00"): string {
  const str = String(t ?? def).trim();
  const [h, m] = str.split(":");
  return `${(h || "0").padStart(2, "0")}:${(m || "00").slice(0, 2).padEnd(2, "0")}`;
}

function isScheduleActive(
  itemDate: string,
  startTime: string,
  endTime: string,
  targetDate: string,
  targetTime: string
): boolean {
  if (!itemDate || !startTime || !endTime) return false;
  const normalizedItemDate = String(itemDate).slice(0, 10);
  const normalizedTarget = String(targetDate).slice(0, 10);
  if (normalizedItemDate !== normalizedTarget) return false;
  const start = normTime(startTime, "00:00");
  const end = normTime(endTime, "23:59");
  if (start <= end) {
    return targetTime >= start && targetTime <= end;
  }
  return targetTime >= start || targetTime <= end;
}

function getDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let s = (sh || 0) * 60 + (sm || 0);
  let e = (eh || 0) * 60 + (em || 0);
  if (e < s) e += 24 * 60;
  return e - s;
}

function getActiveEnquete(list: any[], today: string, currentTime: string, allowFallback = false): any {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const targetDate = String(today).slice(0, 10);
  const activeList = list.filter((e: any) =>
    isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, targetDate, currentTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    activeList.sort((a: any, b: any) => {
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
    const todayItem = list.find((e: any) => String(e.data_enquete || "").slice(0, 10) === targetDate);
    if (todayItem) return todayItem;
    return list[0];
  }

  return undefined;
}

function getActiveQuiz(list: any[], today: string, currentTime: string, allowFallback = false): any {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const targetDate = String(today).slice(0, 10);
  const activeList = list.filter((q: any) =>
    isScheduleActive(q.data_quiz, q.horario_inicio, q.horario_fim, targetDate, currentTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    activeList.sort((a: any, b: any) => {
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
    const todayItem = list.find((q: any) => String(q.data_quiz || "").slice(0, 10) === targetDate);
    if (todayItem) return todayItem;
    return list[0];
  }

  return undefined;
}

function getActiveBatalha(list: any[], today: string, currentTime: string, allowFallback = false): any {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const targetDate = String(today).slice(0, 10);
  const activeList = list.filter((b: any) =>
    isScheduleActive(b.data_batalha, b.horario_inicio, b.horario_fim, targetDate, currentTime)
  );

  if (activeList.length === 1) return activeList[0];
  if (activeList.length > 1) {
    activeList.sort((a: any, b: any) => {
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
    const todayItem = list.find((b: any) => String(b.data_batalha || "").slice(0, 10) === targetDate);
    if (todayItem) return todayItem;
    return list[0];
  }

  return undefined;
}

function buildEnqueteXml(enquete?: any, emissora = "House Mix Emissora"): string {
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

function buildQuizXml(quiz?: any): string {
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

function buildBatalhaXml(batalha?: any, stationName?: string): string {
  const emissora = stationName || batalha?.emissora || "";
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

const CANONICAL_PRESENTER_BY_PROG: Record<string, { nome: string; foto: string; instagram: string }> = {
  // Positiva
  modao: { nome: "Fernando", foto: "/locutores/fernando.png", instagram: "@positivafm" },
  "energia positiva": { nome: "Fernando", foto: "/locutores/fernando.png", instagram: "@positivafm" },
  "sertanejo bom demais - 1": { nome: "Reginaldo Lucena", foto: "/locutores/reginaldo.png", instagram: "@_reginaldolucena" },
  "sertanejo bom demais - 2": { nome: "Vanessa Reis", foto: "/locutores/vanessa-reis.png", instagram: "@vanessareis.oficial" },
  "primeira hora": { nome: "Alysson Lima", foto: "/locutores/alysson.png", instagram: "@alyssonlima" },
  "bom dia positiva": { nome: "Márcio Rodrigues", foto: "/locutores/marcio.png", instagram: "@marciorodrigues.radio" },
  flashback: { nome: "Jonathas Mattos", foto: "/locutores/jonathas.png", instagram: "@jonathasmattoslocutor" },
  whatsapp: { nome: "Jonathas Mattos", foto: "/locutores/jonathas.png", instagram: "@jonathasmattoslocutor" },
  domingao: { nome: "Jonathas Mattos", foto: "/locutores/jonathas.png", instagram: "@jonathasmattoslocutor" },
  "vale night": { nome: "Jonathas Mattos", foto: "/locutores/jonathas.png", instagram: "@jonathasmattoslocutor" },
  madruga: { nome: "Automático", foto: "", instagram: "@positivafm" },

  // Interativa
  "falando serio": { nome: "José Luiz", foto: "/locutores/ze.png", instagram: "@interativafm" },
  "maratona (2)": { nome: "Johnny Botelho", foto: "/locutores/botelho.png", instagram: "@interativafm" },
  maratona: { nome: "Ani Cristine", foto: "/locutores/ani.png", instagram: "@anicristine" },
  cafezin: { nome: "Andre Rodrigues", foto: "/locutores/andre.png", instagram: "@andrerodrigues777" },
  "bonus 1": { nome: "Dj Henrique Amaral", foto: "/locutores/dj.png", instagram: "@djhenriqueamaral" },
  "papo cabeca": { nome: "Henrique Augusto", foto: "/locutores/henrique.png", instagram: "@henriquelocuteiro" },
  "super play": { nome: "Gabs", foto: "/locutores/gabs.png", instagram: "@frozengabs" },
  "mega bonus": { nome: "Ani Cristine", foto: "/locutores/ani.png", instagram: "@anicristine" },
  "sunset retro": { nome: "Éverson Cândido", foto: "/locutores/morga.png", instagram: "@interativafm" },
  inson: { nome: "Automático", foto: "", instagram: "@interativafm" },

  // Cultura
  "show da manha": { nome: "Azevedo Júnior", foto: "/locutores/azevedo.png", instagram: "@azevedojuniorlocutoroficial" },
  "bom dia cultura": { nome: "Paulinho Paré", foto: "/locutores/paulinho.png", instagram: "@culturafm973" },
  "tarde cultura": { nome: "Nathy Alice", foto: "/locutores/nathy.png", instagram: "@culturafm973" },
  "cultura mix": { nome: "Rafaela Rockenbach", foto: "/locutores/rafaela.png", instagram: "@culturafm973" },
  "noite cultura": { nome: "Raíssa Alves", foto: "/locutores/rayssa.png", instagram: "@culturafm973" },
};

function resolveSafePresenter(progName: string | undefined, stationKey: string): { nome: string; foto: string; instagram: string } {
  const norm = (progName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, val] of Object.entries(CANONICAL_PRESENTER_BY_PROG)) {
    if (norm.includes(key)) {
      return val;
    }
  }
  if (stationKey === "INTERATIVA FM") {
    return { nome: "Ani Cristine", foto: "/locutores/ani.png", instagram: "@anicristine" };
  }
  if (stationKey === "POSITIVA FM") {
    return { nome: "Fernando", foto: "/locutores/fernando.png", instagram: "@positivafm" };
  }
  return { nome: "Locutor no Ar", foto: "", instagram: "@radio" };
}

function ensurePngUrl(url: string | null | undefined): string {
  if (!url) return "";
  let clean = url.trim();
  clean = clean.replace(/\.web(p)?(\?.*)?$/i, (match, p1, query) => `.png${query || ""}`);
  return clean;
}

const BROADCAST_STATIONS: Record<
  string,
  {
    stationKey: string;
    name: string;
    freq: string;
    city: string;
    logo: string;
    social: string;
    whatsapp: string;
  }
> = {
  interativafm: {
    stationKey: "INTERATIVA FM",
    name: "Interativa FM 94.9",
    freq: "94.9 FM",
    city: "Goiânia - GO",
    logo: "/logos/interativa.png",
    social: "@interativafm",
    whatsapp: "https://wa.me/5562999719490",
  },
  positivafm: {
    stationKey: "POSITIVA FM",
    name: "Positiva FM 99.1",
    freq: "99.1 FM",
    city: "Goiânia - GO",
    logo: "/logos/positiva.png",
    social: "@positivafm",
    whatsapp: "https://wa.me/556299999991",
  },
  culturafm973: {
    stationKey: "CULTURA FM",
    name: "Cultura FM 97.3",
    freq: "97.3 FM",
    city: "Santos - SP",
    logo: "/logos/cultura.png",
    social: "@culturafm973",
    whatsapp: "https://wa.me/5513997009730",
  },
  transmissao: {
    stationKey: "JORNAL FM",
    name: "Jornal FM 96.5",
    freq: "96.5 FM",
    city: "Inhumas - GO",
    logo: "/logos/jornal.png",
    social: "@jornalfm",
    whatsapp: "https://wa.me/556299999999",
  },
  alex: {
    stationKey: "POSITIVA FM",
    name: "Nexo Brasil Admin",
    freq: "Rede Nexo",
    city: "Goiânia - GO",
    logo: "/logos/positiva.png",
    social: "@nexobrasil",
    whatsapp: "https://housemix.nexobrasil.net",
  },
};

function buildBroadcastXml(
  slug: string,
  broadcastOverride: any = {},
  music: any = {},
  programsDb: Record<string, any[]> = {}
): string {
  const normSlug = normalizeSlug(slug);
  const st = BROADCAST_STATIONS[normSlug] || BROADCAST_STATIONS.positivafm;
  const { today, currentTime, dayName, nowSeconds } = getBrasiliaDateTime();

  const progs = programsDb[st.stationKey] || [];
  let curProg: any = null;
  let nextProg: any = null;

  // 1. Current program
  const active: { p: any; dur: number; s: number }[] = [];
  for (const p of progs) {
    if (!(p.dias_semana || []).includes(dayName)) continue;
    const s = timeToSeconds(p.horario_inicio);
    const e = timeToSeconds(p.horario_fim);
    if (s < 0 || e < 0) continue;
    const crosses = e <= s;
    const isMatch = !crosses ? nowSeconds >= s && nowSeconds < e : nowSeconds >= s || nowSeconds < e;
    if (isMatch) {
      let dur = e - s;
      if (dur < 0) dur += 24 * 3600;
      active.push({ p, dur, s });
    }
  }
  if (active.length > 0) {
    active.sort((a, b) => a.dur - b.dur || b.s - a.s);
    curProg = active[0].p;
  }

  // 2. Next program
  const nextCands: { p: any; diff: number }[] = [];
  for (const p of progs) {
    if (!(p.dias_semana || []).includes(dayName)) continue;
    if (curProg && p.id === curProg.id) continue;
    const s = timeToSeconds(p.horario_inicio);
    if (s < 0) continue;
    const diff = s > nowSeconds ? s - nowSeconds : s + 24 * 3600 - nowSeconds;
    nextCands.push({ p, diff });
  }
  if (nextCands.length > 0) {
    nextCands.sort((a, b) => a.diff - b.diff);
    nextProg = nextCands[0].p;
  }

  // Presenters
  const curPres = resolveSafePresenter(curProg?.nome, st.stationKey);
  const nextPres = resolveSafePresenter(nextProg?.nome, st.stationKey);

  const locutorNome = broadcastOverride?.locutor_override || curPres.nome;
  const locutorFoto = curPres.foto;
  const locutorSocial = curPres.instagram;

  const progNome = curProg?.nome || `Programação ${st.name}`;
  const progLogo =
    st.stationKey === "POSITIVA FM" && curProg
      ? `/selos/${curProg.nome?.toLowerCase().includes("modao") ? "modao.png" : "domingao.png"}`
      : "";

  const musicaTexto =
    music?.artista && music?.titulo ? `${music.artista} - ${music.titulo}` : "Música em Reprodução";
  const musicaCapa = music?.capa || "";

  const ticker = broadcastOverride?.ticker || `Acompanhe a melhor programação em ${st.freq}`;
  const titulo = broadcastOverride?.assunto || `No Ar na ${st.name}`;

  const aSeguirNome = nextProg?.nome || "Próximo Programa";
  const aSeguirHorario = nextProg ? normTime(nextProg.horario_inicio) : "00:00";
  const aSeguirLocutor = nextPres.nome;
  const aSeguirFoto =
    !nextPres.foto || nextPres.foto.includes("sem-loc") || aSeguirLocutor === "Automático" || aSeguirLocutor === "—"
      ? ""
      : nextPres.foto;
  const aSeguirLogo = st.stationKey === "POSITIVA FM" ? "/selos/madrugada.png" : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <empresa_logo>${escapeXml(ensurePngUrl(st.logo))}</empresa_logo>
    <programa_nome>${escapeXml(progNome)}</programa_nome>
    <programa_logo>${escapeXml(ensurePngUrl(progLogo))}</programa_logo>
    <programa_thumb></programa_thumb>
    <locutor_nome>${escapeXml(locutorNome)}</locutor_nome>
    <locutor_foto>${escapeXml(ensurePngUrl(locutorFoto))}</locutor_foto>
    <locutor_social>${escapeXml(locutorSocial)}</locutor_social>
    <rede_social_atual>Instagram</rede_social_atual>
    <rede_social_icone>instagram</rede_social_icone>
    <logo_patrocinador></logo_patrocinador>
    <titulo>${escapeXml(titulo)}</titulo>
    <fundo_assunto>${escapeXml(ensurePngUrl(broadcastOverride?.assuntoBgUrl || ""))}</fundo_assunto>
    <qrcode_link>${escapeXml(st.whatsapp)}</qrcode_link>
    <ticker>${escapeXml(ticker)}</ticker>
    <insert_live></insert_live>
    <curiosidade>Transmitindo com qualidade digital direto dos estúdios centrais.</curiosidade>
    <musica_atual>${escapeXml(musicaTexto)}</musica_atual>
    <musica_capa>${escapeXml(ensurePngUrl(musicaCapa))}</musica_capa>
    <deezer_artist_img></deezer_artist_img>
    <banner_l></banner_l>
    <temperatura>26ºC</temperatura>
    <ico_temperatura>sun</ico_temperatura>
    <infos_canto>
      <titulo>${escapeXml(st.name)}</titulo>
      <descricao>${escapeXml(st.city)}</descricao>
      <ico_categoria>radio</ico_categoria>
      <temp_atual>26ºC</temp_atual>
      <ico_temp_atual>sun</ico_temp_atual>
    </infos_canto>
    <a_seguir>
      <ativo>1</ativo>
      <programa_nome>${escapeXml(aSeguirNome)}</programa_nome>
      <nome_programa>${escapeXml(aSeguirNome)}</nome_programa>
      <programa_logo>${escapeXml(ensurePngUrl(aSeguirLogo))}</programa_logo>
      <locutor_nome>${escapeXml(aSeguirLocutor)}</locutor_nome>
      <locutor_foto>${escapeXml(ensurePngUrl(aSeguirFoto))}</locutor_foto>
      <horario>${escapeXml(aSeguirHorario)}</horario>
      <texto>Fique conectado!</texto>
      <intervalo_atualizacao>60</intervalo_atualizacao>
      <atualizado_em>${new Date().toISOString()}</atualizado_em>
    </a_seguir>
  </dados>
</items>
`;
}

const SLUG_MAP: Record<string, string> = {
  positiva: "positivafm",
  p: "positivafm",
  "d17e65af-e407-466f-9b60-b55c43399513": "positivafm",
  interativa: "interativafm",
  "b2f70324-d086-4a5d-a407-cbc4acf98dce": "interativafm",
  jornal: "transmissao",
  "48423cc6-f3b1-4bea-8729-dd0ae76a89c3": "transmissao",
  cultura: "culturafm973",
  "66337743-4e4f-4950-b58f-750b0c76861e": "culturafm973",
  superadmin: "alex",
  "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5": "alex",
};

const SLUG_STATION_NAMES: Record<string, string> = {
  positivafm: "Positiva FM 99.1",
  positiva: "Positiva FM 99.1",
  p: "Positiva FM 99.1",
  interativafm: "Interativa FM",
  interativa: "Interativa FM",
  culturafm973: "Cultura FM 97.3",
  cultura: "Cultura FM 97.3",
  transmissao: "Transmissão FM",
  jornal: "Transmissão FM",
  alex: "Alex Estúdio",
  superadmin: "Alex Estúdio",
};

const SLUG_TO_UID: Record<string, string> = {
  positivafm: "d17e65af-e407-466f-9b60-b55c43399513",
  positiva: "d17e65af-e407-466f-9b60-b55c43399513",
  p: "d17e65af-e407-466f-9b60-b55c43399513",
  interativafm: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  interativa: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  transmissao: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  jornal: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  culturafm973: "66337743-4e4f-4950-b58f-750b0c76861e",
  cultura: "66337743-4e4f-4950-b58f-750b0c76861e",
  alex: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
  superadmin: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
};

function normalizeSlug(slug: string): string {
  const clean = (slug || "").toLowerCase().trim();
  return SLUG_MAP[clean] || clean;
}

const ALL_ALIASES: Record<string, string[]> = {
  positivafm: ["positivafm", "positiva", "p"],
  interativafm: ["interativafm", "interativa"],
  culturafm973: ["culturafm973", "cultura"],
  transmissao: ["transmissao", "jornal"],
  alex: ["alex", "superadmin"],
};

export function dynamicXmlPlugin(): Plugin {
  const rootDir = process.cwd();
  const enquetesFile = path.join(rootDir, "src", "data", "xml_enquetes_sync.json");
  const quizzesFile = path.join(rootDir, "src", "data", "xml_quizzes_sync.json");
  const batalhasFile = path.join(rootDir, "src", "data", "xml_batalhas_sync.json");
  const roteirosFile = path.join(rootDir, "src", "data", "xml_roteiros_sync.json");
  const musicFile = path.join(rootDir, "src", "data", "xml_music_sync.json");
  const broadcastFile = path.join(rootDir, "src", "data", "xml_broadcast_sync.json");
  const programsDbFile = path.join(rootDir, "src", "data", "station_programs_db.json");
  const suporteTicketsFile = path.join(rootDir, "src", "data", "suporte_tickets_sync.json");
  const empresaConfigFile = path.join(rootDir, "src", "data", "empresa_config_sync.json");

  function readEmpresaSyncData(): Record<string, any> {
    try {
      if (fs.existsSync(empresaConfigFile)) {
        return JSON.parse(fs.readFileSync(empresaConfigFile, "utf-8"));
      }
    } catch {}
    return {};
  }

  function writeEmpresaSyncData(data: Record<string, any>) {
    try {
      const dir = path.dirname(empresaConfigFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(empresaConfigFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing empresa sync file:", err);
    }
  }

  function readSyncData(filePath: string): Record<string, any[]> {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch {}
    return {};
  }

  function readBroadcastSyncData(): Record<string, any> {
    try {
      if (fs.existsSync(broadcastFile)) {
        return JSON.parse(fs.readFileSync(broadcastFile, "utf-8"));
      }
    } catch {}
    return {};
  }

  function writeBroadcastSyncData(data: Record<string, any>) {
    try {
      const dir = path.dirname(broadcastFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(broadcastFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing broadcast sync file:", err);
    }
  }

  function readProgramsDb(): Record<string, any[]> {
    try {
      if (fs.existsSync(programsDbFile)) {
        return JSON.parse(fs.readFileSync(programsDbFile, "utf-8"));
      }
    } catch {}
    return {};
  }

  function readMusicSyncData(): Record<string, any> {
    try {
      if (fs.existsSync(musicFile)) {
        return JSON.parse(fs.readFileSync(musicFile, "utf-8"));
      }
    } catch {}
    return {};
  }

  function writeMusicSyncData(data: Record<string, any>) {
    try {
      const dir = path.dirname(musicFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(musicFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing music sync file:", err);
    }
  }

  function writeSyncData(filePath: string, data: Record<string, any[]>) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing sync file:", filePath, err);
    }
  }

  function writeStaticXml(slug: string, filename: string, content: string) {
    try {
      if (!content || content.trim().length < 50) return;
      const norm = normalizeSlug(slug);
      const targets = new Set([slug, norm, ...(ALL_ALIASES[norm] || [])]);
      for (const t of targets) {
        if (!t || t.toLowerCase() === "xml") continue;
        const dir = path.join(rootDir, "public", "xml", t);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const targetPath = path.join(dir, filename);

        // Safety check: Never overwrite existing real user data with stubs or smaller mock content
        if (fs.existsSync(targetPath)) {
          try {
            const existing = fs.readFileSync(targetPath, "utf-8");
            const isExistingSubstantial = existing.trim().length > 200;
            const isNewFallback =
              content.includes("Patrocinador Oficial") ||
              content.includes("Locutor de Plantão") ||
              (filename === "logos.xml" && !content.includes('id="programa 2"') && existing.includes('id="programa 2"'));

            if (isExistingSubstantial && isNewFallback) {
              continue;
            }
          } catch {}
        }

        fs.writeFileSync(targetPath, content.trim() + "\n", "utf-8");

        // Atualiza também na pasta dist (se existir) para garantir sincronia no vite preview
        const distDir = path.join(rootDir, "dist", "xml", t);
        if (fs.existsSync(path.join(rootDir, "dist"))) {
          if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
          fs.writeFileSync(path.join(distDir, filename), content.trim() + "\n", "utf-8");
        }
      }
      if (norm === "positivafm" || slug === "positivafm" || norm === "default") {
        try {
          const rootTarget = path.join(rootDir, "public", filename);
          if (fs.existsSync(rootTarget)) {
            const existing = fs.readFileSync(rootTarget, "utf-8");
            const isExistingSubstantial = existing.trim().length > 200;
            const isNewFallback =
              content.includes("Patrocinador Oficial") ||
              content.includes("Locutor de Plantão") ||
              (filename === "logos.xml" && !content.includes('id="programa 2"') && existing.includes('id="programa 2"'));

            if (!isExistingSubstantial || !isNewFallback) {
              fs.writeFileSync(rootTarget, content.trim() + "\n", "utf-8");
              const publicXmlDir = path.join(rootDir, "public", "xml");
              if (!fs.existsSync(publicXmlDir)) fs.mkdirSync(publicXmlDir, { recursive: true });
              fs.writeFileSync(path.join(publicXmlDir, filename), content.trim() + "\n", "utf-8");
            }
          } else {
            fs.writeFileSync(rootTarget, content.trim() + "\n", "utf-8");
            const publicXmlDir = path.join(rootDir, "public", "xml");
            if (!fs.existsSync(publicXmlDir)) fs.mkdirSync(publicXmlDir, { recursive: true });
            fs.writeFileSync(path.join(publicXmlDir, filename), content.trim() + "\n", "utf-8");
          }

          if (fs.existsSync(path.join(rootDir, "dist"))) {
            const rootDistTarget = path.join(rootDir, "dist", filename);
            fs.writeFileSync(rootDistTarget, content.trim() + "\n", "utf-8");
            const distXmlDir = path.join(rootDir, "dist", "xml");
            if (!fs.existsSync(distXmlDir)) fs.mkdirSync(distXmlDir, { recursive: true });
            fs.writeFileSync(path.join(distXmlDir, filename), content.trim() + "\n", "utf-8");
          }
        } catch {}
      }
    } catch (err) {
      console.error("Error in writeStaticXml:", err);
    }
  }

  return {
    name: "vite-plugin-dynamic-xml",
    configureServer(server) {
      // 1. POST /api/sync-xml-enquete & /functions/v1/serve-xml-enquete
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (req.method === "POST" && (url.startsWith("/api/sync-xml-enquete") || url.startsWith("/functions/v1/serve-xml-enquete"))) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || parsed.user_id || slug;
              const store = readSyncData(enquetesFile);
              let enquetes: any[] = store[slug] || store[userId] || [];

              if (Array.isArray(parsed.enquetes)) {
                enquetes = parsed.enquetes;
              } else if (parsed.action === "delete") {
                const idToDelete = parsed.id || parsed.enqueteId;
                enquetes = enquetes.filter((e: any) => e.id !== idToDelete && e.pergunta !== parsed.pergunta);
              } else if (parsed.enquete || (parsed.pergunta && parsed.resposta1)) {
                const eq = parsed.enquete || parsed;
                enquetes = [eq, ...enquetes.filter((e: any) => e.id !== eq.id)];
              }

              store[slug] = enquetes;
              if (userId) store[userId] = enquetes;
              writeSyncData(enquetesFile, store);

              // Update static file on disk immediately using getActiveEnquete
              const { today, currentTime } = getBrasiliaDateTime();
              const active = getActiveEnquete(enquetes, today, currentTime);
              const stName = SLUG_STATION_NAMES[slug] || "House Mix Emissora";
              const xml = buildEnqueteXml(active, stName);
              writeStaticXml(slug, "enquete.xml", xml);

              // Sincroniza também o bloco <enquete> dentro de geral.xml
              const enqueteBlock = active
                ? `<enquete ativa="1">
    <pergunta>${escapeXml(active.pergunta)}</pergunta>
    <opcao_a>${escapeXml(active.resposta1)}</opcao_a>
    <votos_a>0</votos_a>
    <opcao_b>${escapeXml(active.resposta2)}</opcao_b>
    <votos_b>0</votos_b>
    <opcao_c>${escapeXml(active.resposta3 || "")}</opcao_c>
    <votos_c>0</votos_c>
    <opcao_d>${escapeXml(active.resposta4 || "")}</opcao_d>
    <votos_d>0</votos_d>
    <resposta1>${escapeXml(active.resposta1)}</resposta1>
    <resposta2>${escapeXml(active.resposta2)}</resposta2>
    <resposta3>${escapeXml(active.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(active.resposta4 || "")}</resposta4>
  </enquete>`
                : `<enquete ativa="0"></enquete>`;

              const geralPath = path.join(rootDir, "public", "xml", slug, "geral.xml");
              if (fs.existsSync(geralPath)) {
                try {
                  let gXml = fs.readFileSync(geralPath, "utf-8");
                  gXml = gXml.replace(/<enquete[\s\S]*?<\/enquete>/i, enqueteBlock);
                  writeStaticXml(slug, "geral.xml", gXml);
                } catch {}
              }

              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: true, count: enquetes.length, active: !!active, enquete: active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 2. POST /api/sync-xml-quiz & /functions/v1/serve-xml-quiz
        if (req.method === "POST" && (url.startsWith("/api/sync-xml-quiz") || url.startsWith("/functions/v1/serve-xml-quiz"))) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || parsed.user_id || slug;
              const store = readSyncData(quizzesFile);
              let quizzes: any[] = store[slug] || store[userId] || [];

              if (Array.isArray(parsed.quizzes)) {
                quizzes = parsed.quizzes;
              } else if (parsed.action === "delete") {
                const idToDelete = parsed.id || parsed.quizId;
                quizzes = quizzes.filter((q: any) => q.id !== idToDelete && q.pergunta !== parsed.pergunta);
              } else if (parsed.quiz || (parsed.pergunta && parsed.resposta1)) {
                const qz = parsed.quiz || parsed;
                quizzes = [qz, ...quizzes.filter((q: any) => q.id !== qz.id)];
              }

              store[slug] = quizzes;
              if (userId) store[userId] = quizzes;
              writeSyncData(quizzesFile, store);

              // Update static file on disk immediately using getActiveQuiz
              const { today, currentTime } = getBrasiliaDateTime();
              const active = getActiveQuiz(quizzes, today, currentTime);
              const xml = buildQuizXml(active);
              writeStaticXml(slug, "quiz.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: true, count: quizzes.length, active: !!active, quiz: active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 3. POST /api/sync-xml-batalha & /functions/v1/serve-xml-batalha
        if (req.method === "POST" && (url.startsWith("/api/sync-xml-batalha") || url.startsWith("/functions/v1/serve-xml-batalha"))) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || parsed.user_id || slug;
              const store = readSyncData(batalhasFile);
              let batalhas: any[] = store[slug] || store[userId] || [];

              if (Array.isArray(parsed.batalhas)) {
                batalhas = parsed.batalhas;
              } else if (parsed.action === "delete") {
                const idToDelete = parsed.id || parsed.batalhaId;
                batalhas = batalhas.filter((b: any) => b.id !== idToDelete);
              } else if (parsed.batalha) {
                const bt = parsed.batalha;
                batalhas = [bt, ...batalhas.filter((b: any) => b.id !== bt.id)];
              }

              store[slug] = batalhas;
              if (userId) store[userId] = batalhas;
              writeSyncData(batalhasFile, store);

              // Update static file on disk immediately using getActiveBatalha
              const { today, currentTime } = getBrasiliaDateTime();
              const active = getActiveBatalha(batalhas, today, currentTime);
              const stName = SLUG_STATION_NAMES[slug] || SLUG_STATION_NAMES[normalizeSlug(slug)] || "House Mix Emissora";
              const xml = buildBatalhaXml(active, stName);
              writeStaticXml(slug, "batalha.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: true, count: batalhas.length, active: !!active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 3b. GET /api/sync-xml-batalha
        if (req.method === "GET" && url.startsWith("/api/sync-xml-batalha")) {
          const parsedUrl = new URL(url, "http://localhost");
          const rawSlug = parsedUrl.searchParams.get("slug") || "positivafm";
          const slug = normalizeSlug(rawSlug);
          const userId = parsedUrl.searchParams.get("userId") || slug;
          const store = readSyncData(batalhasFile);
          const batalhas = store[slug] || store[userId] || store[rawSlug] || [];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, batalhas }));
          return;
        }

        // 3c. GET /api/sync-xml-enquete
        if (req.method === "GET" && url.startsWith("/api/sync-xml-enquete")) {
          const parsedUrl = new URL(url, "http://localhost");
          const rawSlug = parsedUrl.searchParams.get("slug") || "positivafm";
          const slug = normalizeSlug(rawSlug);
          const userId = parsedUrl.searchParams.get("userId") || slug;
          const store = readSyncData(enquetesFile);
          const enquetes = store[slug] || store[userId] || store[rawSlug] || [];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, enquetes }));
          return;
        }

        // 3d. GET /api/sync-xml-quiz
        if (req.method === "GET" && url.startsWith("/api/sync-xml-quiz")) {
          const parsedUrl = new URL(url, "http://localhost");
          const rawSlug = parsedUrl.searchParams.get("slug") || "positivafm";
          const slug = normalizeSlug(rawSlug);
          const userId = parsedUrl.searchParams.get("userId") || slug;
          const store = readSyncData(quizzesFile);
          const quizzes = store[slug] || store[userId] || store[rawSlug] || [];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, quizzes }));
          return;
        }

        // 4. POST /api/sync-xml-roteiro
        if (req.method === "POST" && url.startsWith("/api/sync-xml-roteiro")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const rawSlug = parsed.slug || "positivafm";
              const slug = normalizeSlug(rawSlug);
              const xml = parsed.xml;
              if (xml && typeof xml === "string") {
                writeStaticXml(slug, "roteiro.xml", xml);

                // Also persist in xml_roteiros_sync.json for persistent live memory
                const rotStore = readSyncData(roteirosFile);
                const item = {
                  id: parsed.roteiro?.id || `rot_${Date.now()}`,
                  programa_nome: parsed.programaNome || parsed.roteiro?.programa_nome || "Programa",
                  estudio: parsed.estudio || parsed.roteiro?.estudio || "ESTÚDIO FM",
                  data_programa: parsed.roteiro?.data_programa || new Date().toISOString().slice(0, 10),
                  horario: parsed.roteiro?.horario || "",
                  xml,
                  updated_at: new Date().toISOString(),
                };
                rotStore[slug] = [item];
                rotStore[rawSlug] = [item];
                if (parsed.userId) rotStore[parsed.userId] = [item];
                writeSyncData(roteirosFile, rotStore);
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, slug }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4b. POST /api/sync-music (Sincronização entre computadores do leitor local de música)
        if (req.method === "POST" && url.startsWith("/api/sync-music")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const rawSlug = parsed.slug || "positivafm";
              const slug = normalizeSlug(rawSlug);
              const userId = parsed.userId || slug;
              const musicInfo = {
                titulo: parsed.titulo || "",
                artista: parsed.artista || "",
                duracao: Number(parsed.duracao) || 180,
                capa: parsed.capa || "",
                horario: parsed.horario || "",
                startTime: Number(parsed.startTime) || Date.now(),
                source: parsed.source || "pasta",
                deviceName: parsed.deviceName || "",
                updated_at: new Date().toISOString(),
              };

              const store = readMusicSyncData();
              store[slug] = musicInfo;
              store[rawSlug] = musicInfo;
              if (userId) store[userId] = musicInfo;
              const norm = normalizeSlug(slug);
              for (const a of ALL_ALIASES[norm] || []) {
                store[a] = musicInfo;
              }
              writeMusicSyncData(store);

              // Also generate synthetic music.xml and local.xml
              const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<musica>
  <interprete>${escapeXml(musicInfo.artista)}</interprete>
  <nome_musica>${escapeXml(musicInfo.titulo)}</nome_musica>
  <titulo>${escapeXml(musicInfo.titulo)}</titulo>
  <artista>${escapeXml(musicInfo.artista)}</artista>
  <duracao>${musicInfo.duracao}</duracao>
  <capa>${escapeXml(musicInfo.capa)}</capa>
  <horario>${escapeXml(musicInfo.horario)}</horario>
  <start_time>${musicInfo.startTime}</start_time>
  <origem>${escapeXml(musicInfo.source)}</origem>
  <dispositivo>${escapeXml(musicInfo.deviceName)}</dispositivo>
</musica>
`;
              writeStaticXml(slug, "music.xml", xmlContent);
              writeStaticXml(slug, "local.xml", xmlContent);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, slug, music: musicInfo }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4c. GET /api/sync-music
        if (req.method === "GET" && url.startsWith("/api/sync-music")) {
          const parsedUrl = new URL(url, "http://localhost");
          const rawSlug = parsedUrl.searchParams.get("slug") || "positivafm";
          const slug = normalizeSlug(rawSlug);
          const userId = parsedUrl.searchParams.get("userId") || slug;
          const store = readMusicSyncData();
          const music = store[slug] || store[userId] || store[rawSlug] || null;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.end(JSON.stringify({ ok: true, music }));
          return;
        }

        // 4d. GET /api/suporte-tickets
        if (req.method === "GET" && url.startsWith("/api/suporte-tickets")) {
          try {
            if (fs.existsSync(suporteTicketsFile)) {
              const data = JSON.parse(fs.readFileSync(suporteTicketsFile, "utf-8"));
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
              res.end(JSON.stringify(data));
              return;
            }
          } catch {}
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([]));
          return;
        }

        // 4e. POST /api/suporte-tickets
        if (req.method === "POST" && url.startsWith("/api/suporte-tickets")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const tickets = Array.isArray(parsed) ? parsed : parsed.tickets || [];
              const dir = path.dirname(suporteTicketsFile);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(suporteTicketsFile, JSON.stringify(tickets, null, 2), "utf-8");
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, count: tickets.length }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4f. POST /api/sync-broadcast & /functions/v1/serve-xml-broadcast
        if (req.method === "POST" && (url.startsWith("/api/sync-broadcast") || url.startsWith("/functions/v1/serve-xml-broadcast"))) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const stationUid = parsed.stationUid || parsed.userId || parsed.user_id || slug;
              const store = readBroadcastSyncData();
              const broadcastData = parsed.data || parsed;
              store[slug] = broadcastData;
              if (stationUid) store[stationUid] = broadcastData;
              writeBroadcastSyncData(store);

              // Immediately regenerate and persist broadcast.xml
              const musicStore = readMusicSyncData();
              const music = musicStore[slug] || musicStore[stationUid] || {};
              const programsDb = readProgramsDb();
              const xml = buildBroadcastXml(slug, broadcastData, music, programsDb);
              writeStaticXml(slug, "broadcast.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: true, slug }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4g. GET /api/sync-broadcast
        if (req.method === "GET" && url.startsWith("/api/sync-broadcast")) {
          const parsedUrl = new URL(url, "http://localhost");
          const rawSlug = parsedUrl.searchParams.get("slug") || "positivafm";
          const slug = normalizeSlug(rawSlug);
          const userId = parsedUrl.searchParams.get("userId") || parsedUrl.searchParams.get("stationUid") || slug;
          const store = readBroadcastSyncData();
          const broadcast = store[slug] || store[userId] || store[rawSlug] || null;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ ok: true, data: broadcast }));
          return;
        }

        // 4h. POST /api/sync-empresa-config
        if (req.method === "POST" && url.startsWith("/api/sync-empresa-config")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const store = readEmpresaSyncData();
              const stationUid = parsed.stationUid || parsed.user_id || parsed.userId;
              const slug = parsed.slug ? normalizeSlug(parsed.slug) : null;
              const configData = parsed.config || parsed.data || parsed;

              if (stationUid) {
                store[stationUid] = { ...(store[stationUid] || {}), ...configData };
              }
              if (slug) {
                store[slug] = { ...(store[slug] || {}), ...configData };
              }
              writeEmpresaSyncData(store);

              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: true, stationUid, slug }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4i. GET /api/sync-empresa-config
        if (req.method === "GET" && url.startsWith("/api/sync-empresa-config")) {
          const parsedUrl = new URL(url, "http://localhost");
          const stationUid = parsedUrl.searchParams.get("stationUid") || parsedUrl.searchParams.get("userId");
          const rawSlug = parsedUrl.searchParams.get("slug");
          const slug = rawSlug ? normalizeSlug(rawSlug) : null;
          const store = readEmpresaSyncData();

          const result = (stationUid && store[stationUid]) || (slug && store[slug]) || (rawSlug && store[rawSlug]) || null;

          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ ok: true, data: result }));
          return;
        }

        // 5. Intercept GET requests for all XML feeds (enquete, quiz, batalha, roteiro, geral, broadcast, musica, tempo, logos)
        function parseXmlRequest(reqUrl: string): { file: string; slug: string; rawSlug: string } | null {
          const [pathname, search] = reqUrl.split("?");
          const searchParams = new URLSearchParams(search || "");
          const querySlug = searchParams.get("slug") || searchParams.get("user_id") || searchParams.get("userId") || "";

          // 1. /functions/v1/serve-xml-<feed>
          const funcMatch = pathname.match(/^\/functions\/v1\/serve-xml-([a-z0-9-]+)/i);
          if (funcMatch) {
            const rawFeed = funcMatch[1].toLowerCase();
            let file = `${rawFeed}.xml`;
            if (rawFeed === "roteiro-estudio") file = "roteiro.xml";
            if (rawFeed === "tempo") file = "tempo.xml";
            const rawSlug = querySlug || "positivafm";
            return { file, rawSlug, slug: normalizeSlug(rawSlug) };
          }

          // 2. /storage/v1/object/public/xml-files/xml-tempo-<uid>.xml
          const tempoMatch = pathname.match(/^\/storage\/v1\/object\/public\/xml-files\/xml-tempo-([^.]+)\.xml$/i);
          if (tempoMatch) {
            const rawSlug = querySlug || tempoMatch[1] || "positivafm";
            return { file: "tempo.xml", rawSlug, slug: normalizeSlug(rawSlug) };
          }

          // 3. /xml/:slug/:file.xml or /:slug/:file.xml
          const slugFileMatch = pathname.match(/^(?:\/xml)?\/([^/]+)\/([a-z0-9_-]+\.xml)$/i);
          if (slugFileMatch) {
            const pathSlug = slugFileMatch[1];
            const file = slugFileMatch[2].toLowerCase();
            if (pathSlug.toLowerCase() !== "xml") {
              return { file, rawSlug: pathSlug, slug: normalizeSlug(pathSlug) };
            }
          }

          // 4. /xml/:file.xml or /:file.xml
          const directMatch = pathname.match(/^(?:\/xml)?\/([a-z0-9_-]+\.xml)$/i);
          if (directMatch) {
            const file = directMatch[1].toLowerCase();
            const rawSlug = querySlug || "positivafm";
            return { file, rawSlug, slug: normalizeSlug(rawSlug) };
          }

          return null;
        }

        if (req.method === "GET") {
          const parsedXml = parseXmlRequest(url);
          if (parsedXml) {
            const { file, slug, rawSlug } = parsedXml;
            const { today, currentTime } = getBrasiliaDateTime();

            // 1. enquete.xml
            if (file === "enquete.xml") {
              const store = readSyncData(enquetesFile);
              const list = store[slug] || store[rawSlug] || store[SLUG_TO_UID[slug]] || [];
              const active = getActiveEnquete(list, today, currentTime);
              const stName = SLUG_STATION_NAMES[slug] || SLUG_STATION_NAMES[rawSlug] || "House Mix Emissora";
              const xml = buildEnqueteXml(active, stName);

              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(xml);
              return;
            }

            // 2. quiz.xml
            if (file === "quiz.xml") {
              const store = readSyncData(quizzesFile);
              const list = store[slug] || store[rawSlug] || store[SLUG_TO_UID[slug]] || [];
              const active = getActiveQuiz(list, today, currentTime);
              const xml = buildQuizXml(active);

              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(xml);
              return;
            }

            // 3. batalha.xml
            if (file === "batalha.xml") {
              const store = readSyncData(batalhasFile);
              const list = store[slug] || store[rawSlug] || store[SLUG_TO_UID[slug]] || [];
              const active = getActiveBatalha(list, today, currentTime);
              const stName = SLUG_STATION_NAMES[slug] || SLUG_STATION_NAMES[rawSlug] || "House Mix Emissora";
              const xml = buildBatalhaXml(active, stName);

              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(xml);
              return;
            }

            // 4. roteiro.xml
            if (file === "roteiro.xml") {
              const rotStore = readSyncData(roteirosFile);
              const rotList = rotStore[slug] || rotStore[rawSlug] || [];
              const isMockRoteiro = (xmlStr: string) =>
                xmlStr.includes("Roteiro Atualizado com Sucesso no XML") ||
                xmlStr.includes("rot_1789729269440");

              if (rotList.length > 0 && rotList[0]?.xml && !isMockRoteiro(rotList[0].xml)) {
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(rotList[0].xml);
                return;
              }

              const rPath = path.join(rootDir, "public", "xml", slug, "roteiro.xml");
              if (fs.existsSync(rPath)) {
                const rXml = fs.readFileSync(rPath, "utf-8");
                if (!isMockRoteiro(rXml)) {
                  res.setHeader("Content-Type", "application/xml; charset=utf-8");
                  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                  res.setHeader("Access-Control-Allow-Origin", "*");
                  res.end(rXml);
                  return;
                }
              }

              const rootRPath = path.join(rootDir, "public", "roteiro.xml");
              if (fs.existsSync(rootRPath)) {
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(fs.readFileSync(rootRPath, "utf-8"));
                return;
              }

              if (rotList.length > 0 && rotList[0]?.xml) {
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(rotList[0].xml);
                return;
              }
            }

            // 5. geral.xml
            if (file === "geral.xml") {
              const enqStore = readSyncData(enquetesFile);
              const enqList = enqStore[slug] || enqStore[rawSlug] || [];
              const activeEnq = getActiveEnquete(enqList, today, currentTime);

              const quizStore = readSyncData(quizzesFile);
              const quizList = quizStore[slug] || quizStore[rawSlug] || [];
              const activeQuiz = getActiveQuiz(quizList, today, currentTime);

              const batStore = readSyncData(batalhasFile);
              const batList = batStore[slug] || batStore[rawSlug] || [];
              const activeBat = getActiveBatalha(batList, today, currentTime);

              const geralPath = path.join(rootDir, "public", "xml", slug, "geral.xml");
              let geralXml = "";
              if (fs.existsSync(geralPath)) {
                geralXml = fs.readFileSync(geralPath, "utf-8");
              } else {
                const rootGeral = path.join(rootDir, "public", "geral.xml");
                if (fs.existsSync(rootGeral)) geralXml = fs.readFileSync(rootGeral, "utf-8");
              }

              if (geralXml) {
                const enqueteBlock = activeEnq
                  ? `<enquete ativa="1">
      <pergunta>${escapeXml(activeEnq.pergunta)}</pergunta>
      <opcao_a>${escapeXml(activeEnq.resposta1)}</opcao_a>
      <votos_a>0</votos_a>
      <opcao_b>${escapeXml(activeEnq.resposta2)}</opcao_b>
      <votos_b>0</votos_b>
      <resposta1>${escapeXml(activeEnq.resposta1)}</resposta1>
      <resposta2>${escapeXml(activeEnq.resposta2)}</resposta2>
      <resposta3>${escapeXml(activeEnq.resposta3 || "")}</resposta3>
      <resposta4>${escapeXml(activeEnq.resposta4 || "")}</resposta4>
    </enquete>`
                  : `<enquete ativa="0"></enquete>`;
                geralXml = geralXml.replace(/<enquete[\s\S]*?<\/enquete>/i, enqueteBlock);

                const corretaNum = Number(activeQuiz?.resposta_correta) || 1;
                const corretaTexto =
                  corretaNum === 1
                    ? activeQuiz?.resposta1
                    : corretaNum === 2
                    ? activeQuiz?.resposta2
                    : corretaNum === 3
                    ? activeQuiz?.resposta3
                    : activeQuiz?.resposta4;

                const quizBlock = activeQuiz
                  ? `<quiz ativo="1">
      <pergunta>${escapeXml(activeQuiz.pergunta)}</pergunta>
      <alternativa_a>${escapeXml(activeQuiz.resposta1)}</alternativa_a>
      <alternativa_b>${escapeXml(activeQuiz.resposta2)}</alternativa_b>
      <alternativa_c>${escapeXml(activeQuiz.resposta3 || "")}</alternativa_c>
      <alternativa_d>${escapeXml(activeQuiz.resposta4 || "")}</alternativa_d>
      <resposta1>${escapeXml(activeQuiz.resposta1)}</resposta1>
      <resposta2>${escapeXml(activeQuiz.resposta2)}</resposta2>
      <resposta3>${escapeXml(activeQuiz.resposta3 || "")}</resposta3>
      <resposta4>${escapeXml(activeQuiz.resposta4 || "")}</resposta4>
      <resposta_correta>${escapeXml(activeQuiz.resposta_correta || 1)}</resposta_correta>
      <resposta_correta_texto>${escapeXml(corretaTexto || "")}</resposta_correta_texto>
      <horario_inicio>${escapeXml(activeQuiz.horario_inicio || "")}</horario_inicio>
      <horario_fim>${escapeXml(activeQuiz.horario_fim || "")}</horario_fim>
      <explicacao>${escapeXml(activeQuiz.explicacao || "")}</explicacao>
      <imagem_resposta>${escapeXml(activeQuiz.imagem_resposta || "")}</imagem_resposta>
    </quiz>`
                  : `<quiz ativo="0"></quiz>`;
                geralXml = geralXml.replace(/<quiz[\s\S]*?<\/quiz>/i, quizBlock);

                const batalhaBlock = activeBat
                  ? `<batalha ativa="1">
      <titulo>Batalha Musical</titulo>
      <musica_a>
        <nome>${escapeXml(activeBat.artista1_musica || "")}</nome>
        <artista>${escapeXml(activeBat.artista1_nome || "")}</artista>
        <votos>0</votos>
        <porcentagem>${escapeXml(activeBat.artista1_porcentagem ?? 0)}%</porcentagem>
        <capa_url>${escapeXml(activeBat.artista1_imagem || "")}</capa_url>
      </musica_a>
      <musica_b>
        <nome>${escapeXml(activeBat.artista2_musica || "")}</nome>
        <artista>${escapeXml(activeBat.artista2_nome || "")}</artista>
        <votos>0</votos>
        <porcentagem>${escapeXml(activeBat.artista2_porcentagem ?? 0)}%</porcentagem>
        <capa_url>${escapeXml(activeBat.artista2_imagem || "")}</capa_url>
      </musica_b>
      <artista1_nome>${escapeXml(activeBat.artista1_nome || "")}</artista1_nome>
      <artista1_musica>${escapeXml(activeBat.artista1_musica || "")}</artista1_musica>
      <artista1_porcentagem>${escapeXml(activeBat.artista1_porcentagem ?? 0)}%</artista1_porcentagem>
      <artista1_imagem>${escapeXml(activeBat.artista1_imagem || "")}</artista1_imagem>
      <artista2_nome>${escapeXml(activeBat.artista2_nome || "")}</artista2_nome>
      <artista2_musica>${escapeXml(activeBat.artista2_musica || "")}</artista2_musica>
      <artista2_porcentagem>${escapeXml(activeBat.artista2_porcentagem ?? 0)}%</artista2_porcentagem>
      <artista2_imagem>${escapeXml(activeBat.artista2_imagem || "")}</artista2_imagem>
      <horario_inicio>${escapeXml(activeBat.horario_inicio || "")}</horario_inicio>
      <horario_fim>${escapeXml(activeBat.horario_fim || "")}</horario_fim>
    </batalha>`
                  : `<batalha ativa="0"></batalha>`;
                geralXml = geralXml.replace(/<batalha[\s\S]*?<\/batalha>/i, batalhaBlock);

                const rotStore = readSyncData(roteirosFile);
                const rotList = rotStore[slug] || rotStore[rawSlug] || [];
                if (rotList.length > 0 && rotList[0]) {
                  const item = rotList[0];
                  const rotBlock = `<roteiro>
      <programa>${escapeXml(item.programa_nome || "")}</programa>
      <estudio>${escapeXml(item.estudio || "")}</estudio>
      <data>${escapeXml(item.data_programa || today)}</data>
      <horario>${escapeXml(item.horario || currentTime)}</horario>
    </roteiro>`;
                  geralXml = geralXml.replace(/<roteiro[\s\S]*?<\/roteiro>/i, rotBlock);
                }

                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(geralXml);
                return;
              }
            }

            // 6. musica.xml / music.xml / local.xml
            if (file === "musica.xml" || file === "music.xml" || file === "local.xml") {
              const store = readMusicSyncData();
              const music = store[slug] || store[rawSlug] || null;
              if (music && music.titulo) {
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
<musica>
  <interprete>${escapeXml(music.artista)}</interprete>
  <nome_musica>${escapeXml(music.titulo)}</nome_musica>
  <titulo>${escapeXml(music.titulo)}</titulo>
  <artista>${escapeXml(music.artista)}</artista>
  <duracao>${music.duracao || 180}</duracao>
  <capa>${escapeXml(music.capa || "")}</capa>
  <horario>${escapeXml(music.horario || "")}</horario>
  <start_time>${music.startTime || Date.now()}</start_time>
  <origem>${escapeXml(music.source || "pasta")}</origem>
  <dispositivo>${escapeXml(music.deviceName || "")}</dispositivo>
</musica>
`;
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(xml);
                return;
              }
              const mPath = path.join(rootDir, "public", "xml", slug, "musica.xml");
              if (fs.existsSync(mPath)) {
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(fs.readFileSync(mPath, "utf-8"));
                return;
              }
            }

            // 6b. broadcast.xml / apenas-xml.xml
            if (file === "broadcast.xml" || file === "apenas-xml.xml") {
              const broadcastStore = readBroadcastSyncData();
              const broadcastOverride =
                broadcastStore[slug] || broadcastStore[rawSlug] || broadcastStore[SLUG_TO_UID[slug]] || {};
              const musicStore = readMusicSyncData();
              const music = musicStore[slug] || musicStore[rawSlug] || musicStore[SLUG_TO_UID[slug]] || {};
              const programsDb = readProgramsDb();
              const xml = buildBroadcastXml(slug, broadcastOverride, music, programsDb);

              writeStaticXml(slug, "broadcast.xml", xml);

              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(xml);
              return;
            }

            // 7. Any other requested XML (tempo.xml, logos.xml, etc.)
            const candidates = [
              path.join(rootDir, "public", "xml", slug, file),
              path.join(rootDir, "public", "xml", rawSlug, file),
              path.join(rootDir, "public", "xml", "positivafm", file),
              path.join(rootDir, "public", "xml", file),
              path.join(rootDir, "public", file),
            ];
            for (const cand of candidates) {
              if (fs.existsSync(cand)) {
                res.setHeader("Content-Type", "application/xml; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(fs.readFileSync(cand, "utf-8"));
                return;
              }
            }
          }
        }

        next();
      });
    },
  };
}

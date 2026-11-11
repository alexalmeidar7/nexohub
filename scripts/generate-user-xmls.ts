import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from "fs";
import { resolve, join } from "path";

const SUPABASE_BASE = "https://qazvgmgdidjhbvcuinpy.supabase.co";

interface StationConfig {
  slug: string;
  aliases: string[];
  name: string;
  uid: string;
  city: string;
  tempDefault: string;
  freqDefault: string;
}

const STATIONS: StationConfig[] = [
  {
    slug: "interativafm",
    aliases: ["interativa"],
    name: "Interativa FM 94.9",
    uid: "9cab6c46-c32a-4c19-94db-773dcfaf7632",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "94.9 FM",
  },
  {
    slug: "positivafm",
    aliases: ["positiva", "p"],
    name: "Positiva FM 99.1",
    uid: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "99.1 FM",
  },
  {
    slug: "transmissao",
    aliases: ["jornal"],
    name: "Jornal FM 96.5",
    uid: "98365ea6-0ebf-496d-83e9-69b38089586d",
    city: "Inhumas - GO",
    tempDefault: "25ºC",
    freqDefault: "96.5 FM",
  },
  {
    slug: "culturafm973",
    aliases: ["cultura"],
    name: "Cultura FM 97.3",
    uid: "b67436c6-ede1-4438-881d-18b9e923adda",
    city: "Santos - SP",
    tempDefault: "24ºC",
    freqDefault: "97.3 FM",
  },
  {
    slug: "alex",
    aliases: [],
    name: "Nexo Brasil Super Admin",
    uid: "a05c5b71-a100-40f9-8be3-6eb7035a057b",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "Rede Nexo",
  },
];

function normTime(time: string, fallback = "00:00"): string {
  if (!time) return fallback;
  const clean = time.trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function escapeXml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getBrasiliaDateTime(): { today: string; currentTime: string } {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
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
    return {
      today: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
      currentTime: `${getPart("hour")}:${getPart("minute")}`,
    };
  } catch {
    const now = new Date();
    return {
      today: now.toISOString().slice(0, 10),
      currentTime: now.toTimeString().slice(0, 5),
    };
  }
}

function isScheduleActive(
  itemDate: string,
  startTime: string,
  endTime: string,
  today: string,
  currentTime: string
): boolean {
  if (!itemDate) return true;
  if (itemDate !== today) return false;
  const start = normTime(startTime, "00:00");
  const end = normTime(endTime, "23:59");
  const curr = normTime(currentTime);
  if (start <= end) {
    return curr >= start && curr <= end;
  }
  return curr >= start || curr <= end;
}

async function fetchRemoteXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const txt = await res.text();
    if (txt.includes("<?xml") || txt.startsWith("<")) {
      return txt;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function generateFallbackRoteiro(st: StationConfig): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<programaExpress>
  <emissora>${st.name}</emissora>
  <id>rot_atual</id>
  <programa>Programação ao Vivo</programa>
  <estudio>Estúdio Principal</estudio>
  <data>${today}</data>
  <horario>10:00</horario>
  <apresentadores>
    <apresentador>
      <nome>Locutor de Plantão</nome>
      <instagram>@locutor</instagram>
    </apresentador>
  </apresentadores>
  <blocos>
    <bloco numero="1">
      <noticia titulo="Abertura do Programa" descricao="Boas-vindas aos ouvintes, alinhamento de pauta e destaques do dia."/>
    </bloco>
    <bloco numero="2">
      <noticia titulo="Giro de Notícias e Música" descricao="Principais notícias da cidade e sucessos musicais da programação."/>
    </bloco>
  </blocos>
</programaExpress>
`;
}

function generateMusicaXml(st: StationConfig, broadcastXml?: string | null): string {
  let musicaNome = "Sucesso da Programação";
  let musicaArtista = st.name;
  let musicaCapa = "https://housemix.nexobrasil.net/default-sponsor-logo.png";
  let curiosidade = "Música em destaque na programação ao vivo.";

  if (broadcastXml) {
    const mNome = broadcastXml.match(/<musica_atual>([^<]+)<\/musica_atual>/i);
    const mCapa = broadcastXml.match(/<musica_capa>([^<]+)<\/musica_capa>/i);
    const mCur = broadcastXml.match(/<curiosidade>([^<]+)<\/curiosidade>/i);
    if (mNome && mNome[1].trim()) {
      const parts = mNome[1].split("-");
      if (parts.length >= 2) {
        musicaArtista = parts[0].trim();
        musicaNome = parts.slice(1).join("-").trim();
      } else {
        musicaNome = mNome[1].trim();
      }
    }
    if (mCapa && mCapa[1].trim()) musicaCapa = mCapa[1].trim();
    if (mCur && mCur[1].trim()) curiosidade = mCur[1].trim();
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <emissora>${st.name}</emissora>
    <musica_atual>${musicaArtista} - ${musicaNome}</musica_atual>
    <musica_nome>${musicaNome}</musica_nome>
    <musica_artista>${musicaArtista}</musica_artista>
    <musica_capa>${musicaCapa}</musica_capa>
    <curiosidade>${curiosidade}</curiosidade>
    <ano>2026</ano>
    <atualizado_em>${new Date().toISOString()}</atualizado_em>
  </dados>
</items>
`;
}

function generateEmptyLogosXml(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<logos_patrocinadores>
  <emissora>${escapeXml(st.name)}</emissora>
  <programa id="">
    <nome></nome>
  </programa>
</logos_patrocinadores>
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
  madruga: { nome: "Automático", foto: "/locutores/sem-loc.png", instagram: "@positivafm" },

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
  inson: { nome: "Automático", foto: "/locutores/sem-loc.png", instagram: "@interativafm" },

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
  return { nome: "Locutor no Ar", foto: "/locutores/sem-loc.png", instagram: "@radio" };
}

function timeToSeconds(value: string | null | undefined): number {
  if (!value) return -1;
  const [h = "0", m = "0", s = "0"] = String(value).split(":");
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Number.isFinite(total) ? total : -1;
}

function getBrasiliaFullDateTime(): { today: string; currentTime: string; dayName: string; nowSeconds: number } {
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

function generateFallbackBroadcast(st: StationConfig): string {
  const stationKeyMap: Record<string, string> = {
    interativafm: "INTERATIVA FM",
    positivafm: "POSITIVA FM",
    culturafm973: "CULTURA FM",
    transmissao: "JORNAL FM",
    alex: "POSITIVA FM",
    default: "INTERATIVA FM",
  };
  const stationLogoMap: Record<string, string> = {
    interativafm: "/logos/interativa.png",
    positivafm: "/logos/positiva.png",
    culturafm973: "/logos/cultura.png",
    transmissao: "/logos/jornal.png",
    alex: "/logos/positiva.png",
    default: "/logos/interativa.png",
  };
  const stationWhatsappMap: Record<string, string> = {
    interativafm: "https://wa.me/5562999719490",
    positivafm: "https://wa.me/556299999991",
    culturafm973: "https://wa.me/5513997009730",
    transmissao: "https://wa.me/556299999999",
    alex: "https://housemix.nexobrasil.net",
    default: "https://wa.me/5562999719490",
  };

  const stKey = stationKeyMap[st.slug] || "POSITIVA FM";
  const stLogo = stationLogoMap[st.slug] || "/logos/positiva.png";
  const stWhatsapp = stationWhatsappMap[st.slug] || "https://housemix.nexobrasil.net";

  let programsDb: Record<string, any[]> = {};
  try {
    const pPath = resolve("src/data/station_programs_db.json");
    if (existsSync(pPath)) {
      programsDb = JSON.parse(readFileSync(pPath, "utf-8"));
    }
  } catch {}

  let broadcastSyncData: Record<string, any> = {};
  try {
    const bPath = resolve("src/data/xml_broadcast_sync.json");
    if (existsSync(bPath)) {
      broadcastSyncData = JSON.parse(readFileSync(bPath, "utf-8"));
    }
  } catch {}

  const override = broadcastSyncData[st.slug] || broadcastSyncData[st.uid] || {};

  const { today, currentTime, dayName, nowSeconds } = getBrasiliaFullDateTime();
  const progs = programsDb[stKey] || [];
  let curProg: any = null;
  let nextProg: any = null;

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

  const curPres = resolveSafePresenter(curProg?.nome, stKey);
  const nextPres = resolveSafePresenter(nextProg?.nome, stKey);

  const locutorNome = override.locutor_override || curPres.nome;
  const locutorFoto = curPres.foto;
  const locutorSocial = curPres.instagram;

  const progNome = curProg?.nome || `Programação ${st.name}`;
  const progLogo =
    stKey === "POSITIVA FM" && curProg
      ? `/selos/${curProg.nome?.toLowerCase().includes("modao") ? "modao.png" : "domingao.png"}`
      : "";

  const ticker = override.ticker || `Acompanhe a melhor programação em ${st.freqDefault}`;
  const titulo = override.assunto || `No Ar na ${st.name}`;

  const aSeguirNome = nextProg?.nome || "Próximo Programa";
  const aSeguirHorario = nextProg ? normTime(nextProg.horario_inicio) : "00:00";
  const aSeguirLocutor = nextPres.nome;
  const aSeguirFoto = nextPres.foto;
  const aSeguirLogo = stKey === "POSITIVA FM" ? "/selos/madrugada.png" : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <empresa_logo>${escapeXml(stLogo)}</empresa_logo>
    <programa_nome>${escapeXml(progNome)}</programa_nome>
    <programa_logo>${escapeXml(progLogo)}</programa_logo>
    <programa_thumb></programa_thumb>
    <locutor_nome>${escapeXml(locutorNome)}</locutor_nome>
    <locutor_foto>${escapeXml(locutorFoto)}</locutor_foto>
    <locutor_social>${escapeXml(locutorSocial)}</locutor_social>
    <rede_social_atual>Instagram</rede_social_atual>
    <rede_social_icone>instagram</rede_social_icone>
    <logo_patrocinador></logo_patrocinador>
    <titulo>${escapeXml(titulo)}</titulo>
    <fundo_assunto>${escapeXml(override.assuntoBgUrl || "")}</fundo_assunto>
    <qrcode_link>${escapeXml(stWhatsapp)}</qrcode_link>
    <ticker>${escapeXml(ticker)}</ticker>
    <insert_live></insert_live>
    <curiosidade>Transmitindo com qualidade digital direto dos estúdios centrais.</curiosidade>
    <musica_atual>Música em Reprodução</musica_atual>
    <musica_capa></musica_capa>
    <deezer_artist_img></deezer_artist_img>
    <banner_l></banner_l>
    <temperatura>${st.tempDefault}</temperatura>
    <ico_temperatura>sun</ico_temperatura>
    <infos_canto>
      <titulo>${escapeXml(st.name)}</titulo>
      <descricao>${escapeXml(st.city)}</descricao>
      <ico_categoria>radio</ico_categoria>
      <temp_atual>${st.tempDefault}</temp_atual>
      <ico_temp_atual>sun</ico_temp_atual>
    </infos_canto>
    <a_seguir>
      <ativo>1</ativo>
      <programa_nome>${escapeXml(aSeguirNome)}</programa_nome>
      <nome_programa>${escapeXml(aSeguirNome)}</nome_programa>
      <programa_logo>${escapeXml(aSeguirLogo)}</programa_logo>
      <locutor_nome>${escapeXml(aSeguirLocutor)}</locutor_nome>
      <locutor_foto>${escapeXml(aSeguirFoto)}</locutor_foto>
      <horario>${escapeXml(aSeguirHorario)}</horario>
      <texto>Fique conectado!</texto>
      <intervalo_atualizacao>60</intervalo_atualizacao>
      <atualizado_em>${new Date().toISOString()}</atualizado_em>
    </a_seguir>
  </dados>
</items>
`;
}

function generateFallbackBatalha(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${st.name}</emissora>
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

function generateFallbackEnquete(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete ativa="0">
    <emissora>${escapeXml(st.name)}</emissora>
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

function generateFallbackQuiz(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <emissora>${st.name}</emissora>
    <pergunta>Qual o maior sucesso musical deste ano?</pergunta>
    <resposta1>Alternativa A</resposta1>
    <resposta2>Alternativa B</resposta2>
    <resposta3>Alternativa C</resposta3>
    <resposta4>Alternativa D</resposta4>
    <resposta_correta>A</resposta_correta>
    <resposta_correta_texto>Alternativa A</resposta_correta_texto>
    <horario_inicio>00:00</horario_inicio>
    <horario_fim>23:59</horario_fim>
  </dados>
</items>
`;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  const inner = m[1].trim();
  return inner.replace(/<[^>]+>/g, "").trim();
}

function generateCombinedGeralXml(
  st: StationConfig,
  tempoXml: string,
  broadcastXml: string,
  roteiroXml: string,
  logosXml: string,
  batalhaXml: string,
  enqueteXml: string,
  quizXml: string,
  remoteGeral?: string | null
): string {
  if (remoteGeral && remoteGeral.includes("<geral") && remoteGeral.includes("</geral>")) {
    return remoteGeral;
  }

  const now = new Date().toISOString();
  const musicaAtual = extractTag(broadcastXml, "musica_atual") || "Programação Musical";
  const musicaCapa = extractTag(broadcastXml, "musica_capa") || "";
  const curiosidade = extractTag(broadcastXml, "curiosidade") || "";
  const programaNome = extractTag(broadcastXml, "programa_nome") || `Programação ${st.name}`;
  const locutorNome = extractTag(broadcastXml, "locutor_nome") || "Locutor no Ar";
  const locutorFoto = extractTag(broadcastXml, "locutor_foto") || "";
  const locutorSocial = extractTag(broadcastXml, "locutor_social") || `@${st.slug}`;
  const aSeguirNome = extractTag(broadcastXml, "programa_nome") || extractTag(broadcastXml, "nome_programa") || "";
  const aSeguirHorario = extractTag(broadcastXml, "horario") || "";
  const aSeguirLocutor = extractTag(broadcastXml, "locutor_nome") || "";
  const aSeguirFoto = extractTag(broadcastXml, "locutor_foto") || "";

  const tempAtual = extractTag(tempoXml, "temperatura") || extractTag(broadcastXml, "temperatura") || st.tempDefault;
  const tempDesc = extractTag(tempoXml, "descricao") || extractTag(tempoXml, "descricao_tempo");
  const tempMin = extractTag(tempoXml, "minima");
  const tempMax = extractTag(tempoXml, "maxima");
  const tempUmidade = extractTag(tempoXml, "umidade") || extractTag(tempoXml, "humidade");
  const tempVento = extractTag(tempoXml, "vento");
  const tempIcone = extractTag(tempoXml, "icone_url") || extractTag(tempoXml, "url_imagem_icone") || "";

  const roteiroProg = extractTag(roteiroXml, "programa") || programaNome;
  const roteiroEstudio = extractTag(roteiroXml, "estudio") || "Estúdio FM";
  const roteiroData = extractTag(roteiroXml, "data") || now.slice(0, 10);
  const roteiroHorario = extractTag(roteiroXml, "horario") || extractTag(roteiroXml, "hora") || "00:00";

  return `<?xml version="1.0" encoding="UTF-8"?>
<geral versao="1.0">
  <gerado_em>${now}</gerado_em>

  <!-- DADOS DA EMISSORA -->
  <estacao>
    <nome>${st.name}</nome>
    <slug>${st.slug}</slug>
    <cidade>${st.city}</cidade>
    <frequencia>${st.freqDefault}</frequencia>
    <uid>${st.uid}</uid>
  </estacao>

  <!-- NO AR (Música, Programa e Apresentador) -->
  <no_ar>
    <musica_atual>
      <titulo>${musicaAtual}</titulo>
      <capa_url>${musicaCapa}</capa_url>
      <curiosidade>${curiosidade}</curiosidade>
      <texto_completo>${musicaAtual}</texto_completo>
    </musica_atual>

    <programa_atual>
      <nome>${programaNome}</nome>
      <estudio>${roteiroEstudio}</estudio>
    </programa_atual>

    <apresentador_atual>
      <nome>${locutorNome}</nome>
      <foto_url>${locutorFoto}</foto_url>
      <social>${locutorSocial}</social>
    </apresentador_atual>

    <a_seguir>
      <ativo>1</ativo>
      <programa_nome>${aSeguirNome || "Próxima Atração"}</programa_nome>
      <horario>${aSeguirHorario}</horario>
      <locutor_nome>${aSeguirLocutor}</locutor_nome>
      <locutor_foto>${aSeguirFoto}</locutor_foto>
    </a_seguir>
  </no_ar>

  <!-- PREVISÃO DO TEMPO -->
  <previsao_tempo>
    <cidade>${st.city}</cidade>
    <atual>
      <temperatura>${tempAtual}</temperatura>
      <descricao>${tempDesc}</descricao>
      <minima>${tempMin}</minima>
      <maxima>${tempMax}</maxima>
      <umidade>${tempUmidade}</umidade>
      <vento>${tempVento}</vento>
      <icone_url>${tempIcone}</icone_url>
    </atual>
  </previsao_tempo>

  <!-- ROTEIRO E ALINHAMENTO DO ESTÚDIO -->
  <roteiro>
    <programa>${roteiroProg}</programa>
    <estudio>${roteiroEstudio}</estudio>
    <data>${roteiroData}</data>
    <horario>${roteiroHorario}</horario>
  </roteiro>

  <!-- INTERATIVIDADE (Batalha, Enquete, Quiz) -->
  <interatividade>
    <batalha ativa="${extractTag(batalhaXml, "artista1_nome") ? "1" : "0"}">
      <titulo>${extractTag(batalhaXml, "titulo") || "Batalha Musical"}</titulo>
      <musica_a>
        <nome>${extractTag(batalhaXml, "artista1_musica") || ""}</nome>
        <artista>${extractTag(batalhaXml, "artista1_nome") || ""}</artista>
        <porcentagem>${extractTag(batalhaXml, "artista1_porcentagem") || "0%"}</porcentagem>
      </musica_a>
      <musica_b>
        <nome>${extractTag(batalhaXml, "artista2_musica") || ""}</nome>
        <artista>${extractTag(batalhaXml, "artista2_nome") || ""}</artista>
        <porcentagem>${extractTag(batalhaXml, "artista2_porcentagem") || "0%"}</porcentagem>
      </musica_b>
      <artista1_nome>${extractTag(batalhaXml, "artista1_nome") || ""}</artista1_nome>
      <artista1_musica>${extractTag(batalhaXml, "artista1_musica") || ""}</artista1_musica>
      <artista1_porcentagem>${extractTag(batalhaXml, "artista1_porcentagem") || "0%"}</artista1_porcentagem>
      <artista1_imagem>${extractTag(batalhaXml, "artista1_imagem") || ""}</artista1_imagem>
      <artista2_nome>${extractTag(batalhaXml, "artista2_nome") || ""}</artista2_nome>
      <artista2_musica>${extractTag(batalhaXml, "artista2_musica") || ""}</artista2_musica>
      <artista2_porcentagem>${extractTag(batalhaXml, "artista2_porcentagem") || "0%"}</artista2_porcentagem>
      <artista2_imagem>${extractTag(batalhaXml, "artista2_imagem") || ""}</artista2_imagem>
      <horario_inicio>${extractTag(batalhaXml, "horario_inicio") || ""}</horario_inicio>
      <horario_fim>${extractTag(batalhaXml, "horario_fim") || ""}</horario_fim>
    </batalha>

    <enquete ativa="${enqueteXml.includes("<pergunta>") && extractTag(enqueteXml, "pergunta") ? "1" : "0"}">
      <pergunta>${extractTag(enqueteXml, "pergunta")}</pergunta>
      <opcao_a>${extractTag(enqueteXml, "resposta1") || extractTag(enqueteXml, "opcao_a") || extractTag(enqueteXml, "opcao1_texto")}</opcao_a>
      <opcao_b>${extractTag(enqueteXml, "resposta2") || extractTag(enqueteXml, "opcao_b") || extractTag(enqueteXml, "opcao2_texto")}</opcao_b>
      <opcao_c>${extractTag(enqueteXml, "resposta3") || extractTag(enqueteXml, "opcao_c") || extractTag(enqueteXml, "opcao3_texto")}</opcao_c>
      <opcao_d>${extractTag(enqueteXml, "resposta4") || extractTag(enqueteXml, "opcao_d") || extractTag(enqueteXml, "opcao4_texto")}</opcao_d>
      <resposta1>${extractTag(enqueteXml, "resposta1")}</resposta1>
      <resposta2>${extractTag(enqueteXml, "resposta2")}</resposta2>
      <resposta3>${extractTag(enqueteXml, "resposta3")}</resposta3>
      <resposta4>${extractTag(enqueteXml, "resposta4")}</resposta4>
      <resposta_correta>${extractTag(enqueteXml, "resposta_correta") || "1"}</resposta_correta>
      <horario_inicio>${extractTag(enqueteXml, "horario_inicio")}</horario_inicio>
      <horario_fim>${extractTag(enqueteXml, "horario_fim")}</horario_fim>
    </enquete>

    <quiz ativa="${quizXml.includes("<pergunta>") && extractTag(quizXml, "pergunta") ? "1" : "0"}">
      <pergunta>${extractTag(quizXml, "pergunta")}</pergunta>
      <alternativa_a>${extractTag(quizXml, "resposta1") || extractTag(quizXml, "alternativa_a")}</alternativa_a>
      <alternativa_b>${extractTag(quizXml, "resposta2") || extractTag(quizXml, "alternativa_b")}</alternativa_b>
      <alternativa_c>${extractTag(quizXml, "resposta3") || extractTag(quizXml, "alternativa_c")}</alternativa_c>
      <alternativa_d>${extractTag(quizXml, "resposta4") || extractTag(quizXml, "alternativa_d")}</alternativa_d>
      <resposta1>${extractTag(quizXml, "resposta1")}</resposta1>
      <resposta2>${extractTag(quizXml, "resposta2")}</resposta2>
      <resposta3>${extractTag(quizXml, "resposta3")}</resposta3>
      <resposta4>${extractTag(quizXml, "resposta4")}</resposta4>
      <resposta_correta>${extractTag(quizXml, "resposta_correta") || "1"}</resposta_correta>
      <resposta_correta_texto>${extractTag(quizXml, "resposta_correta_texto")}</resposta_correta_texto>
      <horario_inicio>${extractTag(quizXml, "horario_inicio")}</horario_inicio>
      <horario_fim>${extractTag(quizXml, "horario_fim")}</horario_fim>
      <explicacao>${extractTag(quizXml, "explicacao")}</explicacao>
      <imagem_resposta>${extractTag(quizXml, "imagem_resposta")}</imagem_resposta>
    </quiz>
  </interatividade>

  <!-- PATROCINADORES / LOGOMARCAS -->
  <patrocinadores>
    <patrocinador>
      <nome>Patrocinador Oficial</nome>
      <logo_url>https://housemix.nexobrasil.net/default-sponsor-logo.png</logo_url>
    </patrocinador>
  </patrocinadores>
</geral>
`;
}

export async function generateAllUserXmls() {
  const baseXmlDir = resolve("public/xml");
  if (!existsSync(baseXmlDir)) {
    mkdirSync(baseXmlDir, { recursive: true });
  }

  let totalFiles = 0;

  for (const st of STATIONS) {
    console.log(`Processing station: ${st.name} (${st.slug}, uid: ${st.uid})...`);

    // 1. Fetch live XMLs from Supabase
    const [tempoRemote, roteiroRemote, broadcastRemote, logosRemote, batalhaRemote, enqueteRemote, quizRemote, geralRemote] =
      await Promise.all([
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-tempo?user_id=${encodeURIComponent(st.uid)}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-roteiro-estudio?user_id=${st.uid}&estudio=Estudio%20FM`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-broadcast?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-logos?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-batalha?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-enquete?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-quiz?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-geral?user_id=${st.uid}&slug=${st.slug}`),
      ]);

    // Read existing local file if valid to never overwrite user tables with empty stubs
    const localStationDir = join(baseXmlDir, st.slug);
    const readExistingIfValid = (filename: string): string | null => {
      const p = join(localStationDir, filename);
      if (existsSync(p)) {
        try {
          const c = readFileSync(p, "utf-8").trim();
          if (c.length > 150 && !c.includes("Patrocinador Oficial") && !c.includes("Locutor de Plantão")) {
            return c;
          }
        } catch {}
      }
      return null;
    };

    // Sem previsão remota, preserva um XML válido sem inventar temperatura,
    // condição climática ou datas. O consumidor pode identificar indisponibilidade.
    const tempoContent = tempoRemote ||
      `<?xml version="1.0" encoding="UTF-8"?>\n<previsao><disponivel>0</disponivel><cidade>${escapeXml(st.city)}</cidade></previsao>`;
    let roteiroContent = roteiroRemote || readExistingIfValid("roteiro.xml");
    if (!roteiroContent) {
      try {
        const rotSyncPath = resolve("src/data/xml_roteiros_sync.json");
        if (existsSync(rotSyncPath)) {
          const syncData = JSON.parse(readFileSync(rotSyncPath, "utf-8"));
          const list = syncData[st.slug] || syncData[st.uid] || [];
          if (list.length > 0 && list[0]?.xml && !list[0].xml.includes("Roteiro Atualizado com Sucesso no XML")) {
            roteiroContent = list[0].xml;
          }
        }
      } catch {}
    }
    if (!roteiroContent) {
      roteiroContent = generateFallbackRoteiro(st);
    }
    const isMockBroadcast = (xmlStr: string) =>
      !xmlStr ||
      xmlStr.includes("Locutor de Plantão") ||
      xmlStr.includes("Locutor no Ar") ||
      xmlStr.includes("https://housemix.nexobrasil.net/default-sponsor-logo.png");

    let broadcastContent = "";
    if (broadcastRemote && !isMockBroadcast(broadcastRemote)) {
      broadcastContent = broadcastRemote;
    }
    if (!broadcastContent) {
      const existing = readExistingIfValid("broadcast.xml");
      if (existing && !isMockBroadcast(existing)) {
        broadcastContent = existing;
      }
    }
    if (!broadcastContent) {
      broadcastContent = generateFallbackBroadcast(st);
    }
    // LOGOS: the XML must always reflect the current database state.
    // Never restore an older local logos.xml when the remote source is unavailable:
    // doing so can resurrect sponsors that were already deleted/disabled.
    const logosContent = logosRemote || generateEmptyLogosXml(st);
    const musicaContent = generateMusicaXml(st, broadcastRemote);

    // If batalha, enquete, quiz from Supabase have empty content tags or dummy mocks, check local sync store
    let batalhaContent = (batalhaRemote && extractTag(batalhaRemote, "artista1_nome").length > 0 && extractTag(batalhaRemote, "artista1_nome") !== "Artista 1") ? batalhaRemote : "";
    if (batalhaContent && !batalhaContent.includes("<emissora>")) {
      batalhaContent = batalhaContent.replace(/<batalha>/i, `<batalha>\n    <emissora>${st.name}</emissora>`);
    }
    let enqueteContent = (enqueteRemote && extractTag(enqueteRemote, "pergunta").length > 0 && !extractTag(enqueteRemote, "pergunta").includes("Qual música você quer ouvir")) ? enqueteRemote : "";
    let quizContent = (quizRemote && extractTag(quizRemote, "pergunta").length > 0 && !extractTag(quizRemote, "pergunta").includes("Qual o maior sucesso")) ? quizRemote : "";

    try {
      if (!enqueteContent) {
        const enqSyncPath = resolve("src/data/xml_enquetes_sync.json");
        if (existsSync(enqSyncPath)) {
          const syncData = JSON.parse(readFileSync(enqSyncPath, "utf-8"));
          const list = syncData[st.slug] || syncData[st.uid] || [];
          const { today, currentTime } = getBrasiliaDateTime();
          let active = list.find((e: any) =>
            isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, today, currentTime)
          );
          if (!active) {
            active = list.find((e: any) => String(e.data_enquete || "").slice(0, 10) === today && e.horario_fim !== "00:00");
          }
          if (!active && list.length > 0) {
            active = list[0];
          }
          if (active && active.pergunta) {
            enqueteContent = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete ativa="1">
    <emissora>${escapeXml(st.name)}</emissora>
    <pergunta>${escapeXml(active.pergunta)}</pergunta>
    <opcao_a>${escapeXml(active.resposta1 || "")}</opcao_a>
    <opcao_b>${escapeXml(active.resposta2 || "")}</opcao_b>
    <opcao_c>${escapeXml(active.resposta3 || "")}</opcao_c>
    <opcao_d>${escapeXml(active.resposta4 || "")}</opcao_d>
    <votos_a>0</votos_a>
    <votos_b>0</votos_b>
    <votos_c>0</votos_c>
    <votos_d>0</votos_d>
    <resposta1>${escapeXml(active.resposta1 || "")}</resposta1>
    <resposta2>${escapeXml(active.resposta2 || "")}</resposta2>
    <resposta3>${escapeXml(active.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(active.resposta4 || "")}</resposta4>
    <resposta_correta>${escapeXml(active.resposta_correta || 1)}</resposta_correta>
    <horario_inicio>${escapeXml(active.horario_inicio || "00:00")}</horario_inicio>
    <horario_fim>${escapeXml(active.horario_fim || "23:59")}</horario_fim>
  </enquete>
</items>`;
          }
        }
      }
    } catch {}

    try {
      if (!quizContent) {
        const qzSyncPath = resolve("src/data/xml_quizzes_sync.json");
        if (existsSync(qzSyncPath)) {
          const syncData = JSON.parse(readFileSync(qzSyncPath, "utf-8"));
          const list = syncData[st.slug] || syncData[st.uid] || [];
          const { today, currentTime } = getBrasiliaDateTime();
          const active = list.find((q: any) =>
            isScheduleActive(q.data_quiz, q.horario_inicio, q.horario_fim, today, currentTime)
          );
          if (active && active.pergunta) {
            quizContent = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <emissora>${st.name}</emissora>
    <pergunta>${active.pergunta}</pergunta>
    <resposta1>${active.resposta1 || ""}</resposta1>
    <resposta2>${active.resposta2 || ""}</resposta2>
    <resposta3>${active.resposta3 || ""}</resposta3>
    <resposta4>${active.resposta4 || ""}</resposta4>
    <resposta_correta>${active.resposta_correta || 1}</resposta_correta>
    <horario_inicio>${active.horario_inicio || "00:00"}</horario_inicio>
    <horario_fim>${active.horario_fim || "23:59"}</horario_fim>
    <explicacao>${active.explicacao || ""}</explicacao>
    <imagem_resposta>${active.imagem_resposta || ""}</imagem_resposta>
  </dados>
</items>`;
          }
        }
      }
    } catch {}

    batalhaContent = batalhaContent || generateFallbackBatalha(st);
    enqueteContent = enqueteContent || generateFallbackEnquete(st);
    quizContent = quizContent || generateFallbackQuiz(st);

    const geralContent = generateCombinedGeralXml(
      st,
      tempoContent,
      broadcastContent,
      roteiroContent,
      logosContent,
      batalhaContent,
      enqueteContent,
      quizContent,
      geralRemote
    );

    const files: Record<string, string> = {
      "geral.xml": geralContent,
      "tempo.xml": tempoContent,
      "roteiro.xml": roteiroContent,
      "musica.xml": musicaContent,
      "musica-agora.xml": musicaContent,
      "logos.xml": logosContent,
      "broadcast.xml": broadcastContent,
      "apenas-xml.xml": broadcastContent,
      "batalha.xml": batalhaContent,
      "enquete.xml": enqueteContent,
      "quiz.xml": quizContent,
    };

    // Target slugs = primary slug + aliases
    const targetSlugs = [st.slug, ...st.aliases];

    for (const slug of targetSlugs) {
      const userDir = join(baseXmlDir, slug);
      if (!existsSync(userDir)) {
        mkdirSync(userDir, { recursive: true });
      }

      for (const [filename, content] of Object.entries(files)) {
        const targetPath = join(userDir, filename);
        if (existsSync(targetPath)) {
          try {
            const existing = readFileSync(targetPath, "utf-8");
            const isExistingSubstantial = existing.trim().length > 200;
            const isNewFallback =
              content.includes("Patrocinador Oficial") ||
              content.includes("Locutor de Plantão");

            if (isExistingSubstantial && isNewFallback) {
              if (filename === "geral.xml") {
                let mergedGeral = existing;
                let changed = false;
                if (enqueteContent && enqueteContent.includes('ativa="1"')) {
                  const enqMatch = enqueteContent.match(/<enquete[\s\S]*?<\/enquete>/i);
                  if (enqMatch && existing.includes("<enquete")) {
                    mergedGeral = mergedGeral.replace(/<enquete[\s\S]*?<\/enquete>/i, enqMatch[0]);
                    changed = true;
                  }
                }
                if (batalhaContent && (batalhaContent.includes("<artista1_nome>") && !batalhaContent.includes("<artista1_nome></artista1_nome>") && !batalhaContent.includes("<artista1_nome/>"))) {
                  const a1Nome = batalhaContent.match(/<artista1_nome>(.*?)<\/artista1_nome>/)?.[1] || "";
                  const a1Musica = batalhaContent.match(/<artista1_musica>(.*?)<\/artista1_musica>/)?.[1] || "";
                  const a1Porc = batalhaContent.match(/<artista1_porcentagem>(.*?)<\/artista1_porcentagem>/)?.[1] || "0%";
                  const a1Img = batalhaContent.match(/<artista1_imagem>(.*?)<\/artista1_imagem>/)?.[1] || "";
                  const a2Nome = batalhaContent.match(/<artista2_nome>(.*?)<\/artista2_nome>/)?.[1] || "";
                  const a2Musica = batalhaContent.match(/<artista2_musica>(.*?)<\/artista2_musica>/)?.[1] || "";
                  const a2Porc = batalhaContent.match(/<artista2_porcentagem>(.*?)<\/artista2_porcentagem>/)?.[1] || "0%";
                  const a2Img = batalhaContent.match(/<artista2_imagem>(.*?)<\/artista2_imagem>/)?.[1] || "";
                  const hIni = batalhaContent.match(/<horario_inicio>(.*?)<\/horario_inicio>/)?.[1] || "00:00";
                  const hFim = batalhaContent.match(/<horario_fim>(.*?)<\/horario_fim>/)?.[1] || "23:59";

                  const batalhaBlock = `<batalha ativa="1">
      <titulo>Batalha Musical</titulo>
      <musica_a>
        <nome>${a1Musica}</nome>
        <artista>${a1Nome}</artista>
        <porcentagem>${a1Porc}</porcentagem>
      </musica_a>
      <musica_b>
        <nome>${a2Musica}</nome>
        <artista>${a2Nome}</artista>
        <porcentagem>${a2Porc}</porcentagem>
      </musica_b>
      <artista1_nome>${a1Nome}</artista1_nome>
      <artista1_musica>${a1Musica}</artista1_musica>
      <artista1_porcentagem>${a1Porc}</artista1_porcentagem>
      <artista1_imagem>${a1Img}</artista1_imagem>
      <artista2_nome>${a2Nome}</artista2_nome>
      <artista2_musica>${a2Musica}</artista2_musica>
      <artista2_porcentagem>${a2Porc}</artista2_porcentagem>
      <artista2_imagem>${a2Img}</artista2_imagem>
      <horario_inicio>${hIni}</horario_inicio>
      <horario_fim>${hFim}</horario_fim>
    </batalha>`;
                  if (existing.includes("<batalha")) {
                    mergedGeral = mergedGeral.replace(/<batalha[\s\S]*?<\/batalha>/i, batalhaBlock);
                    changed = true;
                  }
                }
                if (changed) {
                  writeFileSync(targetPath, mergedGeral.trim() + "\n", "utf-8");
                  totalFiles++;
                  console.log(`[SYNC] Updated active <enquete>/<batalha> block inside preserved ${slug}/geral.xml`);
                  continue;
                }
              }
              console.log(`[PROTECTED] Preserved existing user data for ${slug}/${filename}, skipping fallback overwrite.`);
              continue;
            }
          } catch {}
        }
        writeFileSync(targetPath, content.trim() + "\n", "utf-8");
        totalFiles++;
      }
    }
  }

  // Also synchronize default station files (positivafm) to root public/xml/* and public/*
  const defaultUserDir = join(baseXmlDir, "positivafm");
  if (existsSync(defaultUserDir)) {
    const rootFiles = ["enquete.xml", "geral.xml", "batalha.xml", "quiz.xml", "roteiro.xml", "broadcast.xml", "tempo.xml", "logos.xml"];
    for (const rf of rootFiles) {
      const src = join(defaultUserDir, rf);
      if (existsSync(src)) {
        try {
          copyFileSync(src, join(baseXmlDir, rf));
          copyFileSync(src, resolve("public", rf));
        } catch {}
      }
    }

    // Generate physical static files in public/functions/v1/ for Supabase URL compatibility
    const functionsDir = resolve("public", "functions", "v1");
    if (!existsSync(functionsDir)) mkdirSync(functionsDir, { recursive: true });

    const functionMap: Record<string, string> = {
      "serve-xml-batalha": "batalha.xml",
      "serve-xml-enquete": "enquete.xml",
      "serve-xml-quiz": "quiz.xml",
      "serve-xml-geral": "geral.xml",
      "serve-xml-tempo": "tempo.xml",
      "serve-xml-roteiro-estudio": "roteiro.xml",
      "serve-xml-broadcast": "broadcast.xml",
      "serve-xml-logos": "logos.xml",
    };

    for (const [funcName, xmlFile] of Object.entries(functionMap)) {
      const src = join(defaultUserDir, xmlFile);
      if (existsSync(src)) {
        try {
          copyFileSync(src, join(functionsDir, funcName));
          copyFileSync(src, join(functionsDir, `${funcName}.xml`));
        } catch {}
      }
    }

    // Generate physical static files in public/storage/v1/object/public/xml-files/ for weather XML compatibility
    const storageDir = resolve("public", "storage", "v1", "object", "public", "xml-files");
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });

    const tempoSrc = join(defaultUserDir, "tempo.xml");
    if (existsSync(tempoSrc)) {
      const uids = [
        "452ebd1e-61a0-42dd-bf80-231a3f426c83",
        "9cab6c46-c32a-4c19-94db-773dcfaf7632",
        "98365ea6-0ebf-496d-83e9-69b38089586d",
        "b67436c6-ede1-4438-881d-18b9e923adda",
        "a05c5b71-a100-40f9-8be3-6eb7035a057b",
      ];
      for (const uid of uids) {
        try {
          copyFileSync(tempoSrc, join(storageDir, `xml-tempo-${uid}.xml`));
        } catch {}
      }
    }
  }

  console.log(`Successfully generated and synced ${totalFiles} XML files in public/xml/ and public/functions/v1/`);
}

generateAllUserXmls().catch((err) => {
  console.error("Error generating XMLs:", err);
});

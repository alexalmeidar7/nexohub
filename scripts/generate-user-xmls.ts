import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, join } from "path";

const SUPABASE_BASE = "https://zzjfzxxvxbspbdkodoix.supabase.co";

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
    uid: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "94.9 FM",
  },
  {
    slug: "positivafm",
    aliases: ["positiva", "p"],
    name: "Positiva FM 99.1",
    uid: "d17e65af-e407-466f-9b60-b55c43399513",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "99.1 FM",
  },
  {
    slug: "transmissao",
    aliases: ["jornal"],
    name: "Jornal FM 96.5",
    uid: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
    city: "Inhumas - GO",
    tempDefault: "25ºC",
    freqDefault: "96.5 FM",
  },
  {
    slug: "culturafm973",
    aliases: ["cultura"],
    name: "Cultura FM 97.3",
    uid: "66337743-4e4f-4950-b58f-750b0c76861e",
    city: "Santos - SP",
    tempDefault: "24ºC",
    freqDefault: "97.3 FM",
  },
  {
    slug: "alex",
    aliases: [],
    name: "Nexo Brasil Super Admin",
    uid: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "Rede Nexo",
  },
  {
    slug: "default",
    aliases: [],
    name: "House Mix Broadcast",
    uid: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
    city: "Goiânia - GO",
    tempDefault: "26ºC",
    freqDefault: "House Mix",
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

function generateFallbackTempo(st: StationConfig): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<previsao>
  <emissora>${st.name}</emissora>
  <cidade>${st.city}</cidade>
  <atualizacao>${now}</atualizacao>
  <atual date="Agora">
    <cidade>${st.city}</cidade>
    <temperatura>${st.tempDefault}</temperatura>
    <descricao>Tempo Firme e Ensolarado</descricao>
    <umidade>52%</umidade>
    <vento>11 km/h</vento>
  </atual>
  <hoje>
    <temperatura_atual>${st.tempDefault}</temperatura_atual>
    <maxima>32°</maxima>
    <minima>21°</minima>
    <descricao_tempo>Ensolarado</descricao_tempo>
    <umidade>52%</umidade>
    <vento>11 km/h</vento>
  </hoje>
  <amanha>
    <maxima>31°</maxima>
    <minima>20°</minima>
    <descricao_tempo>Parcialmente Nublado</descricao_tempo>
  </amanha>
  <proximos_dias>
    <dia data="2026-09-16" dia_semana="Quarta">
      <maxima>30°</maxima>
      <minima>20°</minima>
      <descricao>Pancadas Isoladas</descricao>
    </dia>
    <dia data="2026-09-17" dia_semana="Quinta">
      <maxima>29°</maxima>
      <minima>19°</minima>
      <descricao>Sol entre Nuvens</descricao>
    </dia>
  </proximos_dias>
</previsao>
`;
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
  let musicaCapa = "https://nexohub.lovable.app/default-sponsor-logo.png";
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

function generateFallbackLogos(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<logos_patrocinadores>
  <programa id="programa 1">
    <nome>Geral</nome>
    <logo>
      <nome>Patrocinador Oficial</nome>
      <url>https://nexohub.lovable.app/default-sponsor-logo.png</url>
    </logo>
  </programa>
</logos_patrocinadores>
`;
}

function generateFallbackBroadcast(st: StationConfig): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <empresa_logo>https://nexohub.lovable.app/default-sponsor-logo.png</empresa_logo>
    <programa_nome>Programação ${st.name}</programa_nome>
    <programa_logo>https://nexohub.lovable.app/default-sponsor-logo.png</programa_logo>
    <programa_thumb></programa_thumb>
    <locutor_nome>Locutor no Ar</locutor_nome>
    <locutor_foto>https://nexohub.lovable.app/default-sponsor-logo.png</locutor_foto>
    <locutor_social>@${st.slug}</locutor_social>
    <rede_social_atual>Instagram</rede_social_atual>
    <rede_social_icone>instagram</rede_social_icone>
    <logo_patrocinador>https://nexohub.lovable.app/default-sponsor-logo.png</logo_patrocinador>
    <titulo>No Ar na ${st.name}</titulo>
    <fundo_assunto></fundo_assunto>
    <qrcode_link>https://housemix.nexobrasil.net</qrcode_link>
    <ticker>Acompanhe a melhor programação em ${st.freqDefault}</ticker>
    <insert_live></insert_live>
    <curiosidade>Transmitindo com qualidade digital direto dos estúdios centrais.</curiosidade>
    <musica_atual>Música em Reprodução</musica_atual>
    <musica_capa>https://nexohub.lovable.app/default-sponsor-logo.png</musica_capa>
    <deezer_artist_img></deezer_artist_img>
    <banner_l></banner_l>
    <temperatura>${st.tempDefault}</temperatura>
    <ico_temperatura>sun</ico_temperatura>
    <infos_canto>
      <titulo>${st.name}</titulo>
      <descricao>Goiânia - GO</descricao>
      <ico_categoria>radio</ico_categoria>
      <temp_atual>${st.tempDefault}</temp_atual>
      <ico_temp_atual>sun</ico_temp_atual>
    </infos_canto>
    <a_seguir>
      <ativo>1</ativo>
      <programa_nome>Próximo Programa</programa_nome>
      <nome_programa>Próximo Programa</nome_programa>
      <programa_logo>https://nexohub.lovable.app/default-sponsor-logo.png</programa_logo>
      <locutor_nome>Equipe da Rádio</locutor_nome>
      <locutor_foto>https://nexohub.lovable.app/default-sponsor-logo.png</locutor_foto>
      <horario>12:00</horario>
      <texto>Fique conectado!</texto>
      <intervalo_atualizacao>60</intervalo_atualizacao>
      <atualizado_em>${now}</atualizado_em>
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
  const tempDesc = extractTag(tempoXml, "descricao") || extractTag(tempoXml, "descricao_tempo") || "Tempo Firme e Ensolarado";
  const tempMin = extractTag(tempoXml, "minima") || "20°C";
  const tempMax = extractTag(tempoXml, "maxima") || "31°C";
  const tempUmidade = extractTag(tempoXml, "umidade") || extractTag(tempoXml, "humidade") || "50%";
  const tempVento = extractTag(tempoXml, "vento") || "10 km/h";
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
      <logo_url>https://nexohub.lovable.app/default-sponsor-logo.png</logo_url>
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
        fetchRemoteXml(`${SUPABASE_BASE}/storage/v1/object/public/xml-files/xml-tempo-${st.uid}.xml`),
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

    const tempoContent = tempoRemote || readExistingIfValid("tempo.xml") || generateFallbackTempo(st);
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
    const broadcastContent = broadcastRemote || readExistingIfValid("broadcast.xml") || generateFallbackBroadcast(st);
    const logosContent = logosRemote || readExistingIfValid("logos.xml") || generateFallbackLogos(st);
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
          const active = list.find((e: any) =>
            isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, today, currentTime)
          );
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

    try {
      if (!batalhaContent) {
        const batSyncPath = resolve("src/data/xml_batalhas_sync.json");
        if (existsSync(batSyncPath)) {
          const syncData = JSON.parse(readFileSync(batSyncPath, "utf-8"));
          const list = syncData[st.slug] || syncData[st.uid] || [];
          const { today, currentTime } = getBrasiliaDateTime();
          const active = list.find((b: any) =>
            isScheduleActive(b.data_batalha, b.horario_inicio, b.horario_fim, today, currentTime)
          );
          if (active && (active.artista1_nome || active.artista2_nome)) {
            batalhaContent = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${escapeXml(st.name)}</emissora>
    <artista1_nome>${escapeXml(active.artista1_nome || "")}</artista1_nome>
    <artista1_musica>${escapeXml(active.artista1_musica || "")}</artista1_musica>
    <artista1_porcentagem>${escapeXml(active.artista1_porcentagem ?? 0)}%</artista1_porcentagem>
    <artista1_imagem>${escapeXml(active.artista1_imagem || "")}</artista1_imagem>
    <artista2_nome>${escapeXml(active.artista2_nome || "")}</artista2_nome>
    <artista2_musica>${escapeXml(active.artista2_musica || "")}</artista2_musica>
    <artista2_porcentagem>${escapeXml(active.artista2_porcentagem ?? 0)}%</artista2_porcentagem>
    <artista2_imagem>${escapeXml(active.artista2_imagem || "")}</artista2_imagem>
    <horario_inicio>${escapeXml(active.horario_inicio || "00:00")}</horario_inicio>
    <horario_fim>${escapeXml(active.horario_fim || "23:59")}</horario_fim>
  </batalha>
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
              content.includes("Locutor de Plantão") ||
              (filename === "logos.xml" && !content.includes('id="programa 2"') && existing.includes('id="programa 2"'));

            if (isExistingSubstantial && isNewFallback) {
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

  console.log(`Successfully generated and synced ${totalFiles} XML files in public/xml/`);
}

generateAllUserXmls().catch((err) => {
  console.error("Error generating XMLs:", err);
});

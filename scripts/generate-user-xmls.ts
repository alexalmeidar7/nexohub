import { writeFileSync, mkdirSync, existsSync } from "fs";
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
    <artista1_nome>Artista 1</artista1_nome>
    <artista1_musica>Música 1</artista1_musica>
    <artista1_porcentagem>50%</artista1_porcentagem>
    <artista1_imagem>https://nexohub.lovable.app/default-sponsor-logo.png</artista1_imagem>
    <artista2_nome>Artista 2</artista2_nome>
    <artista2_musica>Música 2</artista2_musica>
    <artista2_porcentagem>50%</artista2_porcentagem>
    <artista2_imagem>https://nexohub.lovable.app/default-sponsor-logo.png</artista2_imagem>
  </batalha>
</items>
`;
}

function generateFallbackEnquete(st: StationConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <emissora>${st.name}</emissora>
    <pergunta>Qual música você quer ouvir no próximo bloco?</pergunta>
    <resposta1>Opção 1</resposta1>
    <resposta2>Opção 2</resposta2>
    <resposta3>Opção 3</resposta3>
    <resposta4>Opção 4</resposta4>
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

export async function generateAllUserXmls() {
  const baseXmlDir = resolve("public/xml");
  if (!existsSync(baseXmlDir)) {
    mkdirSync(baseXmlDir, { recursive: true });
  }

  let totalFiles = 0;

  for (const st of STATIONS) {
    console.log(`Processing station: ${st.name} (${st.slug}, uid: ${st.uid})...`);

    // 1. Fetch live XMLs from Supabase
    const [tempoRemote, roteiroRemote, broadcastRemote, logosRemote, batalhaRemote, enqueteRemote, quizRemote] =
      await Promise.all([
        fetchRemoteXml(`${SUPABASE_BASE}/storage/v1/object/public/xml-files/xml-tempo-${st.uid}.xml`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-roteiro-estudio?user_id=${st.uid}&estudio=Estudio%20FM`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-broadcast?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-logos?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-batalha?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-enquete?user_id=${st.uid}`),
        fetchRemoteXml(`${SUPABASE_BASE}/functions/v1/serve-xml-quiz?user_id=${st.uid}`),
      ]);

    const tempoContent = tempoRemote || generateFallbackTempo(st);
    const roteiroContent = roteiroRemote || generateFallbackRoteiro(st);
    const broadcastContent = broadcastRemote || generateFallbackBroadcast(st);
    const logosContent = logosRemote || generateFallbackLogos(st);
    const musicaContent = generateMusicaXml(st, broadcastRemote);

    // If batalha, enquete, quiz from Supabase have empty content tags, keep them or enrich if needed
    const batalhaContent = batalhaRemote && batalhaRemote.includes("<artista1_nome>") ? batalhaRemote : generateFallbackBatalha(st);
    const enqueteContent = enqueteRemote && enqueteRemote.includes("<pergunta>") ? enqueteRemote : generateFallbackEnquete(st);
    const quizContent = quizRemote && quizRemote.includes("<pergunta>") ? quizRemote : generateFallbackQuiz(st);

    const files: Record<string, string> = {
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
        writeFileSync(join(userDir, filename), content.trim() + "\n", "utf-8");
        totalFiles++;
      }
    }
  }

  console.log(`Successfully generated and synced ${totalFiles} XML files in public/xml/`);
}

generateAllUserXmls().catch((err) => {
  console.error("Error generating XMLs:", err);
});

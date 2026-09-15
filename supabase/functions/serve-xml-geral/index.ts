import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const KNOWN_SLUG_MAP: Record<string, string> = {
  interativafm: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  interativa: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  positivafm: "d17e65af-e407-466f-9b60-b55c43399513",
  positiva: "d17e65af-e407-466f-9b60-b55c43399513",
  p: "d17e65af-e407-466f-9b60-b55c43399513",
  transmissao: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  jornal: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  culturafm973: "66337743-4e4f-4950-b58f-750b0c76861e",
  cultura: "66337743-4e4f-4950-b58f-750b0c76861e",
  alex: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
  default: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
};

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slugParam = (url.searchParams.get("slug") || "").toLowerCase().trim();
    let userId = url.searchParams.get("user_id") || url.searchParams.get("uid") || "";

    if (!userId && slugParam) {
      userId = KNOWN_SLUG_MAP[slugParam] || "";
    }

    if (!userId) {
      userId = "b2f70324-d086-4a5d-a407-cbc4acf98dce"; // Default
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Resolve sub-user parent if needed
    const { data: subUser } = await sb
      .from("sub_users")
      .select("parent_user_id, ativo")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const ownerId = (subUser?.ativo && subUser.parent_user_id) ? subUser.parent_user_id : userId;

    // Fetch all related entities in parallel
    const [
      empresaRes,
      programasRes,
      apresentadoresRes,
      musicHistoryRes,
      logosRes,
      roteiroRes,
      batalhaRes,
      enquetesRes,
      quizRes,
    ] = await Promise.all([
      sb.from("empresa_config").select("*").eq("user_id", ownerId).maybeSingle(),
      sb.from("programas").select("*").eq("user_id", ownerId).eq("ativo", true).order("horario_inicio"),
      sb.from("apresentadores").select("*").eq("user_id", ownerId).eq("ativo", true),
      sb.from("xml_upload_history").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(6),
      sb.from("logos_patrocinadores").select("*").eq("user_id", ownerId).eq("ativo", true).eq("excluido", false),
      sb.from("roteiros").select("*").eq("user_id", ownerId).ilike("estudio", "%fm%").order("data_programa", { ascending: false }).limit(10),
      sb.from("batalha_schedules").select("*").eq("user_id", ownerId).eq("ativo", true).limit(1),
      sb.from("enquetes").select("*").eq("user_id", ownerId).eq("ativo", true).limit(1),
      sb.from("quiz").select("*").eq("user_id", ownerId).eq("ativo", true).limit(1),
    ]);

    const empresa = empresaRes.data || {};
    const programas = programasRes.data || [];
    const apresentadores = apresentadoresRes.data || [];
    const musicHistory = musicHistoryRes.data || [];
    const logos = logosRes.data || [];
    const roteiros = roteiroRes.data || [];
    const activeBatalha = batalhaRes.data?.[0] || null;
    const activeEnquete = enquetesRes.data?.[0] || null;
    const activeQuiz = quizRes.data?.[0] || null;

    // Calculate current time & on-air program
    const now = new Date();
    const currentDayName = DIAS_MAP[now.getDay()];
    const currentHourStr = now.toTimeString().slice(0, 5); // "14:35"

    let currentProgram = programas.find((p: any) => {
      const dias = Array.isArray(p.dias_semana) ? p.dias_semana : [];
      if (dias.length > 0 && !dias.includes(currentDayName)) return false;
      const ini = (p.horario_inicio || "").slice(0, 5);
      const fim = (p.horario_fim || "").slice(0, 5);
      if (ini <= fim) {
        return currentHourStr >= ini && currentHourStr < fim;
      }
      // Crosses midnight
      return currentHourStr >= ini || currentHourStr < fim;
    }) || programas[0] || null;

    // Next program
    let nextProgram: any = null;
    if (currentProgram && programas.length > 1) {
      const idx = programas.indexOf(currentProgram);
      nextProgram = programas[(idx + 1) % programas.length];
    }

    // Presenter for current program
    let currentPresenter: any = null;
    if (currentProgram) {
      const apId = currentProgram.apresentador_id || (currentProgram.apresentadores_ids && currentProgram.apresentadores_ids[0]);
      if (apId) {
        currentPresenter = apresentadores.find((a: any) => a.id === apId);
      }
      if (!currentPresenter && currentProgram.nome) {
        currentPresenter = apresentadores.find((a: any) =>
          a.nome && (currentProgram.nome.toLowerCase().includes(a.nome.toLowerCase()) || a.nome.toLowerCase().includes(currentProgram.nome.toLowerCase()))
        );
      }
    }
    if (!currentPresenter && apresentadores.length > 0) {
      currentPresenter = apresentadores[0];
    }

    // Next presenter
    let nextPresenter: any = null;
    if (nextProgram) {
      const apId = nextProgram.apresentador_id || (nextProgram.apresentadores_ids && nextProgram.apresentadores_ids[0]);
      if (apId) {
        nextPresenter = apresentadores.find((a: any) => a.id === apId);
      }
    }

    // Music data
    const currentMusic = musicHistory[0] || null;
    const pastMusics = musicHistory.slice(1);

    // Fetch curiosity for current song if available
    let curiosidade = "";
    if (currentMusic?.musica || currentMusic?.artista) {
      const { data: curData } = await sb
        .from("curiosidades_musicais")
        .select("curiosidade")
        .ilike("musica", currentMusic.musica || "")
        .limit(1)
        .maybeSingle();
      if (curData?.curiosidade) {
        curiosidade = curData.curiosidade;
      }
    }

    // Weather fallback / retrieval from storage
    let weatherXml = "";
    try {
      const { data: wBlob } = await sb.storage
        .from("xml-files")
        .download(`xml-tempo-${ownerId}.xml`);
      if (wBlob) {
        weatherXml = await wBlob.text();
      }
    } catch {}

    const cityName = empresa?.cidade || "Goiânia - GO";
    const stationName = empresa?.nome || "House Mix Emissora";
    const stationFreq = empresa?.frequencia || "FM";
    const stationLogo = empresa?.logo || "";

    // Assemble General XML
    const xmlParts: string[] = [];
    xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    xmlParts.push('<geral versao="1.0">');
    xmlParts.push(`  <gerado_em>${new Date().toISOString()}</gerado_em>`);

    // 1. ESTACAO
    xmlParts.push('  <estacao>');
    xmlParts.push(`    <nome>${esc(stationName)}</nome>`);
    xmlParts.push(`    <slug>${esc(slugParam || "default")}</slug>`);
    xmlParts.push(`    <cidade>${esc(cityName)}</cidade>`);
    xmlParts.push(`    <frequencia>${esc(stationFreq)}</frequencia>`);
    xmlParts.push(`    <logo_url>${esc(stationLogo)}</logo_url>`);
    xmlParts.push(`    <timezone>${esc(empresa?.timezone || "America/Sao_Paulo")}</timezone>`);
    xmlParts.push('  </estacao>');

    // 2. NO AR (Música, Programa e Locutor)
    xmlParts.push('  <no_ar>');
    xmlParts.push('    <musica_atual>');
    xmlParts.push(`      <titulo>${esc(currentMusic?.musica || "Programação Musical")}</titulo>`);
    xmlParts.push(`      <artista>${esc(currentMusic?.artista || stationName)}</artista>`);
    xmlParts.push(`      <album>${esc(currentMusic?.album || "")}</album>`);
    xmlParts.push(`      <capa_url>${esc(currentMusic?.capa || "")}</capa_url>`);
    xmlParts.push(`      <curiosidade>${esc(curiosidade)}</curiosidade>`);
    xmlParts.push(`      <texto_completo>${esc(`${currentMusic?.musica || "Programação"} - ${currentMusic?.artista || stationName}`)}</texto_completo>`);
    xmlParts.push(`      <atualizado_em>${esc(currentMusic?.created_at || now.toISOString())}</atualizado_em>`);
    xmlParts.push('    </musica_atual>');

    xmlParts.push('    <programa_atual>');
    xmlParts.push(`      <nome>${esc(currentProgram?.nome || "Programação Normal")}</nome>`);
    xmlParts.push(`      <horario_inicio>${esc((currentProgram?.horario_inicio || "00:00").slice(0, 5))}</horario_inicio>`);
    xmlParts.push(`      <horario_fim>${esc((currentProgram?.horario_fim || "23:59").slice(0, 5))}</horario_fim>`);
    xmlParts.push(`      <horario_formatado>${esc(`${(currentProgram?.horario_inicio || "00:00").slice(0, 5)} às ${(currentProgram?.horario_fim || "23:59").slice(0, 5)}`)}</horario_formatado>`);
    xmlParts.push(`      <descricao>${esc(currentProgram?.descricao || "")}</descricao>`);
    xmlParts.push(`      <classificacao_etaria>${esc(currentProgram?.classificacao_etaria || "Livre")}</classificacao_etaria>`);
    xmlParts.push(`      <estudio>${esc(currentProgram?.estudio || "Estúdio FM")}</estudio>`);
    xmlParts.push(`      <logo_url>${esc(currentProgram?.selo || currentProgram?.thumb || "")}</logo_url>`);
    xmlParts.push('    </programa_atual>');

    xmlParts.push('    <apresentador_atual>');
    xmlParts.push(`      <nome>${esc(currentPresenter?.nome || "Locução da Estação")}</nome>`);
    xmlParts.push(`      <foto_url>${esc(currentPresenter?.foto || "")}</foto_url>`);
    xmlParts.push(`      <instagram>${esc(currentPresenter?.instagram || "")}</instagram>`);
    xmlParts.push('    </apresentador_atual>');

    if (nextProgram) {
      xmlParts.push('    <a_seguir>');
      xmlParts.push('      <ativo>1</ativo>');
      xmlParts.push(`      <programa_nome>${esc(nextProgram.nome)}</programa_nome>`);
      xmlParts.push(`      <horario>${esc(`${(nextProgram.horario_inicio || "00:00").slice(0, 5)} às ${(nextProgram.horario_fim || "23:59").slice(0, 5)}`)}</horario>`);
      xmlParts.push(`      <locutor_nome>${esc(nextPresenter?.nome || "")}</locutor_nome>`);
      xmlParts.push(`      <locutor_foto>${esc(nextPresenter?.foto || "")}</locutor_foto>`);
      xmlParts.push('    </a_seguir>');
    } else {
      xmlParts.push('    <a_seguir><ativo>0</ativo></a_seguir>');
    }

    xmlParts.push('    <historico_recente>');
    pastMusics.forEach((m: any, idx: number) => {
      xmlParts.push('      <musica>');
      xmlParts.push(`        <posicao>${idx + 1}</posicao>`);
      xmlParts.push(`        <titulo>${esc(m.musica || "")}</titulo>`);
      xmlParts.push(`        <artista>${esc(m.artista || "")}</artista>`);
      xmlParts.push('      </musica>');
    });
    xmlParts.push('    </historico_recente>');
    xmlParts.push('  </no_ar>');

    // 3. PREVISAO DO TEMPO
    xmlParts.push('  <previsao_tempo>');
    xmlParts.push(`    <cidade>${esc(cityName)}</cidade>`);
    if (weatherXml && weatherXml.includes("<temperatura>")) {
      const matchTemp = weatherXml.match(/<temperatura>([^<]+)<\/temperatura>/i);
      const matchDesc = weatherXml.match(/<descricao>([^<]+)<\/descricao>/i);
      const matchMin = weatherXml.match(/<minima>([^<]+)<\/minima>/i);
      const matchMax = weatherXml.match(/<maxima>([^<]+)<\/maxima>/i);
      const matchIcon = weatherXml.match(/<icone_url>([^<]+)<\/icone_url>/i) || weatherXml.match(/<url_imagem_icone>([^<]+)<\/url_imagem_icone>/i);
      const matchUmidade = weatherXml.match(/<humidade>([^<]+)<\/humidade>/i) || weatherXml.match(/<umidade>([^<]+)<\/umidade>/i);
      const matchVento = weatherXml.match(/<vento>([^<]+)<\/vento>/i);

      xmlParts.push('    <atual>');
      xmlParts.push(`      <temperatura>${esc(matchTemp ? matchTemp[1] : "27ºC")}</temperatura>`);
      xmlParts.push(`      <descricao>${esc(matchDesc ? matchDesc[1] : "Ensolarado")}</descricao>`);
      xmlParts.push(`      <minima>${esc(matchMin ? matchMin[1] : "21ºC")}</minima>`);
      xmlParts.push(`      <maxima>${esc(matchMax ? matchMax[1] : "32ºC")}</maxima>`);
      xmlParts.push(`      <umidade>${esc(matchUmidade ? matchUmidade[1] : "50%")}</umidade>`);
      xmlParts.push(`      <vento>${esc(matchVento ? matchVento[1] : "10 km/h")}</vento>`);
      xmlParts.push(`      <icone_url>${esc(matchIcon ? matchIcon[1] : "")}</icone_url>`);
      xmlParts.push('    </atual>');
    } else {
      xmlParts.push('    <atual>');
      xmlParts.push('      <temperatura>27ºC</temperatura>');
      xmlParts.push('      <descricao>Tempo Firme e Ensolarado</descricao>');
      xmlParts.push('      <minima>21ºC</minima>');
      xmlParts.push('      <maxima>32ºC</maxima>');
      xmlParts.push('      <umidade>52%</umidade>');
      xmlParts.push('      <vento>11 km/h</vento>');
      xmlParts.push('      <icone_url></icone_url>');
      xmlParts.push('    </atual>');
    }
    xmlParts.push('  </previsao_tempo>');

    // 4. ROTEIRO
    const activeRoteiro = roteiros[0] || null;
    xmlParts.push('  <roteiro>');
    xmlParts.push(`    <programa>${esc(activeRoteiro?.programa_nome || currentProgram?.nome || "Programa ao Vivo")}</programa>`);
    xmlParts.push(`    <estudio>${esc(activeRoteiro?.estudio || "Estúdio FM")}</estudio>`);
    xmlParts.push(`    <data>${esc(activeRoteiro?.data_programa || now.toISOString().slice(0, 10))}</data>`);
    xmlParts.push(`    <horario>${esc(activeRoteiro?.horario || currentHourStr)}</horario>`);
    xmlParts.push('    <itens>');
    if (activeRoteiro) {
      xmlParts.push('      <item>');
      xmlParts.push(`        <titulo>${esc(activeRoteiro.subtitulo || "Bloco Principal")}</titulo>`);
      xmlParts.push('        <tipo>bloco</tipo>');
      xmlParts.push('        <status>executando</status>');
      xmlParts.push('      </item>');
    }
    xmlParts.push('    </itens>');
    xmlParts.push('  </roteiro>');

    // 5. INTERATIVIDADE (Batalha, Enquete, Quiz)
    xmlParts.push('  <interatividade>');

    // Batalha
    if (activeBatalha) {
      xmlParts.push('    <batalha ativa="1">');
      xmlParts.push(`      <titulo>${esc(activeBatalha.titulo || "Batalha Musical")}</titulo>`);
      xmlParts.push('      <musica_a>');
      xmlParts.push(`        <nome>${esc(activeBatalha.musica_a || "Música A")}</nome>`);
      xmlParts.push(`        <artista>${esc(activeBatalha.artista_a || "Artista A")}</artista>`);
      xmlParts.push(`        <votos>${activeBatalha.votos_a || 0}</votos>`);
      xmlParts.push(`        <porcentagem>${activeBatalha.pct_a || "50"}%</porcentagem>`);
      xmlParts.push(`        <capa_url>${esc(activeBatalha.capa_a || "")}</capa_url>`);
      xmlParts.push('      </musica_a>');
      xmlParts.push('      <musica_b>');
      xmlParts.push(`        <nome>${esc(activeBatalha.musica_b || "Música B")}</nome>`);
      xmlParts.push(`        <artista>${esc(activeBatalha.artista_b || "Artista B")}</artista>`);
      xmlParts.push(`        <votos>${activeBatalha.votos_b || 0}</votos>`);
      xmlParts.push(`        <porcentagem>${activeBatalha.pct_b || "50"}%</porcentagem>`);
      xmlParts.push(`        <capa_url>${esc(activeBatalha.capa_b || "")}</capa_url>`);
      xmlParts.push('      </musica_b>');
      xmlParts.push('    </batalha>');
    } else {
      xmlParts.push('    <batalha ativa="0"></batalha>');
    }

    // Enquete
    if (activeEnquete) {
      xmlParts.push('    <enquete ativa="1">');
      xmlParts.push(`      <pergunta>${esc(activeEnquete.pergunta || "")}</pergunta>`);
      xmlParts.push(`      <opcao_a>${esc(activeEnquete.opcao1 || "Opção 1")}</opcao_a>`);
      xmlParts.push(`      <votos_a>${activeEnquete.votos1 || 0}</votos_a>`);
      xmlParts.push(`      <opcao_b>${esc(activeEnquete.opcao2 || "Opção 2")}</opcao_b>`);
      xmlParts.push(`      <votos_b>${activeEnquete.votos2 || 0}</votos_b>`);
      xmlParts.push('    </enquete>');
    } else {
      xmlParts.push('    <enquete ativa="0"></enquete>');
    }

    // Quiz
    if (activeQuiz) {
      xmlParts.push('    <quiz ativo="1">');
      xmlParts.push(`      <pergunta>${esc(activeQuiz.pergunta || "")}</pergunta>`);
      xmlParts.push(`      <alternativa_a>${esc(activeQuiz.resposta1 || "")}</alternativa_a>`);
      xmlParts.push(`      <alternativa_b>${esc(activeQuiz.resposta2 || "")}</alternativa_b>`);
      xmlParts.push(`      <alternativa_c>${esc(activeQuiz.resposta3 || "")}</alternativa_c>`);
      xmlParts.push(`      <alternativa_d>${esc(activeQuiz.resposta4 || "")}</alternativa_d>`);
      xmlParts.push(`      <resposta_correta>${esc(activeQuiz.resposta_correta || "A")}</resposta_correta>`);
      xmlParts.push('    </quiz>');
    } else {
      xmlParts.push('    <quiz ativo="0"></quiz>');
    }

    xmlParts.push('  </interatividade>');

    // 6. PATROCINADORES / LOGOS
    xmlParts.push('  <patrocinadores>');
    logos.forEach((l: any) => {
      xmlParts.push('    <patrocinador>');
      xmlParts.push(`      <nome>${esc(l.nome || "Patrocinador")}</nome>`);
      xmlParts.push(`      <logo_url>${esc(l.logo_url || "")}</logo_url>`);
      xmlParts.push('    </patrocinador>');
    });
    xmlParts.push('  </patrocinadores>');

    xmlParts.push('</geral>');

    return new Response(xmlParts.join("\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err: any) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${esc(err?.message || "Erro interno")}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});

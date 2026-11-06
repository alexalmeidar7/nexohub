const serve = Deno.serve;
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";
import { pngSponsorUrl, rotationTime, selectOnAirProgram, selectRotatingSponsor, sponsorXml } from "../_shared/sponsorRotation.ts";
import { flattenGeralXml } from "../_shared/flattenGeralXml.ts";
const isUUID = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

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



function normTime(t: any, def = "00:00"): string {
  const str = String(t ?? def).trim();
  const [h, m] = str.split(":");
  return `${(h || "0").padStart(2, "0")}:${(m || "00").slice(0, 2).padEnd(2, "0")}`;
}

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let userId = url.searchParams.get("user_id") || url.searchParams.get("uid") || "";
    const rawSlug = url.searchParams.get("slug");

    // IDs atuais dos titulares no banco. UUIDs legados são mantidos como aliases.
    const SLUG_TO_UID: Record<string, string> = {
      positivafm: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
      positiva: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
      p: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
      sub_positiva_opec: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
      "d17e65af-e407-466f-9b60-b55c43399513": "452ebd1e-61a0-42dd-bf80-231a3f426c83",
      interativafm: "9cab6c46-c32a-4c19-94db-773dcfaf7632",
      interativa: "9cab6c46-c32a-4c19-94db-773dcfaf7632",
      "b2f70324-d086-4a5d-a407-cbc4acf98dce": "9cab6c46-c32a-4c19-94db-773dcfaf7632",
      transmissao: "98365ea6-0ebf-496d-83e9-69b38089586d",
      jornal: "98365ea6-0ebf-496d-83e9-69b38089586d",
      "48423cc6-f3b1-4bea-8729-dd0ae76a89c3": "98365ea6-0ebf-496d-83e9-69b38089586d",
      culturafm973: "b67436c6-ede1-4438-881d-18b9e923adda",
      cultura: "b67436c6-ede1-4438-881d-18b9e923adda",
      "66337743-4e4f-4950-b58f-750b0c76861e": "b67436c6-ede1-4438-881d-18b9e923adda",
      alex: "a05c5b71-a100-40f9-8be3-6eb7035a057b",
      "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5": "a05c5b71-a100-40f9-8be3-6eb7035a057b",
    };

    // A URL oficial passa user_id e slug. O UUID explícito do banco é a fonte
    // de verdade; nunca deixe um alias antigo substituir o titular informado.
    const suppliedUid = userId.trim().toLowerCase();
    if (isUUID(userId)) {
      userId = SLUG_TO_UID[suppliedUid] || userId;
    } else {
      const lookup = (rawSlug || suppliedUid).toLowerCase().trim();
      const mappedUid = SLUG_TO_UID[lookup];
      if (!mappedUid) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><error>Identificador da emissora ausente ou inválido</error>`,
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } },
        );
      }
      userId = mappedUid;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });

    // Get current date and time in America/Sao_Paulo
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "long",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const currentHourStr = `${getPart("hour")}:${getPart("minute")}`;

    // Resolve sub-user parent if needed
    const { data: subUser, error: subUserError } = await sb
      .from("sub_users")
      .select("parent_user_id, ativo")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (subUserError) throw subUserError;

    const ownerId = (subUser?.ativo && subUser.parent_user_id) ? subUser.parent_user_id : userId;
    console.log(`[serve-xml-geral] start owner=${ownerId}`);


    // Fetch all related entities in parallel
    const step = async <T>(name: string, p: PromiseLike<T>): Promise<T> => {
      const r: any = await p;
      if (r?.error) {
        console.error(`[serve-xml-geral] step ${name} failed:`, r.error);
        throw r.error;
      }
      console.log(`[serve-xml-geral] step ${name} ok`);
      return r;
    };

    // Todas as leituras independentes em paralelo: o XML geral não deve somar
    // a latência de dez consultas sequenciais a cada atualização do vMix.
    const [
      empresaRes,
      profileRes,
      programasRes,
      apresentadoresRes,
      musicHistoryRes,
      logosRes,
      roteiroRes,
      batalhaRes,
      enquetesRes,
      quizRes,
      noticiasRes,
    ] = await Promise.all([
      step("empresa", sb.from("empresa_config").select("nome, logo, timezone, endereco, site").eq("user_id", ownerId).maybeSingle()),
      step("profile", sb.from("profiles").select("cidade, estado").eq("user_id", ownerId).maybeSingle()),
      step("programas", sb.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, descricao, classificacao_etaria, estudio, apresentador_id, apresentadores_ids").eq("user_id", ownerId).eq("ativo", true).order("horario_inicio")),
      step("apresentadores", sb.from("apresentadores").select("id, nome, instagram").eq("user_id", ownerId).eq("ativo", true)),
      // A RPC limita campos históricos que podem conter dados enormes.
      step("musicHistory", sb.rpc("get_music_history_light", { _user_id: ownerId, _limit: 6 })),
      step("logos", sb.from("logos_patrocinadores").select("id, nome, logo_url, programa_id, data_final, created_at").eq("user_id", ownerId).eq("ativo", true).eq("excluido", false).gte("data_final", rotationTime(now).today)),
      step("roteiros", sb.from("roteiros").select("id, programa_nome, estudio, data_programa, horario, subtitulo, participantes, xml_pushed_at, created_at, updated_at").eq("user_id", ownerId).ilike("estudio", "%fm%").order("updated_at", { ascending: false }).limit(10)),
      step("batalha", sb.from("batalhas_agendadas").select("artista1_nome, artista1_musica, artista1_porcentagem, artista1_imagem, artista2_nome, artista2_musica, artista2_porcentagem, artista2_imagem, horario_inicio, horario_fim").eq("user_id", ownerId).eq("data_batalha", today).order("horario_inicio", { ascending: false })),
      step("enquetes", sb.from("enquetes_agendadas").select("pergunta, resposta1, resposta2, resposta3, resposta4, resposta_correta, horario_inicio, horario_fim").eq("user_id", ownerId).eq("data_enquete", today).order("horario_inicio", { ascending: false })),
      step("quiz", sb.from("quiz_agendados").select("pergunta, resposta1, resposta2, resposta3, resposta4, resposta_correta, horario_inicio, horario_fim, explicacao, imagem_resposta").eq("user_id", ownerId).eq("data_quiz", today).order("horario_inicio", { ascending: false })),
      sb.from("noticias").select("titulo, descricao, url, criada_em").eq("user_id", ownerId).eq("ativo", true).order("criada_em", { ascending: false }).limit(10).then(r => r).catch(() => ({ data: [] })),
    ]);


    console.log(`[serve-xml-geral] fetched owner=${ownerId} prog=${programasRes.data?.length || 0} ap=${apresentadoresRes.data?.length || 0} logos=${logosRes.data?.length || 0} rot=${roteiroRes.data?.length || 0} bat=${batalhaRes.data?.length || 0}`);

    const empresa: any = empresaRes.data || {};
    const programas = programasRes.data || [];
    const apresentadores = apresentadoresRes.data || [];
    const musicHistory = musicHistoryRes.data || [];
    const logos = logosRes.data || [];
    const noticias = noticiasRes.data || [];
    const toVmixImageUrl = (value: string) => ensureVmixPngUrl(sb, value, `vmix-geral/${ownerId}`);
    const onAirProgram = selectOnAirProgram(programas, now);
    const selectedSponsor = selectRotatingSponsor(logos, onAirProgram?.id || null, now);
    const roteiros = roteiroRes.data || [];
    const activeBatalha = (batalhaRes.data || []).find((b: any) => {
      const ini = normTime(b.horario_inicio, "00:00");
      const fim = normTime(b.horario_fim, "23:59");
      return ini <= fim ? (currentHourStr >= ini && currentHourStr <= fim) : (currentHourStr >= ini || currentHourStr <= fim);
    }) || null;

    // Filter active enquete and quiz for the current minute
    const activeEnquete = (enquetesRes.data || []).find((e: any) => {
      const ini = normTime(e.horario_inicio, "00:00");
      const fim = normTime(e.horario_fim, "23:59");
      return ini <= fim ? (currentHourStr >= ini && currentHourStr <= fim) : (currentHourStr >= ini || currentHourStr <= fim);
    }) || null;

    const activeQuiz = (quizRes.data || []).find((q: any) => {
      const ini = normTime(q.horario_inicio, "00:00");
      const fim = normTime(q.horario_fim, "23:59");
      return ini <= fim ? (currentHourStr >= ini && currentHourStr <= fim) : (currentHourStr >= ini || currentHourStr <= fim);
    }) || null;

    let currentProgram: any = onAirProgram;

    // Next program
    let nextProgram: any = null;
    if (currentProgram && programas.length > 1) {
      const idx = programas.indexOf(currentProgram);
      nextProgram = programas[(idx + 1) % programas.length];
    }

    // Presenter for current program (apenas o vinculado ao programa no ar)
    let currentPresenter: any = null;
    if (currentProgram) {
      const apId = currentProgram.apresentador_id || (currentProgram.apresentadores_ids && currentProgram.apresentadores_ids[0]);
      if (apId) {
        currentPresenter = apresentadores.find((a: any) => a.id === apId);
      }
    }

    // Next presenter
    let nextPresenter: any = null;
    if (nextProgram) {
      const apId = nextProgram.apresentador_id || (nextProgram.apresentadores_ids && nextProgram.apresentadores_ids[0]);
      if (apId) {
        nextPresenter = apresentadores.find((a: any) => a.id === apId);
      }
    }

    // Busca a foto apenas dos locutores usados
    const fotoIds = [currentPresenter?.id, nextPresenter?.id].filter(Boolean);
    if (fotoIds.length > 0) {
      const { data: fotos } = await sb
        .from("apresentadores")
        .select("id, foto")
        .in("id", fotoIds);
      (fotos || []).forEach((f: any) => {
        if (currentPresenter?.id === f.id) currentPresenter.foto = f.foto;
        if (nextPresenter?.id === f.id) nextPresenter.foto = f.foto;
      });
    }

    // Selo/thumb apenas dos programas exibidos
    const progIds = [currentProgram?.id, nextProgram?.id].filter(Boolean);
    if (progIds.length > 0) {
      const { data: selos } = await sb
        .from("programas")
        .select("id, selo, thumb")
        .in("id", progIds);
      (selos || []).forEach((p: any) => {
        if (currentProgram?.id === p.id) { currentProgram.selo = p.selo; currentProgram.thumb = p.thumb; }
        if (nextProgram?.id === p.id) { nextProgram.selo = p.selo; nextProgram.thumb = p.thumb; }
      });
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

    const profile = (profileRes.data || {}) as { cidade?: string; estado?: string };
    // Positiva FM fica no Shopping Passeio das Águas, em Goiânia. Para outras
    // emissoras, usar a cidade do perfil sem consultar coluna inexistente.
    const cityName = profile.cidade
      ? `${profile.cidade}${profile.estado ? " - " + profile.estado : ""}`
      : (ownerId === "452ebd1e-61a0-42dd-bf80-231a3f426c83" ? "Goiânia - GO" : "Não informada");
    const stationName = empresa?.nome || "House Mix Emissora";
    const stationLogo = empresa?.logo || "";
    const [
      stationLogoPng, currentMusicCoverPng, currentProgramLogoPng,
      currentPresenterPhotoPng, nextPresenterPhotoPng,
      battleImage1Png, battleImage2Png, quizImagePng,
    ] = await Promise.all([
      toVmixImageUrl(stationLogo),
      toVmixImageUrl(currentMusic?.capa || ""),
      toVmixImageUrl(currentProgram?.selo || currentProgram?.thumb || ""),
      toVmixImageUrl(currentPresenter?.foto || ""),
      toVmixImageUrl(nextPresenter?.foto || ""),
      toVmixImageUrl(activeBatalha?.artista1_imagem || ""),
      toVmixImageUrl(activeBatalha?.artista2_imagem || ""),
      toVmixImageUrl(activeQuiz?.imagem_resposta || ""),
    ]);
    const sponsorLogoPng = selectedSponsor?.logo_url
      ? pngSponsorUrl(await ensureVmixPngUrl(sb, selectedSponsor.logo_url, `vmix-logos/${ownerId}`))
      : "";

    // Assemble General XML
    const xmlParts: string[] = [];
    xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    xmlParts.push('<geral>');
    xmlParts.push(`  <gerado_em>${new Date().toISOString()}</gerado_em>`);

    // 1. ESTACAO
    xmlParts.push('  <estacao>');
    xmlParts.push(`    <slug>${esc(rawSlug || "default")}</slug>`);
    xmlParts.push(`    <logo_url>${esc(stationLogoPng)}</logo_url>`);
    xmlParts.push(`    <timezone>${esc(empresa?.timezone || "America/Sao_Paulo")}</timezone>`);
    xmlParts.push('  </estacao>');

    // 2. NO AR (Música, Programa e Locutor)
    xmlParts.push('  <no_ar>');
    xmlParts.push('    <musica_atual>');
    xmlParts.push(`      <titulo>${esc(currentMusic?.musica || "Programação Musical")}</titulo>`);
    xmlParts.push(`      <artista>${esc(currentMusic?.artista || stationName)}</artista>`);
    xmlParts.push(`      <album>${esc(currentMusic?.album || "")}</album>`);
    xmlParts.push(`      <capa_url>${esc(currentMusicCoverPng)}</capa_url>`);
    xmlParts.push(`      <curiosidade>${esc(curiosidade)}</curiosidade>`);
    xmlParts.push(`      <texto_completo>${esc(`${currentMusic?.musica || "Programação"} - ${currentMusic?.artista || stationName}`)}</texto_completo>`);
    xmlParts.push('    </musica_atual>');

    xmlParts.push('    <programa_atual>');
    xmlParts.push(`      <nome>${esc(currentProgram?.nome || "Programação Normal")}</nome>`);
    xmlParts.push(`      <horario_inicio>${esc((currentProgram?.horario_inicio || "00:00").slice(0, 5))}</horario_inicio>`);
    xmlParts.push(`      <horario_fim>${esc((currentProgram?.horario_fim || "23:59").slice(0, 5))}</horario_fim>`);
    xmlParts.push(`      <horario_formatado>${esc(`${(currentProgram?.horario_inicio || "00:00").slice(0, 5)} às ${(currentProgram?.horario_fim || "23:59").slice(0, 5)}`)}</horario_formatado>`);
    xmlParts.push(`      <descricao>${esc(currentProgram?.descricao || "")}</descricao>`);
    xmlParts.push(`      <classificacao_etaria>${esc(currentProgram?.classificacao_etaria || "Livre")}</classificacao_etaria>`);
    xmlParts.push(`      <estudio>${esc(currentProgram?.estudio || "Estúdio FM")}</estudio>`);
    xmlParts.push(`      <logo_url>${esc(currentProgramLogoPng)}</logo_url>`);
    xmlParts.push('    </programa_atual>');

    xmlParts.push('    <apresentador_atual>');
    xmlParts.push(`      <nome>${esc(currentPresenter?.nome || "Locução da Estação")}</nome>`);
    xmlParts.push(`      <foto_url>${esc(currentPresenterPhotoPng)}</foto_url>`);
    xmlParts.push(`      <instagram>${esc(currentPresenter?.instagram || "")}</instagram>`);
    xmlParts.push('    </apresentador_atual>');

    if (nextProgram) {
      xmlParts.push('    <a_seguir>');
      xmlParts.push('      <ativo>1</ativo>');
      xmlParts.push(`      <programa_nome>${esc(nextProgram.nome)}</programa_nome>`);
      xmlParts.push(`      <horario>${esc(`${(nextProgram.horario_inicio || "00:00").slice(0, 5)} às ${(nextProgram.horario_fim || "23:59").slice(0, 5)}`)}</horario>`);
      xmlParts.push(`      <locutor_nome>${esc(nextPresenter?.nome || "")}</locutor_nome>`);
      xmlParts.push(`      <locutor_foto>${esc(nextPresenterPhotoPng)}</locutor_foto>`);
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
      xmlParts.push('      <disponivel>1</disponivel>');
      xmlParts.push(`      <temperatura>${esc(matchTemp ? matchTemp[1] : "")}</temperatura>`);
      xmlParts.push(`      <descricao>${esc(matchDesc ? matchDesc[1] : "")}</descricao>`);
      xmlParts.push(`      <minima>${esc(matchMin ? matchMin[1] : "")}</minima>`);
      xmlParts.push(`      <maxima>${esc(matchMax ? matchMax[1] : "")}</maxima>`);
      xmlParts.push(`      <umidade>${esc(matchUmidade ? matchUmidade[1] : "")}</umidade>`);
      xmlParts.push(`      <vento>${esc(matchVento ? matchVento[1] : "")}</vento>`);
      xmlParts.push(`      <icone_url>${esc(matchIcon ? matchIcon[1] : "")}</icone_url>`);
      xmlParts.push('    </atual>');
    } else {
      xmlParts.push('    <atual>');
      xmlParts.push('      <disponivel>0</disponivel>');
      xmlParts.push('      <temperatura></temperatura>');
      xmlParts.push('      <descricao></descricao>');
      xmlParts.push('      <minima></minima>');
      xmlParts.push('      <maxima></maxima>');
      xmlParts.push('      <umidade></umidade>');
      xmlParts.push('      <vento></vento>');
      xmlParts.push('      <icone_url></icone_url>');
      xmlParts.push('    </atual>');
    }
    xmlParts.push('  </previsao_tempo>');

    // 4. ROTEIRO
    const activeRoteiro = roteiros.find((r: any) => String(r.data_programa || "").slice(0, 10) === today) || null;
    let roteiroData: any = {};
    if (activeRoteiro) {
      try {
        let raw: any = activeRoteiro.participantes;
        if (typeof raw === "string") raw = JSON.parse(raw);
        if (typeof raw === "string") raw = JSON.parse(raw);
        roteiroData = Array.isArray(raw) ? { participantes: raw } : (raw || {});
      } catch { roteiroData = {}; }
    }
    xmlParts.push(`  <roteiro ativo="${activeRoteiro ? "1" : "0"}">`);
    xmlParts.push(`    <programa>${esc(activeRoteiro?.programa_nome || "")}</programa>`);
    xmlParts.push(`    <estudio>${esc(activeRoteiro?.estudio || "")}</estudio>`);
    xmlParts.push(`    <data>${esc(activeRoteiro?.data_programa || today)}</data>`);
    xmlParts.push(`    <horario>${esc(activeRoteiro?.horario || "")}</horario>`);
    xmlParts.push(`    <subtitulo>${esc(activeRoteiro?.subtitulo || "")}</subtitulo>`);
    xmlParts.push(`    <atualizado_em>${esc(activeRoteiro?.updated_at || activeRoteiro?.created_at || "")}</atualizado_em>`);
    xmlParts.push(`    <publicado_em>${esc(activeRoteiro?.xml_pushed_at || "")}</publicado_em>`);
    xmlParts.push('    <participantes>');
    (Array.isArray(roteiroData.participantes) ? roteiroData.participantes : []).forEach((p: any) => {
      xmlParts.push('      <participante>');
      xmlParts.push(`        <nome>${esc(p.nome || "")}</nome>`);
      xmlParts.push(`        <cargo>${esc(p.cargo || "")}</cargo>`);
      xmlParts.push(`        <instagram>${esc(p.instagram || "")}</instagram>`);
      xmlParts.push('      </participante>');
    });
    xmlParts.push('    </participantes>');
    xmlParts.push('    <escalada>');
    const escaladaRows = Array.isArray(roteiroData.escaladaList) ? roteiroData.escaladaList : [];
    for (let i = 0; i < escaladaRows.length; i++) {
      const item = escaladaRows[i];
      const image = await toVmixImageUrl(typeof item === "string" ? "" : item.imagemUrl || "");
      xmlParts.push(`      <item ordem="${i + 1}">`);
      xmlParts.push(`        <titulo>${esc(typeof item === "string" ? item : item.titulo || "")}</titulo>`);
      xmlParts.push(`        <imagem_url>${esc(image)}</imagem_url>`);
      xmlParts.push('      </item>');
    }
    xmlParts.push('    </escalada>');
    xmlParts.push('    <blocos>');
    const roteiroBlocos = Array.isArray(roteiroData.blocos) ? roteiroData.blocos : [];
    for (let bi = 0; bi < roteiroBlocos.length; bi++) {
      const bloco = roteiroBlocos[bi];
      xmlParts.push(`      <bloco numero="${bi + 1}">`);
      const noticias = Array.isArray(bloco.noticias) ? bloco.noticias : [];
      for (let ni = 0; ni < noticias.length; ni++) {
        const noticia = noticias[ni];
        const image = await toVmixImageUrl(noticia.imagemUrl || "");
        xmlParts.push(`        <noticia ordem="${ni + 1}">`);
        xmlParts.push(`          <titulo>${esc(noticia.titulo || "")}</titulo>`);
        xmlParts.push(`          <imagem_url>${esc(image)}</imagem_url>`);
        xmlParts.push(`          <escalada>${noticia.escalada ? "1" : "0"}</escalada>`);
        xmlParts.push('        </noticia>');
      }
      xmlParts.push('      </bloco>');
    }
    xmlParts.push('    </blocos>');
    const podcastData = roteiroData.podcastData || null;
    xmlParts.push('    <podcast>');
    xmlParts.push(`      <ativo>${podcastData ? "1" : "0"}</ativo>`);
    xmlParts.push(`      <titulo_tarja>${esc(podcastData?.tituloTarja || "")}</titulo_tarja>`);
    xmlParts.push(`      <subtitulo_tarja>${esc(podcastData?.subtituloTarja || "")}</subtitulo_tarja>`);
    xmlParts.push(`      <introducao>${esc(podcastData?.introducao || "")}</introducao>`);
    xmlParts.push('      <perguntas>');
    (Array.isArray(podcastData?.perguntas) ? podcastData.perguntas : []).forEach((pergunta: string, i: number) => {
      xmlParts.push(`        <pergunta ordem="${i + 1}">${esc(pergunta)}</pergunta>`);
    });
    xmlParts.push('      </perguntas>');
    xmlParts.push(`      <concluindo>${esc(podcastData?.concluindo || "")}</concluindo>`);
    xmlParts.push('      <imagens_apoio>');
    const podcastImages = await Promise.all((Array.isArray(podcastData?.apoioImagens) ? podcastData.apoioImagens : []).map((u: string) => toVmixImageUrl(u)));
    podcastImages.forEach((u: string) => xmlParts.push(`        <imagem>${esc(u)}</imagem>`));
    xmlParts.push('      </imagens_apoio>');
    xmlParts.push('      <videos_apoio>');
    (Array.isArray(podcastData?.apoioVideos) ? podcastData.apoioVideos : []).forEach((u: string) => xmlParts.push(`        <video>${esc(u)}</video>`));
    xmlParts.push('      </videos_apoio>');
    xmlParts.push('    </podcast>');
    xmlParts.push('  </roteiro>');

    // 5. INTERATIVIDADE (Batalha, Enquete, Quiz)
    xmlParts.push('  <interatividade>');

    // Batalha
    if (activeBatalha) {
      xmlParts.push('    <batalha ativa="1">');
      xmlParts.push('      <titulo>Batalha Musical</titulo>');
      xmlParts.push('      <musica_a>');
      xmlParts.push(`        <nome>${esc(activeBatalha.artista1_musica || "")}</nome>`);
      xmlParts.push(`        <artista>${esc(activeBatalha.artista1_nome || "")}</artista>`);
      xmlParts.push('        <votos>0</votos>');
      xmlParts.push(`        <porcentagem>${esc(activeBatalha.artista1_porcentagem ?? 50)}%</porcentagem>`);
      xmlParts.push(`        <capa_url>${esc(battleImage1Png)}</capa_url>`);
      xmlParts.push('      </musica_a>');
      xmlParts.push('      <musica_b>');
      xmlParts.push(`        <nome>${esc(activeBatalha.artista2_musica || "")}</nome>`);
      xmlParts.push(`        <artista>${esc(activeBatalha.artista2_nome || "")}</artista>`);
      xmlParts.push('        <votos>0</votos>');
      xmlParts.push(`        <porcentagem>${esc(activeBatalha.artista2_porcentagem ?? 50)}%</porcentagem>`);
      xmlParts.push(`        <capa_url>${esc(battleImage2Png)}</capa_url>`);
      xmlParts.push('      </musica_b>');
      xmlParts.push(`      <artista1_nome>${esc(activeBatalha.artista1_nome || "")}</artista1_nome>`);
      xmlParts.push(`      <artista1_musica>${esc(activeBatalha.artista1_musica || "")}</artista1_musica>`);
      xmlParts.push(`      <artista1_porcentagem>${esc(activeBatalha.artista1_porcentagem ?? 50)}%</artista1_porcentagem>`);
      xmlParts.push(`      <artista1_imagem>${esc(battleImage1Png)}</artista1_imagem>`);
      xmlParts.push(`      <artista2_nome>${esc(activeBatalha.artista2_nome || "")}</artista2_nome>`);
      xmlParts.push(`      <artista2_musica>${esc(activeBatalha.artista2_musica || "")}</artista2_musica>`);
      xmlParts.push(`      <artista2_porcentagem>${esc(activeBatalha.artista2_porcentagem ?? 50)}%</artista2_porcentagem>`);
      xmlParts.push(`      <artista2_imagem>${esc(battleImage2Png)}</artista2_imagem>`);
      xmlParts.push(`      <horario_inicio>${esc(activeBatalha.horario_inicio || "")}</horario_inicio>`);
      xmlParts.push(`      <horario_fim>${esc(activeBatalha.horario_fim || "")}</horario_fim>`);
      xmlParts.push('    </batalha>');
    } else {
      xmlParts.push('    <batalha ativa="0"></batalha>');
    }

    // Enquete
    if (activeEnquete) {
      xmlParts.push('    <enquete ativa="1">');
      xmlParts.push(`      <pergunta>${esc(activeEnquete.pergunta || "")}</pergunta>`);
      xmlParts.push(`      <opcao_a>${esc(activeEnquete.resposta1 || "Opção 1")}</opcao_a>`);
      xmlParts.push(`      <votos_a>0</votos_a>`);
      xmlParts.push(`      <opcao_b>${esc(activeEnquete.resposta2 || "Opção 2")}</opcao_b>`);
      xmlParts.push(`      <votos_b>0</votos_b>`);
      xmlParts.push(`      <resposta1>${esc(activeEnquete.resposta1 || "")}</resposta1>`);
      xmlParts.push(`      <resposta2>${esc(activeEnquete.resposta2 || "")}</resposta2>`);
      xmlParts.push(`      <resposta3>${esc(activeEnquete.resposta3 || "")}</resposta3>`);
      xmlParts.push(`      <resposta4>${esc(activeEnquete.resposta4 || "")}</resposta4>`);
      xmlParts.push(`      <resposta_correta>${esc(activeEnquete.resposta_correta || 1)}</resposta_correta>`);
      xmlParts.push(`      <horario_inicio>${esc(activeEnquete.horario_inicio || "")}</horario_inicio>`);
      xmlParts.push(`      <horario_fim>${esc(activeEnquete.horario_fim || "")}</horario_fim>`);
      xmlParts.push('    </enquete>');
    } else {
      xmlParts.push('    <enquete ativa="0"></enquete>');
    }

    // Quiz
    if (activeQuiz) {
      const corretaNum = Number(activeQuiz.resposta_correta) || 1;
      const corretaTexto =
        corretaNum === 1
          ? activeQuiz.resposta1
          : corretaNum === 2
          ? activeQuiz.resposta2
          : corretaNum === 3
          ? activeQuiz.resposta3
          : activeQuiz.resposta4;

      xmlParts.push('    <quiz ativo="1">');
      xmlParts.push(`      <pergunta>${esc(activeQuiz.pergunta || "")}</pergunta>`);
      xmlParts.push(`      <alternativa_a>${esc(activeQuiz.resposta1 || "")}</alternativa_a>`);
      xmlParts.push(`      <alternativa_b>${esc(activeQuiz.resposta2 || "")}</alternativa_b>`);
      xmlParts.push(`      <alternativa_c>${esc(activeQuiz.resposta3 || "")}</alternativa_c>`);
      xmlParts.push(`      <alternativa_d>${esc(activeQuiz.resposta4 || "")}</alternativa_d>`);
      xmlParts.push(`      <resposta1>${esc(activeQuiz.resposta1 || "")}</resposta1>`);
      xmlParts.push(`      <resposta2>${esc(activeQuiz.resposta2 || "")}</resposta2>`);
      xmlParts.push(`      <resposta3>${esc(activeQuiz.resposta3 || "")}</resposta3>`);
      xmlParts.push(`      <resposta4>${esc(activeQuiz.resposta4 || "")}</resposta4>`);
      xmlParts.push(`      <resposta_correta>${esc(activeQuiz.resposta_correta || 1)}</resposta_correta>`);
      xmlParts.push(`      <resposta_correta_texto>${esc(corretaTexto || "")}</resposta_correta_texto>`);
      xmlParts.push(`      <horario_inicio>${esc(activeQuiz.horario_inicio || "")}</horario_inicio>`);
      xmlParts.push(`      <horario_fim>${esc(activeQuiz.horario_fim || "")}</horario_fim>`);
      xmlParts.push(`      <explicacao>${esc(activeQuiz.explicacao || "")}</explicacao>`);
      xmlParts.push(`      <imagem_resposta>${esc(quizImagePng)}</imagem_resposta>`);
      xmlParts.push('    </quiz>');
    } else {
      xmlParts.push('    <quiz ativo="0"></quiz>');
    }

    xmlParts.push('  </interatividade>');

    // 6. TICKER / NOTÍCIAS
    xmlParts.push('  <ticker>');
    if (noticias.length > 0) {
      xmlParts.push('    <noticias>');
      noticias.forEach((noticia: any, idx: number) => {
        xmlParts.push(`      <noticia numero="${idx + 1}">`);
        xmlParts.push(`        <titulo>${esc(noticia.titulo || "")}</titulo>`);
        xmlParts.push(`        <descricao>${esc(noticia.descricao || "")}</descricao>`);
        xmlParts.push(`        <url>${esc(noticia.url || "")}</url>`);
        xmlParts.push(`        <criada_em>${esc(noticia.criada_em || "")}</criada_em>`);
        xmlParts.push('      </noticia>');
      });
      xmlParts.push('    </noticias>');
    }
    xmlParts.push('  </ticker>');

    // 7. PATROCINADORES / LOGOS
    xmlParts.push('  <patrocinadores>');
    xmlParts.push('    <programa_no_ar>');
    xmlParts.push(`      <programa_nome>${esc(onAirProgram?.nome || "")}</programa_nome>`);
    xmlParts.push(sponsorXml(selectedSponsor?.nome, sponsorLogoPng, "      "));
    xmlParts.push('    </programa_no_ar>');
    xmlParts.push('  </patrocinadores>');

    xmlParts.push('</geral>');

    return new Response(flattenGeralXml(xmlParts.join("\n")), {
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

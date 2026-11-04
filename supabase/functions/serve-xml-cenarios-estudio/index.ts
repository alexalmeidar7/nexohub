import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const xmlEscape = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toSeconds = (time: string) => {
  const [hour = "0", minute = "0", second = "0"] = String(time ?? "").split(":");
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second);
};

// delayMinutes atrasa o início efetivo do programa (positivo = considera "no ar"
// somente após N minutos do horário de início). Ex.: 1 min para atualização de cenário.
const isTimeInRange = (start: string, end: string, current: string, delayMinutes = 0) => {
  const startSeconds = toSeconds(start) + (delayMinutes * 60);
  const endSeconds = toSeconds(end);
  const currentSeconds = toSeconds(current);

  if (endSeconds <= startSeconds) {
    return currentSeconds >= startSeconds || currentSeconds < endSeconds;
  }

  return currentSeconds >= startSeconds && currentSeconds < endSeconds;
};

// Strip query string so URL ends in .png/.webp/.jpg (vMix compatibility),
// then append a stable cache-buster derived from updated_at so vMix reloads on change.
const withCacheBuster = (rawUrl: string, version?: string | null) => {
  if (!rawUrl) return "";
  const [base, ...queryParts] = rawUrl.split("?");
  if (!version) return rawUrl;
  // Preserve signed URLs and append the cache version without discarding auth parameters.
  const v = String(new Date(version).getTime() || version).slice(-10);
  const query = [...queryParts, "v=" + encodeURIComponent(v)].filter(Boolean).join("&");
  return base + "?" + query;
};

Deno.const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const xmlHeaders = {
    ...corsHeaders,
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid");
    if (!userId) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>uid required</error>`, {
        headers: xmlHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const wkShort = tzParts.find((p) => p.type === "weekday")?.value || "Sun";
    const hh = tzParts.find((p) => p.type === "hour")?.value || "00";
    const mm = tzParts.find((p) => p.type === "minute")?.value || "00";
    const ss = tzParts.find((p) => p.type === "second")?.value || "00";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const today = dayNames[dayMap[wkShort] ?? 0];
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayShort = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
    }).format(yesterdayDate);
    const yesterday = dayNames[dayMap[yesterdayShort] ?? 0];
    const nowTime = `${hh}:${mm}:${ss}`;
    const nowSeconds = toSeconds(nowTime);

    // Programa atualmente no ar (de acordo com a grade) — inclui capa, thumb, apresentadores
    const { data: progs, error: programsError } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, estudio, capa, thumb, apresentador_id, apresentadores_ids, created_at")
      .eq("user_id", userId)
      .eq("ativo", true)
      .order("horario_inicio", { ascending: false });
    if (programsError) throw programsError;

    // Try to find a match prioritizing Estudio FM (as it's the primary broadcast)
    const findOnAir = (allProgs: any[]) => {
      const candidates = (allProgs || []).filter((p: any) => {
        const startSeconds = toSeconds(p.horario_inicio);
        const endSeconds = toSeconds(p.horario_fim);
        const crossesMidnight = endSeconds <= startSeconds;

        // Depois da meia-noite, mantém no ar o programa iniciado no dia anterior.
        if (crossesMidnight && nowSeconds < endSeconds) {
          return (p.dias_semana || []).includes(yesterday);
        }

        return (p.dias_semana || []).includes(today) &&
          isTimeInRange(p.horario_inicio, p.horario_fim, nowTime, 1);
      });

      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];

      const fmMatch = candidates.find(p => p.estudio?.toLowerCase().includes("fm"));
      if (fmMatch) return fmMatch;
      return candidates[0];
    };

    const onAir = findOnAir(progs);

    // Buscar apresentador no ar (primeiro de apresentadores_ids, fallback para apresentador_id)
    let locutorNome = "";
    let locutorFoto = "";
    let locutorInstagram = "";
    let locutorCargo = "";
    if (onAir) {
      const apresentadorId =
        (onAir.apresentadores_ids && onAir.apresentadores_ids[0]) || onAir.apresentador_id;
      if (apresentadorId) {
        const { data: ap } = await supabase
          .from("apresentadores")
          .select("nome, foto, instagram, cargo")
          .eq("id", apresentadorId)
          .maybeSingle();
        if (ap) {
          locutorNome = ap.nome || "";
          locutorFoto = ap.foto || "";
          locutorInstagram = ap.instagram || "";
          locutorCargo = ap.cargo || "";
          if (locutorInstagram && !locutorInstagram.startsWith("@")) {
            locutorInstagram = `@${locutorInstagram}`;
          }
        }
      }
    }

    // Carrega TODOS os templates do usuário (para encontrar 2TVs e 4TVs vinculados ao programa no ar)
    const { data: grupos, error: gruposError } = await supabase
      .from("cenario_estudio_grupos")
      .select("id, nome, programa_ids, rows, cols, updated_at")
      .eq("user_id", userId)
      .order("created_at");
    if (gruposError) throw gruposError;

    const grupoIds = (grupos || []).map((g: any) => g.id);
    const arteByGrupo: Record<string, { url: string; updatedAt: string }> = {};
    if (grupoIds.length > 0) {
      const { data: tvs, error: tvsError } = await supabase
        .from("cenario_estudio_tvs")
        .select("grupo_id, posicao, imagem_url, updated_at")
        .in("grupo_id", grupoIds)
        .eq("posicao", 0);
      if (tvsError) throw tvsError;
      (tvs || []).forEach((t: any) => {
        arteByGrupo[t.grupo_id] = { url: t.imagem_url || "", updatedAt: t.updated_at };
      });
    }

    // Encontrar grupos vinculados ao programa no ar, separados por tamanho (2TVs / 4TVs)
    const findArte = (totalTvs: number): string => {
      if (!onAir) return "";
      const grupo = (grupos || []).find(
        (g: any) =>
          (g.rows || 1) * (g.cols || 1) === totalTvs &&
          (g.programa_ids || []).includes(onAir.id),
      );
      if (!grupo) return "";
      const arte = arteByGrupo[grupo.id];
      if (!arte || !arte.url) return "";
      return withCacheBuster(arte.url, arte.updatedAt || grupo.updated_at);
    };

    const [urlConvidadosRaw, urlAncoraRaw] = [findArte(4), findArte(2)];
    const [urlConvidados, urlAncora] = await Promise.all([
      ensureVmixPngUrl(supabase, urlConvidadosRaw, `vmix-cenarios/${userId}`),
      ensureVmixPngUrl(supabase, urlAncoraRaw, `vmix-cenarios/${userId}`),
    ]);

    // Cache-buster para capa/thumb do programa: usa created_at (não temos updated_at em programas)
    const programaVersion = (onAir as any)?.created_at || "";
    const capaUrl = withCacheBuster((onAir as any)?.capa || "", programaVersion);
    const thumbUrl = withCacheBuster((onAir as any)?.thumb || "", programaVersion);
    const [capaUrlPng, thumbUrlPng, fotoLocutorUrl] = await Promise.all([
      ensureVmixPngUrl(supabase, capaUrl, `vmix-cenarios/${userId}`),
      ensureVmixPngUrl(supabase, thumbUrl, `vmix-cenarios/${userId}`),
      ensureVmixPngUrl(supabase, withCacheBuster(locutorFoto, programaVersion), `vmix-cenarios/${userId}`),
    ]);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio>\n`;
    xml += `  <programa>\n`;
    xml += `    <id>${xmlEscape(onAir?.id || "")}</id>\n`;
    xml += `    <nome>${xmlEscape(onAir?.nome || "")}</nome>\n`;
    xml += `    <horario_inicio>${xmlEscape(onAir?.horario_inicio || "")}</horario_inicio>\n`;
    xml += `    <horario_fim>${xmlEscape(onAir?.horario_fim || "")}</horario_fim>\n`;
    xml += `    <capa>${xmlEscape(capaUrlPng)}</capa>\n`;
    xml += `    <thumb>${xmlEscape(thumbUrlPng)}</thumb>\n`;
    xml += `  </programa>\n`;
    xml += `  <locutor>\n`;
    xml += `    <nome>${xmlEscape(locutorNome)}</nome>\n`;
    xml += `    <foto>${xmlEscape(fotoLocutorUrl)}</foto>\n`;
    xml += `    <instagram>${xmlEscape(locutorInstagram)}</instagram>\n`;
    xml += `    <cargo>${xmlEscape(locutorCargo)}</cargo>\n`;
    xml += `  </locutor>\n`;
  xml += `  <templates>\n`;
    xml += `    <template>\n`;
    xml += `      <nome>TVS ATRAS CONVIDADOS</nome>\n`;
    xml += `      <url>${xmlEscape(urlConvidados)}</url>\n`;
    xml += `      <background_url>${xmlEscape(urlConvidados)}</background_url>\n`;
    xml += `    </template>\n`;
    xml += `    <template>\n`;
    xml += `      <nome>TVS ATRAS ANCORA</nome>\n`;
    xml += `      <url>${xmlEscape(urlAncora)}</url>\n`;
    xml += `      <background_url>${xmlEscape(urlAncora)}</background_url>\n`;
    xml += `    </template>\n`;
    xml += `  </templates>\n`;
    xml += `</cenarios_estudio>`;

    return new Response(xml, { headers: xmlHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(msg)}</error>`, {
      headers: xmlHeaders,
    });
  }
});

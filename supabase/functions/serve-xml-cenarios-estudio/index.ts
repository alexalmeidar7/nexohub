import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const isTimeInRange = (start: string, end: string, current: string) => {
  const startSeconds = toSeconds(start);
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
  const clean = rawUrl.split("?")[0];
  if (!version) return clean;
  // Use a short hash of the timestamp to keep URL tidy
  const v = String(new Date(version).getTime() || version).slice(-10);
  return `${clean}?v=${v}`;
};

Deno.serve(async (req) => {
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
    const nowTime = `${hh}:${mm}:${ss}`;

    // Programa atualmente no ar (de acordo com a grade) — inclui capa, thumb, apresentadores
    const { data: progs } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, estudio, capa, thumb, apresentador_id, apresentadores_ids, created_at")
      .eq("user_id", userId)
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio", { ascending: false });

    const onAir = (progs || []).find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        isTimeInRange(p.horario_inicio, p.horario_fim, nowTime),
    );

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

    // Carrega TODOS os templates do usuário
    const { data: grupos } = await supabase
      .from("cenario_estudio_grupos")
      .select("id, nome, programa_ids, updated_at")
      .eq("user_id", userId)
      .order("created_at");

    const grupoIds = (grupos || []).map((g: any) => g.id);
    const arteByGrupo: Record<string, { url: string; updatedAt: string }> = {};
    if (grupoIds.length > 0) {
      const { data: tvs } = await supabase
        .from("cenario_estudio_tvs")
        .select("grupo_id, posicao, imagem_url, updated_at")
        .in("grupo_id", grupoIds)
        .eq("posicao", 0);
      (tvs || []).forEach((t: any) => {
        arteByGrupo[t.grupo_id] = { url: t.imagem_url || "", updatedAt: t.updated_at };
      });
    }

    // Cache-buster para capa/thumb do programa: usa created_at (não temos updated_at em programas)
    const programaVersion = (onAir as any)?.created_at || "";
    const capaUrl = withCacheBuster((onAir as any)?.capa || "", programaVersion);
    const thumbUrl = withCacheBuster((onAir as any)?.thumb || "", programaVersion);
    const fotoLocutorUrl = withCacheBuster(locutorFoto, programaVersion);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio>\n`;
    xml += `  <programa>\n`;
    xml += `    <id>${xmlEscape(onAir?.id || "")}</id>\n`;
    xml += `    <nome>${xmlEscape(onAir?.nome || "")}</nome>\n`;
    xml += `    <horario_inicio>${xmlEscape(onAir?.horario_inicio || "")}</horario_inicio>\n`;
    xml += `    <horario_fim>${xmlEscape(onAir?.horario_fim || "")}</horario_fim>\n`;
    xml += `    <capa>${xmlEscape(capaUrl)}</capa>\n`;
    xml += `    <thumb>${xmlEscape(thumbUrl)}</thumb>\n`;
    xml += `  </programa>\n`;
    xml += `  <locutor>\n`;
    xml += `    <nome>${xmlEscape(locutorNome)}</nome>\n`;
    xml += `    <foto>${xmlEscape(fotoLocutorUrl)}</foto>\n`;
    xml += `    <instagram>${xmlEscape(locutorInstagram)}</instagram>\n`;
    xml += `    <cargo>${xmlEscape(locutorCargo)}</cargo>\n`;
    xml += `  </locutor>\n`;
    xml += `  <templates>\n`;
    for (const g of grupos || []) {
      // Apenas templates vinculados ao programa no ar enviam a URL da arte.
      // Templates não vinculados ao programa atual ficam com <url/> vazia.
      const vinculado = !!onAir && (g.programa_ids || []).includes(onAir.id);
      const arte = arteByGrupo[g.id];
      const urlOut = vinculado && arte
        ? withCacheBuster(arte.url, arte.updatedAt || g.updated_at)
        : "";
      xml += `    <template>\n`;
      xml += `      <nome>${xmlEscape(g.nome)}</nome>\n`;
      xml += `      <url>${xmlEscape(urlOut)}</url>\n`;
      xml += `    </template>\n`;
    }
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

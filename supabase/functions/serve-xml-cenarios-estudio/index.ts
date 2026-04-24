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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const xmlHeaders = { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" };

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

    // Programa atualmente no ar (de acordo com a grade)
    const { data: progs } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, estudio")
      .eq("user_id", userId)
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio", { ascending: false });

    const onAir = (progs || []).find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        isTimeInRange(p.horario_inicio, p.horario_fim, nowTime),
    );

    // Carrega TODOS os templates do usuário
    const { data: grupos } = await supabase
      .from("cenario_estudio_grupos")
      .select("id, nome, programa_ids")
      .eq("user_id", userId)
      .order("created_at");

    const grupoIds = (grupos || []).map((g: any) => g.id);
    const arteByGrupo: Record<string, string> = {};
    if (grupoIds.length > 0) {
      const { data: tvs } = await supabase
        .from("cenario_estudio_tvs")
        .select("grupo_id, posicao, imagem_url")
        .in("grupo_id", grupoIds)
        .eq("posicao", 0);
      (tvs || []).forEach((t: any) => {
        arteByGrupo[t.grupo_id] = t.imagem_url || "";
      });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio>\n`;
    xml += `  <programa>\n`;
    xml += `    <id>${xmlEscape(onAir?.id || "")}</id>\n`;
    xml += `    <nome>${xmlEscape(onAir?.nome || "")}</nome>\n`;
    xml += `    <horario_inicio>${xmlEscape(onAir?.horario_inicio || "")}</horario_inicio>\n`;
    xml += `    <horario_fim>${xmlEscape(onAir?.horario_fim || "")}</horario_fim>\n`;
    xml += `  </programa>\n`;
    xml += `  <templates>\n`;
    for (const g of grupos || []) {
      // Apenas templates vinculados ao programa no ar enviam a URL da arte.
      // Templates não vinculados ao programa atual ficam com <url/> vazia.
      const vinculado = !!onAir && (g.programa_ids || []).includes(onAir.id);
      let url = vinculado ? (arteByGrupo[g.id] || "") : "";
      // Strip query string so URL ends in .png (vMix compatibility)
      if (url) {
        url = url.split("?")[0];
      }
      xml += `    <template>\n`;
      xml += `      <nome>${xmlEscape(g.nome)}</nome>\n`;
      xml += `      <url>${xmlEscape(url)}</url>\n`;
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

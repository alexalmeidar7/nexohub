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

    const now = new Date();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const today = dayNames[now.getDay()];
    const nowTime = now.toTimeString().slice(0, 5);

    // Find current program
    const { data: progs } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo")
      .eq("user_id", userId)
      .eq("ativo", true);

    const onAir = (progs || []).find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        p.horario_inicio <= nowTime &&
        p.horario_fim > nowTime,
    );

    if (!onAir) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio><programa></programa><grupos /></cenarios_estudio>`,
        { headers: xmlHeaders },
      );
    }

    // Find groups linked to this program
    const { data: grupos } = await supabase
      .from("cenario_estudio_grupos")
      .select("id, nome, rows, cols")
      .eq("user_id", userId)
      .contains("programa_ids", [onAir.id]);

    const grupoIds = (grupos || []).map((g: any) => g.id);
    let tvsByGrupo: Record<string, any[]> = {};
    if (grupoIds.length > 0) {
      const { data: tvs } = await supabase
        .from("cenario_estudio_tvs")
        .select("grupo_id, posicao, imagem_url")
        .in("grupo_id", grupoIds)
        .order("posicao");
      (tvs || []).forEach((t: any) => {
        tvsByGrupo[t.grupo_id] = tvsByGrupo[t.grupo_id] || [];
        tvsByGrupo[t.grupo_id].push(t);
      });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio>\n`;
    xml += `  <programa>\n`;
    xml += `    <id>${xmlEscape(onAir.id)}</id>\n`;
    xml += `    <nome>${xmlEscape(onAir.nome)}</nome>\n`;
    xml += `  </programa>\n`;
    xml += `  <grupos>\n`;
    for (const g of grupos || []) {
      const tvs = tvsByGrupo[g.id] || [];
      xml += `    <grupo>\n`;
      xml += `      <id>${xmlEscape(g.id)}</id>\n`;
      xml += `      <nome>${xmlEscape(g.nome)}</nome>\n`;
      xml += `      <rows>${g.rows}</rows>\n`;
      xml += `      <cols>${g.cols}</cols>\n`;
      xml += `      <tvs>\n`;
      for (const tv of tvs) {
        xml += `        <tv>\n`;
        xml += `          <posicao>${tv.posicao}</posicao>\n`;
        xml += `          <imagem>${xmlEscape(tv.imagem_url)}</imagem>\n`;
        xml += `        </tv>\n`;
      }
      xml += `      </tvs>\n`;
      xml += `    </grupo>\n`;
    }
    xml += `  </grupos>\n`;
    xml += `</cenarios_estudio>`;

    return new Response(xml, { headers: xmlHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(msg)}</error>`, {
      headers: xmlHeaders,
    });
  }
});

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
      const arte = tvs.find((t: any) => t.posicao === 0)?.imagem_url || tvs[0]?.imagem_url || "";
      const rows = Number(g.rows) || 1;
      const cols = Number(g.cols) || 1;
      const total = rows * cols;
      xml += `    <grupo>\n`;
      xml += `      <id>${xmlEscape(g.id)}</id>\n`;
      xml += `      <nome>${xmlEscape(g.nome)}</nome>\n`;
      xml += `      <rows>${rows}</rows>\n`;
      xml += `      <cols>${cols}</cols>\n`;
      xml += `      <arte>${xmlEscape(arte)}</arte>\n`;
      xml += `      <tvs>\n`;
      for (let pos = 0; pos < total; pos++) {
        const row = Math.floor(pos / cols);
        const col = pos % cols;
        const bgSizeX = cols * 100;
        const bgSizeY = rows * 100;
        const posX = cols > 1 ? (col / (cols - 1)) * 100 : 50;
        const posY = rows > 1 ? (row / (rows - 1)) * 100 : 50;
        xml += `        <tv>\n`;
        xml += `          <posicao>${pos}</posicao>\n`;
        xml += `          <row>${row}</row>\n`;
        xml += `          <col>${col}</col>\n`;
        xml += `          <imagem>${xmlEscape(arte)}</imagem>\n`;
        xml += `          <slice_size_x>${bgSizeX}</slice_size_x>\n`;
        xml += `          <slice_size_y>${bgSizeY}</slice_size_y>\n`;
        xml += `          <slice_pos_x>${posX}</slice_pos_x>\n`;
        xml += `          <slice_pos_y>${posY}</slice_pos_y>\n`;
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

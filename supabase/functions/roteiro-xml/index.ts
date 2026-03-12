import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const roteiroId = url.searchParams.get("id");

    if (!roteiroId) {
      return new Response("<error>id parameter is required</error>", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch roteiro
    const { data: roteiro, error } = await supabase
      .from("roteiros")
      .select("titulo, subtitulo, participantes, programa_nome, user_id")
      .eq("id", roteiroId)
      .maybeSingle();

    if (error || !roteiro) {
      return new Response("<error>Roteiro not found</error>", {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    // Fetch program logo (capa/selo) by matching programa_nome + user_id
    const { data: programa } = await supabase
      .from("programas")
      .select("capa, selo, nome")
      .eq("user_id", roteiro.user_id)
      .eq("nome", roteiro.programa_nome)
      .maybeSingle();

    // Parse participantes
    let participantes: { nome: string; categoria?: string; cargo?: string; instagram?: string }[] = [];
    try {
      participantes = typeof roteiro.participantes === "string"
        ? JSON.parse(roteiro.participantes)
        : roteiro.participantes || [];
    } catch {
      participantes = [];
    }

    const logoUrl = programa?.selo || programa?.capa || "";

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<roteiro>\n`;
    xml += `  <titulo>${escapeXml(roteiro.titulo || "")}</titulo>\n`;
    xml += `  <subtitulo>${escapeXml(roteiro.subtitulo || "")}</subtitulo>\n`;
    xml += `  <programa>${escapeXml(roteiro.programa_nome || "")}</programa>\n`;
    xml += `  <logo_url>${escapeXml(logoUrl)}</logo_url>\n`;
    xml += `  <participantes>\n`;
    for (const p of participantes) {
      xml += `    <participante>\n`;
      xml += `      <nome>${escapeXml(p.nome || "")}</nome>\n`;
      if (p.categoria) xml += `      <categoria>${escapeXml(p.categoria)}</categoria>\n`;
      if (p.cargo) xml += `      <cargo>${escapeXml(p.cargo)}</cargo>\n`;
      if (p.instagram) xml += `      <instagram>${escapeXml(p.instagram)}</instagram>\n`;
      xml += `    </participante>\n`;
    }
    xml += `  </participantes>\n`;
    xml += `</roteiro>`;

    return new Response(xml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`<error>${String(err)}</error>`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});

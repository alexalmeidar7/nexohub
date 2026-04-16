import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>',
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch active, non-excluded logos for the user
    const { data: logos, error: logosErr } = await supabase
      .from("logos_patrocinadores")
      .select("programa_id, logo_url, nome")
      .eq("user_id", userId)
      .eq("ativo", true)
      .eq("excluido", false);

    if (logosErr) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><error>${logosErr.message}</error>`,
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    // Fetch ALL active programs for the user (so programs without sponsors get the default logo)
    const { data: programas } = await supabase
      .from("programas")
      .select("id, nome")
      .eq("user_id", userId)
      .eq("ativo", true);

    const origin = `${url.protocol}//${url.host}`;
    const DEFAULT_LOGO_URL = `https://nexohub.lovable.app/default-sponsor-logo.png`;

    // Group logos by programa, using default when none exist
    const grouped: { programaId: string; programaNome: string; logos: { nome: string; logo_url: string }[] }[] = [];
    for (const p of programas || []) {
      const gl = (logos || []).filter((l) => l.programa_id === p.id);
      if (gl.length > 0) {
        grouped.push({ programaId: p.id, programaNome: p.nome, logos: gl });
      } else {
        grouped.push({
          programaId: p.id,
          programaNome: p.nome,
          logos: [{ nome: "Default", logo_url: DEFAULT_LOGO_URL }],
        });
      }
    }

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const items = grouped
      .map(
        (g, idx) =>
          `  <programa id="programa ${idx + 1}">
    <nome>${esc(g.programaNome)}</nome>
${g.logos!
  .map(
    (l) =>
      `    <logo>
      <nome>${esc(l.nome)}</nome>
      <url>${esc(l.logo_url)}</url>
    </logo>`
  )
  .join("\n")}
  </programa>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<logos_patrocinadores>
${items}
</logos_patrocinadores>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${err.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});

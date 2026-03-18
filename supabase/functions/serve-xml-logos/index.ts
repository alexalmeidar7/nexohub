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

    // Get unique programa_ids
    const programaIds = [...new Set((logos || []).map((l) => l.programa_id))];

    // Fetch programa names
    const { data: programas } = await supabase
      .from("programas")
      .select("id, nome")
      .in("id", programaIds.length > 0 ? programaIds : ["00000000-0000-0000-0000-000000000000"]);

    const programaMap = new Map((programas || []).map((p) => [p.id, p.nome]));

    // Group logos by programa
    const grouped: { programaId: string; programaNome: string; logos: typeof logos }[] = [];
    for (const pid of programaIds) {
      const nome = programaMap.get(pid) || "Sem programa";
      const gl = (logos || []).filter((l) => l.programa_id === pid);
      if (gl.length > 0) {
        grouped.push({ programaId: pid, programaNome: nome, logos: gl });
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

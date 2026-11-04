const serve = Deno.serve;
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

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
    const supabase = createClient(supabaseUrl, serviceKey, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });

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

    // Fetch ALL active programs for the user, ordered by creation date
    // to ensure stable XML positions (programa 1, programa 2, etc never change)
    const { data: programas, error: programasErr } = await supabase
      .from("programas")
      .select("id, nome, created_at")
      .eq("user_id", userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (programasErr) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><error>Não foi possível carregar os programas</error>',
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const origin = `${url.protocol}//${url.host}`;
    const pngGrouped = await Promise.all(grouped.map(async (group) => ({
      ...group,
      logos: await Promise.all(group.logos.map(async (logo) => ({
        ...logo,
        logo_url: await ensureVmixPngUrl(supabase, logo.logo_url, `vmix-logos/${userId}`),
      }))),
    })));
    // Sem imagem padrão: não referenciar o domínio legado Lovable.
    const DEFAULT_LOGO_URL = "";

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
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\'/g, "&apos;");

    const items = pngGrouped
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
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${(err as Error).message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});

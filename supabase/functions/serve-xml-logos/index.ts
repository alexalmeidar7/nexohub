import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";
import { rotationTime, selectOnAirProgram, selectRotatingSponsor, sponsorXml } from "../_shared/sponsorRotation.ts";

const serve = Deno.serve;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

const esc = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const headers = {
    ...corsHeaders,
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  try {
    const url = new URL(req.url);
    const requestedUserId = url.searchParams.get("user_id") || url.searchParams.get("uid") || "";
    if (!requestedUserId) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>', { status: 400, headers });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: subUser, error: subUserError } = await supabase.from("sub_users")
      .select("parent_user_id, ativo").eq("auth_user_id", requestedUserId).maybeSingle();
    if (subUserError) throw subUserError;
    const userId = subUser?.ativo && subUser.parent_user_id ? subUser.parent_user_id : requestedUserId;
    const now = new Date();
    const { today } = rotationTime(now);

    const { data: programas, error: programError } = await supabase.from("programas")
      .select("id, nome, estudio, dias_semana, horario_inicio, horario_fim, ativo")
      .eq("user_id", userId).eq("ativo", true).order("horario_inicio", { ascending: true });
    if (programError) throw programError;

    const onAir = selectOnAirProgram(programas || [], now);

    let sponsorLogos: any[] = [];
    if (onAir) {
      const { data, error } = await supabase.from("logos_patrocinadores")
        .select("id, nome, logo_url, programa_id, data_final, created_at")
        .eq("user_id", userId).eq("programa_id", onAir.id)
        .eq("ativo", true).eq("excluido", false)
        .gte("data_final", today)
        .order("created_at", { ascending: true });
      if (error) throw error;
      sponsorLogos = data || [];
    }

    const selected = selectRotatingSponsor(sponsorLogos, onAir?.id || null, now);
    let logoUrl = "";
    if (selected?.logo_url) {
      const pngUrl = await ensureVmixPngUrl(supabase, selected.logo_url, `vmix-logos/${userId}`);
      if (pngUrl) logoUrl = pngUrl.split(/[?#]/)[0];
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<estudio>
  <programa_no_ar>
    <nome>${esc(onAir?.nome || "")}</nome>
    <estudio>${esc(onAir?.estudio || "")}</estudio>
${sponsorXml(selected?.nome, logoUrl, "    ")}
    <intervalo_atualizacao>5</intervalo_atualizacao>
    <atualizado_em>${now.toISOString()}</atualizado_em>
  </programa_no_ar>
</estudio>`;

    return new Response(xml, { headers });
  } catch (error) {
    console.error("[serve-xml-logos] error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${esc(error instanceof Error ? error.message : String(error))}</error>`,
      { status: 500, headers },
    );
  }
});

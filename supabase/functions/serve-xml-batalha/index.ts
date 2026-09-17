import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const SLUG_TO_UID: Record<string, string> = {
  positivafm: "d17e65af-e407-466f-9b60-b55c43399513",
  positiva: "d17e65af-e407-466f-9b60-b55c43399513",
  p: "d17e65af-e407-466f-9b60-b55c43399513",
  sub_positiva_opec: "d17e65af-e407-466f-9b60-b55c43399513",
  interativafm: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  interativa: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  transmissao: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  jornal: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  culturafm973: "66337743-4e4f-4950-b58f-750b0c76861e",
  cultura: "66337743-4e4f-4950-b58f-750b0c76861e",
  alex: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawUserId = url.searchParams.get("user_id") || "";
    const rawSlug = url.searchParams.get("slug") || "";

    const cleanInput = (rawUserId || rawSlug).toLowerCase().trim();
    const resolvedUid = SLUG_TO_UID[cleanInput] || rawUserId || "d17e65af-e407-466f-9b60-b55c43399513";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Get current date and time in America/Sao_Paulo (Brasília)
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const currentTime = `${getPart("hour")}:${getPart("minute")}`;

    console.log(`[serve-xml-batalha] Checking for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    // Query scheduled battles for today
    const { data: list, error: queryErr } = await sb
      .from("batalhas_agendadas")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_batalha", today)
      .order("horario_inicio", { ascending: false });

    if (queryErr) {
      console.warn("[serve-xml-batalha] query error:", queryErr.message);
    }

    // Filter by time window (supporting midnight crossing)
    const scheduled = (list || []).find((b: any) => {
      const start = (b.horario_inicio || "00:00").slice(0, 5);
      const end = (b.horario_fim || "23:59").slice(0, 5);
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    let nome1 = "", musica1 = "", pct1 = "", img1 = "";
    let nome2 = "", musica2 = "", pct2 = "", img2 = "";
    let ini = "", fim = "";

    if (scheduled) {
      nome1 = scheduled.artista1_nome ?? "";
      musica1 = scheduled.artista1_musica ?? "";
      pct1 = scheduled.artista1_porcentagem !== undefined && scheduled.artista1_porcentagem !== null ? `${scheduled.artista1_porcentagem}%` : "50%";
      img1 = scheduled.artista1_imagem ?? "";
      nome2 = scheduled.artista2_nome ?? "";
      musica2 = scheduled.artista2_musica ?? "";
      pct2 = scheduled.artista2_porcentagem !== undefined && scheduled.artista2_porcentagem !== null ? `${scheduled.artista2_porcentagem}%` : "50%";
      img2 = scheduled.artista2_imagem ?? "";
      ini = scheduled.horario_inicio ?? "";
      fim = scheduled.horario_fim ?? "";
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome>${esc(nome1)}</artista1_nome>
    <artista1_musica>${esc(musica1)}</artista1_musica>
    <artista1_porcentagem>${esc(pct1)}</artista1_porcentagem>
    <artista1_imagem>${esc(img1)}</artista1_imagem>
    <artista2_nome>${esc(nome2)}</artista2_nome>
    <artista2_musica>${esc(musica2)}</artista2_musica>
    <artista2_porcentagem>${esc(pct2)}</artista2_porcentagem>
    <artista2_imagem>${esc(img2)}</artista2_imagem>
    <horario_inicio>${esc(ini)}</horario_inicio>
    <horario_fim>${esc(fim)}</horario_fim>
  </batalha>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store",
        "CDN-Cache-Control": "no-store",
        "Vary": "*",
        "Last-Modified": new Date().toUTCString(),
        "ETag": `"${Date.now()}"`,
      },
    });
  } catch (err: any) {
    console.error("[serve-xml-batalha] Error:", err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(err?.message || "internal error")}</error>`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});

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

    // Get current date and time in America/Sao_Paulo
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
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;
    
    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const currentTime = `${getPart("hour")}:${getPart("minute")}`;
    
    console.log(`[serve-xml-enquete] Checking for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    // Query scheduled enquetes for today
    const { data: list, error: queryErr } = await sb
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_enquete", today)
      .order("horario_inicio", { ascending: false });

    if (queryErr) {
      console.warn("[serve-xml-enquete] query error:", queryErr.message);
    }

    // Filter by time window (including cross-midnight)
    const scheduled = (list || []).find((e: any) => {
      const start = (e.horario_inicio || "00:00").slice(0, 5);
      const end = (e.horario_fim || "23:59").slice(0, 5);
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    let pergunta = "", r1 = "", r2 = "", r3 = "", r4 = "";
    let correta = 1, ini = "", fim = "";

    if (scheduled) {
      pergunta = scheduled.pergunta ?? "";
      r1 = scheduled.resposta1 ?? "";
      r2 = scheduled.resposta2 ?? "";
      r3 = scheduled.resposta3 ?? "";
      r4 = scheduled.resposta4 ?? "";
      correta = scheduled.resposta_correta ?? 1;
      ini = scheduled.horario_inicio ?? "";
      fim = scheduled.horario_fim ?? "";
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta>${esc(pergunta)}</pergunta>
    <resposta1>${esc(r1)}</resposta1>
    <resposta2>${esc(r2)}</resposta2>
    <resposta3>${esc(r3)}</resposta3>
    <resposta4>${esc(r4)}</resposta4>
    <resposta_correta>${esc(correta)}</resposta_correta>
    <horario_inicio>${esc(ini)}</horario_inicio>
    <horario_fim>${esc(fim)}</horario_fim>
  </enquete>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("<error>internal error</error>", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response("<error>user_id required</error>", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

    const { data: scheduled } = await sb
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", userId)
      .eq("data_enquete", today)
      .lte("horario_inicio", currentTime)
      .gte("horario_fim", currentTime)
      .order("horario_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();

    let pergunta = "", r1 = "", r2 = "";
    let correta = 0;

    if (scheduled) {
      pergunta = scheduled.pergunta ?? "";
      r1 = scheduled.resposta1 ?? "";
      r2 = scheduled.resposta2 ?? "";
      correta = scheduled.resposta_correta ?? 0;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta>${esc(pergunta)}</pergunta>
    <resposta1>${esc(r1)}</resposta1>
    <resposta2>${esc(r2)}</resposta2>
    <resposta_correta>${esc(correta >= 1 && correta <= 2 ? [r1, r2][correta - 1] : "")}</resposta_correta>
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

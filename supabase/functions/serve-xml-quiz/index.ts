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

    console.log(`[serve-xml-quiz] Checking for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    const { data: list, error: queryErr } = await sb
      .from("quiz_agendados")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_quiz", today)
      .order("created_at", { ascending: false });

    if (queryErr) {
      console.warn("[serve-xml-quiz] query error:", queryErr.message);
    }

    // Filter by time window (including cross-midnight)
    const quiz = (list || []).find((q: any) => {
      const start = (q.horario_inicio || "00:00").slice(0, 5);
      const end = (q.horario_fim || "23:59").slice(0, 5);
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<items>\n  <dados>\n';
    if (quiz) {
      const respostaCorretaNum = Number(quiz.resposta_correta) || 1;
      const respostaCorretaTexto =
        respostaCorretaNum === 1
          ? quiz.resposta1
          : respostaCorretaNum === 2
          ? quiz.resposta2
          : respostaCorretaNum === 3
          ? quiz.resposta3
          : quiz.resposta4;

      xml += `    <pergunta>${esc(quiz.pergunta)}</pergunta>\n`;
      xml += `    <resposta1>${esc(quiz.resposta1)}</resposta1>\n`;
      xml += `    <resposta2>${esc(quiz.resposta2)}</resposta2>\n`;
      xml += `    <resposta3>${esc(quiz.resposta3 || "")}</resposta3>\n`;
      xml += `    <resposta4>${esc(quiz.resposta4 || "")}</resposta4>\n`;
      xml += `    <resposta_correta>${esc(quiz.resposta_correta || 1)}</resposta_correta>\n`;
      xml += `    <resposta_correta_texto>${esc(respostaCorretaTexto || "")}</resposta_correta_texto>\n`;
      xml += `    <horario_inicio>${esc(quiz.horario_inicio || "")}</horario_inicio>\n`;
      xml += `    <horario_fim>${esc(quiz.horario_fim || "")}</horario_fim>\n`;
      xml += `    <explicacao>${esc(quiz.explicacao || "")}</explicacao>\n`;
      xml += `    <imagem_resposta>${esc(quiz.imagem_resposta || "")}</imagem_resposta>\n`;
    } else {
      xml += `    <pergunta></pergunta>\n`;
      xml += `    <resposta1></resposta1>\n`;
      xml += `    <resposta2></resposta2>\n`;
      xml += `    <resposta3></resposta3>\n`;
      xml += `    <resposta4></resposta4>\n`;
      xml += `    <resposta_correta></resposta_correta>\n`;
      xml += `    <resposta_correta_texto></resposta_correta_texto>\n`;
      xml += `    <horario_inicio></horario_inicio>\n`;
      xml += `    <horario_fim></horario_fim>\n`;
      xml += `    <explicacao></explicacao>\n`;
      xml += `    <imagem_resposta></imagem_resposta>\n`;
    }
    xml += `  </dados>\n</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("<items><dados><erro>internal error</erro></dados></items>", {
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      status: 500,
    });
  }
});

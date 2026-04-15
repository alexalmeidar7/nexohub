import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return new Response("<items><dados><erro>user_id required</erro></dados></items>", {
        headers: { ...corsHeaders, "Content-Type": "application/xml", "Cache-Control": "no-store" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

    const { data: quizzes } = await supabase
      .from("quiz_agendados")
      .select("*")
      .eq("user_id", userId)
      .eq("data_quiz", today)
      .lte("horario_inicio", currentTime)
      .gte("horario_fim", currentTime)
      .order("created_at", { ascending: false })
      .limit(1);

    const quiz = quizzes?.[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<items>\n  <dados>\n';
    if (quiz) {
      xml += `    <pergunta>${escapeXml(quiz.pergunta)}</pergunta>\n`;
      xml += `    <resposta1>${escapeXml(quiz.resposta1)}</resposta1>\n`;
      xml += `    <resposta2>${escapeXml(quiz.resposta2)}</resposta2>\n`;
      xml += `    <resposta3>${escapeXml(quiz.resposta3)}</resposta3>\n`;
      xml += `    <resposta4>${escapeXml(quiz.resposta4)}</resposta4>\n`;
      xml += `    <resposta_correta>${quiz.resposta_correta}</resposta_correta>\n`;
      xml += `    <horario_inicio>${escapeXml(quiz.horario_inicio)}</horario_inicio>\n`;
      xml += `    <horario_fim>${escapeXml(quiz.horario_fim)}</horario_fim>\n`;
      xml += `    <explicacao>${escapeXml(quiz.explicacao || '')}</explicacao>\n`;
      xml += `    <imagem_resposta>${escapeXml(quiz.imagem_resposta || '')}</imagem_resposta>\n`;
    } else {
      xml += `    <pergunta></pergunta>\n`;
      xml += `    <resposta1></resposta1>\n`;
      xml += `    <resposta2></resposta2>\n`;
      xml += `    <resposta3></resposta3>\n`;
      xml += `    <resposta4></resposta4>\n`;
      xml += `    <resposta_correta></resposta_correta>\n`;
      xml += `    <horario_inicio></horario_inicio>\n`;
      xml += `    <horario_fim></horario_fim>\n`;
      xml += `    <explicacao></explicacao>\n`;
      xml += `    <imagem_resposta></imagem_resposta>\n`;
    }
    xml += `  </dados>\n</items>`;

    return new Response(xml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("<items><dados><erro>internal error</erro></dados></items>", {
      headers: { ...corsHeaders, "Content-Type": "application/xml", "Cache-Control": "no-store" },
      status: 500,
    });
  }
});

function escapeXml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

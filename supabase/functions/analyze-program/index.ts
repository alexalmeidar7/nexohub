import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_RESULT = {
  keywords: [],
  classificacao: "Livre",
  justificativa: "Classificação padrão aplicada.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { nome, descricao, tipo_programa } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return jsonResponse(DEFAULT_RESULT);
    }

    const prompt = `Analise o seguinte programa de rádio/TV e retorne APENAS um JSON com: keywords (array de strings, máx 5), classificacao (uma de: Livre, 10, 12, 14, 16, 18), justificativa (uma frase curta).

Nome: ${nome || "Sem nome"}
Descrição: ${descricao || "Sem descrição"}
Tipo: ${tipo_programa || "Geral"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um classificador de conteúdo de mídia brasileiro. Responda APENAS com JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return jsonResponse(DEFAULT_RESULT);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return jsonResponse({
        keywords: parsed.keywords || [],
        classificacao: parsed.classificacao || "Livre",
        justificativa: parsed.justificativa || "Classificação padrão aplicada.",
      });
    } catch {
      console.error("Failed to parse AI response:", text);
      return jsonResponse(DEFAULT_RESULT);
    }
  } catch (e) {
    console.error("analyze-program error:", e);
    return jsonResponse(DEFAULT_RESULT);
  }
});

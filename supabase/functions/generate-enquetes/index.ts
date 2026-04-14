import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { categoria } = await req.json();
    if (!categoria) {
      return new Response(JSON.stringify({ error: "categoria required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use day of year as seed so quizzes change daily
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

    const prompt = `Gere exatamente 5 perguntas de quiz sobre o tema "${categoria}" para um programa de rádio brasileiro. Cada pergunta deve ter 4 opções de resposta e indicar qual é a correta (1-4). Use a semente do dia ${dayOfYear} para variar as perguntas. Responda APENAS com um array JSON válido no formato:
[{"pergunta":"...","respostas":["op1","op2","op3","op4"],"correta":1}]
Sem explicação, sem markdown, apenas o JSON.`;

    const aiGatewayUrl = Deno.env.get("AI_GATEWAY_URL") || "https://ai-gateway.lovable.dev";

    const response = await fetch(`${aiGatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-project-id": Deno.env.get("LOVABLE_PROJECT_ID") || "",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const quizzes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return new Response(JSON.stringify(quizzes), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "failed to generate" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

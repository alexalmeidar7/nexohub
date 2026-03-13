import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { nome, descricao } = await req.json();
    if (!descricao || descricao.trim().length === 0) {
      return new Response(
        JSON.stringify({ keywords: [], classificacao: "Livre", justificativa: "Sem descrição disponível para análise." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Você é um classificador de programas de rádio e TV brasileiros. Analise a descrição do programa e retorne:
1. Exatamente 3 palavras-chave em português que melhor representem o conteúdo (ex: prêmios, músicas, versão, jornalístico, informação, notícias, entretenimento, esporte, humor, debate, cultura, educação, religião, variedades).
2. A classificação etária apropriada segundo os critérios brasileiros:
   - "Livre": Conteúdo adequado para todos os públicos
   - "6": Não recomendado para menores de 6 anos - transição cognitiva, angústia leve
   - "10": Não recomendado para menores de 10 - violência fantasiosa, palavrões leves
   - "12": Não recomendado para menores de 12 - violência moderada, drogas lícitas
   - "14": Não recomendado para menores de 14 - violência intensa, sexo implícito
   - "16": Não recomendado para menores de 16 - violência intensa, conteúdo sexual
   - "18": Não recomendado para menores de 18 - violência extrema, sexo explícito
3. Uma justificativa breve (1-2 frases) para a classificação escolhida.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Programa: "${nome || "Sem nome"}"\nDescrição: "${descricao}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_program",
              description: "Classifica um programa com palavras-chave e faixa etária.",
              parameters: {
                type: "object",
                properties: {
                  keywords: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exatamente 3 palavras-chave representativas do conteúdo.",
                  },
                  classificacao: {
                    type: "string",
                    enum: ["Livre", "6", "10", "12", "14", "16", "18"],
                    description: "Classificação etária do programa.",
                  },
                  justificativa: {
                    type: "string",
                    description: "Justificativa breve para a classificação etária.",
                  },
                },
                required: ["keywords", "classificacao", "justificativa"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_program" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para análise por IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ keywords: [], classificacao: "Livre", justificativa: "Não foi possível analisar." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-program error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_RESULT = {
  keywords: [] as string[],
  classificacao: "Livre",
  justificativa: "Análise indisponível no momento. Classificação padrão aplicada.",
};

const CLASSIFICACOES_VALIDAS = new Set(["Livre", "6", "10", "12", "14", "16", "18"]);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { nome, descricao } = await req.json();

    if (!descricao || descricao.trim().length === 0) {
      return jsonResponse({
        keywords: [],
        classificacao: "Livre",
        justificativa: "Sem descrição disponível para análise.",
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY is missing. Returning graceful fallback.");
      return jsonResponse(DEFAULT_RESULT);
    }

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
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 402) {
        return jsonResponse({
          ...DEFAULT_RESULT,
          justificativa: "Análise por IA temporariamente indisponível por limite de créditos.",
        });
      }

      if (response.status === 429) {
        return jsonResponse({
          ...DEFAULT_RESULT,
          justificativa: "Análise por IA temporariamente indisponível por limite de requisições.",
        });
      }

      return jsonResponse(DEFAULT_RESULT);
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return jsonResponse(DEFAULT_RESULT);
    }

    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      const keywords = Array.isArray(parsed?.keywords)
        ? parsed.keywords
            .filter((k: unknown) => typeof k === "string")
            .map((k: string) => k.trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      const classificacao = CLASSIFICACOES_VALIDAS.has(parsed?.classificacao)
        ? parsed.classificacao
        : "Livre";

      const justificativa =
        typeof parsed?.justificativa === "string" && parsed.justificativa.trim().length > 0
          ? parsed.justificativa.trim()
          : DEFAULT_RESULT.justificativa;

      return jsonResponse({ keywords, classificacao, justificativa });
    } catch (parseError) {
      console.error("Failed to parse AI tool arguments:", parseError);
      return jsonResponse(DEFAULT_RESULT);
    }
  } catch (e) {
    console.error("analyze-program error:", e);
    return jsonResponse(DEFAULT_RESULT);
  }
});

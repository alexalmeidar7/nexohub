import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function searchWikipediaImage(query: string): Promise<string> {
  try {
    // Search Wikipedia for the query
    const searchUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail?.source) {
        // Get a larger version by replacing size in URL
        return data.thumbnail.source.replace(/\/\d+px-/, "/500px-");
      }
      if (data.originalimage?.source) {
        return data.originalimage.source;
      }
    }

    // Fallback: search via Wikipedia opensearch
    const openSearchUrl = `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500&redirects=1`;
    const res2 = await fetch(openSearchUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (res2.ok) {
      const data2 = await res2.json();
      const pages = data2.query?.pages;
      if (pages) {
        for (const page of Object.values(pages) as any[]) {
          if (page.thumbnail?.source) return page.thumbnail.source;
        }
      }
    }

    // Last fallback: search with broader terms
    const searchApiUrl = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=pageimages&format=json&pithumbsize=500`;
    const res3 = await fetch(searchApiUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (res3.ok) {
      const data3 = await res3.json();
      const pages3 = data3.query?.pages;
      if (pages3) {
        for (const page of Object.values(pages3) as any[]) {
          if (page.thumbnail?.source) return page.thumbnail.source;
        }
      }
    }
  } catch (e) {
    console.error("Wikipedia image search error:", e);
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pergunta, resposta_correta_texto } = await req.json();
    if (!pergunta || !resposta_correta_texto) {
      return new Response(JSON.stringify({ error: "pergunta and resposta_correta_texto required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Generate explanation text
    const explPrompt = `Para um quiz de rádio brasileiro, a pergunta é: "${pergunta}" e a resposta correta é: "${resposta_correta_texto}".
Forneça um texto curto de NO MÁXIMO 3 linhas explicando por que essa é a resposta correta.
Responda APENAS com JSON válido no formato: {"explicacao":"..."}
Sem explicação adicional, sem markdown, apenas o JSON.`;

    const explResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: explPrompt }],
        temperature: 0.5,
      }),
    });

    let explicacao = "";
    if (explResponse.ok) {
      const data = await explResponse.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          explicacao = parsed.explicacao || "";
        } catch {}
      }
    }

    // Step 2: Search Wikipedia for image (FREE, no cost)
    const imagem_url = await searchWikipediaImage(resposta_correta_texto);

    return new Response(JSON.stringify({ explicacao, imagem_url }), {
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

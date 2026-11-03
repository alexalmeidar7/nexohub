import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function searchWikipediaImages(query: string): Promise<string[]> {
  const results: string[] = [];
  const seen = new Set<string>();
  const add = (url?: string) => {
    if (!url) return;
    const big = url.replace(/\/\d+px-/, "/500px-");
    if (!seen.has(big)) {
      seen.add(big);
      results.push(big);
    }
  };

  try {
    const summaryUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const r1 = await fetch(summaryUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (r1.ok) {
      const d = await r1.json();
      add(d.thumbnail?.source);
      add(d.originalimage?.source);
    }
  } catch {}

  try {
    const searchApiUrl = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=pageimages&format=json&pithumbsize=500`;
    const r2 = await fetch(searchApiUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (r2.ok) {
      const d = await r2.json();
      const pages = d.query?.pages;
      if (pages) {
        for (const page of Object.values(pages) as any[]) {
          add(page.thumbnail?.source);
        }
      }
    }
  } catch {}

  try {
    const enUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=pageimages&format=json&pithumbsize=500`;
    const r3 = await fetch(enUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (r3.ok) {
      const d = await r3.json();
      const pages = d.query?.pages;
      if (pages) {
        for (const page of Object.values(pages) as any[]) {
          add(page.thumbnail?.source);
        }
      }
    }
  } catch {}

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));

    const { pergunta, resposta_correta_texto, skip = 0, only_image = false } = body || {};

    if (!resposta_correta_texto) {
      return new Response(JSON.stringify({ error: "resposta_correta_texto required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Image-only mode: just return alternative images
    if (only_image) {
      const images = await searchWikipediaImages(resposta_correta_texto);
      const idx = Number(skip) || 0;
      const imagem_url = images.length ? images[idx % images.length] : "";
      return new Response(JSON.stringify({ imagem_url, total: images.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pergunta) {
      return new Response(JSON.stringify({ error: "pergunta required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const explPrompt = `Para um quiz de rádio brasileiro, a pergunta é: "${pergunta}" e a resposta correta é: "${resposta_correta_texto}".
Forneça um texto curto de NO MÁXIMO 3 linhas explicando por que essa é a resposta correta.
Responda APENAS com JSON válido no formato: {"explicacao":"..."}
Sem explicação adicional, sem markdown, apenas o JSON.`;

    const explResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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

    const images = await searchWikipediaImages(resposta_correta_texto);
    const imagem_url = images[0] || "";

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

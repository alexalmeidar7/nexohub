import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function searchWikipediaImage(query: string): Promise<string> {
  try {
    const searchUrl = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": "NexoHub/1.0" } });
    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail?.source) {
        return data.thumbnail.source.replace(/\/\d+px-/, "/500px-");
      }
      if (data.originalimage?.source) return data.originalimage.source;
    }

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

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { categoria } = await req.json();

    if (!categoria) {
      return new Response(JSON.stringify({ error: "categoria required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

    const prompt = `Gere exatamente 5 perguntas de quiz sobre o tema "${categoria}" para um programa de rádio brasileiro. Cada pergunta deve ter exatamente 4 opções de resposta (uma correta e três erradas) e indicar qual é a correta (1, 2, 3 ou 4). Para cada pergunta, inclua também:
- "explicacao": um texto curto de NO MÁXIMO 3 linhas explicando a resposta correta

Use a semente do dia ${dayOfYear} para variar as perguntas. Responda APENAS com um array JSON válido no formato:
[{"pergunta":"...","respostas":["opção correta","opção errada 1","opção errada 2","opção errada 3"],"correta":1,"explicacao":"..."}]
Sem explicação, sem markdown, apenas o JSON.`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const quizzes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Search Wikipedia for images (FREE)
    for (const quiz of quizzes) {
      const respostaCorreta = quiz.respostas?.[quiz.correta - 1] || "";
      quiz.imagem_url = await searchWikipediaImage(respostaCorreta);
    }

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

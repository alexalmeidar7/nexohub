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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const quizzes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Generate images for each quiz answer using AI
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    for (const quiz of quizzes) {
      try {
        const respostaCorreta = quiz.respostas[quiz.correta - 1];
        const imgPrompt = `Uma ilustração clara e informativa sobre "${respostaCorreta}" relacionada a "${quiz.pergunta}". Estilo editorial, cores vibrantes, fundo limpo, sem texto na imagem.`;

        const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: imgPrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (imgResponse.ok) {
          const imgData = await imgResponse.json();
          const imageB64 = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (imageB64) {
            const base64Data = imageB64.replace(/^data:image\/\w+;base64,/, "");
            const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            const fileName = `quiz-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const filePath = `quiz-images/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from("xml-files")
              .upload(filePath, binaryData, { contentType: "image/png", upsert: true });

            if (!uploadError) {
              const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(filePath);
              quiz.imagem_url = urlData.publicUrl;
            }
          }
        }
      } catch (imgErr) {
        console.error("Image gen error for quiz:", imgErr);
        quiz.imagem_url = "";
      }
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

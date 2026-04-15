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

    // Step 2: Generate image using AI image model
    let imagem_url = "";
    try {
      const imgPrompt = `Uma ilustração clara e informativa sobre "${resposta_correta_texto}" relacionada a "${pergunta}". Estilo editorial, cores vibrantes, fundo limpo, sem texto na imagem.`;
      
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
          // Extract base64 data
          const base64Data = imageB64.replace(/^data:image\/\w+;base64,/, "");
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          
          // Upload to Supabase Storage
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          const fileName = `quiz-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          const filePath = `quiz-images/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from("xml-files")
            .upload(filePath, binaryData, { contentType: "image/png", upsert: true });
          
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(filePath);
            imagem_url = urlData.publicUrl;
          } else {
            console.error("Upload error:", uploadError);
          }
        }
      }
    } catch (imgErr) {
      console.error("Image generation error:", imgErr);
    }

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

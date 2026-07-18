import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text) {
      return new Response(JSON.stringify({ error: "Texto é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Simple local "improvement" if no API keys are found
    const fallbackImprovement = (t: string) => {
      return t
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();
    };

    if (!OPENAI_API_KEY && !LOVABLE_API_KEY) {
      console.log("No API keys found, using local fallback improvement");
      return new Response(JSON.stringify({ improvedText: fallbackImprovement(text) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = OPENAI_API_KEY 
      ? "https://api.openai.com/v1/chat/completions" 
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    
    const apiKey = OPENAI_API_KEY || LOVABLE_API_KEY;
    const model = OPENAI_API_KEY ? "gpt-4o-mini" : "google/gemini-2.5-flash-lite";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Você é um revisor de texto profissional brasileiro. Melhore a clareza, gramática e fluidez do texto mantendo o significado original. Retorne APENAS o texto melhorado, sem explicações." },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI service error:", response.status);
      return new Response(JSON.stringify({ improvedText: fallbackImprovement(text) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim() || fallbackImprovement(text);

    return new Response(JSON.stringify({ improvedText: improved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

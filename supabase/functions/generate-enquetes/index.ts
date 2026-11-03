import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { categoria } = await req.json();

    let aiEnabled = true;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("user_id", user.id).maybeSingle();
        if (profile) aiEnabled = profile.ai_enabled ?? true;
      }
    }

    if (!aiEnabled) {
      return new Response(JSON.stringify({ ok: false, error: "IA desabilitada no perfil", quizzes: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!categoria) {
      return new Response(JSON.stringify({ error: "categoria required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

    const prompt = `Gere exatamente 5 perguntas de quiz sobre o tema "${categoria}" para um programa de rádio brasileiro. Cada pergunta deve ter exatamente 2 opções de resposta (uma correta e uma errada) e indicar qual é a correta (1 ou 2). Use a semente do dia ${dayOfYear} para variar as perguntas. Responda APENAS com um array JSON válido no formato:
[{"pergunta":"...","respostas":["opção correta","opção errada"],"correta":1}]
Sem explicação, sem markdown, apenas o JSON.`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
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
      const msg = response.status === 429
        ? "Limite de requisições atingido. Tente novamente em instantes."
        : response.status === 402
        ? "Créditos de IA esgotados. Adicione créditos no workspace."
        : "Erro no gateway de IA.";
      return new Response(JSON.stringify({ ok: false, error: msg, quizzes: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

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

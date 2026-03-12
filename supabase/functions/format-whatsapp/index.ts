import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { titulo, programaNome, estudio, data, horario, participantes, conteudoTexto } = await req.json();
    if (!conteudoTexto) {
      return new Response(JSON.stringify({ error: "Conteúdo é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Você é um assistente que formata roteiros de programas de rádio/TV para envio via WhatsApp.

Regras de formatação:
- Use *negrito* (asteriscos) para destacar elementos como: VINHETA, MÚSICA, ENTREVISTA, INTERVALO, TEC, PASSAGEM, CABEÇA, NOTA, SONORA, OFF, etc.
- Use _itálico_ (underline) para instruções técnicas
- Separe blocos com linhas em branco
- Mantenha o texto conciso e legível para leitura no celular
- NÃO adicione informações que não estejam no roteiro original
- NÃO use markdown com # ou ##, apenas formatação WhatsApp: *negrito*, _itálico_, ~tachado~
- Responda APENAS com o texto formatado, sem comentários adicionais
- Comece com um cabeçalho usando os dados do programa`;

    const participantesStr = participantes?.length
      ? participantes.map((p: any) => `${p.nome}${p.cargo ? ` (${p.cargo})` : ""}`).join(", ")
      : "";

    const userPrompt = `Dados do programa:
Título: ${titulo || "Roteiro"}
Programa: ${programaNome || ""}
Estúdio: ${estudio || ""}
Data: ${data || ""}
Horário: ${horario || ""}
Participantes: ${participantesStr}

Roteiro para formatar:
${conteudoTexto}`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao formatar texto" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const formatted = aiData.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ text: formatted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("format-whatsapp error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

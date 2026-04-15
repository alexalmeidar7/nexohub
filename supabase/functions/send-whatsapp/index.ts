import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) {
      return new Response(JSON.stringify({ error: "TWILIO_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!TWILIO_FROM) {
      return new Response(JSON.stringify({ error: "Número WhatsApp do Twilio não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { contatos, mensagem } = body;

    if (!contatos || !Array.isArray(contatos) || contatos.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum contato informado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mensagem || typeof mensagem !== "string" || !mensagem.trim()) {
      return new Response(JSON.stringify({ error: "Mensagem vazia" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { phone: string; ok: boolean; error?: string; sid?: string }[] = [];

    for (const contato of contatos) {
      const phone = contato.whatsapp.startsWith("55") ? contato.whatsapp : `55${contato.whatsapp}`;
      try {
        const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `whatsapp:+${phone}`,
            From: `whatsapp:+${TWILIO_FROM}`,
            Body: mensagem,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          console.error(`Twilio error for ${phone}:`, JSON.stringify(data));
          results.push({ phone, ok: false, error: data.message || `HTTP ${response.status}` });
        } else {
          results.push({ phone, ok: true, sid: data.sid });
        }
      } catch (err) {
        console.error(`Error sending to ${phone}:`, err);
        results.push({ phone, ok: false, error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    const successCount = results.filter(r => r.ok).length;

    return new Response(JSON.stringify({
      ok: successCount > 0,
      total: contatos.length,
      enviados: successCount,
      falhas: contatos.length - successCount,
      detalhes: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-whatsapp error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

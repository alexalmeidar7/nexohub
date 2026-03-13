import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AI disabled – always return default classification
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(JSON.stringify({
    keywords: [],
    classificacao: "Livre",
    justificativa: "Classificação padrão aplicada.",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

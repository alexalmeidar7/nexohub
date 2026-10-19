import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!supabaseUrl || !anonKey || !serviceKey || !clientId) {
      return new Response(JSON.stringify({ error: "Google Calendar não está configurado no servidor." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.slice("Bearer ".length);
    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const state = crypto.randomUUID() + crypto.randomUUID();
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: stateError } = await admin.from("google_calendar_oauth_states").insert({
      state_hash: await sha256(state),
      user_id: claimsData.claims.sub,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) {
      console.error("Could not create OAuth state.");
      return new Response(JSON.stringify({ error: "Não foi possível iniciar a conexão com o Google." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return new Response(JSON.stringify({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Erro interno ao iniciar autorização." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return html("Autorização negada pelo Google.");
    if (!code || !state || state.length > 256) return html("Parâmetros de autorização inválidos.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) return html("Integração não configurada no servidor.");

    const admin = createClient(supabaseUrl, serviceKey);
    const stateHash = await sha256(state);
    const { data: stateRow, error: stateError } = await admin
      .from("google_calendar_oauth_states")
      .select("user_id, expires_at")
      .eq("state_hash", stateHash)
      .maybeSingle();

    if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      await admin.from("google_calendar_oauth_states").delete().eq("state_hash", stateHash);
      return html("A autorização expirou ou não é válida. Volte ao House Mix e tente novamente.");
    }

    // State is single-use: remove it before exchanging the authorization code.
    const { error: consumeError } = await admin.from("google_calendar_oauth_states").delete().eq("state_hash", stateHash);
    if (consumeError) return html("Não foi possível validar a autorização. Tente novamente.");

    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token exchange failed with status:", tokenRes.status);
      return html("Falha ao obter autorização do Google. Volte ao House Mix e tente novamente.");
    }

    // Google may omit refresh_token on repeat authorization. Keep the existing one in that case.
    const { data: previous } = await admin.from("google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();
    const refreshToken = tokenData.refresh_token || previous?.refresh_token;
    if (!refreshToken) return html("O Google não forneceu autorização para renovação. Revogue o acesso do House Mix nas configurações da sua conta Google e conecte novamente.");

    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();
    const { error: saveError } = await admin.from("google_calendar_tokens").upsert({
      user_id: stateRow.user_id,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expiry: expiresAt,
    }, { onConflict: "user_id" });
    if (saveError) {
      console.error("Google token storage failed.");
      return html("Não foi possível salvar a conexão com o Google.");
    }
    return html("Google Agenda conectado com sucesso! Você pode fechar esta janela.");
  } catch {
    console.error("Google Calendar callback failed.");
    return html("Erro interno ao concluir a conexão.");
  }
});

function html(message: string): Response {
  const safeMessage = message.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Google Calendar</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a1628;color:#fff}.card{text-align:center;padding:2rem;border-radius:12px;background:#1a2a4a;max-width:400px;margin:1rem}</style></head><body><div class="card"><h2>${safeMessage}</h2><p>Esta janela será fechada automaticamente...</p></div><script>setTimeout(()=>window.close(),1800)</script></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

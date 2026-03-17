import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // JWT token
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(redirectHtml("Autorização negada pelo Google."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response(redirectHtml("Parâmetros inválidos."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Verify user from state (JWT)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${state}` } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(state);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(redirectHtml("Token inválido ou expirado."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    const userId = claimsData.claims.sub;

    // Exchange code for tokens
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return new Response(redirectHtml("Falha ao obter tokens do Google."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Upsert tokens using service role (bypasses RLS)
    const { error: upsertError } = await supabaseAdmin
      .from("google_calendar_tokens")
      .upsert(
        {
          user_id: userId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || "",
          token_expiry: expiresAt,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(redirectHtml("Falha ao salvar tokens."), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response(redirectHtml("Google Calendar conectado com sucesso! Você pode fechar esta janela."), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Callback error:", err);
    return new Response(redirectHtml("Erro interno."), {
      headers: { "Content-Type": "text/html" },
    });
  }
});

function redirectHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>Google Calendar</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a1628;color:#fff;}
.card{text-align:center;padding:2rem;border-radius:12px;background:#1a2a4a;max-width:400px;}
</style></head>
<body><div class="card"><h2>${message}</h2><p>Esta janela será fechada automaticamente...</p></div>
<script>setTimeout(()=>{window.close()},2000);</script>
</body></html>`;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidShortUrl(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  if (/^error/i.test(t)) return false;
  if (t.length > 200) return false;
  return true;
}

async function shortenUrl(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  // Try TinyURL first (more stable, no rate-limit body)
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const short = (await res.text()).trim();
      if (isValidShortUrl(short)) return short;
    }
  } catch { /* fallback */ }
  // Fallback to is.gd
  try {
    const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const short = (await res.text()).trim();
      if (isValidShortUrl(short)) return short;
    }
  } catch { /* fallback */ }
  // Give up — return the original full URL so the message still contains a working link
  return url;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {

    const body = await req.json();

    // URL shortening mode
    if (body.urls && Array.isArray(body.urls)) {
      const shortened = await Promise.all(body.urls.map((u: string) => shortenUrl(u)));
      return new Response(JSON.stringify({ shortened }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Original text formatting mode
    const { conteudoTexto } = body;
    if (!conteudoTexto) {
      return new Response(JSON.stringify({ error: "Conteúdo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI formatting is paused; preserve the original text.
    return new Response(JSON.stringify({ text: conteudoTexto, aiPaused: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

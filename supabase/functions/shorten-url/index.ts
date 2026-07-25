// Encurtador de URL público (sem auth). Usa TinyURL API (grátis, sem key).
// Retorna { ok, short, original }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const target = String(body?.url || url.searchParams.get("url") || "").trim();

    if (!/^https?:\/\/[^\s]+$/i.test(target)) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_url" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TinyURL: retorna a short URL como texto puro.
    const r = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(target)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const short = (await r.text()).trim();
    const ok = /^https?:\/\/tinyurl\.com\//i.test(short);

    return new Response(
      JSON.stringify({ ok, short: ok ? short : null, original: target }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: "shorten_failed", error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

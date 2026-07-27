// Simple RSS/Atom titles fetcher. Returns up to 15 recent titles.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTitles(xml: string): string[] {
  const titles: string[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks) {
    const m = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) continue;
    let t = decodeEntities(m[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.includes("|")) t = t.split("|")[0].trim();
    if (t && t.length > 3) titles.push(t);
    if (titles.length >= 15) break;
  }
  return titles;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "URL obrigatória" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let target: URL;
    try {
      target = new URL(url);
      if (!/^https?:$/.test(target.protocol)) throw new Error("bad");
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "URL inválida" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    target.searchParams.set("_lvcb", Date.now().toString());
    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexoRSS/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `HTTP ${res.status}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = await res.text();
    const titles = extractTitles(text);
    return new Response(JSON.stringify({ ok: true, titles }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "erro" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// RSS/Atom titles fetcher. Returns up to 15 recent titles.
// Includes browser-like headers + public read-only proxy fallback for hosts that block bots.
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
  // Skip the channel/feed <title> by matching only inside <item> or <entry>
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

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

async function tryFetch(u: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; text?: string }> {
  try {
    const res = await fetch(u, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (e: any) {
    return { ok: false, status: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") return json({ ok: false, error: "URL obrigatória" });

    let target: URL;
    try {
      target = new URL(url);
      if (!/^https?:$/.test(target.protocol)) throw new Error("bad");
    } catch {
      return json({ ok: false, error: "URL inválida" });
    }
    target.searchParams.set("_lvcb", Date.now().toString());
    const finalUrl = target.toString();

    // 1) Direct fetch with browser-like headers
    let attempt = await tryFetch(finalUrl);
    let via = "direct";

    // 2) Fallback via r.jina.ai text proxy (returns raw content for XML)
    if (!attempt.ok) {
      const proxied = `https://r.jina.ai/${finalUrl}`;
      const p = await tryFetch(proxied, 10000);
      if (p.ok) { attempt = p; via = "r.jina.ai"; }
    }

    // 3) Fallback via allorigins raw
    if (!attempt.ok) {
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(finalUrl)}`;
      const p = await tryFetch(proxied, 10000);
      if (p.ok) { attempt = p; via = "allorigins"; }
    }

    if (!attempt.ok || !attempt.text) {
      return json({ ok: false, error: `Não foi possível baixar o feed (HTTP ${attempt.status || "?"}).`, via });
    }

    const titles = extractTitles(attempt.text);
    if (titles.length === 0) {
      return json({ ok: false, error: "Feed baixado, mas nenhum título de item foi encontrado.", via });
    }
    return json({ ok: true, titles, via });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "erro" });
  }
});


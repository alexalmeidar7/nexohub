// Probes a stream stats URL (audio or video) and returns candidate XPath-like
// paths that point to numeric listener/viewer counts, so the UI can help the
// user pick the right XPath without knowing the response format.
import { requireUser, isPrivateOrLocalUrl } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LISTENER_KEYWORDS = [
  "listener", "listeners", "currentlisteners", "current_listeners",
  "peakl", "peak_listeners",
  "espectador", "espectadores", "espectadores_conectados",
  "ouvintes", "connected", "conectados",
  "viewer", "viewers", "watching",
  "clients", "audience", "count",
];

function scoreKey(rawKey: string): number {
  const k = rawKey.toLowerCase();
  let score = 0;
  for (const kw of LISTENER_KEYWORDS) {
    if (k === kw) score += 100;
    else if (k.includes(kw)) score += 40;
  }
  // Penalize obviously wrong ones
  if (k.includes("peak") || k.includes("max")) score -= 15;
  if (k.includes("total") && !k.includes("listener")) score -= 5;
  if (k.includes("bitrate") || k.includes("sample") || k.includes("port") || k.includes("time")) score -= 200;
  return score;
}

type Candidate = { xpath: string; value: number; score: number };

function walkJson(node: any, path: string[], out: Candidate[]) {
  if (node == null) return;
  if (typeof node === "number" && Number.isFinite(node) && Number.isInteger(node)) {
    const key = path[path.length - 1] ?? "";
    const s = scoreKey(key);
    if (s > 0 && node >= 0 && node < 1_000_000) {
      out.push({ xpath: "//" + path.join("/"), value: node, score: s });
    }
    return;
  }
  if (typeof node === "string") {
    const n = parseInt(node, 10);
    if (Number.isFinite(n) && /^\s*\d+\s*$/.test(node)) {
      const key = path[path.length - 1] ?? "";
      const s = scoreKey(key);
      if (s > 0 && n >= 0 && n < 1_000_000) {
        out.push({ xpath: "//" + path.join("/"), value: n, score: s });
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    // Only inspect first element to keep path stable
    if (node.length > 0) walkJson(node[0], path, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      walkJson(v, [...path, k], out);
    }
  }
}

function walkXml(xml: string, out: Candidate[]) {
  // Simple regex-based traversal — capture <tag>value</tag> where value is a
  // numeric string, tracking parent tag stack.
  const tagRe = /<(\/?)([A-Za-z_][A-Za-z0-9_:-]*)(\s[^>]*)?>/g;
  const stack: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const openText: Record<string, string> = {}; // tag path -> accumulated text
  const pathStack: string[][] = [];
  while ((m = tagRe.exec(xml)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2];
    const before = xml.slice(lastIndex, m.index);
    lastIndex = tagRe.lastIndex;
    if (before && stack.length > 0) {
      const key = stack.join("/");
      openText[key] = (openText[key] ?? "") + before;
    }
    if (isClose) {
      const key = stack.join("/");
      const text = (openText[key] ?? "").trim();
      // Only leaf text (no nested tags) counts.
      if (text && /^\d+$/.test(text)) {
        const n = parseInt(text, 10);
        const s = scoreKey(tag);
        if (s > 0 && n >= 0 && n < 1_000_000) {
          out.push({ xpath: "//" + stack.join("/"), value: n, score: s });
        }
      }
      openText[key] = "";
      stack.pop();
    } else if (!m[0].endsWith("/>")) {
      stack.push(tag);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonResp = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return jsonResp({ ok: false, error: "missing url" });
    }
    if (isPrivateOrLocalUrl(url)) {
      return jsonResp({ ok: false, error: "url_not_allowed" });
    }

    let text: string;
    try {
      const r = await fetch(url, { cache: "no-store" });
      text = (await r.text()).trim();
    } catch (e) {
      return jsonResp({ ok: false, error: "fetch_failed", message: (e as Error).message });
    }

    const candidates: Candidate[] = [];
    const looksJson = text.startsWith("{") || text.startsWith("[");
    let format: "json" | "xml" | "unknown" = "unknown";
    if (looksJson) {
      try {
        const parsed = JSON.parse(text);
        walkJson(parsed, [], candidates);
        format = "json";
      } catch { /* fall through */ }
    }
    if (candidates.length === 0 && text.startsWith("<")) {
      walkXml(text, candidates);
      format = "xml";
    }

    // Dedupe by xpath keeping best score
    const byPath = new Map<string, Candidate>();
    for (const c of candidates) {
      const prev = byPath.get(c.xpath);
      if (!prev || c.score > prev.score) byPath.set(c.xpath, c);
    }
    const suggestions = Array.from(byPath.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return jsonResp({
      ok: true,
      format,
      suggestions,
      previewLength: text.length,
    });
  } catch (e) {
    return jsonResp({ ok: false, error: "internal", message: (e as Error).message });
  }
});

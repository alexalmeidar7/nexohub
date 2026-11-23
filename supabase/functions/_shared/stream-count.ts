import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivateOrLocalUrl } from "./auth.ts";

type Kind = "audio" | "video";
type Cfg = Record<string, unknown>;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const isUuid = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
const number = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
};
function fromJson(source: unknown, chosenPath: string, kind: Kind): number | null {
  const found: Array<{ path: string; count: number; weight: number }> = [];
  const scan = (obj: unknown, path: string[], depth: number) => {
    if (depth > 12 || found.length > 200 || !obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const next = [...path, key];
      if (value && typeof value === "object") { scan(value, next, depth + 1); continue; }
      const n = number(value);
      const lower = key.toLowerCase();
      if (n === null) continue;
      const score = kind === "audio" ? /currentlisteners|listeners|ouvintes|connected/.test(lower) : /viewers|watching|espectadores|connected/.test(lower);
      const exact = chosenPath && ("//" + next.join("/")).toLowerCase() === chosenPath.toLowerCase();
      if (exact || (!chosenPath && score && !/peak|maximum|max|limit|unique|total/.test(lower))) {
        found.push({ path: next.join("/"), count: n, weight: exact ? 1000 : /currentlisteners|listeners|viewers/.test(lower) ? 20 : 10 });
      }
    }
  };
  scan(source, [], 0);
  found.sort((a, b) => b.weight - a.weight);
  return found[0]?.count ?? null;
}
function fromXml(source: string, chosenPath: string, kind: Kind): number | null {
  const name = chosenPath.split("/").filter(Boolean).pop();
  const keys = name && /^[a-z_][\w:-]{0,60}$/i.test(name) ? [name] :
    kind === "audio" ? ["currentlisteners", "listeners", "ouvintes", "connected"] :
      ["viewers", "watching", "espectadores", "connected"];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp("<" + escaped + "(?:\\s[^>]*)?>\\s*(\\d+)\\s*</" + escaped + "\\s*>", "i"));
    const n = number(match?.[1]);
    if (n !== null) return n;
  }
  return null;
}
function allowedUrl(value: string) {
  if (!value || value.length > 2048 || isPrivateOrLocalUrl(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      !url.hostname.endsWith(".internal") && !url.hostname.endsWith(".local");
  } catch { return false; }
}
async function limitedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") || 0) > 262144) throw new Error("payload_too_large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) throw new Error("payload_too_large");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function countStream(req: Request, kind: Kind): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !secret) return json({ ok: false, error: "configuration_unavailable" }, 503);
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (!isUuid(userId)) return json({ ok: false, error: "user_id_invalid" }, 400);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(base, secret, { auth: { persistSession: false } });
  if (bearer !== secret) {
    if (!bearer) return json({ ok: false, error: "unauthorized" }, 401);
    const { data, error } = await admin.auth.getUser(bearer);
    if (error || !data.user) return json({ ok: false, error: "unauthorized" }, 401);
    if (data.user.id !== userId) {
      const { data: sub } = await admin.from("sub_users").select("id").eq("parent_user_id", userId)
        .eq("auth_user_id", data.user.id).eq("ativo", true).maybeSingle();
      if (!sub) return json({ ok: false, error: "forbidden" }, 403);
    }
  }
  const keys = kind === "audio"
    ? "audio_stream_api_url,audio_stream_xpath,audio_sources"
    : "video_stream_api_url,video_stream_xpath,video_sources";
  const { data: cfg, error: cfgError } = await admin.from("empresa_config").select(keys).eq("user_id", userId).maybeSingle();
  if (cfgError || !cfg) return json({ ok: false, error: "not_configured" }, 404);
  const primaryUrl = kind === "audio" ? "audio_stream_api_url" : "video_stream_api_url";
  const primaryPath = kind === "audio" ? "audio_stream_xpath" : "video_stream_xpath";
  const listKey = kind === "audio" ? "audio_sources" : "video_sources";
  const configured = [{ url: cfg[primaryUrl], xpath: cfg[primaryPath] }, ...(Array.isArray(cfg[listKey]) ? cfg[listKey] : [])]
    .filter((item: any) => item && typeof item.url === "string");
  const url = Array.isArray(body.urls) && typeof body.urls[0] === "string" ? body.urls[0].trim() : "";
  if (!configured.some((source: any) => source.url === url) || !allowedUrl(url)) {
    return json({ ok: false, error: "source_not_allowed" }, 403);
  }
  const official = configured.find((source: any) => source.url === url) as any;
  const requested = typeof body.xpath === "string" ? body.xpath : "";
  // Honor the station's saved XPath; never take a different arbitrary path.
  const xpath = typeof official.xpath === "string" ? official.xpath : "";
  if (requested && requested !== xpath) return json({ ok: false, error: "xpath_not_allowed" }, 403);
  try {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) return json({ ok: false, error: "provider_http_" + response.status }, 502);
    const raw = (await limitedBody(response)).trim();
    let count: number | null = null;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try { count = fromJson(JSON.parse(raw), xpath, kind); } catch { /* may be XML */ }
    }
    if (count === null && raw.startsWith("<")) count = fromXml(raw, xpath, kind);
    if (count === null) return json({ ok: false, error: "counter_not_found" }, 422);
    return json({ ok: true, [kind === "audio" ? "listeners" : "viewers"]: count });
  } catch {
    return json({ ok: false, error: "provider_unreachable" }, 502);
  }
}

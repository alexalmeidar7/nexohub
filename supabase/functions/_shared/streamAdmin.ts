// Shared helper: authenticated probes for streaming servers whose public
// stats endpoints are disabled (Icecast /admin/*, nginx-rtmp /stat).
//
// Credentials NEVER come from the client. They are read from the
// STREAM_ADMIN_CREDENTIALS backend secret, which accepts either:
//
//   JSON:  {"8014.brasilstream.com.br": {"user":"admin","pass":"secret"},
//           "*": {"user":"admin","pass":"fallback"}}
//
//   Lines: 8014.brasilstream.com.br|admin|secret
//          *|admin|fallback
//
// Host keys may include the port (host:port) or omit it.

type Cred = { user: string; pass: string };

let cachedRaw: string | null = null;
let cachedMap: Record<string, Cred> | null = null;

function parseCreds(raw: string): Record<string, Cred> {
  const out: Record<string, Cred> = {};
  const trimmed = raw.trim();
  if (!trimmed) return out;
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      for (const [host, v] of Object.entries(j as Record<string, unknown>)) {
        if (typeof v === "string") {
          const [u, ...rest] = v.split(":");
          if (u) out[host.toLowerCase()] = { user: u, pass: rest.join(":") };
        } else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          const user = String(o.user ?? o.username ?? "");
          const pass = String(o.pass ?? o.password ?? "");
          if (user) out[host.toLowerCase()] = { user, pass };
        }
      }
      return out;
    } catch { /* fall through to line format */ }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const parts = l.split("|").map((s) => s.trim());
    if (parts.length >= 2 && parts[0]) {
      out[parts[0].toLowerCase()] = { user: parts[1], pass: parts[2] ?? "" };
      continue;
    }
    // Bare "user:pass" (or "user pass") — applies to every host.
    const m = l.match(/^([^:\s]+)[:\s]+(.+)$/);
    if (m) { out["*"] = { user: m[1], pass: m[2] }; continue; }
    // Single token: assume it is the admin password with the default user.
    out["*"] = { user: "admin", pass: l };
  }

  return out;
}


export function credsForHost(hostname: string, hostWithPort: string): Cred | null {
  const raw = Deno.env.get("STREAM_ADMIN_CREDENTIALS") ?? "";
  if (!raw) {
    console.log("[streamAdmin] STREAM_ADMIN_CREDENTIALS not set");
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedMap = parseCreds(raw);
  }
  const map = cachedMap ?? {};
  const cred =
    map[hostWithPort.toLowerCase()] ??
    map[hostname.toLowerCase()] ??
    map["*"] ??
    null;
  console.log(
    `[streamAdmin] host=${hostWithPort} keys=${Object.keys(map).join(",")} matched=${cred ? "yes" : "no"}`,
  );
  return cred;
}


function basic(c: Cred): string {
  return `Basic ${btoa(`${c.user}:${c.pass}`)}`;
}

const T = 7000;

/** Icecast: /admin/stats.xml + /admin/listclients (requires admin auth). */
export async function icecastAdminListeners(streamUrl: string): Promise<number | null> {
  let u: URL;
  try { u = new URL(streamUrl); } catch { return null; }
  const cred = credsForHost(u.hostname, u.host);
  if (!cred) return null;
  const base = `${u.protocol}//${u.host}`;
  const mount = u.pathname && u.pathname !== "/" ? u.pathname : null;
  const headers = { Authorization: basic(cred), "User-Agent": "Mozilla/5.0" };

  // 1) /admin/stats.xml — full server stats with one <source mount="..."> each.
  try {
    const r = await fetch(`${base}/admin/stats.xml`, { headers, signal: AbortSignal.timeout(T) });
    console.log(`[streamAdmin] ${base}/admin/stats.xml -> ${r.status}`);
    if (r.ok) {
      const xml = await r.text();

      const sources = [...xml.matchAll(/<source\s+mount="([^"]+)"[^>]*>([\s\S]*?)<\/source>/gi)];
      if (sources.length) {
        const pick = (block: string): number | null => {
          const m = block.match(/<listeners>\s*(\d+)\s*<\/listeners>/i);
          return m ? parseInt(m[1], 10) : null;
        };
        if (mount) {
          const hit = sources.find((s) => s[1] === mount);
          if (hit) { const n = pick(hit[2]); if (n != null) return n; }
        }
        let total = 0; let found = false;
        for (const s of sources) { const n = pick(s[2]); if (n != null) { total += n; found = true; } }
        if (found) return total;
      }
      // Server-wide fallback
      const g = xml.match(/<listeners>\s*(\d+)\s*<\/listeners>/i);
      if (g) return parseInt(g[1], 10);
    }
  } catch { /* try next */ }

  // 2) /admin/listclients?mount=/stream — count <listener> entries.
  if (mount) {
    try {
      const r = await fetch(`${base}/admin/listclients?mount=${encodeURIComponent(mount)}`, {
        headers, signal: AbortSignal.timeout(T),
      });
      if (r.ok) {
        const xml = await r.text();
        const m = xml.match(/<listeners>\s*(\d+)\s*<\/listeners>/i);
        if (m) return parseInt(m[1], 10);
        const count = (xml.match(/<listener>/gi) ?? []).length;
        if (count > 0 || /<\/source>/i.test(xml)) return count;
      }
    } catch { /* give up */ }
  }
  return null;
}

/**
 * nginx-rtmp / nginx-http-flv style /stat XML (often behind Basic auth).
 * Returns nclients for the matching stream name, otherwise the total.
 */
export async function nginxRtmpStatViewers(streamUrl: string): Promise<number | null> {
  let u: URL;
  try { u = new URL(streamUrl); } catch { return null; }
  const cred = credsForHost(u.hostname, u.host);
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (cred) headers.Authorization = basic(cred);
  const base = `${u.protocol}//${u.host}`;
  // Stream name: last path part without extension (…/hls/cult973fm/index.m3u8 -> cult973fm)
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const streamName = /\.(m3u8|mpd|ts)$/i.test(last) ? (parts[parts.length - 2] ?? "") : last;

  for (const path of ["/stat", "/stats", "/rtmp_stat", "/hls/stat"]) {
    try {
      const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(T) });
      if (!r.ok) continue;
      const xml = await r.text();
      if (!/<rtmp|<server|<application/i.test(xml)) continue;
      const streams = [...xml.matchAll(/<stream>([\s\S]*?)<\/stream>/gi)];
      const clientsOf = (block: string): number | null => {
        const m = block.match(/<nclients>\s*(\d+)\s*<\/nclients>/i);
        return m ? parseInt(m[1], 10) : null;
      };
      if (streamName) {
        const hit = streams.find((s) => new RegExp(`<name>\\s*${streamName}\\s*</name>`, "i").test(s[1]));
        if (hit) {
          const n = clientsOf(hit[1]);
          // nclients includes the publisher; subtract it when publishing.
          if (n != null) return Math.max(0, /<publishing\s*\/?>/i.test(hit[1]) ? n - 1 : n);
        }
      }
      let total = 0; let found = false;
      for (const s of streams) {
        const n = clientsOf(s[1]);
        if (n != null) { total += Math.max(0, /<publishing\s*\/?>/i.test(s[1]) ? n - 1 : n); found = true; }
      }
      if (found) return total;
    } catch { /* next path */ }
  }
  return null;
}

/**
 * Small, tenant-scoped read budget for the browser Supabase client.
 * It never caches authentication, RPCs or writes. This prevents dozens of
 * mounted HMO/HMD components from asking for identical data every second.
 */
const TABLES = new Set([
  "user_settings", "programas", "empresa_config", "sub_users",
  "apresentadores", "logos_patrocinadores", "roteiros",
  "enquetes_agendadas", "batalhas_agendadas", "quiz_agendados",
  "agenda_eventos", "profiles",
]);
const MAX_ENTRIES = 96;
const MAX_BYTES = 256 * 1024;
const REST_TTL_MS = 8_000;
const XML_LIST_TTL_MS = 30_000;

type CacheEntry = { response: Response; expires: number; resource: string };
type ReadSpec = { key: string; resource: string; ttl: number };

function describeRequest(input: RequestInfo | URL, init: RequestInit) {
  const source = typeof input === "string" || input instanceof URL ? null : input;
  const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let url: URL;
  try { url = new URL(urlString); } catch { return null; }
  if (!url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".supabase.in")) return null;
  const headers = new Headers(source?.headers);
  if (init.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const method = (init.method || source?.method || "GET").toUpperCase();
  const signal = init.signal || source?.signal;
  const bypassCache = Boolean(signal || init.cache === "no-store" || init.cache === "reload");
  const segments = url.pathname.split("/").filter(Boolean);
  const restTable = segments[0] === "rest" && segments[1] === "v1" ? segments[2] : null;
  const xmlList = url.pathname === "/storage/v1/object/list/xml-files";
  const storageWrite = segments[0] === "storage" && segments[1] === "v1" &&
    segments[2] === "object" && segments.includes("xml-files") && !xmlList;
  const resource = restTable
    ? `${url.origin}/rest/v1/${restTable}`
    : xmlList || storageWrite
      ? `${url.origin}/storage/v1/object/list/xml-files`
      : null;
  const writable = Boolean(resource && ((restTable && method !== "GET") || storageWrite));
  if (!resource || !url.searchParams || !url.hostname) return { writable: false, read: null };
  let read: ReadSpec | null = null;
  const isRestRead = restTable && TABLES.has(restTable) && method === "GET";
  const isXmlList = xmlList && method === "POST" && typeof init.body === "string";
  if (!bypassCache && (isRestRead || isXmlList)) {
    // In-memory keys include the exact user authorization and request headers.
    // Never share cached tenant data across sessions or different query scopes.
    const headerEntries = [...headers.entries()].sort(([a], [b]) => a.localeCompare(b));
    const body = isXmlList ? String(init.body) : "";
    read = {
      key: JSON.stringify([method, url.href, headerEntries, body, init.credentials || source?.credentials || ""]),
      resource,
      ttl: isXmlList ? XML_LIST_TTL_MS : REST_TTL_MS,
    };
  }
  return { writable, resource, read };
}

export function createCostAwareFetch(
  transport: typeof fetch,
  now: () => number = () => Date.now(),
): typeof fetch {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, { resource: string; promise: Promise<Response> }>();
  const versions = new Map<string, number>();

  const invalidate = (resource: string) => {
    versions.set(resource, (versions.get(resource) || 0) + 1);
    for (const [key, value] of cache) if (value.resource === resource) cache.delete(key);
    for (const [key, value] of pending) if (value.resource === resource) pending.delete(key);
  };

  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const spec = describeRequest(input, init);
    if (!spec) return transport(input, init);
    if (spec.writable && spec.resource) {
      // Invalidate before and after writes, including failed attempts: a
      // concurrent read must never repopulate the cache with pre-write data.
      invalidate(spec.resource);
      try { return await transport(input, init); }
      finally { invalidate(spec.resource); }
    }
    const read = spec.read;
    if (!read) return transport(input, init);
    const cached = cache.get(read.key);
    if (cached) {
      if (cached.expires > now()) return cached.response.clone();
      cache.delete(read.key);
    }
    const existing = pending.get(read.key);
    if (existing) return (await existing.promise).clone();
    const version = versions.get(read.resource) || 0;
    const operation = transport(input, init).then((response) => {
      const bytes = Number(response.headers.get("content-length") || "0");
      if (response.ok &&
          response.headers.get("content-type")?.includes("application/json") &&
          (!bytes || bytes <= MAX_BYTES) &&
          (versions.get(read.resource) || 0) === version) {
        cache.set(read.key, { response: response.clone(), expires: now() + read.ttl, resource: read.resource });
        while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      }
      return response;
    }).finally(() => {
      if (pending.get(read.key)?.promise === operation) pending.delete(read.key);
    });
    pending.set(read.key, { resource: read.resource, promise: operation });
    return (await operation).clone();
  }) as typeof fetch;
}

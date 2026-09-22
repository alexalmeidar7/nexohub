/**
 * RSS & Link Fetching Service.
 *
 * In the dev server there is a local middleware (`/api/fetch-rss*`) that is much
 * faster and works offline. That middleware does NOT exist in a built/published
 * deployment, where `/api/...` returns the SPA `index.html`. So outside dev we go
 * straight to the Supabase edge functions (`fetch-rss` / `fetch-rss-titles`).
 */

export interface FetchRssResponse {
  ok: boolean;
  content?: string;
  title?: string;
  image?: string;
  description?: string;
  summary?: string;
  journalisticText?: string;
  error?: string;
}

export interface FetchRssTitlesResponse {
  ok: boolean;
  titles?: string[];
  via?: string;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const IS_DEV = Boolean(import.meta.env.DEV);

async function postJson<T>(url: string, body: any, auth: boolean): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida (${res.status})`);
  }
  if (!res.ok && !data) throw new Error(`Erro HTTP ${res.status}`);
  return data as T;
}

async function callFunction<T extends { ok?: boolean; error?: string }>(
  name: "fetch-rss" | "fetch-rss-titles",
  body: any,
): Promise<{ data: T | null; error: any }> {
  const edgeUrl = `${SUPABASE_URL}/functions/v1/${name}`;
  try {
    let data: T | null = null;
    if (IS_DEV) {
      try {
        data = await postJson<T>(`/api/${name}`, body, false);
      } catch {
        data = null;
      }
    }
    if (!data || data.ok === false) {
      const edgeData = await postJson<T>(edgeUrl, body, true);
      if (edgeData) data = edgeData;
    }
    if (!data || data.ok === false) {
      return { data, error: new Error(data?.error || "Falha ao obter conteúdo") };
    }
    return { data, error: null };
  } catch (err: any) {
    console.error(`[rssService] ${name} failed:`, err);
    return { data: null, error: err };
  }
}

/** Matches supabase.functions.invoke("fetch-rss", { body }) */
export function invokeFetchRss(body: any) {
  return callFunction<FetchRssResponse>("fetch-rss", body);
}

/** Matches supabase.functions.invoke("fetch-rss-titles", { body }) */
export function invokeFetchRssTitles(body: any) {
  return callFunction<FetchRssTitlesResponse>("fetch-rss-titles", body);
}

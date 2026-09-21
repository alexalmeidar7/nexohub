/**
 * RSS & Link Fetching Service with automatic local fallback.
 * Provides reliable news extraction from article URLs and RSS feeds.
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

/**
 * Universal invoke function matching supabase.functions.invoke("fetch-rss", { body })
 */
export async function invokeFetchRss(body: any): Promise<{ data: FetchRssResponse | null; error: any }> {
  try {
    const res = await fetch("/api/fetch-rss", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });

    const data: FetchRssResponse = await res.json();
    if (!res.ok || data?.ok === false) {
      return {
        data,
        error: new Error(data?.error || `Erro HTTP ${res.status}`),
      };
    }
    return { data, error: null };
  } catch (err: any) {
    console.error("[rssService] invokeFetchRss failed:", err);
    return { data: null, error: err };
  }
}

/**
 * Universal invoke function matching supabase.functions.invoke("fetch-rss-titles", { body })
 */
export async function invokeFetchRssTitles(body: any): Promise<{ data: FetchRssTitlesResponse | null; error: any }> {
  try {
    const res = await fetch("/api/fetch-rss-titles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });

    const data: FetchRssTitlesResponse = await res.json();
    if (!res.ok || data?.ok === false) {
      return {
        data,
        error: new Error(data?.error || `Erro HTTP ${res.status}`),
      };
    }
    return { data, error: null };
  } catch (err: any) {
    console.error("[rssService] invokeFetchRssTitles failed:", err);
    return { data: null, error: err };
  }
}

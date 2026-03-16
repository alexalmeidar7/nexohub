const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FETCH_TIMEOUTS_MS = [8000, 12000] as const;

const fetchWithRetry = async (url: string) => {
  let lastError: unknown = null;

  for (const timeout of FETCH_TIMEOUTS_MS) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSSBot/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (response.ok) return response;

      lastError = new Error(`Feed retornou HTTP ${response.status}`);
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Falha ao buscar feed");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("invalid_protocol");
    } catch {
      return new Response(JSON.stringify({ error: "URL inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let response: Response;
    try {
      response = await fetchWithRetry(parsedUrl.toString());
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof DOMException && fetchErr.name === "TimeoutError";
      const msg = isTimeout
        ? "Feed demorou demais para responder"
        : fetchErr instanceof Error
          ? fetchErr.message
          : "Falha ao buscar feed";

      // Retorna 200 para evitar quebra de fluxo no frontend em feeds intermitentes/lentos
      return new Response(JSON.stringify({ content: "", error: msg, ok: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Handle encoding properly
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();

    const looksLikeMojibake = (value: string) => /Ã.|Â.|â[\u0080-\u00BF]|�/.test(value);

    let text: string;

    // Check if charset is specified in content-type
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "";

    if (charset && charset !== "utf-8" && charset !== "utf8") {
      try {
        const decoder = new TextDecoder(charset, { fatal: false });
        text = decoder.decode(buffer);
      } catch {
        text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      }
    } else {
      const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

      // Check XML declaration for encoding
      const xmlEncodingMatch = utf8Text.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
      const xmlEncoding = xmlEncodingMatch ? xmlEncodingMatch[1].toLowerCase() : "";

      if (xmlEncoding && xmlEncoding !== "utf-8" && xmlEncoding !== "utf8") {
        try {
          const decoder = new TextDecoder(xmlEncoding, { fatal: false });
          text = decoder.decode(buffer);
        } catch {
          text = utf8Text;
        }
      } else {
        const latin1Text = new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer);
        text = looksLikeMojibake(utf8Text) && !looksLikeMojibake(latin1Text) ? latin1Text : utf8Text;
      }
    }

    return new Response(JSON.stringify({ content: text, ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ content: "", error: error instanceof Error ? error.message : "Erro interno", ok: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }
});

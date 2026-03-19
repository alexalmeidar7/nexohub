const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FETCH_TIMEOUTS_MS = [8000, 12000] as const;
const MOJIBAKE_PATTERN = /(Ã.|Â.|â[\u0080-\u00BF]|ðŸ|ï¿½|�)/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

type DecodeCandidate = {
  label: string;
  text: string;
};

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

const decodeBuffer = (buffer: ArrayBuffer, encoding: string, fatal = false): string | null => {
  try {
    return new TextDecoder(encoding, { fatal }).decode(buffer);
  } catch {
    return null;
  }
};

const scoreDecodedText = (value: string): number => {
  if (!value) return Number.NEGATIVE_INFINITY;

  const replacementCount = value.match(/\uFFFD/g)?.length ?? 0;
  const mojibakeCount = value.match(MOJIBAKE_PATTERN)?.length ?? 0;
  const controlCount = value.match(CONTROL_CHAR_PATTERN)?.length ?? 0;

  return (
    Math.min(value.length, 1000) * 0.01 -
    replacementCount * 120 -
    mojibakeCount * 14 -
    controlCount * 25
  );
};

const pickBestDecodedText = (buffer: ArrayBuffer, contentType: string): string => {
  const candidates: DecodeCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (label: string, text: string | null) => {
    if (!text) return;
    const key = `${label}::${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ label, text });
  };

  const utf8Lenient = decodeBuffer(buffer, "utf-8", false) ?? "";
  addCandidate("utf8-lenient", utf8Lenient);

  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  const headerCharset = charsetMatch ? charsetMatch[1].toLowerCase() : "";
  const xmlEncodingMatch = utf8Lenient.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  const xmlEncoding = xmlEncodingMatch ? xmlEncodingMatch[1].toLowerCase() : "";

  const declaredEncodings = [...new Set([headerCharset, xmlEncoding].filter(Boolean))];

  for (const encoding of declaredEncodings) {
    addCandidate(`${encoding}-declared`, decodeBuffer(buffer, encoding, false));
  }

  addCandidate("utf8-strict", decodeBuffer(buffer, "utf-8", true));
  addCandidate("windows-1252", decodeBuffer(buffer, "windows-1252", false));
  addCandidate("iso-8859-1", decodeBuffer(buffer, "iso-8859-1", false));

  if (!candidates.length) {
    return utf8Lenient;
  }

  const best = candidates.reduce((winner, candidate) => {
    return scoreDecodedText(candidate.text) > scoreDecodedText(winner.text) ? candidate : winner;
  });

  return best.text.replace(/^\uFEFF/, "");
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

    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    const text = pickBestDecodedText(buffer, contentType);

    return new Response(JSON.stringify({ content: text, ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ content: "", error: error instanceof Error ? error.message : "Erro interno", ok: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }
});

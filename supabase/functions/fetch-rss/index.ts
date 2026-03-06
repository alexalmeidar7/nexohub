const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
        "Accept-Charset": "utf-8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

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

    return new Response(JSON.stringify({ content: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

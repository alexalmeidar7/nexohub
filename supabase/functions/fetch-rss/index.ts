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
    let text: string;

    // Check if charset is specified in content-type
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "";

    if (charset && charset !== "utf-8" && charset !== "utf8") {
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder(charset, { fatal: false });
      text = decoder.decode(buffer);
    } else {
      const buffer = await response.arrayBuffer();
      // Check XML declaration for encoding
      const tempText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const xmlEncodingMatch = tempText.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
      const xmlEncoding = xmlEncodingMatch ? xmlEncodingMatch[1].toLowerCase() : "";
      
      if (xmlEncoding && xmlEncoding !== "utf-8" && xmlEncoding !== "utf8") {
        const decoder = new TextDecoder(xmlEncoding, { fatal: false });
        text = decoder.decode(buffer);
      } else {
        // Check for mojibake: common pattern when Latin-1 is decoded as UTF-8
        // e.g. "Ã£" instead of "ã", "Ã§" instead of "ç"
        const hasMojibake = /Ã[£¡¢¤¥©§«®°±²³´µ¶¹º»¼½¾¿]|Ã\u0083|Ã\u0082/.test(tempText);
        if (hasMojibake) {
          const decoder = new TextDecoder("iso-8859-1", { fatal: false });
          text = decoder.decode(buffer);
        } else {
          text = tempText;
        }
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

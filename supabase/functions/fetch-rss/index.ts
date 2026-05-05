const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FETCH_TIMEOUTS_MS = [8000, 12000] as const;
const MOJIBAKE_PATTERN = /(Ã.|Â.|â[\u0080-\u00BF]|ðŸ|ï¿½|�)/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const responseHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type DecodeCandidate = {
  label: string;
  text: string;
};

const fetchWithRetry = async (url: string) => {
  let lastError: unknown = null;

  for (const timeout of FETCH_TIMEOUTS_MS) {
    try {
      const freshUrl = new URL(url);
      freshUrl.searchParams.set("_lvcb", Date.now().toString());

      const response = await fetch(freshUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSSBot/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
          "Cache-Control": "no-cache, no-store, max-age=0",
          "Pragma": "no-cache",
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
    const { url, generate_journalistic_text, custom_prompt } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("invalid_protocol");
    } catch {
      return new Response(JSON.stringify({ content: "", error: "URL inválida", ok: false }), {
        headers: responseHeaders,
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

      return new Response(JSON.stringify({ content: "", error: msg, ok: false }), {
        headers: responseHeaders,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    const text = pickBestDecodedText(buffer, contentType);

    let journalisticText = null;
    if (generate_journalistic_text) {
      try {
        // Improved heuristic to extract main text from HTML
        // Remove known non-content tags
        let cleanText = text
          .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
          .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
          .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, "")
          .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, "")
          .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, "")
          .replace(/<aside[^>]*>([\s\S]*?)<\/aside>/gi, "");

        // Try to find the article body first
        const articleMatch = cleanText.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        const mainMatch = cleanText.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const contentMatch = cleanText.match(/<div[^>]+(?:class|id)=["'](?:article-body|content|entry-content|post-body|story-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        
        let contentToProcess = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || cleanText;

        // Clean up and limit
        contentToProcess = contentToProcess
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // If we extracted something very small from article/main, fallback to full text
        if (contentToProcess.length < 500 && cleanText.length > contentToProcess.length) {
          contentToProcess = cleanText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }

        contentToProcess = contentToProcess.slice(0, 10000); // Send more context to AI if available

        const openAIKey = Deno.env.get("OPENAI_API_KEY");
        if (openAIKey && contentToProcess.length > 200) {
          const baseSystemPrompt = (custom_prompt && custom_prompt.trim().length > 5) 
            ? custom_prompt 
            : "Você é um redator sênior de telejornalismo especializado em grandes reportagens.";
          
          const systemPrompt = `${baseSystemPrompt}
            
            DIRETRIZES DE ESCRITA (RÍGIDAS):
            1. O texto DEVE ser uma matéria jornalística COMPLETA e EXTENSA.
            2. Estrutura obrigatória: [INÍCIO], [DESENVOLVIMENTO] (mínimo 3 parágrafos) e [CONCLUSÃO].
            3. EXTENSÃO MÍNIMA: 3000 caracteres. Se o conteúdo bruto for curto, use seu conhecimento geral para expandir o contexto do assunto.
            4. REQUISITO DE PARÁGRAFOS: Você DEVE escrever pelo menos 5 parágrafos longos e detalhados.
            5. ESTILO: Teleprompter (frases diretas, tom sério).
            
            IMPORTANTE: Se você enviar um texto curto, o sistema entrará em loop de erro. Escreva uma matéria de fôlego, como um especial de TV.
            
            Responda obrigatoriamente usando os marcadores [INÍCIO], [DESENVOLVIMENTO] e [CONCLUSÃO].`;
          
          let attempts = 0;
          let generatedContent = "";
          let isValid = false;

          while (attempts < 3 && !isValid) {
            console.log(`AI Attempt ${attempts + 1} for URL: ${url}`);
            const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openAIKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o", 
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: `Escreva uma matéria JORNALÍSTICA COMPLETA, DETALHADA E EXTENSA (MÍNIMO 5 PARÁGRAFOS E 3000 CARACTERES) baseada neste conteúdo. NÃO RESUMA, EXPANDA: ${contentToProcess}` }
                ],
                temperature: 0.8,
              }),
            });

            const aiData = await aiResponse.json();
            generatedContent = aiData.choices?.[0]?.message?.content || "";
            
            // Log for debugging (only in edge function logs)
            console.log(`Generated length: ${generatedContent.length}`);

            const paragraphs = generatedContent.split(/\n\s*\n/).filter(p => p.trim().length > 60);
            const isLongEnough = generatedContent.length >= 1500; 
            const hasMinParagraphs = paragraphs.length >= 5;
            
            if (isLongEnough && hasMinParagraphs) {
              isValid = true;
              console.log("Validation passed.");
            } else {
              attempts++;
              console.log(`Validation failed: length=${generatedContent.length}, paragraphs=${paragraphs.length}`);
            }
          }

          journalisticText = generatedContent
            .replace(/\[?(INÍCIO|DESENVOLVIMENTO|CONCLUSÃO|INTRODUÇÃO|FECHAMENTO|CORPO)\]?:?/gi, "")
            .trim();
          
          // Final fallback to ensure something substantial is returned if AI fails
          if (!journalisticText || journalisticText.length < 200) {
             journalisticText = generatedContent || "Erro na geração do texto extenso. Por favor, tente buscar o link novamente.";
          }
        }
      } catch (e) {
        console.error("AI Generation error:", e);
      }
    }

    return new Response(JSON.stringify({ 
      content: text, 
      journalisticText, 
      ok: true 
    }), {
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ content: "", error: error instanceof Error ? error.message : "Erro interno", ok: false }), {
      headers: responseHeaders,
    });
  }
});

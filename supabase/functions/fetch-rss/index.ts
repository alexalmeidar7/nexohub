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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { url, generate_journalistic_text, custom_prompt, generate_summary, input_text, skip_fetch } = await req.json();
    
    let userEmail = "";
    let aiEnabled = true;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userEmail = user.email || "";
        const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("user_id", user.id).maybeSingle();
        if (profile) aiEnabled = profile.ai_enabled ?? true;
      }
    }

    if (!url && !input_text) {
      return new Response(JSON.stringify({ error: "URL or input_text is required" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    let parsedUrl: URL | null = null;
    if (url) {
      try {
        parsedUrl = new URL(url);
        if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("invalid_protocol");

        // Validation for Interativa vs Positiva content
        const urlStr = parsedUrl.toString().toLowerCase();
        const isInterativaUser = userEmail.includes("interativa");
        const isPositivaUser = userEmail.includes("positiva");
        const isInterativaUrl = urlStr.includes("interativa");
        const isPositivaUrl = urlStr.includes("positiva");

        if (isInterativaUser && isPositivaUrl) {
          return new Response(JSON.stringify({ content: "", error: "Usuários da Interativa não podem acessar conteúdo da Positiva", ok: false }), {
            headers: responseHeaders,
          });
        }
        if (isPositivaUser && isInterativaUrl) {
          return new Response(JSON.stringify({ content: "", error: "Usuários da Positiva não podem acessar conteúdo da Interativa", ok: false }), {
            headers: responseHeaders,
          });
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ content: "", error: err.message === "invalid_protocol" ? "Protocolo inválido" : "URL inválida", ok: false }), {
          headers: responseHeaders,
        });
      }
    }

    let response: Response | null = null;
    let text = input_text || "";

    if (!skip_fetch && url) {
      try {
        response = await fetchWithRetry(parsedUrl!.toString());
        const contentType = response.headers.get("content-type") || "";
        const buffer = await response.arrayBuffer();
        text = pickBestDecodedText(buffer, contentType);
      } catch (fetchErr) {
        if (!input_text) {
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
      }
    }

    let journalisticText = null;
    let summary = null;
    if ((generate_journalistic_text || generate_summary) && aiEnabled) {
      try {
        let contentToProcess = text;
        if (!input_text) {
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
          
          contentToProcess = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || cleanText;

          // Clean up and limit
          contentToProcess = contentToProcess
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          // If we extracted something very small from article/main, fallback to full text
          if (contentToProcess.length < 500 && cleanText.length > contentToProcess.length) {
            contentToProcess = cleanText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          }
        }

        contentToProcess = contentToProcess.slice(0, 10000); // Send more context to AI if available

        const openAIKey = Deno.env.get("OPENAI_API_KEY");
        console.log(`OpenAI Key present: ${!!openAIKey}, Content length: ${contentToProcess.length}`);

        if (openAIKey && contentToProcess.length > 50) {
          const baseSystemPrompt = (custom_prompt && custom_prompt.trim().length > 5) 
            ? custom_prompt 
            : "Você é um redator sênior de telejornalismo especializado em grandes reportagens.";
          
          const systemPrompt = (custom_prompt && custom_prompt.trim().length > 5)
            ? `${custom_prompt}\n\nREQUISITOS ADICIONAIS OBRIGATÓRIOS:\n1. O texto DEVE ser separado em parágrafos usando quebras de linha duplas (duas vezes a tecla Enter).\n2. Crie parágrafos curtos e diretos (máximo 4 linhas por parágrafo).\n3. Não use texto em bloco único.\n4. Não inicie o texto com frases como 'Compartilhar matéria', 'Leia mais', ou metadados similares.\n5. O texto deve ser uma narrativa jornalística fluida, coerente e envolvente, contando uma história completa com início, meio e fim.\n6. NÃO use entidades HTML (como &quot;, &amp;, etc), use caracteres normais e aspas comuns.\n7. Utilize uma linguagem rica e variada, evitando repetições e tornando o texto interessante para quem ouve.\n8. Retorne APENAS o conteúdo jornalístico.`
            : `${baseSystemPrompt}
            
            REQUISITOS OBRIGATÓRIOS:
            1. O texto DEVE ter no MÍNIMO 5 parágrafos.
            2. Cada parágrafo deve ser separado por duas quebras de linha (Enter duas vezes).
            3. Use tom jornalístico profissional e narrativo, contando uma história coerente e fluida.
            4. Crie parágrafos curtos para facilitar a leitura no Teleprompter.
            5. Não inicie o texto com 'Compartilhar matéria' ou metadados.
            6. NÃO use entidades HTML como &quot;, use aspas normais (").
            7. Retorne APENAS o texto jornalístico, sem introduções ou comentários adicionais.`;
          
          let attempts = 0;
          let generatedContent = "";
          let isValid = false;

          while (attempts < 3 && !isValid) {
            attempts++;
            console.log(`AI Attempt ${attempts} for URL: ${url}`);
            
            try {
              const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${openAIKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: input_text ? `${custom_prompt}\n\nCONTEÚDO PARA PROCESSAR: ${input_text}\n\nRETORNE UM JSON NO FORMATO: {"materia": "texto da materia aqui", "resumo": "resumo de 1-2 frases aqui"}` : `COM BASE NESTE CONTEÚDO: ${contentToProcess}\n\nEscreva uma matéria jornalística completa e envolvente. RETORNE UM JSON NO FORMATO: {"materia": "texto da materia aqui", "resumo": "resumo de 1-2 frases aqui"}` }
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.7,
                }),
              });

              if (!aiResponse.ok) {
                const errText = await aiResponse.text();
                console.error(`OpenAI API error (${aiResponse.status}): ${errText}`);
                break;
              }

              const aiData = await aiResponse.json();
              const rawContent = aiData.choices?.[0]?.message?.content || "";
              
              try {
                const parsed = JSON.parse(rawContent);
                generatedContent = parsed.materia || "";
                summary = parsed.resumo || "";
              } catch {
                generatedContent = rawContent;
              }
              
              const paragraphList = generatedContent
                .split(/\n\s*\n/)
                .map(p => p.trim())
                .filter(p => p.length > 80);

              const paragraphCount = paragraphList.length;
              const totalChars = generatedContent.length;

              console.log(`Attempt ${attempts}: Parsed ${paragraphCount} paragraphs, ${totalChars} characters.`);

              if (paragraphCount >= 4 || totalChars > 1200) { 
                isValid = true;
              }
            } catch (aiErr) {
              console.error("Fetch to OpenAI failed:", aiErr);
              break;
            }
          }

          journalisticText = generatedContent
            .replace(/\[?(INÍCIO|DESENVOLVIMENTO|CONCLUSÃO|INTRODUÇÃO|FECHAMENTO|CORPO)\]?:?/gi, "")
            .replace(/^\s*(Compartilhar matéria|Compartilhar notícia|Leia mais|Veja também):?\s*/gi, "")
            .trim();
          
          // Improved HTML entity decoding (handles nested entities like &amp;quot;)
          const decodeEntities = (text: string): string => {
            if (!text) return "";
            let decoded = text;
            let previous;
            
            // Loop to handle double encoding
            do {
              previous = decoded;
              decoded = decoded
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ')
                .replace(/&apos;|&#39;/g, "'")
                .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
                .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            } while (decoded !== previous);

            // Specific cleanup for common remaining issues
            return decoded
              .replace(/&[a-z0-9#]+;/gi, (match) => {
                const entities: Record<string, string> = {
                  '&atilde;': 'ã', '&otilde;': 'õ', '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', 
                  '&oacute;': 'ó', '&uacute;': 'ú', '&acirc;': 'â', '&ecirc;': 'ê', '&ocirc;': 'ô', 
                  '&ccedil;': 'ç', '&Agrave;': 'À', '&Egrave;': 'È', '&Igrave;': 'Ì', '&Ograve;': 'Ò', 
                  '&Ugrave;': 'Ù', '&agrave;': 'à', '&egrave;': 'è', '&ìgrave;': 'ì', '&ograve;': 'ò', 
                  '&ugrave;': 'ù'
                };
                return entities[match.toLowerCase()] || match;
              });
          };
          
          journalisticText = decodeEntities(journalisticText);
          if (summary) summary = decodeEntities(summary);
          
          // Ensure double newlines for paragraphs if not present
          if (journalisticText && !journalisticText.includes("\n\n") && journalisticText.includes("\n")) {
            journalisticText = journalisticText.split("\n").filter(p => p.trim().length > 0).join("\n\n");
          }

          if (!journalisticText || journalisticText.length < 50) {
             journalisticText = contentToProcess.length > 100 ? contentToProcess.slice(0, 5000) : "O conteúdo extraído do link foi insuficiente para gerar uma matéria completa automaticamente. Por favor, insira o texto manualmente ou tente outro link.";
          }
        } else if (!openAIKey) {
          console.warn("OPENAI_API_KEY is missing. Returning raw text as fallback.");
          journalisticText = contentToProcess.slice(0, 5000);
        } else {
          console.warn("Content too short to process:", contentToProcess.length);
          journalisticText = contentToProcess.length > 50 ? contentToProcess : "O conteúdo deste link é muito curto para gerar uma matéria completa. Tente um link com mais texto.";
        }
      } catch (e) {
        console.error("AI Generation error:", e);
      }
    }

    return new Response(JSON.stringify({ 
      content: text, 
      journalisticText,
      summary,
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

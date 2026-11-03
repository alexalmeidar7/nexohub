import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FETCH_TIMEOUT = 10000;

async function fetchRssItems(url: string): Promise<{ titulo: string; link: string; imagemUrl: string }[]> {
  try {
    const freshUrl = new URL(url);
    freshUrl.searchParams.set("_cb", Date.now().toString());
    const res = await fetch(freshUrl.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSBot/1.0)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return [];
    const text = await res.text();

    // Parse RSS items
    const items: { titulo: string; link: string; imagemUrl: string }[] = [];
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null && items.length < 10) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
      const link = block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || "";
      const image = block.match(/<media:content[^>]+url=["']([^"']+)/i)?.[1] ||
                    block.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] ||
                    block.match(/<image[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/image>/i)?.[1]?.trim() || "";
      if (title) {
        // Clean pipe and dash suffixes
        let cleanTitle = title.includes("|") ? title.split("|")[0].trim() : title;
        if (cleanTitle.includes(" - ")) cleanTitle = cleanTitle.split(" - ")[0].trim();
        items.push({ titulo: cleanTitle, link, imagemUrl: image });
      }
    }
    return items;
  } catch (e) {
    console.error(`Error fetching RSS ${url}:`, e);
    return [];
  }
}

async function fetchPageMeta(url: string): Promise<{ titulo: string; imagemUrl: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return { titulo: "", imagemUrl: "" };
    const html = await res.text();
    const getMeta = (prop: string): string => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"),
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      ];
      for (const p of patterns) { const m = html.match(p); if (m?.[1]) return m[1]; }
      return "";
    };
    let title = getMeta("og:title") || getMeta("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
    if (title.includes("|")) title = title.split("|")[0].trim();
    if (title.includes(" - ")) title = title.split(" - ")[0].trim();
    const image = getMeta("og:image") || getMeta("twitter:image");
    return { titulo: title, imagemUrl: image };
  } catch {
    return { titulo: "", imagemUrl: "" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { automacao_id, producao_ai_habilitada = true, producao_ai_prompt = "" } = await req.json();

    const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("user_id", user.id).maybeSingle();
    const isAiDisabled = profile?.ai_enabled === false;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!automacao_id) {
      return new Response(JSON.stringify({ error: "automacao_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch automation config
    const { data: automacao, error: autoErr } = await supabase
      .from("programa_automacoes")
      .select("*, programas(nome, estudio)")
      .eq("id", automacao_id)
      .single();

    if (autoErr || !automacao) {
      return new Response(JSON.stringify({ error: "Automação não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect RSS URLs
    const rssUrls: string[] = [...(automacao.sites_source || [])];

    if (automacao.use_custom_news_sites) {
      const { data: customSites } = await supabase
        .from("custom_news_sites")
        .select("rss_url")
        .eq("user_id", user.id);
      if (customSites) {
        for (const s of customSites) {
          if (!rssUrls.includes(s.rss_url)) rssUrls.push(s.rss_url);
        }
      }
    }

    if (rssUrls.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum site de notícia configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch news from all sources
    console.log(`Fetching news from ${rssUrls.length} sources...`);
    const allNewsPromises = rssUrls.map(url => fetchRssItems(url));
    const allNewsArrays = await Promise.all(allNewsPromises);
    const allNews = allNewsArrays.flat();

    if (allNews.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma notícia encontrada nos portais" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to organize news based on briefing
    const programaNome = (automacao as any).programas?.nome || "";
    const estudio = (automacao as any).programas?.estudio || "";
    const briefing = automacao.briefing || "Monte um programa jornalístico com 3 blocos e escalada";

    const newsListText = allNews.map((n, i) => `${i + 1}. ${n.titulo} [LINK:${n.link}] [IMG:${n.imagemUrl}]`).join("\n");

    const aiPrompt = `Você é um produtor de programa jornalístico de rádio/TV. 
Organize as notícias abaixo em um roteiro seguindo as instruções do produtor.

PROGRAMA: ${programaNome}
ESTÚDIO: ${estudio}

INSTRUÇÕES DO PRODUTOR:
${briefing}

NOTÍCIAS DISPONÍVEIS:
${newsListText}

Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "escalada": [{"titulo": "...", "imagemUrl": "...", "resumo": "..."}],
  "blocos": [
    {
      "noticias": [{"titulo": "...", "imagemUrl": "...", "link": "...", "resumo": "...", "texto_materia": "..."}]
    }
  ]
}

Regras:
- producao_ai_habilitada: ${producao_ai_habilitada && !isAiDisabled}
- Se producao_ai_habilitada for TRUE: O campo "texto_materia" DEVE ser uma matéria jornalística COMPLETA, DETALHADA e EXTENSA para ser lida no TP (Teleprompter).
  * OBRIGATÓRIO: Mínimo de 5 parágrafos densos e pelo menos 1500 caracteres por notícia.
  * PROIBIDO: Não retorne apenas resumos ou textos curtos. O usuário exige um texto completo.
  * ESTRUTURA: Início (lead), Desenvolvimento (múltiplos parágrafos com detalhes e contexto) e Conclusão.
  * EXPANSÃO: Se a notícia original for curta, use seu conhecimento para expandir o assunto com contexto histórico, explicações ou impacto do ocorrido. Não economize palavras.
  * TOM: Profissional, sério e adequado para telejornalismo.
${producao_ai_prompt ? `  * INSTRUÇÕES PERSONALIZADAS DO USUÁRIO (SIGA À RISCA): ${producao_ai_prompt}` : ""}
- Se producao_ai_habilitada for FALSE: O campo "texto_materia" deve vir VAZIO.
- "resumo" deve ser um resumo curto (2-3 linhas).
- Use APENAS notícias da lista acima (não invente manchetes)
- Mantenha os links e imagens originais
- Selecione as notícias mais relevantes conforme as instruções
- A escalada deve ter as manchetes mais importantes. No campo "resumo" da escalada, coloque o texto que será lido pelo apresentador. Se o resumo da notícia for bom, use-o na escalada.
- Se as instruções mencionam temas específicos, agrupe por tema nos blocos.`;

    let roteiro: { escalada: any[]; blocos: any[] } = { escalada: [], blocos: [] };
    let attempts = 0;
    const maxAttempts = 3;
    let isValid = false;

    while (attempts < maxAttempts && !isValid) {
      attempts++;
      console.log(`AI Attempt ${attempts} for Automated Roteiro...`);

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Você é um produtor experiente de telejornal/radiojornal brasileiro. Responda APENAS com JSON válido." },
            { role: "user", content: aiPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
        if (attempts === maxAttempts) {
          return new Response(JSON.stringify({ error: `Erro ao gerar roteiro com IA: ${aiResponse.status}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        continue;
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content || "";

      try {
        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        roteiro = JSON.parse(cleaned);

        if (!producao_ai_habilitada || isAiDisabled) {
          isValid = true;
          break;
        }

        // Strict validation for full text
        let allNewsValid = true;
        let totalItems = 0;

        for (const bloco of (roteiro.blocos || [])) {
          for (const n of (bloco.noticias || [])) {
            totalItems++;
            const text = n.texto_materia || "";
            const charCount = text.length;
            const paragraphCount = text.split(/\n+/).filter((p: string) => p.trim().length > 50).length;

            console.log(`Item check: ${charCount} chars, ${paragraphCount} paragraphs`);

            if (charCount < 1500 || paragraphCount < 4) {
              allNewsValid = false;
              console.log(`Validation failed for item: ${(n.titulo || "").slice(0, 30)}...`);
              break;
            }
          }
          if (!allNewsValid) break;
        }

        if (totalItems === 0) {
          console.log("No news items found in AI response.");
          if (attempts === maxAttempts) isValid = true;
        } else if (allNewsValid) {
          isValid = true;
          console.log("All news items passed validation.");
        } else if (attempts === maxAttempts) {
          console.log("Max attempts reached, accepting best-effort result.");
          isValid = true;
        } else {
          console.log(`Attempt ${attempts} failed validation, retrying...`);
        }
      } catch (e) {
        console.error(`Failed to parse AI response on attempt ${attempts}:`, rawContent);
        if (attempts === maxAttempts) {
          return new Response(JSON.stringify({ error: "Não foi possível interpretar a resposta da IA após múltiplas tentativas" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Build paste-format text
    let pasteText = `Estúdio: ${estudio}\nPrograma: ${programaNome}\n\n`;

    if (roteiro.escalada && roteiro.escalada.length > 0) {
      pasteText += "ESCALADA:\n";
      roteiro.escalada.forEach((e, i) => {
        pasteText += `${i + 1}. ${e.resumo || e.titulo}\n`;
      });
      pasteText += "\n";
    }

    if (roteiro.blocos && roteiro.blocos.length > 0) {
      roteiro.blocos.forEach((bloco, bi) => {
        pasteText += `BLOCO ${bi + 1}:\n`;
        (bloco.noticias || []).forEach((n: any) => {
          let line = "";
          if (n.link) {
            line = `- ${n.link}`;
          } else {
            line = `- ${n.titulo}`;
          }
          
          if (n.resumo) line += ` [RESUMO:${n.resumo.replace(/\n/g, "\\n").replace(/\[/g, "(").replace(/\]/g, ")")}]`;
          if (n.texto_materia) line += ` [TEXTO:${n.texto_materia.replace(/\n/g, "\\n").replace(/\[/g, "(").replace(/\]/g, ")")}]`;
          
          pasteText += `${line}\n`;
        });
        pasteText += "\n";
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      pasteText: pasteText.trim(),
      roteiro,
      programaNome,
      estudio,
      totalNoticias: allNews.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-automated-roteiro error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
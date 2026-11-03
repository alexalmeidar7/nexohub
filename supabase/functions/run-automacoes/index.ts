import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const diaSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][now.getDay()];
    const hoje = now.toISOString().split("T")[0];

    // Find automations that should run now (within 5 min window)
    const { data: automacoes, error } = await supabase
      .from("programa_automacoes")
      .select("*, programas(nome, estudio)")
      .eq("ativo", true)
      .contains("dias_semana", [diaSemana]);

    if (error || !automacoes || automacoes.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "Nenhuma automação para executar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter by horario (within 5 minute window)
    const [currH, currM] = currentTime.split(":").map(Number);
    const currMin = currH * 60 + currM;

    const dueAutomacoes = automacoes.filter(a => {
      const [h, m] = (a.horario || "08:00").split(":").map(Number);
      const aMin = h * 60 + m;
      return Math.abs(currMin - aMin) <= 5;
    });

    if (dueAutomacoes.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "Nenhuma automação no horário" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const results: { automacao_id: string; programa: string; ok: boolean; error?: string }[] = [];

    for (const automacao of dueAutomacoes) {
      try {
        // Check if roteiro already exists for today
        const programaNome = (automacao as any).programas?.nome || "";
        const { data: existing } = await supabase
          .from("roteiros")
          .select("id")
          .eq("user_id", automacao.user_id)
          .eq("programa_nome", programaNome)
          .eq("data_programa", hoje)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: true, error: "Roteiro já existe para hoje" });
          continue;
        }

        // Call generate-automated-roteiro internally
        const generateUrl = `${supabaseUrl}/functions/v1/generate-automated-roteiro`;
        
        // Create a temporary auth token for the user
        const { data: userData } = await supabase.auth.admin.getUserById(automacao.user_id);
        if (!userData?.user) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: "Usuário não encontrado" });
          continue;
        }

        // Use service role to call the function on behalf of the user
        const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: `Bearer ${serviceKey}` } },
        });

        // Collect RSS URLs
        const rssUrls: string[] = [...(automacao.sites_source || [])];
        if (automacao.use_custom_news_sites) {
          const { data: customSites } = await supabase
            .from("custom_news_sites")
            .select("rss_url")
            .eq("user_id", automacao.user_id);
          if (customSites) {
            for (const s of customSites) {
              if (!rssUrls.includes(s.rss_url)) rssUrls.push(s.rss_url);
            }
          }
        }

        if (rssUrls.length === 0) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: "Sem sites configurados" });
          continue;
        }

        // Fetch news
        const allNews: { titulo: string; link: string; imagemUrl: string }[] = [];
        for (const url of rssUrls) {
          try {
            const freshUrl = new URL(url);
            freshUrl.searchParams.set("_cb", Date.now().toString());
            const res = await fetch(freshUrl.toString(), {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSBot/1.0)" },
              signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) continue;
            const text = await res.text();
            const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
            let match;
            while ((match = itemRegex.exec(text)) !== null && allNews.length < 30) {
              const block = match[1];
              const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
              const link = block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || "";
              const image = block.match(/<media:content[^>]+url=["']([^"']+)/i)?.[1] || block.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] || "";
              if (title) {
                let cleanTitle = title.includes("|") ? title.split("|")[0].trim() : title;
                if (cleanTitle.includes(" - ")) cleanTitle = cleanTitle.split(" - ")[0].trim();
                allNews.push({ titulo: cleanTitle, link, imagemUrl: image });
              }
            }
          } catch { /* skip */ }
        }

        if (allNews.length === 0) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: "Nenhuma notícia encontrada" });
          continue;
        }

        // Use AI
        if (!OPENAI_API_KEY) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: "OPENAI_API_KEY não configurada" });
          continue;
        }

        const estudio = (automacao as any).programas?.estudio || "";
        const briefing = automacao.briefing || "Monte um programa jornalístico com 3 blocos e escalada";
        const newsListText = allNews.map((n, i) => `${i + 1}. ${n.titulo} [LINK:${n.link}] [IMG:${n.imagemUrl}]`).join("\n");

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
              { role: "user", content: `Organize as notícias abaixo em um roteiro.\n\nPROGRAMA: ${programaNome}\nESTÚDIO: ${estudio}\n\nINSTRUÇÕES: ${briefing}\n\nNOTÍCIAS:\n${newsListText}\n\nRetorne JSON: {"escalada": [{"titulo": "...", "imagemUrl": "..."}], "blocos": [{"noticias": [{"titulo": "...", "imagemUrl": "...", "link": "...", "escalada": false}]}]}` },
            ],
          }),
        });

        if (!aiResponse.ok) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: `AI error ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices?.[0]?.message?.content || "";
        let roteiro: any;
        try {
          roteiro = JSON.parse(rawContent.replace(/```json\n?/g, "").replace(/```/g, "").trim());
        } catch {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: "Erro ao parsear resposta da IA" });
          continue;
        }

        // Save as roteiro
        const blocosData = {
          blocos: (roteiro.blocos || []).map((b: any) => ({
            noticias: (b.noticias || []).map((n: any) => ({
              titulo: n.titulo || "",
              imagemUrl: n.imagemUrl || "",
              escalada: n.escalada || false,
              link: n.link || "",
            })),
          })),
          escaladaList: (roteiro.escalada || []).map((e: any) => ({
            titulo: e.titulo || "",
            imagemUrl: e.imagemUrl || "",
          })),
          participantes: [],
        };

        let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
        if (roteiro.escalada?.length > 0) {
          html += `<h3>📢 ESCALADA</h3><ul>`;
          roteiro.escalada.forEach((e: any) => { html += `<li><strong>${e.titulo}</strong></li>`; });
          html += `</ul>`;
        }
        (roteiro.blocos || []).forEach((b: any, bi: number) => {
          html += `<h3>📺 BLOCO ${bi + 1}</h3><ul>`;
          (b.noticias || []).forEach((n: any) => { html += `<li>${n.titulo}${n.link ? ` <a href="${n.link}">[link]</a>` : ""}</li>`; });
          html += `</ul>`;
        });

        const tickerTitulos = (roteiro.blocos || []).flatMap((b: any) => (b.noticias || []).map((n: any) => n.titulo).filter(Boolean)).join(" | ");

        const { error: insertErr } = await supabase.from("roteiros").insert({
          user_id: automacao.user_id,
          programa_nome: programaNome,
          estudio,
          titulo: `PROGRAMA EXPRESS — ${programaNome}`,
          subtitulo: "",
          tipo_programa: "express",
          data_programa: hoje,
          horario: automacao.horario,
          conteudo_html: html,
          participantes: blocosData,
          status: "agendado",
          tickertitulos: tickerTitulos,
        });

        if (insertErr) {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: false, error: insertErr.message });
        } else {
          results.push({ automacao_id: automacao.id, programa: programaNome, ok: true });
        }
      } catch (e) {
        results.push({ automacao_id: automacao.id, programa: (automacao as any).programas?.nome || "", ok: false, error: e instanceof Error ? e.message : "Erro" });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-automacoes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

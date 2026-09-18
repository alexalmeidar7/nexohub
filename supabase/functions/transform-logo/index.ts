import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRANSFORM_PROMPT = `Use a logo enviada como referência obrigatória. Transforme-a em uma versão FLAT, branca e profissional, preservando rigorosamente a identidade visual original.

Preserve exatamente o desenho, geometria, proporções, símbolos, tipografia, espaçamento, espessura das linhas, contornos e detalhes da marca.

Transforme somente o tratamento visual.

A logo final deve ser:

* branca pura #FFFFFF
* FLAT
* limpa
* minimalista
* nítida
* com aparência vetorial profissional
* centralizada
* 1080 × 1080 pixels
* PNG
* RGBA
* fundo 100% transparente
* canal Alpha preservado

NÃO adicionar:

* 3D
* extrusão
* sombra
* brilho
* reflexos
* gradientes
* textura
* efeito metálico
* iluminação
* perspectiva
* profundidade
* elementos decorativos
* textos adicionais

NÃO alterar:

* letras
* tipografia
* símbolos
* geometria
* proporções
* identidade da marca

Não redesenhe criativamente a logo. Não simplifique detalhes importantes. Não invente elementos. A imagem original deve ser sempre a referência principal.

Nenhuma parte da logo pode ser cortada.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { originalDataUrl, sessionId = `session_${Date.now()}`, version = "version_01" } = await req.json();

    if (!originalDataUrl) {
      return new Response(JSON.stringify({ success: false, error: "Nenhuma imagem original enviada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "OPENAI_API_KEY não configurada no servidor.",
          code: "NO_API_KEY",
          sessionId,
          version,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const matches = originalDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : originalDataUrl;
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const formData = new FormData();
    const blob = new Blob([bytes], { type: "image/png" });
    formData.append("image", blob, "logo.png");
    formData.append("prompt", TRANSFORM_PROMPT);
    formData.append("model", "dall-e-2");
    formData.append("n", "1");
    formData.append("size", "1024x1024");
    formData.append("response_format", "b64_json");

    const openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!openAiRes.ok) {
      const errJson = await openAiRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          success: false,
          error: errJson?.error?.message || `Erro OpenAI (${openAiRes.status})`,
          code: "OPENAI_API_ERROR",
          sessionId,
          version,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await openAiRes.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return new Response(JSON.stringify({ success: false, error: "Imagem não retornada pela OpenAI." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId,
        version,
        imageBase64: `data:image/png;base64,${b64}`,
        width: 1080,
        height: 1080,
        status: "APPROVED_CANDIDATE",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

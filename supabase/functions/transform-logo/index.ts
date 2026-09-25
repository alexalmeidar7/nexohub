import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/edits";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";

const BASE_PROMPT = `Recorte e isole APENAS a logomarca presente na imagem enviada e entregue-a com fundo 100% transparente.

Regras obrigatórias de fidelidade:
- Reproduza a logo exatamente como está na imagem original: todas as letras, palavras, números, slogans, símbolos, ícones, traços finos, contornos e detalhes pequenos.
- Mantenha as cores originais da logo, inclusive gradientes, tonalidades e diferenças de cor entre elementos.
- Mantenha a tipografia, o peso das letras, o espaçamento e as proporções originais.
- Se a imagem for uma foto, um print de tela, um documento ou tiver fundo colorido, remova SOMENTE o fundo, a moldura, a interface do sistema e qualquer elemento que não faça parte da logo.
- Não transforme a logo em silhueta, não deixe em branco sólido, não achate em uma forma única e não remova textos.
- Não invente, não redesenhe, não simplifique e não adicione elementos novos.
- Não adicione sombra, brilho, 3D, textura, borda, moldura ou fundo.

Resultado: a logo completa e legível, centralizada, com margem de respiro, nitidez alta, nenhuma parte cortada, PNG quadrado com canal alpha e fundo totalmente transparente.`;

const RETRY_SUFFIX = `

Nesta nova tentativa, melhore a limpeza das bordas e a nitidez dos detalhes finos, continuando fiel a todas as cores, textos e formas originais da logo.`;

function base64ToBytes(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const {
      originalDataUrl,
      sessionId = `session_${Date.now()}`,
      version = "version_01",
      isRetry = false,
    } = await req.json();

    if (!originalDataUrl || typeof originalDataUrl !== "string") {
      return json({ success: false, error: "Nenhuma imagem original enviada.", code: "NO_IMAGE" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({
        success: false,
        error: "Serviço de imagem não configurado no servidor.",
        code: "NO_API_KEY",
        sessionId,
        version,
      });
    }

    const matches = originalDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mime = matches ? matches[1] : "image/png";
    const base64Data = matches ? matches[2] : originalDataUrl;
    const bytes = base64ToBytes(base64Data);

    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("image", new Blob([bytes], { type: mime }), "logo.png");
    form.append("prompt", isRetry ? `${BASE_PROMPT}${RETRY_SUFFIX}` : BASE_PROMPT);
    form.append("size", "1024x1024");
    form.append("quality", "high");
    form.append("background", "transparent");
    form.append("output_format", "png");
    form.append("n", "1");

    const upstream = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      const message =
        (errBody as any)?.error?.message ||
        (errBody as any)?.message ||
        `Falha no serviço de imagem (${upstream.status})`;
      return json({
        success: false,
        error: message,
        code: upstream.status === 402 || upstream.status === 403 ? "AI_BLOCKED" : "AI_ERROR",
        status: upstream.status,
        sessionId,
        version,
      });
    }

    const data = await upstream.json();
    let b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64 && data?.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url);
      b64 = bytesToBase64(new Uint8Array(await imgRes.arrayBuffer()));
    }
    if (!b64) {
      return json({
        success: false,
        error: "O serviço de imagem não devolveu nenhuma imagem.",
        code: "AI_EMPTY",
        sessionId,
        version,
      });
    }

    return json({
      success: true,
      sessionId,
      version,
      imageBase64: `data:image/png;base64,${b64}`,
      width: 1024,
      height: 1024,
    });
  } catch (err) {
    return json(
      { success: false, error: (err as Error)?.message || "Erro interno", code: "SERVER_ERROR" },
      500,
    );
  }
});

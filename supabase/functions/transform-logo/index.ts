import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/edits";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";

const BASE_PROMPT = `Use a imagem enviada como referência visual obrigatória. Extraia e vetorize APENAS a logomarca, transformando todos os elementos que pertencem à marca em branco puro #FFFFFF e entregando fundo 100% transparente.

Regras obrigatórias de fidelidade:
- Reproduza exatamente todas as letras, palavras, números, slogans, símbolos, ícones, espaços vazados, traços finos, contornos e detalhes pequenos da logo original.
- Converta todas as partes visíveis da logo para branco puro #FFFFFF, preservando separações, vazados e transparências internas. Não preserve nenhuma cor original.
- Mantenha a tipografia, o peso das letras, o espaçamento e as proporções originais.
- Se a imagem for uma foto, print de tela, documento, JPG ou tiver fundo colorido, identifique os limites reais da marca e remova completamente SOMENTE o fundo, a moldura, a interface e qualquer elemento que não faça parte da logo.
- O fundo inteiro do canvas, inclusive atrás e dentro dos espaços vazados da marca, deve ter alpha 0. Nunca crie placa, faixa, quadrado ou retângulo branco atrás da logo.
- Não transforme o conjunto em uma única silhueta sólida: letras e símbolos devem continuar separados e legíveis, com todos os recortes internos preservados.
- Não invente, não redesenhe, não simplifique e não adicione elementos novos.
- Não adicione sombra, brilho, 3D, textura, borda, moldura ou fundo.

Resultado: arte flat com aparência vetorial, logo completa e legível em #FFFFFF, centralizada, com margem de respiro, alta nitidez, nenhuma parte cortada, PNG quadrado com canal alpha e fundo totalmente transparente. O único conteúdo opaco deve ser a própria logo.`;

const RETRY_SUFFIX = `

Nesta nova tentativa, melhore a separação entre a logo e o fundo, a limpeza das bordas, os espaços vazados e a nitidez dos detalhes finos. Mantenha toda a marca branca #FFFFFF e todo o fundo transparente.`;

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
    form.append("quality", "max");
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

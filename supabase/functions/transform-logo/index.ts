import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const OPENAI_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL = "gpt-image-2.5-sunburst";

const BASE_PROMPT = `Transform the uploaded artwork into ONE clean, standalone sponsor logo.

IMPORTANT: The input may be a wide banner, screenshot, co-branding layout, or an image containing multiple independent brands. Do NOT automatically treat the entire image as one logo. Identify the actual sponsor/company/product wordmark and isolate only that brand. Exclude unrelated agency, school, venue, event, presenter, partner, or endorsement logos placed beside it. Also exclude marketing headings, explanatory phrases, captions, and promotional copy that are outside the actual brand lockup; retain only words that are genuinely part of the logo/official wordmark. Example: if a wide image contains the FRACTAL agency logo on the left and the Cambridge arrow/wordmark with "English Qualifications" on the right, the desired output is ONLY the Cambridge arrow/wordmark plus "English Qualifications". Exclude FRACTAL and also exclude the separate heading "We prepare for". This example illustrates the selection rule: isolate the target brand, not every visible logo or phrase in the source image.

For the selected brand:
- Preserve its recognizable identity, original symbol, letterforms, spelling, wording, proportions, spacing, and internal cut-outs as faithfully as possible.
- Convert every visible part of the selected logo to pure white #FFFFFF.
- Remove the entire background and all unrelated surrounding artwork. Every background pixel must be fully transparent (alpha 0), including inside letter counters and open spaces.
- Keep the logo complete and legible. Do not crop any part of the selected logo.
- Center the isolated logo on a 1080 × 1080 transparent PNG canvas with generous, balanced breathing room. Preserve the logo's own aspect ratio; do not stretch it to fill the square.
- Output a clean, flat, sharp, vector-like logo with hard, tidy edges.

Never include the unrelated brand/organization that appears beside the selected sponsor logo. Never keep the original banner, white page, screenshot frame, colored background, box, badge, or rectangular plate.

Do not add new text, symbols, decorations, outlines, shadows, glow, gradients, texture, 3D, reflections, or perspective. Do not invent a new logo or redesign the selected brand. The only opaque pixels in the final image should be the white artwork of the selected standalone logo.`;

const RETRY_SUFFIX = `

Retry: focus on isolating only the standalone sponsor brand, excluding adjacent co-branding/agency marks. Improve fine text and symbol fidelity, preserve the selected brand's integrated tagline, clean all edges, and ensure true transparent alpha everywhere outside the white logo.`;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" }, 405);
  }

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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({
        success: false,
        error: "A chave OPENAI_API_KEY não está configurada nos secrets do Supabase. O ajuste não usará a IA da Lovable.",
        code: "NO_OPENAI_API_KEY",
        sessionId,
        version,
      }, 503);
    }

    const matches = originalDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
    if (!matches) {
      return json({
        success: false,
        error: "Formato de imagem inválido. Envie PNG, JPG ou WEBP.",
        code: "INVALID_IMAGE",
        sessionId,
        version,
      }, 400);
    }

    const mime = matches[1];
    const bytes = base64ToBytes(matches[2]);
    if (bytes.byteLength > 20 * 1024 * 1024) {
      return json({ success: false, error: "A imagem excede o limite de 20 MB.", code: "IMAGE_TOO_LARGE" }, 413);
    }

    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("image[]", new Blob([bytes], { type: mime }), `sponsor-logo.${mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png"}`);
    form.append("prompt", isRetry ? `${BASE_PROMPT}${RETRY_SUFFIX}` : BASE_PROMPT);
    form.append("size", "1024x1024");
    form.append("quality", "high");
    form.append("background", "transparent");
    form.append("output_format", "png");
    form.append("n", "1");

    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      const upstreamMessage =
        (errBody as any)?.error?.message ||
        (errBody as any)?.message ||
        `Falha na API da OpenAI (HTTP ${upstream.status}).`;
      console.error("[transform-logo] OpenAI API error:", upstream.status, upstreamMessage);
      return json({
        success: false,
        error: upstream.status === 401 || upstream.status === 403
          ? "A API da OpenAI recusou a chave ou não tem acesso ao modelo. Confira a chave e a permissão da conta."
          : upstream.status === 429
            ? "Limite ou saldo da API da OpenAI atingido. Confira o uso e o faturamento da conta OpenAI."
            : "Não foi possível processar a logo na API da OpenAI. Tente novamente em instantes.",
        code: upstream.status === 429 ? "OPENAI_RATE_LIMIT" : "OPENAI_API_ERROR",
        status: upstream.status,
        sessionId,
        version,
      }, 502);
    }

    const data = await upstream.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return json({
        success: false,
        error: "A API da OpenAI não retornou a imagem processada.",
        code: "OPENAI_EMPTY",
        sessionId,
        version,
      }, 502);
    }

    return json({
      success: true,
      sessionId,
      version,
      imageBase64: `data:image/png;base64,${b64}`,
      width: 1024,
      height: 1024,
      provider: "openai",
      model: IMAGE_MODEL,
    });
  } catch (err) {
    console.error("[transform-logo] Server error:", err);
    return json({
      success: false,
      error: "Ocorreu um erro interno ao ajustar a logo. Tente novamente.",
      code: "SERVER_ERROR",
    }, 500);
  }
});

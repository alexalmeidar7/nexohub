import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  userId: z.string().uuid(),
  channelId: z.string().uuid().optional(),
});

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !lovableApiKey) {
      return json({ ok: false, error: "Serviço de transcrição não configurado" });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ ok: false, error: "Parâmetros inválidos" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    const authUserId = authData.user?.id;
    if (!authUserId) return json({ ok: false, error: "Sessão expirada" });

    const admin = createClient(supabaseUrl, serviceKey);
    const requestedUserId = parsed.data.userId;
    if (requestedUserId !== authUserId) {
      const { data: subUser } = await admin
        .from("sub_users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .eq("parent_user_id", requestedUserId)
        .eq("ativo", true)
        .maybeSingle();
      if (!subUser) return json({ ok: false, error: "Sem acesso a este streaming" });
    }

    let channelQuery = admin
      .from("streaming_channels")
      .select("id, name, url")
      .eq("user_id", requestedUserId)
      .eq("active", true)
      .eq("type", "audio_live");
    if (parsed.data.channelId) channelQuery = channelQuery.eq("id", parsed.data.channelId);
    const { data: channel } = await channelQuery.order("numero_canal").limit(1).maybeSingle();
    if (!channel?.url) return json({ ok: false, error: "Nenhum canal de áudio ativo encontrado" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);
    const chunks: Uint8Array[] = [];
    let total = 0;
    const maxBytes = 12 * 1024 * 1024;
    let contentType = "audio/mpeg";

    try {
      const streamResponse = await fetch(channel.url, {
        headers: { "User-Agent": "NexoHub-Transcription/1.0", Accept: "audio/*,*/*" },
        signal: controller.signal,
      });
      if (!streamResponse.ok || !streamResponse.body) {
        return json({ ok: false, error: `Streaming indisponível (${streamResponse.status})` });
      }
      contentType = (streamResponse.headers.get("content-type") || "audio/mpeg").split(";")[0];
      const reader = streamResponse.body.getReader();
      while (total < maxBytes) {
        try {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            total += value.byteLength;
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
          break;
        }
      }
      await reader.cancel().catch(() => undefined);
    } finally {
      clearTimeout(timeout);
    }

    if (total < 8_000) return json({ ok: false, error: "O streaming não entregou áudio suficiente" });

    const safeContentType = contentType.includes("aac")
      ? "audio/aac"
      : contentType.includes("ogg")
        ? "audio/ogg"
        : contentType.includes("wav")
          ? "audio/wav"
          : "audio/mpeg";
    const extension = safeContentType === "audio/aac"
      ? "aac"
      : safeContentType === "audio/ogg"
        ? "ogg"
        : safeContentType === "audio/wav"
          ? "wav"
          : "mp3";
    const audioBlob = new Blob(chunks, { type: safeContentType });
    const form = new FormData();
    form.append("file", audioBlob, `stream.${extension}`);
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("language", "pt");
    form.append("response_format", "json");

    const startedAt = new Date(Date.now() - 14_000).toISOString();
    const transcriptionResponse = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Lovable-API-Key": lovableApiKey },
      body: form,
    });
    if (!transcriptionResponse.ok) {
      const detail = await transcriptionResponse.text();
      console.error("[transcribe-stream] transcription failed", transcriptionResponse.status, detail.slice(0, 300));
      let gatewayMessage = "Não foi possível transcrever o áudio";
      try {
        const parsedDetail = JSON.parse(detail);
        gatewayMessage = parsedDetail?.error?.message || parsedDetail?.message || gatewayMessage;
      } catch {
        if (detail.trim()) gatewayMessage = detail.slice(0, 180);
      }
      if (transcriptionResponse.status === 402) {
        gatewayMessage = "Créditos da Lovable AI insuficientes para continuar a transcrição.";
      } else if (transcriptionResponse.status === 403) {
        gatewayMessage = "A Lovable AI está desativada ou bloqueada para este workspace.";
      } else if (transcriptionResponse.status === 429) {
        gatewayMessage = "O serviço de transcrição está temporariamente ocupado. Aguarde um minuto e tente novamente.";
      }
      return json({ ok: false, error: gatewayMessage, status: transcriptionResponse.status });
    }

    const result = await transcriptionResponse.json();
    const text = typeof result?.text === "string" ? result.text.trim() : "";
    if (!text) return json({ ok: true, empty: true, channel: channel.name });

    const { error: insertError } = await admin.from("transcricoes_streaming").insert({
      user_id: requestedUserId,
      texto_transcrito: text,
      timestamp_inicio: startedAt,
      timestamp_fim: new Date().toISOString(),
    });
    if (insertError) {
      console.error("[transcribe-stream] insert failed", insertError.message);
      return json({ ok: false, error: "Erro ao salvar a transcrição" });
    }

    return json({ ok: true, text, channel: channel.name });
  } catch (error) {
    console.error("[transcribe-stream]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erro inesperado" });
  }
});
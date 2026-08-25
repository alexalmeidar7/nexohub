import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  userId: z.string().uuid(),
  channelId: z.string().uuid().optional(),
});

type CapturedAudio = {
  chunks: Uint8Array[];
  total: number;
  contentType: string;
};

const CAPTURE_MS = 14_000;
const HEADER_TIMEOUT_MS = 8_000;
const READ_TIMEOUT_MS = 2_500;
const MIN_AUDIO_BYTES = 8_000;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const STREAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; NexoHub-Transcription/1.0)",
  Accept: "audio/aac,audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
  "Icy-MetaData": "0",
  Connection: "close",
};

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const isRecoverableStreamError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("close_notify") ||
    message.includes("unexpected eof") ||
    message.includes("peer closed") ||
    message.includes("connection closed") ||
    message.includes("connection error") ||
    message.includes("body stream") ||
    message.includes("abort")
  );
};

function mergeBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
}

function decodeHttpChunked(chunks: Uint8Array[]) {
  const source = chunks.reduce((acc, chunk) => mergeBytes(acc, chunk), new Uint8Array(0));
  const decoded: Uint8Array[] = [];
  let index = 0;
  let total = 0;

  while (index < source.byteLength) {
    let lineEnd = -1;
    for (let i = index; i < source.byteLength - 1; i += 1) {
      if (source[i] === 13 && source[i + 1] === 10) {
        lineEnd = i;
        break;
      }
    }
    if (lineEnd < 0) break;

    const line = new TextDecoder().decode(source.slice(index, lineEnd)).split(";", 1)[0].trim();
    const size = Number.parseInt(line, 16);
    if (!Number.isFinite(size) || size < 0) break;
    index = lineEnd + 2;
    if (size === 0) break;
    if (index + size > source.byteLength) break;

    const bodyChunk = source.slice(index, index + size);
    decoded.push(bodyChunk);
    total += bodyChunk.byteLength;
    index += size;
    if (source[index] === 13 && source[index + 1] === 10) index += 2;
  }

  return total > 0 ? { chunks: decoded, total } : { chunks, total: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) };
}

function findHeaderEnd(bytes: Uint8Array) {
  for (let i = 0; i <= bytes.byteLength - 4; i += 1) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i;
  }
  return -1;
}

function parseContentType(headersText: string) {
  const match = headersText.match(/\r?\ncontent-type:\s*([^\r\n;]+)/i);
  return (match?.[1] || "audio/mpeg").trim().toLowerCase();
}

function isChunkedTransfer(headersText: string) {
  return /\r?\ntransfer-encoding:\s*chunked/i.test(headersText);
}

function ensureSuccessfulStatus(headersText: string) {
  const match = headersText.match(/^(?:HTTP\/\d(?:\.\d)?|ICY)\s+(\d+)/i);
  const status = match?.[1] ? Number(match[1]) : 200;
  if (status < 200 || status >= 300) throw new Error(`Streaming indisponível (${status})`);
}

async function readStreamWithDeadline(reader: ReadableStreamDefaultReader<Uint8Array>, deadline: number) {
  const remaining = Math.max(1, Math.min(READ_TIMEOUT_MS, deadline - Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readConnWithDeadline(conn: Deno.TlsConn, buffer: Uint8Array, deadline: number) {
  const remaining = Math.max(1, Math.min(READ_TIMEOUT_MS, deadline - Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      conn.read(buffer),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function captureWithFetch(url: string): Promise<CapturedAudio> {
  const headerController = new AbortController();
  const headerTimeout = setTimeout(() => headerController.abort(), HEADER_TIMEOUT_MS);
  let streamResponse: Response;
  try {
    streamResponse = await fetch(url, {
      headers: STREAM_HEADERS,
      signal: headerController.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(headerTimeout);
  }

  if (!streamResponse.ok || !streamResponse.body) {
    throw new Error(`Streaming indisponível (${streamResponse.status})`);
  }

  const contentType = (streamResponse.headers.get("content-type") || "audio/mpeg").split(";")[0];
  const reader = streamResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + CAPTURE_MS;
  let total = 0;

  try {
    while (Date.now() < deadline && total < MAX_AUDIO_BYTES) {
      try {
        const result = await readStreamWithDeadline(reader, deadline);
        if (result === "timeout" || result.done) break;
        if (result.value) {
          chunks.push(result.value);
          total += result.value.byteLength;
        }
      } catch (error) {
        if (total >= MIN_AUDIO_BYTES && isRecoverableStreamError(error)) break;
        throw error;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return { chunks, total, contentType };
}

async function captureWithRawTls(url: string): Promise<CapturedAudio> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Fallback TLS disponível apenas para HTTPS");

  const port = parsed.port ? Number(parsed.port) : 443;
  const path = `${parsed.pathname || "/"}${parsed.search}`;
  const conn = await Deno.connectTls({ hostname: parsed.hostname, port });
  const request = [
    `GET ${path} HTTP/1.1`,
    `Host: ${parsed.host}`,
    `User-Agent: ${STREAM_HEADERS["User-Agent"]}`,
    `Accept: ${STREAM_HEADERS.Accept}`,
    "Icy-MetaData: 0",
    "Connection: close",
    "",
    "",
  ].join("\r\n");

  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(16 * 1024);
  const decoder = new TextDecoder();
  const deadline = Date.now() + CAPTURE_MS;
  let total = 0;
  let headerBuffer = new Uint8Array(0);
  let contentType = "audio/mpeg";
  let headerParsed = false;
  let chunked = false;

  try {
    await conn.write(new TextEncoder().encode(request));

    while (Date.now() < deadline && total < MAX_AUDIO_BYTES) {
      let readResult: number | null | "timeout";
      try {
        readResult = await readConnWithDeadline(conn, buffer, deadline);
      } catch (error) {
        if (total >= MIN_AUDIO_BYTES && isRecoverableStreamError(error)) break;
        throw error;
      }

      if (readResult === "timeout" || readResult === null) break;
      if (readResult <= 0) continue;

      const value = buffer.slice(0, readResult);
      if (!headerParsed) {
        headerBuffer = mergeBytes(headerBuffer, value);
        const headerEnd = findHeaderEnd(headerBuffer);
        if (headerEnd < 0) {
          if (headerBuffer.byteLength > 64 * 1024) throw new Error("Cabeçalho do streaming inválido");
          continue;
        }

        const headersText = decoder.decode(headerBuffer.slice(0, headerEnd));
        ensureSuccessfulStatus(headersText);
        contentType = parseContentType(headersText);
        chunked = isChunkedTransfer(headersText);
        const bodyStart = headerEnd + 4;
        const remainder = headerBuffer.slice(bodyStart);
        if (remainder.byteLength > 0) {
          chunks.push(remainder);
          total += remainder.byteLength;
        }
        headerParsed = true;
        headerBuffer = new Uint8Array(0);
      } else {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    try {
      conn.close();
    } catch {
      // ignore close errors from non-compliant streaming servers
    }
  }

  if (chunked) {
    const decoded = decodeHttpChunked(chunks);
    return { chunks: decoded.chunks, total: decoded.total, contentType };
  }

  return { chunks, total, contentType };
}

async function captureAudioChunk(url: string): Promise<CapturedAudio> {
  try {
    const captured = await captureWithFetch(url);
    if (captured.total >= MIN_AUDIO_BYTES) return captured;
    throw new Error("O streaming não entregou áudio suficiente");
  } catch (error) {
    if (url.startsWith("https://") && isRecoverableStreamError(error)) {
      console.warn("[transcribe-stream] fetch stream failed, trying raw TLS fallback", error instanceof Error ? error.message : error);
      const captured = await captureWithRawTls(url);
      if (captured.total >= MIN_AUDIO_BYTES) return captured;
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !elevenLabsApiKey) {
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

    const startedAt = new Date(Date.now() - CAPTURE_MS).toISOString();
    let captured: CapturedAudio;
    try {
      captured = await captureAudioChunk(channel.url);
    } catch (error) {
      console.error("[transcribe-stream] stream capture failed", error instanceof Error ? error.message : error);
      return json({
        ok: false,
        error: isRecoverableStreamError(error)
          ? "O servidor do streaming fechou a conexão antes de entregar áudio suficiente. Tente novamente ou use outro canal de áudio."
          : error instanceof Error ? error.message : "Não foi possível ouvir o streaming",
      });
    }

    const { chunks, total, contentType } = captured;
    if (total < MIN_AUDIO_BYTES) return json({ ok: false, error: "O streaming não entregou áudio suficiente" });

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
    form.append("model_id", "scribe_v2");
    form.append("language_code", "por");
    form.append("tag_audio_events", "false");
    form.append("diarize", "false");

    const transcriptionResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsApiKey },
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
      if (transcriptionResponse.status === 401) {
        gatewayMessage = "A integração de transcrição precisa ser reconectada.";
      } else if (transcriptionResponse.status === 402) {
        gatewayMessage = "A integração de transcrição está sem créditos.";
      } else if (transcriptionResponse.status === 403) {
        gatewayMessage = "A integração de transcrição não tem permissão para processar áudio.";
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
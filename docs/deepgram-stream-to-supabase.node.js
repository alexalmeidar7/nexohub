/**
 * REFERÊNCIA (não é executado pelo app)
 * -------------------------------------
 * Escuta uma URL de streaming de áudio (Icecast/Shoutcast/HLS), envia o áudio
 * para o Deepgram (streaming em tempo real) e faz INSERT contínuo na tabela
 * `transcricoes_streaming` do backend.
 *
 * Exemplo legado: rode em Node 18+ com VPS próprio ou Docker local:
 *   npm i @supabase/supabase-js @deepgram/sdk
 *   # ffmpeg precisa estar instalado no sistema
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL=...            (URL do backend)
 *   SUPABASE_SERVICE_ROLE_KEY=...  (chave de servidor — nunca no front-end)
 *   DEEPGRAM_API_KEY=...
 *   STREAM_URL=https://sua-radio.com/stream
 *   USER_ID=uuid-do-usuario-dono-das-transcricoes
 */

import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createClient as createDeepgram, LiveTranscriptionEvents } from "@deepgram/sdk";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const deepgram = createDeepgram(process.env.DEEPGRAM_API_KEY);

const STREAM_URL = process.env.STREAM_URL;
const USER_ID = process.env.USER_ID;

async function salvarTrecho(texto, inicio, fim) {
  if (!texto || !texto.trim()) return;
  const { error } = await supabase.from("transcricoes_streaming").insert({
    user_id: USER_ID,
    texto_transcrito: texto.trim(),
    timestamp_inicio: inicio.toISOString(),
    timestamp_fim: fim.toISOString(),
  });
  if (error) console.error("Falha ao inserir transcrição:", error.message);
}

function start() {
  // 1) Deepgram: conexão de transcrição ao vivo em português
  const live = deepgram.listen.live({
    model: "nova-2",
    language: "pt-BR",
    smart_format: true,
    punctuate: true,
    encoding: "linear16",
    sample_rate: 16000,
    channels: 1,
  });

  let inicioTrecho = new Date();

  live.on(LiveTranscriptionEvents.Open, () => {
    console.log("Deepgram conectado. Iniciando captura do streaming...");

    // 2) ffmpeg converte o streaming remoto em PCM 16 kHz mono
    const ff = spawn("ffmpeg", [
      "-loglevel", "error",
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", STREAM_URL,
      "-ac", "1",
      "-ar", "16000",
      "-f", "s16le",
      "pipe:1",
    ]);

    ff.stdout.on("data", (chunk) => {
      if (live.getReadyState() === 1) live.send(chunk);
    });
    ff.stderr.on("data", (d) => console.error("ffmpeg:", d.toString()));
    ff.on("close", (code) => {
      console.error("ffmpeg encerrou:", code);
      try { live.finish(); } catch {}
    });
  });

  // 3) Cada resultado final vira uma linha na tabela
  live.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data?.channel?.alternatives?.[0];
    const texto = alt?.transcript ?? "";
    if (!texto) return;

    if (data.is_final) {
      const fim = new Date();
      salvarTrecho(texto, inicioTrecho, fim);
      inicioTrecho = fim;
    }
  });

  live.on(LiveTranscriptionEvents.Error, (err) => console.error("Deepgram erro:", err));

  // 4) Reconexão automática
  live.on(LiveTranscriptionEvents.Close, () => {
    console.warn("Conexão fechada. Reconectando em 3s...");
    setTimeout(start, 3000);
  });
}

start();

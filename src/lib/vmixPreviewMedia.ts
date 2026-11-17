export const PREVIEW_VIDEO_RATES = [300, 500, 900] as const;
export type PreviewVideoRate = typeof PREVIEW_VIDEO_RATES[number];
export const PREVIEW_FRAME_RATE = 20;
export const previewRate = (value: unknown): PreviewVideoRate => PREVIEW_VIDEO_RATES.includes(value as PreviewVideoRate) ? value as PreviewVideoRate : 500;

export async function limitPreviewSender(sender: RTCRtpSender, rate: PreviewVideoRate) {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) throw new Error("O navegador não disponibilizou o controle de qualidade do retorno.");
  if (sender.track?.kind === "video") parameters.degradationPreference = "maintain-framerate";
  parameters.encodings.forEach(encoding => {
    encoding.maxBitrate = sender.track?.kind === "audio" ? 64_000 : previewRate(rate) * 1000;
    if (sender.track?.kind === "video") encoding.maxFramerate = PREVIEW_FRAME_RATE;
  });
  await sender.setParameters(parameters);
}

/** Only a selected NDI source is captured. No microphone, desktop or webcam permissions. */
export async function captureNdiPreview(image: HTMLImageElement, audioSource: string, signal: AbortSignal, rate: PreviewVideoRate = 500) {
  const canvas = document.createElement("canvas");
  const width = previewRate(rate) === 900 ? 640 : previewRate(rate) === 300 ? 426 : 480;
  canvas.width = width; canvas.height = width === 640 ? 360 : width === 480 ? 270 : 240;
  const draw = canvas.getContext("2d");
  if (!draw) throw new Error("Não foi possível preparar o vídeo de referência.");
  let video = canvas.captureStream(0);
  let videoTrack = video.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  if (typeof videoTrack.requestFrame !== "function") {
    videoTrack.stop();
    video = canvas.captureStream(PREVIEW_FRAME_RATE);
    videoTrack = video.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  }
  videoTrack.contentHint = "motion";
  const context = new AudioContext({ sampleRate: 48000 });
  const output = context.createMediaStreamDestination();
  const socket = new WebSocket(`ws://127.0.0.1:8765/ndi/audio?source=${encodeURIComponent(audioSource)}`);
  socket.binaryType = "arraybuffer";
  let timer: number | undefined;
  let nextTime = 0;
  let closed = false;
  let end!: () => void;
  const ended = new Promise<void>(resolve => { end = resolve; });
  const stream = new MediaStream([...video.getTracks(), ...output.stream.getTracks()]);
  const stop = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(timer);
    socket.close();
    stream.getTracks().forEach(track => track.stop());
    void context.close();
    signal.removeEventListener("abort", stop);
    end();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (signal.aborted) throw new Error("Retorno cancelado.");
    await context.resume();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("A fonte NDI da mesa não entregou áudio. Verifique a seleção no HMD.")), 10_000);
      const abort = () => { window.clearTimeout(timeout); reject(new Error("Retorno cancelado.")); };
      signal.addEventListener("abort", abort, { once: true });
      const fail = () => { window.clearTimeout(timeout); signal.removeEventListener("abort", abort); reject(new Error("O Bridge não conseguiu receber a fonte NDI da mesa.")); stop(); };
      socket.onerror = fail;
      socket.onclose = fail;
      socket.onmessage = event => {
        if (closed || !(event.data instanceof ArrayBuffer) || event.data.byteLength < 8) return;
        const view = new DataView(event.data);
        const sampleRate = view.getUint32(0, true), channels = view.getUint16(4, true), samples = view.getUint16(6, true);
        if (!channels || channels > 2 || !samples || sampleRate < 8000 || sampleRate > 192000 || event.data.byteLength !== 8 + channels * samples * 4) return;
        const buffer = context.createBuffer(channels, samples, sampleRate);
        const input = new Float32Array(event.data, 8);
        for (let ch = 0; ch < channels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < samples; i++) data[i] = input[i * channels + ch];
        }
        // Bound the local jitter buffer: never accumulate seconds of stale studio audio.
        if (nextTime > context.currentTime + 0.5) return;
        nextTime = Math.max(nextTime, context.currentTime + 0.04);
        const node = context.createBufferSource();
        node.buffer = buffer; node.connect(output); node.start(nextTime);
        node.onended = () => node.disconnect();
        nextTime += buffer.duration;
        if (image.naturalWidth > 0 && image.isConnected) {
          window.clearTimeout(timeout); signal.removeEventListener("abort", abort); resolve();
        }
      };
    });
    const renderFrame = () => {
      if (image.isConnected && image.naturalWidth > 0) {
        draw.drawImage(image, 0, 0, canvas.width, canvas.height);
        videoTrack.requestFrame?.(); // capture immediately after drawing, not on a competing clock
      }
      else stop();
    };
    renderFrame();
    timer = window.setInterval(renderFrame, 1000 / PREVIEW_FRAME_RATE);
    return { stream, stop, ended };
  } catch (error) { stop(); throw error; }
}

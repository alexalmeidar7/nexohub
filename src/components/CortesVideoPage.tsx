import { useState, useMemo, useEffect, useRef } from "react";
import { Scissors, Download, Clock, Link2, Loader2, Play, Copy, ExternalLink, Upload, Youtube, FileVideo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import PremiereTimeline from "./PremiereTimeline";

function toHMS(seconds: number): string {
  const total = Math.max(0, seconds);
  const whole = Math.floor(total);
  const ms = Math.round((total - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = whole % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}.${String(ms).padStart(3, "0")}`;
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHMS(value: string): number {
  const [hms, msStr] = value.split(".");
  const parts = (hms || "").split(":").map((p) => parseInt(p || "0", 10));
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  const ms = msStr ? parseInt(msStr.padEnd(3, "0").slice(0, 3), 10) || 0 : 0;
  return h * 3600 + m * 60 + s + ms / 1000;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00:00.000";
  return toHMS(seconds);
}

function maskHMS(raw: string): string {
  // Accept digits + optional "." for ms; produce HH:MM:SS.mmm
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [intPart, msPart = ""] = cleaned.split(".");
  const digits = intPart.replace(/\D/g, "").slice(0, 6);
  let base = digits;
  if (digits.length > 2) base = digits.slice(0, 2) + ":" + digits.slice(2);
  if (digits.length > 4) base = digits.slice(0, 2) + ":" + digits.slice(2, 4) + ":" + digits.slice(4);
  if (cleaned.includes(".") || msPart) {
    const ms = msPart.replace(/\D/g, "").slice(0, 3);
    return base + "." + ms;
  }
  return base;
}

type Mode = "youtube" | "local";

export default function CortesVideoPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("youtube");

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  // Local file state
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string>("");
  const [localDuration, setLocalDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Shared
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [format, setFormat] = useState<"fullhd" | "reel">("fullhd");
  const [cutting, setCutting] = useState(false);
  const [result, setResult] = useState<{
    blob_url?: string;
    file_name?: string;
    clip_embed_url?: string;
    share_url?: string;
    thumbnail_url?: string;
    download_url?: string;
    duration: number;
    is_local: boolean;
  } | null>(null);

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const startSeconds = parseHMS(startTime);
  const endSeconds = parseHMS(endTime);
  const duration = endSeconds - startSeconds;

  const sourceReady = mode === "youtube" ? !!videoId : !!localFile;
  const canCut = sourceReady && duration > 0 && duration <= 600;

  // Fetch YouTube title
  useEffect(() => {
    if (mode !== "youtube" || !videoId) {
      setVideoTitle("");
      return;
    }
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((r) => r.json())
      .then((data) => setVideoTitle(data.title || ""))
      .catch(() => setVideoTitle(""));
  }, [videoId, mode]);

  // Cleanup local URL
  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
      if (result?.blob_url) URL.revokeObjectURL(result.blob_url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFfmpeg = async () => {
    if (ffmpegRef.current && ffmpegReady) return ffmpegRef.current;
    setStatusMsg("Carregando motor de vídeo (primeira vez ~25MB)...");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress: p }) => {
      setProgress(Math.min(99, Math.round(p * 100)));
    });
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    setFfmpegReady(true);
    return ffmpeg;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "Arquivo inválido", description: "Selecione um arquivo de vídeo.", variant: "destructive" });
      return;
    }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalFile(file);
    setLocalUrl(URL.createObjectURL(file));
    setResult(null);
  };

  const handleCutLocal = async () => {
    if (!localFile || !canCut) return;

    // Validate against actual video duration
    if (localDuration > 0 && endSeconds > Math.ceil(localDuration)) {
      toast({
        title: "Tempo final inválido",
        description: `O vídeo tem apenas ${formatDuration(Math.floor(localDuration))}. Ajuste o tempo final.`,
        variant: "destructive",
      });
      return;
    }
    if (localDuration > 0 && startSeconds >= Math.ceil(localDuration)) {
      toast({
        title: "Tempo inicial inválido",
        description: `O tempo inicial deve ser menor que ${formatDuration(Math.floor(localDuration))}.`,
        variant: "destructive",
      });
      return;
    }

    setCutting(true);
    setProgress(0);
    setResult(null);

    let ffmpegLog = "";
    try {
      const ffmpeg = await loadFfmpeg();
      ffmpeg.on("log", ({ message }) => {
        ffmpegLog += message + "\n";
        console.log("[ffmpeg]", message);
      });

      setStatusMsg("Carregando arquivo...");
      const ext = (localFile.name.split(".").pop() || "mp4").toLowerCase();
      const inputName = `input.${ext}`;
      const outputName = `corte_${Date.now()}.mp4`;

      await ffmpeg.writeFile(inputName, await fetchFile(localFile));

      setStatusMsg("Processando corte...");
      // FULL HD: scale to fit inside 1920x1080 with letterbox-free crop centered.
      // REEL: scale to fill 1080x1920 then center-crop (no stretching).
      const vf =
        format === "reel"
          ? "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
          : "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";
      const exitCode = await ffmpeg.exec([
        "-ss", String(startSeconds),
        "-i", inputName,
        "-t", String(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        outputName,
      ]);

      if (exitCode !== 0) {
        throw new Error(`ffmpeg falhou (código ${exitCode}). Verifique se o formato do vídeo é suportado.`);
      }

      setStatusMsg("Finalizando...");
      const data = await ffmpeg.readFile(outputName);
      const u8 = data as Uint8Array;
      if (!u8 || u8.byteLength === 0) {
        throw new Error("Arquivo gerado está vazio. Verifique os tempos selecionados.");
      }
      const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
      const blob = new Blob([buf], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      setResult({
        blob_url: blobUrl,
        file_name: outputName,
        duration,
        is_local: true,
      });
      setProgress(100);
      setStatusMsg("");
      toast({ title: "Corte gerado!", description: "O vídeo está pronto para download." });
    } catch (err: any) {
      console.error("Cut error:", err, "\nffmpeg log:\n", ffmpegLog);
      toast({
        title: "Erro ao processar",
        description: err?.message || "Falha no processamento. Verifique o console para detalhes.",
        variant: "destructive",
      });
      setStatusMsg("");

    } finally {
      setCutting(false);
    }
  };

  const handleCutYoutube = async () => {
    if (!canCut || !user) return;
    setCutting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cut-youtube-video", {
        body: { youtube_url: youtubeUrl, start_seconds: startSeconds, end_seconds: endSeconds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({
        clip_embed_url: data.clip_embed_url,
        share_url: data.share_url,
        thumbnail_url: data.thumbnail_url,
        download_url: data.download_url || "",
        duration: data.duration,
        is_local: false,
      });
      toast({ title: "Trecho gerado!", description: "Use o player abaixo ou baixe via link externo." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setCutting(false);
    }
  };

  const handleCut = () => (mode === "local" ? handleCutLocal() : handleCutYoutube());

  const handleDownload = () => {
    if (result?.is_local && result.blob_url) {
      const a = document.createElement("a");
      a.href = result.blob_url;
      a.download = result.file_name || "corte.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (result?.download_url) {
      const a = document.createElement("a");
      a.href = result.download_url;
      a.download = `corte_${startTime.replace(/:/g, "-")}_${endTime.replace(/:/g, "-")}.mp4`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (videoId) {
      window.open(`https://www.ssyoutube.com/watch?v=${videoId}&t=${startSeconds}`, "_blank");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!" });
  };

  const now = new Date();
  const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} • ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <Scissors size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cortes de Vídeo</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>YouTube ou arquivo local — até 10 minutos</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-5">
          {([
            { k: "youtube", label: "YouTube", icon: Youtube },
            { k: "local", label: "Arquivo Local", icon: FileVideo },
          ] as const).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => { setMode(k); setResult(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all"
              style={{
                backgroundColor: mode === k ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                color: mode === k ? "#fff" : "var(--layout-page-text, #1a1a1a)",
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Source input */}
        {mode === "youtube" ? (
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>🔗 Link do Vídeo</h3>
            </div>
            <div className="p-5">
              <div className="relative flex items-center">
                <Link2 size={16} className="absolute left-3 pointer-events-none flex-shrink-0" style={{ color: "var(--layout-icon-color, #888888)" }} />
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setResult(null); }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px" }}
                />
              </div>
              {youtubeUrl && !videoId && (
                <p className="text-[10px] mt-1" style={{ color: "#ef4444" }}>URL inválida.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>📁 Arquivo de Vídeo</h3>
            </div>
            <div className="p-5">
              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-bold"
                style={{ border: "2px dashed var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)" }}>
                <Upload size={16} />
                {localFile ? localFile.name : "Selecionar vídeo (.mp4, .mov, .webm...)"}
                <input type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
              </label>
              {localFile && (
                <p className="text-[10px] mt-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                  {(localFile.size / 1024 / 1024).toFixed(1)} MB
                  {localDuration > 0 && ` • Duração: ${formatDuration(localDuration)}`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {(mode === "youtube" && videoId) && (
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="p-4 flex flex-col items-center gap-2">
              <div className="rounded-xl overflow-hidden w-full" style={{ maxWidth: 480 }}>
                <iframe src={`https://www.youtube.com/embed/${videoId}`} title="Preview" className="w-full aspect-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
              {videoTitle && <p className="text-xs font-bold text-center max-w-[480px] leading-snug" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{videoTitle}</p>}
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>{currentTimeStr}</p>
            </div>
          </div>
        )}
        {(mode === "local" && localUrl) && (
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="p-4 flex justify-center">
              <video ref={localVideoRef} src={localUrl} controls className="w-full rounded-xl" style={{ maxWidth: 480 }}
                onLoadedMetadata={(e) => setLocalDuration((e.target as HTMLVideoElement).duration)} />
            </div>
          </div>
        )}

        {/* Premiere-style Timeline (local only — needs CORS access to frames/audio) */}
        {mode === "local" && localUrl && localDuration > 0 && (
          <div className="mb-5">
            <PremiereTimeline
              videoUrl={localUrl}
              duration={localDuration}
              startSec={Math.min(startSeconds, localDuration)}
              endSec={endSeconds > 0 ? Math.min(endSeconds, localDuration) : Math.min(localDuration, 10)}
              onChange={(s, e) => { setStartTime(toHMS(s)); setEndTime(toHMS(e)); }}
              audioFile={localFile}
              videoTitle={localFile?.name}
              externalVideoRef={localVideoRef}
            />
          </div>
        )}


        {/* Time inputs + Format */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-5">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>⏱️ Definir Trecho</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <div className="rounded-xl p-4 flex flex-col items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tempo Inicial</label>
                  <input type="text" value={startTime} onChange={(e) => setStartTime(maskHMS(e.target.value))}
                    placeholder="HH:MM:SS.mmm" maxLength={12}
                    className="w-36 text-center py-2 rounded-lg text-sm font-mono outline-none"
                    style={{ border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #ffffff)" }} />
                </div>

                <div className="flex flex-col items-center justify-center gap-1">
                  <Scissors size={20} style={{ color: duration > 0 ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }} />
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-full"
                    style={{ backgroundColor: duration > 0 ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: duration > 0 ? "#fff" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    <Clock size={14} />
                    <span className="text-sm font-bold font-mono">{formatDuration(duration > 0 ? duration : 0)}</span>
                  </div>
                  {duration > 600 && <p className="text-[10px] mt-1 text-center" style={{ color: "#ef4444" }}>Máximo 10 min</p>}
                </div>

                <div className="rounded-xl p-4 flex flex-col items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tempo Final</label>
                  <input type="text" value={endTime} onChange={(e) => setEndTime(maskHMS(e.target.value))}
                    placeholder="HH:MM:SS.mmm" maxLength={12}
                    className="w-36 text-center py-2 rounded-lg text-sm font-mono outline-none"
                    style={{ border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #ffffff)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Format */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>🎞️ Formato</h3>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {([
                { k: "fullhd" as const, label: "FULL HD", sub: "1920 × 1080", w: 56, h: 32 },
                { k: "reel" as const, label: "REEL", sub: "1080 × 1920", w: 32, h: 56 },
              ]).map(({ k, label, sub, w, h }) => {
                const active = format === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFormat(k)}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                    style={{
                      border: `2px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)"}`,
                      backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" : "transparent",
                    }}
                  >
                    <div
                      style={{
                        width: w, height: h,
                        backgroundColor: active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)",
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div className="text-xs font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{label}</div>
                      <div className="text-[10px] font-mono" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>{sub}</div>
                    </div>
                  </button>
                );
              })}
              <p className="text-[10px] leading-snug" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                {format === "reel"
                  ? "Vertical: o vídeo é centralizado e cortado nas laterais (sem distorção)."
                  : "Horizontal padrão para TV/web."}
              </p>
            </div>
          </div>
        </div>

        {/* Cut button */}
        <div className="flex flex-col items-center gap-2 mb-5">
          <button onClick={handleCut} disabled={!canCut || cutting}
            className="btn-skyglass-accent px-8 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {cutting ? <><Loader2 size={16} className="animate-spin" /> Processando...</> : <><Scissors size={16} /> Gerar Corte</>}
          </button>
          {cutting && mode === "local" && (
            <div className="w-full max-w-md flex flex-col items-center gap-1">
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
                <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: "var(--layout-accent-color, #2563eb)" }} />
              </div>
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                {statusMsg || `${progress}%`}
              </p>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="p-4 flex justify-center">
                <div className="rounded-xl overflow-hidden w-full" style={{ maxWidth: 640 }}>
                  {result.is_local && result.blob_url ? (
                    <video src={result.blob_url} controls autoPlay className="w-full aspect-video bg-black" />
                  ) : (
                    <iframe src={result.clip_embed_url} title="Clip preview" className="w-full aspect-video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
                <div className="flex items-center gap-2">
                  <Play size={14} />
                  <span className="text-sm font-bold">Trecho gerado com sucesso!</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ opacity: 0.7 }}>Duração: {formatDuration(result.duration)}</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#dc2626", color: "#fff" }}>
                  <Download size={12} /> Baixar Vídeo (.mp4)
                </button>
                {!result.is_local && result.share_url && (
                  <>
                    <button onClick={() => copyToClipboard(result.share_url!)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>
                      <Copy size={12} /> Copiar Link com Tempo
                    </button>
                    <button onClick={() => copyToClipboard(result.clip_embed_url!)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "#fff" }}>
                      <Copy size={12} /> Copiar Embed
                    </button>
                    <a href={result.share_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "#16a34a", color: "#fff" }}>
                      <ExternalLink size={12} /> Abrir no YouTube
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

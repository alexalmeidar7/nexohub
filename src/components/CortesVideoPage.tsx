import { useState, useMemo, useEffect, useRef } from "react";
import { Scissors, Download, Clock, Link2, Loader2, Play, Copy, ExternalLink, Upload, Youtube, FileVideo, Plus, Trash2, Crop, Sparkles, Wand2, Monitor, Smartphone, Maximize2 } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import PremiereTimeline from "./PremiereTimeline";
import ClipPreview from "./ClipPreview";

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

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copiado!", description: "Link copiado para a área de transferência." });
};

function loadYoutubeApi(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as any;
    if (w.YT && w.YT.Player) return resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function YoutubeTrimPlayer({ videoId, startSec, endSec }: { videoId: string; startSec: number; endSec: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const rangeRef = useRef({ start: startSec, end: endSec });
  const [current, setCurrent] = useState(startSec);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { rangeRef.current = { start: startSec, end: endSec }; }, [startSec, endSec]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    (async () => {
      await loadYoutubeApi();
      if (cancelled || !containerRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(startSec) },
        events: {
          onReady: () => {
            setReady(true);
            try { playerRef.current.seekTo(rangeRef.current.start, true); } catch {}
          },
          onStateChange: (e: any) => setPlaying(e.data === 1),
        },
      });
      const tick = () => {
        const p = playerRef.current;
        if (p && p.getCurrentTime) {
          try {
            const t = p.getCurrentTime() || 0;
            setCurrent(t);
            const { start, end } = rangeRef.current;
            if (end > start && t >= end - 0.05) {
              p.seekTo(start, true);
              p.pauseVideo();
            } else if (t < start - 0.5) {
              p.seekTo(start, true);
            }
          } catch {}
        }
        raf = window.setTimeout(tick, 200) as unknown as number;
      };
      tick();
    })();
    return () => {
      cancelled = true;
      if (raf) clearTimeout(raf);
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
    };
  }, [videoId]);

  const playTrim = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.seekTo(rangeRef.current.start, true);
      p.playVideo();
    } catch {}
  };
  const pause = () => { try { playerRef.current?.pauseVideo(); } catch {} };

  const total = Math.max(0.001, endSec - startSec);
  const pct = Math.max(0, Math.min(100, ((current - startSec) / total) * 100));

  return (
    <div className="w-full">
      <div className="aspect-video w-full bg-black rounded-xl overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={playing ? pause : playTrim}
          disabled={!ready}
          className="px-3 py-1.5 rounded-md text-[11px] font-semibold"
          style={{ backgroundColor: "var(--layout-primary, #1a1a1a)", color: "var(--layout-primary-text, #ffffff)", opacity: ready ? 1 : 0.5 }}
        >
          {playing ? "Pausar" : "Reproduzir trecho"}
        </button>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}>
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: "var(--layout-primary, #1a1a1a)" }} />
        </div>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
          {fmtTime(Math.max(0, current - startSec))} / {fmtTime(total)}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-mono" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
        {fmtTime(current)} • trecho {fmtTime(startSec)} → {fmtTime(endSec)}
      </p>
    </div>
  );
}



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
  const [loadDetail, setLoadDetail] = useState("");
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ stack?: string; log?: string; exitCode?: number } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const [format, setFormat] = useState<"fullhd" | "reel" | "original">("fullhd");
  type Quality = "low" | "balanced" | "high" | "max";
  const [quality, setQuality] = useState<Quality>("balanced");
  const qualityPresets: Record<Quality, { label: string; sub: string; bitrate: number; hint: string }> = {
    low: { label: "Leve", sub: "~2 Mbps", bitrate: 2_000_000, hint: "Arquivos pequenos, ideal para envio rápido em redes sociais e WhatsApp." },
    balanced: { label: "Equilibrado", sub: "~6 Mbps", bitrate: 6_000_000, hint: "Recomendado: ótimo equilíbrio entre qualidade e tamanho, compatível com a maioria dos players." },
    high: { label: "Alta", sub: "~10 Mbps", bitrate: 10_000_000, hint: "Boa qualidade para edição ou publicação em canais como YouTube/TV." },
    max: { label: "Máxima", sub: "~16 Mbps", bitrate: 16_000_000, hint: "Máxima qualidade — arquivos maiores, indicado para masters e arquivos originais." },
  };

  // Quick effects
  type CropLevel = "none" | "soft" | "medium" | "strong";
  type FadeMode = "none" | "in" | "out" | "both";
  type SharpLevel = "none" | "subtle" | "medium" | "strong";
  const [crop, setCrop] = useState<CropLevel>("none");
  const [fade, setFade] = useState<FadeMode>("none");
  const [sharpness, setSharpness] = useState<SharpLevel>("none");
  const [activeFx, setActiveFx] = useState<"crop" | "fade" | "sharp">("crop");
  const cropZoom: Record<CropLevel, number> = { none: 1, soft: 1.05, medium: 1.15, strong: 1.3 };
  const sharpFilter: Record<SharpLevel, string> = {
    none: "none",
    subtle: "contrast(1.08) saturate(1.05)",
    medium: "contrast(1.15) saturate(1.1)",
    strong: "contrast(1.25) saturate(1.15) brightness(1.02)",
  };
  const FADE_SEC = 0.6;
  const [cutting, setCutting] = useState(false);
  type CutResult = {
    blob_url?: string;
    file_name?: string;
    clip_embed_url?: string;
    share_url?: string;
    thumbnail_url?: string;
    download_url?: string;
    fallback_download_url?: string;
    download_provider?: string;
    is_clip_download?: boolean;
    duration: number;
    is_local: boolean;
    start_seconds?: number;
    end_seconds?: number;
  };
  const [results, setResults] = useState<CutResult[]>([]);
  const result = results[0] || null; // for compatibility with any remaining code using 'result'

  const [clips, setClips] = useState<{ id: string; start: string; end: string }[]>([
    { id: crypto.randomUUID(), start: "00:00:00.000", end: "00:00:10.000" }
  ]);
  const [activeClipId, setActiveClipId] = useState<string>(clips[0].id);

  const activeClip = useMemo(() => clips.find(c => c.id === activeClipId) || clips[0], [clips, activeClipId]);
  const startTime = activeClip.start;
  const endTime = activeClip.end;

  const setStartTime = (val: string) => {
    setClips(prev => prev.map(c => c.id === activeClipId ? { ...c, start: val } : c));
  };
  const setEndTime = (val: string) => {
    setClips(prev => prev.map(c => c.id === activeClipId ? { ...c, end: val } : c));
  };

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const startSeconds = parseHMS(startTime);
  const endSeconds = parseHMS(endTime);
  const duration = endSeconds - startSeconds;

  const sourceReady = mode === "youtube" ? !!videoId : !!localFile;
  const canCut = sourceReady && duration > 0 && duration <= 600;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

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

  // Fetch YouTube video duration via IFrame API
  const [youtubeDuration, setYoutubeDuration] = useState(0);
  useEffect(() => {
    if (mode !== "youtube" || !videoId) { setYoutubeDuration(0); return; }
    let cancelled = false;
    let player: any = null;

    const loadApi = () =>
      new Promise<void>((resolve) => {
        const w = window as any;
        if (w.YT && w.YT.Player) return resolve();
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const s = document.createElement("script");
          s.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(s);
        }
      });

    (async () => {
      await loadApi();
      if (cancelled) return;
      const holder = document.createElement("div");
      holder.style.position = "fixed";
      holder.style.left = "-9999px";
      holder.style.width = "1px";
      holder.style.height = "1px";
      document.body.appendChild(holder);
      const YT = (window as any).YT;
      player = new YT.Player(holder, {
        videoId,
        events: {
          onReady: (e: any) => {
            const d = Math.floor(e.target.getDuration() || 0);
            if (!cancelled && d > 0) setYoutubeDuration(d);
            try { e.target.destroy(); } catch {}
            holder.remove();
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      try { player?.destroy(); } catch {}
    };
  }, [videoId, mode]);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
      results.forEach(res => {
        if (res.blob_url) URL.revokeObjectURL(res.blob_url);
      });
      if (ffmpegRef.current) {
        try {
          ffmpegRef.current.terminate();
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track elapsed and remaining time during cutting
  useEffect(() => {
    if (!cutting) {
      setElapsedSeconds(0);
      setRemainingSeconds(null);
      return;
    }
    startTimeRef.current = Date.now();
    const id = window.setInterval(() => {
      const el = (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(el);
      if (progress > 3 && progress < 100) {
        const total = el / (progress / 100);
        setRemainingSeconds(Math.max(0, total - el));
      }
    }, 300);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutting]);

  useEffect(() => {
    if (!cutting) return;
    const el = (Date.now() - startTimeRef.current) / 1000;
    if (progress > 3 && progress < 100) {
      setRemainingSeconds(Math.max(0, el / (progress / 100) - el));
    }
  }, [progress, cutting]);

  useEffect(() => {
    if (results.length > 0 && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [results]);

  const resetEngine = async () => {
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch (e) {
        console.error("Error terminating ffmpeg:", e);
      }
    }
    ffmpegRef.current = null;
    setFfmpegReady(false);
    setStatusMsg("Reiniciando o motor...");
    await loadFfmpeg();
  };

  const loadFfmpeg = async () => {
    if (ffmpegRef.current && ffmpegReady) return ffmpegRef.current;
    
    setStatusMsg("Carregando motor de vídeo...");
    setLoadDetail("Iniciando...");
    setProgress(0);
    
    const ffmpeg = new FFmpeg();
    
    // O motor de vídeo reporta progresso de 0 a 1 durante o processamento.
    // Vamos mapear isso para 10% - 90% da nossa barra de progresso total durante o corte.
    ffmpeg.on("progress", ({ progress: p }) => {
      // Só atualizamos se estivermos realmente cortando (não apenas carregando)
      // O estado 'cutting' é controlado externamente.
      // Se p for 1, chegamos a 90% do total.
      const mappedProgress = Math.round(10 + (p * 80));
      setProgress(Math.min(90, mappedProgress));
    });

    const hasSAB = typeof SharedArrayBuffer !== "undefined";
    // @ffmpeg/core-mt requires SharedArrayBuffer (COOP/COEP). Otherwise use single-thread core.
    const corePkg = hasSAB ? "@ffmpeg/core-mt" : "@ffmpeg/core";
    const cdns = [
      `https://unpkg.com/${corePkg}@0.12.6/dist/umd`,
      `https://cdn.jsdelivr.net/npm/${corePkg}@0.12.6/dist/umd`,
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd`,
      `https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd`,
    ];
    
    let lastErr: any = null;
    for (const baseURL of cdns) {
      try {
        console.log(`[ffmpeg] Tentando carregar de: ${baseURL} (SAB: ${typeof SharedArrayBuffer !== 'undefined'})`);
        
        const fetchWithProgress = async (url: string, label: string, mime: string) => {
          setLoadDetail(`Iniciando download de ${label}...`);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${label}`);
          
          const reader = response.body?.getReader();
          const contentLength = +(response.headers.get('Content-Length') || 0);
          
          if (!reader) {
            setLoadDetail(`Baixando ${label} (sem progresso)...`);
            return toBlobURL(url, mime);
          }

          let receivedLength = 0;
          const chunks = [];
          while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength) {
              const pct = Math.round((receivedLength / contentLength) * 100);
              const mb = (receivedLength / (1024 * 1024)).toFixed(1);
              const totalMb = (contentLength / (1024 * 1024)).toFixed(1);
              setLoadDetail(`${label}: ${mb}MB de ${totalMb}MB (${pct}%)`);
              // core.js is small (~3MB), wasm is large (~25MB)
              const weight = label === "core.js" ? 0.1 : 0.8;
              const base = label === "core.js" ? 0 : 10;
              setProgress(Math.round(base + (pct * weight)));
            }
          }

          const blob = new Blob(chunks, { type: mime });
          return URL.createObjectURL(blob);
        };

        const coreURL = await fetchWithProgress(`${baseURL}/ffmpeg-core.js`, "core.js", "text/javascript");
        const wasmURL = await fetchWithProgress(`${baseURL}/ffmpeg-core.wasm`, "wasm", "application/wasm");
        
        let workerURL: string | undefined = undefined;
        let canUseWorker = typeof SharedArrayBuffer !== 'undefined';
        
        if (canUseWorker) {
          try {
            workerURL = await fetchWithProgress(`${baseURL}/ffmpeg-core.worker.js`, "worker.js", "text/javascript");
          } catch (e) {
            console.warn("[ffmpeg] Worker load failed, will try without it:", e);
            workerURL = undefined;
            canUseWorker = false;
          }
        }
        
        const tryLoad = async (withWorker: boolean) => {
          setLoadDetail(withWorker ? "Instanciando motor (multithread)..." : "Instanciando motor (single-thread)...");
          setProgress(90);
          
          const loadTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout ao instanciar o motor (${withWorker ? 'multithread' : 'single-thread'}).`)), 30000)
          );

          await Promise.race([
            ffmpeg.load({
              coreURL,
              wasmURL,
              ...(withWorker && workerURL ? { workerURL } : {}),
            }),
            loadTimeout
          ]);
        };

        try {
          await tryLoad(canUseWorker);
        } catch (e: any) {
          if (canUseWorker) {
            console.warn("[ffmpeg] Falha no modo multithread, tentando single-thread...", e);
            await tryLoad(false);
          } else {
            throw e;
          }
        }
        
        lastErr = null;
        setLoadDetail("Motor pronto!");
        setProgress(100);
        console.log(`[ffmpeg] Carregado com sucesso de: ${baseURL} (Modo: ${canUseWorker ? 'Multi' : 'Single'})`);
        break;
      } catch (e: any) {
        console.error("[ffmpeg] CDN load failed:", baseURL, e);
        lastErr = e;
        setLoadDetail(`Falha na CDN ${baseURL.split('/')[2]}: ${e.message || 'Erro desconhecido'}`);
        // Continua para a próxima CDN
      }
    }
    
    if (lastErr) {
      const detail = lastErr?.message ? ` (${lastErr.message})` : "";
      const msg = `Erro ao carregar motor de vídeo${detail}. Verifique sua conexão e tente novamente.`;
      setStatusMsg(msg);
      setLoadDetail("");
      throw new Error(msg);
    }
    
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
    setResults([]);
  };

  const recordClipFromVideo = async (
    file: File,
    startSec: number,
    endSec: number,
    target: "fullhd" | "reel" | "original",
    bitrate: number,
    onProgress: (pct: number) => void,
    onStage: (title: string, detail?: string) => void,
    effects?: { crop: CropLevel; fade: FadeMode; sharpness: SharpLevel }
  ): Promise<Blob> => {
    const clipDuration = endSec - startSec;
    if (clipDuration <= 0) throw new Error("Duração inválida.");
    const fx = effects || { crop: "none" as CropLevel, fade: "none" as FadeMode, sharpness: "none" as SharpLevel };
    const zoom = cropZoom[fx.crop];
    const cssFilter = sharpFilter[fx.sharpness];

    onStage("Preparando vídeo...", "Lendo metadados do arquivo");
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = false;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    (video as any).preservesPitch = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
      });

      const srcW = video.videoWidth || 1920;
      const srcH = video.videoHeight || 1080;
      let outW = srcW, outH = srcH;
      if (target === "fullhd") { outW = 1920; outH = 1080; }
      else if (target === "reel") { outW = 1080; outH = 1920; }

      onStage("Configurando saída...", `Formato ${target.toUpperCase()} • ${outW}×${outH}`);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      const scale = Math.max(outW / srcW, outH / srcH) * zoom;
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const dx = (outW - drawW) / 2;
      const dy = (outH - drawH) / 2;

      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      const audioCtx: AudioContext = new AC();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);

      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeCandidates = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "";
      const codecLabel = mimeType ? mimeType.split(";")[0].replace("video/", "").toUpperCase() : "WEBM";

      const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: bitrate } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      onStage("Posicionando no início do trecho...", `Seek para ${startSec.toFixed(2)}s`);
      await new Promise<void>((resolve, reject) => {
        const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
        video.addEventListener("seeked", onSeek);
        video.addEventListener("error", () => reject(new Error("Erro ao posicionar o vídeo.")), { once: true });
        video.currentTime = Math.max(0, startSec);
      });

      recorder.start(250);
      await video.play();
      onStage("Capturando frames...", `Codec ${codecLabel} • ${clipDuration.toFixed(1)}s a renderizar`);

      let rafId = 0;
      const drawLoop = () => {
        ctx.filter = cssFilter;
        ctx.drawImage(video, dx, dy, drawW, drawH);
        ctx.filter = "none";
        if (fx.fade !== "none") {
          const elapsed = Math.max(0, video.currentTime - startSec);
          let a = 0;
          if ((fx.fade === "in" || fx.fade === "both") && elapsed < FADE_SEC) {
            a = Math.max(a, 1 - elapsed / FADE_SEC);
          }
          const remaining = clipDuration - elapsed;
          if ((fx.fade === "out" || fx.fade === "both") && remaining < FADE_SEC) {
            a = Math.max(a, 1 - Math.max(0, remaining) / FADE_SEC);
          }
          if (a > 0) {
            ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
            ctx.fillRect(0, 0, outW, outH);
          }
        }
        rafId = requestAnimationFrame(drawLoop);
      };
      drawLoop();

      const progInterval = window.setInterval(() => {
        const elapsed = Math.max(0, video.currentTime - startSec);
        const pct = Math.min(95, Math.round((elapsed / clipDuration) * 90) + 5);
        onProgress(pct);
        const remaining = Math.max(0, clipDuration - elapsed);
        onStage("Capturando frames...", `${elapsed.toFixed(1)}s de ${clipDuration.toFixed(1)}s • restam ~${remaining.toFixed(1)}s`);
      }, 200);

      await new Promise<void>((resolve) => {
        const check = () => {
          if (video.currentTime >= endSec || video.ended) {
            video.pause();
            cancelAnimationFrame(rafId);
            window.clearInterval(progInterval);
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });

      onStage("Exportando arquivo...", "Finalizando codificação");
      onProgress(97);
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      try { audioCtx.close(); } catch {}
      canvasStream.getTracks().forEach((t) => t.stop());

      onStage("Montando download...", "Gerando arquivo final");
      onProgress(99);
      const outType = (mimeType || "video/webm").split(";")[0];
      return new Blob(chunks, { type: outType });
    } finally {
      URL.revokeObjectURL(url);
    }
  };


  const handleCutLocal = async () => {
    if (!localFile || clips.length === 0) return;

    try {
      setCutting(true);
      setErrorMsg(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
      setProgress(0);
      setResults([]);

      const sizeMB = localFile.size / (1024 * 1024);
      if (sizeMB > 2000) {
        throw new Error("O vídeo é muito grande (limite 2GB). Use um arquivo menor ou o modo YouTube.");
      }

      const totalClips = clips.length;
      const newResults: CutResult[] = [];

      for (let i = 0; i < totalClips; i++) {
        const clip = clips[i];
        const s = parseHMS(clip.start);
        const e = parseHMS(clip.end);
        const dur = e - s;
        if (dur <= 0) continue;

        setStatusMsg(`Renderizando trecho ${i + 1} de ${totalClips}...`);
        setLoadDetail("");
        const base = (i / totalClips) * 100;
        const step = 100 / totalClips;

        const blob = await recordClipFromVideo(
          localFile, s, e, format, qualityPresets[quality].bitrate,
          (pct) => setProgress(Math.round(base + (pct / 100) * step)),
          (title, detail) => {
            setStatusMsg(`Trecho ${i + 1}/${totalClips} — ${title}`);
            setLoadDetail(detail || "");
          },
          { crop, fade, sharpness }
        );

        const isMp4 = blob.type.includes("mp4");
        const ext = isMp4 ? "mp4" : "webm";
        const blobUrl = URL.createObjectURL(blob);

        newResults.push({
          blob_url: blobUrl,
          file_name: `trecho_${i + 1}_${clip.start.replace(/:/g, "-")}.${ext}`,
          duration: dur,
          is_local: true,
        });
      }

      setResults(newResults);
      setProgress(100);
      setStatusMsg("");
      toast({ title: "Cortes gerados!", description: `${newResults.length} trecho(s) pronto(s) para download.` });
    } catch (err: any) {
      console.error("Cut error:", err);
      const msg = err?.message || "Falha ao renderizar o vídeo.";
      setErrorMsg(msg);
      setErrorDetails({ stack: err?.stack });
      toast({ title: "Erro ao processar", description: msg, variant: "destructive" });
    } finally {
      setCutting(false);
    }
  };

  const handleCutYoutube = async () => {
    if (!videoId || clips.length === 0 || !user) return;

    setCutting(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setResults([]);
    setProgress(0);
    setStatusMsg("Preparando trechos...");
    setLoadDetail("");

    const totalClips = clips.length;
    // Seed placeholder results so cards render immediately and show per-clip status.
    const initialResults: CutResult[] = clips.map((clip) => {
      const s = parseHMS(clip.start);
      const e = parseHMS(clip.end);
      return {
        clip_embed_url: `https://www.youtube.com/embed/${videoId}?start=${Math.floor(s)}&end=${Math.floor(e)}&autoplay=0`,
        share_url: `https://youtu.be/${videoId}?t=${Math.floor(s)}`,
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: Math.max(0, e - s),
        is_local: false,
        start_seconds: s,
        end_seconds: e,
      };
    });
    setResults(initialResults);

    let completed = 0;
    let rateLimited = false;
    let anySuccess = false;
    const failures: string[] = [];

    // Concurrency 2 keeps the RapidAPI quota happy while still parallelising work.
    const CONCURRENCY = 2;
    let cursor = 0;

    const worker = async () => {
      while (cursor < totalClips) {
        const idx = cursor++;
        setStatusMsg(`Gerando trecho ${completed + 1} de ${totalClips}...`);
        try {
          const download = await requestDownloadClipWithRetry(initialResults[idx], idx, 3);
          if (download?.url) {
            anySuccess = true;
            setResults((prev) =>
              prev.map((r, i) =>
                i === idx
                  ? { ...r, blob_url: download.url, file_name: download.fileName, is_clip_download: true }
                  : r,
              ),
            );
          } else {
            failures.push(`Trecho ${idx + 1}: sem arquivo retornado.`);
          }
        } catch (err: any) {
          const msg = err?.message || "Falha desconhecida.";
          if (/429|too many|rate/i.test(msg)) rateLimited = true;
          failures.push(`Trecho ${idx + 1}: ${msg}`);
        } finally {
          completed++;
          setProgress(Math.round((completed / totalClips) * 100));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalClips) }, worker));

      setStatusMsg("");
      setLoadDetail("");

      if (anySuccess && failures.length === 0) {
        toast({ title: "Trechos gerados!", description: `${totalClips} trecho(s) prontos para download.` });
      } else if (anySuccess) {
        toast({
          title: "Alguns trechos falharam",
          description: `${totalClips - failures.length}/${totalClips} concluídos. Os demais podem ser tentados de novo.`,
        });
      } else {
        const banner = rateLimited
          ? "O serviço de corte do YouTube atingiu o limite de requisições. Aguarde alguns minutos ou use o fallback abaixo."
          : "Não foi possível gerar nenhum trecho agora. Serviços externos indisponíveis — use o fallback abaixo.";
        setErrorMsg(banner);
        setErrorDetails({ log: failures.join("\n") });
        toast({ title: "Falha ao gerar trechos", description: banner, variant: "destructive" });
      }
    } finally {
      setCutting(false);
    }
  };


  const handleCut = () => (mode === "local" ? handleCutLocal() : handleCutYoutube());

  const [retryingIdx, setRetryingIdx] = useState<number | null>(null);

  const openDownloadLink = (url: string, fileName?: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || `corte_${startTime.replace(/:/g, "-")}_${endTime.replace(/:/g, "-")}.mp4`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openExternalFallback = () => {
    if (!videoId) return;
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(
      `https://en.savefrom.net/1-youtube-video-downloader-4/?url=${encodeURIComponent(ytUrl)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const requestDownloadClip = async (res: CutResult): Promise<{ url: string; fileName: string } | null> => {
    if (!youtubeUrl || res.start_seconds == null || res.end_seconds == null) return null;
    const { data, error, response } = await supabase.functions.invoke("cut-youtube-video", {
      body: {
        action: "download_clip",
        youtube_url: youtubeUrl,
        start_seconds: res.start_seconds,
        end_seconds: res.end_seconds,
        quality,
      },
      timeout: 120000,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!(data instanceof Blob)) return null;

    if (data.type.includes("application/json")) {
      const payload = JSON.parse(await data.text().catch(() => "{}"));
      throw new Error(payload?.error || "Não foi possível gerar o arquivo do trecho.");
    }

    const disposition = response?.headers.get("content-disposition") || "";
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      || `youtube_${Math.floor(res.start_seconds)}-${Math.floor(res.end_seconds)}.mp4`;
    return { url: URL.createObjectURL(data), fileName };
  };

  const requestDownloadClipWithRetry = async (
    res: CutResult,
    idx: number,
    maxAttempts = 3,
  ): Promise<{ url: string; fileName: string } | null> => {
    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const out = await requestDownloadClip(res);
        if (out?.url) return out;
        lastErr = new Error("Servidor não retornou o arquivo do trecho.");
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || "";
        // Rate limit → longer backoff. Others → linear.
        const isRate = /429|too many|rate/i.test(msg);
        const wait = isRate ? 2500 * attempt : 800 * attempt;
        setStatusMsg(`Trecho ${idx + 1} — nova tentativa ${attempt + 1}/${maxAttempts}${isRate ? " (limite temporário)" : ""}...`);
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr || new Error("Falha ao gerar arquivo.");
  };


  const tryGenerateDownload = async (res: CutResult, idx: number, attempt = 1): Promise<void> => {
    const MAX_ATTEMPTS = 3;
    setRetryingIdx(idx);
    try {
      const download = await requestDownloadClip(res);
      if (download?.url) {
        setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, blob_url: download.url, file_name: download.fileName, is_clip_download: true } : r)));
        openDownloadLink(download.url, download.fileName);
        toast({ title: "Download iniciado" });
        return;
      }
      throw new Error("Servidor não retornou o arquivo do trecho.");
    } catch (err: any) {
      if (attempt < MAX_ATTEMPTS) {
        toast({
          title: `Falha ao gerar link (tentativa ${attempt}/${MAX_ATTEMPTS})`,
          description: "Tentando novamente...",
        });
        await new Promise((r) => setTimeout(r, 800 * attempt));
        return tryGenerateDownload(res, idx, attempt + 1);
      }
      toast({
        title: "Não foi possível gerar o link",
        description: err?.message || "Falha após várias tentativas.",
        variant: "destructive",
        action: (
          <ToastAction altText="Tentar novamente" onClick={() => { void tryGenerateDownload(res, idx, 1); }}>
            Tentar novamente
          </ToastAction>
        ),
      });
    } finally {
      setRetryingIdx((cur) => (cur === idx ? null : cur));
    }
  };

  const handleDownloadRes = (res: CutResult) => {
    if (res.blob_url) {
      const a = document.createElement("a");
      a.href = res.blob_url;
      a.download = res.file_name || "corte.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (res.download_url) {
      openDownloadLink(res.download_url);
      return;
    }
    const idx = results.indexOf(res);
    if (idx >= 0 && res.start_seconds != null && res.end_seconds != null) {
      void tryGenerateDownload(res, idx, 1);
      return;
    }
    if (videoId) {
      openExternalFallback();
      toast({
        title: "Link direto indisponível",
        description: "Abrimos um serviço externo para baixar o vídeo. Recorte o trecho manualmente após o download.",
      });
      return;
    }
    toast({ title: "Erro", description: "Não foi possível localizar o vídeo para download.", variant: "destructive" });
  };


  const handleDownload = () => result && handleDownloadRes(result);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!" });
  };

  const now = new Date();
  const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} • ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  if (loading) return <ModulePageSkeleton variant="list" />;

  const hasSource = (mode === "youtube" && !!videoId) || (mode === "local" && !!localUrl);

  return (
    <div className="nexo-scope animate-fade-in">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 92%, black 8%) 0%, color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 78%, var(--layout-page-bg, #fff) 22%) 100%)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)",
        }}
      >
        {/* ===== TOP TOOLBAR (editor chrome) ===== */}
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{
            background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 85%, black 15%)",
            borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 50%, transparent)",
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" }}>
            <Scissors size={16} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight" style={{ color: "var(--layout-header-text, #fff)" }}>Editor de Cortes</div>
            <div className="text-[10px] opacity-60 truncate" style={{ color: "var(--layout-header-text, #fff)" }}>
              {mode === "youtube" ? (videoTitle || "YouTube") : (localFile?.name || "Arquivo local")} · até 10 min
            </div>
          </div>
          {/* Mode switch — segmented */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 60%, transparent)" }}>
            {([
              { k: "youtube", label: "YouTube", icon: Youtube },
              { k: "local", label: "Local", icon: FileVideo },
            ] as const).map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => { setMode(k); setResults([]); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors"
                style={{
                  backgroundColor: mode === k ? "var(--layout-accent-color, #2563eb)" : "transparent",
                  color: mode === k ? "#fff" : "color-mix(in srgb, var(--layout-header-text, #fff) 70%, transparent)",
                }}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== SOURCE INPUT (compact bar) ===== */}
        <div
          className="px-4 py-3"
          style={{
            background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 70%, black 30%)",
            borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)",
          }}
        >
          {mode === "youtube" ? (
            <div className="relative flex items-center">
              <Link2 size={14} className="absolute left-3 pointer-events-none" style={{ color: "color-mix(in srgb, var(--layout-header-text, #fff) 50%, transparent)" }} />
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => { setYoutubeUrl(e.target.value); setResults([]); }}
                placeholder="Cole aqui o link do YouTube — https://www.youtube.com/watch?v=..."
                className="w-full pl-9 pr-4 py-2 text-xs outline-none rounded-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, black 60%, var(--layout-header-bg, #1a1a1a) 40%)",
                  border: `1px solid ${youtubeUrl && !videoId ? "#ef4444" : "color-mix(in srgb, var(--layout-border-color, #333) 60%, transparent)"}`,
                  color: "var(--layout-header-text, #fff)",
                }}
              />
              {videoId && (
                <span className="ml-2 text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 30%, transparent)", color: "var(--layout-header-text, #fff)" }}>
                  ID {videoId.slice(0, 8)}
                </span>
              )}
            </div>
          ) : (
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs font-bold"
              style={{
                border: "1.5px dashed color-mix(in srgb, var(--layout-header-text, #fff) 25%, transparent)",
                color: "var(--layout-header-text, #fff)",
                backgroundColor: "color-mix(in srgb, black 40%, transparent)",
              }}>
              <Upload size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
              <span className="flex-1 truncate">{localFile ? localFile.name : "Arraste ou selecione um vídeo (.mp4, .mov, .webm…)"}</span>
              {localFile && (
                <span className="text-[10px] font-mono opacity-70">
                  {(localFile.size / 1024 / 1024).toFixed(1)} MB{localDuration > 0 && ` · ${formatDuration(localDuration)}`}
                </span>
              )}
              <input type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
            </label>
          )}
        </div>

        {/* ===== PREVIEW STAGE (cinema) ===== */}
        <div
          className="relative flex items-center justify-center px-4 py-5"
          style={{
            background: "radial-gradient(ellipse at center, #0a0a0a 0%, #000 100%)",
            minHeight: 340,
          }}
        >
          {mode === "youtube" && videoId ? (
            <div className="w-full max-w-3xl rounded-lg overflow-hidden shadow-2xl" style={{ aspectRatio: "16 / 9", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" }}>
              <YoutubeTrimPlayer videoId={videoId} startSec={startSeconds} endSec={endSeconds} />
            </div>
          ) : mode === "local" && localUrl ? (
            <video
              ref={localVideoRef}
              src={localUrl}
              controls
              className="w-full max-w-3xl rounded-lg shadow-2xl"
              style={{ maxHeight: 420, border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" }}
              onLoadedMetadata={(e) => setLocalDuration((e.target as HTMLVideoElement).duration)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center opacity-50">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, white 8%, transparent)" }}>
                {mode === "youtube" ? <Youtube size={28} color="#fff" /> : <FileVideo size={28} color="#fff" />}
              </div>
              <div className="text-xs font-bold" style={{ color: "#fff" }}>Sem vídeo carregado</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {mode === "youtube" ? "Cole um link do YouTube acima" : "Selecione um arquivo de vídeo"}
              </div>
            </div>
          )}
          {hasSource && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono" style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              PREVIEW
            </div>
          )}
          {hasSource && (
            <div className="absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-mono" style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
              {currentTimeStr}
            </div>
          )}
        </div>

        {/* ===== TIMELINE (full width) ===== */}
        {(mode === "local" && localUrl && localDuration > 0) && (
          <div className="px-4 pt-4 pb-2" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 65%, black 35%)", borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)" }}>
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
        {(mode === "youtube" && videoId && youtubeDuration > 0) && (
          <div className="px-4 pt-4 pb-2" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 65%, black 35%)", borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)" }}>
            <PremiereTimeline
              videoUrl=""
              duration={youtubeDuration}
              startSec={Math.min(startSeconds, youtubeDuration)}
              endSec={endSeconds > 0 ? Math.min(endSeconds, youtubeDuration) : Math.min(youtubeDuration, 10)}
              onChange={(s, e) => { setStartTime(toHMS(s)); setEndTime(toHMS(e)); }}
              videoTitle={videoTitle || "YouTube"}
            />
          </div>
        )}

        {/* ===== CLIPS STRIP ===== */}
        <div
          className="px-4 py-3 flex items-center gap-2 flex-wrap"
          style={{
            background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 78%, black 22%)",
            borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)",
          }}
        >
          <div className="flex items-center gap-1.5 mr-2 opacity-70">
            <Scissors size={12} style={{ color: "#fff" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#fff" }}>Trechos</span>
            <span className="text-[10px] opacity-60 font-mono" style={{ color: "#fff" }}>{clips.length}/5</span>
          </div>
          {clips.map((clip, idx) => {
            const isActive = activeClipId === clip.id;
            return (
              <div key={clip.id} className="relative group">
                <button
                  onClick={() => setActiveClipId(clip.id)}
                  className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: isActive ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, white 8%, transparent)",
                    color: "#fff",
                    border: `1px solid ${isActive ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, white 12%, transparent)"}`,
                  }}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${isActive ? 'bg-white/25' : 'bg-black/25'}`}>{idx + 1}</span>
                  <span className="font-mono text-[10px]">{toHMS(parseHMS(clip.start)).split('.')[0]} → {toHMS(parseHMS(clip.end)).split('.')[0]}</span>
                </button>
                {clips.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newClips = clips.filter(c => c.id !== clip.id);
                      setClips(newClips);
                      if (isActive) setActiveClipId(newClips[0].id);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={9} />
                  </button>
                )}
              </div>
            );
          })}
          {clips.length < 5 && (
            <button
              onClick={() => {
                const newId = crypto.randomUUID();
                const lastClip = clips[clips.length - 1];
                const lastEnd = parseHMS(lastClip.end);
                const nextStart = lastEnd;
                const nextEnd = Math.min(localDuration || 3600, nextStart + 10);
                setClips([...clips, { id: newId, start: toHMS(nextStart), end: toHMS(nextEnd) }]);
                setActiveClipId(newId);
              }}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold border-dashed flex items-center gap-1.5"
              style={{ border: "1.5px dashed color-mix(in srgb, white 25%, transparent)", color: "#fff" }}
            >
              <Plus size={12} /> Novo trecho
            </button>
          )}
        </div>

        {/* ===== CONTROL PANELS (3 columns, editor properties) ===== */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-3 p-4"
          style={{
            background: "var(--layout-page-bg, #fff)",
            borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
          }}
        >
          {/* Trim panel */}
          <div className="rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <Clock size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Trim · Trecho #{clips.findIndex(c => c.id === activeClipId) + 1}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>IN</label>
                <input type="text" value={startTime} onChange={(e) => setStartTime(maskHMS(e.target.value))}
                  placeholder="HH:MM:SS.mmm" maxLength={12}
                  className="w-full text-center py-1.5 rounded-md text-xs font-mono outline-none"
                  style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #fff)" }} />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>OUT</label>
                <input type="text" value={endTime} onChange={(e) => setEndTime(maskHMS(e.target.value))}
                  placeholder="HH:MM:SS.mmm" maxLength={12}
                  className="w-full text-center py-1.5 rounded-md text-xs font-mono outline-none"
                  style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #fff)" }} />
              </div>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md"
              style={{ backgroundColor: duration > 0 ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Duração</span>
              <span className="text-xs font-black font-mono" style={{ color: duration > 0 ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)" }}>{formatDuration(duration > 0 ? duration : 0)}</span>
            </div>
            {duration > 600 && <p className="text-[9px] mt-1.5" style={{ color: "#ef4444" }}>⚠ Máximo 10 min por trecho</p>}
          </div>

          {/* Format panel */}
          <div className="rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Formato de saída</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { k: "fullhd" as const, label: "16:9", sub: "1920×1080", Icon: Monitor },
                { k: "reel" as const, label: "9:16", sub: "1080×1920", Icon: Smartphone },
                { k: "original" as const, label: "AUTO", sub: "Original", Icon: Maximize2 },
              ]).map(({ k, label, sub, Icon }) => {
                const active = format === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFormat(k)}
                    className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg transition-all"
                    style={{
                      border: `1.5px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)"}`,
                      backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)",
                      color: active ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)",
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                    <div className="text-[11px] font-black leading-none">{label}</div>
                    <div className="text-[8px] font-mono opacity-60 leading-none" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{sub}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] leading-snug mt-2 opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              {format === "reel"
                ? "Vertical — centralizado, corta laterais (Reels/TikTok)."
                : format === "original"
                ? "Rápido — mantém qualidade e proporção originais."
                : "Horizontal — 1920×1080 (YouTube/TV)."}
            </p>
          </div>

          {/* Quality panel */}
          <div className="rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Qualidade</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(qualityPresets) as Quality[]).map((k) => {
                const active = quality === k;
                const p = qualityPresets[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setQuality(k)}
                    className="relative flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg transition-all text-left"
                    style={{
                      border: `1.5px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)"}`,
                      backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-1 w-full">
                      <span className="text-[11px] font-black" style={{ color: active ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)" }}>{p.label}</span>
                      {k === "balanced" && (
                        <span className="ml-auto text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>PADRÃO</span>
                      )}
                    </div>
                    <div className="text-[8px] font-mono opacity-60 leading-none" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{p.sub}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] leading-snug mt-2 opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              {qualityPresets[quality].hint}
            </p>
          </div>

          {/* Efeitos rápidos panel */}
          <div className="lg:col-span-3 rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Efeitos rápidos</span>
              <span className="text-[9px] font-mono opacity-50" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>aplicados no render local</span>
              {(crop !== "none" || fade !== "none" || sharpness !== "none") && (
                <button
                  type="button"
                  onClick={() => { setCrop("none"); setFade("none"); setSharpness("none"); }}
                  className="ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Icon tabs */}
            <div className="flex items-stretch gap-2 mb-3">
              {([
                { k: "crop" as const, label: "Crop", Icon: Crop, active: crop !== "none", valueLabel: crop === "none" ? null : (crop === "soft" ? "Suave" : crop === "medium" ? "Médio" : "Forte") },
                { k: "fade" as const, label: "Fade", Icon: Sparkles, active: fade !== "none", valueLabel: fade === "none" ? null : (fade === "in" ? "Entrada" : fade === "out" ? "Saída" : "Ambos") },
                { k: "sharp" as const, label: "Nitidez", Icon: Wand2, active: sharpness !== "none", valueLabel: sharpness === "none" ? null : (sharpness === "subtle" ? "Sutil" : sharpness === "medium" ? "Médio" : "Forte") },
              ]).map(({ k, label, Icon, active: hasValue, valueLabel }) => {
                const selected = activeFx === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveFx(k)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left relative"
                    style={{
                      border: `1.5px solid ${selected ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)"}`,
                      backgroundColor: selected ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)",
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded-md"
                      style={{
                        width: 30, height: 30,
                        background: selected ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
                        color: selected ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                      }}
                    >
                      <Icon size={16} strokeWidth={2.2} />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{label}</span>
                      <span className="text-[9px] font-mono opacity-70" style={{ color: hasValue ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)" }}>
                        {valueLabel || "sem efeito"}
                      </span>
                    </div>
                    {hasValue && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--layout-accent-color, #2563eb)" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Options for active effect */}
            <div className="rounded-lg p-2.5" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px dashed color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
              {activeFx === "crop" && (
                <>
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-2 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Crop — zoom central</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([
                      { k: "none" as CropLevel, label: "Sem" },
                      { k: "soft" as CropLevel, label: "Suave" },
                      { k: "medium" as CropLevel, label: "Médio" },
                      { k: "strong" as CropLevel, label: "Forte" },
                    ]).map(({ k, label }) => {
                      const active = crop === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setCrop(k)}
                          className="py-1.5 rounded-md text-[10px] font-bold transition-all"
                          style={{
                            border: `1.5px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 22%, transparent)"}`,
                            backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "var(--layout-page-bg, #fff)",
                            color: active ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {activeFx === "fade" && (
                <>
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-2 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Fade — 0,6s início/fim</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([
                      { k: "none" as FadeMode, label: "Sem" },
                      { k: "in" as FadeMode, label: "Entrada" },
                      { k: "out" as FadeMode, label: "Saída" },
                      { k: "both" as FadeMode, label: "Ambos" },
                    ]).map(({ k, label }) => {
                      const active = fade === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFade(k)}
                          className="py-1.5 rounded-md text-[10px] font-bold transition-all"
                          style={{
                            border: `1.5px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 22%, transparent)"}`,
                            backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "var(--layout-page-bg, #fff)",
                            color: active ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {activeFx === "sharp" && (
                <>
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-2 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nitidez — realce de contraste</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([
                      { k: "none" as SharpLevel, label: "Sem" },
                      { k: "subtle" as SharpLevel, label: "Sutil" },
                      { k: "medium" as SharpLevel, label: "Médio" },
                      { k: "strong" as SharpLevel, label: "Forte" },
                    ]).map(({ k, label }) => {
                      const active = sharpness === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSharpness(k)}
                          className="py-1.5 rounded-md text-[10px] font-bold transition-all"
                          style={{
                            border: `1.5px solid ${active ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-border-color, #333) 22%, transparent)"}`,
                            backgroundColor: active ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "var(--layout-page-bg, #fff)",
                            color: active ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <p className="text-[9px] leading-snug mt-2 opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Efeitos aplicados durante o render final (modo Local). Crop aproxima o centro da cena, fade suaviza início/fim e nitidez realça contraste e cor.
            </p>
          </div>
        </div>

        <div className="px-4 pb-4" style={{ background: "var(--layout-page-bg, #fff)" }}>


        {/* Preview do trecho selecionado */}
        {canCut && (
          <div className="mb-5">
            <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Play size={14} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Pré-visualização do trecho
                </div>
                <div className="text-[10px] font-mono ml-auto" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                  {activeClip.start} → {activeClip.end} • {formatDuration(duration)}
                </div>
              </div>
              <ClipPreview
                mode={mode}
                videoId={videoId}
                localUrl={localUrl}
                startSeconds={startSeconds}
                endSeconds={endSeconds}
                format={format}
                key={`${activeClipId}-${startSeconds}-${endSeconds}-${format}-${mode}`}
              />
              <p className="text-[10px] leading-snug mt-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                Confira o trecho antes de gerar o arquivo final para download.
              </p>
            </div>
          </div>
        )}


        <div className="flex flex-col items-center gap-2 mb-5">
          <button onClick={handleCut} disabled={!canCut || cutting}
            className="btn-skyglass-accent px-8 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {cutting ? <><Loader2 size={16} className="animate-spin" /> Processando...</> : <><Scissors size={16} /> Gerar Corte</>}
          </button>
          {cutting && (
            <div className="w-full max-w-md flex flex-col items-center gap-3 mt-4">
              {(() => {
                const fmt = (s: number) => {
                  const t = Math.max(0, Math.round(s));
                  const m = Math.floor(t / 60);
                  const sec = t % 60;
                  return m > 0 ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
                };
                return (
                  <div className="w-full flex items-center justify-between gap-3 px-1 py-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}>
                    <div className="flex flex-col items-start">
                      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Decorrido</span>
                      <span className="text-sm font-black font-mono tabular-nums" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{fmt(elapsedSeconds)}</span>
                    </div>
                    <div className="flex-1 h-px" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 30%, transparent)" }} />
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Restante</span>
                      <span className="text-sm font-black font-mono tabular-nums" style={{ color: "var(--layout-accent-color, #2563eb)" }}>
                        {remainingSeconds !== null ? `~${fmt(remainingSeconds)}` : "calculando..."}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div className="w-full flex flex-col gap-1 px-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color, #2563eb)" }}>
                    {statusMsg || "Iniciando..."}
                  </span>
                  <span className="text-xs font-black" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    {progress}%
                  </span>
                </div>
                {loadDetail && (
                  <span className="text-[9px] font-mono opacity-60 italic" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    {loadDetail}
                  </span>
                )}
              </div>
              <div className="w-full h-3 rounded-full p-[2px] shadow-inner" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }}>
                <div 
                  className="h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden shadow-sm" 
                  style={{ 
                    width: `${progress}%`, 
                    background: "linear-gradient(90deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 80%, white 20%))" 
                  }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-bar-stripes_1s_linear_infinite]" />
                </div>
              </div>
              <style>{`
                @keyframes progress-bar-stripes {
                  from { background-position: 0 0; }
                  to { background-position: 20px 0; }
                }
              `}</style>
          {errorMsg && !cutting && (
            <div className="w-full max-w-md p-4 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-xs animate-in fade-in slide-in-from-top-2">
              <div className="font-bold flex items-center justify-between gap-2 mb-1">
                <span className="flex items-center gap-2">⚠️ Erro no processamento</span>
                {errorDetails && (
                  <button 
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="underline opacity-70 hover:opacity-100 transition-opacity"
                  >
                    {showErrorDetails ? "Ocultar detalhes" : "Ver detalhes técnicos"}
                  </button>
                )}
              </div>
              <p>{errorMsg}</p>
              
              {showErrorDetails && errorDetails && (
                <div className="mt-3 p-2 rounded bg-black/20 font-mono text-[9px] overflow-auto max-h-40 space-y-2">
                  {errorDetails.exitCode !== undefined && (
                    <div className="text-red-400 font-bold">Exit Code: {errorDetails.exitCode}</div>
                  )}
                  {errorDetails.stack && (
                    <div className="whitespace-pre-wrap border-b border-white/10 pb-2">
                      <div className="opacity-50 mb-1">Stack Trace:</div>
                      {errorDetails.stack}
                    </div>
                  )}
                  {errorDetails.log && (
                    <div className="whitespace-pre-wrap">
                      <div className="opacity-50 mb-1">FFmpeg Log:</div>
                      {errorDetails.log}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button 
                  onClick={resetEngine}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  🔄 Reiniciar Motor
                </button>
                <button 
                  onClick={handleCut}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "white" }}
                >
                  ⚡ Tentar Novamente
                </button>
              </div>

              <p className="mt-2 opacity-70 text-[10px]">
                Dica: Tente usar um vídeo menor ou use o modo YouTube para processamento em servidor.
              </p>
            </div>
          )}
        </div>
      )}
    </div>

        {/* Result List */}
        {results.length > 0 && (
          <div className="space-y-6 mt-8" ref={resultRef}>
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
              <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                <Scissors size={14} className="text-red-500" /> Downloads Disponíveis
              </h4>
              <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest">{results.length} arquivo(s) gerado(s)</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((res, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border transition-all hover:shadow-lg" 
                  style={{ 
                    backgroundColor: "var(--layout-page-bg, #ffffff)", 
                    borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.05)"
                  }}>
                  {/* Miniature/Header */}
                  <div className="relative group aspect-video bg-black overflow-hidden">
                    {res.is_local && res.blob_url ? (
                      <video src={res.blob_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <img src={res.thumbnail_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="thumbnail" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <button 
                        onClick={() => {
                          // Simple preview swap logic if needed, or just download
                          handleDownloadRes(res);
                        }}
                        className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/30"
                      >
                        <Download size={20} />
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white backdrop-blur-sm">
                      {formatDuration(res.duration)}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="truncate">
                        <div className="text-[11px] font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          {res.is_local ? res.file_name : `Trecho YouTube #${idx + 1}`}
                        </div>
                        <div className="text-[9px] opacity-50 font-mono">
                          {res.is_local ? "Processado Localmente" : res.blob_url ? "Arquivo do trecho gerado" : "Pronto para gerar download"}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadRes(res)}
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                        title="Baixar"
                      >
                        <Download size={14} />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {!res.is_local && res.share_url && (
                        <button 
                          onClick={() => copyToClipboard(res.share_url!)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold bg-gray-100 hover:bg-gray-200 transition-colors"
                          style={{ color: "#333" }}
                        >
                          <Copy size={10} /> Link
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-center pt-4">
              <button 
                onClick={() => setResults([])}
                className="text-[10px] font-bold opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
                style={{ color: "var(--layout-page-text, #1a1a1a)" }}
              >
                Limpar todos os downloads
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>

  );
}

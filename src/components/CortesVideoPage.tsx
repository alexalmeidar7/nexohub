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
  const [loadDetail, setLoadDetail] = useState("");
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ stack?: string; log?: string; exitCode?: number } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const [format, setFormat] = useState<"fullhd" | "reel" | "original">("fullhd");
  const [cutting, setCutting] = useState(false);
  type CutResult = {
    blob_url?: string;
    file_name?: string;
    clip_embed_url?: string;
    share_url?: string;
    thumbnail_url?: string;
    download_url?: string;
    duration: number;
    is_local: boolean;
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

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
      results.forEach(res => {
        if (res.blob_url) URL.revokeObjectURL(res.blob_url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (results.length > 0 && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [results]);

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

    const cdns = [
      "https://unpkg.com/@ffmpeg/core-dist@0.12.6/dist/umd",
      "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd",
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd"
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
      const msg = "Erro ao carregar motor de vídeo. Tente recarregar a página.";
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
    setResult(null);
  };

  const handleCutLocal = async () => {
    if (!localFile || !canCut) return;

    let ffmpegLog = "";
    try {
      setCutting(true);
      setErrorMsg(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
      setProgress(0);
      setResult(null);
      
      const ffmpeg = await loadFfmpeg();
      
      if (localDuration > 0 && endSeconds > Math.ceil(localDuration)) {
        toast({
          title: "Tempo final inválido",
          description: `O vídeo tem apenas ${formatDuration(Math.floor(localDuration))}. Ajuste o tempo final.`,
          variant: "destructive",
        });
        setCutting(false);
        return;
      }
      if (localDuration > 0 && startSeconds >= Math.ceil(localDuration)) {
        toast({
          title: "Tempo inicial inválido",
          description: `O tempo inicial deve ser menor que ${formatDuration(Math.floor(localDuration))}.`,
          variant: "destructive",
        });
        setCutting(false);
        return;
      }

      startTimeRef.current = Date.now();
      const sizeMB = localFile.size / (1024 * 1024);
      let estimate = 0;
      if (format === "original") {
        estimate = Math.max(2, sizeMB / 100);
      } else {
        const complexity = format === "reel" ? 1.5 : 1;
        estimate = Math.max(5, (sizeMB * 0.15) * complexity + (duration * 0.2));
      }
      setEstimatedSeconds(Math.round(estimate));

      ffmpeg.on("log", ({ message }) => {
        ffmpegLog += message + "\n";
        console.log("[ffmpeg]", message);
        if (message.includes("frame=")) {
          setStatusMsg(format === "reel" ? "Formatando para REEL..." : "Processando frames...");
        }
      });

      setStatusMsg("Lendo arquivo de vídeo...");
      const ext = (localFile.name.split(".").pop() || "mp4").toLowerCase();
      const inputName = `input.${ext}`;
      const outputName = `corte_${Date.now()}.mp4`;

      setStatusMsg("Lendo arquivo de vídeo (isso pode levar alguns segundos)...");
      setProgress(5);
      const videoData = await fetchFile(localFile);
      await ffmpeg.writeFile(inputName, videoData);

      setStatusMsg("Iniciando o corte...");
      setProgress(10);
      const args: string[] = [];
      
      if (format === "original") {
        setStatusMsg("Cortando vídeo instantaneamente...");
        setProgress(15);
        args.push("-ss", String(startSeconds), "-t", String(duration), "-i", inputName, "-c", "copy");
      } else {
        setStatusMsg("Preparando processamento...");
        const vf =
          format === "reel"
            ? "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
            : "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1";

        let hasAudio = true;
        try {
          setStatusMsg("Verificando faixas de áudio...");
          const probeLog: string[] = [];
          const probeListener = ({ message }: { message: string }) => probeLog.push(message);
          ffmpeg.on("log", probeListener);
          await ffmpeg.exec(["-i", inputName, "-hide_banner"]).catch(() => {});
          ffmpeg.off("log", probeListener);
          hasAudio = probeLog.some((l) => /Stream #\d+:\d+.*Audio:/i.test(l));
        } catch { /* assume audio */ }

        setStatusMsg(format === "reel" ? "Finalizando no formato REEL..." : "Finalizando no formato FULL HD...");
        // IMPORTANTE: Mover -ss ANTES do -i para busca rápida (input seek)
        args.push("-ss", String(startSeconds), "-t", String(duration), "-i", inputName, "-vf", vf,
          "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
        
        if (hasAudio) {
          args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
        } else {
          args.push("-an");
        }
      }
      
      args.push("-movflags", "+faststart", "-y", outputName);
      console.log("[ffmpeg] Executando comando:", args.join(" "));
      const exitCode = await ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`Falha ao recortar (código ${exitCode}). Tente outro trecho ou verifique se o vídeo não está corrompido.`);
      }

      setProgress(92);
      setStatusMsg("Extraindo vídeo processado...");
      const data = await ffmpeg.readFile(outputName);
      
      if (!data) {
        throw new Error("Não foi possível localizar o arquivo gerado pelo motor.");
      }
      
      const dataAsUint8 = data instanceof Uint8Array ? data : new Uint8Array(0);
      const dataLen = typeof data === 'string' ? data.length : dataAsUint8.byteLength;
      console.log(`[ffmpeg] Arquivo lido: ${dataLen} bytes`);
      
      // Garantimos um ArrayBuffer limpo para o Blob.
      let finalData: Uint8Array;
      
      setProgress(95);
      setStatusMsg("Otimizando memória do vídeo...");
      
      try {
        if (data instanceof Uint8Array) {
          if (typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer) {
            console.log("[ffmpeg] Convertendo SharedArrayBuffer para ArrayBuffer...");
            finalData = new Uint8Array(data.byteLength);
            // set() pode ser pesado para arquivos grandes, mas é necessário
            finalData.set(data);
            setProgress(97);
          } else {
            finalData = data;
          }
        } else if (typeof data === 'string') {
          // Caso improvável para vídeo, mas tratamos
          const encoder = new TextEncoder();
          finalData = encoder.encode(data);
        } else {
          finalData = new Uint8Array(0);
        }
      } catch (e) {
        console.error("[ffmpeg] Erro ao processar buffer de saída:", e);
        throw new Error("Erro de memória ao processar o vídeo final. Tente um trecho menor.");
      }

      if (finalData.length < 100) {
        throw new Error("O vídeo gerado está vazio ou inválido. Tente ajustar o tempo de início/fim.");
      }

      // Validação de assinatura MP4 (ftyp)
      // MP4 starts with [any, any, any, any, 'f', 't', 'y', 'p']
      const isMp4 = finalData.length > 8 && 
                    finalData[4] === 0x66 && // f
                    finalData[5] === 0x74 && // t
                    finalData[6] === 0x79 && // y
                    finalData[7] === 0x70;    // p

      if (!isMp4) {
        console.warn("[ffmpeg] Assinatura ftyp não encontrada no início do arquivo.");
        // Não lançamos erro aqui para não bloquear casos específicos, mas registramos no console
      }

      setProgress(98);
      setStatusMsg("Gerando link de download...");
      // Forçamos o tipo para BlobPart para evitar erros de SharedArrayBuffer vs ArrayBuffer no TS
      const blob = new Blob([finalData as unknown as BlobPart], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);
      setProgress(99);

      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      const newResult: CutResult = {
        blob_url: blobUrl,
        file_name: outputName,
        duration,
        is_local: true,
      };
      setResults(prev => [newResult, ...prev]);
      setProgress(100);
      setStatusMsg("");
      toast({ title: "Corte gerado!", description: "O vídeo está pronto para download." });
    } catch (err: any) {
      console.error("Cut error:", err);
      console.error("ffmpeg log context:", ffmpegLog);
      
      const errorMsg = err?.message || "Falha no processamento.";
      setErrorMsg(errorMsg);
      setErrorDetails({
        stack: err?.stack,
        log: ffmpegLog,
        exitCode: err?.exitCode || (errorMsg.includes("código") ? parseInt(errorMsg.match(/\d+/)?.[0] || "0") : undefined)
      });
      toast({
        title: "Erro ao processar",
        description: errorMsg,
        variant: "destructive",
      });
      
      // Armazenar log para debug se necessário
      setLoadDetail(`ERRO: ${errorMsg}`);
      setStatusMsg("");
    } finally {
      setCutting(false);
    }
  };

  const handleCutYoutube = async () => {
    if (!canCut || !user) return;
    setCutting(true);
    setErrorMsg(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setResult(null);
    setProgress(0);
    setStatusMsg("Enviando para o servidor...");
    startTimeRef.current = Date.now();
    
    // Estimate for YouTube (mostly server processing)
    const estimate = 15 + (duration * 0.3);
    setEstimatedSeconds(Math.round(estimate));

    const progressTimer = setInterval(() => {
      setProgress((p) => {
        if (p >= 99) return p;
        
        // Curva assintótica: quanto mais perto de 100, mais devagar aumenta
        // p < 50: +4%
        // p < 80: +2%
        // p < 95: +0.5%
        // p < 99: +0.1%
        let inc = 0;
        if (p < 50) inc = 4;
        else if (p < 80) inc = 2;
        else if (p < 95) inc = 0.5;
        else inc = 0.1;
        
        const nextP = p + inc;
        
        // Dynamic messages based on progress
        if (nextP < 30) setStatusMsg("Conectando ao YouTube...");
        else if (nextP < 70) setStatusMsg("Cortando vídeo no servidor...");
        else if (nextP < 90) setStatusMsg("Finalizando trecho...");
        else if (nextP < 98) setStatusMsg("Recebendo dados do servidor...");
        else setStatusMsg("Preparando player...");
        
        return Math.min(99, nextP);
      });
    }, 600);

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
      setProgress(100);
      setStatusMsg("");
      toast({ title: "Trecho gerado!", description: "Use o player abaixo ou baixe via link externo." });
    } catch (err: any) {
      const errorMsg = err.message || "Tente novamente.";
      setErrorMsg(errorMsg);
      setErrorDetails({
        stack: err.stack,
        log: "Falha na chamada ao servidor (Edge Function)."
      });
      toast({ title: "Erro", description: errorMsg, variant: "destructive" });
      setStatusMsg("");
    } finally {
      clearInterval(progressTimer);
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


        {/* Trechos List */}
        <div className="mb-5 flex flex-wrap gap-2">
          {clips.map((clip, idx) => (
            <div key={clip.id} className="relative group">
              <button
                onClick={() => setActiveClipId(clip.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                style={{
                  backgroundColor: activeClipId === clip.id ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                  color: activeClipId === clip.id ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                  border: activeClipId === clip.id ? "none" : "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)"
                }}
              >
                Trecho {idx + 1}
              </button>
              {clips.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newClips = clips.filter(c => c.id !== clip.id);
                    setClips(newClips);
                    if (activeClipId === clip.id) setActiveClipId(newClips[0].id);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {clips.length < 5 && (
            <button
              onClick={() => {
                const newId = crypto.randomUUID();
                setClips([...clips, { id: newId, start: "00:00:00.000", end: "00:00:10.000" }]);
                setActiveClipId(newId);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold border-2 border-dashed transition-all"
              style={{
                borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)",
                color: "var(--layout-page-text, #1a1a1a)"
              }}
            >
              + Novo Trecho
            </button>
          )}
        </div>

        {/* Time inputs + Format */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-5">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>⏱️ Definir Trecho {clips.findIndex(c => c.id === activeClipId) + 1}</h3>
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
                { k: "original" as const, label: "ORIGINAL", sub: "Sem Alteração", w: 44, h: 44 },
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
                  ? "Vertical: o vídeo é centralizado e cortado nas laterais (ideal para Reels/TikTok)."
                  : format === "original"
                  ? "Ultra-rápido: mantém a qualidade original e corta em segundos (pode haver pequena variação no início/fim)."
                  : "Horizontal padrão: 1920x1080 (YouTube/TV)."}
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
          {cutting && (
            <div className="w-full max-w-md flex flex-col items-center gap-3 mt-4">
              {estimatedSeconds && progress < 100 && (
                <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest animate-pulse" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Tempo estimado: {Math.max(1, Math.round(estimatedSeconds - (progress / 100 * estimatedSeconds)))}s restantes
                </div>
              )}
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
                          {res.is_local ? res.file_name : `Download YouTube #${idx + 1}`}
                        </div>
                        <div className="text-[9px] opacity-50 font-mono">
                          {res.is_local ? "Processado Localmente" : "Processado no Servidor"}
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
  );
}

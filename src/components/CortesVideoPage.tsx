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
import { Slider } from "@/components/ui/slider";

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
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "00:00:00.000";
  const parts = cleaned.split(".");
  const digits = parts[0].padStart(6, "0").slice(-6);
  const ms = (parts[1] || "000").padEnd(3, "0").slice(0, 3);
  const h = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const s = digits.slice(4, 6);
  return `${h}:${m}:${s}.${ms}`;
}

const FADE_SEC = 0.5;

interface Clip {
  id: string;
  start: number;
  end: number;
}

interface CutResult {
  id: string;
  start_seconds: number;
  end_seconds: number;
  blob_url?: string;
  file_name?: string;
  is_clip_download?: boolean;
  is_local?: boolean;
  status?: "pending" | "processing" | "completed" | "error";
  error?: string;
  share_url?: string;
}

const CortesVideoPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"youtube" | "local">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [localDuration, setLocalDuration] = useState(0);

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const [clips, setClips] = useState<Clip[]>([{ id: "1", start: 0, end: 10 }]);
  const [activeClipId, setActiveClipId] = useState("1");
  const activeClip = useMemo(() => clips.find(c => c.id === activeClipId) || clips[0], [clips, activeClipId]);

  const [startTime, setStartTime] = useState("00:00:00.000");
  const [endTime, setEndTime] = useState("00:00:10.000");
  const duration = useMemo(() => parseHMS(endTime) - parseHMS(startTime), [startTime, endTime]);

  const [target, setTarget] = useState<"original" | "fullhd" | "reel">("original");
  const [zoom, setZoom] = useState(1);
  const [quality, setQuality] = useState(720);
  const [bitrate, setBitrate] = useState(5000000);
  const [fx, setFx] = useState<{ fade: "none" | "in" | "out" | "both"; filter: string }>({ fade: "none", filter: "none" });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStage, setProcessStage] = useState("");
  const [processProgress, setProcessProgress] = useState(0);
  const [results, setResults] = useState<CutResult[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await new Promise(r => setTimeout(r, 600));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (activeClip) {
      setStartTime(toHMS(activeClip.start));
      setEndTime(toHMS(activeClip.end));
    }
  }, [activeClipId]);

  useEffect(() => {
    const s = parseHMS(startTime);
    const e = parseHMS(endTime);
    setClips(prev => prev.map(c => c.id === activeClipId ? { ...c, start: s, end: e } : c));
  }, [startTime, endTime]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalFile(file);
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    setResults([]);
  };

  const handleCutLocal = async () => {
    if (!localFile || !localUrl) return;
    setIsProcessing(true);
    setProcessProgress(0);
    setProcessStage("Inicializando FFmpeg...");

    try {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpegRef.current.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
      }
      const ffmpeg = ffmpegRef.current;
      const inputName = "input" + localFile.name.slice(localFile.name.lastIndexOf("."));
      await ffmpeg.writeFile(inputName, await fetchFile(localFile));

      const s = parseHMS(startTime);
      const d = parseHMS(endTime) - s;

      setProcessStage("Processando vídeo...");
      ffmpeg.on("progress", ({ progress }) => setProcessProgress(Math.round(progress * 100)));

      const outName = `cut_${Date.now()}.mp4`;
      await ffmpeg.exec([
        "-ss", s.toString(),
        "-t", d.toString(),
        "-i", inputName,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-c:a", "aac",
        outName
      ]);

      const data = await ffmpeg.readFile(outName);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: "video/mp4" }));

      const newRes: CutResult = {
        id: Math.random().toString(36).slice(2),
        start_seconds: s,
        end_seconds: s + d,
        blob_url: url,
        file_name: outName,
        is_local: true,
        status: "completed"
      };
      setResults(prev => [newRes, ...prev]);
      toast({ title: "Sucesso", description: "Corte concluído!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setProcessStage("");
    }
  };

  const handleCutYoutube = async () => {
    if (!videoId) return;
    setIsProcessing(true);
    setProcessStage("Enviando solicitação ao servidor...");
    try {
      const s = parseHMS(startTime);
      const e = parseHMS(endTime);
      const { data, error } = await supabase.functions.invoke("cut-youtube-video", {
        body: { youtube_url: youtubeUrl, start_seconds: s, end_seconds: e, quality }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newRes: CutResult = {
        id: Math.random().toString(36).slice(2),
        start_seconds: s,
        end_seconds: e,
        share_url: data.share_url,
        file_name: data.file_name,
        status: "completed"
      };
      setResults(prev => [newRes, ...prev]);
      toast({ title: "Sucesso", description: "Vídeo enviado para processamento!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setProcessStage("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Link copiado para a área de transferência." });
  };

  if (loading) return <ModulePageSkeleton variant="list" />;

  const accentColor = "var(--layout-accent-color, #2563eb)";
  const cardBg = "var(--layout-page-bg, #ffffff)";
  const borderSubtle = "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)";

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        Cortes de Vídeo
      </div>
      
      <div className="animate-fade-in flex flex-col h-[calc(100vh-140px)] overflow-hidden rounded-2xl"
        style={{
          border: "2px solid color-mix(in srgb, var(--layout-border-color, #333) 40%, transparent)",
          background: cardBg,
          fontFamily: "'Inter', system-ui, sans-serif",
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        }}>
        
        {/* TOP TOOLBAR */}
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 85%, black 15%)", borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 50%, transparent)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" }}>
            <Scissors size={16} style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight text-white">Editor de Cortes</div>
            <div className="text-[10px] opacity-60 truncate text-white">
              {mode === "youtube" ? (videoTitle || "YouTube") : (localFile?.name || "Arquivo local")} · até 10 min
            </div>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-white/20">
            {(["youtube", "local"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setResults([]); }}
                className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/10'}`}>
                {m === "youtube" ? <Youtube size={12} className="inline mr-1" /> : <FileVideo size={12} className="inline mr-1" />}
                {m === "youtube" ? "YouTube" : "Local"}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto bg-black flex flex-col items-center justify-center p-8">
          {mode === "youtube" ? (
            <div className="w-full max-w-2xl space-y-4">
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                <input type="text" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                  placeholder="Cole o link do YouTube aqui..."
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
              {videoId && (
                <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                  <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}`} frameBorder="0" allowFullScreen />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl">
              <label className="flex flex-col items-center justify-center aspect-video w-full border-2 border-dashed border-white/20 rounded-2xl bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <Upload size={48} className="text-white/20 mb-4" />
                <span className="text-white/60 font-medium">{localFile ? localFile.name : "Clique ou arraste um vídeo para editar"}</span>
                <input type="file" className="hidden" accept="video/*" onChange={handleFileSelect} />
              </label>
              {localUrl && (
                <video src={localUrl} className="mt-4 w-full rounded-xl" controls />
              )}
            </div>
          )}
        </div>

        {/* EDITOR CONTROLS */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Clock size={14} /> Tempo do Corte
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 font-bold uppercase">Início</label>
                  <input type="text" value={startTime} onChange={e => setStartTime(maskHMS(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 font-bold uppercase">Fim</label>
                  <input type="text" value={endTime} onChange={e => setEndTime(maskHMS(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono" />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                <span>Duração total:</span>
                <span className="font-bold">{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Monitor size={14} /> Formato e Qualidade
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["original", "fullhd", "reel"] as const).map(f => (
                  <button key={f} onClick={() => setTarget(f)}
                    className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${target === f ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Qualidade: {quality}p</label>
                <Slider value={[quality]} onValueChange={([v]) => setQuality(v)} min={360} max={1080} step={120} />
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <button onClick={mode === "local" ? handleCutLocal : handleCutYoutube} disabled={isProcessing || (mode === "youtube" && !videoId) || (mode === "local" && !localFile)}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2">
                {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Scissors size={20} />}
                {isProcessing ? processStage || "Processando..." : "GERAR CORTE AGORA"}
              </button>
              {isProcessing && processProgress > 0 && (
                <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${processProgress}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RESULTS AREA */}
        {results.length > 0 && (
          <div className="bg-gray-50 border-t border-gray-200 p-4 max-h-[300px] overflow-y-auto">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Meus Cortes Recentes</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.map(res => (
                <div key={res.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <FileVideo size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate text-gray-900">{res.file_name || "corte_video.mp4"}</p>
                    <p className="text-[9px] text-gray-400">{formatDuration(res.end_seconds - res.start_seconds)}</p>
                    <div className="mt-2 flex gap-2">
                      {res.blob_url ? (
                        <a href={res.blob_url} download={res.file_name} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700">
                          <Download size={12} /> Baixar
                        </a>
                      ) : res.share_url ? (
                        <button onClick={() => copyToClipboard(res.share_url!)} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700">
                          <Copy size={12} /> Copiar Link
                        </button>
                      ) : (
                        <span className="text-[10px] text-orange-500 font-bold">Processando...</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CortesVideoPage;

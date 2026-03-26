import { useState, useMemo, useEffect } from "react";
import { Scissors, Download, Clock, Link2, Loader2, Play, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHMS(value: string): number {
  const parts = value.split(":").map((p) => parseInt(p || "0", 10));
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function maskHMS(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + ":" + digits.slice(2);
  return digits.slice(0, 2) + ":" + digits.slice(2, 4) + ":" + digits.slice(4);
}

export default function CortesVideoPage() {
  const { user } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cutting, setCutting] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDurationText, setVideoDurationText] = useState("");
  const [result, setResult] = useState<{
    clip_embed_url: string;
    share_url: string;
    thumbnail_url: string;
    download_url: string;
    download_quality: string;
    duration: number;
  } | null>(null);

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const startSeconds = parseHMS(startTime);
  const endSeconds = parseHMS(endTime);
  const duration = endSeconds - startSeconds;

  const canCut = videoId && duration > 0 && duration <= 600;

  // Fetch video title via oEmbed
  useEffect(() => {
    if (!videoId) {
      setVideoTitle("");
      setVideoDurationText("");
      return;
    }
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((r) => r.json())
      .then((data) => {
        setVideoTitle(data.title || "");
      })
      .catch(() => setVideoTitle(""));
  }, [videoId]);

  const handleCut = async () => {
    if (!canCut || !user) return;

    setCutting(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("cut-youtube-video", {
        body: {
          youtube_url: youtubeUrl,
          start_seconds: startSeconds,
          end_seconds: endSeconds,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({
        clip_embed_url: data.clip_embed_url,
        share_url: data.share_url,
        thumbnail_url: data.thumbnail_url,
        download_url: data.download_url || "",
        download_quality: data.download_quality || "",
        duration: data.duration,
      });

      toast({
        title: "Corte gerado!",
        description: "O trecho do vídeo está pronto para visualização e compartilhamento.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao processar vídeo",
        description: err.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setCutting(false);
    }
  };

  const handleDownload = () => {
    if (!result?.download_url) {
      window.open(
        `https://www.ssyoutube.com/watch?v=${videoId}&t=${startSeconds}`,
        "_blank"
      );
      return;
    }

    const a = document.createElement("a");
    a.href = result.download_url;
    a.download = `corte_${startTime.replace(/:/g, "-")}_${endTime.replace(/:/g, "-")}.mp4`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!", description: "O link foi copiado para a área de transferência." });
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
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Crie clipes de vídeos do YouTube com até 10 minutos</p>
          </div>
        </div>

        {/* URL Input */}
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
                style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid #0d0446", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              />
            </div>
            {youtubeUrl && !videoId && (
              <p className="text-[10px] mt-1" style={{ color: "#ef4444" }}>URL inválida. Cole um link válido do YouTube.</p>
            )}
          </div>
        </div>

        {/* Video preview */}
        {videoId && (
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="p-4 flex flex-col items-center gap-2">
              <div className="rounded-xl overflow-hidden w-full" style={{ maxWidth: 480 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="Preview"
                  className="w-full aspect-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              {videoTitle && (
                <p className="text-xs font-bold text-center max-w-[480px] leading-snug" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  {videoTitle}
                </p>
              )}
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>{currentTimeStr}</p>
            </div>
          </div>
        )}

        {/* Time inputs */}
        <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>⏱️ Definir Trecho</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="rounded-xl p-4 flex flex-col items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tempo Inicial</label>
                <input
                  type="text" value={startTime} onChange={(e) => setStartTime(maskHMS(e.target.value))}
                  placeholder="HH:MM:SS" maxLength={8}
                  className="w-28 text-center py-2 rounded-lg text-sm font-mono outline-none transition-colors"
                  style={{ border: "1px solid #0d0446", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #ffffff)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
                {videoId && startSeconds > 0 && (
                  <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="Frame" className="w-full max-w-[140px] h-auto rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                )}
              </div>

              <div className="flex flex-col items-center justify-center gap-1">
                <Scissors size={20} style={{ color: duration > 0 ? "#268ffa" : "rgba(13,4,70,0.3)" }} />
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-full"
                  style={{ backgroundColor: duration > 0 ? "#268ffa" : "rgba(13,4,70,0.08)", color: duration > 0 ? "#fff" : "rgba(13,4,70,0.4)" }}>
                  <Clock size={14} />
                  <span className="text-sm font-bold font-mono">{formatDuration(duration > 0 ? duration : 0)}</span>
                </div>
                {duration > 600 && <p className="text-[10px] mt-1 text-center" style={{ color: "#ef4444" }}>Máximo 10 min</p>}
              </div>

              <div className="rounded-xl p-4 flex flex-col items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tempo Final</label>
                <input
                  type="text" value={endTime} onChange={(e) => setEndTime(maskHMS(e.target.value))}
                  placeholder="HH:MM:SS" maxLength={8}
                  className="w-28 text-center py-2 rounded-lg text-sm font-mono outline-none transition-colors"
                  style={{ border: "1px solid #0d0446", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #ffffff)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
                {videoId && endSeconds > 0 && (
                  <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="Frame" className="w-full max-w-[140px] h-auto rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cut button */}
        <div className="flex justify-center mb-5">
          <button onClick={handleCut} disabled={!canCut || cutting}
            className="flex items-center gap-2 px-8 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #444444), color-mix(in srgb, var(--layout-accent-color, #444444) 70%, white 30%))", color: "#fff", border: "none" }}
            onMouseEnter={e => { if (canCut && !cutting) e.currentTarget.style.boxShadow = "0 4px 15px rgba(38,143,250,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
          >
            {cutting ? <><Loader2 size={16} className="animate-spin" /> Processando...</> : <><Scissors size={16} /> Gerar Corte</>}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="p-4 flex justify-center">
                <div className="rounded-xl overflow-hidden w-full" style={{ maxWidth: 640 }}>
                  <iframe src={result.clip_embed_url} title="Clip preview" className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
                <div className="flex items-center gap-2">
                  <Play size={14} className="text-white" />
                  <span className="text-sm font-bold text-white">Trecho gerado com sucesso!</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Duração: {formatDuration(result.duration)}
                  {result.download_quality && ` • Qualidade: ${result.download_quality}`}
                </p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#dc2626", color: "#fff" }}>
                  <Download size={12} /> Baixar Vídeo (.mp4)
                </button>
                <button onClick={() => copyToClipboard(result.share_url)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#268ffa", color: "#fff" }}>
                  <Copy size={12} /> Copiar Link com Tempo
                </button>
                <button onClick={() => copyToClipboard(result.clip_embed_url)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "#fff" }}>
                  <Copy size={12} /> Copiar Embed
                </button>
                <a href={result.share_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#16a34a", color: "#fff" }}>
                  <ExternalLink size={12} /> Abrir no YouTube
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

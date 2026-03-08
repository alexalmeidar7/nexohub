import { useState, useMemo } from "react";
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

function formatHMS(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
  const [result, setResult] = useState<{
    clip_embed_url: string;
    share_url: string;
    thumbnail_url: string;
    duration: number;
  } | null>(null);

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const startSeconds = parseHMS(startTime);
  const endSeconds = parseHMS(endTime);
  const duration = endSeconds - startSeconds;

  const canCut = videoId && duration > 0 && duration <= 600;

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!", description: "O link foi copiado para a área de transferência." });
  };

  return (
    <div className="space-y-6">
      {/* YouTube URL */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#0d0446" }}>
          Link do Vídeo (YouTube)
        </label>
        <div className="relative">
          <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#268ffa]" />
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => { setYoutubeUrl(e.target.value); setResult(null); }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
            style={{ borderColor: "#e2e8f0", backgroundColor: "#fff", color: "#0d0446" }}
          />
        </div>
        {youtubeUrl && !videoId && (
          <p className="text-xs mt-1" style={{ color: "#ef4444" }}>URL inválida. Cole um link válido do YouTube.</p>
        )}
      </div>

      {/* Video preview */}
      {videoId && (
        <div className="rounded-xl overflow-hidden" style={{ maxWidth: 480 }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="Preview"
            className="w-full aspect-video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Time inputs */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        {/* Start time */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#0d0446" }}>
            Tempo Inicial
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(maskHMS(e.target.value))}
              placeholder="HH:MM:SS"
              maxLength={8}
              className="w-28 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
              style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
            />
            {videoId && startSeconds > 0 && (
              <div className="w-24 h-14 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: "#e2e8f0" }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?start=${startSeconds}&autoplay=0&controls=0&showinfo=0&modestbranding=1`}
                  title="Start preview"
                  className="w-[200%] h-[200%] scale-50 origin-top-left pointer-events-none"
                  style={{ border: "none" }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Duration badge */}
        <div className="flex flex-col items-center justify-center pt-6">
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-full" style={{ backgroundColor: duration > 0 ? "#268ffa" : "#e2e8f0", color: duration > 0 ? "#fff" : "#94a3b8" }}>
            <Clock size={14} />
            <span className="text-sm font-bold font-mono">{formatDuration(duration > 0 ? duration : 0)}</span>
          </div>
          {duration > 600 && (
            <p className="text-xs mt-1 text-center" style={{ color: "#ef4444" }}>Máximo 10 minutos</p>
          )}
        </div>

        {/* End time */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#0d0446" }}>
            Tempo Final
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(maskHMS(e.target.value))}
              placeholder="HH:MM:SS"
              maxLength={8}
              className="w-28 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
              style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
            />
            {videoId && endSeconds > 0 && (
              <div className="w-24 h-14 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: "#e2e8f0" }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?start=${endSeconds}&autoplay=0&controls=0&showinfo=0&modestbranding=1`}
                  title="End preview"
                  className="w-[200%] h-[200%] scale-50 origin-top-left pointer-events-none"
                  style={{ border: "none" }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cut button */}
      <button
        onClick={handleCut}
        disabled={!canCut || cutting}
        className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        style={{ backgroundColor: "#268ffa", color: "#fff" }}
      >
        {cutting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Scissors size={16} />
            Gerar Corte
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Clip preview */}
          <div className="rounded-xl overflow-hidden" style={{ maxWidth: 640 }}>
            <iframe
              src={result.clip_embed_url}
              title="Clip preview"
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          {/* Actions */}
          <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div className="flex items-center gap-3">
              <Play size={20} style={{ color: "#16a34a" }} />
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "#166534" }}>Trecho gerado com sucesso!</p>
                <p className="text-xs" style={{ color: "#15803d" }}>
                  Duração: {formatDuration(result.duration)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyToClipboard(result.share_url)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#268ffa", color: "#fff" }}
              >
                <Copy size={12} />
                Copiar Link com Tempo
              </button>
              <button
                onClick={() => copyToClipboard(result.clip_embed_url)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#0d0446", color: "#fff" }}
              >
                <Copy size={12} />
                Copiar Embed
              </button>
              <a
                href={result.share_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#16a34a", color: "#fff" }}
              >
                <ExternalLink size={12} />
                Abrir no YouTube
              </a>
              <a
                href={`https://www.ssyoutube.com/watch?v=${videoId}&t=${result.duration > 0 ? startSeconds : 0}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#dc2626", color: "#fff" }}
              >
                <Download size={12} />
                Baixar Vídeo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

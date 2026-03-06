import { useState, useMemo } from "react";
import { Scissors, Download, Clock, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseTime(min: string, sec: string): number {
  return (parseInt(min || "0", 10) * 60) + parseInt(sec || "0", 10);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

export default function CortesVideoPage() {
  const { user } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startMin, setStartMin] = useState("");
  const [startSec, setStartSec] = useState("");
  const [endMin, setEndMin] = useState("");
  const [endSec, setEndSec] = useState("");
  const [cutting, setCutting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  const videoId = useMemo(() => extractYoutubeId(youtubeUrl), [youtubeUrl]);

  const startSeconds = parseTime(startMin, startSec);
  const endSeconds = parseTime(endMin, endSec);
  const duration = endSeconds - startSeconds;

  const startThumbUrl = videoId && startSeconds > 0
    ? `https://img.youtube.com/vi/${videoId}/0.jpg`
    : null;
  const endThumbUrl = videoId && endSeconds > 0
    ? `https://img.youtube.com/vi/${videoId}/0.jpg`
    : null;

  const canCut = videoId && duration > 0 && duration <= 600;

  const handleCut = async () => {
    if (!canCut || !user) return;

    setCutting(true);
    setDownloadUrl(null);

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

      setDownloadUrl(data.download_url);
      setExpiresAt(new Date(Date.now() + 10 * 60 * 1000));

      toast({
        title: "Corte finalizado!",
        description: "O link de download estará disponível por 10 minutos.",
      });

      // Auto-clear after 10 minutes
      setTimeout(() => {
        setDownloadUrl(null);
        setExpiresAt(null);
      }, 10 * 60 * 1000);
    } catch (err: any) {
      toast({
        title: "Erro ao cortar vídeo",
        description: err.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setCutting(false);
    }
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
            onChange={(e) => setYoutubeUrl(e.target.value)}
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
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={startMin}
                onChange={(e) => setStartMin(e.target.value)}
                placeholder="00"
                className="w-16 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
                style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
              />
              <span className="text-xs" style={{ color: "#64748b" }}>min</span>
              <span className="text-lg font-bold" style={{ color: "#0d0446" }}>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={startSec}
                onChange={(e) => setStartSec(e.target.value)}
                placeholder="00"
                className="w-16 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
                style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
              />
              <span className="text-xs" style={{ color: "#64748b" }}>seg</span>
            </div>
            {/* Thumbnail at start */}
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
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={endMin}
                onChange={(e) => setEndMin(e.target.value)}
                placeholder="00"
                className="w-16 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
                style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
              />
              <span className="text-xs" style={{ color: "#64748b" }}>min</span>
              <span className="text-lg font-bold" style={{ color: "#0d0446" }}>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={endSec}
                onChange={(e) => setEndSec(e.target.value)}
                placeholder="00"
                className="w-16 text-center py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#268ffa]/30"
                style={{ borderColor: "#e2e8f0", color: "#0d0446" }}
              />
              <span className="text-xs" style={{ color: "#64748b" }}>seg</span>
            </div>
            {/* Thumbnail at end */}
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
            Cortando vídeo...
          </>
        ) : (
          <>
            <Scissors size={16} />
            Cortar Vídeo
          </>
        )}
      </button>

      {/* Download link */}
      {downloadUrl && (
        <div className="rounded-xl p-4 flex items-center gap-4" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <Download size={20} style={{ color: "#16a34a" }} />
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: "#166534" }}>Vídeo cortado com sucesso!</p>
            <p className="text-xs" style={{ color: "#15803d" }}>
              Link expira em 10 minutos{expiresAt ? ` (${expiresAt.toLocaleTimeString("pt-BR")})` : ""}
            </p>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#16a34a", color: "#fff" }}
          >
            Baixar Vídeo
          </a>
        </div>
      )}
    </div>
  );
}

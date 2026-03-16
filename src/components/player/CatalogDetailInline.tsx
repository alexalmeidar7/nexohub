import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Play, Film, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Channel {
  id: string;
  name: string;
  cover_url: string | null;
  logo_url: string | null;
  background_url: string | null;
  type: string;
  url?: string;
  catalog_name?: string;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

interface CatalogDetailInlineProps {
  catalogName: string;
  onBack: () => void;
  onPlayVideo: (channelId: string, videoId: string) => void;
}

export default function CatalogDetailInline({ catalogName, onBack, onPlayVideo }: CatalogDetailInlineProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<PlaylistVideo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch channels for this catalog group
  useEffect(() => {
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("streaming_channels")
        .select("id, name, cover_url, logo_url, background_url, type, url, catalog_name")
        .eq("type", "catalog")
        .eq("active", true);

      const filtered = (data || []).filter(ch => (ch.catalog_name || "Catálogo") === catalogName);
      setChannels(filtered);
    };
    fetchChannels();
  }, [catalogName]);

  // Fetch playlist videos
  useEffect(() => {
    if (channels.length === 0) return;
    setLoading(true);
    const fetchVideos = async () => {
      const allVideos: PlaylistVideo[] = [];
      for (const ch of channels) {
        if (!ch.url) continue;
        const plMatch = ch.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        const playlistId = plMatch?.[1];
        if (!playlistId) continue;
        try {
          const { data, error } = await supabase.functions.invoke("youtube-playlist", { body: { playlistId } });
          if (!error && data?.videos) {
            allVideos.push(...data.videos);
          }
        } catch {}
      }
      allVideos.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
      setVideos(allVideos);
      if (allVideos.length > 0) setSelectedVideo(allVideos[0]);
      setLoading(false);
    };
    fetchVideos();
  }, [channels]);

  const primaryChannel = channels[0];
  const logoUrl = primaryChannel?.background_url || primaryChannel?.logo_url;
  // Use first video's maxres thumbnail as hero background
  const heroBackground = videos.length > 0
    ? (videos[0].thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || videos[0].thumbnail)
    : primaryChannel?.cover_url;

  const handlePlay = (video: PlaylistVideo) => {
    setSelectedVideo(video);
    if (!primaryChannel) return;
    onPlayVideo(primaryChannel.id, video.videoId);
  };

  const scrollPlaylist = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in" data-catalog={catalogName}>
      {/* ─── HERO: full-width cinematic cover ─── */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {/* Background cover — uses catalog thumbnail */}
        {heroBackground ? (
          <img src={heroBackground} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { if (videos[0]?.thumbnail) (e.target as HTMLImageElement).src = videos[0].thumbnail; }} />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, hsl(var(--player-bg)) 0%, hsl(220 50% 15%) 50%, hsl(var(--player-bg)) 100%)" }} />
        )}

        {/* Gradient overlays for readability */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, hsl(var(--player-bg)) 0%, hsla(var(--player-bg) / 0.7) 35%, hsla(var(--player-bg) / 0.2) 65%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, hsl(var(--player-bg)) 0%, hsla(var(--player-bg) / 0.6) 30%, transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, hsla(var(--player-bg) / 0.4) 0%, transparent 20%)" }} />

        {/* Back button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 z-20 flex items-center gap-2 text-white/50 hover:text-white transition-colors text-xs font-medium tracking-wide uppercase"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>

        {/* Content: logo + description, bottom-left */}
        <div className="absolute bottom-10 left-8 sm:left-12 z-10 max-w-xl flex flex-col gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={catalogName}
              className="h-20 sm:h-28 lg:h-32 object-contain object-left"
              style={{ filter: "drop-shadow(0 4px 30px rgba(0,0,0,0.7))" }}
            />
          ) : (
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-none"
              style={{ textShadow: "0 4px 30px rgba(0,0,0,0.7)" }}
            >
              {catalogName}
            </h1>
          )}

          <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-md" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}>
            {primaryChannel?.name || catalogName}
          </p>

          <div className="flex items-center gap-5 text-xs text-white/35 font-medium">
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              {loading ? "..." : videos.length} vídeos
            </span>
            {videos.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Atualizado em {new Date(videos[0].published).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>

          {!loading && videos.length > 0 && (
            <button
              onClick={() => handlePlay(videos[0])}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 w-fit mt-1 hover:scale-[1.04]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
                boxShadow: "0 4px 20px hsla(var(--player-accent) / 0.4)",
              }}
            >
              <Play className="h-4 w-4 fill-white" />
              Assistir
            </button>
          )}
        </div>
      </div>

      {/* ─── PLAYLIST BAR ─── */}
      <div
        className="relative w-full shrink-0"
        style={{
          height: "clamp(150px, 24vh, 220px)",
          background: "linear-gradient(to top, hsla(var(--player-bg) / 0.98) 0%, hsla(var(--player-bg) / 0.92) 100%)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="absolute top-3 left-12 z-10 text-[11px] uppercase tracking-widest font-semibold text-white/30">
          Playlist
        </div>

        <button
          onClick={() => scrollPlaylist("left")}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
          style={{ background: "hsla(var(--player-bg) / 0.8)", backdropFilter: "blur(8px)" }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => scrollPlaylist("right")}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
          style={{ background: "hsla(var(--player-bg) / 0.8)", backdropFilter: "blur(8px)" }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="absolute left-0 top-0 bottom-0 w-10 z-[5] pointer-events-none" style={{ background: "linear-gradient(to right, hsl(var(--player-bg)), transparent)" }} />
        <div className="absolute right-0 top-0 bottom-0 w-10 z-[5] pointer-events-none" style={{ background: "linear-gradient(to left, hsl(var(--player-bg)), transparent)" }} />

        <div
          ref={scrollRef}
          className="flex items-end gap-3 h-full px-12 pb-4 pt-8 overflow-x-auto scrollbar-hide"
        >
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shrink-0 flex flex-col gap-2">
                <Skeleton className="rounded-xl bg-white/8" style={{ width: 180, height: 101 }} />
                <Skeleton className="h-3 w-28 bg-white/6 rounded" />
              </div>
            ))
          ) : videos.length === 0 ? (
            <p className="text-sm text-white/30 mx-auto">Nenhum vídeo disponível</p>
          ) : (
            videos.map((video) => {
              const isSelected = selectedVideo?.videoId === video.videoId;
              return (
                <button
                  key={video.videoId}
                  onClick={() => handlePlay(video)}
                  className="group shrink-0 flex flex-col gap-1.5 transition-all duration-300 cursor-pointer"
                  style={{ opacity: isSelected ? 1 : 0.6 }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = "0.6"; }}
                >
                  <div
                    className="relative rounded-xl overflow-hidden transition-all duration-300"
                    style={{
                      width: isSelected ? 200 : 170,
                      aspectRatio: "16/9",
                      outline: isSelected ? "2px solid hsl(var(--player-accent))" : "1px solid rgba(255,255,255,0.08)",
                      outlineOffset: -1,
                      boxShadow: isSelected ? "0 0 20px 3px hsla(var(--player-accent) / 0.4)" : "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    <img
                      src={video.thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = video.thumbnail; }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div
                        className="w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center"
                        style={{ background: "hsla(var(--player-accent) / 0.9)", boxShadow: "0 4px 16px hsla(var(--player-accent) / 0.5)" }}
                      >
                        <Play className="h-4 w-4 text-white fill-white" />
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold text-white" style={{ background: "hsl(var(--player-accent))" }}>
                        Atual
                      </div>
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight line-clamp-2 text-left max-w-[170px] ${isSelected ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
                    {video.title}
                  </p>
                  {video.published && (
                    <p className="text-[9px] text-white/25 text-left">
                      {new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

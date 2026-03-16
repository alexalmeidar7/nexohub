import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Film, Calendar, Clock } from "lucide-react";
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
  classificacao_etaria?: string;
  horario_inicio?: string;
  horario_fim?: string;
  descricao?: string;
  is_hd?: boolean | null;
  is_stereo?: boolean | null;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

interface ProgramaInfo {
  nome: string;
  descricao: string;
  horario_inicio: string;
  horario_fim: string;
  classificacao_etaria: string;
  selo: string;
}

interface CatalogDetailInlineProps {
  catalogName: string;
  onBack: () => void;
  onPlayVideo: (channelId: string, videoId: string) => void;
}

const ratingColors: Record<string, { bg: string; text: string }> = {
  L: { bg: "#00a651", text: "#fff" },
  "10": { bg: "#0095da", text: "#fff" },
  "12": { bg: "#f7d117", text: "#000" },
  "14": { bg: "#f58220", text: "#fff" },
  "16": { bg: "#e2203a", text: "#fff" },
  "18": { bg: "#1d1d1b", text: "#fff" },
};

export default function CatalogDetailInline({ catalogName, onBack, onPlayVideo }: CatalogDetailInlineProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<PlaylistVideo | null>(null);
  const [programa, setPrograma] = useState<ProgramaInfo | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch channels for this catalog group
  useEffect(() => {
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("streaming_channels")
        .select("id, name, cover_url, logo_url, background_url, type, url, catalog_name, classificacao_etaria, horario_inicio, horario_fim, descricao, is_hd, is_stereo")
        .eq("type", "catalog")
        .eq("active", true);

      const filtered = (data || []).filter(ch => (ch.catalog_name || "Catálogo") === catalogName);
      setChannels(filtered);
    };
    fetchChannels();
  }, [catalogName]);

  const primaryChannel = channels[0];

  // Build program info from channel data (saved during catalog registration)
  useEffect(() => {
    if (!primaryChannel) return;
    const ch = primaryChannel;
    if (ch.horario_inicio || ch.descricao || ch.classificacao_etaria) {
      setPrograma({
        nome: ch.name,
        descricao: ch.descricao || "",
        horario_inicio: ch.horario_inicio || "",
        horario_fim: ch.horario_fim || "",
        classificacao_etaria: ch.classificacao_etaria || "L",
        selo: "",
      });
    }
  }, [channels]);

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
      // Filter out future-dated and sort
      const now = new Date();
      const validVideos = allVideos.filter(v => new Date(v.published) <= now);
      validVideos.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
      setVideos(validVideos);
      // Don't auto-select any video on initial load
      setLoading(false);
    };
    fetchVideos();
  }, [channels]);

  const logoUrl = primaryChannel?.background_url || primaryChannel?.logo_url;

  // Hero background: prioritize catalog's registered thumbnail (logo_url = Thumb),
  // then cover_url, then first video thumbnail as last fallback
  const heroBackground = primaryChannel?.logo_url
    || primaryChannel?.cover_url
    || (videos.length > 0
      ? (videos[0].thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || videos[0].thumbnail)
      : null);

  const handlePlay = (video: PlaylistVideo) => {
    setSelectedVideo(video);
    if (!primaryChannel) return;
    onPlayVideo(primaryChannel.id, video.videoId);
  };

  const handleCardMouseEnter = useCallback((videoId: string) => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredVideoId(videoId);
    }, 400);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredVideoId(null);
  }, []);

  const scrollAnimRef = useRef<number | null>(null);

  const startAutoScroll = useCallback((direction: "left" | "right") => {
    const scroll = () => {
      if (!scrollRef.current) return;
      const speed = 2.5;
      scrollRef.current.scrollLeft += direction === "right" ? speed : -speed;
      scrollAnimRef.current = requestAnimationFrame(scroll);
    };
    scrollAnimRef.current = requestAnimationFrame(scroll);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  const rating = programa?.classificacao_etaria || "L";
  const ratingStyle = ratingColors[rating] || ratingColors["L"];

  return (
    <div className="relative flex flex-col h-full overflow-hidden animate-fade-in" data-catalog={catalogName}>
      {/* ─── HERO: full-width cinematic cover ─── */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Background cover — uses catalog registered thumbnail */}
        {heroBackground ? (
          <img
            src={heroBackground}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
            onError={(e) => { if (videos[0]?.thumbnail) (e.target as HTMLImageElement).src = videos[0].thumbnail; }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, hsl(var(--player-bg)) 0%, hsl(220 50% 15%) 50%, hsl(var(--player-bg)) 100%)" }} />
        )}

        {/* Gradient overlays for readability */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, hsl(var(--player-bg)) 0%, hsla(var(--player-bg) / 0.7) 35%, hsla(var(--player-bg) / 0.2) 65%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, hsl(var(--player-bg)) 0%, hsla(var(--player-bg) / 0.6) 30%, transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, hsla(var(--player-bg) / 0.4) 0%, transparent 20%)" }} />

        {/* Content: logo + program info, bottom-left */}
        <div className="absolute bottom-[clamp(200px,32vh,300px)] left-8 sm:left-12 z-10 max-w-xl flex flex-col gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={catalogName}
              className="h-36 sm:h-52 lg:h-60 object-contain object-left"
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

          <p className="text-sm sm:text-base text-white/70 font-medium leading-relaxed" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}>
            {primaryChannel?.name || catalogName}
          </p>

          {/* Program metadata: rating + schedule + description */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Age rating badge */}
            <span
              className="inline-flex items-center justify-center rounded font-black text-[11px] leading-none min-w-[26px] h-[22px] px-1.5"
              style={{ backgroundColor: ratingStyle.bg, color: ratingStyle.text }}
            >
              {rating === "L" ? "L" : rating}
            </span>

            {/* Schedule */}
            {programa && (
              <span className="flex items-center gap-1.5 text-xs text-white/50 font-medium">
                <Clock className="h-3.5 w-3.5 text-white/40" />
                {programa.horario_inicio} – {programa.horario_fim}
              </span>
            )}

            {/* Video count */}
            <span className="flex items-center gap-1.5 text-xs text-white/35 font-medium">
              <Film className="h-3.5 w-3.5" />
              {loading ? "..." : videos.length} vídeos
            </span>

            {videos.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-white/35 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                Atualizado em {new Date(videos[0].published).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Program description */}
          {programa?.descricao && (
            <p className="text-[13px] text-white/45 leading-relaxed max-w-md line-clamp-2" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
              {programa.descricao}
            </p>
          )}

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

      {/* ─── PLAYLIST BAR — floating blue glass ─── */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-2xl"
        style={{
          width: "90%",
          height: "clamp(120px, 18vh, 170px)",
          background: "rgba(20, 60, 140, 0.35)",
          backdropFilter: "blur(28px) saturate(1.6)",
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          border: "1px solid rgba(100, 160, 255, 0.2)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >

        {/* Auto-scroll hover zones */}
        <div
          className="absolute left-0 top-0 bottom-0 w-16 z-10 cursor-w-resize"
          style={{ background: "linear-gradient(to right, rgba(10,30,80,0.5), transparent)" }}
          onMouseEnter={() => startAutoScroll("left")}
          onMouseLeave={stopAutoScroll}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-16 z-10 cursor-e-resize"
          style={{ background: "linear-gradient(to left, rgba(10,30,80,0.5), transparent)" }}
          onMouseEnter={() => startAutoScroll("right")}
          onMouseLeave={stopAutoScroll}
        />

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex items-center gap-3.5 h-full px-8 pb-3 pt-3 overflow-x-auto scrollbar-hide"
          style={{ scrollBehavior: "smooth" }}
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
              const isHovered = hoveredVideoId === video.videoId;
              return (
                <div
                  key={video.videoId}
                  className="shrink-0 relative"
                  onMouseEnter={() => handleCardMouseEnter(video.videoId)}
                  onMouseLeave={handleCardMouseLeave}
                >
                  {/* Expanded preview popup — appears above card */}
                  <div
                    className="absolute bottom-full left-1/2 mb-3 z-30 pointer-events-none"
                    style={{
                      transform: `translateX(-50%) scale(${isHovered ? 1 : 0.85})`,
                      opacity: isHovered ? 1 : 0,
                      transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      width: 260,
                      transformOrigin: "bottom center",
                    }}
                  >
                    <div
                      className="rounded-2xl overflow-hidden pointer-events-auto"
                      style={{
                        background: "rgba(15, 50, 120, 0.55)",
                        backdropFilter: "blur(24px) saturate(1.5)",
                        WebkitBackdropFilter: "blur(24px) saturate(1.5)",
                        border: "1px solid rgba(100, 160, 255, 0.25)",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 30px hsla(var(--player-accent) / 0.2)",
                      }}
                    >
                      {/* Video preview */}
                      <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                        {isHovered ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&mute=1&start=1800&controls=0&showinfo=0&modestbranding=1&rel=0&loop=1&playlist=${video.videoId}&end=1810`}
                            className="absolute inset-0 w-full h-full"
                            style={{ border: 0 }}
                            allow="autoplay; encrypted-media"
                            title={video.title}
                          />
                        ) : (
                          <img
                            src={video.thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(15,50,120,0.7) 0%, transparent 40%)" }} />
                      </div>
                      {/* Info */}
                      <div className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{video.title}</p>
                        {video.published && (
                          <p className="text-[10px] text-white/40 mt-1">
                            {new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </p>
                        )}
                        <button
                          onClick={() => handlePlay(video)}
                          className="mt-2 mx-auto flex items-center justify-center w-9 h-9 rounded-full transition-transform duration-200 hover:scale-110"
                          style={{
                            background: "hsl(var(--player-accent))",
                            boxShadow: "0 4px 16px hsla(var(--player-accent) / 0.5)",
                          }}
                        >
                          <Play className="h-4 w-4 text-white fill-white" />
                        </button>
                      </div>
                    </div>
                    {/* Arrow pointing down */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 rotate-45"
                      style={{
                        background: "rgba(15, 50, 120, 0.55)",
                        border: "1px solid rgba(100, 160, 255, 0.25)",
                        borderTop: "none",
                        borderLeft: "none",
                      }}
                    />
                  </div>

                  {/* Base card (thumbnail) */}
                  <button
                    onClick={() => handlePlay(video)}
                    className="shrink-0 cursor-pointer transition-all duration-300"
                    style={{
                      opacity: isSelected || isHovered ? 1 : 0.7,
                      transform: isHovered ? "translateY(-4px) scale(1.05)" : "translateY(0) scale(1)",
                      transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  >
                    <div
                      className="relative rounded-xl overflow-hidden"
                      style={{
                        width: 170,
                        aspectRatio: "16/9",
                        outline: isSelected ? "2px solid hsl(var(--player-accent))" : isHovered ? "2px solid hsla(var(--player-accent) / 0.6)" : "1px solid rgba(255,255,255,0.08)",
                        outlineOffset: -1,
                        boxShadow: isHovered
                          ? "0 8px 30px rgba(0,0,0,0.5), 0 0 20px hsla(var(--player-accent) / 0.3)"
                          : isSelected ? "0 0 20px 3px hsla(var(--player-accent) / 0.4)" : "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      <img
                        src={video.thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = video.thumbnail; }}
                      />
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)" }} />
                      {isSelected && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold text-white" style={{ background: "hsl(var(--player-accent))" }}>
                          Atual
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-3">
                        <p className={`text-[10px] leading-tight line-clamp-2 text-left ${isSelected ? "text-white font-semibold" : "text-white/80 font-medium"}`}>
                          {video.title}
                        </p>
                        {video.published && (
                          <p className="text-[8px] text-white/40 text-left mt-0.5">
                            {new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

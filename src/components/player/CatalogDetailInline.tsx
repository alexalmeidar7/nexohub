import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Play, Film, Calendar, Clock, Plus, Minus } from "lucide-react";
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
/* ─── Hover Preview Popup (rendered via portal) ─── */
function HoverPreviewPopup({ video, x, y }: { video: PlaylistVideo; x: number; y: number }) {
  const [videoReady, setVideoReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Detect playback start and unmute
  useEffect(() => {
    const fallback = setTimeout(() => setVideoReady(true), 3000);
    const handleMessage = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "onReady" || d?.info?.playerState === 1) {
          setVideoReady(true);
          // Try to unmute via postMessage
          try {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "unMute", args: [] }),
              "*"
            );
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "setVolume", args: [40] }),
              "*"
            );
          } catch {}
        }
      } catch {}
    };
    window.addEventListener("message", handleMessage);
    return () => { clearTimeout(fallback); window.removeEventListener("message", handleMessage); };
  }, []);

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: x,
        top: y,
        width: 280,
        transform: `translate(-50%, -100%) scale(${entered ? 1 : 0.8})`,
        transformOrigin: "bottom center",
        opacity: entered ? 1 : 0,
        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(150, 1, 1, 0.85)",
          backdropFilter: "blur(28px) saturate(1.5)",
          WebkitBackdropFilter: "blur(28px) saturate(1.5)",
          border: "1px solid rgba(255, 80, 80, 0.3)",
          boxShadow: "0 16px 50px rgba(0,0,0,0.7), 0 0 40px rgba(150, 1, 1, 0.3)",
        }}
      >
        {/* Video area — gentle crop to hide YouTube top bar only */}
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9", background: "#000" }}>
          {!videoReady && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&mute=1&start=1800&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&loop=1&playlist=${video.videoId}&end=1810&enablejsapi=1&origin=${window.location.origin}&widget_referrer=${window.location.origin}`}
            className="absolute"
            style={{
              border: 0,
              opacity: videoReady ? 1 : 0,
              transition: "opacity 0.8s ease-in-out",
              top: "-5%",
              left: 0,
              width: "100%",
              height: "110%",
            }}
            allow="autoplay; encrypted-media"
            title={video.title}
            onLoad={() => {
              // Send listening handshake so postMessage commands work
              try {
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: "listening" }), "*"
                );
              } catch {}
            }}
          />
        </div>

        {/* Info — slides up */}
        <div
          className="px-3.5 py-3"
          style={{
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(8px)",
            transition: "all 0.5s ease 0.15s",
          }}
        >
          <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">{video.title}</p>
          {video.published && (
            <p className="text-[10px] text-white/40 mt-1.5">
              {new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          )}
        </div>
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3.5 h-3.5 rotate-45"
        style={{
          background: "rgba(150, 1, 1, 0.85)",
          border: "1px solid rgba(255, 80, 80, 0.3)",
          borderTop: "none",
          borderLeft: "none",
        }}
      />
    </div>
  );
}

export default function CatalogDetailInline({ catalogName, onBack, onPlayVideo }: CatalogDetailInlineProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<PlaylistVideo | null>(null);
  const [programa, setPrograma] = useState<ProgramaInfo | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ video: PlaylistVideo; x: number; y: number } | null>(null);
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
        if (playlistId) {
          // Fetch from YouTube playlist
          try {
            const { data, error } = await supabase.functions.invoke("youtube-playlist", { body: { playlistId } });
            if (!error && data?.videos) {
              allVideos.push(...data.videos);
            }
          } catch {}
        } else {
          // Handle individual video URLs (watch?v=XXXX)
          const vidMatch = ch.url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
          const videoId = vidMatch?.[1];
          if (videoId) {
            allVideos.push({
              videoId,
              title: ch.name || "Vídeo",
              thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
              published: new Date().toISOString(),
            });
          }
        }
      }
      // Filter out future-dated and sort (compare date-only, ignoring time)
      const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      // Deduplicate by videoId to show all videos individually (no grouping)
      const seenIds = new Set<string>();
      const uniqueVideos: PlaylistVideo[] = [];
      for (const v of allVideos) {
        if (!seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          const pubDate = v.published?.slice(0, 10) || "";
          if (pubDate <= todayStr) {
            uniqueVideos.push(v);
          }
        }
      }
      uniqueVideos.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
      setVideos(uniqueVideos);
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

  const handleCardMouseEnter = useCallback((video: PlaylistVideo, target: HTMLElement) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    const rect = target.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredVideoId(video.videoId);
      setHoverPreview({
        video,
        x: rect.left + rect.width / 2,
        y: rect.top - 12,
      });
    }, 280);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredVideoId(null);
    setHoverPreview(null);
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
        <div className="absolute top-[clamp(20px,4vh,60px)] left-8 sm:left-12 z-10 max-w-xl flex flex-col gap-3">
          {loading ? (
            /* ── Skeleton loader for hero content ── */
            <div className="flex flex-col gap-4 animate-pulse" key="skeleton-hero">
              {/* Logo skeleton */}
              <Skeleton className="h-44 sm:h-64 lg:h-[19rem] w-64 sm:w-80 lg:w-96 rounded-xl bg-white/8" />
              {/* Title skeleton */}
              <Skeleton className="h-6 w-52 rounded bg-white/8" />
              {/* Metadata row skeleton */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-[22px] w-[26px] rounded bg-white/8" />
                <Skeleton className="h-4 w-32 rounded bg-white/6" />
                <Skeleton className="h-4 w-20 rounded bg-white/6" />
                <Skeleton className="h-4 w-40 rounded bg-white/6" />
              </div>
              {/* Description skeleton */}
              <div className="flex flex-col gap-1.5 max-w-md">
                <Skeleton className="h-3.5 w-full rounded bg-white/6" />
                <Skeleton className="h-3.5 w-3/4 rounded bg-white/6" />
              </div>
              {/* Badges skeleton */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded bg-white/6" />
                <Skeleton className="h-5 w-16 rounded bg-white/6" />
              </div>
              {/* Button skeleton */}
              <Skeleton className="h-11 w-36 rounded-xl bg-white/8" />
            </div>
          ) : (
            <div className="animate-fade-in" key="content-hero">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={catalogName}
                  className="h-44 sm:h-64 lg:h-[19rem] object-contain object-left"
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
                <span
                  className="inline-flex items-center justify-center rounded font-black text-[11px] leading-none min-w-[26px] h-[22px] px-1.5"
                  style={{ backgroundColor: ratingStyle.bg, color: ratingStyle.text }}
                >
                  {rating === "L" ? "L" : rating}
                </span>
                {programa && (
                  <span className="flex items-center gap-1.5 text-xs text-white/50 font-medium">
                    <Clock className="h-3.5 w-3.5 text-white/40" />
                    {programa.horario_inicio} – {programa.horario_fim}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-white/35 font-medium">
                  <Film className="h-3.5 w-3.5" />
                  {videos.length} vídeos
                </span>
                {videos.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-white/35 font-medium">
                    <Calendar className="h-3.5 w-3.5" />
                    Atualizado em {new Date(videos[0].published).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>

              {/* Program description with expand */}
              {programa?.descricao && (
                <div className="max-w-md relative">
                  <div
                    className="overflow-hidden transition-all duration-500 ease-in-out"
                    style={{ maxHeight: descExpanded ? "500px" : "42px" }}
                  >
                    <p
                      className="text-[13px] text-white/45 leading-relaxed"
                      style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
                    >
                      {programa.descricao}
                    </p>
                  </div>
                  <button
                    onClick={() => setDescExpanded(prev => !prev)}
                    className="inline-flex items-center justify-center mt-1.5 w-5 h-5 rounded-full border border-white/25 text-white/60 hover:text-white hover:border-white/50 transition-all duration-300"
                    title={descExpanded ? "Ver menos" : "Ver mais"}
                  >
                    <span className="transition-transform duration-300" style={{ transform: descExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                      {descExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </span>
                  </button>
                </div>
              )}

              {/* HD / Stereo icons */}
              <div className="flex items-center gap-2 mt-4">
                {primaryChannel?.is_hd && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide text-white/40 border border-white/15">
                    <span className="text-[8px] font-black">1080p</span> FULL HD
                  </span>
                )}
                {primaryChannel?.is_stereo && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide text-white/40 border border-white/15">
                    STEREO
                  </span>
                )}
              </div>

              {videos.length > 0 && (
                <button
                  onClick={() => handlePlay(videos[0])}
                  className="group relative flex items-center gap-3 px-7 py-3.5 rounded-full text-sm font-bold tracking-wide transition-all duration-300 w-fit mt-5 hover:scale-[1.05] text-player-foreground overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
                    boxShadow: "0 6px 24px hsla(var(--player-accent) / 0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <Play className="h-4 w-4 fill-current relative z-10" />
                  <span className="relative z-10">Assistir</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── PLAYLIST BAR — floating blue glass ─── */}
      {/* Outer wrapper allows popups to overflow upward */}
      <div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20"
        style={{ width: "90%" }}
      >
        {/* Glass background layer with rounded corners */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(28px) saturate(1.6)",
            WebkitBackdropFilter: "blur(28px) saturate(1.6)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        />

        {/* Interactive content — can overflow upward for popups */}
        <div
          className="relative rounded-2xl"
          style={{ height: "clamp(120px, 18vh, 170px)" }}
        >
          {/* Auto-scroll hover zones */}
          <div
            className="absolute left-0 top-0 bottom-0 w-16 z-10 cursor-w-resize rounded-l-2xl overflow-hidden"
            style={{ background: "linear-gradient(to right, rgba(0,0,0,0.6), transparent)" }}
            onMouseEnter={() => startAutoScroll("left")}
            onMouseLeave={stopAutoScroll}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-16 z-10 cursor-e-resize rounded-r-2xl overflow-hidden"
            style={{ background: "linear-gradient(to left, rgba(0,0,0,0.6), transparent)" }}
            onMouseEnter={() => startAutoScroll("right")}
            onMouseLeave={stopAutoScroll}
          />

          {hoverPreview && createPortal(
            <HoverPreviewPopup
              video={hoverPreview.video}
              x={hoverPreview.x}
              y={hoverPreview.y}
            />,
            document.body
          )}

          {/* Scrollable content — clips horizontally, overflows vertically for popups */}
          <div
            ref={scrollRef}
            className="flex items-center gap-3.5 h-full px-8 pb-3 pt-3 scrollbar-hide"
            style={{ scrollBehavior: "smooth", overflowX: "auto", overflowY: "hidden" }}
          >
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shrink-0 flex flex-col gap-2 animate-pulse">
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
                  onMouseEnter={(e) => handleCardMouseEnter(video, e.currentTarget)}
                  onMouseLeave={handleCardMouseLeave}
                >
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
    </div>
  );
}

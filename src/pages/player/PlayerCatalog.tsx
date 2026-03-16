import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Play, Film } from "lucide-react";
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
  descricao?: string;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

export default function PlayerCatalog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userSlug } = useParams();
  const [searchParams] = useSearchParams();
  const catalogName = searchParams.get("catalog") || "";
  const activeVideoId = searchParams.get("vid") || "";

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
      if (allVideos.length > 0) {
        const active = activeVideoId ? allVideos.find(v => v.videoId === activeVideoId) : null;
        setSelectedVideo(active || allVideos[0]);
      }
      setLoading(false);
    };
    fetchVideos();
  }, [channels]);

  const primaryChannel = channels[0];
  const logoUrl = primaryChannel?.background_url || primaryChannel?.logo_url;
  const coverUrl = primaryChannel?.cover_url;

  const goToPlayer = (video: PlaylistVideo) => {
    setSelectedVideo(video);
    if (!primaryChannel) return;
    const params = new URLSearchParams();
    params.set("ch", primaryChannel.id);
    params.set("vid", video.videoId);
    const qs = `?${params.toString()}`;
    if (userSlug) navigate(`/user/${userSlug}/nexohub/player/watch${qs}`);
    else navigate(`/user/nexohub/player/watch${qs}`);
  };

  const goBack = () => {
    if (userSlug) navigate(`/user/${userSlug}/nexohub/player`);
    else navigate(`/user/nexohub/player`);
  };

  const scrollPlaylist = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "hsl(var(--player-bg))" }}>

      {/* ─── HERO: cover image background with logo + description ─── */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {/* Background cover */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* If no cover, dark bg */}
        {!coverUrl && (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, hsl(220 60% 12%) 0%, hsl(220 50% 20%) 100%)" }} />
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, hsla(var(--player-bg) / 0.85) 0%, hsla(var(--player-bg) / 0.3) 50%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, hsl(var(--player-bg)) 0%, transparent 40%)" }} />

        {/* Back button */}
        <button
          onClick={goBack}
          className="absolute top-6 left-6 sm:left-10 z-20 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft className="h-5 w-5" />
          Voltar
        </button>

        {/* Content: logo + description, bottom-left */}
        <div className="absolute bottom-8 left-8 sm:left-12 z-10 max-w-lg flex flex-col gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={catalogName}
              className="h-20 sm:h-28 object-contain object-left"
              style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.6))" }}
            />
          ) : (
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)" }}>
              {catalogName}
            </h1>
          )}

          {/* Description */}
          <p className="text-sm sm:text-base text-white/70 leading-relaxed line-clamp-3" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
            {primaryChannel?.name || catalogName}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              {videos.length} vídeos
            </span>
          </div>
        </div>
      </div>

      {/* ─── PLAYLIST BAR: horizontal scrollable strip at the bottom ─── */}
      <div
        className="relative w-full shrink-0"
        style={{
          height: "clamp(140px, 22vh, 200px)",
          background: "linear-gradient(to top, hsla(var(--player-accent) / 0.25) 0%, hsla(var(--player-accent) / 0.08) 100%)",
          borderTop: "1px solid hsla(var(--player-accent) / 0.3)",
        }}
      >
        {/* Scroll arrows */}
        <button
          onClick={() => scrollPlaylist("left")}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => scrollPlaylist("right")}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex items-center gap-3 h-full px-12 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
        >
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="shrink-0 rounded-lg bg-white/10"
                style={{ width: 160, height: 90 }}
              />
            ))
          ) : videos.length === 0 ? (
            <p className="text-sm text-white/40 mx-auto">Nenhum vídeo disponível</p>
          ) : (
            videos.map((video) => {
              const isSelected = selectedVideo?.videoId === video.videoId;
              return (
                <button
                  key={video.videoId}
                  onClick={() => goToPlayer(video)}
                  className="group shrink-0 rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer"
                  style={{
                    width: 160,
                    height: 90,
                    outline: isSelected ? "2px solid hsl(var(--player-accent))" : "1px solid rgba(255,255,255,0.1)",
                    outlineOffset: -1,
                    boxShadow: isSelected ? "0 0 16px 2px hsla(var(--player-accent) / 0.5)" : "none",
                    opacity: isSelected ? 1 : 0.7,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.outline = "2px solid rgba(255,255,255,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.opacity = "0.7";
                      e.currentTarget.style.outline = "1px solid rgba(255,255,255,0.1)";
                    }
                  }}
                >
                  <img
                    src={video.thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = video.thumbnail; }}
                  />

                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center"
                      style={{ background: "hsla(var(--player-accent) / 0.85)" }}
                    >
                      <Play className="h-3.5 w-3.5 text-white fill-white" />
                    </div>
                  </div>

                  {/* Title tooltip on bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[10px] text-white leading-tight line-clamp-2 font-medium">{video.title}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

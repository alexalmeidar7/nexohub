import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Play, Calendar, Film } from "lucide-react";
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

export default function PlayerCatalog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userSlug } = useParams();
  const [searchParams] = useSearchParams();
  const catalogName = searchParams.get("catalog") || "";

  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Sort newest first
      allVideos.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
      setVideos(allVideos);
      setLoading(false);
    };
    fetchVideos();
  }, [channels]);

  const primaryChannel = channels[0];
  const logoUrl = primaryChannel?.background_url || primaryChannel?.logo_url;
  const coverUrl = primaryChannel?.cover_url;

  const goToPlayer = (videoId: string) => {
    if (!primaryChannel) return;
    const params = new URLSearchParams();
    params.set("ch", primaryChannel.id);
    params.set("vid", videoId);
    const qs = `?${params.toString()}`;
    if (userSlug) navigate(`/user/${userSlug}/nexohub/player/watch${qs}`);
    else navigate(`/user/nexohub/player/watch${qs}`);
  };

  const goBack = () => {
    if (userSlug) navigate(`/user/${userSlug}/nexohub/player`);
    else navigate(`/user/nexohub/player`);
  };

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--player-bg))" }}>
      {/* Hero header with background */}
      <div className="relative w-full overflow-hidden" style={{ height: "clamp(280px, 40vh, 420px)" }}>
        {/* Background image */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm scale-105"
          />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, hsla(var(--player-bg) / 0.4) 0%, hsla(var(--player-bg) / 0.8) 60%, hsl(var(--player-bg)) 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, hsla(var(--player-bg) / 0.9) 0%, transparent 50%)" }} />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end px-8 sm:px-12 pb-8">
          {/* Back button */}
          <button
            onClick={goBack}
            className="absolute top-6 left-6 sm:left-10 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ChevronLeft className="h-5 w-5" />
            Voltar
          </button>

          {/* Logo */}
          {logoUrl && (
            <img
              src={logoUrl}
              alt={catalogName}
              className="h-16 sm:h-20 object-contain mb-4"
              style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }}
            />
          )}
          {!logoUrl && (
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tight">{catalogName}</h1>
          )}

          {/* Description */}
          <p className="text-sm text-white/60 max-w-xl leading-relaxed">
            {primaryChannel?.name || catalogName}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              {videos.length} vídeos
            </span>
            {videos.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Atualizado em {new Date(videos[0].published).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Video grid */}
      <div className="px-8 sm:px-12 pb-12 -mt-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="rounded-xl bg-white/8" style={{ aspectRatio: "16/9" }} />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="w-full h-40 rounded-xl flex items-center justify-center text-sm" style={{ background: "hsla(var(--player-surface))", color: "hsla(var(--player-muted-foreground))" }}>
            Nenhum vídeo disponível
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {videos.map((video) => (
              <button
                key={video.videoId}
                onClick={() => goToPlayer(video.videoId)}
                className="group rounded-xl overflow-hidden relative text-left transition-all duration-300 cursor-pointer"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, hsl(var(--player-bg)) 100%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--player-accent))";
                  e.currentTarget.style.boxShadow = "0 0 16px 2px hsla(var(--player-accent) / 0.4)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Thumbnail */}
                <div className="relative" style={{ aspectRatio: "16/9" }}>
                  <img
                    src={video.thumbnail?.replace(/\/(hq|mq|sd)default\.jpg/, "/maxresdefault.jpg") || video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = video.thumbnail; }}
                  />
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div
                      className="w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center"
                      style={{ background: "hsla(var(--player-accent) / 0.85)", boxShadow: "0 6px 24px hsla(var(--player-accent) / 0.5)" }}
                    >
                      <Play className="h-4.5 w-4.5 text-white fill-white" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{video.title}</p>
                  {video.published && (
                    <p className="text-[10px] text-white/40 mt-1.5">
                      {new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

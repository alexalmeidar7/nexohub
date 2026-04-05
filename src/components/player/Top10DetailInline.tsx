import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Play, Pause, Heart, Music, Loader2, ArrowLeft, SkipForward, SkipBack } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  artist: string;
}

interface Top10DetailInlineProps {
  avatarUrl: string | null;
  onBack: () => void;
}

export default function Top10DetailInline({ avatarUrl, onBack }: Top10DetailInlineProps) {
  const { user } = useAuth();
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState(0);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [ytPlaying, setYtPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchAndSearch = async () => {
      const { data: likes } = await supabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (cancelled || !likes || likes.length === 0) {
        setLoading(false);
        return;
      }

      const seen = new Set<string>();
      const unique = likes.filter(l => {
        const key = `${l.artista}||${l.titulo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10);

      const queries = unique.map(l => `${l.artista} ${l.titulo}`);

      try {
        const { data, error } = await supabase.functions.invoke("youtube-search", {
          body: { queries },
        });

        if (cancelled) return;

        if (!error && data?.results) {
          const results: PlaylistVideo[] = [];
          for (let i = 0; i < unique.length; i++) {
            const song = unique[i];
            const found = data.results.find((r: any) => r.query === queries[i]);
            if (found) {
              results.push({
                videoId: found.videoId,
                title: song.titulo,
                thumbnail: found.thumbnail || song.capa || "",
                artist: song.artista,
              });
            }
            if (!cancelled) setSearchProgress(i + 1);
          }
          if (!cancelled) setVideos(results);
        }
      } catch (err) {
        console.error("YouTube search failed:", err);
      }

      if (!cancelled) setLoading(false);
    };

    fetchAndSearch();
    return () => { cancelled = true; };
  }, [user]);

  const playVideo = (idx: number) => {
    setCurrentIdx(idx);
    setYtPlaying(true);
  };

  const playNext = () => {
    if (currentIdx !== null && currentIdx < videos.length - 1) {
      playVideo(currentIdx + 1);
    }
  };

  const playPrev = () => {
    if (currentIdx !== null && currentIdx > 0) {
      playVideo(currentIdx - 1);
    }
  };

  // Listen for YouTube player state changes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // YouTube player state: 0 = ended
        if (data?.event === "onStateChange" && data?.info === 0) {
          playNext();
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [currentIdx, videos.length]);

  const currentVideo = currentIdx !== null ? videos[currentIdx] : null;

  return (
    <div className="relative flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsla(var(--player-accent) / 0.3) 0%, hsl(var(--player-bg)) 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, hsl(var(--player-bg)) 70%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        {/* Back button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
          style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        {/* Player area (when playing) */}
        {currentVideo && (
          <div ref={playerContainerRef} className="w-full" style={{ aspectRatio: "16/9", maxHeight: "55vh" }}>
            <iframe
              ref={iframeRef}
              key={currentVideo.videoId}
              src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&enablejsapi=1&origin=${window.location.origin}`}
              className="w-full h-full"
              style={{ border: 0 }}
              allow="autoplay; encrypted-media; fullscreen"
              title={currentVideo.title}
            />
            {/* Now playing info */}
            <div className="px-8 py-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button onClick={playPrev} disabled={currentIdx === 0} className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-20 transition-colors">
                  <SkipBack size={16} className="text-white" />
                </button>
                <button onClick={playNext} disabled={currentIdx === videos.length - 1} className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-20 transition-colors">
                  <SkipForward size={16} className="text-white" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{currentVideo.title}</p>
                <p className="text-xs text-white/50 truncate">{currentVideo.artist}</p>
              </div>
              <span className="text-xs text-white/30 shrink-0">{(currentIdx ?? 0) + 1}/{videos.length}</span>
            </div>
          </div>
        )}

        {/* Header (when not playing) */}
        {!currentVideo && (
          <div className="px-8 pt-16 pb-6 flex items-end gap-6">
            <div
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shrink-0 shadow-2xl"
              style={{ border: "3px solid hsla(var(--player-accent) / 0.4)" }}
            >
              <img
                src={avatarUrl || "/avatars/usr-default.png"}
                alt="Meu Top 10"
                className="w-full h-full object-contain"
                style={{ background: "hsl(var(--player-bg))" }}
              />
            </div>
            <div className="flex flex-col gap-2 min-w-0 pb-2">
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "hsl(var(--player-accent))" }}>
                Playlist Pessoal
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">Meu Top 10</h1>
              <div className="flex items-center gap-2 mt-1">
                <Heart size={14} fill="hsl(var(--player-accent))" style={{ color: "hsl(var(--player-accent))" }} />
                <span className="text-sm text-white/60">
                  {loading ? "Buscando músicas..." : `${videos.length} músicas curtidas`}
                </span>
              </div>
              {loading && (
                <div className="flex items-center gap-2 mt-1">
                  <Loader2 size={14} className="animate-spin text-white/40" />
                  <span className="text-xs text-white/40">Pesquisando no YouTube ({searchProgress}/10)...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Video list */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {loading && videos.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="w-8 h-8 rounded bg-white/10 shrink-0" />
                  <Skeleton className="w-28 h-16 rounded-lg bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4 bg-white/10" />
                    <Skeleton className="h-2 w-1/2 bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : videos.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Music size={40} className="text-white/10" />
              <p className="text-sm text-white/40">Nenhuma música curtida encontrada</p>
            </div>
          ) : (
            <div className="space-y-1">
              {videos.length > 0 && !currentVideo && (
                <button
                  onClick={() => playVideo(0)}
                  className="mb-4 flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105"
                  style={{ background: "hsl(var(--player-accent))", color: "#000" }}
                >
                  <Play size={16} fill="currentColor" />
                  Reproduzir Tudo
                </button>
              )}

              {videos.map((video, idx) => {
                const isPlaying = currentIdx === idx;
                return (
                  <button
                    key={video.videoId}
                    onClick={() => playVideo(idx)}
                    className={`w-full flex items-center gap-4 py-2.5 px-3 rounded-xl transition-all group text-left ${
                      isPlaying ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="w-6 text-center text-sm font-bold tabular-nums shrink-0"
                      style={{ color: isPlaying ? "hsl(var(--player-accent))" : "hsla(var(--player-accent) / 0.6)" }}
                    >
                      {isPlaying ? (
                        <span className="flex items-center justify-center">
                          <span className="inline-flex gap-0.5">
                            {[1, 2, 3].map(b => (
                              <span
                                key={b}
                                className="w-0.5 rounded-full inline-block"
                                style={{
                                  background: "hsl(var(--player-accent))",
                                  height: `${8 + b * 3}px`,
                                  animation: `top10eq ${0.4 + b * 0.15}s ease-in-out infinite alternate`,
                                }}
                              />
                            ))}
                          </span>
                        </span>
                      ) : (
                        idx + 1
                      )}
                    </span>

                    <div className="w-20 h-12 rounded-lg overflow-hidden shrink-0 relative">
                      <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                      {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                          <Play size={16} className="text-white fill-white" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isPlaying ? "text-white" : "text-white/80 group-hover:text-white"}`}>{video.title}</p>
                      <p className="text-xs text-white/40 truncate">{video.artist}</p>
                    </div>

                    <Heart size={14} fill="hsl(var(--player-accent))" style={{ color: "hsl(var(--player-accent))" }} className="shrink-0 opacity-40" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* EQ animation keyframes */}
      <style>{`
        @keyframes top10eq {
          0% { height: 4px; }
          100% { height: 14px; }
        }
      `}</style>
    </div>
  );
}

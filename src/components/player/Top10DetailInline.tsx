import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Play, Heart, Music, Loader2, ArrowLeft } from "lucide-react";
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
  onPlayVideo?: (videoId: string, playlist: PlaylistVideo[]) => void;
  radioUserId?: string | null;
}

export default function Top10DetailInline({ avatarUrl, onBack, onPlayVideo, radioUserId }: Top10DetailInlineProps) {
  const { user } = useAuth();
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchAndSearch = async () => {
      let likesQuery: any = supabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", user.id);
      likesQuery = radioUserId ? likesQuery.eq("radio_user_id", radioUserId) : likesQuery.is("radio_user_id", null);
      const { data: likes } = await likesQuery
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

      // Check cache first
      const { data: cached } = await supabase
        .from("music_likes_youtube_cache" as any)
        .select("artista, titulo, video_id, thumbnail")
        .eq("user_id", user.id);

      if (cancelled) return;

      const cacheMap = new Map<string, { video_id: string; thumbnail: string }>();
      if (cached) {
        for (const c of cached as any[]) {
          cacheMap.set(`${c.artista}||${c.titulo}`, { video_id: c.video_id, thumbnail: c.thumbnail });
        }
      }

      const results: PlaylistVideo[] = [];
      const uncachedQueries: string[] = [];
      const uncachedIndices: number[] = [];

      for (let i = 0; i < unique.length; i++) {
        const song = unique[i];
        const key = `${song.artista}||${song.titulo}`;
        const hit = cacheMap.get(key);
        if (hit) {
          results.push({
            videoId: hit.video_id,
            title: song.titulo,
            thumbnail: hit.thumbnail || song.capa || "",
            artist: song.artista,
          });
        } else {
          uncachedQueries.push(`${song.artista} ${song.titulo}`);
          uncachedIndices.push(i);
          results.push({ videoId: "", title: song.titulo, thumbnail: song.capa || "", artist: song.artista });
        }
        if (!cancelled) setSearchProgress(i + 1);
      }

      // If all cached, we're done
      if (uncachedQueries.length === 0) {
        if (!cancelled) { setVideos(results); setLoading(false); }
        return;
      }

      // Show cached results immediately
      const cachedOnly = results.filter(r => r.videoId);
      if (cachedOnly.length > 0 && !cancelled) setVideos(cachedOnly);

      // Search only uncached songs
      try {
        const { data, error } = await supabase.functions.invoke("youtube-search", {
          body: { queries: uncachedQueries },
        });

        if (cancelled) return;

        if (!error && data?.results) {
          const upserts: any[] = [];
          for (let j = 0; j < uncachedQueries.length; j++) {
            const idx = uncachedIndices[j];
            const song = unique[idx];
            const found = data.results.find((r: any) => r.query === uncachedQueries[j]);
            if (found) {
              results[idx] = {
                videoId: found.videoId,
                title: song.titulo,
                thumbnail: found.thumbnail || song.capa || "",
                artist: song.artista,
              };
              upserts.push({
                user_id: user.id,
                artista: song.artista,
                titulo: song.titulo,
                video_id: found.videoId,
                thumbnail: found.thumbnail || "",
              });
            }
          }
          // Save to cache (fire-and-forget)
          if (upserts.length > 0) {
            supabase.from("music_likes_youtube_cache" as any)
              .upsert(upserts, { onConflict: "user_id,artista,titulo" })
              .then(() => {});
          }
          if (!cancelled) setVideos(results.filter(r => r.videoId));
        }
      } catch (err) {
        console.error("YouTube search failed:", err);
      }

      if (!cancelled) setLoading(false);
    };

    fetchAndSearch();
    return () => { cancelled = true; };
  }, [user, radioUserId]);

  const handlePlay = (idx: number) => {
    const video = videos[idx];
    if (!video || !onPlayVideo) return;
    onPlayVideo(video.videoId, videos);
  };

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

        {/* Header */}
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
              {videos.length > 0 && (
                <button
                  onClick={() => handlePlay(0)}
                  className="mb-4 flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105"
                  style={{ background: "hsl(var(--player-accent))", color: "#000" }}
                >
                  <Play size={16} fill="currentColor" />
                  Reproduzir Tudo
                </button>
              )}

              {videos.map((video, idx) => (
                <button
                  key={video.videoId}
                  onClick={() => handlePlay(idx)}
                  className="w-full flex items-center gap-4 py-2.5 px-3 rounded-xl transition-all group text-left hover:bg-white/5"
                >
                  <span
                    className="w-6 text-center text-sm font-bold tabular-nums shrink-0"
                    style={{ color: "hsla(var(--player-accent) / 0.6)" }}
                  >
                    {idx + 1}
                  </span>

                  <div className="w-20 h-12 rounded-lg overflow-hidden shrink-0 relative">
                    <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                      <Play size={16} className="text-white fill-white" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-white/80 group-hover:text-white">{video.title}</p>
                    <p className="text-xs text-white/40 truncate">{video.artist}</p>
                  </div>

                  <Heart size={14} fill="hsl(var(--player-accent))" style={{ color: "hsl(var(--player-accent))" }} className="shrink-0 opacity-40" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

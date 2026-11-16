import { useEffect, useState } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { Play, Heart, Music, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { PlayerBackButton } from "./PlayerBackButton";
import { Skeleton } from "@/components/ui/skeleton";

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  artist: string;
  likeCount: number;
}

interface Top10DetailInlineProps {
  avatarUrl: string | null;
  onBack: () => void;
  onPlayVideo?: (videoId: string, playlist: PlaylistVideo[]) => void;
  radioUserId?: string | null;
}

interface AggregatedSong {
  titulo: string;
  artista: string;
  capa: string;
  count: number;
}

export default function Top10DetailInline({ avatarUrl, onBack, onPlayVideo, radioUserId }: Top10DetailInlineProps) {
  const { user } = usePlayerAuth();
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setSearchProgress({ done: 0, total: 0 });

      // 1) Fetch ALL likes for user (scoped by radio if provided) — rank by count
      let likesQuery: any = playerSupabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", user.id);
      likesQuery = radioUserId ? likesQuery.eq("radio_user_id", radioUserId) : likesQuery.is("radio_user_id", null);
      const { data: likes, error: likesErr } = await likesQuery
        .order("created_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (likesErr) {
        setError("Não foi possível carregar suas curtidas.");
        setLoading(false);
        return;
      }
      if (!likes || likes.length === 0) {
        setLoading(false);
        return;
      }

      // Aggregate by (artista||titulo) and rank by count
      const map = new Map<string, AggregatedSong>();
      for (const row of likes as any[]) {
        const key = `${row.artista}||${row.titulo}`;
        const existing = map.get(key);
        if (existing) {
          existing.count++;
          if (!existing.capa && row.capa) existing.capa = row.capa;
        } else {
          map.set(key, { titulo: row.titulo, artista: row.artista, capa: row.capa || "", count: 1 });
        }
      }
      const top = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      if (cancelled) return;

      // 2) Check YouTube cache
      const { data: cached } = await playerSupabase
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

      const results: (PlaylistVideo | null)[] = top.map((song) => {
        const hit = cacheMap.get(`${song.artista}||${song.titulo}`);
        if (hit) {
          return {
            videoId: hit.video_id,
            title: song.titulo,
            thumbnail: hit.thumbnail || song.capa || "",
            artist: song.artista,
            likeCount: song.count,
          };
        }
        return null;
      });

      // Show cached immediately
      const cachedNow = results.filter((r): r is PlaylistVideo => !!r);
      if (cachedNow.length > 0 && !cancelled) setVideos(cachedNow);

      const uncachedIdx: number[] = [];
      const uncachedQueries: string[] = [];
      top.forEach((song, i) => {
        if (!results[i]) {
          uncachedIdx.push(i);
          uncachedQueries.push(`${song.artista} ${song.titulo}`);
        }
      });

      if (uncachedQueries.length === 0) {
        if (!cancelled) {
          setVideos(cachedNow);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setSearchProgress({ done: 0, total: uncachedQueries.length });

      // 3) Search uncached in YouTube
      try {
        const { data, error: fnErr } = await playerSupabase.functions.invoke("youtube-search", {
          body: { queries: uncachedQueries },
        });
        if (cancelled) return;

        if (fnErr) throw fnErr;

        const upserts: any[] = [];
        if (data?.results) {
          for (let j = 0; j < uncachedQueries.length; j++) {
            const idx = uncachedIdx[j];
            const song = top[idx];
            const found = data.results.find((r: any) => r.query === uncachedQueries[j]);
            if (found?.videoId) {
              results[idx] = {
                videoId: found.videoId,
                title: song.titulo,
                thumbnail: found.thumbnail || song.capa || "",
                artist: song.artista,
                likeCount: song.count,
              };
              upserts.push({
                user_id: user.id,
                artista: song.artista,
                titulo: song.titulo,
                video_id: found.videoId,
                thumbnail: found.thumbnail || "",
              });
            }
            if (!cancelled) setSearchProgress({ done: j + 1, total: uncachedQueries.length });
          }
        }

        if (upserts.length > 0) {
          playerSupabase.from("music_likes_youtube_cache" as any)
            .upsert(upserts, { onConflict: "user_id,artista,titulo" })
            .then(() => {});
        }

        if (!cancelled) {
          const final = results.filter((r): r is PlaylistVideo => !!r);
          setVideos(final);
          setLoading(false);
        }
      } catch (err) {
        console.error("youtube-search failed:", err);
        if (!cancelled) {
          // Keep whatever we had from cache; report error if nothing available
          const partial = results.filter((r): r is PlaylistVideo => !!r);
          setVideos(partial);
          if (partial.length === 0) setError("Não foi possível buscar os vídeos no YouTube.");
          setLoading(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [user, radioUserId, reloadTick]);

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
        <PlayerBackButton
          onClick={onBack}
          className="absolute top-6 left-6 z-20 w-10 h-10 focus-visible:ring-offset-2"
          iconSize={18}
          aria-label="Voltar"
        />

        {/* Reload button */}
        <button
          onClick={() => setReloadTick((t) => t + 1)}
          className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 disabled:opacity-40"
          style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
          disabled={loading}
          aria-label="Recarregar"
          title="Recarregar"
        >
          <RefreshCw size={16} className={`text-white ${loading ? "animate-spin" : ""}`} />
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
                {loading && videos.length === 0
                  ? "Carregando suas curtidas…"
                  : `${videos.length} ${videos.length === 1 ? "música" : "músicas"} · ordenadas por curtidas`}
              </span>
            </div>
            {loading && searchProgress.total > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <Loader2 size={14} className="animate-spin text-white/40" />
                <span className="text-xs text-white/40">
                  Buscando no YouTube ({searchProgress.done}/{searchProgress.total})…
                </span>
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
          ) : error && videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Music size={40} className="text-white/10" />
              <p className="text-sm text-white/60">{error}</p>
              <button
                onClick={() => setReloadTick((t) => t + 1)}
                className="mt-2 px-4 py-2 rounded-full text-xs font-semibold text-white/80 hover:text-white transition"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                Tentar novamente
              </button>
            </div>
          ) : videos.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Music size={40} className="text-white/10" />
              <p className="text-sm text-white/40">Nenhuma música curtida ainda</p>
              <p className="text-xs text-white/30">Curta músicas no player para criar seu Top 10.</p>
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
                  key={`${video.videoId}-${idx}`}
                  onClick={() => handlePlay(idx)}
                  className="w-full flex items-center gap-4 py-2.5 px-3 rounded-xl transition-all group text-left hover:bg-white/5"
                >
                  <span
                    className="w-6 text-center text-sm font-bold tabular-nums shrink-0"
                    style={{ color: "hsla(var(--player-accent) / 0.6)" }}
                  >
                    {idx + 1}
                  </span>

                  <div className="w-20 h-12 rounded-lg overflow-hidden shrink-0 relative bg-white/5">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={16} className="text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.4)" }}>
                      <Play size={16} className="text-white fill-white" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-white/80 group-hover:text-white">{video.title}</p>
                    <p className="text-xs text-white/40 truncate">{video.artist}</p>
                  </div>

                  <div className="hidden sm:flex items-center gap-1 shrink-0 px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <Heart size={11} fill="hsl(var(--player-accent))" style={{ color: "hsl(var(--player-accent))" }} />
                    <span className="text-[10px] font-bold text-white/70 tabular-nums">{video.likeCount}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

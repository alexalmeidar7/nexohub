import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, UserCircle, Clock } from "lucide-react";
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

interface Programa {
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  capa: string | null;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

type Section = "home" | "streaming" | "content" | "shop";

function StreamingCard({ channel, currentProgram, onClick, onHoverChange }: { channel: Channel; currentProgram?: Programa; onClick: () => void; onHoverChange?: (thumb: string | null) => void }) {
  const [hovered, setHovered] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isVideo = channel.type === "video" || channel.type === "video_live";

  // Capture frames on hover for video channels
  useEffect(() => {
    if (!hovered || !isVideo || !channel.url) return;
    if (frames.length > 0) return; // already captured

    let hls: any = null;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    canvasRef.current = canvas;

    const captureFrames = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const captured: string[] = [];
      let count = 0;
      const grabFrame = () => {
        if (count >= 5) {
          setFrames(captured);
          video.pause();
          if (hls) hls.destroy();
          return;
        }
        ctx.drawImage(video, 0, 0, 320, 180);
        captured.push(canvas.toDataURL("image/jpeg", 0.7));
        count++;
        setTimeout(grabFrame, 300);
      };
      grabFrame();
    };

    const startCapture = async () => {
      if (channel.url!.includes(".m3u8")) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          hls = new Hls({ maxBufferLength: 5 });
          hls.loadSource(channel.url!);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().then(() => setTimeout(captureFrames, 500)).catch(() => {});
          });
        }
      } else {
        video.src = channel.url!;
        video.play().then(() => setTimeout(captureFrames, 500)).catch(() => {});
      }
    };

    startCapture();

    return () => {
      video.pause();
      if (hls) hls.destroy();
    };
  }, [hovered, isVideo, channel.url, frames.length]);

  // Loop through frames while hovered
  useEffect(() => {
    if (hovered && frames.length > 0) {
      intervalRef.current = setInterval(() => {
        setFrameIdx(prev => (prev + 1) % frames.length);
      }, 400);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hovered, frames.length]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(currentProgram?.capa || channel.cover_url || null); }}
      onMouseLeave={() => { setHovered(false); setFrameIdx(0); onHoverChange?.(null); }}
      className="flex-shrink-0 w-72 h-40 rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
    >
      {/* Background: cover_url do canal */}
      {channel.cover_url ? (
        <img src={channel.cover_url} alt={channel.name} className="w-full h-full object-cover" />
      ) : channel.logo_url ? (
        <img src={channel.logo_url} alt={channel.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-player-accent/30 to-player flex items-center justify-center">
          <Radio className="h-10 w-10 text-player-muted-foreground" />
        </div>
      )}

      {/* "ao vivo" badge - top left */}
      <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-black/60 px-2 py-0.5 rounded flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white">ao vivo</span>
      </span>

      {/* Info overlay - bottom left */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <p className="text-sm font-medium truncate text-left">{channel.name}</p>
        {currentProgram && (
          <p className="text-[11px] text-player-muted-foreground truncate text-left">{currentProgram.nome}</p>
        )}
      </div>
    </button>
  );
}

interface PlayerHomeProps {
  onBackToAccess?: () => void;
}

export default function PlayerHome({ onBackToAccess }: PlayerHomeProps = {}) {
  const { user, signOut } = useAuth();
  const { userSlug } = useParams();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [fadeOut, setFadeOut] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [watchHistory, setWatchHistory] = useState<{ id: string; channel_name: string; channel_cover_url: string | null; channel_logo_url: string | null; channel_type: string; watched_at: string; channel_id: string | null }[]>([]);
  const [hoveredThumb, setHoveredThumb] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, PlaylistVideo[]>>({});

  const userName = profileName || user?.email?.split("@")[0] || "Visitante";

  useEffect(() => {
    const fetchData = async () => {
      let userId = user?.id;

      // If logged in, fetch directly from DB (avoids edge function issues)
      if (userId) {
        const [channelsRes, empresaRes, programasRes] = await Promise.all([
          supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
          supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, descricao, apresentador_id").eq("user_id", userId).eq("ativo", true).order("horario_inicio"),
        ]);
        if (channelsRes.data) setChannels(channelsRes.data as any);
        if (empresaRes.data?.logo) setLogoUrl(empresaRes.data.logo);
        if (empresaRes.data?.nome) setChannelName(empresaRes.data.nome);
        if (programasRes.data) setProgramas(programasRes.data as any);
      } else if (userSlug && userSlug !== ":userSlug") {
        // Public access via slug (unauthenticated visitors)
        const { data } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        if (data?.channels) setChannels(data.channels);
        if (data?.empresa?.logo) setLogoUrl(data.empresa.logo);
        if (data?.empresa?.nome) setChannelName(data.empresa.nome);
        if (data?.programas) setProgramas(data.programas);
      }

        // Still fetch watch history for logged-in user
        if (userId) {
          const { data: historyData } = await supabase
            .from("watch_history")
            .select("id, channel_name, channel_cover_url, channel_logo_url, channel_type, watched_at, channel_id")
            .eq("user_id", userId)
            .order("watched_at", { ascending: false })
            .limit(10);
          if (historyData) {
            const seen = new Set<string>();
            const unique = historyData.filter(h => {
              const key = h.channel_id || h.id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setWatchHistory(unique);
          }
        }

        setDataLoaded(true);
        return;
      }

      if (!userId) { setDataLoaded(true); return; }

      // Fallback: direct query (shouldn't normally reach here)
      const [chRes, empRes, progRes] = await Promise.all([
        supabase.from("streaming_channels").select("id, name, cover_url, logo_url, background_url, type, url, catalog_name, user_id").eq("active", true).order("numero_canal", { ascending: true }),
        supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
        supabase.from("programas").select("nome, horario_inicio, horario_fim, dias_semana, capa").eq("user_id", userId).eq("ativo", true),
      ]);
      if (chRes.data) setChannels(chRes.data as any);
      if (empRes.data) {
        setLogoUrl(empRes.data.logo);
        setChannelName(empRes.data.nome || "");
      }
      if (progRes.data) setProgramas(progRes.data);

      // Fetch watch history
      const { data: historyData } = await supabase
        .from("watch_history")
        .select("id, channel_name, channel_cover_url, channel_logo_url, channel_type, watched_at, channel_id")
        .eq("user_id", userId)
        .order("watched_at", { ascending: false })
        .limit(10);
      if (historyData) {
        const seen = new Set<string>();
        const unique = historyData.filter(h => {
          const key = h.channel_id || h.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setWatchHistory(unique);
      }

      setDataLoaded(true);
    };
    fetchData();
  }, [user, userSlug]);

  // Fetch profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("nome, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.nome) setProfileName(data.nome);
        if (data?.avatar_url) setProfileAvatar(data.avatar_url);
      });
  }, [user]);

  const DAY_MAP: Record<string, string> = { "0": "dom", "1": "seg", "2": "ter", "3": "qua", "4": "qui", "5": "sex", "6": "sab" };

  const getCurrentProgram = useCallback(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = DAY_MAP[String(now.getDay())];
    return programas.find(p => {
      const inTime = hhmm >= p.horario_inicio && hhmm < p.horario_fim;
      const inDay = !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.some(d => d.toLowerCase().startsWith(today));
      return inTime && inDay;
    });
  }, [programas]);

  const currentProgram = getCurrentProgram();

  // Only channels registered as "Vídeo ao vivo" in Configurações do Player
  const streamingChannels = channels.filter(ch => ch.type === "video_live");
  const catalogChannels = channels.filter(ch => ch.type === "catalog");
  // Group catalog by catalog_name
  const catalogGroups: Record<string, Channel[]> = {};
  catalogChannels.forEach(ch => {
    const groupName = ch.catalog_name || "Catálogo";
    if (!catalogGroups[groupName]) catalogGroups[groupName] = [];
    catalogGroups[groupName].push(ch);
  });

  // Fetch playlist videos for catalog channels
  useEffect(() => {
    if (!dataLoaded) return;
    const cats = channels.filter(ch => ch.type === "catalog");
    if (cats.length === 0) return;
    
    const fetchPlaylists = async () => {
      const results: Record<string, PlaylistVideo[]> = {};
      
      for (const ch of cats) {
        if (!ch.url) continue;
        // Extract playlist ID from YouTube URL
        const plMatch = ch.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        const playlistId = plMatch?.[1];
        if (!playlistId) continue;
        
        try {
          const { data, error } = await supabase.functions.invoke("youtube-playlist", {
            body: { playlistId },
          });
          if (error) {
            console.error("[PLAYLIST] Error fetching playlist for", ch.name, error);
            continue;
          }
          if (data?.videos) {
            results[ch.id] = data.videos.slice(0, 20);
          }
        } catch (err) {
          console.error("[PLAYLIST] Exception for", ch.name, err);
        }
      }
      
      setPlaylistVideos(results);
    };
    
    fetchPlaylists();
  }, [dataLoaded, channels]);

  const goToPlayer = (channelId?: string) => {
    setFadeOut(true);
    const qs = channelId ? `?ch=${channelId}` : "";
    setTimeout(() => {
      if (userSlug) {
        navigate(`/user/${userSlug}/nexohub/player/watch${qs}`);
      } else {
        navigate(`/user/nexohub/player/watch${qs}`);
      }
    }, 400);
  };
  const goToPlayerDefault = () => goToPlayer();

  const handleSignOut = async () => {
    await signOut();
    navigate("/user/nexohub/player");
  };

  const sidebarItems: { icon: typeof Home; label: string; section: Section }[] = [
    { icon: Home, label: "Home", section: "home" },
    { icon: Radio, label: "Streaming", section: "streaming" },
    { icon: Film, label: "Catálogo", section: "content" },
    ...(user ? [{ icon: ShoppingBag, label: "Loja", section: "shop" as Section }] : []),
  ];

  return (
    <div
      className="fixed inset-0 bg-player text-player-foreground flex animate-fade-in overflow-hidden"
      style={{ background: "var(--player-glow-corner)" }}
    >
      {/* Red border */}
      <div className="absolute inset-0 border border-player-accent/20 rounded-2xl pointer-events-none z-30" />

      {/* Sidebar - always visible, not affected by fade */}
      <aside className="w-20 flex flex-col items-center justify-center gap-3 z-40 fixed left-0 top-0 bottom-0">
        {sidebarItems.map(item => (
          <button
            key={item.section}
            onClick={() => {
              setActiveSection(item.section);
            }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              activeSection === item.section
                ? "bg-player-accent text-player-foreground"
                : "bg-player-surface text-player-muted-foreground hover:bg-player-surface-hover hover:text-player-foreground"
            }`}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </aside>

      {/* Content wrapper with fade transition */}
      <div className={`relative flex-1 overflow-y-auto h-full transition-opacity duration-400 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}>
        {/* Fixed Header */}
        <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-player-surface flex items-center justify-center overflow-hidden">
                {!dataLoaded ? (
                  <Skeleton className="w-full h-full rounded-full bg-white/10" />
                ) : profileAvatar ? (
                  <img src={profileAvatar} alt={userName} className="w-full h-full object-cover" />
                ) : (
                  <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-cover" />
                )}
              </div>
              <div>
                {!dataLoaded ? (
                  <>
                    <Skeleton className="h-3 w-20 bg-white/10 mb-1" />
                    <Skeleton className="h-4 w-28 bg-white/10" />
                  </>
                ) : (
                  <>
                    <p className="text-sm">Bem vindo,</p>
                    <p className="text-sm text-player-accent font-bold">{userName}</p>
                    {user ? (
                      <button onClick={handleSignOut} className="text-player-accent text-xs hover:underline flex items-center gap-1">
                        <LogOut className="h-3 w-3" /> Sair
                      </button>
                    ) : onBackToAccess ? (
                      <button onClick={onBackToAccess} className="text-player-accent text-xs hover:underline">
                        cadastre-se
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {!dataLoaded ? (
              <Skeleton className="h-[5rem] w-32 bg-white/10 rounded-lg" />
            ) : logoUrl ? (
              <img src={logoUrl} alt={channelName} className="h-[5rem] w-auto object-contain" />
            ) : null}
        </header>

        {/* Banner full-width behind content — crossfade between default and thumb on hover */}
        <div className="absolute top-0 left-20 right-3 z-0 pointer-events-none h-[400px] overflow-hidden">
          <img
            src="/images/banner-home.png"
            alt="Banner"
            className="w-full h-full object-cover object-top transition-opacity duration-500 ease-in-out"
            style={{ opacity: hoveredThumb ? 0 : 1 }}
          />
          {hoveredThumb && (
            <img
              src={hoveredThumb}
              alt="Thumb"
              className="w-full h-full object-cover object-top absolute inset-0 animate-fade-in"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-player" />
        </div>

        <main className="px-8 pt-24 pb-6 z-10 ml-20">
          {activeSection === "streaming" ? (
            /* ── Página dedicada: Canais ao Vivo ── */
            <section style={{ marginTop: "calc(600px - 200px)" }}>
              <h2 className="text-xl font-bold mb-6">Canais ao Vivo</h2>
              {!dataLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="w-full aspect-video rounded-xl bg-white/10" />
                  ))}
                </div>
              ) : streamingChannels.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum canal ao vivo disponível
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                  {streamingChannels.map((ch) => (
                    <StreamingCard
                      key={ch.id}
                      channel={ch}
                      currentProgram={currentProgram}
                      onClick={() => goToPlayer(ch.id)}
                      onHoverChange={setHoveredThumb}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : activeSection === "content" ? (
            /* ── Página dedicada: Catálogo ── */
            <section style={{ marginTop: "calc(600px - 200px)" }}>
              <h2 className="text-xl font-bold mb-6">Catálogo</h2>
              {!dataLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="w-full aspect-video rounded-xl bg-white/10" />
                  ))}
                </div>
              ) : catalogChannels.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum conteúdo de catálogo disponível
                </div>
              ) : (
                <>
                  {Object.entries(catalogGroups).map(([groupName, items]) => (
                    <div key={groupName} className="mb-10">
                      <h3 className="text-lg font-semibold mb-4">{groupName}</h3>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                        {/* Playlist videos for this group */}
                        {items.map(item => {
                          const videos = playlistVideos[item.id] || [];
                          if (videos.length === 0) {
                            return (
                              <button
                                key={item.id}
                                onClick={() => goToPlayer(item.id)}
                                className="flex-shrink-0 w-64 aspect-video rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
                              >
                                {item.cover_url ? (
                                  <img src={item.cover_url} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-player-accent/30 to-player flex items-center justify-center">
                                    <Film className="h-8 w-8 text-player-muted-foreground" />
                                  </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                  <p className="text-sm font-medium truncate text-left">{item.name}</p>
                                </div>
                              </button>
                            );
                          }
                          return videos.map(video => {
                            const dateStr = video.published
                              ? new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : "";
                            return (
                              <button
                                key={video.videoId}
                                onClick={() => goToPlayer(item.id)}
                                className="flex-shrink-0 w-64 aspect-video rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
                              >
                                {/* Use program cover as background */}
                                {item.cover_url ? (
                                  <img src={item.cover_url} alt={video.title} className="w-full h-full object-cover" />
                                ) : (
                                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                                )}
                                {/* Date badge top-left */}
                                {dateStr && (
                                  <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 px-2 py-0.5 rounded text-white">
                                    {dateStr}
                                  </span>
                                )}
                                {/* Title overlay bottom */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                  <p className="text-xs font-medium line-clamp-2 text-left text-white">{video.title}</p>
                                </div>
                              </button>
                            );
                          });
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>
          ) : (
            /* ── Home padrão ── */
            <>
              {/* Streamings ao vivo */}
              <section className="mb-10" style={{ marginTop: "calc(600px - 200px)" }}>
                {!dataLoaded ? (
                  <>
                    <Skeleton className="h-5 w-44 bg-white/10 mb-4" />
                    <div className="flex gap-4">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="flex-shrink-0 w-72 h-40 rounded-xl bg-white/10" />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold mb-4">streamings ao vivo</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {streamingChannels.length === 0 && (
                        <div className="w-72 h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                          Nenhum canal disponível
                        </div>
                      )}
                      {streamingChannels.map((ch) => (
                        <StreamingCard
                          key={ch.id}
                          channel={ch}
                          currentProgram={currentProgram}
                          onClick={() => goToPlayer(ch.id)}
                          onHoverChange={setHoveredThumb}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Visto por último */}
              {user && (
                <section>
                  {!dataLoaded ? (
                    <>
                      <Skeleton className="h-5 w-36 bg-white/10 mb-4" />
                      <div className="flex gap-4">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="w-48 h-28 rounded-xl bg-white/10" />
                        ))}
                      </div>
                    </>
                  ) : watchHistory.length > 0 ? (
                    <>
                      <h2 className="text-lg font-bold mb-4">visto por último</h2>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                        {watchHistory.map(item => (
                          <button
                            key={item.id}
                            onClick={() => goToPlayer(item.id)}
                            className="flex-shrink-0 w-48 h-28 rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
                          >
                            {item.channel_cover_url ? (
                              <img src={item.channel_cover_url} alt={item.channel_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-player-accent/30 to-player flex items-center justify-center">
                                {item.channel_logo_url ? (
                                  <img src={item.channel_logo_url} alt={item.channel_name} className="h-10 w-auto object-contain" />
                                ) : (
                                  <Radio className="h-8 w-8 text-player-muted-foreground" />
                                )}
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-xs font-medium truncate text-left">{item.channel_name}</p>
                              <p className="text-[10px] text-player-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(item.watched_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </section>
              )}

              {/* Catalog categories with playlist videos */}
              {Object.entries(catalogGroups).map(([groupName, items]) => {
                // Collect all playlist videos for this group
                const groupVideos = items.flatMap(item => {
                  const videos = playlistVideos[item.id] || [];
                  return videos.map(v => ({ ...v, channel: item }));
                });

                return (
                  <section key={groupName} className="mb-10">
                    <h2 className="text-lg font-bold mb-4">{groupName}</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {groupVideos.length > 0 ? (
                        groupVideos.map(({ channel, ...video }) => {
                          const dateStr = video.published
                            ? new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                            : "";
                          return (
                            <button
                              key={video.videoId}
                              onClick={() => goToPlayer(channel.id)}
                              className="flex-shrink-0 w-56 h-32 rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
                            >
                              <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                              {dateStr && (
                                <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 px-2 py-0.5 rounded text-white">
                                  {dateStr}
                                </span>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                <p className="text-xs font-medium line-clamp-2 text-left text-white">{video.title}</p>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => goToPlayer(item.id)}
                            className="flex-shrink-0 w-56 h-32 rounded-xl overflow-hidden relative transition-all hover:scale-[1.02] border-[5px] border-transparent hover:border-white"
                          >
                            {item.cover_url ? (
                              <img src={item.cover_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-player-accent/30 to-player flex items-center justify-center">
                                <Film className="h-8 w-8 text-player-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-xs font-medium truncate text-left">{item.name}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

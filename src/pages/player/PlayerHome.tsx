import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, UserCircle, Clock, Music, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMiniPlayerData, clearMiniPlayerData, type MiniPlayerData } from "@/components/player/MiniPlayerWidget";
const MiniPlayerWidget = lazy(() => import("@/components/player/MiniPlayerWidget"));

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

function StreamingCard({ channel, currentProgram, nowPlaying, onClick, onHoverChange }: { channel: Channel; currentProgram?: Programa; nowPlaying?: { musica: string; artista: string } | null; onClick: () => void; onHoverChange?: (thumb: string | null) => void }) {
  const [hovered, setHovered] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isVideo = channel.type === "video" || channel.type === "video_live";

  // Capture 10 frames from video stream on mount and refresh every 30s
  useEffect(() => {
    if (!isVideo || !channel.url) return;
    let cancelled = false;
    let hls: any = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const capture = async () => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;

      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;

      const doCapture = () => new Promise<string[]>((resolve) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        const captured: string[] = [];
        let count = 0;
        const grab = () => {
          if (cancelled || count >= 10) { resolve(captured); return; }
          ctx.drawImage(video, 0, 0, 320, 180);
          captured.push(canvas.toDataURL("image/jpeg", 0.7));
          count++;
          setTimeout(grab, 300);
        };
        grab();
      });

      try {
        if (channel.url!.includes(".m3u8")) {
          const Hls = (await import("hls.js")).default;
          if (Hls.isSupported()) {
            hls = new Hls({ maxBufferLength: 5 });
            hls.loadSource(channel.url!);
            hls.attachMedia(video);
            await new Promise<void>((res) => {
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().then(() => setTimeout(() => res(), 600)).catch(() => res());
              });
            });
          }
        } else {
          video.src = channel.url!;
          await video.play().catch(() => {});
          await new Promise(r => setTimeout(r, 600));
        }

        if (!cancelled) {
          const newFrames = await doCapture();
          if (!cancelled && newFrames.length > 0) setFrames(newFrames);
        }
      } catch {} finally {
        video.pause();
        video.src = "";
        if (hls) { hls.destroy(); hls = null; }
      }
    };

    capture();
    refreshTimer = setInterval(capture, 30000);

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [isVideo, channel.url]);

  // Loop through frames only while hovered
  useEffect(() => {
    if (!hovered || frames.length === 0) return;
    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => (prev + 1) % frames.length);
    }, 400);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hovered, frames.length]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(channel.logo_url || channel.cover_url || null); }}
      onMouseLeave={() => { setHovered(false); onHoverChange?.(null); }}
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

      {/* Video preview - only on hover */}
      {hovered && isVideo && frames.length > 0 && (
        <img src={frames[frameIdx]} alt="preview" className="absolute inset-0 w-full h-full object-cover z-[1]" />
      )}

      {/* "AO VIVO" badge + channel name - top left */}
      <span className="absolute top-2 left-2 z-10 text-[10px] uppercase tracking-wider font-semibold bg-black/80 px-2 py-0.5 rounded flex items-center gap-1.5 max-w-[90%]">
        <span className="inline-block w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: "#e60000" }} />
        <span className="text-white">ao vivo</span>
        <span className="text-white/60">•</span>
        <span className="text-white truncate normal-case tracking-normal">{channel.name}</span>
      </span>

      {/* Info overlay - bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-2 pt-8 flex flex-col gap-[3px]">
        {/* Nome do programa */}
        {currentProgram && (
          <p className="text-[11px] text-white/80 truncate text-left">{currentProgram.nome}</p>
        )}
        {/* Horário + progress */}
        {currentProgram && (() => {
          const [hi, mi] = currentProgram.horario_inicio.split(":").map(Number);
          const [hf, mf] = currentProgram.horario_fim.split(":").map(Number);
          const now = new Date();
          const startMin = hi * 60 + mi;
          let endMin = hf * 60 + mf;
          if (endMin <= startMin) endMin += 1440;
          const curMin = now.getHours() * 60 + now.getMinutes();
          const total = endMin - startMin;
          const elapsed = Math.max(0, Math.min(total, curMin - startMin));
          const pct = total > 0 ? (elapsed / total) * 100 : 0;
          return (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/70 whitespace-nowrap">{currentProgram.horario_inicio} - {currentProgram.horario_fim}</span>
              <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#e60000" }} />
              </div>
            </div>
          );
        })()}
        {/* Música */}
        {nowPlaying?.musica && (
          <>
            <div className="flex items-center gap-1">
              <Music className="h-2.5 w-2.5 text-white/60 flex-shrink-0" />
              <p className="text-[10px] text-white/80 truncate text-left">{nowPlaying.musica}</p>
            </div>
            <p className="text-[10px] text-white/50 truncate text-left pl-3.5">{nowPlaying.artista}</p>
          </>
        )}
      </div>
    </button>
  );
}
function CatalogRow({ groupName, groupVideos, items, onPlay, onHoverChange }: {
  groupName: string;
  groupVideos: (PlaylistVideo & { channel: Channel })[];
  items: Channel[];
  onPlay: (id: string) => void;
  onHoverChange: (thumb: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [checkScroll, groupVideos.length, items.length]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  return (
    <section className="mb-10 rounded-2xl p-5 relative group/catalog">
      <h2 className="text-lg font-bold mb-4 tracking-wide uppercase text-player-foreground/90">{groupName}</h2>
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-opacity opacity-0 group-hover/catalog:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-opacity opacity-0 group-hover/catalog:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth">
          {groupVideos.length > 0 ? (
            groupVideos.map(({ channel, ...video }) => {
              const dateStr = video.published
                ? new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "";
              const bannerThumb = channel.cover_url || video.thumbnail;
              return (
                <button
                  key={video.videoId}
                  onClick={() => onPlay(channel.id)}
                  onMouseEnter={() => onHoverChange(bannerThumb)}
                  onMouseLeave={() => onHoverChange(null)}
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
                onClick={() => onPlay(item.id)}
                onMouseEnter={() => onHoverChange(item.cover_url || null)}
                onMouseLeave={() => onHoverChange(null)}
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
      </div>
    </section>
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
  const [visibleSection, setVisibleSection] = useState<Section>("home");
  const [sectionFading, setSectionFading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const [nowPlaying, setNowPlaying] = useState<{ musica: string; artista: string } | null>(null);
  const [bannerOpacity, setBannerOpacity] = useState(1);
  const [bannerHovered, setBannerHovered] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [shopProducts, setShopProducts] = useState<{ id: string; name: string; description: string | null; price: number; image_url: string | null; payment_url: string | null; stock: number }[]>([]);

  const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(() => loadMiniPlayerData());

  // Fade banner when content scrolls over it
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    const handleScroll = () => {
      const scrollY = scrollEl.scrollTop;
      if (scrollY < 200) setBannerOpacity(1);
      else if (scrollY > 450) setBannerOpacity(0);
      else setBannerOpacity(1 - (scrollY - 200) / 250);
    };
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [dataLoaded]);

  // Poll for current music data - localStorage + DB fallback
  useEffect(() => {
    const userId = user?.id;

    const readLocal = () => {
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.titulo) {
            setNowPlaying({ musica: parsed.titulo, artista: parsed.artista || "" });
            return true;
          }
        }
      } catch {}
      return false;
    };

    const fetchFromDb = async () => {
      // Try localStorage first
      if (readLocal()) return;

      // Fallback: fetch latest from musicas_tocadas
      const targetId = userId || undefined;
      if (!targetId && (!userSlug || userSlug === ":userSlug")) return;

      try {
        if (targetId) {
          const { data } = await supabase
            .from("musicas_tocadas")
            .select("musica, artista")
            .eq("user_id", targetId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) setNowPlaying({ musica: data.musica, artista: data.artista });
        } else if (userSlug) {
          const { data } = await supabase.functions.invoke("public-player-data", {
            body: { slug: userSlug, section: "now_playing" },
          });
          if (data?.musica) setNowPlaying({ musica: data.musica, artista: data.artista || "" });
        }
      } catch {}
    };

    fetchFromDb();
    const interval = setInterval(fetchFromDb, 2000);
    return () => clearInterval(interval);
  }, [user, userSlug]);

  const userName = profileName || user?.email?.split("@")[0] || "Visitante";

  useEffect(() => {
    const fetchData = async () => {
      const userId = user?.id;

      if (userId) {
        // Logged-in user: fetch directly from DB
        const [chRes, empRes, progRes, histRes, shopRes] = await Promise.all([
          supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
          supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
          supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, descricao, apresentador_id").eq("user_id", userId).eq("ativo", true).order("horario_inicio"),
          supabase.from("watch_history").select("id, channel_name, channel_cover_url, channel_logo_url, channel_type, watched_at, channel_id").eq("user_id", userId).order("watched_at", { ascending: false }).limit(10),
          supabase.from("shopping_products").select("id, name, description, price, image_url, payment_url, stock").eq("user_id", userId).eq("active", true),
        ]);
        if (chRes.data) setChannels(chRes.data as any);
        if (empRes.data) {
          setLogoUrl(empRes.data.logo);
          setChannelName(empRes.data.nome || "");
        }
        if (progRes.data) setProgramas(progRes.data as any);
        if (histRes.data) {
          const seen = new Set<string>();
          const unique = histRes.data.filter(h => {
            const key = h.channel_id || h.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setWatchHistory(unique);
        }
        if (shopRes.data) setShopProducts(shopRes.data as any);
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
        setProfileAvatar(data?.avatar_url && data.avatar_url.trim() !== '' ? data.avatar_url : '/avatars/usr-default.png');
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

  // Channels registered as "Áudio ao vivo" or "Vídeo ao vivo" in Configurações do Player
  const streamingChannels = channels.filter(ch => ch.type === "video_live" || ch.type === "audio_live");
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

  const handleSectionChange = useCallback((section: Section) => {
    if (section === activeSection) return;
    setActiveSection(section);
    setSectionFading(true);
    setTimeout(() => {
      setVisibleSection(section);
      setSectionFading(false);
    }, 200);
  }, [activeSection]);

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
      <aside
        className="w-[72px] flex flex-col items-center py-6 gap-2 z-40 fixed left-0 top-0 bottom-0"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.55) 100%)",
          backdropFilter: "blur(32px) saturate(1.6)",
          WebkitBackdropFilter: "blur(32px) saturate(1.6)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Avatar at top of sidebar — hover to show user info */}
        <div className="group/avatar relative flex flex-col items-center mb-2">
          <div className="w-10 h-10 rounded-full bg-player-surface flex items-center justify-center overflow-hidden cursor-pointer">
            {!dataLoaded ? (
              <Skeleton className="w-full h-full rounded-full bg-white/10" />
            ) : profileAvatar ? (
              <img src={profileAvatar} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-cover" />
            )}
          </div>
          {/* Popup on hover */}
          <div className="absolute left-[56px] top-0 opacity-0 pointer-events-none group-hover/avatar:opacity-100 group-hover/avatar:pointer-events-auto transition-all duration-200 z-50">
            <div className="rounded-xl px-4 py-3 flex flex-col gap-0.5 whitespace-nowrap" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <p className="text-sm text-white/70">Bem vindo,</p>
              <p className="text-sm text-player-accent font-bold">{userName}</p>
              {user ? (
                <button onClick={handleSignOut} className="text-white/50 text-xs hover:text-white hover:underline flex items-center gap-1 transition-colors mt-0.5">
                  <LogOut className="h-3 w-3" /> Sair
                </button>
              ) : onBackToAccess ? (
                <button onClick={onBackToAccess} className="text-player-accent text-xs hover:underline mt-0.5">
                  cadastre-se
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="w-8 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />

        {/* Nav items — centered vertically with sliding highlight */}
        <nav ref={navRef} className="flex flex-col items-center gap-1.5 flex-1 justify-center relative">
          {/* Sliding background pill — uses refs for exact positioning */}
          {(() => {
            const activeBtn = btnRefs.current[activeSection];
            const nav = navRef.current;
            if (!activeBtn || !nav) return null;
            const navRect = nav.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const top = btnRect.top - navRect.top;
            const height = btnRect.height;
            return (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-xl pointer-events-none z-0"
                  style={{
                    top,
                    height,
                    width: 52,
                    transition: "top 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
                    boxShadow: "0 4px 20px hsla(var(--player-accent) / 0.4)",
                  }}
                />
                <span
                  className="absolute -left-[1px] w-[3px] h-7 rounded-r-full pointer-events-none z-0"
                  style={{
                    top: top + height / 2 - 14,
                    transition: "top 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    backgroundColor: "hsl(var(--player-accent))",
                  }}
                />
              </>
            );
          })()}
          {sidebarItems.map(item => {
            const isActive = activeSection === item.section;
            return (
              <button
                key={item.section}
                ref={el => { btnRefs.current[item.section] = el; }}
                onMouseEnter={() => handleSectionChange(item.section)}
                className="group relative w-[52px] rounded-xl px-2 py-3 flex flex-col items-center justify-center gap-1 transition-all duration-300 focus-visible:outline-none z-[1]"
                title={item.label}
                aria-label={item.label}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300">
                  <item.icon className={`h-[18px] w-[18px] transition-colors duration-200 ${isActive ? "text-white" : "text-white/50 group-hover:text-white/80"}`} />
                </div>
                <span className={`text-[8px] font-medium leading-none tracking-wide transition-colors duration-200 ${isActive ? "text-white" : "text-white/40 group-hover:text-white/70"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Banner fixo no topo — sempre visível */}
      <div
        className="fixed top-0 z-0 h-[400px] overflow-hidden rounded-b-2xl pointer-events-none"
        style={{ width: "calc(95% - 72px)", left: "calc(72px + 2.5%)", right: "2.5%" }}
      >
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
        <div
          className="absolute bottom-0 left-0 right-0 h-[160px] pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 0%, hsl(var(--player)) 100%)" }}
        />
      </div>

      <div
        ref={scrollContainerRef}
        className={`relative flex-1 overflow-y-auto h-full transition-opacity duration-400 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0px, transparent 415px, black 515px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, transparent 415px, black 515px)",
        }}
      >

        <main ref={mainRef} className="px-8 pt-24 pb-6 ml-[72px] relative z-[10]">
          <div className="transition-opacity duration-200 ease-in-out" style={{ opacity: sectionFading ? 0 : 1 }}>
          {visibleSection === "streaming" ? (
            /* ── Página dedicada: Canais ao Vivo ── */
             <section className="rounded-2xl p-5" style={{ marginTop: "380px" }}>
              <h2 className="text-xl font-bold mb-6 tracking-wide uppercase text-player-foreground/90">Canais ao Vivo</h2>
              {!dataLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="w-full aspect-video rounded-xl bg-white/10" />
                  ))}
                </div>
              ) : streamingChannels.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum canal ao vivo disponível
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {streamingChannels.map((ch) => (
                    <StreamingCard
                      key={ch.id}
                      channel={ch}
                      currentProgram={currentProgram}
                      nowPlaying={nowPlaying}
                      onClick={() => goToPlayer(ch.id)}
                      onHoverChange={setHoveredThumb}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : visibleSection === "content" ? (
            /* ── Página dedicada: Catálogo ── */
            <section className="rounded-2xl p-5" style={{ marginTop: "380px" }}>
              <h2 className="text-xl font-bold mb-6 tracking-wide uppercase text-player-foreground/90">Catálogo</h2>
              {!dataLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                      <div className="relative group/scroll">
                        {/* Left edge scroll zone */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-16 z-10 cursor-pointer opacity-0 group-hover/scroll:opacity-100 transition-opacity"
                          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5), transparent)" }}
                          onMouseEnter={(e) => {
                            const container = e.currentTarget.nextElementSibling?.nextElementSibling as HTMLElement;
                            if (!container) return;
                            const id = setInterval(() => container.scrollBy({ left: -4 }), 16);
                            (e.currentTarget as any)._scrollId = id;
                          }}
                          onMouseLeave={(e) => { clearInterval((e.currentTarget as any)._scrollId); }}
                        />
                        {/* Right edge scroll zone */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-16 z-10 cursor-pointer opacity-0 group-hover/scroll:opacity-100 transition-opacity"
                          style={{ background: "linear-gradient(to left, rgba(0,0,0,0.5), transparent)" }}
                          onMouseEnter={(e) => {
                            const container = e.currentTarget.nextElementSibling as HTMLElement;
                            if (!container) return;
                            const id = setInterval(() => container.scrollBy({ left: 4 }), 16);
                            (e.currentTarget as any)._scrollId = id;
                          }}
                          onMouseLeave={(e) => { clearInterval((e.currentTarget as any)._scrollId); }}
                        />
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth">
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
                                  {item.cover_url ? (
                                    <img src={item.cover_url} alt={video.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                                  )}
                                  {dateStr && (
                                    <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 px-2 py-0.5 rounded text-white">
                                      {dateStr}
                                    </span>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                    <p className="text-xs font-medium line-clamp-2 text-left text-white">{video.title}</p>
                                  </div>
                                </button>
                              );
                            });
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>
          ) : visibleSection === "shop" ? (
            /* ── Página dedicada: Loja ── */
            <section className="rounded-2xl p-5" style={{ marginTop: "380px" }}>
              <h2 className="text-xl font-bold mb-6 tracking-wide uppercase text-player-foreground/90">Loja</h2>
              {!dataLoaded ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl bg-white/10" />
                  ))}
                </div>
              ) : shopProducts.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum produto disponível
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {shopProducts.map(product => (
                    <div
                      key={product.id}
                      className="group rounded-xl overflow-hidden transition-all duration-300 hover:border-white/80"
                      style={{
                        background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {/* Image */}
                      <div className="aspect-square overflow-hidden relative">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(var(--player-accent) / 0.15), hsl(var(--player) / 0.8))" }}>
                            <ShoppingBag className="h-8 w-8 text-white/20" />
                          </div>
                        )}
                        {/* Price badge */}
                        <div
                          className="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white"
                          style={{
                            background: "hsl(var(--player-accent))",
                            boxShadow: "0 4px 16px hsla(var(--player-accent) / 0.5)",
                          }}
                        >
                          R$ {product.price.toFixed(2).replace(".", ",")}
                        </div>
                        {/* Stock indicator */}
                        {product.stock <= 3 && (
                          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-yellow-500/90 text-black">
                            {product.stock === 1 ? "Último!" : `Restam ${product.stock}`}
                          </span>
                        )}
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      {/* Info */}
                      <div className="p-3 flex flex-col gap-1.5">
                        <p className="text-xs font-bold text-white truncate group-hover:text-player-accent transition-colors duration-200">
                          {product.name}
                        </p>
                        {product.description && (
                          <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">{product.description}</p>
                        )}
                        {product.payment_url && (
                          <a
                            href={product.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 w-full text-center text-[10px] font-bold py-2 rounded-lg transition-all duration-300 uppercase tracking-wider"
                            style={{
                              background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
                              color: "white",
                              boxShadow: "0 2px 12px hsla(var(--player-accent) / 0.3)",
                            }}
                            onMouseEnter={e => { (e.target as HTMLElement).style.transform = "translateY(-1px)"; (e.target as HTMLElement).style.boxShadow = "0 6px 20px hsla(var(--player-accent) / 0.5)"; }}
                            onMouseLeave={e => { (e.target as HTMLElement).style.transform = ""; (e.target as HTMLElement).style.boxShadow = "0 2px 12px hsla(var(--player-accent) / 0.3)"; }}
                          >
                            Comprar
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            /* ── Home padrão ── */
            <>
              {/* Streamings ao vivo */}
               <section className="mb-10 rounded-2xl p-5" style={{ marginTop: "380px" }}>
                {!dataLoaded ? (
                  <>
                    <Skeleton className="h-5 w-44 bg-white/10 mb-4" />
                    <div className="flex gap-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="flex-shrink-0 w-72 h-40 rounded-xl bg-white/10" />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold mb-4 tracking-wide uppercase text-player-foreground/90">streamings ao vivo</h2>
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
                          nowPlaying={nowPlaying}
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
                <section className="mb-10 rounded-2xl p-5">
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
                      <h2 className="text-lg font-bold mb-4 tracking-wide uppercase text-player-foreground/90">visto por último</h2>
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
                const groupVideos = items.flatMap(item => {
                  const videos = playlistVideos[item.id] || [];
                  return videos.map(v => ({ ...v, channel: item }));
                });

                return (
                  <CatalogRow
                    key={groupName}
                    groupName={groupName}
                    groupVideos={groupVideos}
                    items={items}
                    onPlay={goToPlayer}
                    onHoverChange={setHoveredThumb}
                  />
                );
              })}
            </>
          )}
          </div>
        </main>
      </div>
      {miniPlayerData && (
        <Suspense fallback={null}>
          <MiniPlayerWidget data={miniPlayerData} onClose={() => { clearMiniPlayerData(); setMiniPlayerData(null); }} />
        </Suspense>
      )}
    </div>
  );
}

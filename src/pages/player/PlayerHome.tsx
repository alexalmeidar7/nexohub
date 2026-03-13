import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, Clock, Music, ChevronLeft, ChevronRight, Play, LayoutGrid, Flame, TrendingUp, Tag, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMiniPlayerData, clearMiniPlayerData, type MiniPlayerData } from "@/components/player/MiniPlayerWidget";
import PlayerSidebar from "@/components/player/PlayerSidebar";
const MiniPlayerWidget = lazy(() => import("@/components/player/MiniPlayerWidget"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));

interface Channel {
  id: string;
  name: string;
  cover_url: string | null;
  logo_url: string | null;
  background_url: string | null;
  type: string;
  url?: string;
  catalog_name?: string;
  numero_canal?: string | null;
}

interface Programa {
  id?: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  capa: string | null;
  thumb: string | null;
  descricao?: string | null;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

type Section = "home" | "streaming" | "content" | "shop";

/* ─── Hero Banner Carousel ─── */
function HeroBanner({
  currentProgram,
  nextProgram,
  nowPlaying,
  channelName,
  onPlay,
  onGrade,
}: {
  currentProgram?: Programa;
  nextProgram?: Programa;
  nowPlaying?: { musica: string; artista: string } | null;
  channelName?: string;
  onPlay: () => void;
  onGrade: () => void;
}) {
  const INTERVAL = 8000;
  const [aiData, setAiData] = useState<Record<string, { keywords: string[]; classificacao: string }>>({});
  const aiCache = useRef<Record<string, { keywords: string[]; classificacao: string }>>({});

  // Fetch AI analysis for current program
  useEffect(() => {
    const prog = currentProgram;
    if (!prog?.descricao || !prog.id) return;
    if (aiCache.current[prog.id]) { setAiData(prev => ({ ...prev, [prog.id!]: aiCache.current[prog.id!] })); return; }
    supabase.functions.invoke("analyze-program", { body: { nome: prog.nome, descricao: prog.descricao } })
      .then(({ data }) => {
        if (data && !data.error && prog.id) {
          const result = { keywords: data.keywords || [], classificacao: data.classificacao || "Livre" };
          aiCache.current[prog.id] = result;
          setAiData(prev => ({ ...prev, [prog.id!]: result }));
        }
      });
  }, [currentProgram?.id]);

  // Fetch AI analysis for next program
  useEffect(() => {
    const prog = nextProgram;
    if (!prog?.descricao || !prog.id) return;
    if (aiCache.current[prog.id]) { setAiData(prev => ({ ...prev, [prog.id!]: aiCache.current[prog.id!] })); return; }
    supabase.functions.invoke("analyze-program", { body: { nome: prog.nome, descricao: prog.descricao } })
      .then(({ data }) => {
        if (data && !data.error && prog.id) {
          const result = { keywords: data.keywords || [], classificacao: data.classificacao || "Livre" };
          aiCache.current[prog.id] = result;
          setAiData(prev => ({ ...prev, [prog.id!]: result }));
        }
      });
  }, [nextProgram?.id]);

  const RATING_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    "Livre": { bg: "rgba(34,197,94,0.2)", text: "rgb(74,222,128)", label: "L" },
    "6": { bg: "rgba(251,191,36,0.2)", text: "rgb(251,191,36)", label: "6" },
    "10": { bg: "rgba(59,130,246,0.2)", text: "rgb(96,165,250)", label: "10" },
    "12": { bg: "rgba(245,158,11,0.2)", text: "rgb(251,191,36)", label: "12" },
    "14": { bg: "rgba(249,115,22,0.2)", text: "rgb(251,146,60)", label: "14" },
    "16": { bg: "rgba(239,68,68,0.2)", text: "rgb(248,113,113)", label: "16" },
    "18": { bg: "rgba(220,38,38,0.3)", text: "rgb(248,113,113)", label: "18" },
  };

  // Build slides: current program thumb + next program thumb (if available)
  const slides = useMemo(() => {
    const s: { thumb: string | null; program: Programa | undefined; label: string }[] = [];
    s.push({ thumb: currentProgram?.thumb || null, program: currentProgram, label: "Agora" });
    if (nextProgram?.thumb) {
      s.push({ thumb: nextProgram.thumb, program: nextProgram, label: "A seguir" });
    }
    return s;
  }, [currentProgram?.thumb, nextProgram?.thumb, currentProgram, nextProgram]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-rotate
  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIdx(prev => {
        setPrevIdx(prev);
        return (prev + 1) % slides.length;
      });
    }, INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length]);

  // Clear prevIdx after crossfade
  useEffect(() => {
    if (prevIdx === null) return;
    const t = setTimeout(() => setPrevIdx(null), 1000);
    return () => clearTimeout(t);
  }, [prevIdx]);

  const goTo = (idx: number) => {
    if (idx === activeIdx) return;
    setPrevIdx(activeIdx);
    setActiveIdx(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length > 1) {
      timerRef.current = setInterval(() => {
        setActiveIdx(prev => { setPrevIdx(prev); return (prev + 1) % slides.length; });
      }, INTERVAL);
    }
  };

  const activeSlide = slides[activeIdx];
  const displayProgram = activeSlide?.program;

  // Progress bar for current program
  let pct = 0;
  if (currentProgram) {
    const [hi, mi] = currentProgram.horario_inicio.split(":").map(Number);
    const [hf, mf] = currentProgram.horario_fim.split(":").map(Number);
    const now = new Date();
    const startMin = hi * 60 + mi;
    let endMin = hf * 60 + mf;
    if (endMin <= startMin) endMin += 1440;
    const curMin = now.getHours() * 60 + now.getMinutes();
    const total = endMin - startMin;
    const elapsed = Math.max(0, Math.min(total, curMin - startMin));
    pct = total > 0 ? (elapsed / total) * 100 : 0;
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "clamp(340px, 56vh, 560px)", backgroundColor: "black" }}>
      {/* Crossfade images */}
      {slides.map((slide, idx) => {
        if (!slide.thumb) return (
          <div
            key={`slide-${idx}`}
            className="absolute inset-0 w-full h-full bg-black"
            style={{
              opacity: idx === activeIdx ? 1 : 0,
              transition: "opacity 1s ease-in-out",
              zIndex: idx === activeIdx ? 1 : idx === prevIdx ? 0 : -1,
            }}
          />
        );
        return (
          <img
            key={`slide-${idx}`}
            src={slide.thumb}
            alt={slide.program?.nome || "Banner"}
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{
              opacity: idx === activeIdx ? 1 : idx === prevIdx ? 0 : 0,
              transition: "opacity 1s ease-in-out",
              zIndex: idx === activeIdx ? 1 : idx === prevIdx ? 0 : -1,
            }}
          />
        );
      })}

      {/* Gradient overlays */}
      <div className="absolute inset-0 z-[2]" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
      <div className="absolute inset-0 z-[2]" style={{ background: "linear-gradient(to top, hsl(var(--player-bg)) 0%, rgba(0,0,0,0.3) 30%, transparent 60%)" }} />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-8 sm:px-12 pb-10 z-10 player-hero-content" style={{ maxWidth: "680px" }}>
        {/* Slide label badge */}
        <div className="flex items-center gap-2 mb-3" style={{ animation: "player-hero-content 0.6s ease-out both" }}>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold bg-player-accent/90 px-2.5 py-1 rounded-md text-white">
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
            {activeSlide?.label || "ao vivo"}
          </span>
          {channelName && <span className="text-white/60 text-xs">{channelName}</span>}
        </div>

        {/* Program name */}
        {displayProgram ? (
          <>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-2 drop-shadow-lg" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
              {displayProgram.nome}
            </h1>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-white/70">{displayProgram.horario_inicio} – {displayProgram.horario_fim}</span>
              {activeIdx === 0 && (
                <div className="w-32 h-1 rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "hsl(var(--player-accent))" }} />
                </div>
              )}
            </div>
            {displayProgram.descricao && (
              <p className="text-xs text-white/50 line-clamp-1 mb-2 max-w-md">{displayProgram.descricao}</p>
            )}
            {/* Keywords + Age rating */}
            {displayProgram.id && aiData[displayProgram.id] && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {aiData[displayProgram.id].keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium"
                    style={{
                      backgroundColor: "hsla(var(--player-accent) / 0.12)",
                      color: "hsl(var(--player-accent))",
                      border: "1px solid hsla(var(--player-accent) / 0.2)",
                    }}
                  >
                    <Tag size={8} />
                    {kw}
                  </span>
                ))}
                {(() => {
                  const cls = aiData[displayProgram.id].classificacao;
                  const rating = RATING_COLORS[cls] || RATING_COLORS["Livre"];
                  return (
                    <span
                      className="inline-flex items-center justify-center text-[8px] font-black rounded shadow"
                      style={{
                        backgroundColor: rating.bg,
                        color: rating.text,
                        border: `1.5px solid ${rating.text}`,
                        minWidth: "18px",
                        height: "18px",
                        padding: "0 4px",
                      }}
                    >
                      {rating.label}
                    </span>
                  );
                })()}
              </div>
            )}
          </>
        ) : channelName ? (
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-4 drop-shadow-lg" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
            {channelName}
          </h1>
        ) : null}

        {/* Now playing music */}
        {nowPlaying?.musica && (
          <div className="flex items-center gap-2 mb-4">
            <Music className="h-3.5 w-3.5 text-player-accent flex-shrink-0" />
            <span className="text-xs text-white/70 truncate">{nowPlaying.musica} — {nowPlaying.artista}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlay}
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all duration-300 hover:scale-105"
            style={{
              background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
              boxShadow: "0 4px 24px hsla(var(--player-accent) / 0.4)",
            }}
          >
            <Play className="h-4 w-4 fill-white" />
            Assistir agora
          </button>
          <button
            onClick={onGrade}
            className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold text-white/90 transition-all duration-300 hover:bg-white/20"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <LayoutGrid className="h-4 w-4" />
            Grade
          </button>
        </div>

        {/* Carousel indicators */}
        {slides.length > 1 && (
          <div className="flex items-center gap-2 mt-5">
            {slides.map((slide, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className="relative h-1 rounded-full overflow-hidden transition-all duration-300"
                style={{ width: idx === activeIdx ? 32 : 12, background: "rgba(255,255,255,0.2)" }}
              >
                {idx === activeIdx && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: "hsl(var(--player-accent))",
                      animation: `shrinkBarReverse ${INTERVAL}ms linear both`,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Streaming Card (Live channels) ─── */
function StreamingCard({ channel, currentProgram, nowPlaying, onClick }: {
  channel: Channel;
  currentProgram?: Programa;
  nowPlaying?: { musica: string; artista: string } | null;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVideo = channel.type === "video" || channel.type === "video_live";

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
    return () => { cancelled = true; if (hls) hls.destroy(); if (refreshTimer) clearInterval(refreshTimer); };
  }, [isVideo, channel.url]);

  useEffect(() => {
    if (!hovered || frames.length === 0) return;
    intervalRef.current = setInterval(() => setFrameIdx(prev => (prev + 1) % frames.length), 400);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hovered, frames.length]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex-shrink-0 rounded-xl overflow-hidden relative transition-all duration-300 group border-2 border-transparent hover:border-player-accent/60 hover:shadow-[0_0_30px_-5px_hsla(var(--player-accent)/0.3)] hover:-translate-y-1 player-card-pop"
      style={{ width: "320px", aspectRatio: "16/9" }}
    >
      {channel.cover_url ? (
        <img src={channel.cover_url} alt={channel.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : channel.logo_url ? (
        <img src={channel.logo_url} alt={channel.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-player-accent/20 to-player-bg flex items-center justify-center">
          <Radio className="h-10 w-10 text-player-muted-foreground" />
        </div>
      )}

      {hovered && isVideo && frames.length > 0 && (
        <img src={frames[frameIdx]} alt="preview" className="absolute inset-0 w-full h-full object-cover z-[1]" />
      )}

      {/* Channel logo top-right */}
      {channel.logo_url && (
        <div className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full overflow-hidden bg-black/50 backdrop-blur-sm border border-white/10 shadow-lg">
          <img src={channel.logo_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Live badge */}
      <span className="absolute top-3 left-3 z-10 text-[10px] uppercase tracking-wider font-bold bg-player-accent/90 px-2 py-0.5 rounded-md flex items-center gap-1.5 text-white shadow-lg">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        ao vivo
      </span>

      {/* Play overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[2]">
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play className="h-5 w-5 text-white fill-white" />
        </div>
      </div>

      {/* Info overlay - bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3 pt-14 text-left" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 20%, transparent)" }}>
        <p className="text-xs font-bold text-white truncate mb-0.5">{channel.name}</p>
        {currentProgram && (
          <p className="text-[10px] text-white/60 truncate">{currentProgram.nome} • {currentProgram.horario_inicio} – {currentProgram.horario_fim}</p>
        )}
        {nowPlaying?.musica && (
          <div className="flex items-center gap-1 mt-1">
            <Music className="h-2.5 w-2.5 text-player-accent flex-shrink-0" />
            <p className="text-[9px] text-white/50 truncate">{nowPlaying.musica} — {nowPlaying.artista}</p>
          </div>
        )}
      </div>
    </button>
  );
}

/* ─── Content Row (horizontal scroll with arrows) ─── */
function ContentRow({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
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
  }, [checkScroll]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  return (
    <section className="mb-8 relative group/row player-row-slide">
      <h2 className="text-base sm:text-lg font-bold mb-3 tracking-wide text-white/90 px-1 player-hero-content">{title}</h2>
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover/row:opacity-100"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover/row:opacity-100"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide scroll-smooth">
          {children}
        </div>
      </div>
    </section>
  );
}

// Global flag: stop AI cover calls if credits exhausted
let aiCoverDisabled = false;

/* ─── Trending Card (Em Alta) with expand-right video preview ─── */
function TrendingCard({ item, idx, channels, onClick }: {
  item: { id: string; image: string | null; title: string; subtitle?: string; type: "live" | "catalog"; channelId: string; videoId?: string; logoUrl?: string | null };
  idx: number;
  channels: Channel[];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiCover, setAiCover] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Generate AI cover only if no image AND credits available
  useEffect(() => {
    if (item.image || aiCover || aiLoading || aiCoverDisabled) return;
    setAiLoading(true);
    supabase.functions.invoke("generate-cover", { body: { title: item.title, type: "trending" } })
      .then(({ data, error }) => {
        if (error) {
          // Stop all future AI calls if credits exhausted
          const status = (error as any)?.status || (typeof error === 'object' && (error as any)?.context?.status);
          if (status === 402 || status === 500) aiCoverDisabled = true;
          return;
        }
        if (data?.imageUrl) setAiCover(data.imageUrl);
      })
      .catch(() => { aiCoverDisabled = true; })
      .finally(() => setAiLoading(false));
  }, [item.image, item.title, aiCover, aiLoading]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if ((window as any).YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  const fadeInAudio = () => {
    if (!playerRef.current?.setVolume) return;
    let vol = 0;
    playerRef.current.setVolume(0);
    playerRef.current.unMute();
    fadeIntervalRef.current = setInterval(() => {
      vol = Math.min(vol + 5, 60);
      playerRef.current?.setVolume(vol);
      if (vol >= 60 && fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    }, 80);
  };

  const fadeOutAudio = () => {
    if (!playerRef.current?.setVolume) return;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    let vol = playerRef.current.getVolume?.() || 60;
    fadeIntervalRef.current = setInterval(() => {
      vol = Math.max(vol - 8, 0);
      playerRef.current?.setVolume(vol);
      if (vol <= 0) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        playerRef.current?.pauseVideo();
      }
    }, 50);
  };

  const handleMouseEnter = () => {
    setHovered(true);
    if (item.type === "catalog" && item.videoId) {
      timerRef.current = setTimeout(() => setShowVideo(true), 500);
    }
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    fadeOutAudio();
    setTimeout(() => {
      setShowVideo(false);
      setHovered(false);
      if (playerRef.current?.destroy) { playerRef.current.destroy(); playerRef.current = null; }
    }, 400);
  };

  // Create YT player when video should show
  useEffect(() => {
    if (!showVideo || !item.videoId || !containerRef.current) return;

    const createPlayer = () => {
      const div = document.createElement("div");
      div.id = `yt-trending-${item.videoId}-${idx}`;
      containerRef.current?.querySelector(".yt-host")?.replaceChildren(div);

      playerRef.current = new (window as any).YT.Player(div.id, {
        videoId: item.videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          showinfo: 0,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          cc_load_policy: 0,
          start: 120,
        },
        events: {
          onReady: (e: any) => {
            e.target.playVideo();
            setTimeout(() => fadeInAudio(), 300);
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    }

    stopTimerRef.current = setTimeout(() => handleMouseLeave(), 15000);

    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [showVideo, item.videoId]);

  const coverSrc = item.image || aiCover;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex-shrink-0 rounded-xl overflow-hidden relative transition-all duration-500 ease-out group border-2 border-transparent hover:border-player-accent/50 hover:shadow-[0_0_40px_-5px_rgba(200,0,0,0.4)] cursor-pointer"
      style={{
        width: showVideo ? "520px" : "200px",
        aspectRatio: showVideo ? "16/9" : "2/3",
        background: "hsl(var(--player-bg))",
        zIndex: showVideo ? 20 : 1,
        transform: hovered && !showVideo ? "translateY(-4px)" : "none",
      }}
    >
      {/* Cover image */}
      {coverSrc ? (
        <img
          src={coverSrc}
          alt={item.title}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${showVideo ? "opacity-0 scale-110 blur-sm" : "opacity-100"} group-hover:scale-105`}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: "hsl(var(--player-bg))" }}>
          {aiLoading ? (
            <div className="w-6 h-6 rounded-full border-2 border-player-accent/40 border-t-player-accent animate-spin" />
          ) : (
            <TrendingUp className="h-8 w-8" style={{ color: "hsl(var(--player-accent))", opacity: 0.5 }} />
          )}
        </div>
      )}

      {/* YouTube player container — no controls, no branding */}
      {showVideo && (
        <div className="absolute inset-0 z-[2] animate-fade-in pointer-events-none">
          <div className="yt-host w-full h-full [&_iframe]{w-full h-full}" />
          {/* Overlay to block YouTube click interactions */}
          <div className="absolute inset-0" />
        </div>
      )}

      {/* Ranking badge */}
      <div
        className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg"
        style={{ backgroundColor: "hsl(var(--player-accent))" }}
      >
        {idx + 1}
      </div>

      {/* Channel/Catalog logo - top right, no circle, above everything */}
      {item.logoUrl && (
        <div className="absolute top-2 right-2 z-[12] w-10 h-6 flex items-center justify-center drop-shadow-lg">
          <img src={item.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Live badge */}
      {item.type === "live" && !item.logoUrl && (
        <span className="absolute top-2 right-2 z-10 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: "hsl(var(--player-accent))", opacity: 0.9 }}>
          live
        </span>
      )}

      {/* Gradient + title */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-[3] pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3 z-[4] text-left pointer-events-none">
        <p className="text-[11px] font-bold text-white leading-tight line-clamp-2 drop-shadow">{item.title}</p>
        {item.subtitle && <p className="text-[9px] text-white/60 mt-0.5">{item.subtitle}</p>}
      </div>

      {/* Play overlay */}
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[5] pointer-events-none">
          <div className="w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center" style={{ backgroundColor: "hsl(var(--player-accent))", opacity: 0.8 }}>
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Catalog Card ─── */
function CatalogCard({ image, title, subtitle, logoUrl, onClick }: { image?: string | null; title: string; subtitle?: string; logoUrl?: string | null; onClick: () => void }) {
  const [aiCover, setAiCover] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (image || aiCover || aiLoading) return;
    setAiLoading(true);
    supabase.functions.invoke("generate-cover", { body: { title, type: "catalog" } })
      .then(({ data }) => {
        if (data?.imageUrl) setAiCover(data.imageUrl);
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [image, title, aiCover, aiLoading]);

  const coverSrc = image || aiCover;

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-xl overflow-hidden relative transition-all duration-300 group border-2 border-transparent hover:border-white/30 hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] hover:-translate-y-1 player-card-pop"
      style={{ width: "220px", aspectRatio: "16/9" }}
    >
      {coverSrc ? (
        <img src={coverSrc} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-white/10 to-player-bg flex items-center justify-center">
          {aiLoading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          ) : (
            <Film className="h-8 w-8 text-white/20" />
          )}
        </div>
      )}

      {/* Channel logo top-right */}
      {logoUrl && (
        <div className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full overflow-hidden bg-black/50 backdrop-blur-sm border border-white/10 shadow">
          <img src={logoUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[2]">
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Play className="h-4 w-4 text-white fill-white" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-2.5 pt-10" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 10%, transparent)" }}>
        <p className="text-[10px] font-bold text-white line-clamp-2 text-left mb-0.5">{title}</p>
        {subtitle && <p className="text-[9px] text-white/40 text-left">{subtitle}</p>}
      </div>
    </button>
  );
}
/* ─── History Card ─── */
function HistoryCard({ item, onClick }: { item: { channel_name: string; channel_cover_url: string | null; channel_logo_url: string | null; watched_at: string }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-xl overflow-hidden relative transition-all duration-300 group border-2 border-transparent hover:border-white/30 hover:-translate-y-1 player-card-pop"
      style={{ width: "200px", aspectRatio: "16/9" }}
    >
      {item.channel_cover_url ? (
        <img src={item.channel_cover_url} alt={item.channel_name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      ) : item.channel_logo_url ? (
        <div className="w-full h-full bg-gradient-to-br from-white/5 to-player-bg flex items-center justify-center">
          <img src={item.channel_logo_url} alt={item.channel_name} className="h-12 w-auto object-contain" />
        </div>
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-player-accent/15 to-player-bg flex items-center justify-center">
          <Radio className="h-8 w-8 text-white/20" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
        <p className="text-xs font-bold text-white truncate">{item.channel_name}</p>
        <p className="text-[10px] text-white/40 flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {new Date(item.watched_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   PlayerHome — Main component
   ═══════════════════════════════════════════════════════ */

interface PlayerHomeProps {
  onBackToAccess?: () => void;
}

export default function PlayerHome({ onBackToAccess }: PlayerHomeProps = {}) {
  const { user, signOut, loading: authLoading } = useAuth();
  const { userSlug } = useParams();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [visibleSection, setVisibleSection] = useState<Section>("home");
  const [sectionFading, setSectionFading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, PlaylistVideo[]>>({});
  const [nowPlaying, setNowPlaying] = useState<{ musica: string; artista: string } | null>(null);
  const [shopProducts, setShopProducts] = useState<any[]>([]);
  const [showGrade, setShowGrade] = useState(false);

  const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(() => loadMiniPlayerData());

  // Poll for current music data
  useEffect(() => {
    const userId = user?.id;
    const fetchMusic = async () => {
      // Try localStorage first
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.titulo) { setNowPlaying({ musica: parsed.titulo, artista: parsed.artista || "" }); return; }
        }
      } catch {}
      // Fallback to DB
      const targetId = userId || undefined;
      if (!targetId && (!userSlug || userSlug === ":userSlug")) return;
      try {
        if (targetId) {
          const { data } = await supabase.from("musicas_tocadas").select("musica, artista").eq("user_id", targetId).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (data) setNowPlaying({ musica: data.musica, artista: data.artista });
        } else if (userSlug) {
          const { data } = await supabase.functions.invoke("public-player-data", { body: { slug: userSlug, section: "now_playing" } });
          if (data?.musica) setNowPlaying({ musica: data.musica, artista: data.artista || "" });
        }
      } catch {}
    };
    fetchMusic();
    const interval = setInterval(fetchMusic, 5000);
    return () => clearInterval(interval);
  }, [user, userSlug]);

  const userName = profileName || user?.email?.split("@")[0] || "Visitante";

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (callback: () => Promise<void>, attempt: number) => {
      if (cancelled || attempt >= 2) return false;
      retryTimer = setTimeout(() => { void callback(); }, 500 * (attempt + 1));
      return true;
    };

    const fetchAuthenticatedData = async (attempt = 0) => {
      const userId = user?.id;
      if (!userId || cancelled) return;

      const [chRes, empRes, progRes, histRes, shopRes] = await Promise.all([
        supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
        supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
        supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, thumb, descricao, apresentador_id").eq("user_id", userId).eq("ativo", true).order("horario_inicio"),
        supabase.from("watch_history").select("id, channel_name, channel_cover_url, channel_logo_url, channel_type, watched_at, channel_id").eq("user_id", userId).order("watched_at", { ascending: false }).limit(10),
        supabase.from("shopping_products").select("id, name, description, price, image_url, payment_url, stock").eq("user_id", userId).eq("active", true),
      ]);

      if (cancelled) return;

      let channelsData = (chRes.data ?? []) as any[];
      let channelError = chRes.error;

      if (!channelError && channelsData.length === 0) {
        const fallbackChRes = await supabase.from("streaming_channels").select("*").eq("active", true).order("numero_canal");
        if (!fallbackChRes.error && fallbackChRes.data) channelsData = fallbackChRes.data as any[];
        else if (fallbackChRes.error) channelError = fallbackChRes.error;
      }

      const programasData = (progRes.data ?? []) as any[];
      const hasCriticalError = Boolean(channelError || progRes.error);
      const possibleAuthRace = channelsData.length === 0 && programasData.length === 0;

      if ((hasCriticalError || possibleAuthRace) && scheduleRetry(() => fetchAuthenticatedData(attempt + 1), attempt)) return;

      setChannels(channelsData as any);
      if (empRes.data) { setLogoUrl(empRes.data.logo); setChannelName(empRes.data.nome || ""); }
      setProgramas(programasData as any);

      if (histRes.data) {
        const seen = new Set<string>();
        setWatchHistory(histRes.data.filter(h => { const key = h.channel_id || h.id; if (seen.has(key)) return false; seen.add(key); return true; }));
      } else setWatchHistory([]);

      setShopProducts((shopRes.data ?? []) as any);
      setDataLoaded(true);
    };

    const fetchPublicData = async (slug: string, attempt = 0) => {
      if (cancelled) return;
      const { data, error } = await supabase.functions.invoke("public-player-data", { body: { slug } });
      if (cancelled) return;
      if (Boolean(error || data?.error) && scheduleRetry(() => fetchPublicData(slug, attempt + 1), attempt)) return;
      setChannels((data?.channels ?? []) as any);
      if (data?.empresa?.logo) setLogoUrl(data.empresa.logo);
      if (data?.empresa?.nome) setChannelName(data.empresa.nome);
      setProgramas((data?.programas ?? []) as any);
      setDataLoaded(true);
    };

    const fetchData = async () => {
      if (authLoading) return;
      setDataLoaded(false);
      if (user?.id) { await fetchAuthenticatedData(); return; }
      if (userSlug && userSlug !== ":userSlug") { await fetchPublicData(userSlug); return; }
      setChannels([]); setProgramas([]); setWatchHistory([]); setShopProducts([]); setDataLoaded(true);
    };

    void fetchData();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [authLoading, user?.id, userSlug]);

  // Fetch profile
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("nome, avatar_url").eq("user_id", user.id).single().then(({ data }) => {
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

  // Find next program (the one starting after current ends, same day)
  const nextProgram = useMemo(() => {
    if (!currentProgram) return undefined;
    const now = new Date();
    const today = DAY_MAP[String(now.getDay())];
    const endTime = currentProgram.horario_fim;
    // Find program that starts at or after current ends, on the same day, sorted by start time
    const candidates = programas
      .filter(p => p.id !== currentProgram.id && p.horario_inicio >= endTime)
      .filter(p => !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.some(d => d.toLowerCase().startsWith(today)))
      .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
    return candidates[0] || undefined;
  }, [programas, currentProgram]);

  const streamingChannels = channels.filter(ch => ch.type === "video_live" || ch.type === "audio_live");
  const catalogChannels = channels.filter(ch => ch.type === "catalog");
  const catalogGroups: Record<string, Channel[]> = {};
  catalogChannels.forEach(ch => {
    const groupName = ch.catalog_name || "Catálogo";
    if (!catalogGroups[groupName]) catalogGroups[groupName] = [];
    catalogGroups[groupName].push(ch);
  });

  // Fetch playlist videos
  useEffect(() => {
    if (!dataLoaded) return;
    const cats = channels.filter(ch => ch.type === "catalog");
    if (cats.length === 0) return;
    const fetchPlaylists = async () => {
      const results: Record<string, PlaylistVideo[]> = {};
      for (const ch of cats) {
        if (!ch.url) continue;
        const plMatch = ch.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        const playlistId = plMatch?.[1];
        if (!playlistId) continue;
        try {
          const { data, error } = await supabase.functions.invoke("youtube-playlist", { body: { playlistId } });
          if (!error && data?.videos) {
            const sorted = [...data.videos].sort((a: any, b: any) => {
              if (a.published && b.published) return new Date(b.published).getTime() - new Date(a.published).getTime();
              return 0;
            });
            results[ch.id] = sorted.slice(0, 20);
          }
        } catch {}
      }
      setPlaylistVideos(results);
    };
    fetchPlaylists();
  }, [dataLoaded, channels]);

  const goToPlayer = (channelId?: string, videoId?: string) => {
    setFadeOut(true);
    const params = new URLSearchParams();
    if (channelId) params.set("ch", channelId);
    if (videoId) params.set("vid", videoId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    setTimeout(() => {
      if (userSlug) navigate(`/user/${userSlug}/nexohub/player/watch${qs}`);
      else navigate(`/user/nexohub/player/watch${qs}`);
    }, 400);
  };

  const handleSectionChange = useCallback((section: Section) => {
    if (section === activeSection) return;
    setActiveSection(section);
    setSectionFading(true);
    setTimeout(() => { setVisibleSection(section); setSectionFading(false); }, 200);
  }, [activeSection]);

  const handleSignOut = async () => { await signOut(); navigate("/user/nexohub/player"); };

  const sidebarItems = [
    { icon: Home, label: "Home", key: "home", action: () => handleSectionChange("home") },
    { icon: Radio, label: "Streaming", key: "streaming", action: () => handleSectionChange("streaming") },
    { icon: Film, label: "Catálogo", key: "content", action: () => handleSectionChange("content") },
    ...(user ? [{ icon: ShoppingBag, label: "Loja", key: "shop", action: () => handleSectionChange("shop") }] : []),
  ];

  // Hero channel = first streaming channel
  const heroChannel = streamingChannels[0];


  return (
    <div
      className={`fixed inset-0 text-white flex transition-opacity duration-400 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ background: "hsl(var(--player-bg))" }}
    >
      {/* Sidebar */}
      <PlayerSidebar
        items={sidebarItems}
        activeKey={activeSection}
        avatarUrl={profileAvatar}
        userName={userName}
        showLogout={!!user}
        showSignup={!user && !!onBackToAccess}
        onLogout={handleSignOut}
        onSignup={onBackToAccess}
        loading={!dataLoaded}
      />

      {/* Main content */}
      <div className="flex-1 ml-[52px] overflow-y-auto h-full">
        <div className="transition-all duration-500 ease-in-out" style={{ opacity: sectionFading ? 0 : 1, transform: sectionFading ? "translateY(12px)" : "translateY(0)" }}>

          {visibleSection === "home" && (
            <>
              {/* Hero Banner — sticky at top, content scrolls behind it */}
              <div className="sticky top-0 z-20">
                {!dataLoaded ? (
                  <div style={{ height: "clamp(340px, 56vh, 560px)" }} className="relative">
                    <Skeleton className="absolute inset-0 bg-white/5" />
                    <div className="absolute bottom-10 left-12 space-y-3">
                      <Skeleton className="h-4 w-20 bg-white/10" />
                      <Skeleton className="h-10 w-72 bg-white/10" />
                      <Skeleton className="h-4 w-48 bg-white/8" />
                      <div className="flex gap-3">
                        <Skeleton className="h-11 w-40 rounded-lg bg-white/10" />
                        <Skeleton className="h-11 w-28 rounded-lg bg-white/8" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <HeroBanner
                    currentProgram={currentProgram || undefined}
                    nextProgram={nextProgram}
                    nowPlaying={nowPlaying}
                    channelName={channelName}
                    onPlay={() => goToPlayer(streamingChannels[0]?.id)}
                    onGrade={() => setShowGrade(true)}
                  />
                )}
              </div>

              {/* Content rows — slides behind the sticky hero */}
              <div className="px-6 sm:px-10 pb-8 relative z-10" style={{ marginTop: "-4px", background: "hsl(var(--player-bg))" }}>
                {/* Streaming ao vivo */}
                {!dataLoaded ? (
                  <section className="mb-8">
                    <Skeleton className="h-5 w-44 bg-white/10 mb-3" />
                    <div className="flex gap-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="flex-shrink-0 rounded-xl bg-white/8" style={{ width: 320, aspectRatio: "16/9" }} />)}
                    </div>
                  </section>
                ) : streamingChannels.length > 0 && (
                  <ContentRow title="Canais ao Vivo">
                    {streamingChannels.map(ch => (
                      <StreamingCard
                        key={ch.id}
                        channel={ch}
                        currentProgram={currentProgram || undefined}
                        nowPlaying={nowPlaying}
                        onClick={() => goToPlayer(ch.id)}
                      />
                    ))}
                  </ContentRow>
                )}

                {/* Em Alta - Trending */}
                {dataLoaded && (() => {
                  const trendingItems: { id: string; image: string | null; title: string; subtitle?: string; type: "live" | "catalog"; channelId: string; videoId?: string; logoUrl?: string | null }[] = [];
                  
                  // Add streaming channels as trending
                  streamingChannels.forEach(ch => {
                    trendingItems.push({
                      id: `live-${ch.id}`,
                      image: ch.cover_url || ch.logo_url,
                      title: ch.name,
                      subtitle: "Ao vivo",
                      type: "live",
                      channelId: ch.id,
                      logoUrl: ch.background_url || ch.logo_url,
                    });
                  });

                  // Add catalog videos as trending
                  Object.values(playlistVideos).flat().slice(0, 8).forEach(v => {
                    const ch = catalogChannels.find(c => playlistVideos[c.id]?.some(pv => pv.videoId === v.videoId));
                    if (ch) {
                      trendingItems.push({
                        id: `cat-${v.videoId}`,
                        image: v.thumbnail,
                        title: v.title,
                        subtitle: v.published ? new Date(v.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : undefined,
                        type: "catalog",
                        channelId: ch.id,
                        videoId: v.videoId,
                        logoUrl: ch.background_url || ch.logo_url,
                      });
                    }
                  });

                  if (trendingItems.length === 0) return null;

                  return (
                    <ContentRow title={
                      <span className="flex items-center gap-2">
                        <Flame className="h-5 w-5" style={{ color: "hsl(var(--player-accent))" }} />
                        Em Alta
                      </span>
                    }>
                      {trendingItems.slice(0, 5).map((item, idx) => (
                        <TrendingCard
                          key={item.id}
                          item={item}
                          idx={idx}
                          channels={channels}
                          onClick={() => goToPlayer(item.channelId, item.type === "catalog" ? item.videoId : undefined)}
                        />
                      ))}
                    </ContentRow>
                  );
                })()}

                {/* Watch history */}
                {user && dataLoaded && watchHistory.length > 0 && (
                  <ContentRow title="Visto por último">
                    {watchHistory.map(item => (
                      <HistoryCard key={item.id} item={item} onClick={() => goToPlayer(item.channel_id || item.id)} />
                    ))}
                  </ContentRow>
                )}

                {/* Catalog rows */}
                {dataLoaded && Object.entries(catalogGroups).map(([groupName, items]) => {
                  const groupVideos = items.flatMap(item => {
                    const videos = playlistVideos[item.id] || [];
                    return videos.map(v => ({ ...v, channel: item }));
                  });

                  return (
                    <ContentRow key={groupName} title={groupName}>
                      {groupVideos.length > 0 ? (
                        groupVideos.map(({ channel, ...video }) => (
                          <CatalogCard
                            key={video.videoId}
                            image={channel.cover_url || video.thumbnail}
                            title={video.title}
                            subtitle={video.published ? new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined}
                            logoUrl={channel.logo_url}
                            onClick={() => goToPlayer(channel.id, video.videoId)}
                          />
                        ))
                      ) : (
                        items.map(item => (
                          <CatalogCard
                            key={item.id}
                            image={item.cover_url}
                            title={item.name}
                            logoUrl={item.logo_url}
                            onClick={() => goToPlayer(item.id)}
                          />
                        ))
                      )}
                    </ContentRow>
                  );
                })}
              </div>
            </>
          )}

          {visibleSection === "streaming" && (
            <div className="px-6 sm:px-10 pt-8 pb-8">
              <h1 className="text-2xl font-bold mb-6 text-white">Canais ao Vivo</h1>
              {!dataLoaded ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="w-full rounded-xl bg-white/8" style={{ aspectRatio: "16/9" }} />)}
                </div>
              ) : streamingChannels.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum canal ao vivo disponível
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {streamingChannels.map(ch => (
                    <StreamingCard
                      key={ch.id}
                      channel={ch}
                      currentProgram={currentProgram || undefined}
                      nowPlaying={nowPlaying}
                      onClick={() => goToPlayer(ch.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {visibleSection === "content" && (
            <div className="px-6 sm:px-10 pt-8 pb-8">
              <h1 className="text-2xl font-bold mb-6 text-white">Catálogo</h1>
              {!dataLoaded ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="w-full rounded-xl bg-white/8" style={{ aspectRatio: "16/9" }} />)}
                </div>
              ) : catalogChannels.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum conteúdo disponível
                </div>
              ) : (
                Object.entries(catalogGroups).map(([groupName, items]) => {
                  const groupVideos = items.flatMap(item => (playlistVideos[item.id] || []).map(v => ({ ...v, channel: item })));
                  return (
                    <ContentRow key={groupName} title={groupName}>
                      {groupVideos.length > 0 ? (
                        groupVideos.map(({ channel, ...video }) => (
                          <CatalogCard
                            key={video.videoId}
                            image={channel.cover_url || video.thumbnail}
                            title={video.title}
                            subtitle={video.published ? new Date(video.published).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined}
                            logoUrl={channel.logo_url}
                            onClick={() => goToPlayer(channel.id, video.videoId)}
                          />
                        ))
                      ) : (
                        items.map(item => (
                          <CatalogCard key={item.id} image={item.cover_url} title={item.name} logoUrl={item.logo_url} onClick={() => goToPlayer(item.id)} />
                        ))
                      )}
                    </ContentRow>
                  );
                })
              )}
            </div>
          )}

          {visibleSection === "shop" && (
            <div className="px-6 sm:px-10 pt-8 pb-8">
              <h1 className="text-2xl font-bold mb-6 text-white">Loja</h1>
              {!dataLoaded ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl bg-white/8" />)}
                </div>
              ) : shopProducts.length === 0 ? (
                <div className="w-full h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                  Nenhum produto disponível
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {shopProducts.map((product: any) => (
                    <div
                      key={product.id}
                      className="group rounded-xl overflow-hidden transition-all duration-300 hover:border-white/80"
                      style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="aspect-square overflow-hidden relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                            <ShoppingBag className="h-8 w-8 text-white/20" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white" style={{ background: "hsl(var(--player-accent))", boxShadow: "0 4px 16px hsla(var(--player-accent) / 0.5)" }}>
                          R$ {product.price.toFixed(2).replace(".", ",")}
                        </div>
                        {product.stock <= 3 && (
                          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-yellow-500/90 text-black">
                            {product.stock === 1 ? "Último!" : `Restam ${product.stock}`}
                          </span>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-1.5">
                        <p className="text-xs font-bold text-white truncate group-hover:text-player-accent transition-colors">{product.name}</p>
                        {product.description && <p className="text-[10px] text-white/40 line-clamp-2">{product.description}</p>}
                        {product.payment_url && (
                          <a
                            href={product.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 w-full text-center text-[10px] font-bold py-2 rounded-lg transition-all uppercase tracking-wider text-white"
                            style={{ background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))", boxShadow: "0 2px 12px hsla(var(--player-accent) / 0.3)" }}
                          >
                            Comprar
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grade dialog */}
      {showGrade && (
        <Suspense fallback={null}>
          <PlayerGradeDialog programas={programas as any} onClose={() => setShowGrade(false)} />
        </Suspense>
      )}

      {/* Mini player */}
      {miniPlayerData && (
        <Suspense fallback={null}>
          <MiniPlayerWidget data={miniPlayerData} onClose={() => { clearMiniPlayerData(); setMiniPlayerData(null); }} />
        </Suspense>
      )}
    </div>
  );
}

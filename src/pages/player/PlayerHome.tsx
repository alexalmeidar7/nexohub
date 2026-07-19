import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";
import { usePreloadedImages, preloadImage } from "@/hooks/usePreloadImages";
import { useBgPalette } from "./useBgPalette";
import { fetchArtistImageCached, getArtistImageSync } from "@/lib/artistImageCache";

import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, Clock, Music, ChevronLeft, ChevronRight, Play, LayoutGrid, Flame, TrendingUp, Tag, Shield, Search, Bell, User, Mic, Disc, Plus, Maximize, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LoadingSpinner from "@/components/LoadingSpinner";
import { loadMiniPlayerData, clearMiniPlayerData, destroyMiniAudio, type MiniPlayerData } from "@/components/player/MiniPlayerWidget";
import nexoPlayerLogo from "@/assets/nexo-player-logo.png.asset.json";
const MiniPlayerWidget = lazy(() => import("@/components/player/MiniPlayerWidget"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
const CatalogDetailInline = lazy(() => import("@/components/player/CatalogDetailInline"));
const ProfileDialog = lazy(() => import("@/components/player/ProfileDialog"));
const Top10DetailInline = lazy(() => import("@/components/player/Top10DetailInline"));
const WatchProfilePopup = lazy(() => import("@/components/player/WatchProfilePopup"));

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
  is_hd?: boolean | null;
  is_stereo?: boolean | null;
  descricao?: string | null;
}

interface Programa {
  id?: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  selo?: string | null;
  capa: string | null;
  thumb: string | null;
  descricao?: string | null;
  classificacao_etaria?: string | null;
  apresentador_id?: string | null;
  apresentadores_ids?: string[] | null;
}

interface Apresentador {
  id: string;
  nome: string;
  foto?: string | null;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
}

type Section = "home" | "streaming" | "content" | "shop" | "catalog-detail" | "top10";

const formatTrackText = (value?: string | null) => {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(/(\s+|-|\/|—)/)
    .map((part) => {
      if (!part.trim() || /^(\s+|-|\/|—)$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
};

/* ─── Keyboard Key Cap (used in help tooltip) ─── */
function KeyCap({ children, small, wide }: { children: React.ReactNode; small?: boolean; wide?: boolean }) {
  const size = small ? "h-6 min-w-[24px] text-[10px]" : "h-8 min-w-[32px] text-sm";
  const px = wide ? "px-2.5" : "px-1.5";
  return (
    <span
      className={`inline-flex items-center justify-center ${size} ${px} rounded-md font-semibold text-white`}
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.3)",
        boxShadow: "inset 0 -2px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.4)",
        fontFamily: "'Lufga', sans-serif",
      }}
    >
      {children}
    </span>
  );
}

/* ─── Top Navigation Bar ─── */
function TopNavBar({
  items,
  activeKey,
  avatarUrl,
  userName,
  userEmail,
  googleAvatarUrl,
  showLogout,
  showSignup,
  onLogout,
  onSignup,
  onEditProfile,
  onSwitchProfile,
  channels = [],
  programas = [],
  onPlayChannel,
  userId,
  radioName,
  stationLogoUrl,
  paletteSource,
  onAvatarChange,
}: {
  items: { label: string; key: string; action: () => void }[];
  activeKey: string;
  avatarUrl?: string | null;
  userName?: string;
  userEmail?: string | null;
  googleAvatarUrl?: string | null;
  showLogout?: boolean;
  showSignup?: boolean;
  onLogout?: () => void;
  onSignup?: () => void;
  onEditProfile?: () => void;
  onSwitchProfile?: () => void;
  channels?: Channel[];
  programas?: Programa[];
  onPlayChannel?: (ch: Channel) => void;
  userId?: string | null;
  radioName?: string;
  stationLogoUrl?: string | null;
  paletteSource?: string | null;
  onAvatarChange?: (url: string) => void;
}) {

  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [musicResults, setMusicResults] = useState<{ musica: string; artista: string }[]>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const musicSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { bgColors, prevBgColors, fadeIn } = useBgPalette(paletteSource);


  useEffect(() => {
    if (musicSearchTimer.current) clearTimeout(musicSearchTimer.current);
    const q = searchQuery.trim();
    if (!q || !userId) { setMusicResults([]); return; }
    musicSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("musicas_tocadas")
        .select("musica, artista")
        .eq("user_id", userId)
        .or(`musica.ilike.%${q}%,artista.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) {
        const seen = new Set<string>();
        setMusicResults(data.filter(m => {
          const key = `${m.musica}|${m.artista}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
      }
    }, 300);
    return () => { if (musicSearchTimer.current) clearTimeout(musicSearchTimer.current); };
  }, [searchQuery, userId]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { channels: [] as Channel[], programas: [] as Programa[] };
    return {
      channels: channels.filter(ch => ch.name.toLowerCase().includes(q) || (ch.catalog_name && ch.catalog_name.toLowerCase().includes(q))),
      programas: programas.filter(p => p.nome.toLowerCase().includes(q) || p.descricao?.toLowerCase().includes(q)),
    };
  }, [searchQuery, channels, programas]);

  const hasResults = searchResults.channels.length > 0 || searchResults.programas.length > 0 || musicResults.length > 0;
  const showDropdown = searchFocused && searchQuery.trim().length > 0;

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  useEffect(() => {
    if (!searchFocused) return;
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchFocused]);

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center flex-wrap px-4 sm:px-8 md:px-12 pt-4 sm:pt-8 pb-4 gap-3 sm:gap-6 md:gap-8">
      {/* Nav links */}
      <nav className="flex items-center flex-wrap gap-3 sm:gap-6 md:gap-10">
        {items.map((item, idx) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              onClick={item.action}
              data-tv-focusable
              data-tv-topnav={idx + 1}
              title={`Atalho: ${idx + 1}`}
              className="group relative py-1 font-light tracking-wide transition-all duration-200 lowercase focus:outline-none focus-visible:outline-none"
              style={{
                color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                background: "transparent",
                fontFamily: "'Lufga', system-ui, sans-serif",
                fontSize: "clamp(15px, 1.6vw, 22px)",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; const u = e.currentTarget.querySelector<HTMLElement>("[data-underline]"); if (u) { u.style.background = "#fff"; u.style.transform = "scaleX(1)"; } }}
              onBlur={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; const u = e.currentTarget.querySelector<HTMLElement>("[data-underline]"); if (u) { u.style.background = "transparent"; u.style.transform = "scaleX(0)"; } } }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; const u = e.currentTarget.querySelector<HTMLElement>("[data-underline]"); if (u) { u.style.background = "#fff"; u.style.transform = "scaleX(1)"; } }}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget && !isActive) { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; const u = e.currentTarget.querySelector<HTMLElement>("[data-underline]"); if (u) { u.style.background = "transparent"; u.style.transform = "scaleX(0)"; } } }}
            >
              {item.label}
              <span
                data-underline
                className="absolute -bottom-1 left-0 w-full h-[2px] transition-all duration-300 ease-out"
                style={{
                  background: isActive ? "#fff" : "transparent",
                  transform: isActive ? "scaleX(1)" : "scaleX(0)",
                }}
              />
            </button>
          );
        })}
      </nav>

      {/* Inline search pill */}
      <div ref={searchWrapRef} className="relative flex-1 min-w-[160px] max-w-[380px]">
        <div
          className="flex items-center gap-3 rounded-full px-4 sm:px-5 py-2"
          style={{
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.02)",
            width: "100%",
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="buscar"
            data-tv-focusable
            className="flex-1 bg-transparent text-[15px] font-light placeholder:text-white/55 text-white outline-none lowercase focus:outline-none focus-visible:outline-none"
            style={{ fontFamily: "'Lufga', system-ui, sans-serif" }}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
              const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
              const nav = (dir: "next" | "prev") => {
                const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-tv-focusable]")).filter(n => n.offsetParent !== null);
                const i = nodes.indexOf(el as unknown as HTMLElement);
                if (i < 0) return;
                const t = dir === "next" ? nodes[i + 1] : nodes[i - 1];
                if (t) { e.preventDefault(); el.blur(); t.focus(); }
              };
              if (e.key === "ArrowRight") {
                e.preventDefault();
                el.blur();
                const avatarBtn = profileRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
                if (avatarBtn) avatarBtn.focus();
                else nav("next");
              }
              else if (e.key === "ArrowLeft" && atStart) nav("prev");
              else if (e.key === "ArrowDown" || e.key === "ArrowUp") { el.blur(); }
              else if (e.key === "Escape") el.blur();
            }}
          />
          <Search className="w-4 h-4 text-white/70 shrink-0" />
        </div>

        {showDropdown && (
          <div
            className="absolute left-0 top-[calc(100%+8px)] z-[100] w-[380px] rounded-2xl overflow-hidden animate-fade-in"
            style={{
              background: "hsl(var(--player-bg))",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
              {!hasResults ? (
                <p className="text-center text-white/25 text-sm py-6">Nenhum resultado</p>
              ) : (
                <>
                  {searchResults.channels.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Canais</p>
                      {searchResults.channels.map(ch => (
                        <button key={ch.id} onClick={() => { setSearchFocused(false); setSearchQuery(""); onPlayChannel?.(ch); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                            {ch.logo_url ? <img src={ch.logo_url} className="w-full h-full object-cover" /> : <Radio className="w-4 h-4 text-white/30" />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-white truncate block">{ch.name}</span>
                            <span className="text-[11px] text-white/30">{ch.type === "video_live" ? "TV ao vivo" : ch.type === "audio_live" ? "Rádio" : "Catálogo"}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.programas.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Programação</p>
                      {searchResults.programas.map((p, i) => (
                        <div key={p.id || i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left">
                          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                            {p.selo ? <img src={p.selo} className="w-full h-full object-contain" /> : <Film className="w-4 h-4 text-white/30" />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-white truncate block">{p.nome}</span>
                            <span className="text-[11px] text-white/30">{p.horario_inicio} — {p.horario_fim}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {musicResults.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Músicas Tocadas</p>
                      {musicResults.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5">
                          <div className="w-9 h-9 rounded-lg shrink-0 bg-white/5 flex items-center justify-center">
                            <Disc className="w-4 h-4 text-white/30" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-white truncate block">{formatTrackText(m.musica)}</span>
                            <span className="text-[11px] text-white/30">{formatTrackText(m.artista)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="hidden md:block flex-1" />

      {/* Right: avatar (rounded square) + station logo */}
      <div className="flex items-center gap-2 sm:gap-4 ml-auto">
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(v => !v)}
            data-tv-focusable
            className="relative overflow-hidden cursor-pointer transition-all duration-500 ease-out hover:scale-[1.04] focus:outline-none focus-visible:outline-none focus:scale-[1.04] focus:ring-2 focus:ring-white/60 w-[48px] h-[48px] sm:w-[56px] sm:h-[56px] md:w-[68px] md:h-[68px]"
            style={{
              borderRadius: "18px",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            {prevBgColors && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `linear-gradient(145deg, ${prevBgColors[0]}, ${prevBgColors[1]})` }}
              />
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(145deg, ${bgColors[0]}, ${bgColors[1]})`,
                opacity: prevBgColors ? (fadeIn ? 1 : 0) : 1,
                transition: "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="relative w-full h-full object-cover" />
            ) : (
              <User className="relative icon icon-sm text-white m-auto" />
            )}
          </button>



          {profileOpen && userId && (
            <Suspense fallback={null}>
              <WatchProfilePopup
                userId={userId}
                userName={userName || "Visitante"}
                userEmail={userEmail || null}
                avatarUrl={googleAvatarUrl || avatarUrl || null}
                radioName={radioName}
                onClose={() => setProfileOpen(false)}
                onEditProfile={onEditProfile}
                onSwitchProfile={onSwitchProfile}
                onLogout={showLogout ? onLogout : undefined}
                onAvatarChange={onAvatarChange}
              />
            </Suspense>
          )}
          {profileOpen && !userId && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 animate-fade-in" style={{ minWidth: "200px" }}>
              <div className="rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ background: "rgba(10,10,10,0.95)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                <span className="text-sm font-bold text-white">{userName}</span>
                <div className="w-full h-px bg-white/10" />
                {showSignup && onSignup && (
                  <button onClick={() => { setProfileOpen(false); onSignup(); }} className="text-xs text-left py-1" style={{ color: "hsl(var(--player-accent))" }}>Cadastre-se</button>
                )}
              </div>
            </div>
          )}
        </div>

        {stationLogoUrl && (
          <div className="flex items-center justify-center flex-shrink-0 w-[52px] h-[52px] sm:w-[64px] sm:h-[64px] md:w-[76px] md:h-[76px]">
            <img src={stationLogoUrl} alt="Emissora" className="w-full h-full object-contain" />
          </div>
        )}
      </div>
    </header>
  );
}


/* ─── Expandable Description ─── */
function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [text]);

  return (
    <div className="max-w-2xl relative">
      <div
        style={{
          maxHeight: expanded ? `${contentHeight}px` : "2.8em",
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <p ref={contentRef} className="leading-relaxed">{text}</p>
      </div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium transition-colors"
        style={{ color: "hsl(var(--player-accent))" }}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center border transition-transform duration-300"
          style={{
            borderColor: "hsl(var(--player-accent))",
            transform: expanded ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus className="w-2.5 h-2.5" />
        </span>
        {expanded ? "Menos" : "Mais"}
      </button>
    </div>
  );
}

/* ─── Hero Banner (Apple TV cards layout) ─── */
function HeroBanner({
  currentProgram,
  nowPlaying,
  presenterFoto,
  backgroundUrl,
  onOuvir,
  onAssistir,
  onPlaylist,
  cardsVisible = true,
}: {
  currentProgram?: Programa;
  nowPlaying?: { musica: string; artista: string; capa?: string } | null;
  presenterFoto?: string | null;
  backgroundUrl?: string | null;
  onOuvir: () => void;
  onAssistir: () => void;
  onPlaylist: () => void;
  cardsVisible?: boolean;
}) {
  const cardBase: React.CSSProperties = {
    borderRadius: "22px",
    width: "clamp(180px, 26vw, 260px)",
    height: "clamp(120px, 17vw, 160px)",
    fontFamily: "'Lufga', system-ui, sans-serif",
  };

  // Fetch artist image (Deezer) for the current playing artist and use it as
  // the alternating background — never the album cover (which was showing before).
  // Cache compartilhado (memória + localStorage, 7 dias) para reduzir chamadas.
  const [artistImg, setArtistImg] = useState<string | null>(() => {
    const a = (nowPlaying?.artista || "").trim();
    return a ? getArtistImageSync(a) : null;
  });
  useEffect(() => {
    const artista = (nowPlaying?.artista || "").trim();
    const isBreak = ["break", "vinhetas", "hora certa", "desconhecido"].includes(artista.toLowerCase());
    if (!artista || isBreak) { setArtistImg(null); return; }
    const sync = getArtistImageSync(artista);
    if (sync) { setArtistImg(sync); return; }
    let cancelled = false;
    fetchArtistImageCached(artista).then((url) => {
      if (!cancelled) setArtistImg(url);
    });
    return () => { cancelled = true; };
  }, [nowPlaying?.artista]);

  // Alternating backgrounds: channel thumb + current artist image (Deezer)
  const bgSources = usePreloadedImages([backgroundUrl, artistImg]);

  useEffect(() => {
    if (artistImg) preloadImage(artistImg);
    if (backgroundUrl) preloadImage(backgroundUrl);
  }, [backgroundUrl, artistImg]);

  const [bgIdx, setBgIdx] = useState(0);
  useEffect(() => { setBgIdx(0); }, [bgSources.join("|")]);
  useEffect(() => {
    if (bgSources.length <= 1) return;
    const id = setInterval(() => setBgIdx(i => (i + 1) % bgSources.length), 8000);
    return () => clearInterval(id);
  }, [bgSources.length]);


  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh", minHeight: "560px", backgroundColor: "hsl(var(--player-bg))" }}>
      {/* Fullscreen background — mirror of WelcomeScreen (channel thumb ⇄ artist cover) */}
      <style>{`
        @keyframes ph-kenburns {
          0%   { transform: scale(1.05) translateX(0%); }
          100% { transform: scale(1.22) translateX(-6%); }
        }
        .ph-kenburns { animation: ph-kenburns 30s ease-in-out infinite alternate; will-change: transform; }
        .ph-bg-layer { transition: opacity 1.6s ease-in-out; }
      `}</style>
      {bgSources.length > 0 ? (
        <>
          {bgSources.map((src, i) => {
            const isArtist = i === 1; // index 0 = channel thumb, 1 = artist cover
            return (
              <img
                key={src + i}
                src={src}
                alt=""
                className="ph-kenburns ph-bg-layer absolute inset-0 w-full h-full object-cover"
                style={{
                  opacity: i === bgIdx ? 1 : 0,
                  filter: isArtist
                    ? "brightness(0.5) saturate(1.1) grayscale(0.15)"
                    : "brightness(0.55) saturate(1.05)",
                  animationDirection: isArtist ? "alternate-reverse" : "alternate",
                }}
                draggable={false}
              />
            );
          })}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.9) 100%)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 30% 20%, #1e2430 0%, #131519 55%, #08090b 100%)" }}
        />
      )}



      {/* Bottom-left cards row */}
      <div
        data-tv-row="0"
        className="absolute bottom-6 sm:bottom-10 left-4 sm:left-8 md:left-12 right-4 sm:right-auto z-10 flex flex-wrap items-end gap-3 sm:gap-5"
        style={{
          transform: cardsVisible ? "translateY(0)" : "translateY(-108%)",
          opacity: cardsVisible ? 1 : 0,
          pointerEvents: cardsVisible ? "auto" : "none",
          willChange: "transform, opacity",
          transition: cardsVisible
            ? "transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 520ms ease-out 120ms"
            : "transform 640ms cubic-bezier(0.32, 0, 0.67, 0), opacity 320ms ease-in",
        }}
      >
        {/* Ouvir card */}
        <button
          onClick={onOuvir}
          data-tv-focusable
          className="relative overflow-hidden text-left group transition-transform duration-300 hover:scale-[1.03]"
          style={{
            ...cardBase,
            background: "linear-gradient(135deg, hsla(var(--player-accent) / 0.55) 0%, hsla(var(--player-accent) / 0.15) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Presenter photo pinned right */}
          {presenterFoto && (
            <div className="absolute right-0 top-0 bottom-0 w-[45%] overflow-hidden">
              <img src={presenterFoto} alt="" className="w-full h-full object-cover" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 40%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)" }} />
            </div>
          )}
          <div className="relative z-[1] p-4 flex flex-col h-full">
            <span className="inline-flex self-start text-[11px] px-3 py-1 rounded-full bg-black/40 text-white/85 tracking-wide">ouvir</span>
            <div className="mt-auto">
              <p className="text-[13px] text-white/70 leading-none">no ar</p>
              <p className="text-[18px] font-semibold text-white leading-tight truncate max-w-[55%]">{currentProgram?.nome?.toLowerCase() || "—"}</p>
              {currentProgram && (
                <p className="text-[12px] text-white/60 mt-1">{currentProgram.horario_inicio.slice(0,5)}/{currentProgram.horario_fim.slice(0,5)}</p>
              )}
            </div>
          </div>
        </button>

        {/* Assistir card */}
        <button
          onClick={onAssistir}
          data-tv-focusable
          className="relative overflow-hidden text-left group transition-transform duration-300 hover:scale-[1.03]"
          style={{
            ...cardBase,
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {nowPlaying?.capa && (
            <img
              src={nowPlaying.capa}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "grayscale(1) brightness(0.75)" }}
            />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 100%)" }} />
          <div className="relative z-[1] p-4 flex flex-col h-full">
            <span className="inline-flex self-start text-[11px] px-3 py-1 rounded-full bg-black/50 text-white/85 tracking-wide">assistir</span>
            <div className="mt-auto">
              <p className="text-[13px] text-white/70 leading-none">tocando</p>
              <p className="text-[18px] font-semibold text-white leading-tight truncate">{nowPlaying?.musica ? formatTrackText(nowPlaying.musica) : "—"}</p>
              {nowPlaying?.artista && (
                <p className="text-[12px] text-white/70 mt-0.5 truncate">{formatTrackText(nowPlaying.artista)}</p>
              )}
            </div>
          </div>
        </button>

      </div>

      {/* Bottom-right help + nexo logo */}
      <div className="absolute bottom-4 sm:bottom-10 right-4 sm:right-10 z-10 flex items-center gap-3 sm:gap-4">
        <div className="relative group">
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.35)" }}
            aria-label="Ajuda de navegação"
          >
            <span className="text-sm font-light">?</span>
          </button>
          <div
            className="pointer-events-none absolute bottom-full right-0 mb-3 w-[320px] opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
            role="tooltip"
          >
            <div
              className="rounded-2xl p-5"
              style={{
                background: "#000",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
              }}
            >
              <p className="text-white text-sm font-semibold mb-1" style={{ fontFamily: "'Lufga', sans-serif" }}>
                Navegação por teclado
              </p>
              <p className="text-white/70 text-[11px] leading-relaxed mb-4">
                Use as teclas do teclado para navegar pelos ícones, cards e menus do player.
              </p>

              <div className="flex flex-col items-center gap-1 mb-4">
                <KeyCap>↑</KeyCap>
                <div className="flex items-center gap-1">
                  <KeyCap>←</KeyCap>
                  <KeyCap>↓</KeyCap>
                  <KeyCap>→</KeyCap>
                </div>
              </div>

              <div className="space-y-2 text-[11px] text-white">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1"><KeyCap small>←</KeyCap><KeyCap small>→</KeyCap></div>
                  <span className="text-white/80">Navegar entre cards e ícones</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1"><KeyCap small>↑</KeyCap><KeyCap small>↓</KeyCap></div>
                  <span className="text-white/80">Trocar de linha / menu</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyCap small wide>Enter</KeyCap>
                  <span className="text-white/80">Selecionar item</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyCap small wide>Esc</KeyCap>
                  <span className="text-white/80">Voltar</span>
                </div>
              </div>
            </div>
            <div
              className="absolute -bottom-1.5 right-4 w-3 h-3 rotate-45"
              style={{ background: "#000", borderRight: "1px solid rgba(255,255,255,0.15)", borderBottom: "1px solid rgba(255,255,255,0.15)" }}
            />
          </div>
        </div>
        <div className="h-9 flex items-center">
          <img src={nexoPlayerLogo.url} alt="nexo player" className="h-8 object-contain" />
        </div>
      </div>
    </div>
  );
}


/* ─── Streaming Card (Live channels) ─── */
function StreamingCard({ channel, currentProgram, nowPlaying, onClick }: {
  channel: Channel;
  currentProgram?: Programa;
  nowPlaying?: { musica: string; artista: string; capa?: string } | null;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const isVideo = channel.type === "video" || channel.type === "video_live";
  const [videoReady, setVideoReady] = useState(false);
  const [progress, setProgress] = useState(0);

  // Animated text keys
  const progKey = currentProgram?.nome || "--";
  const musicKey = nowPlaying?.musica || "--";
  const artistKey = nowPlaying?.artista || "--";

  // Program progress
  useEffect(() => {
    if (!currentProgram) { setProgress(0); return; }
    const calc = () => {
      const now = new Date();
      const [sh, sm] = currentProgram.horario_inicio.split(":").map(Number);
      const [eh, em] = currentProgram.horario_fim.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const curMin = now.getHours() * 60 + now.getMinutes();
      const total = endMin - startMin;
      if (total <= 0) { setProgress(0); return; }
      setProgress(Math.min(100, Math.max(0, ((curMin - startMin) / total) * 100)));
    };
    calc();
    const iv = setInterval(calc, 30000);
    return () => clearInterval(iv);
  }, [currentProgram]);

  useEffect(() => {
    if (!hovered || !isVideo || !channel.url) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
      setVideoReady(false);
      return;
    }

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    const startStream = async () => {
      try {
        if (channel.url!.includes(".m3u8")) {
          const Hls = (await import("hls.js")).default;
          if (cancelled) return;
          if (Hls.isSupported()) {
            const hls = new Hls({ maxBufferLength: 5, lowLatencyMode: true });
            hlsRef.current = hls;
            hls.loadSource(channel.url!);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!cancelled) video.play().then(() => setVideoReady(true)).catch(() => {});
            });
          }
        } else {
          video.src = channel.url!;
          video.play().then(() => setVideoReady(true)).catch(() => {});
        }
      } catch {}
    };

    startStream();
    return () => {
      cancelled = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [hovered, isVideo, channel.url]);

  const cardHeight = 240;
  const expandedWidth = hovered && isVideo ? 160 + Math.round(cardHeight * 16 / 9) : 160;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex-shrink-0 rounded-2xl overflow-hidden relative transition-all duration-300 group cursor-pointer"
      style={{
        width: `${expandedWidth}px`,
        height: `${cardHeight}px`,
        background: "hsla(var(--player-accent) / 0.06)",
        border: hovered ? "3px solid rgba(255,255,255,0.9)" : "1px solid hsla(var(--player-accent) / 0.1)",
        boxShadow: hovered ? "0 4px 20px hsla(var(--player-accent) / 0.15)" : "none",
        transition: "width 0.5s cubic-bezier(0.25,0.1,0.25,1), box-shadow 0.3s, border 0.3s",
      }}
    >
      {/* Cover image – pinned to left 160px */}
      <div className="absolute top-0 left-0 bottom-0" style={{ width: "160px" }}>
        {channel.cover_url ? (
          <img src={channel.cover_url} alt={channel.name} className="w-full h-full object-cover" />
        ) : channel.logo_url ? (
          <img src={channel.logo_url} alt={channel.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, hsla(var(--player-accent) / 0.15) 0%, hsl(var(--player-bg)) 100%)" }}>
            <Radio className="h-10 w-10 text-white/15" />
          </div>
        )}
      </div>

      {/* Video preview – live video on hover */}
      {hovered && isVideo && (
        <div className="absolute top-0 bottom-0 right-0 z-[1]" style={{ left: "160px" }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
            style={{ opacity: videoReady ? 1 : 0, transition: "opacity 0.3s" }}
          />
        </div>
      )}

      {/* Gradient + info overlay */}
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, transparent 65%)" }} />
      <div className="absolute bottom-0 left-0 right-0 z-[4] text-left pointer-events-none flex flex-col">
        <div className="px-3.5 pb-3">
          <p className="text-xs font-normal text-white leading-tight line-clamp-2 drop-shadow-lg">
            {currentProgram?.nome || channel.name}
          </p>
          {currentProgram && (
            <p className="text-[9px] text-white/40 mt-0.5">
              {currentProgram.horario_inicio} — {currentProgram.horario_fim}
            </p>
          )}
          {currentProgram && (
            <div className="w-full h-[2px] mt-1.5 rounded-full overflow-hidden" style={{ background: "hsla(var(--player-accent) / 0.15)" }}>
              <div
                className="h-full transition-all duration-1000 rounded-full"
                style={{ width: `${progress}%`, backgroundColor: "hsl(var(--player-accent))" }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Content Row (horizontal scroll with arrows + scroll fade) ─── */
function ContentRow({ title, children, scrollRoot }: { title: React.ReactNode; children: React.ReactNode; scrollRoot?: React.RefObject<HTMLDivElement> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [visibility, setVisibility] = useState(1);

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

  // Intersection-based fade/scale as section scrolls out of view
  useEffect(() => {
    const el = sectionRef.current;
    const root = scrollRoot?.current || null;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setVisibility(Math.max(entry.intersectionRatio, 0.15));
      },
      {
        root,
        threshold: Array.from({ length: 21 }, (_, i) => i / 20),
      }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [scrollRoot]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  const fadeScale = visibility < 1
    ? { opacity: visibility, transform: `scale(${0.92 + 0.08 * visibility})`, transformOrigin: "center top" }
    : {};

  return (
    <section
      ref={sectionRef}
      className="mb-8 relative group/row player-row-slide"
      style={{ transition: "opacity 0.3s ease, transform 0.3s ease", willChange: "opacity, transform", ...fadeScale }}
    >
      <h2 className="text-base sm:text-lg font-bold mb-3 tracking-wide text-white/90 px-1 player-hero-content">{title}</h2>
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover/row:opacity-100"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover/row:opacity-100"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto overflow-y-visible py-2 px-3 -mx-3 scrollbar-hide scroll-smooth card-row-hover">
          {children}
        </div>
      </div>
    </section>
  );
}

// AI cover generation removed — cards use existing thumbnails only

/* ─── Random start times for catalog previews (10min, 32min, 51min) ─── */
const PREVIEW_START_TIMES = [600, 1920, 3060];
function getRandomPreviewStart() {
  return PREVIEW_START_TIMES[Math.floor(Math.random() * PREVIEW_START_TIMES.length)];
}

/* ─── Trending Card (Em Alta) with expand-right video preview ─── */
function TrendingCard({ item, idx, channels, onClick }: {
  item: { id: string; image: string | null; title: string; subtitle?: string; type: "live" | "catalog"; channelId: string; videoId?: string; logoUrl?: string | null };
  idx: number;
  channels: Channel[];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(getRandomPreviewStart());

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
      startTimeRef.current = getRandomPreviewStart();
      timerRef.current = setTimeout(() => setShowVideo(true), 500);
    }
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    fadeOutAudio();
    setTimeout(() => {
      setShowVideo(false);
      setVideoReady(false);
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
          start: startTimeRef.current,
        },
        events: {
          onReady: (e: any) => {
            e.target.playVideo();
            setVideoReady(true);
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

  const coverSrc = item.image;

  const cardHeight = 225;
  const videoWidth = Math.round(cardHeight * 16 / 9);
  const expandedWidth = hovered ? 150 + videoWidth : 150;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex-shrink-0 rounded-2xl overflow-hidden relative group cursor-pointer"
      style={{
        width: `${expandedWidth}px`,
        height: `${cardHeight}px`,
        background: "hsla(var(--player-accent) / 0.06)",
        zIndex: hovered ? 20 : 1,
        boxShadow: hovered ? "0 4px 20px hsla(var(--player-accent) / 0.15)" : "none",
        border: hovered ? "1px solid hsla(var(--player-accent) / 0.3)" : "1px solid hsla(var(--player-accent) / 0.1)",
        transition: "width 0.5s cubic-bezier(0.25,0.1,0.25,1), box-shadow 0.3s, border 0.3s",
      }}
    >
      {/* Cover image – pinned to left 150px */}
      <div className="absolute top-0 left-0 bottom-0" style={{ width: "150px" }}>
        {coverSrc ? (
          <img src={coverSrc} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, hsl(var(--player-bg)) 100%)" }}>
            <TrendingUp className="h-10 w-10" style={{ color: "hsl(var(--player-accent))", opacity: 0.3 }} />
          </div>
        )}
        {/* Text overlay always visible on the cover side */}
        <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 right-0 p-3 z-[4] text-left pointer-events-none">
          <p className="text-xs font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</p>
          {item.subtitle && <p className="text-[10px] text-white/50 mt-1 font-medium">{item.subtitle}</p>}
          {item.type === "catalog" && hovered && (
            <p className="text-[9px] text-white/40 mt-1.5 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Play className="h-3 w-3 fill-current" style={{ color: "hsl(var(--player-accent))" }} />
              Assistir agora
            </p>
          )}
          {item.type === "live" && hovered && (
            <p className="text-[9px] mt-1.5 uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: "hsl(var(--player-accent))" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(var(--player-accent))" }} />
              ao vivo
            </p>
          )}
        </div>
      </div>

      {/* Expanded right area – video preview only */}
      {hovered && (
        <div className="absolute top-0 bottom-0 right-0 z-[2]" style={{ left: "150px" }}>
          {showVideo ? (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {!videoReady && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center" style={{ background: "hsl(var(--player-bg))" }}>
                  <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "hsl(var(--player-accent))", borderRightColor: "hsl(var(--player-accent) / 0.3)" }} />
                </div>
              )}
              <div className={`yt-host w-full h-full [&_iframe]:pointer-events-none [&_iframe]:border-none transition-opacity duration-500 ${videoReady ? "opacity-100" : "opacity-0"}`} />
              <div className="absolute inset-0 z-[1]" />
            </div>
          ) : coverSrc ? (
            <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm" />
          ) : null}
        </div>
      )}

      {/* Ranking badge */}
      <div
        className="absolute top-2.5 left-2.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        {idx + 1}
      </div>

      {/* Channel/Catalog logo - top right of the cover */}
      {item.logoUrl && !hovered && (
        <div className="absolute top-2 right-2 z-[15] w-14 h-10 flex items-center justify-center" style={{ right: "auto", left: "calc(150px - 60px)" }}>
          <img src={item.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Live badge */}
      {item.type === "live" && !item.logoUrl && !hovered && (
        <span className="absolute top-2 right-2 z-10 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: "hsl(var(--player-accent))", opacity: 0.9 }}>
          live
        </span>
      )}
    </div>
  );
}

/* ─── Catalog Card (horizontal, matches Ouvir/Assistir style) ─── */
function CatalogCard({ image, title, subtitle, logoUrl, onClick }: { image?: string | null; title: string; subtitle?: string; logoUrl?: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tv-focusable
      className="flex-shrink-0 relative overflow-hidden text-left group transition-transform duration-300 hover:scale-[1.03]"
      style={{
        width: "260px",
        height: "160px",
        borderRadius: "22px",
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.08)",
        fontFamily: "'Lufga', system-ui, sans-serif",
      }}
    >
      {image ? (
        <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, hsl(var(--player-bg)) 100%)" }}>
          <Film className="h-10 w-10 text-white/15" />
        </div>
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 60%)" }} />
      <div className="relative z-[1] p-4 flex flex-col h-full">
        <span className="inline-flex self-start text-[11px] px-3 py-1 rounded-full bg-black/50 text-white/85 tracking-wide">on demand</span>
        <div className="mt-auto">
          <p className="text-[18px] font-semibold text-white leading-tight truncate max-w-[70%] lowercase">{title}</p>
          {subtitle && <p className="text-[12px] text-white/70 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </button>
  );
}
/* ─── History Card ─── */
function HistoryCard({ item, onClick }: { item: { channel_name: string; channel_cover_url: string | null; channel_logo_url: string | null; watched_at: string }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-2xl overflow-hidden relative transition-all duration-300 group cursor-pointer"
      style={{
        width: "160px",
        aspectRatio: "2/3",
        background: "hsla(var(--player-accent) / 0.05)",
        border: "1px solid hsla(var(--player-accent) / 0.1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.3)";
        e.currentTarget.style.boxShadow = "0 4px 20px hsla(var(--player-accent) / 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.1)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {item.channel_cover_url ? (
        <img src={item.channel_cover_url} alt={item.channel_name} className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-105" />
      ) : item.channel_logo_url ? (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.05) 0%, hsl(var(--player-bg)) 100%)" }}>
          <img src={item.channel_logo_url} alt={item.channel_name} className="h-12 w-auto object-contain" />
        </div>
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, hsla(var(--player-accent) / 0.1) 0%, hsl(var(--player-bg)) 100%)" }}>
          <Radio className="h-10 w-10 text-white/15" />
        </div>
      )}

      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-[5] pointer-events-none">
        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "hsla(var(--player-accent) / 0.2)" }}>
          <Play className="h-4 w-4 text-white fill-white" />
        </div>
      </div>

      {/* Gradient + info */}
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, transparent 65%)" }} />
      <div className="absolute bottom-0 left-0 right-0 p-3 z-[4] text-left pointer-events-none">
        <p className="text-xs font-bold text-white truncate drop-shadow-lg">{item.channel_name}</p>
        <p className="text-[9px] text-white/50 flex items-center gap-1 mt-1">
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
  onBackToAccess?: (openEdit?: boolean) => void;
}

/* ─── Local cache helpers ─── */
const CACHE_KEY = "player_home_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function readCache(cacheId: string) {
  try {
    const raw = localStorage.getItem(CACHE_KEY + "_" + cacheId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed._ts || 0) > CACHE_TTL) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(cacheId: string, data: Record<string, any>) {
  try {
    localStorage.setItem(CACHE_KEY + "_" + cacheId, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch {}
}

export default function PlayerHome({ onBackToAccess }: PlayerHomeProps = {}) {
  const { user, signOut, loading: authLoading } = useAuth();
  useGlobalMusicSync();

  const [activeRow, setActiveRow] = useState(0);
  const ROW_COUNT = 2;



  // TV-style keyboard navigation between focusable cards/buttons
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as any).isContentEditable)) return;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-tv-focusable]"))
        .filter(n => n.offsetParent !== null);
      if (nodes.length === 0) return;
      e.preventDefault();
      // Clear any text selection (removes visible text cursor)
      window.getSelection?.()?.removeAllRanges();
      // Special-case: ArrowDown from top-nav (menu / search / avatar) jumps to first card of the currently visible row
      if (e.key === "ArrowDown" && active && (active.hasAttribute("data-tv-topnav") || active.hasAttribute("data-tv-topnav-extra") || !active.closest("[data-tv-row]"))) {
        const visibleRow = document.querySelector<HTMLElement>(`[data-tv-row="${activeRow}"]`);
        const firstCard = visibleRow?.querySelector<HTMLElement>("[data-tv-focusable]");
        if (firstCard) { firstCard.focus(); firstCard.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); return; }
      }
      let idx = active ? nodes.indexOf(active) : -1;
      if (idx === -1) { nodes[0].focus(); nodes[0].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); return; }

      const cur = nodes[idx].getBoundingClientRect();
      const curCX = cur.left + cur.width / 2;
      const curCY = cur.top + cur.height / 2;
      let best = -1; let bestScore = Infinity;
      nodes.forEach((n, i) => {
        if (i === idx) return;
        const r = n.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - curCX; const dy = cy - curCY;
        let ok = false;
        if (e.key === "ArrowRight" && dx > 10 && Math.abs(dy) < r.height * 1.5) ok = true;
        if (e.key === "ArrowLeft" && dx < -10 && Math.abs(dy) < r.height * 1.5) ok = true;
        if (e.key === "ArrowDown" && dy > 10) ok = true;
        if (e.key === "ArrowUp" && dy < -10) ok = true;
        if (!ok) return;
        const score = Math.hypot(dx, dy) + (e.key === "ArrowUp" || e.key === "ArrowDown" ? Math.abs(dx) * 2 : Math.abs(dy) * 2);
        if (score < bestScore) { bestScore = score; best = i; }
      });
      if (best >= 0) {
        nodes[best].focus();
        nodes[best].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    };
    // Enter/Space: aciona o elemento focado como se fosse um clique do mouse
    const enterHandler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !active.matches?.("[data-tv-focusable]")) return;
      if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as any).isContentEditable) return;
      e.preventDefault();
      active.click();
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keydown", enterHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keydown", enterHandler);
    };
  }, [activeRow]);


  // Row-carousel navigation: ArrowUp/Down swaps whole rows in-place
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as any).isContentEditable)) return;
      const rowEl = active?.closest?.("[data-tv-row]") as HTMLElement | null;
      if (!rowEl) return;
      const rowIndex = Number(rowEl.dataset.tvRow);
      if (Number.isNaN(rowIndex)) return;
      if (e.key === "ArrowDown" && rowIndex < ROW_COUNT - 1) {
        e.preventDefault();
        e.stopPropagation();
        setActiveRow(rowIndex + 1);
      } else if (e.key === "ArrowUp" && rowIndex > 0) {
        e.preventDefault();
        e.stopPropagation();
        setActiveRow(rowIndex - 1);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Mouse wheel: scroll down/up navigates between rows (throttled)
  useEffect(() => {
    let lastAt = 0;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // ignore wheel inside horizontal card rows / scrollable inner areas
      if (target?.closest?.("[data-tv-hscroll]")) return;
      if (Math.abs(e.deltaY) < 8) return;
      const now = Date.now();
      if (now - lastAt < 550) { e.preventDefault(); return; }
      if (e.deltaY > 0) {
        setActiveRow((r) => {
          if (r >= ROW_COUNT - 1) return r;
          lastAt = now;
          return r + 1;
        });
      } else {
        setActiveRow((r) => {
          if (r <= 0) return r;
          lastAt = now;
          return r - 1;
        });
      }
      e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  // Move focus to first focusable in the newly-active row
  useEffect(() => {
    const t = window.setTimeout(() => {
      const rowEl = document.querySelector(`[data-tv-row="${activeRow}"]`) as HTMLElement | null;
      const first = rowEl?.querySelector<HTMLElement>("[data-tv-focusable]");
      first?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [activeRow]);

  // Top menu keyboard shortcuts: 1-9 activate nav items, M focuses first, Esc blurs/closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping = !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as any).isContentEditable);

      if (e.key === "Escape") {
        if (active && typeof active.blur === "function") active.blur();
        // Close open menus/popovers via outside click
        document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        return;
      }

      if (isTyping) return;

      if (/^[1-9]$/.test(e.key)) {
        const btn = document.querySelector<HTMLElement>(`[data-tv-topnav="${e.key}"]`);
        if (btn) {
          e.preventDefault();
          btn.focus();
          btn.click();
        }
        return;
      }

      if (e.key === "m" || e.key === "M") {
        const first = document.querySelector<HTMLElement>('[data-tv-topnav="1"]');
        if (first) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);



  const { userSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Determine cache key early
  const cacheId = userSlug && userSlug !== ":userSlug" ? `pub_${userSlug}` : user?.id || "";
  const cached = useMemo(() => readCache(cacheId), [cacheId]);

  const [activeSection, setActiveSection] = useState<Section>("home");
  const [visibleSection, setVisibleSection] = useState<Section>("home");
  const [sectionFading, setSectionFading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [channels, setChannels] = useState<Channel[]>(() => cached?.channels ?? []);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => cached?.logoUrl ?? null);
  const [channelName, setChannelName] = useState(() => cached?.channelName ?? "");
  const [profileName, setProfileName] = useState(() => cached?.profileName ?? "");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(() => cached?.profileAvatar ?? null);
  const [profileEmail, setProfileEmail] = useState(() => cached?.profileEmail ?? "");
  const [profileCity, setProfileCity] = useState(() => cached?.profileCity ?? "");
  const [ownerUserId, setOwnerUserId] = useState<string | null>(() => cached?.ownerUserId ?? user?.id ?? null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [programas, setProgramas] = useState<Programa[]>(() => cached?.programas ?? []);
  const [dataLoaded, setDataLoaded] = useState(() => !!cached);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [playlistVideos, setPlaylistVideos] = useState<Record<string, PlaylistVideo[]>>({});
  const [nowPlaying, setNowPlaying] = useState<{ musica: string; artista: string; capa?: string } | null>(null);
  const [shopProducts, setShopProducts] = useState<any[]>([]);
  const [shopActive, setShopActive] = useState(true);
  const [showGrade, setShowGrade] = useState(false);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(null);

  // On mount: destroy any lingering audio from Player page to ensure silence on Home
  useEffect(() => {
    destroyMiniAudio();
    clearMiniPlayerData();
  }, []);

  // Open catalog detail from query param (e.g. returning from /watch)
  const catalogParamHandled = useRef(false);
  useEffect(() => {
    if (catalogParamHandled.current) return;
    const catalogParam = searchParams.get("catalog");
    if (catalogParam) {
      catalogParamHandled.current = true;
      setActiveCatalog(catalogParam);
      setVisibleSection("catalog-detail");
      setActiveSection("content");
    }
  }, [searchParams]);

  // Poll for current music data
  useEffect(() => {
    const fetchMusic = async () => {
      // Em modo público/slug, sempre prioriza os dados do usuário da URL
      if (userSlug && userSlug !== ":userSlug") {
        try {
          const { data } = await supabase.functions.invoke("public-player-data", { body: { slug: userSlug, section: "now_playing" } });
          if (data?.musica) {
            setNowPlaying({ musica: formatTrackText(data.musica), artista: formatTrackText(data.artista || ""), capa: data.capa || "" });
            return;
          }
        } catch {}
      }

      const userId = user?.id;

      // Try localStorage first only for authenticated owner mode
      if (userId) {
        try {
          const raw = localStorage.getItem("masterview_music_data");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.titulo) { setNowPlaying({ musica: formatTrackText(parsed.titulo), artista: formatTrackText(parsed.artista || ""), capa: parsed.capa || "" }); return; }
          }
        } catch {}
      }

      // Fallback to DB
      if (!userId) return;
      try {
        const { data } = await supabase.from("musicas_tocadas").select("musica, artista").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (data) setNowPlaying({ musica: formatTrackText(data.musica), artista: formatTrackText(data.artista) });
      } catch {}
    };
    fetchMusic();
    const interval = setInterval(fetchMusic, 10000);
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

      const [chRes, empRes, progRes, histRes, shopRes, settingsRes, apresRes, profileRes] = await Promise.all([
        supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
        supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
        supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, thumb, descricao, classificacao_etaria, apresentador_id, apresentadores_ids").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%").order("horario_inicio"),
        supabase.from("watch_history").select("id, channel_name, channel_cover_url, channel_logo_url, channel_type, watched_at, channel_id").eq("user_id", userId).order("watched_at", { ascending: false }).limit(10),
        supabase.from("shopping_products").select("id, name, description, price, image_url, payment_url, stock").eq("user_id", userId).eq("active", true),
        supabase.from("user_settings").select("shopping_active").eq("user_id", userId).maybeSingle(),
        supabase.from("apresentadores").select("id, nome, foto").eq("user_id", userId).eq("ativo", true),
        supabase.from("profiles").select("nome, avatar_url, email, cidade, estado").eq("user_id", userId).single(),
      ]);

      if (cancelled) return;

      // Apply profile data immediately
      if (profileRes.data) {
        if (profileRes.data.nome) setProfileName(profileRes.data.nome);
        setProfileAvatar(profileRes.data.avatar_url && profileRes.data.avatar_url.trim() !== '' ? profileRes.data.avatar_url : '/avatars/usr-default.png');
        if (profileRes.data.email) setProfileEmail(profileRes.data.email);
        setProfileCity([profileRes.data.cidade, profileRes.data.estado].filter(Boolean).join(", "));
      }

      let channelsData = (chRes.data ?? []) as any[];
      let channelError = chRes.error;

      // Fallback: if user has no channels at all, or no live channels, merge global active channels
      const hasLiveChannels = channelsData.some((ch: any) => ch.type === "video_live" || ch.type === "audio_live");
      if (!channelError && (channelsData.length === 0 || !hasLiveChannels)) {
        const fallbackChRes = await supabase.from("streaming_channels").select("*").eq("active", true).order("numero_canal");
        if (!fallbackChRes.error && fallbackChRes.data) {
          const existingIds = new Set(channelsData.map((ch: any) => ch.id));
          const merged = [...channelsData, ...fallbackChRes.data.filter((ch: any) => !existingIds.has(ch.id))];
          channelsData = merged as any[];
        } else if (fallbackChRes.error) channelError = fallbackChRes.error;
      }

      const programasData = (progRes.data ?? []) as any[];
      const hasCriticalError = Boolean(channelError || progRes.error);
      const possibleAuthRace = channelsData.length === 0 && programasData.length === 0;

      if ((hasCriticalError || possibleAuthRace) && scheduleRetry(() => fetchAuthenticatedData(attempt + 1), attempt)) return;

      setChannels(channelsData as any);
      setOwnerUserId(userId);
      if (empRes.data) { setLogoUrl(empRes.data.logo); setChannelName(empRes.data.nome || ""); }
      setProgramas(programasData as any);
      setApresentadores((apresRes.data ?? []) as Apresentador[]);

      if (histRes.data) {
        const seen = new Set<string>();
        setWatchHistory(histRes.data.filter(h => { const key = h.channel_id || h.id; if (seen.has(key)) return false; seen.add(key); return true; }));
      } else setWatchHistory([]);

      setShopProducts((shopRes.data ?? []) as any);
      if (settingsRes.data && typeof (settingsRes.data as any).shopping_active === "boolean") {
        setShopActive((settingsRes.data as any).shopping_active);
      }
      setDataLoaded(true);
      // Write to local cache for instant next load
      writeCache(cacheId, {
        channels: channelsData,
        logoUrl: empRes.data?.logo || null,
        channelName: empRes.data?.nome || "",
        programas: programasData,
        profileName: profileRes.data?.nome || "",
        profileAvatar: profileRes.data?.avatar_url || null,
        profileEmail: profileRes.data?.email || "",
        profileCity: [profileRes.data?.cidade, profileRes.data?.estado].filter(Boolean).join(", "),
        ownerUserId: userId,
      });
    };

    const fetchPublicData = async (slug: string, attempt = 0) => {
      if (cancelled) return;
      const { data, error } = await supabase.functions.invoke("public-player-data", { body: { slug } });
      if (cancelled) return;
      if (Boolean(error || data?.error) && scheduleRetry(() => fetchPublicData(slug, attempt + 1), attempt)) return;
      setChannels((data?.channels ?? []) as any);
      setOwnerUserId(data?.userId || null);
      if (data?.empresa?.logo) setLogoUrl(data.empresa.logo);
      if (data?.empresa?.nome) setChannelName(data.empresa.nome);
      setProgramas((data?.programas ?? []) as any);
      setApresentadores((data?.apresentadores ?? []) as Apresentador[]);
      setShopProducts((data?.shopProducts ?? []) as any);
      if (typeof data?.shopActive === "boolean") setShopActive(data.shopActive);
      setDataLoaded(true);
      // Cache public data
      writeCache(cacheId, {
        channels: data?.channels ?? [],
        logoUrl: data?.empresa?.logo || null,
        channelName: data?.empresa?.nome || "",
        programas: data?.programas ?? [],
        ownerUserId: data?.userId || null,
      });
    };

    const fetchData = async () => {
      if (authLoading) return;
      if (!cached) setDataLoaded(false);
      if (userSlug && userSlug !== ":userSlug") { await fetchPublicData(userSlug); return; }
      if (user?.id) { await fetchAuthenticatedData(); return; }
      setChannels([]); setProgramas([]); setWatchHistory([]); setShopProducts([]); setDataLoaded(true);
    };

    void fetchData();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [authLoading, user?.id, userSlug]);

  // Profile is now fetched inside the main data Promise.all above

  const normalizeWeekday = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const DAY_MAP: Record<string, string> = { "0": "dom", "1": "seg", "2": "ter", "3": "qua", "4": "qui", "5": "sex", "6": "sab" };

  const matchesProgramDay = (diasSemana: string[] | null | undefined, date: Date) => {
    if (!diasSemana || diasSemana.length === 0) return true;
    const today = DAY_MAP[String(date.getDay())];
    return diasSemana.some((dia) => normalizeWeekday(dia).startsWith(today));
  };

  const getCurrentProgram = useCallback(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return programas.find((p) => {
      const startTime = p.horario_inicio.slice(0, 5);
      const endTime = p.horario_fim.slice(0, 5);
      const inTime = hhmm >= startTime && hhmm < endTime;
      return inTime && matchesProgramDay(p.dias_semana, now);
    });
  }, [programas]);

  const currentProgram = getCurrentProgram();

  // Find next program (the one starting after current ends, same day)
  const nextProgram = useMemo(() => {
    if (!currentProgram) return undefined;
    const now = new Date();
    const endTime = currentProgram.horario_fim.slice(0, 5);
    const candidates = programas
      .filter((p) => p.id !== currentProgram.id && p.horario_inicio.slice(0, 5) >= endTime)
      .filter((p) => matchesProgramDay(p.dias_semana, now))
      .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
    return candidates[0] || undefined;
  }, [programas, currentProgram]);

  // Resolve presenter name for a program
  const resolvePresenter = useCallback((prog: Programa | undefined) => {
    if (!prog) return null;
    const presenterIds = prog.apresentadores_ids?.length
      ? prog.apresentadores_ids
      : prog.apresentador_id
        ? [prog.apresentador_id]
        : [];
    if (!presenterIds.length) return null;
    const names = presenterIds
      .map((id) => apresentadores.find((a) => a.id === id)?.nome)
      .filter(Boolean) as string[];
    return names.length ? names.join(" • ") : null;
  }, [apresentadores]);

  const currentPresenterName = useMemo(() => resolvePresenter(currentProgram), [currentProgram, resolvePresenter]);
  const nextPresenterName = useMemo(() => resolvePresenter(nextProgram), [nextProgram, resolvePresenter]);


  const streamingChannels = channels.filter(ch => ch.type === "video_live" || ch.type === "audio_live");
  const catalogChannels = channels.filter(ch => ch.type === "catalog");
  const catalogGroups: Record<string, Channel[]> = {};
  catalogChannels.forEach(ch => {
    const groupName = ch.catalog_name || "Catálogo";
    if (!catalogGroups[groupName]) catalogGroups[groupName] = [];
    catalogGroups[groupName].push(ch);
  });

  // Fetch playlist videos (deferred & parallel)
  useEffect(() => {
    if (!dataLoaded) return;
    const cats = channels.filter(ch => ch.type === "catalog");
    if (cats.length === 0) return;
    let cancelled = false;
    const fetchPlaylists = async () => {
      const entries = cats
        .map(ch => {
          if (!ch.url) return null;
          const plMatch = ch.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
          return plMatch?.[1] ? { id: ch.id, playlistId: plMatch[1] } : null;
        })
        .filter(Boolean) as { id: string; playlistId: string }[];
      if (entries.length === 0) return;
      const settled = await Promise.allSettled(
        entries.map(async (e) => {
          const { data, error } = await supabase.functions.invoke("youtube-playlist", { body: { playlistId: e.playlistId } });
          if (!error && data?.videos) {
            const sorted = [...data.videos].sort((a: any, b: any) =>
              (a.published && b.published) ? new Date(b.published).getTime() - new Date(a.published).getTime() : 0
            );
            return { id: e.id, videos: sorted.slice(0, 20) };
          }
          return null;
        })
      );
      if (cancelled) return;
      const results: Record<string, PlaylistVideo[]> = {};
      settled.forEach(r => { if (r.status === "fulfilled" && r.value) results[r.value.id] = r.value.videos; });
      setPlaylistVideos(results);
    };
    // Defer playlist fetch to after initial paint
    const id = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(() => fetchPlaylists())
      : setTimeout(() => fetchPlaylists(), 500) as unknown as number;
    return () => { cancelled = true; typeof cancelIdleCallback !== "undefined" ? cancelIdleCallback(id) : clearTimeout(id); };
  }, [dataLoaded, channels]);

  const goToPlayer = (channelId?: string, videoId?: string) => {
    setFadeOut(true);
    const params = new URLSearchParams();
    if (channelId) params.set("ch", channelId);
    if (videoId) params.set("vid", videoId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    setTimeout(() => {
      const watchPath = userSlug ? `/user/${userSlug}/nexohub/player/watch` : "/user/nexohub/player/watch";
      const fromParams = new URLSearchParams(location.search);
      if (activeCatalog) fromParams.set("catalog", activeCatalog);
      const fromPath = `${location.pathname}${fromParams.toString() ? `?${fromParams.toString()}` : ""}`;
      navigate(`${watchPath}${qs}`, {
        state: {
          fromPath,
          fromCatalog: activeCatalog,
        },
      });
    }, 400);
  };

  const goToCatalog = (catalogName: string) => {
    setActiveCatalog(catalogName);
    setSectionFading(true);
    setTimeout(() => { setVisibleSection("catalog-detail"); setSectionFading(false); }, 200);
  };

  const goToTop10 = () => {
    setSectionFading(true);
    setTimeout(() => { setVisibleSection("top10"); setSectionFading(false); }, 200);
  };

  const goBackFromTop10 = () => {
    setSectionFading(true);
    setTimeout(() => {
      setVisibleSection("home");
      setSectionFading(false);
      setTimeout(() => {
        const container = contentScrollRef.current;
        const el = document.getElementById("section-content");
        if (container && el) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: Math.max(0, offset - 8), behavior: "smooth" });
        }
      }, 50);
    }, 200);
  };

  const goBackFromCatalog = () => {
    setActiveCatalog(null);
    setSectionFading(true);
    setTimeout(() => {
      setVisibleSection("home");
      setSectionFading(false);
      setTimeout(() => {
        const container = contentScrollRef.current;
        const el = document.getElementById("section-content");
        if (container && el) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: Math.max(0, offset - 8), behavior: "smooth" });
        }
      }, 50);
    }, 200);
  };

  const scrollToSection = useCallback((sectionId: string) => {
    const container = contentScrollRef.current;
    const el = document.getElementById(sectionId);
    if (!container || !el) return;
    // Calculate offset within the scroll container, accounting for the sticky hero
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - containerRect.top + container.scrollTop;
    // Small padding above the section title
    container.scrollTo({ top: Math.max(0, offset - 8), behavior: "smooth" });
  }, []);

  const handleSectionChange = useCallback((section: Section) => {
    // If we're in catalog-detail, go back to main view first
    if (visibleSection === "catalog-detail") {
      setActiveCatalog(null);
      setSectionFading(true);
      setTimeout(() => {
        setVisibleSection("home");
        setSectionFading(false);
        setTimeout(() => {
          if (section === "home") {
            contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            scrollToSection(`section-${section}`);
          }
        }, 50);
      }, 200);
      setActiveSection(section);
      return;
    }

    setActiveSection(section);

    if (section === "home") {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      scrollToSection(`section-${section}`);
    }
  }, [visibleSection, scrollToSection]);

  const handleSignOut = async () => { await signOut(); navigate("/user/nexohub/player"); };

  const sidebarItems = [
    { icon: Home, label: "home", key: "home", action: () => { setActiveCatalog(null); setActiveRow(0); handleSectionChange("home"); } },
    { icon: Radio, label: "streamings", key: "streaming", action: () => { setActiveCatalog(null); setActiveRow(0); handleSectionChange("streaming"); } },
    { icon: Film, label: "on demand", key: "content", action: () => { setActiveCatalog(null); setActiveRow(1); handleSectionChange("content"); } },
    
  ];

  // Presenter photo of currently on-air program
  const currentPresenterFoto = useMemo(() => {
    if (!currentProgram) return null;
    const ids = currentProgram.apresentadores_ids?.length
      ? currentProgram.apresentadores_ids
      : currentProgram.apresentador_id
        ? [currentProgram.apresentador_id]
        : [];
    if (!ids.length) return null;
    return apresentadores.find(a => a.id === ids[0])?.foto || null;
  }, [currentProgram, apresentadores]);


  // Track which section is in view for sidebar highlight
  useEffect(() => {
    if (visibleSection === "catalog-detail") return;
    const container = contentScrollRef.current;
    if (!container) return;

    const sectionIds = ["section-streaming", "section-content"];
    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      // If near top, it's home
      if (scrollTop < containerHeight * 0.3) {
        setActiveSection("home");
        return;
      }
      // Find last section whose top is above the middle of the viewport
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;
          if (relativeTop < containerHeight * 0.5) {
            const key = sectionIds[i].replace("section-", "") as Section;
            setActiveSection(key);
            return;
          }
        }
      }
      setActiveSection("home");
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [visibleSection]);

  // Hero channel = first streaming channel
  const heroChannel = streamingChannels[0];


  return (
    <div
      className={`fixed inset-0 text-white flex flex-col transition-opacity duration-400 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ background: `hsl(var(--player-bg))` }}
    >
      {/* Top loading bar */}
      {!dataLoaded && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <LoadingSpinner size={24} />
        </div>
      )}

      {/* Main content */}
      <div ref={contentScrollRef} className={`flex-1 h-full relative ${(visibleSection === "catalog-detail" || visibleSection === "top10") ? "overflow-hidden" : "overflow-hidden"}`}>
        <div className={`transition-all duration-500 ease-in-out ${(visibleSection === "catalog-detail" || visibleSection === "top10") ? "h-full" : ""}`} style={{ opacity: sectionFading ? 0 : 1, transform: sectionFading ? "translateY(12px)" : "translateY(0)" }}>

          {visibleSection !== "catalog-detail" && visibleSection !== "top10" && (
            <>
              {/* Hero Banner with Top Nav inside */}
              <div className="relative overflow-hidden" id="section-home">
                {!dataLoaded ? (
                  <div style={{ height: "100dvh", minHeight: "560px" }} className="relative">
                    <Skeleton className="absolute inset-0 bg-white/5" />
                    <div className="absolute bottom-16 left-12 space-y-3">
                      <Skeleton className="h-40 w-72 rounded-2xl bg-white/10" />
                      <Skeleton className="h-4 w-48 bg-white/8" />
                      <div className="flex gap-3">
                        <Skeleton className="h-10 w-24 rounded-full bg-white/10" />
                        <Skeleton className="h-10 w-20 rounded-full bg-white/8" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <HeroBanner
                      currentProgram={currentProgram || undefined}
                      nowPlaying={nowPlaying}
                      presenterFoto={currentPresenterFoto}
                      backgroundUrl={heroChannel?.logo_url || null}
                      onOuvir={() => {
                        const audio = streamingChannels.find(c => c.type === "audio_live") || streamingChannels[0];
                        if (!audio) return;
                        // Navega direto ao player de áudio — sem splash / sem fade
                        const watchPath = userSlug ? `/user/${userSlug}/nexohub/player/watch` : "/user/nexohub/player/watch";
                        navigate(`${watchPath}?ch=${audio.id}`, { state: { fromPath: `${location.pathname}${location.search}` } });
                      }}
                      onAssistir={() => {
                        const video = streamingChannels.find(c => c.type === "video_live") || streamingChannels[0];
                        if (video) goToPlayer(video.id);
                      }}
                      onPlaylist={() => goToTop10()}
                      cardsVisible={activeRow === 0}
                    />
                    {(() => {
                      const googleIdentity = (user?.identities || []).find((i: any) => i.provider === "google");
                      const gData: any = googleIdentity?.identity_data || {};
                      const meta: any = user?.user_metadata || {};
                      const googleName = gData.full_name || gData.name || meta.full_name || meta.name || null;
                      const googleEmail = gData.email || user?.email || null;
                      const googlePhoto = gData.avatar_url || gData.picture || meta.avatar_url || meta.picture || null;
                      return (
                    <TopNavBar
                      items={sidebarItems.map(s => ({ label: s.label, key: s.key, action: s.action }))}
                      activeKey={activeSection}
                      avatarUrl={(profileAvatar && !profileAvatar.includes("usr-default")) ? profileAvatar : (googlePhoto || profileAvatar)}
                      userName={googleName || userName}
                      userEmail={googleEmail}
                      googleAvatarUrl={googlePhoto}
                      showLogout={!!user}
                      showSignup={!user && !!onBackToAccess}
                      onLogout={handleSignOut}
                      onSignup={() => onBackToAccess?.()}
                      onEditProfile={user && onBackToAccess ? () => onBackToAccess(true) : undefined}
                      onSwitchProfile={user && onBackToAccess ? () => onBackToAccess(false) : undefined}
                      channels={channels}
                      programas={programas}
                      onPlayChannel={(ch) => goToPlayer(ch.id)}
                      userId={user?.id}
                      radioName={channelName}
                      stationLogoUrl={logoUrl || heroChannel?.logo_url}
                      paletteSource={heroChannel?.logo_url || null}
                      onAvatarChange={(url) => setProfileAvatar(url)}
                    />
                      );
                    })()}
                  </>

                )}
              </div>

              {/* On Demand — overlay row: sits at the same position as the hero cards row
                  and slides up into view when activeRow === 1. The rest of the page stays still. */}
              <div
                data-tv-row="1"
                className="absolute left-4 sm:left-8 md:left-12 right-4 sm:right-8 md:right-12 z-20 flex items-end gap-5"
                style={{
                  bottom: "2.5rem",
                  transform: activeRow === 1 ? "translateY(0)" : "translateY(calc(100% + 4rem))",
                  opacity: activeRow === 1 ? 1 : 0,
                  pointerEvents: activeRow === 1 ? "auto" : "none",
                  willChange: "transform, opacity",
                  transition: activeRow === 1
                    ? "transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 520ms ease-out 120ms"
                    : "transform 640ms cubic-bezier(0.32, 0, 0.67, 0), opacity 320ms ease-in",
                }}
              >
                {dataLoaded && (
                  <div className="flex-1 min-w-0">
                    <ContentRow title="on demand" scrollRoot={contentScrollRef}>
                      {user && (
                        <button
                          key="__top10__"
                          data-tv-focusable
                          onClick={() => goToTop10()}
                          className="flex-shrink-0 relative overflow-hidden text-left group transition-transform duration-300 hover:scale-[1.03]"
                          style={{
                            width: "260px",
                            height: "160px",
                            borderRadius: "22px",
                            background: "linear-gradient(135deg, hsla(var(--player-accent) / 0.55) 0%, hsla(var(--player-accent) / 0.15) 100%)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            fontFamily: "'Lufga', system-ui, sans-serif",
                          }}
                        >
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[88px] h-[88px] rounded-full overflow-hidden border-2 shadow-lg" style={{ borderColor: "hsla(var(--player-accent) / 0.5)" }}>
                            <img src={profileAvatar || "/avatars/usr-default.png"} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="relative z-[1] p-4 flex flex-col h-full">
                            <span className="inline-flex self-start text-[11px] px-3 py-1 rounded-full bg-black/40 text-white/85 tracking-wide">♫ playlist</span>
                            <div className="mt-auto">
                              <p className="text-[13px] text-white/70 leading-none lowercase">meu</p>
                              <p className="text-[22px] font-bold text-white leading-tight">TOP 10</p>
                              <p className="text-[11px] text-white/60 mt-0.5">♥ músicas curtidas</p>
                            </div>
                          </div>
                        </button>
                      )}
                      {Object.entries(catalogGroups).map(([groupName, items]) => {
                        const primary = items[0];
                        const videoCount = items.reduce((sum, item) => sum + (playlistVideos[item.id]?.length || 0), 0);
                        return (
                          <CatalogCard
                            key={groupName}
                            image={primary.logo_url || primary.cover_url}
                            title={groupName}
                            subtitle={videoCount > 0 ? `${videoCount} vídeos` : undefined}
                            logoUrl={primary.background_url || primary.cover_url}
                            onClick={() => goToCatalog(groupName)}
                          />
                        );
                      })}
                    </ContentRow>
                  </div>
                )}
              </div>

            </>
          )}

          {visibleSection === "catalog-detail" && activeCatalog && (
            <Suspense fallback={
              <div className="flex flex-col h-full">
                <Skeleton className="flex-1 bg-white/5" />
                <Skeleton className="h-[200px] bg-white/3" />
              </div>
            }>
              <CatalogDetailInline
                catalogName={activeCatalog}
                onBack={goBackFromCatalog}
                onPlayVideo={(chId, vidId) => goToPlayer(chId, vidId)}
              />
            </Suspense>
          )}

          {visibleSection === "top10" && (
            <Suspense fallback={
              <div className="flex flex-col h-full">
                <Skeleton className="flex-1 bg-white/5" />
              </div>
            }>
              <Top10DetailInline
                avatarUrl={profileAvatar}
                onBack={goBackFromTop10}
                onPlayVideo={(videoId, playlist) => {
                  setFadeOut(true);
                  const params = new URLSearchParams();
                  params.set("top10", "1");
                  params.set("vid", videoId);
                  const watchPath = userSlug ? `/user/${userSlug}/nexohub/player/watch` : "/user/nexohub/player/watch";
                  setTimeout(() => {
                    navigate(`${watchPath}?${params.toString()}`, {
                      state: {
                        fromPath: location.pathname,
                        top10Playlist: playlist,
                        ownerUserId,
                      },
                    });
                  }, 400);
                }}
              />
            </Suspense>
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

      {/* Profile edit dialog */}
      {profileDialogOpen && user && (
        <ProfileDialog
          user={user}
          profileName={profileName}
          profileEmail={profileEmail}
          profileCity={profileCity}
          profileAvatar={profileAvatar}
          onClose={() => setProfileDialogOpen(false)}
          onSaved={(data) => {
            if (data.nome) setProfileName(data.nome);
            if (data.email) setProfileEmail(data.email);
            setProfileCity([data.cidade, data.estado].filter(Boolean).join(", "));
            if (data.avatar_url) setProfileAvatar(data.avatar_url);
            setProfileDialogOpen(false);
          }}
        />
      )}

    </div>
  );
}


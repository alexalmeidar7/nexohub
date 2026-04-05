import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";
import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, Clock, Music, ChevronLeft, ChevronRight, Play, LayoutGrid, Flame, TrendingUp, Tag, Shield, Search, Bell, User, Mic, Disc, Plus, Maximize } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMiniPlayerData, clearMiniPlayerData, destroyMiniAudio, type MiniPlayerData } from "@/components/player/MiniPlayerWidget";
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

/* ─── Top Navigation Bar ─── */
function TopNavBar({
  logoUrl,
  items,
  activeKey,
  avatarUrl,
  userName,
  showLogout,
  showSignup,
  onLogout,
  onSignup,
  onEditProfile,
  channels = [],
  programas = [],
  onPlayChannel,
  userId,
  radioName,
}: {
  logoUrl: string | null;
  items: { label: string; key: string; action: () => void }[];
  activeKey: string;
  avatarUrl?: string | null;
  userName?: string;
  showLogout?: boolean;
  showSignup?: boolean;
  onLogout?: () => void;
  onSignup?: () => void;
  onEditProfile?: () => void;
  channels?: Channel[];
  programas?: Programa[];
  onPlayChannel?: (ch: Channel) => void;
  userId?: string | null;
  radioName?: string;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [musicResults, setMusicResults] = useState<{ musica: string; artista: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const musicSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchOpen) {
      setSearchQuery("");
      setMusicResults([]);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  // Debounced music search
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
        // Deduplicate by musica+artista
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
    if (!q) return { channels: [] as Channel[], programas: [] as Programa[], catalogs: [] as Channel[] };

    // Extract date from query (anywhere in string)
    const dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
    const dateMatch = q.match(dateRegex);
    const textPart = q.replace(dateRegex, "").trim();

    let catalogsByDate: Channel[] = [];
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const month = dateMatch[2].padStart(2, "0");
      const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear().toString();
      const dateStr = `${year}-${month}-${day}`;
      const dateBR = `${day}/${month}/${year}`;
      catalogsByDate = channels.filter(ch => {
        if (ch.type !== "catalog") return false;
        const nameMatch = ch.name.toLowerCase().includes(dateStr) || ch.name.toLowerCase().includes(dateBR) || ch.name.includes(`${day}/${month}`);
        const descMatch = ch.descricao?.toLowerCase().includes(dateStr) || ch.descricao?.toLowerCase().includes(dateBR) || ch.descricao?.includes(`${day}/${month}`);
        const matchesDate = nameMatch || descMatch;
        if (!matchesDate) return false;
        if (textPart) {
          return ch.name.toLowerCase().includes(textPart) || (ch.catalog_name && ch.catalog_name.toLowerCase().includes(textPart)) || ch.descricao?.toLowerCase().includes(textPart);
        }
        return true;
      });
    }

    return {
      channels: channels.filter(ch => ch.name.toLowerCase().includes(q) || (ch.catalog_name && ch.catalog_name.toLowerCase().includes(q))),
      programas: programas.filter(p => p.nome.toLowerCase().includes(q) || p.descricao?.toLowerCase().includes(q)),
      catalogs: catalogsByDate,
    };
  }, [searchQuery, channels, programas]);

  const hasResults = searchResults.channels.length > 0 || searchResults.programas.length > 0 || musicResults.length > 0 || searchResults.catalogs.length > 0;

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center px-6 sm:px-10 py-4 gap-6">
      {/* Company logo – no box background */}
      <div className="w-20 h-20 overflow-hidden flex items-center justify-center flex-shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <Radio className="w-8 h-8 text-white/30" />
        )}
      </div>

      {/* Nav links with glow underline */}
      <nav className="flex items-center gap-1 sm:gap-2">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              onClick={item.action}
              className="group relative px-4 py-2 text-sm font-light tracking-wide transition-all duration-200"
              style={{
                color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                background: "transparent",
              }}
            >
              {item.label}
              {/* Underline indicator */}
              <span
                className="absolute bottom-0 left-0 w-full h-[1.5px] transition-all duration-300 ease-out"
                style={{
                  background: isActive ? "hsl(var(--player-accent))" : "transparent",
                  boxShadow: isActive ? "0 0 8px hsl(var(--player-accent)), 0 0 16px hsla(var(--player-accent) / 0.4)" : "none",
                  transform: isActive ? "scaleX(1)" : "scaleX(0)",
                }}
              />
              {/* Hover underline */}
              {!isActive && (
                <span
                  className="absolute bottom-0 left-0 w-full h-[1.5px] transition-all duration-300 ease-out origin-left scale-x-0 group-hover:scale-x-100"
                  style={{
                    background: "hsl(var(--player-accent))",
                    boxShadow: "0 0 8px hsl(var(--player-accent)), 0 0 16px hsla(var(--player-accent) / 0.4)",
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Right icons */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.06)" }}>
          <Bell className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen?.();
          }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <Maximize className="w-4 h-4" />
        </button>

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110"
            style={{ background: "hsl(var(--player-accent))", border: "2px solid hsla(var(--player-accent) / 0.5)" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-full h-full object-contain" />
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </button>
          {profileOpen && userId && (
            <Suspense fallback={null}>
              <WatchProfilePopup
                userId={userId}
                userName={userName || "Visitante"}
                avatarUrl={avatarUrl || null}
                radioName={radioName}
                onClose={() => setProfileOpen(false)}
                onEditProfile={onEditProfile}
                onLogout={showLogout ? onLogout : undefined}
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
      </div>
      {/* Search Popup - rendered via portal for true viewport centering */}
      {searchOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9999]" style={{ background: "transparent" }} onClick={() => setSearchOpen(false)} />
          <div
            className="fixed z-[10000] w-[min(480px,90vw)] rounded-2xl overflow-hidden animate-fade-in"
            style={{
              top: "120px",
              left: "0",
              right: "0",
              marginLeft: "auto",
              marginRight: "auto",
              background: "hsl(var(--player-bg))",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <Search className="w-5 h-5 shrink-0" style={{ color: "hsl(var(--player-accent))" }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar canais, programas, músicas..."
                autoFocus
                className="flex-1 bg-transparent text-xl font-bold placeholder:text-white/25 placeholder:font-light outline-none"
                style={{ color: "hsl(var(--player-accent))", caretColor: "hsl(var(--player-accent))" }}
                onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-white/30 hover:text-white/60 transition-colors text-xs">Limpar</button>
              )}
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
              {!searchQuery.trim() ? (
                <p className="text-center text-white/20 text-sm py-8">Digite para buscar...</p>
              ) : !hasResults ? (
                <p className="text-center text-white/20 text-sm py-8">Nenhum resultado encontrado</p>
              ) : (
                <>
                  {searchResults.channels.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Canais</p>
                      {searchResults.channels.map(ch => (
                        <button key={ch.id} onClick={() => { setSearchOpen(false); onPlayChannel?.(ch); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
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
                  {searchResults.catalogs.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Catálogos por Data</p>
                      {searchResults.catalogs.map(ch => (
                        <button key={ch.id + "-cat"} onClick={() => { setSearchOpen(false); onPlayChannel?.(ch); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                            {ch.logo_url ? <img src={ch.logo_url} className="w-full h-full object-cover" /> : <Film className="w-4 h-4 text-white/30" />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-white truncate block">{ch.name}</span>
                            <span className="text-[11px] text-white/30">{ch.catalog_name || "Catálogo"}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.programas.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-1.5">Programação</p>
                      {searchResults.programas.map((p, i) => (
                        <div key={p.id || i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
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
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
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
        </>,
        document.body
      )}
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

/* ─── Hero Banner ─── */
function HeroBanner({
  currentProgram,
  nextProgram,
  nowPlaying,
  channelName,
  presenterName,
  nextPresenterName,
  onPlay,
  onGrade,
  logoUrl,
}: {
  currentProgram?: Programa;
  nextProgram?: Programa;
  nowPlaying?: { musica: string; artista: string; capa?: string } | null;
  channelName?: string;
  presenterName?: string | null;
  nextPresenterName?: string | null;
  onPlay: () => void;
  onGrade: () => void;
  logoUrl?: string | null;
}) {
  const INTERVAL = 8000;

  const slides = useMemo(() => {
    const s: { program: Programa | undefined; label: string }[] = [];
    s.push({ program: currentProgram, label: "ao vivo" });
    if (nextProgram) s.push({ program: nextProgram, label: "A seguir" });
    return s;
  }, [currentProgram, nextProgram]);

  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => setActiveIdx(prev => (prev + 1) % slides.length), INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length]);

  const goTo = (idx: number) => {
    if (idx === activeIdx) return;
    setActiveIdx(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length > 1) {
      timerRef.current = setInterval(() => setActiveIdx(prev => (prev + 1) % slides.length), INTERVAL);
    }
  };

  const displayProgram = slides[activeIdx]?.program;
  const activeLabel = slides[activeIdx]?.label || "ao vivo";
  const displayPresenter = activeIdx === 0 ? presenterName : nextPresenterName;

  // Progress bar
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

  // Program assets for hero
  const programSeal = displayProgram?.selo || null;
  const heroThumb = displayProgram?.thumb || displayProgram?.capa || null;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100vh", backgroundColor: "hsl(var(--player-bg))" }}>
      {/* Thumb as hero background */}
      {heroThumb ? (
        <>
          <img
            key={`hero-bg-${displayProgram?.id || heroThumb}`}
            src={heroThumb}
            alt={displayProgram?.nome ? `Thumb do programa ${displayProgram.nome}` : ""}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ animation: "playerFadeSlideIn 0.8s ease-out" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to top, hsl(var(--player-bg)) 0%, hsla(var(--player-bg) / 0.92) 26%, hsla(var(--player-bg) / 0.55) 58%, hsla(var(--player-bg) / 0.68) 100%)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsla(var(--player-accent) / 0.25) 0%, hsl(var(--player-bg)) 50%, hsla(var(--player-accent) / 0.1) 100%)",
          }}
        />
      )}

      {/* Accent glow behind program logo */}
      <div
        className="absolute z-[1] pointer-events-none"
        style={{
          width: "600px",
          height: "600px",
          left: "15%",
          top: "30%",
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(ellipse at center, hsla(var(--player-accent) / 0.25) 0%, hsla(var(--player-accent) / 0.08) 40%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />

      {/* Content positioned at bottom-left */}
      <div className="absolute left-0 right-0 z-10 px-8 sm:px-12" style={{ maxWidth: "760px", top: "50%", transform: "translateY(-50%)" }}>
        {programSeal && (
          <div className="mb-4">
            <img
              key={`program-logo-${displayProgram?.id || programSeal}`}
              src={programSeal}
              alt={displayProgram?.nome || ""}
              className="h-16 sm:h-20 lg:h-24 object-contain"
              style={{ animation: "playerFadeSlideIn 0.6s ease-out" }}
            />
          </div>
        )}

        {!programSeal && displayProgram && (
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-4"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
          >
            {displayProgram.nome}
          </h1>
        )}

        {nowPlaying?.musica && (
          <div className="mb-2 overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              {/* Presenter name to the left of music */}
              {(displayPresenter || displayProgram?.nome) && (
                <span className="flex items-center gap-1 text-sm text-white/50 flex-shrink-0 whitespace-nowrap">
                  <Mic className="w-3.5 h-3.5" style={{ color: "hsl(var(--player-accent))" }} />
                  <span>{displayPresenter || displayProgram?.nome}</span>
                  <span className="mx-1 text-white/20">|</span>
                </span>
              )}
              <Music className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(var(--player-accent))" }} />
              <span
                key={`hero-music-${nowPlaying.musica}-${nowPlaying.artista}`}
                className="text-sm text-white/80"
                style={{ animation: "playerSlideInLeft 0.5s ease-out" }}
              >
                {nowPlaying.musica}{nowPlaying.artista ? ` — ${nowPlaying.artista}` : ""}
              </span>
            </div>
          </div>
        )}

        {displayProgram && (
          <div className="mb-4 space-y-1 text-sm text-white/65">
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "hsl(var(--player-accent))" }} />
              <span>{displayProgram.horario_inicio} — {displayProgram.horario_fim}</span>
            </div>
            {displayProgram.descricao && (
              <ExpandableDescription text={displayProgram.descricao} />
            )}
          </div>
        )}

        {/* Badge + Play */}
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full"
            style={{ border: "1px solid hsla(var(--player-accent) / 0.4)", color: "hsl(var(--player-accent))" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(var(--player-accent))" }} />
            {activeLabel}
          </span>
          <button
            onClick={onPlay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 hover:brightness-110"
            style={{
              background: "hsla(var(--player-accent) / 0.15)",
              color: "#fff",
            }}
          >
            <Play className="h-3 w-3 fill-current" />
            Play
          </button>
        </div>

      </div>

      {/* Carousel progress indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-8 sm:left-12 z-10 flex items-center gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className="relative h-[5px] rounded-full overflow-hidden transition-all duration-300"
              style={{
                width: idx === activeIdx ? 28 : 8,
                background: "rgba(255,255,255,0.2)",
              }}
            >
              {idx === activeIdx && (
                <span
                  key={`fill-${activeIdx}`}
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "hsl(var(--player-accent))",
                    animation: `hero-fill ${INTERVAL}ms linear forwards`,
                  }}
                />
              )}
              {idx < activeIdx && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: "rgba(255,255,255,0.45)" }}
                />
              )}
            </button>
          ))}
          <style>{`@keyframes hero-fill { from { width: 0% } to { width: 100% } }`}</style>
        </div>
      )}
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
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto overflow-y-visible pb-2 scrollbar-hide scroll-smooth card-row-hover">
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

/* ─── Catalog Card ─── */
function CatalogCard({ image, title, subtitle, logoUrl, onClick }: { image?: string | null; title: string; subtitle?: string; logoUrl?: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-2xl overflow-hidden relative transition-all duration-300 group cursor-pointer"
      style={{
        width: "160px",
        aspectRatio: "2/3",
        background: "hsla(var(--player-accent) / 0.06)",
        border: "1px solid hsla(var(--player-accent) / 0.1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = "3px solid #fff";
        e.currentTarget.style.boxShadow = "0 4px 20px hsla(var(--player-accent) / 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = "1px solid hsla(var(--player-accent) / 0.1)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {image ? (
        <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, hsl(var(--player-bg)) 100%)" }}>
          <Film className="h-10 w-10 text-white/15" />
        </div>
      )}

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
  onBackToAccess?: () => void;
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
      });
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
    { icon: Home, label: "Home", key: "home", action: () => { setActiveCatalog(null); handleSectionChange("home"); } },
    { icon: Radio, label: "Streaming", key: "streaming", action: () => { setActiveCatalog(null); handleSectionChange("streaming"); } },
    { icon: Film, label: "Catálogo", key: "content", action: () => { setActiveCatalog(null); handleSectionChange("content"); } },
    ...(user && shopActive ? [{ icon: ShoppingBag, label: "Loja", key: "shop", action: () => { setActiveCatalog(null); handleSectionChange("shop"); } }] : []),
  ];

  // Track which section is in view for sidebar highlight
  useEffect(() => {
    if (visibleSection === "catalog-detail") return;
    const container = contentScrollRef.current;
    if (!container) return;

    const sectionIds = ["section-streaming", "section-content", "section-shop"];
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
        <div className="absolute top-0 left-0 right-0 z-50 h-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: "40%",
              background: "linear-gradient(90deg, transparent, hsl(var(--player-accent)), transparent)",
              animation: "player-hub-loading-bar 1.8s ease-in-out infinite",
            }}
          />
        </div>
      )}
      {/* Main content */}
      <div ref={contentScrollRef} className={`flex-1 h-full ${(visibleSection === "catalog-detail" || visibleSection === "top10") ? "overflow-hidden" : "overflow-y-auto scroll-smooth"}`}>
        <div className={`transition-all duration-500 ease-in-out ${(visibleSection === "catalog-detail" || visibleSection === "top10") ? "h-full" : ""}`} style={{ opacity: sectionFading ? 0 : 1, transform: sectionFading ? "translateY(12px)" : "translateY(0)" }}>

          {visibleSection !== "catalog-detail" && visibleSection !== "top10" && (
            <>
              {/* Hero Banner with Top Nav inside */}
              <div className="relative" id="section-home">
                {!dataLoaded ? (
                  <div style={{ height: "100vh" }} className="relative">
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
                      nextProgram={nextProgram}
                      nowPlaying={nowPlaying}
                      channelName={channelName}
                      presenterName={currentPresenterName}
                      nextPresenterName={nextPresenterName}
                      onPlay={() => goToPlayer(streamingChannels[0]?.id)}
                      onGrade={() => setShowGrade(true)}
                      logoUrl={logoUrl}
                    />
                    <TopNavBar
                      logoUrl={logoUrl}
                      items={sidebarItems.map(s => ({ label: s.label, key: s.key, action: s.action }))}
                      activeKey={activeSection}
                      avatarUrl={profileAvatar}
                      userName={userName}
                      showLogout={!!user}
                      showSignup={!user && !!onBackToAccess}
                      onLogout={handleSignOut}
                      onSignup={onBackToAccess}
                      onEditProfile={user ? () => setProfileDialogOpen(true) : undefined}
                      channels={channels}
                      programas={programas}
                      onPlayChannel={(ch) => goToPlayer(ch.id)}
                      userId={user?.id}
                      radioName={channelName}
                    />
                  </>
                )}
              </div>

              {/* All sections stacked vertically */}
              <div className="px-6 sm:px-10 pb-8 relative z-10" style={{ marginTop: "-4px", background: `hsl(var(--player-bg))` }}>

                {/* Streaming ao vivo */}
                <section id="section-streaming" className="scroll-mt-4">
                  {!dataLoaded ? (
                    <div className="mb-8">
                      <Skeleton className="h-5 w-44 bg-white/10 mb-3" />
                      <div className="flex gap-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="flex-shrink-0 rounded-xl bg-white/8" style={{ width: 160, aspectRatio: "2/3" }} />)}
                      </div>
                    </div>
                  ) : streamingChannels.length > 0 && (
                    <ContentRow title="Canais ao Vivo" scrollRoot={contentScrollRef}>
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
                </section>


                {/* Catálogo */}
                <section id="section-content" className="scroll-mt-4">
                  {!dataLoaded ? (
                    <div className="mb-8">
                      <Skeleton className="h-5 w-36 bg-white/10 mb-3" />
                      <div className="flex gap-3">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="flex-shrink-0 rounded-xl bg-white/8" style={{ width: 160, aspectRatio: "2/3" }} />)}
                      </div>
                    </div>
                  ) : (
                    <ContentRow title={
                      <span className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5" style={{ color: "hsl(var(--player-accent))" }} />
                        Catálogo
                      </span>
                    } scrollRoot={contentScrollRef}>
                      {user && (
                        <button
                          key="__top10__"
                          onClick={() => goToTop10()}
                          className="flex-shrink-0 rounded-2xl overflow-hidden relative transition-all duration-300 group cursor-pointer flex flex-col items-center justify-center gap-3"
                          style={{
                            width: "160px",
                            aspectRatio: "2/3",
                            background: "linear-gradient(135deg, hsla(var(--player-accent) / 0.5) 0%, hsl(var(--player-bg)) 50%, hsla(var(--player-accent) / 0.3) 100%)",
                            border: "1px solid hsla(var(--player-accent) / 0.15)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.border = "3px solid #fff";
                            e.currentTarget.style.boxShadow = "0 4px 20px hsla(var(--player-accent) / 0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.border = "1px solid hsla(var(--player-accent) / 0.15)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          <div className="w-16 h-16 rounded-full overflow-hidden border-2 shadow-lg transition-transform duration-300 group-hover:scale-110" style={{ borderColor: "hsla(var(--player-accent) / 0.5)" }}>
                            <img src={profileAvatar || "/avatars/usr-default.png"} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex flex-col items-center gap-0.5 px-2">
                            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: "hsla(var(--player-accent) / 0.8)" }}>♫ playlist</span>
                            <span className="text-base font-black text-white leading-tight">Meu</span>
                            <span className="text-2xl font-black leading-none" style={{ color: "hsl(var(--player-accent))" }}>TOP 10</span>
                            <span className="text-[9px] text-white/40 mt-1">♥ músicas curtidas</span>
                          </div>
                        </button>
                      )}
                      {Object.entries(catalogGroups).map(([groupName, items]) => {
                        const primary = items[0];
                        const videoCount = items.reduce((sum, item) => sum + (playlistVideos[item.id]?.length || 0), 0);
                        return (
                          <CatalogCard
                            key={groupName}
                            image={primary.cover_url || primary.logo_url}
                            title={groupName}
                            subtitle={videoCount > 0 ? `${videoCount} vídeos` : undefined}
                            logoUrl={primary.background_url || primary.logo_url}
                            onClick={() => goToCatalog(groupName)}
                          />
                        );
                      })}
                    </ContentRow>
                  )}
                </section>

                {/* Loja */}
                {user && shopActive && (
                  <section id="section-shop" className="scroll-mt-4 pt-4">
                    <h2 className="text-lg font-bold mb-4 text-white">Loja</h2>
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
                            className="group rounded-xl overflow-hidden transition-all duration-300"
                            style={{ background: "hsla(var(--player-accent) / 0.06)", border: "1px solid hsla(var(--player-accent) / 0.1)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.4)"; e.currentTarget.style.boxShadow = "0 8px 32px hsla(var(--player-accent) / 0.15)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.1)"; e.currentTarget.style.boxShadow = "none"; }}
                          >
                            <div className="aspect-square overflow-hidden relative">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                                  <ShoppingBag className="h-8 w-8 text-white/20" />
                                </div>
                              )}
                              <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid hsla(var(--player-accent) / 0.2)" }}>
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
                                  style={{ background: "hsla(var(--player-accent) / 0.15)", border: "1px solid hsla(var(--player-accent) / 0.25)" }}
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
              />
            </Suspense>
          )}

          {visibleSection === "shop" && shopActive && (
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
                      className="group rounded-xl overflow-hidden transition-all duration-300"
                      style={{ background: "hsla(var(--player-accent) / 0.06)", border: "1px solid hsla(var(--player-accent) / 0.1)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.4)"; e.currentTarget.style.boxShadow = "0 8px 32px hsla(var(--player-accent) / 0.15)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsla(var(--player-accent) / 0.1)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div className="aspect-square overflow-hidden relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                            <ShoppingBag className="h-8 w-8 text-white/20" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid hsla(var(--player-accent) / 0.2)" }}>
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
                            style={{ background: "hsla(var(--player-accent) / 0.15)", border: "1px solid hsla(var(--player-accent) / 0.25)" }}
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

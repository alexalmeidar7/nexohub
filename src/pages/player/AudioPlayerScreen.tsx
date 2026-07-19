import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { ChevronUp, ChevronDown, ArrowLeft, Rewind, Heart, Plus, MessageSquare, Mic, ListMusic, HelpCircle, Play, Pause, VolumeX, Volume2, Radio, Disc3, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCoverPalette, getPaletteContrast } from "@/lib/coverPalette";
import ElegantLoader from "@/components/player/ElegantLoader";

const PlayerChat = lazy(() => import("@/components/PlayerChat"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
const KaraokeOverlay = lazy(() => import("@/components/KaraokeOverlay"));
const WatchProfilePopup = lazy(() => import("@/components/player/WatchProfilePopup"));

export interface AudioPlayerScreenProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  canal: any;
  canais: any[];
  liveChannels: any[];
  navigateChannel: (dir: 1 | -1) => void;
  programas: any[];
  currentProg: any | null;
  nextProg: any | null;
  apresentadores: any[];
  musicData: any;
  playing: boolean;
  muted: boolean;
  volume: number;
  buffering: boolean;
  onTogglePlay: () => void;
  onSetMuted: (v: boolean) => void;
  onSetVolume: (v: number) => void;
  liked: boolean;
  onToggleLike: () => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  gradeOpen: boolean;
  setGradeOpen: (v: boolean) => void;
  karaokeEnabled: boolean;
  setKaraokeEnabled: (v: boolean) => void;
  watchProfileOpen: boolean;
  setWatchProfileOpen: (v: boolean) => void;
  empresaLogo: string | null;
  empresaNome: string | null;
  user: any;
  profileAvatar: string | null;
  userDisplayName: string;
  signOut: () => Promise<void>;
  effectiveUserId: string | null;
  isPublicMode: boolean;
  userSlug: string | null | undefined;
  onBackHome: () => void;
}

interface HistoryTrack {
  musica: string;
  artista: string;
  horario: string;
  capa?: string;
}

const HIST_MAX = 50;

function hhmm(dateOrTime: string | Date | undefined) {
  if (!dateOrTime) return "";
  if (dateOrTime instanceof Date) {
    return `${String(dateOrTime.getHours()).padStart(2, "0")}:${String(dateOrTime.getMinutes()).padStart(2, "0")}`;
  }
  const s = String(dateOrTime);
  const m = s.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s.slice(0, 5);
}

export default function AudioPlayerScreen(props: AudioPlayerScreenProps) {
  const {
    audioRef, videoRef, canal, liveChannels, navigateChannel,
    programas, currentProg, nextProg, apresentadores,
    musicData, playing, muted, volume, buffering,
    onTogglePlay, onSetMuted, onSetVolume,
    liked, onToggleLike,
    chatOpen, setChatOpen, gradeOpen, setGradeOpen,
    karaokeEnabled, setKaraokeEnabled,
    watchProfileOpen, setWatchProfileOpen,
    empresaLogo, empresaNome,
    user, profileAvatar, userDisplayName, signOut,
    effectiveUserId,
    onBackHome,
  } = props;

  // ---- Apresentador do programa no ar ----
  const apresentador = useMemo(() => {
    if (!currentProg?.apresentador_id) return null;
    return apresentadores.find((a) => a.id === currentProg.apresentador_id) || null;
  }, [currentProg, apresentadores]);

  const locutorFoto: string | null = apresentador?.foto || currentProg?.capa || currentProg?.thumb || null;
  const palette = useCoverPalette(locutorFoto);
  const contrast = getPaletteContrast(palette);
  const gradient = palette
    ? `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`
    : "linear-gradient(135deg, #1f2937 0%, #0b0f1a 100%)";

  // ---- Background dinâmico com base na CAPA DA MÚSICA (crossfade elegante) ----
  const musicCover: string | null = musicData?.capa || null;
  const musicPalette = useCoverPalette(musicCover);
  const musicGradient = musicPalette
    ? `radial-gradient(ellipse at 20% 20%, ${musicPalette.primary}cc 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, ${musicPalette.secondary}cc 0%, transparent 55%), linear-gradient(135deg, ${musicPalette.primary} 0%, ${musicPalette.secondary} 100%)`
    : "linear-gradient(135deg, #1a1f2e 0%, #050810 100%)";
  const [bgLayers, setBgLayers] = useState<{ id: number; g: string }[]>([{ id: 0, g: musicGradient }]);
  const bgIdRef = useRef(1);
  useEffect(() => {
    setBgLayers((prev) => {
      if (prev[prev.length - 1]?.g === musicGradient) return prev;
      return [...prev, { id: bgIdRef.current++, g: musicGradient }];
    });
  }, [musicGradient]);
  useEffect(() => {
    if (bgLayers.length <= 2) return;
    const t = setTimeout(() => setBgLayers((p) => p.slice(-2)), 1800);
    return () => clearTimeout(t);
  }, [bgLayers]);

  // ---- Progresso do programa no ar ----
  const [progPct, setProgPct] = useState(0);
  useEffect(() => {
    if (!currentProg) { setProgPct(0); return; }
    const calc = () => {
      const now = new Date();
      const [sh, sm] = String(currentProg.horario_inicio || "00:00").split(":").map(Number);
      const [eh, em] = String(currentProg.horario_fim || "00:00").split(":").map(Number);
      const start = new Date(now); start.setHours(sh, sm, 0, 0);
      const end = new Date(now); end.setHours(eh, em, 0, 0);
      if (end <= start) end.setDate(end.getDate() + 1);
      const total = end.getTime() - start.getTime();
      const done = now.getTime() - start.getTime();
      setProgPct(Math.max(0, Math.min(100, (done / total) * 100)));
    };
    calc();
    const id = setInterval(calc, 30000);
    return () => clearInterval(id);
  }, [currentProg?.id, currentProg?.horario_inicio, currentProg?.horario_fim]);

  // ---- Histórico (últimas 50) ----
  const [history, setHistory] = useState<HistoryTrack[]>([]);
  const coverCacheRef = useRef<Map<string, string>>(new Map());
  const fetchCover = async (artista: string, musica: string): Promise<string | undefined> => {
    const key = `${(artista || "").toLowerCase()}|${(musica || "").toLowerCase()}`;
    if (!key.trim() || key === "|") return undefined;
    const cached = coverCacheRef.current.get(key);
    if (cached !== undefined) return cached || undefined;
    try {
      const q = encodeURIComponent(`${artista} ${musica}`.trim());
      const r = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error("itunes fail");
      const j = await r.json();
      const url = j?.results?.[0]?.artworkUrl100?.replace("100x100", "600x600") || "";
      coverCacheRef.current.set(key, url);
      return url || undefined;
    } catch {
      coverCacheRef.current.set(key, "");
      return undefined;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!effectiveUserId) return;
      const { data } = await supabase
        .from("musicas_tocadas")
        .select("musica, artista, horario")
        .eq("user_id", effectiveUserId)
        .order("created_at", { ascending: false })
        .limit(HIST_MAX);
      if (cancelled || !data) return;
      // Hidrata com capas já em cache imediatamente
      const withCached = (data as HistoryTrack[]).map((t) => ({
        ...t,
        capa: coverCacheRef.current.get(`${(t.artista || "").toLowerCase()}|${(t.musica || "").toLowerCase()}`) || undefined,
      }));
      setHistory(withCached);
      // Busca capas faltantes das primeiras 12 em paralelo
      const targets = withCached.slice(0, 12).filter((t) => !t.capa);
      await Promise.all(targets.map(async (t) => {
        const cover = await fetchCover(t.artista, t.musica);
        if (!cancelled && cover) {
          setHistory((prev) => prev.map((p) => (p.artista === t.artista && p.musica === t.musica ? { ...p, capa: cover } : p)));
        }
      }));
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [effectiveUserId, musicData?.titulo, musicData?.artista]);

  // ---- Navegação do carrossel de histórico ----
  // activeIndex = 0 significa "mais recente" (encostada na capa central).
  // Ao mover o mouse mais para a esquerda, avançamos no histórico (índices maiores).
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const CAROUSEL_VISIBLE = 10;
  const maxIndex = Math.max(0, Math.min(history.length, HIST_MAX) - 1);

  useEffect(() => { setActiveIndex(0); }, [history[0]?.musica, history[0]?.artista]);

  const handleCarouselMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = carouselRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width; // 0 esquerda .. 1 direita
    // Direita (rel≈1) => índice 0 (mais recente). Esquerda (rel≈0) => índice maior.
    const idx = Math.round((1 - Math.max(0, Math.min(1, rel))) * Math.min(maxIndex, CAROUSEL_VISIBLE - 1));
    setActiveIndex(idx);
  };
  const handleCarouselWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return;
    const dir = (e.deltaY + e.deltaX) > 0 ? 1 : -1;
    setActiveIndex((i) => Math.max(0, Math.min(maxIndex, i + dir)));
  };

  // Chave para animar entrada de nova música
  const [carKey, setCarKey] = useState(0);
  useEffect(() => { setCarKey((k) => k + 1); }, [history[0]?.musica, history[0]?.artista]);


  // ---- Timeshift (buffer nativo do HLS, alvo 5 min = 300s) ----
  const TIMESHIFT_WINDOW = 1800; // segundos (30 min)
  const [ts, setTs] = useState({ offset: 0, back: 0 }); // offset em s (0 = ao vivo), back = seconds available (cap 300)
  const [dragVal, setDragVal] = useState<number | null>(null); // valor local durante arraste do rewind
  const commitDrag = () => {
    if (dragVal == null) return;
    seekBySeconds(TIMESHIFT_WINDOW - dragVal);
    setDragVal(null);
  };
  const [backToLiveFlash, setBackToLiveFlash] = useState(false);
  const prevOffsetRef = useRef(0);
  useEffect(() => {
    const wasBehind = prevOffsetRef.current > 2;
    const nowLive = ts.offset <= 1;
    if (wasBehind && nowLive) {
      setBackToLiveFlash(true);
      const t = setTimeout(() => setBackToLiveFlash(false), 2500);
      prevOffsetRef.current = ts.offset;
      return () => clearTimeout(t);
    }
    prevOffsetRef.current = ts.offset;
  }, [ts.offset]);
  const isBehind = ts.offset > 2;
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const a = audioRef.current;
      if (a && a.buffered && a.buffered.length > 0) {
        const start = a.buffered.start(0);
        const end = a.buffered.end(a.buffered.length - 1);
        const rawBack = Math.max(0, end - start);
        const back = Math.min(TIMESHIFT_WINDOW, rawBack);
        const offset = Math.max(0, Math.min(back, end - a.currentTime));
        setTs({ offset, back });
      } else {
        setTs({ offset: 0, back: 0 });
      }
      rafRef.current = window.setTimeout(tick as any, 1000) as any;
    };
    tick();
    return () => { if (rafRef.current) clearTimeout(rafRef.current as any); };
  }, [audioRef, canal?.id, playing]);

  const seekBySeconds = (secsBack: number) => {
    const a = audioRef.current;
    if (!a || !a.buffered.length) return;
    const start = a.buffered.start(0);
    const end = a.buffered.end(a.buffered.length - 1);
    const clampedBack = Math.min(secsBack, Math.min(TIMESHIFT_WINDOW, end - start));
    const target = Math.max(start + 0.5, end - clampedBack);
    try { a.currentTime = target; } catch {}
    // garantir playback contínuo após o seek
    if (a.paused) { void a.play().catch(() => {}); }
  };
  const seekLive = () => {
    const a = audioRef.current;
    if (!a || !a.buffered.length) return;
    try { a.currentTime = a.buffered.end(a.buffered.length - 1) - 0.5; } catch {}
    if (a.paused) { void a.play().catch(() => {}); }
  };

  // ---- Volume UI ----
  const [volHover, setVolHover] = useState(false);

  // ---- Progresso da música atual (sincronizado com o tempo real do player) ----
  // Ancoramos no audio.currentTime no momento em que a faixa mudou; assim o
  // elapsed acompanha exatamente o player (respeita pausa, buffer, seek).
  const trackStartMediaRef = useRef<number | null>(null);
  const trackStartWallRef = useRef<number>(Date.now());
  const [mediaTime, setMediaTime] = useState<number>(0);
  const [wallNow, setWallNow] = useState<number>(() => Date.now());

  // Reancorar sempre que a música mudar
  useEffect(() => {
    const a = audioRef.current;
    trackStartMediaRef.current = a && Number.isFinite(a.currentTime) ? a.currentTime : null;
    trackStartWallRef.current = Date.now();
    setMediaTime(a?.currentTime ?? 0);
    setWallNow(Date.now());
  }, [musicData?.titulo, musicData?.artista, audioRef]);

  // Atualiza mediaTime a partir do próprio elemento (timeupdate + rAF fallback)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const sync = () => setMediaTime(a.currentTime || 0);
    a.addEventListener("timeupdate", sync);
    a.addEventListener("seeked", sync);
    a.addEventListener("playing", sync);
    const id = setInterval(() => {
      setMediaTime(a.currentTime || 0);
      setWallNow(Date.now());
    }, 500);
    return () => {
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("seeked", sync);
      a.removeEventListener("playing", sync);
      clearInterval(id);
    };
  }, [audioRef, canal?.id]);

  const trackDur = Math.max(0, Number(musicData?.duracao) || 0);
  const trackElapsedLive = (() => {
    const anchor = trackStartMediaRef.current;
    if (anchor != null && Number.isFinite(mediaTime)) {
      return Math.max(0, mediaTime - anchor);
    }
    // fallback caso currentTime não esteja disponível
    return Math.max(0, (wallNow - trackStartWallRef.current) / 1000 - ts.offset);
  })();
  const trackElapsed = trackDur > 0 ? Math.min(trackDur, trackElapsedLive) : trackElapsedLive;

  // Estado local do arraste da barra da música — o seek só é aplicado ao soltar
  const [trackDrag, setTrackDrag] = useState<number | null>(null);
  const trackDisplay = trackDrag != null ? trackDrag : trackElapsed;

  const fmtMS = (s: number) => {
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  };
  const seekTrackTo = (newElapsed: number) => {
    if (newElapsed >= trackElapsed) { seekLive(); return; }
    const deltaBack = trackElapsed - newElapsed; // segundos a mais para trás
    seekBySeconds(ts.offset + deltaBack);
  };
  const commitTrackDrag = () => {
    if (trackDrag == null) return;
    const val = trackDrag;
    setTrackDrag(null);
    seekTrackTo(val);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden text-white select-none" style={{ background: "#050810", fontFamily: "'Lufga', 'Inter', sans-serif" }}>
      {/* Background dinâmico da capa da música (crossfade elegante entre trocas) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {bgLayers.map((l, idx) => (
          <BgFadeLayer key={l.id} gradient={l.g} initialOpacity={idx === 0 ? 1 : 0} />
        ))}
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.55) 100%)" }} />

      {/* Media elements (owned by parent HLS) */}
      <audio ref={audioRef} muted={muted} preload="none" className="hidden" />
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* Indicador de atraso / retorno ao vivo */}
      {(isBehind || backToLiveFlash) && (
        <div
          className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md border text-[12px] font-medium shadow-lg transition-all duration-300"
          style={{
            background: isBehind ? "rgba(255,180,0,0.18)" : "rgba(0,200,120,0.20)",
            borderColor: isBehind ? "rgba(255,200,80,0.45)" : "rgba(80,255,180,0.45)",
            color: isBehind ? "#ffd77a" : "#8effc8",
          }}
          role="status"
          aria-live="polite"
        >
          {isBehind ? (
            <>
              <Rewind size={14} />
              <span>atrasado do ao vivo</span>
              <span className="tabular-nums opacity-90">
                −{Math.floor(ts.offset / 60)}:{String(Math.round(ts.offset % 60)).padStart(2, "0")}
              </span>
              <button
                onClick={seekLive}
                className="ml-1 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] uppercase tracking-widest"
              >
                ir ao vivo
              </button>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>de volta ao vivo</span>
            </>
          )}
        </div>
      )}

      {/* ============== TOP BAR ============== */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-8 pt-6">
        {/* Channel switcher */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => navigateChannel(-1)}
              className="w-9 h-6 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 transition"
              aria-label="Canal anterior"
              data-focusable
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => navigateChannel(1)}
              className="w-9 h-6 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 transition"
              aria-label="Próximo canal"
              data-focusable
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-widest text-white/50">canal</div>
            <div className="text-base font-semibold">{canal?.name || "—"}</div>
          </div>

          {/* Pills */}
          <nav className="ml-6 flex items-center gap-2">
            <button
              onClick={onBackHome}
              className="px-3 h-7 rounded-full flex items-center gap-1.5 text-[11px] transition border bg-white/6 border-white/10 text-white/85 hover:bg-white/15 hover:text-white"
              aria-label="Voltar para Home"
              data-focusable
            >
              <ArrowLeft size={12} />
              voltar
            </button>
            <PillBtn active label="ao vivo" icon={<Radio size={12} />} onClick={seekLive} />
            <PillBtn label="chat" icon={<MessageSquare size={12} />} onClick={() => setChatOpen(!chatOpen)} />
            <PillBtn label="karaoke" icon={<Mic size={12} />} onClick={() => setKaraokeEnabled(!karaokeEnabled)} />
            <PillBtn label="músicas tocadas" icon={<ListMusic size={12} />} onClick={() => setGradeOpen(false)} />
          </nav>
        </div>

        {/* Channel logo (canto superior direito) */}
        <div className="flex items-center gap-3">
          {canal?.logo_url && (
            <img
              src={canal.logo_url}
              alt=""
              className="h-16 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            />
          )}
          {/* Avatar do usuário */}
          {user && (
            <button
              onClick={() => setWatchProfileOpen(!watchProfileOpen)}
              className="w-10 h-10 rounded-full overflow-hidden border-2 hover:scale-105 transition"
              style={{ borderColor: "rgba(255,255,255,0.4)" }}
              data-focusable
              aria-label="Perfil"
            >
              <img src={profileAvatar || "/avatars/usr-default.png"} alt="" className="w-full h-full object-cover" />
            </button>
          )}
        </div>
      </header>

      {/* ============== CENTER STAGE ============== */}
      <main className="absolute inset-0 flex items-center justify-center pt-28 pb-40">
        <div className="relative flex items-center gap-8 max-w-[1400px] w-full px-8">

          {/* HISTORY CAROUSEL — atrás e à esquerda, navegável pelo mouse */}
          <div
            ref={carouselRef}
            onMouseMove={handleCarouselMouseMove}
            onMouseLeave={() => setActiveIndex(0)}
            onWheel={handleCarouselWheel}
            className="relative flex-1 h-[420px] cursor-ew-resize"
            style={{ perspective: "1200px" }}
            aria-label="Histórico de músicas — mova o mouse para navegar"
          >
            {/* Dica visual da zona de navegação */}
            <div className="absolute left-0 top-0 bottom-0 w-24 pointer-events-none bg-gradient-to-r from-white/[0.04] to-transparent" />
            <div className="absolute inset-0 flex items-center justify-end pr-4">
              {history.slice(0, CAROUSEL_VISIBLE).map((t, i) => {
                // depth relativa ao activeIndex: 0 = destacada (na frente)
                const depth = i - activeIndex;
                const abs = Math.abs(depth);
                const scale = 1 - Math.min(abs, 5) * 0.055;
                const translateX = -depth * 72;
                // itens escondidos "atrás" do índice ativo têm opacidade menor
                const opacity = depth < 0 ? 0 : Math.max(0, 0.95 - abs * 0.16);
                const blur = depth === 0 ? 0 : Math.min(abs * 1.4, 6);
                const gray = depth === 0 ? 0 : Math.min(70, 25 + abs * 12);
                const isActive = depth === 0;
                return (
                  <div
                    key={`${carKey}-${i}-${t.musica}-${t.artista}`}
                    className="absolute right-0 rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                      width: isActive ? 280 : 240,
                      height: isActive ? 280 : 240,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity,
                      filter: `blur(${blur}px) grayscale(${gray}%)`,
                      background: "#111",
                      zIndex: 20 - abs,
                      transition: "transform 500ms cubic-bezier(.22,1,.36,1), opacity 400ms, filter 400ms, width 400ms, height 400ms",
                      animation: (i === 0 && activeIndex === 0) ? "audioHistIn 700ms cubic-bezier(.22,1,.36,1)" : undefined,
                      boxShadow: isActive ? "0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)" : undefined,
                    }}
                  >
                    {/* Background da capa */}
                    {t.capa ? (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${t.capa})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(ellipse at 30% 20%, #2f2f38 0%, #0d0d12 70%)" }}>
                        <Disc3 size={isActive ? 96 : 72} className="text-white/15" strokeWidth={1.2} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                    <div className="absolute top-3 left-3 text-[11px] px-2 py-0.5 rounded-md bg-black/60 text-white/85">
                      {hhmm(t.horario)}
                    </div>
                    {isActive && (
                      <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-md bg-white/15 backdrop-blur-md border border-white/20 text-white uppercase tracking-widest">
                        #{i + 1}
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="text-[10px] uppercase tracking-widest text-white/60">tocou</div>
                      <div className="text-sm font-bold leading-tight truncate">{t.artista}</div>
                      <div className="text-[11px] text-white/70 truncate">{t.musica}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Indicador de posição do carrossel */}
            {history.length > 1 && (
              <div className="absolute bottom-2 left-4 right-16 flex items-center gap-1 pointer-events-none">
                {Array.from({ length: Math.min(history.length, CAROUSEL_VISIBLE) }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[2px] flex-1 rounded-full transition-all"
                    style={{ background: i === activeIndex ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)" }}
                  />
                ))}
              </div>
            )}
          </div>


          {/* NOW PLAYING CARD */}
          <div
            className="relative rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.7)] flex-shrink-0"
            style={{ width: 460, height: 480, background: gradient }}
            data-focusable
          >
            {/* foto locutor */}
            {locutorFoto ? (
              <img
                src={locutorFoto}
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-top mix-blend-luminosity opacity-95"
                style={{ maskImage: "linear-gradient(180deg, #000 55%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 55%, transparent 100%)" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-start justify-center pt-10 pointer-events-none">
                <Music2 size={140} className="text-white/10" strokeWidth={1} />
              </div>
            )}
            {/* overlay gradient para leitura */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />

            {/* badge NO AR */}
            <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-[11px] font-medium bg-black/55 backdrop-blur-md border border-white/10">
              no ar
            </div>
            {/* like */}
            <button
              onClick={onToggleLike}
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-black/45 hover:bg-black/70 border border-white/10 transition"
              data-focusable
              aria-label="Curtir"
            >
              <Heart size={18} fill={liked ? "#ff3355" : "none"} stroke={liked ? "#ff3355" : "white"} />
            </button>

            {/* bottom info */}
            <div className="absolute bottom-4 left-5 right-5" style={{ color: contrast?.textColor || "#fff", textShadow: contrast?.textShadow }}>
              <div className="text-[11px] uppercase tracking-widest opacity-80">no ar</div>
              <div className="text-2xl font-bold leading-tight">{currentProg?.nome || canal?.name || "—"}</div>
              <div className="text-[12px] opacity-80 mt-0.5">
                {currentProg ? `${hhmm(currentProg.horario_inicio)}/${hhmm(currentProg.horario_fim)}` : ""}
              </div>
              {/* progress bar */}
              <div className="mt-3 h-[3px] w-full rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-white transition-all duration-700" style={{ width: `${progPct}%` }} />
              </div>
              {/* música atual + progresso */}
              {musicData?.titulo && (
                <div className="mt-3">
                  <div className="text-[12px] opacity-85 truncate">
                    ♫ {musicData.titulo}{musicData.artista ? ` — ${musicData.artista}` : ""}
                  </div>
                  <div className="mt-2 relative group/track">
                    <div className="h-[3px] w-full rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full bg-white/95"
                        style={{
                          width: `${trackDur > 0 ? (trackDisplay / trackDur) * 100 : 0}%`,
                          transition: trackDrag != null ? "none" : "width 300ms linear",
                        }}
                      />
                    </div>
                    {trackDur > 0 && (
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, Math.floor(trackDur))}
                        step={1}
                        value={Math.min(Math.floor(trackDur), Math.floor(trackDisplay))}
                        onChange={(e) => setTrackDrag(Number(e.target.value))}
                        onMouseUp={commitTrackDrag}
                        onTouchEnd={commitTrackDrag}
                        onPointerUp={commitTrackDrag}
                        onKeyUp={commitTrackDrag}
                        onBlur={commitTrackDrag}
                        className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer"
                        aria-label="Avançar/retroceder na música"
                      />
                    )}
                    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/60">
                      <span>{fmtMS(trackDisplay)}</span>
                      <span>{trackDur > 0 ? fmtMS(trackDur) : "--:--"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* UP NEXT */}
          <div className="flex-1 pl-4">
            <div className="max-w-[220px]">
              <div className="text-[11px] uppercase tracking-widest text-white/50">a seguir</div>
              <div className="text-lg font-semibold leading-snug mt-1">{nextProg?.nome || "—"}</div>
              {nextProg && (
                <div className="text-xs text-white/60 mt-1">
                  {hhmm(nextProg.horario_inicio)}/{hhmm(nextProg.horario_fim)}
                </div>
              )}
              <button
                onClick={() => setGradeOpen(true)}
                className="mt-4 w-10 h-10 rounded-full flex items-center justify-center border border-white/25 hover:bg-white/10 transition"
                aria-label="Ver grade"
                data-focusable
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ============== BOTTOM — TIMESHIFT + PLAY ============== */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 px-8 pb-6">
        {/* live pill com rewind interativo no hover (à direita) */}
        <div className="flex justify-end mb-2">
          <div className="group relative flex items-center">
            {/* Slider de rewind (aparece no hover) */}
            <div
              className="flex items-center gap-2 mr-2 pr-3 pl-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/10 opacity-0 pointer-events-none translate-x-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 transition-all duration-200"
              aria-label="Retroceder até 30 minutos"
            >
              <Rewind size={12} className="text-white/80" />
              <input
                type="range"
                min={0}
                max={TIMESHIFT_WINDOW}
                step={1}
                value={dragVal ?? Math.round(TIMESHIFT_WINDOW - ts.offset)}
                onChange={(e) => setDragVal(Number(e.target.value))}
                onMouseUp={commitDrag}
                onTouchEnd={commitDrag}
                onPointerUp={commitDrag}
                onKeyUp={commitDrag}
                className="w-40 h-1 accent-white cursor-ew-resize"
              />
              <span className="text-[10px] tabular-nums text-white/80 min-w-[46px] text-right">
                {(() => {
                  const off = dragVal != null ? TIMESHIFT_WINDOW - dragVal : ts.offset;
                  return off > 1
                    ? `-${Math.floor(off / 60)}:${String(Math.round(off % 60)).padStart(2, "0")}`
                    : "ao vivo";
                })()}
              </span>
            </div>
            <button
              onClick={seekLive}
              className="px-3 py-1 rounded-full text-[11px] bg-white/10 hover:bg-white/20 border border-white/10 flex items-center gap-1.5 transition"
              aria-label="Voltar ao vivo"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${ts.offset > 1 ? "bg-white/40" : "bg-red-500 animate-pulse"}`} />
              {ts.offset > 1 ? "voltar ao vivo" : "ao vivo"}
            </button>
          </div>
        </div>

        {/* timeshift bar (janela fixa 5 min) */}
        <div className="relative">
          <div className="h-1 rounded-full bg-white/12 overflow-hidden">
            <div
              className="h-full bg-white/85 transition-all duration-500"
              style={{ width: `${(1 - (dragVal != null ? TIMESHIFT_WINDOW - dragVal : ts.offset) / TIMESHIFT_WINDOW) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={TIMESHIFT_WINDOW}
            step={1}
            value={dragVal ?? Math.round(TIMESHIFT_WINDOW - ts.offset)}
            onChange={(e) => setDragVal(Number(e.target.value))}
            onMouseUp={commitDrag}
            onTouchEnd={commitDrag}
            onPointerUp={commitDrag}
            onKeyUp={commitDrag}
            className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer"
            aria-label="Voltar até 30 minutos"
          />
          <div className="mt-1 flex justify-between text-[10px] text-white/45">
            <span>-5min</span>
            <span>
              {ts.offset > 1 ? `-${Math.floor(ts.offset / 60)}:${String(Math.round(ts.offset % 60)).padStart(2, "0")}` : "AO VIVO"}
            </span>
            <span>disponível: -{Math.round(ts.back)}s</span>
          </div>
        </div>

        {/* play row */}
        <div className="mt-4 flex items-center justify-between">
          {/* volume */}
          <div
            className="relative flex items-center gap-2"
            onMouseEnter={() => setVolHover(true)}
            onMouseLeave={() => setVolHover(false)}
          >
            <button
              onClick={() => onSetMuted(!muted)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 transition"
              data-focusable
              aria-label="Volume"
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div
              className="overflow-hidden transition-all"
              style={{ width: volHover ? 120 : 0 }}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(e) => { const v = Number(e.target.value); onSetVolume(v); if (v > 0 && muted) onSetMuted(false); }}
                className="w-28 accent-white"
              />
            </div>
          </div>

          {/* play/pause central */}
          <button
            onClick={onTogglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-95 transition shadow-[0_10px_30px_rgba(255,255,255,0.15)]"
            aria-label={playing ? "Pausar" : "Reproduzir"}
            data-focusable
          >
            {buffering ? <ElegantLoader size={24} /> : playing ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-0.5" />}
          </button>

          {/* Help + logo */}
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 transition"
                aria-label="Ajuda"
                data-focusable
              >
                <HelpCircle size={16} />
              </button>
              <div className="absolute bottom-full right-0 mb-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition w-64 p-4 rounded-xl bg-black/95 border border-white/10 text-[11px] leading-relaxed text-white/85 shadow-2xl">
                <div className="text-white font-semibold mb-2">Atalhos</div>
                <div>Use as setas ← → ↑ ↓ para navegar entre os botões e cards, Enter para selecionar, Esc para voltar.</div>
              </div>
            </div>
            <img
              src="/nexo-player-logo.png"
              alt="Nexo Player"
              className="h-6 opacity-80"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        </div>
      </footer>

      {/* Chat side panel */}
      {chatOpen && (
        <Suspense fallback={null}>
          <PlayerChat channelId={canal?.id || "default"} onClose={() => setChatOpen(false)} shopOpen={false} />
        </Suspense>
      )}

      {/* Karaoke */}
      {karaokeEnabled && playing && (
        <Suspense fallback={null}>
          <KaraokeOverlay
            artist={musicData?.artista}
            title={musicData?.titulo}
            audioElement={audioRef.current}
            visible={karaokeEnabled}
            duration={musicData?.duracao}
            onLyricsNotFound={() => {}}
            onLyricsFound={() => {}}
          />
        </Suspense>
      )}

      {/* Grade */}
      {gradeOpen && (
        <Suspense fallback={<div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/85"><ElegantLoader size={40} /></div>}>
          <PlayerGradeDialog programas={programas} onClose={() => setGradeOpen(false)} />
        </Suspense>
      )}

      {/* Profile popup */}
      {watchProfileOpen && user && (
        <Suspense fallback={null}>
          <WatchProfilePopup
            userId={user.id}
            userName={userDisplayName}
            avatarUrl={profileAvatar}
            radioName={empresaNome || undefined}
            onClose={() => setWatchProfileOpen(false)}
            onEditProfile={undefined}
            onLogout={async () => { await signOut(); window.location.href = "/"; }}
          />
        </Suspense>
      )}

      <style>{`
        @keyframes audioHistIn {
          from { transform: translateX(140px) scale(1.08); opacity: 0; filter: blur(6px) grayscale(0%); }
          to   { transform: translateX(0) scale(1);        opacity: 0.85; filter: blur(0) grayscale(60%); }
        }
      `}</style>
    </div>
  );
}

function PillBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-7 rounded-full flex items-center gap-1.5 text-[11px] transition border ${active ? "bg-white/15 border-white/25 text-white" : "bg-white/6 border-white/10 text-white/75 hover:bg-white/12 hover:text-white"}`}
      data-focusable
    >
      {icon}
      {label}
    </button>
  );
}

function BgFadeLayer({ gradient, initialOpacity }: { gradient: string; initialOpacity: number }) {
  const [op, setOp] = useState(initialOpacity);
  useEffect(() => {
    if (initialOpacity >= 1) return;
    const id = requestAnimationFrame(() => setOp(1));
    return () => cancelAnimationFrame(id);
  }, [initialOpacity]);
  return (
    <div
      className="absolute inset-0"
      style={{
        background: gradient,
        opacity: op,
        transition: "opacity 1200ms ease-in-out",
      }}
    />
  );
}

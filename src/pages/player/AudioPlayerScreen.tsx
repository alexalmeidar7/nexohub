import { useEffect, useMemo, useRef, useState, useCallback, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Rewind, Heart, Plus, MessageSquare, Mic, ListMusic, HelpCircle, Play, Pause, VolumeX, Volume2, Radio, Disc3, Music2, Sparkles, BarChart3, X, Check, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import nexoPlayerLogo from "@/assets/nexo-player-logo.png.asset.json";

import { useCoverPalette, getPaletteContrast } from "@/lib/coverPalette";
import { fetchArtistImageCached, getArtistImageSync } from "@/lib/artistImageCache";
import {
  isLocutorImageCached,
  markLocutorImageLoaded,
  preloadLocutorImage,
  preloadLocutorImages,
} from "@/lib/locutorImageCache";
import ElegantLoader from "@/components/player/ElegantLoader";
import PlayerSlugBadge from "@/components/player/PlayerSlugBadge";
import DjModeLayer from "@/components/player/DjModeLayer";
import { toast } from "sonner";

const PlayerChat = lazy(() => import("@/components/PlayerChat"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
const InlineKaraoke = lazy(() => import("@/components/player/InlineKaraoke"));
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
  userEmail?: string | null;
  signOut: () => Promise<void>;
  effectiveUserId: string | null;
  radioUserId?: string | null;
  isPublicMode: boolean;
  userSlug: string | null | undefined;
  onBackHome: () => void;
  onEditProfile?: () => void;
  onSwitchProfile?: () => void;
  onAvatarChange?: (url: string) => void;
  isVideoChannel?: boolean;
}

interface HistoryTrack {
  musica: string;
  artista: string;
  horario: string;
  capa?: string;
}

const HIST_MAX = 50;

function sameHistoryTrack(a?: Pick<HistoryTrack, "artista" | "musica"> | null, b?: Pick<HistoryTrack, "artista" | "musica"> | null) {
  return !!a && !!b
    && (a.artista || "").trim().toLowerCase() === (b.artista || "").trim().toLowerCase()
    && (a.musica || "").trim().toLowerCase() === (b.musica || "").trim().toLowerCase();
}

/**
 * Slider de volume com estado local + rAF throttling.
 * Evita re-render do player inteiro a cada movimento do drag
 * e usa CSS var (--vol) para atualizar o fill sem reflow do style inline.
 */
function SmoothVolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState<number>(value);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  // Sincroniza valor externo quando não está arrastando
  useEffect(() => {
    if (!draggingRef.current) setLocal(value);
  }, [value]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current != null) {
      const v = pendingRef.current;
      pendingRef.current = null;
      onChange(v);
    }
  }, [onChange]);

  const schedule = useCallback((v: number) => {
    pendingRef.current = v;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setLocal(v);
    schedule(v);
  }, [schedule]);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    if (pendingRef.current != null) {
      const v = pendingRef.current;
      pendingRef.current = null;
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      onChange(v);
    }
  }, [onChange]);

  const startDrag = useCallback(() => { draggingRef.current = true; }, []);

  return (
    <>
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        onChange={handleInput}
        onPointerDown={startDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={startDrag}
        onKeyUp={endDrag}
        onBlur={endDrag}
        aria-label="Volume"
        className="nexo-volume-slider"
        style={{ width: 96, ["--vol" as any]: `${local}%` }}
      />
      <span className="text-[10px] font-semibold tabular-nums tracking-wider text-white/70 w-6 text-right select-none">
        {local}
      </span>
    </>
  );
}


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
    user, profileAvatar, userDisplayName, userEmail, signOut,
    effectiveUserId, radioUserId,
    userSlug,
    onBackHome,
    onEditProfile, onSwitchProfile, onAvatarChange,
    isVideoChannel = false,
  } = props;

  // ---- Transição de saída ao voltar para Home (com fade-out do áudio/vídeo) ----
  const [exiting, setExiting] = useState(false);
  const handleBackHome = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    const media: HTMLMediaElement | null = (videoRef.current as HTMLMediaElement | null) || (audioRef.current as HTMLMediaElement | null);
    const FADE_MS = 600;
    if (media && !media.paused) {
      const startVol = media.volume;
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / FADE_MS);
        try { media.volume = Math.max(0, startVol * (1 - p)); } catch {}
        if (p < 1) requestAnimationFrame(step);
        else {
          try { media.pause(); media.volume = startVol; } catch {}
        }
      };
      requestAnimationFrame(step);
    }
    setTimeout(() => onBackHome(), FADE_MS);
  }, [exiting, onBackHome, audioRef, videoRef]);


  // ---- Curtir PROGRAMA (independente do like da música) ----
  const programLikeStorageKey = `program_likes_${effectiveUserId || "anon"}`;
  const currentProgId = currentProg?.id ? String(currentProg.id) : null;
  const [programLiked, setProgramLiked] = useState<boolean>(false);
  const [playedListOpen, setPlayedListOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  // Auto-hide controls (video channel): fade out after 3s of inactivity
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  useEffect(() => {
    if (!isVideoChannel) { setControlsVisible(true); return; }
    let t: number | undefined;
    const show = () => {
      setControlsVisible(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    const evs: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointermove"];
    evs.forEach(e => window.addEventListener(e, show, { passive: true }));
    return () => {
      if (t) window.clearTimeout(t);
      evs.forEach(e => window.removeEventListener(e, show));
    };
  }, [isVideoChannel]);
  const controlsStyle: React.CSSProperties = {
    opacity: controlsVisible ? 1 : 0,
    transform: controlsVisible ? "translateY(0)" : undefined,
    transition: "opacity 450ms ease, transform 450ms ease",
    pointerEvents: controlsVisible ? "auto" : "none",
  };
  // Animação de entrada: carrosséis laterais deslizam para fora "de trás" do card central
  const [entered, setEntered] = useState<boolean>(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const sideEnterStyle = (side: "left" | "right"): React.CSSProperties => ({
    transform: entered
      ? "translateX(0) scale(1)"
      : `translateX(${side === "left" ? "40%" : "-40%"}) scale(0.7)`,
    opacity: entered ? 1 : 0,
    transition:
      "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 500ms ease-out",
    willChange: "transform, opacity",
  });

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn("[fullscreen] toggle failed", e);
    }
  }, []);
  useEffect(() => {
    if (!currentProgId) { setProgramLiked(false); return; }
    try {
      const raw = localStorage.getItem(programLikeStorageKey);
      const set: string[] = raw ? JSON.parse(raw) : [];
      setProgramLiked(Array.isArray(set) && set.includes(currentProgId));
    } catch { setProgramLiked(false); }
  }, [currentProgId, programLikeStorageKey]);
  const toggleProgramLike = useCallback(() => {
    if (!currentProgId) return;
    try {
      const raw = localStorage.getItem(programLikeStorageKey);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const has = arr.includes(currentProgId);
      const next = has ? arr.filter((x) => x !== currentProgId) : [...arr, currentProgId];
      localStorage.setItem(programLikeStorageKey, JSON.stringify(next));
      setProgramLiked(!has);
    } catch {}
  }, [currentProgId, programLikeStorageKey]);

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

  // ---- Estado de carregamento/erro da foto do locutor ----
  // Só reseta quando a URL da foto REALMENTE muda (troca de programa/apresentador),
  // não a cada troca de música. Se a URL já foi carregada antes, mantém "loaded".
  const loadedLocutorUrlRef = useRef<string | null>(null);
  const [locutorImgState, setLocutorImgState] = useState<"loading" | "loaded" | "error">(() => {
    if (!locutorFoto) return "error";
    return isLocutorImageCached(locutorFoto) ? "loaded" : "loading";
  });
  useEffect(() => {
    if (!locutorFoto) {
      loadedLocutorUrlRef.current = null;
      setLocutorImgState("error");
      return;
    }
    if (loadedLocutorUrlRef.current === locutorFoto || isLocutorImageCached(locutorFoto)) {
      loadedLocutorUrlRef.current = locutorFoto;
      setLocutorImgState("loaded");
      return;
    }
    setLocutorImgState("loading");
    // Preload em background — se resolver antes do <img> montar, o cache do
    // browser já entrega instantaneamente e evita flicker do skeleton.
    let cancelled = false;
    preloadLocutorImage(locutorFoto).then((ok) => {
      if (cancelled) return;
      if (ok) {
        loadedLocutorUrlRef.current = locutorFoto;
        setLocutorImgState("loaded");
      }
    });
    return () => { cancelled = true; };
  }, [locutorFoto]);

  // Pré-carrega em background as fotos de TODOS os apresentadores + capas de
  // programas para que a troca entre programas seja instantânea.
  useEffect(() => {
    const urls: Array<string | null | undefined> = [];
    apresentadores?.forEach((a) => urls.push(a?.foto));
    programas?.forEach((p) => { urls.push(p?.capa); urls.push(p?.thumb); });
    if (urls.length) preloadLocutorImages(urls);
  }, [apresentadores, programas]);

  // Preload prioritário do PRÓXIMO programa: assim que a grade indica quem entra
  // a seguir, já garantimos que a foto do locutor e a capa/thumb estejam em cache
  // antes da troca — sem skeleton visível no handoff.
  useEffect(() => {
    if (!nextProg) return;
    const nextApresentador = nextProg.apresentador_id
      ? apresentadores?.find((a) => a.id === nextProg.apresentador_id)
      : null;
    const priority = [
      nextApresentador?.foto,
      nextProg?.capa,
      nextProg?.thumb,
    ].filter(Boolean) as string[];
    // Dispara um preload individual (alta prioridade) para cada URL crítica.
    priority.forEach((url) => { void preloadLocutorImage(url); });
  }, [nextProg, apresentadores]);

  const apresentadorNome: string = apresentador?.nome || currentProg?.nome || "";
  const locutorIniciais = apresentadorNome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "•";

  // ---- MODO DJ (toggle manual, disponível no canal de áudio) ----
  // Estado persistido em localStorage para lembrar preferência do usuário.
  const [djModeOn, setDjModeOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("nexohub_dj_mode") === "1";
    } catch {
      return false;
    }
  });
  const [djSensitivity, setDjSensitivity] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("nexohub_dj_sensitivity");
      const v = raw != null ? parseFloat(raw) : NaN;
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    } catch {
      return 0.5;
    }
  });
  const [djPanelOpen, setDjPanelOpen] = useState<boolean>(false);
  useEffect(() => {
    try {
      localStorage.setItem("nexohub_dj_mode", djModeOn ? "1" : "0");
    } catch {}
  }, [djModeOn]);
  useEffect(() => {
    try {
      localStorage.setItem("nexohub_dj_sensitivity", String(djSensitivity));
    } catch {}
  }, [djSensitivity]);
  const djModeActive = !isVideoChannel && djModeOn;

  const [resolvedMusicCover, setResolvedMusicCover] = useState<string>(musicData?.capa || "");

  // ---- Background dinâmico ----
  // Preferência: capa da música (Deezer/artista).
  // Fallback: paleta derivada da imagem do "NO AR" (foto do apresentador / capa do programa).
  const musicCover: string | null = musicData?.capa || resolvedMusicCover || null;
  const onAirImage: string | null = apresentador?.foto || currentProg?.thumb || currentProg?.capa || null;
  const musicPalette = useCoverPalette(musicCover);
  const onAirPalette = useCoverPalette(!musicCover ? onAirImage : null);
  const activePalette = musicCover ? musicPalette : onAirPalette;
  const musicGradient = activePalette
    ? `radial-gradient(ellipse at 20% 20%, ${activePalette.primary}cc 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, ${activePalette.secondary}cc 0%, transparent 55%), linear-gradient(135deg, ${activePalette.primary} 0%, ${activePalette.secondary} 100%)`
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
  // Cache de imagens já decodificadas (warm cache) para crossfade instantâneo
  const decodedCoversRef = useRef<Set<string>>(new Set());
  const warmCover = (url?: string | null) => {
    if (!url) return;
    if (decodedCoversRef.current.has(url)) return;
    decodedCoversRef.current.add(url);
    try {
      const img = new Image();
      img.decoding = "async";
      (img as any).fetchPriority = "high";
      img.src = url;
      if ((img as any).decode) {
        (img as any).decode().catch(() => {});
      }
    } catch {}
  };
  const fetchCover = async (artista: string, musica: string): Promise<string | undefined> => {
    const key = `${(artista || "").toLowerCase()}|${(musica || "").toLowerCase()}`;
    if (!key.trim() || key === "|") return undefined;
    const cached = coverCacheRef.current.get(key);
    if (cached !== undefined) {
      if (cached) warmCover(cached);
      return cached || undefined;
    }
    try {
      const q = encodeURIComponent(`${artista} ${musica}`.trim());
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4000);
      const r = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`, { signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!r.ok) throw new Error("itunes fail");
      const j = await r.json();
      let url = j?.results?.[0]?.artworkUrl100?.replace("100x100", "600x600") || "";
      if (!url) {
        url = await fetchArtistImageCached(artista) || "";
      }
      coverCacheRef.current.set(key, url);
      if (url) warmCover(url);
      return url || undefined;
    } catch {
      const fallback = getArtistImageSync(artista) || await fetchArtistImageCached(artista) || "";
      coverCacheRef.current.set(key, fallback);
      if (fallback) warmCover(fallback);
      return fallback || undefined;
    }
  };

  const currentHistoryTrack = useCallback((cover?: string): HistoryTrack | null => {
    const artista = String(musicData?.artista || "").trim();
    const musica = String(musicData?.titulo || "").trim();
    const lowerTitle = musica.toLowerCase();
    if (!artista || !musica || lowerTitle === "sem título" || lowerTitle === "sem titulo") return null;
    return {
      artista,
      musica,
      horario: musicData?.horario || hhmm(new Date()),
      capa: cover || musicData?.capa || undefined,
    };
  }, [musicData?.artista, musicData?.titulo, musicData?.horario, musicData?.capa]);

  const ensureCurrentAtFront = useCallback((tracks: HistoryTrack[], cover?: string): HistoryTrack[] => {
    const current = currentHistoryTrack(cover);
    if (!current) return tracks;
    const existingCurrent = tracks.find((t) => sameHistoryTrack(t, current));
    const mergedCurrent = { ...current, horario: existingCurrent?.horario || current.horario, capa: current.capa || existingCurrent?.capa };
    return [mergedCurrent, ...tracks.filter((t) => !sameHistoryTrack(t, current))].slice(0, HIST_MAX);
  }, [currentHistoryTrack]);

  useEffect(() => {
    let cancelled = false;
    const artista = String(musicData?.artista || "").trim();
    const musica = String(musicData?.titulo || "").trim();

    if (!artista || !musica || musica.toLowerCase() === "sem título" || musica.toLowerCase() === "sem titulo") {
      setResolvedMusicCover("");
      return;
    }

    const key = `${artista.toLowerCase()}|${musica.toLowerCase()}`;

    // FIX (bug capa travada no canal de áudio):
    // Antes: quando `musicData.capa` vinha preenchido pelo XML, confiávamos nele
    // como autoritativo (setávamos resolvedMusicCover, gravávamos no
    // coverCacheRef e pulávamos o fetchCover). Muitos XMLs de rádio, porém,
    // repetem a MESMA URL de capa a cada faixa (ou mantêm a URL antiga por
    // segundos após a troca), então a capa "tocando agora" ficava travada em
    // uma imagem só. Agora tratamos `musicData.capa` apenas como *placeholder*
    // visual imediato e SEMPRE disparamos o fetchCover (iTunes/Deezer) na
    // troca de música — o resultado do fetch sobrescreve o placeholder assim
    // que chega. Também não gravamos mais o placeholder em coverCacheRef para
    // evitar poluir o cache com URLs stale.
    const cached = coverCacheRef.current.get(key);
    if (cached) {
      setResolvedMusicCover(cached);
      warmCover(cached);
      setHistory((prev) => ensureCurrentAtFront(prev, cached));
    } else if (musicData?.capa) {
      // placeholder imediato — NÃO cacheado como autoritativo
      setResolvedMusicCover(musicData.capa);
      warmCover(musicData.capa);
      setHistory((prev) => ensureCurrentAtFront(prev, musicData.capa));
    } else {
      setResolvedMusicCover("");
      setHistory((prev) => ensureCurrentAtFront(prev, undefined));
    }

    fetchCover(artista, musica).then((cover) => {
      if (cancelled) return;
      if (!cover) return;
      // Só atualiza se ainda estamos na mesma música e o cover é diferente
      // do que já está exibido (evita crossfade desnecessário).
      setResolvedMusicCover((prev) => (prev === cover ? prev : cover));
      setHistory((prev) => ensureCurrentAtFront(prev, cover));
    });

    return () => { cancelled = true; };
  }, [musicData?.titulo, musicData?.artista, musicData?.capa, ensureCurrentAtFront]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!effectiveUserId) return;
      const { data, error } = await supabase
        .from("musicas_tocadas")
        .select("musica, artista, horario")
        .eq("user_id", effectiveUserId)
        .order("created_at", { ascending: false })
        .limit(HIST_MAX * 2);
      if (cancelled) return;
      // Se der erro OU vier vazio, NÃO limpa o histórico existente — evita colapso do carrossel
      // por hiccups transitórios de RLS/rede/realtime.
      if (error || !data || data.length === 0) {
        setHistory((prev) => (prev.length > 0 ? ensureCurrentAtFront(prev) : prev));
        return;
      }
      const { getMusicExceptions, filterOutMusicExceptions } = await import("@/lib/musicExceptions");
      const excs = await getMusicExceptions(effectiveUserId);
      const filtered = filterOutMusicExceptions(excs, data as any[]).slice(0, HIST_MAX);
      // Hidrata com capas já em cache imediatamente
      const withCached = (filtered as HistoryTrack[]).map((t) => ({
        ...t,
        capa:
          coverCacheRef.current.get(`${(t.artista || "").toLowerCase()}|${(t.musica || "").toLowerCase()}`) ||
          getArtistImageSync(t.artista) ||
          undefined,
      }));
      setHistory((prev) => {
        // Evita re-render se o topo não mudou (mesma música + mesmo horário)
        if (
          prev.length === withCached.length &&
          prev[0]?.musica === withCached[0]?.musica &&
          prev[0]?.artista === withCached[0]?.artista &&
          prev[0]?.horario === withCached[0]?.horario
        ) {
          return prev.map((p, idx) => ({ ...p, capa: p.capa || withCached[idx]?.capa }));
        }
        return ensureCurrentAtFront(withCached);
      });
      withCached.forEach((t) => { if (t.capa) warmCover(t.capa); });
      const targets = withCached.slice(0, 24).filter((t) => !t.capa);
      await Promise.all(targets.map(async (t) => {
        const cover = await fetchCover(t.artista, t.musica);
        if (!cancelled && cover) {
          warmCover(cover);
          setHistory((prev) => prev.map((p) => (p.artista === t.artista && p.musica === t.musica ? { ...p, capa: cover } : p)));
        }
      }));
    };
    load();

    // Polling de segurança
    const id = setInterval(load, 30000);

    // Realtime: atualiza instantaneamente ao inserir/atualizar/deletar no histórico do usuário
    const channel = supabase
      .channel(`musicas_tocadas:${effectiveUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "musicas_tocadas", filter: `user_id=eq.${effectiveUserId}` },
        () => { load(); }
      )
      .subscribe();

    // Refetch ao voltar para a aba
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      try { supabase.removeChannel(channel); } catch {}
    };
    // Depende SOMENTE de effectiveUserId — antes reagia a cada troca de música, o que derrubava e recriava
    // a subscription do realtime (janela em que INSERTs podiam ser perdidos) e permitia que um load()
    // concorrente sobrescrevesse o histórico com uma resposta vazia transitória.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  // Quando a música ao vivo muda, apenas garante que ela apareça no topo — sem refazer subscription/load.
  useEffect(() => {
    setHistory((prev) => ensureCurrentAtFront(prev));
  }, [musicData?.titulo, musicData?.artista, musicData?.capa, resolvedMusicCover, ensureCurrentAtFront]);


  // ---- Navegação do carrossel de histórico ----
  // activeIndex = 0 significa "mais recente" (encostada na capa central).
  // Ao mover o mouse mais para a esquerda, avançamos no histórico (índices maiores).
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const CAROUSEL_VISIBLE = 10;
  const maxIndex = Math.max(0, Math.min(history.length, HIST_MAX) - 1);

  useEffect(() => { setActiveIndex(0); }, [history[0]?.musica, history[0]?.artista]);

  const carouselMax = Math.min(maxIndex, CAROUSEL_VISIBLE - 1);
  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1)); // mais recente
  const goNext = () => setActiveIndex((i) => Math.min(carouselMax, i + 1)); // mais antigo
  const handleCarouselWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return;
    const dir = (e.deltaY + e.deltaX) > 0 ? 1 : -1;
    setActiveIndex((i) => Math.max(0, Math.min(carouselMax, i + dir)));
  };

  // Chave para animar entrada de nova música
  const [carKey, setCarKey] = useState(0);
  useEffect(() => { setCarKey((k) => k + 1); }, [history[0]?.musica, history[0]?.artista]);

  // ---- Próximos programas (grade seguinte) ----
  const upcomingProgs = useMemo(() => {
    if (!Array.isArray(programas) || programas.length === 0) return [] as any[];
    const DAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const DAY_FULL = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    const now = new Date();
    const hhmmNow = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    // Excluir programa atual, mas não filtrar por horario_fim (pode não estar setado)
    const currentId = currentProg?.id ? String(currentProg.id) : null;
    // Normaliza (minúscula + sem acento) para comparar com valores como "Segunda", "Terça", "Sábado"
    const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const inDay = (p: any, d: Date) => {
      const dias = Array.isArray(p?.dias_semana) ? p.dias_semana : [];
      if (!dias.length) return true;
      const set = new Set(dias.map(norm));
      return set.has(DAY_SHORT[d.getDay()]) || set.has(DAY_FULL[d.getDay()]);
    };
    const result: any[] = [];
    // Varre os próximos 7 dias para garantir algo sempre
    for (let offset = 0; offset < 7 && result.length < 8; offset++) {
      const d = new Date(now); d.setDate(d.getDate() + offset);
      const list = programas
        .filter((p) => {
          if (!p?.ativo) return false;
          if (!inDay(p, d)) return false;
          if (currentId && String(p.id) === currentId) return false;
          if (offset === 0) {
            const hi = String(p.horario_inicio || "").slice(0, 5);
            if (hi && hi < hhmmNow) return false;
          }
          return true;
        })
        .sort((a, b) => String(a.horario_inicio).localeCompare(String(b.horario_inicio)));
      result.push(...list);
    }
    const seen = new Set<string>();
    return result.filter((p) => {
      const k = String(p?.id || `${p?.nome}-${p?.horario_inicio}`);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
  }, [programas, currentProg]);

  const [upcomingIndex, setUpcomingIndex] = useState(0);
  const UPCOMING_VISIBLE = 8;
  const upcomingMax = Math.max(0, Math.min(upcomingProgs.length, UPCOMING_VISIBLE) - 1);
  useEffect(() => { setUpcomingIndex(0); }, [upcomingProgs[0]?.id]);
  const goPrevUp = () => setUpcomingIndex((i) => Math.max(0, i - 1));
  const goNextUp = () => setUpcomingIndex((i) => Math.min(upcomingMax, i + 1));

  // ---- Navegação da grade no card CENTRAL (NO AR) ----
  // index 0 = programa no ar; >0 avança para os próximos programas mantendo o card focado no centro
  const programNavList = useMemo(() => {
    const arr: any[] = [];
    if (currentProg) arr.push(currentProg);
    (upcomingProgs || []).forEach((p) => { if (p) arr.push(p); });
    return arr;
  }, [currentProg, upcomingProgs]);
  const [progNavIndex, setProgNavIndex] = useState(0);
  useEffect(() => { setProgNavIndex(0); }, [currentProg?.id]);
  const progNavMax = Math.max(0, programNavList.length - 1);
  const focusedProgram = programNavList[progNavIndex] || currentProg;
  const isFocusedOnAir = progNavIndex === 0;
  const goPrevProg = () => setProgNavIndex((i) => Math.max(0, i - 1));
  const goNextProg = () => setProgNavIndex((i) => Math.min(progNavMax, i + 1));

  // Pré-aquece decode das capas dos próximos programas (crossfade instantâneo ao navegar)
  useEffect(() => {
    upcomingProgs.forEach((p) => {
      const url = p?.thumb || p?.capa;
      if (url) warmCover(url);
    });
  }, [upcomingProgs]);

  // ---- Curtidas do histórico (heart por card) ----
  const [historyLikes, setHistoryLikes] = useState<Set<string>>(new Set());
  const likeKey = (artista: string, musica: string) => `${(artista || "").toLowerCase()}||${(musica || "").toLowerCase()}`;
  useEffect(() => {
    let cancelled = false;
    if (!user?.id || history.length === 0) return;
    (async () => {
      let likesQuery: any = supabase
        .from("music_likes")
        .select("artista,titulo")
        .eq("user_id", user.id);
      likesQuery = radioUserId ? likesQuery.eq("radio_user_id", radioUserId) : likesQuery.is("radio_user_id", null);
      const { data } = await likesQuery
        .limit(500);
      if (cancelled || !data) return;
      setHistoryLikes(new Set(data.map((r: any) => likeKey(r.artista, r.titulo))));
    })();
    return () => { cancelled = true; };
  }, [user?.id, radioUserId, history.length]);

  const toggleHistoryLike = async (t: HistoryTrack) => {
    if (!user?.id || !t.artista || !t.musica) return;
    const key = likeKey(t.artista, t.musica);
    const already = historyLikes.has(key);
    // Optimistic UI
    setHistoryLikes((prev) => {
      const next = new Set(prev);
      already ? next.delete(key) : next.add(key);
      return next;
    });
    if (already) {
      let deleteQuery: any = supabase.from("music_likes").delete()
        .eq("user_id", user.id).eq("artista", t.artista).eq("titulo", t.musica);
      deleteQuery = radioUserId ? deleteQuery.eq("radio_user_id", radioUserId) : deleteQuery.is("radio_user_id", null);
      await deleteQuery;
    } else {
      await supabase.from("music_likes").insert({
        user_id: user.id, radio_user_id: radioUserId || null, artista: t.artista, titulo: t.musica, capa: t.capa || "",
      });
    }
  };

  // ---- Segundos atrás para cada faixa do histórico (para permitir voltar no streaming) ----
  const secsAgoFor = (horario?: string) => {
    if (!horario) return Infinity;
    const m = String(horario).match(/(\d{2}):(\d{2})/);
    if (!m) return Infinity;
    const now = new Date();
    const played = new Date(now);
    played.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    if (played.getTime() > now.getTime() + 60_000) played.setDate(played.getDate() - 1);
    return Math.max(0, (now.getTime() - played.getTime()) / 1000);
  };
  const REWIND_LIMIT = 300; // 5 min
  const [preparingRewind, setPreparingRewind] = useState<string | null>(null);
  const preparingRewindTimerRef = useRef<number | null>(null);




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
  // Retorna o elemento de mídia ativo (vídeo para canais de vídeo, áudio caso contrário).
  // Assim a timeshift bar funciona tanto no canal de áudio quanto no de vídeo.
  const getMedia = useCallback((): HTMLMediaElement | null => {
    return isVideoChannel ? (videoRef.current as HTMLMediaElement | null) : (audioRef.current as HTMLMediaElement | null);
  }, [isVideoChannel, audioRef, videoRef]);
  useEffect(() => {
    const tick = () => {
      const a = getMedia();
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
  }, [getMedia, canal?.id, playing]);

  const seekBySeconds = (secsBack: number, opts?: { forcePlay?: boolean }) => {
    const a = getMedia();
    if (!a || !a.buffered.length) return;
    const start = a.buffered.start(0);
    const end = a.buffered.end(a.buffered.length - 1);
    const clampedBack = Math.min(secsBack, Math.min(TIMESHIFT_WINDOW, end - start));
    const target = Math.max(start + 0.5, end - clampedBack);
    const wasPaused = a.paused;
    try { a.currentTime = target; } catch {}
    // Se pediu retomada explícita OU o player estava tocando, garantir playback
    if (opts?.forcePlay || !wasPaused) {
      const resume = () => { void a.play().catch(() => {}); };
      if (a.readyState >= 2) resume();
      else a.addEventListener("canplay", resume, { once: true });
      // Sincroniza o estado do parent se estava pausado e forçamos play
      if (opts?.forcePlay && wasPaused && !playing) onTogglePlay();
    }
  };
  const seekLive = (opts?: { forcePlay?: boolean }) => {
    const a = getMedia();
    if (!a || !a.buffered.length) return;
    const wasPaused = a.paused;
    try { a.currentTime = a.buffered.end(a.buffered.length - 1) - 0.5; } catch {}
    if (opts?.forcePlay || !wasPaused) {
      void a.play().catch(() => {});
      if (opts?.forcePlay && wasPaused && !playing) onTogglePlay();
    }
  };

  // ---- Atalhos de teclado (Space play/pause, ←/→ seek) ----
  const [kbdHint, setKbdHint] = useState<string | null>(null);
  const kbdHintTimerRef = useRef<number | null>(null);
  const flashHint = (msg: string) => {
    setKbdHint(msg);
    if (kbdHintTimerRef.current) clearTimeout(kbdHintTimerRef.current);
    kbdHintTimerRef.current = window.setTimeout(() => setKbdHint(null), 1200) as any;
  };
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t as any).isContentEditable === true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.code) {
        case "Space":
        case "KeyK": {
          e.preventDefault();
          onTogglePlay();
          flashHint(playing ? "pausado" : "reproduzindo");
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const step = e.shiftKey ? 30 : 10;
          seekBySeconds(ts.offset + step);
          flashHint(`− ${step}s`);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const step = e.shiftKey ? 30 : 10;
          const newOffset = Math.max(0, ts.offset - step);
          if (newOffset <= 1) { seekLive(); flashHint("ao vivo"); }
          else { seekBySeconds(newOffset); flashHint(`+ ${step}s`); }
          break;
        }
        case "KeyL":
        case "End": {
          e.preventDefault();
          seekLive();
          flashHint("ao vivo");
          break;
        }
        case "KeyJ": {
          e.preventDefault();
          seekBySeconds(ts.offset + 30);
          flashHint("− 30s");
          break;
        }
        case "KeyM": {
          e.preventDefault();
          onSetMuted(!muted);
          flashHint(muted ? "som ativo" : "sem som");
          break;
        }
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (kbdHintTimerRef.current) clearTimeout(kbdHintTimerRef.current);
    };
  }, [onTogglePlay, onSetMuted, muted, playing, ts.offset]);

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
    <div
      className="relative h-screen w-screen overflow-hidden text-white select-none transition-all duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
      style={{
        background: "#050810",
        fontFamily: "'Lufga', 'Inter', sans-serif",
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(0.97)" : "scale(1)",
        filter: exiting ? "blur(6px)" : "blur(0)",
      }}
    >

      {/* Modo DJ — cobre o background com cores contrastantes piscando no ritmo */}
      <DjModeLayer audioRef={audioRef} active={djModeActive} sensitivity={djSensitivity} coverPalette={activePalette} />

      {/* Background dinâmico da capa da música (crossfade elegante entre trocas) */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ opacity: djModeActive ? 0 : 1, transition: "opacity 300ms ease-out" }}
      >
        {bgLayers.map((l, idx) => (
          <BgFadeLayer key={l.id} gradient={l.g} initialOpacity={idx === 0 ? 1 : 0} />
        ))}
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.55) 100%)", opacity: djModeActive ? 0 : 1, transition: "opacity 300ms ease-out" }} />


      {/* Media elements (owned by parent HLS) */}
      <audio ref={audioRef} muted={muted} preload="none" className="hidden" />
      <video ref={videoRef} className="hidden" muted playsInline />


      {/* Toast de atalho de teclado */}
      {kbdHint && (
        <div
          className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-md border shadow-lg"
          style={{ background: "rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.18)", color: "white" }}
        >
          {kbdHint}
        </div>
      )}


      {/* ============== TOP BAR ============== */}
      {isVideoChannel && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
          style={{
            height: 160,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)",
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 450ms ease",
          }}
        />
      )}
      <header
        className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-8 pt-6"
        style={isVideoChannel ? controlsStyle : undefined}
      >
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
              onClick={handleBackHome}
              className="px-3 h-7 rounded-full flex items-center gap-1.5 text-[11px] transition border bg-white/6 border-white/10 text-white/85 hover:bg-white/15 hover:text-white"
              aria-label="Voltar para Home"
              data-focusable
            >
              <ArrowLeft size={12} />
              voltar
            </button>
            <PillBtn active label="ao vivo" icon={<Radio size={12} />} onClick={() => seekLive()} />
            <InteractivityMenu
              userId={effectiveUserId}
              chatOpen={chatOpen}
              onToggleChat={() => setChatOpen(!chatOpen)}
              karaokeEnabled={karaokeEnabled}
              onToggleKaraoke={() => setKaraokeEnabled(!karaokeEnabled)}
              showKaraoke={!isVideoChannel}
            />
            {!isVideoChannel && (
            <div className="relative">
              <PillBtn
                label="músicas tocadas"
                icon={<ListMusic size={12} />}
                onClick={() => setPlayedListOpen((v) => !v)}
                active={playedListOpen}
              />
              {playedListOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setPlayedListOpen(false)}
                  />
                  <div
                    className="absolute left-0 top-[calc(100%+8px)] z-[61] w-[380px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/15 bg-black/80 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] p-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white/50 border-b border-white/10 mb-1 sticky top-0 bg-black/80 backdrop-blur-xl">
                      Últimas {history.length} músicas
                    </div>
                    {history.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[12px] text-white/50">
                        Nenhuma música registrada ainda.
                      </div>
                    ) : (
                      history.map((t, i) => (
                        <div
                          key={`${t.horario}-${i}`}
                          className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/8 transition"
                        >
                          <div className="text-[11px] font-semibold tabular-nums text-white/60 w-11 shrink-0">
                            {(t.horario || "").slice(0, 5)}
                          </div>
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/8 border border-white/10">
                            {t.capa ? (
                              <img
                                src={t.capa}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <Disc3 size={18} className="text-white/25" strokeWidth={1.4} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] text-white font-medium truncate leading-tight" title={t.musica}>
                              {t.musica}
                            </div>
                            <div className="text-[10.5px] uppercase tracking-[0.1em] text-white/55 truncate mt-0.5" title={t.artista}>
                              {t.artista}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
            )}
            <PillBtn
              label={isFullscreen ? "sair fullscreen" : "fullscreen"}
              icon={isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              onClick={toggleFullscreen}
              active={isFullscreen}
            />
            {!isVideoChannel && (
              <div className="relative flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDjModeOn((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-semibold uppercase tracking-[0.14em] border transition-all ${djModeActive ? "animate-pulse" : ""}`}
                  style={
                    djModeActive
                      ? {
                          background: "linear-gradient(90deg, rgba(255,0,212,0.28), rgba(0,229,255,0.28))",
                          borderColor: "rgba(255,255,255,0.35)",
                          color: "#fff",
                          boxShadow: "0 0 18px rgba(255,0,212,0.45), 0 0 32px rgba(0,229,255,0.25)",
                          textShadow: "0 0 8px rgba(255,255,255,0.55)",
                        }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          borderColor: "rgba(255,255,255,0.18)",
                          color: "rgba(255,255,255,0.75)",
                        }
                  }
                  title={djModeActive ? "Modo DJ ligado — clique para desligar" : "Ligar Modo DJ (fundo pisca no ritmo)"}
                  aria-pressed={djModeActive}
                  aria-label={djModeActive ? "Desligar Modo DJ" : "Ligar Modo DJ"}
                >
                  <span aria-hidden style={{ fontSize: 12 }}>🎧</span>
                  modo dj {djModeActive ? "ligado" : "desligado"}
                </button>
                {djModeActive && (
                  <button
                    type="button"
                    onClick={() => setDjPanelOpen((v) => !v)}
                    className="flex items-center justify-center w-7 h-7 rounded-full border transition-all"
                    style={{
                      background: djPanelOpen ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.22)",
                      color: "rgba(255,255,255,0.9)",
                    }}
                    title="Ajustar sensibilidade do Modo DJ"
                    aria-label="Ajustar sensibilidade do Modo DJ"
                    aria-expanded={djPanelOpen}
                  >
                    <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>
                  </button>
                )}
                {djModeActive && djPanelOpen && (
                  <div
                    className="absolute top-full right-0 mt-2 p-3 rounded-xl border backdrop-blur-md z-30"
                    style={{
                      background: "rgba(15,15,20,0.82)",
                      borderColor: "rgba(255,255,255,0.14)",
                      minWidth: 240,
                      boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                    }}
                    role="dialog"
                    aria-label="Sensibilidade do Modo DJ"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/85">Sensibilidade</span>
                      <span className="text-[10.5px] font-mono text-white/70 tabular-nums">
                        {Math.round(djSensitivity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(djSensitivity * 100)}
                      onChange={(e) => setDjSensitivity(parseInt(e.target.value, 10) / 100)}
                      className="w-full accent-fuchsia-400"
                      aria-label="Sensibilidade do Modo DJ"
                    />
                    <div className="flex items-center justify-between mt-1 text-[9.5px] uppercase tracking-[0.14em] text-white/45">
                      <span>Suave</span>
                      <span>Agressivo</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[
                        { label: "Baixa", v: 0.25 },
                        { label: "Média", v: 0.5 },
                        { label: "Alta", v: 0.8 },
                      ].map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setDjSensitivity(p.v)}
                          className="flex-1 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.1em] border transition-colors"
                          style={{
                            background: Math.abs(djSensitivity - p.v) < 0.02 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)",
                            borderColor: "rgba(255,255,255,0.14)",
                            color: "rgba(255,255,255,0.85)",
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-white/55">
                      Aumente para captar batidas fracas; diminua para reagir só aos picos fortes.
                    </p>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Channel logo (canto superior direito) */}
        <div className="flex items-center gap-3">
          {(canal?.background_url || canal?.logo_url) && (
            <img
              src={canal.background_url || canal.logo_url}
              alt=""
              className="h-16 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            />
          )}
          {/* Avatar do usuário — abre o mesmo popup do Home Player */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setWatchProfileOpen(!watchProfileOpen)}
                className="group relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 hover:bg-white/12 border border-white/15 hover:border-white/35 backdrop-blur-xl transition-all duration-300 hover:scale-[1.03] shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
                data-focusable
                aria-label="Abrir perfil"
                aria-expanded={watchProfileOpen}
                title={userDisplayName || "Perfil"}
              >
                <span
                  className="relative w-10 h-10 rounded-full p-[2px]"
                  style={{
                    background: "conic-gradient(from 140deg, #ffffff, rgba(255,255,255,0.25), #ffffff)",
                  }}
                >
                  <span className="absolute inset-0 rounded-full opacity-60 blur-md" style={{ background: "conic-gradient(from 140deg, rgba(255,255,255,0.8), rgba(255,255,255,0.05))" }} />
                  <span className="relative block w-full h-full rounded-full overflow-hidden bg-black">
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-white/90 text-[13px] font-semibold uppercase">
                        {(userDisplayName || "U").trim().charAt(0)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="hidden md:flex flex-col items-start leading-tight max-w-[140px]">
                  <span className="text-[9px] uppercase tracking-[0.18em] text-white/55">perfil</span>
                  <span className="text-[12px] font-semibold text-white truncate max-w-[140px]">
                    {userDisplayName || "Usuário"}
                  </span>
                </span>
                <ChevronDown size={14} className="text-white/70 group-hover:text-white transition-transform duration-300 group-hover:translate-y-0.5" />
              </button>
              {watchProfileOpen && (
                <Suspense fallback={null}>
                  <WatchProfilePopup
                    userId={user.id}
                    userName={userDisplayName}
                    userEmail={userEmail ?? user?.email ?? null}
                    avatarUrl={profileAvatar}
                    radioUserId={radioUserId}
                    radioName={empresaNome || undefined}
                    onClose={() => setWatchProfileOpen(false)}
                    onEditProfile={onEditProfile}
                    onSwitchProfile={onSwitchProfile}
                    onAvatarChange={onAvatarChange}
                    onLogout={async () => {
                      await signOut();
                      const dest = userSlug && !String(userSlug).startsWith(":") ? `/${userSlug}/player` : "/player";
                      window.location.href = dest;
                    }}

                  />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ============== VIDEO FULLSCREEN BACKGROUND ============== */}
      {isVideoChannel && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain z-0 bg-black"
          style={{ objectPosition: "center center" }}
          muted={muted}
          playsInline
          autoPlay={false}
        />
      )}

      {/* ============== CENTER STAGE ============== */}
      <main className={`absolute inset-0 flex items-center justify-center pt-28 pb-40 ${isVideoChannel ? "pointer-events-none z-10" : ""}`}>
        {isVideoChannel ? null : (
        <div className="relative flex items-center gap-8 max-w-[1400px] w-full px-8">

          {/* HISTORY CAROUSEL — navegação por setas e swipe */}
          <div
            ref={carouselRef}
            onWheel={handleCarouselWheel}
            onPointerDown={(e) => {
              // Ignora eventos vindos das setas/botões para não roubar o clique
              if ((e.target as HTMLElement).closest("button")) return;
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeX = String(e.clientX);
              el.dataset.swipeAnchor = String(activeIndex);
              el.dataset.swipeActive = "1";
              try { el.setPointerCapture(e.pointerId); } catch {}
            }}
            onPointerMove={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              if (el.dataset.swipeActive !== "1") return;
              const startX = Number(el.dataset.swipeX || 0);
              const anchor = Number(el.dataset.swipeAnchor || 0);
              const dx = e.clientX - startX;
              const STEP = 90; // px por capa
              const delta = Math.round(-dx / STEP); // arrastar p/ esquerda avança no histórico
              const next = Math.max(0, Math.min(carouselMax, anchor + delta));
              if (next !== activeIndex) setActiveIndex(next);
            }}
            onPointerUp={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeActive = "0";
              try { el.releasePointerCapture(e.pointerId); } catch {}
            }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLDivElement).dataset.swipeActive = "0"; }}

            className="relative flex-1 h-[420px] touch-pan-y select-none cursor-grab active:cursor-grabbing"
            style={{ perspective: "1200px", ...sideEnterStyle("left") }}
            aria-label="Histórico de músicas — arraste ou use as setas para navegar"
          >
            {/* Setas de navegação */}
            {history.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={activeIndex >= carouselMax}
                  aria-label="Música anterior no histórico"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={activeIndex <= 0}
                  aria-label="Próxima música do histórico"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
            {/* Dica visual da zona de navegação */}
            {/* zona de navegação (sem gradiente visual) */}
            <div className="absolute inset-0 flex items-center justify-end pr-4">
              {history.length === 0 && Array.from({ length: 5 }).map((_, i) => {
                const depth = i;
                const scale = 1 - Math.min(depth, 5) * 0.055;
                const translateX = -depth * 72;
                const opacity = Math.max(0, 0.9 - depth * 0.18);
                const size = i === 0 ? 280 : 240;
                return (
                  <div
                    key={`skeleton-hist-${i}`}
                    className="absolute right-0 rounded-[32px] overflow-hidden animate-pulse"
                    style={{
                      width: size,
                      height: size,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity,
                      background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      zIndex: 20 - depth,
                    }}
                  />
                );
              })}
              {history.slice(0, CAROUSEL_VISIBLE).map((t, i) => {

                const isNow = i === 0;
                // depth relativa ao activeIndex: 0 = destacada (na frente)
                // Para a música tocando agora (i=0) forçamos depth=0 visual,
                // garantindo que a capa atual SEMPRE fique na frente das capas
                // das músicas já tocadas, independente da navegação do carrossel.
                const depth = isNow ? 0 : i - activeIndex;
                const abs = Math.abs(depth);
                const scale = 1 - Math.min(abs, 5) * 0.055;
                const translateX = -depth * 72;
                // itens escondidos "atrás" do índice ativo têm opacidade menor
                const opacity = depth < 0 ? 0 : depth === 0 ? 1 : Math.max(0, 0.9 - abs * 0.16);
                const blur = depth === 0 ? 0 : Math.min(abs * 1.4, 6);
                const gray = depth === 0 ? 0 : Math.min(70, 25 + abs * 12);
                const isActive = depth === 0;
                const ago = secsAgoFor(t.horario);
                const canRewind = !isNow && ago > 0 && ago <= REWIND_LIMIT && ts.back >= ago - 2;
                const isExpired = !isNow && ago > REWIND_LIMIT;
                const isLiked = historyLikes.has(likeKey(t.artista, t.musica));
                const rewindKey = `${i}-${t.horario}-${t.musica}`;
                const isPreparing = preparingRewind === rewindKey;
                // A capa "tocando agora" tem o z-index mais alto de todos,
                // acima de qualquer capa histórica (que usa 20 - abs, máx 20).
                const zIndex = isNow ? 40 : 20 - abs;
                return (
                  <div
                    key={`${carKey}-${i}-${t.musica}-${t.artista}`}
                    onClick={canRewind ? () => {
                      setPreparingRewind(rewindKey);
                      if (preparingRewindTimerRef.current) clearTimeout(preparingRewindTimerRef.current);
                      preparingRewindTimerRef.current = window.setTimeout(() => setPreparingRewind(null), 1400) as any;
                      seekBySeconds(ago, { forcePlay: true });
                      toast.success(`Voltando ${Math.round(ago)}s`, {
                        description: `${t.artista} — ${t.musica} · retomando às ${hhmm(t.horario)}`,
                        icon: <Rewind size={16} />,
                        duration: 2600,
                      });
                    } : undefined}
                    role={canRewind ? "button" : undefined}
                    aria-label={canRewind ? `Voltar para ${t.artista} - ${t.musica}` : undefined}
                    aria-busy={isPreparing || undefined}
                    title={undefined}
                    className={`absolute right-0 rounded-[32px] overflow-hidden shadow-2xl group ${canRewind ? "cursor-pointer" : "cursor-default"}`}

                    style={{
                      width: isActive ? 280 : 240,
                      height: isActive ? 280 : 240,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity: isActive ? 1 : (isExpired ? Math.max(0.35, opacity * 0.55) : opacity),
                      filter: `blur(${blur}px) grayscale(${isExpired ? Math.max(gray, 75) : gray}%)`,
                      background: "#111",
                      zIndex,
                      willChange: "transform, opacity, filter",
                      transition:
                        "transform 620ms cubic-bezier(.22,1,.36,1), " +
                        "opacity 520ms cubic-bezier(.4,0,.2,1), " +
                        "filter 520ms cubic-bezier(.4,0,.2,1), " +
                        "width 520ms cubic-bezier(.22,1,.36,1), " +
                        "height 520ms cubic-bezier(.22,1,.36,1), " +
                        "box-shadow 620ms cubic-bezier(.22,1,.36,1)",
                      animation: (isNow && activeIndex === 0) ? "audioHistIn 820ms cubic-bezier(.22,1,.36,1) both" : undefined,
                      boxShadow: isNow
                        ? "0 30px 60px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.55), 0 0 32px rgba(255,255,255,0.18)"
                        : isActive
                          ? "0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)"
                          : undefined,
                    }}
                  >
                    {/* Background da capa */}
                    {isNow ? (
                      <NowCoverCrossfade capa={t.capa} isActive={isActive} />
                    ) : t.capa ? (
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

                    {/* dark bottom gradient para legibilidade do nome */}
                    {isNow && (
                      <div
                        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
                        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.88) 100%)" }}
                      />
                    )}

                    {/* badge TOCANDO AGORA no card ativo + coração para curtir a música atual */}
                    {isNow ? (
                      <>
                        <div className="absolute top-3 right-3 flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full bg-gradient-to-r from-white/95 via-white to-white/95 text-black text-[10px] font-bold uppercase tracking-[0.18em] shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.5)_inset] ring-1 ring-black/5 backdrop-blur-xl">
                          <VolumeEqBars volume={volume} muted={muted} playing={playing} />
                          <span>Tocando agora</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleHistoryLike(t); }}
                          className="absolute top-12 right-3 w-9 h-9 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 transition"
                          aria-label={isLiked ? "Descurtir música" : "Curtir música"}
                          aria-pressed={isLiked}
                          title={isLiked ? "Você curtiu esta música" : "Curtir esta música"}
                        >
                          <Heart size={16} fill={isLiked ? "#ff3355" : "none"} stroke={isLiked ? "#ff3355" : "white"} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleHistoryLike(t); }}
                        className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 transition"
                        aria-label={isLiked ? "Descurtir" : "Curtir"}
                      >
                        <Heart size={16} fill={isLiked ? "#ff3355" : "none"} stroke={isLiked ? "#ff3355" : "white"} />
                      </button>
                    )}

                    {/* Hint de rewind (hover) — some quando preparando */}
                    {canRewind && !isPreparing && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-black/35">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-black text-[11px] font-semibold shadow-lg">
                          <Rewind size={14} />
                          voltar -{Math.round(ago)}s
                        </div>
                      </div>
                    )}

                    {/* Feedback discreto de "preparando rewind" */}
                    {isPreparing && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/45 backdrop-blur-[2px] animate-fade-in">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 text-black text-[11px] font-semibold shadow-lg">
                          <span
                            className="w-3 h-3 rounded-full border-2 border-black/25 border-t-black animate-spin"
                            aria-hidden
                          />
                          preparando
                        </div>
                      </div>
                    )}






                    <div className="absolute top-3 left-3 text-[11px] px-2 py-0.5 rounded-md bg-black/60 text-white/85">
                      {hhmm(t.horario)}
                    </div>
                    <div className="absolute bottom-3 left-3 right-3" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
                      <div className="text-[10px] uppercase tracking-widest text-white/80">{isNow ? "tocando agora" : "tocou"}</div>
                      <div className="text-sm font-bold leading-tight truncate">{t.artista}</div>
                      <div className="text-[11px] text-white/85 truncate">{t.musica}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


          {/* NOW PLAYING CARD + Botão grade */}
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
          {/* Setas de navegação de programas — acima do card, sempre mantendo o programa focado no centro */}
          {programNavList.length > 1 && (
            <div
              className="flex items-center gap-3"
              style={{
                transform: karaokeEnabled ? "translateY(-32px)" : "translateY(0)",
                transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <button
                type="button"
                onClick={goPrevProg}
                disabled={progNavIndex <= 0}
                aria-label="Programa anterior"
                className="w-10 h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                data-focusable
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-[10px] uppercase tracking-widest text-white/75 min-w-[64px] text-center">
                {isFocusedOnAir ? "no ar" : "a seguir"}
              </div>
              <button
                type="button"
                onClick={goNextProg}
                disabled={progNavIndex >= progNavMax}
                aria-label="Próximo programa"
                className="w-10 h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                data-focusable
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
          <div
            style={{
              width: 368,
              height: 384,
              transform: karaokeEnabled ? "translateY(-32px) scale(0.92)" : "translateY(0) scale(1)",
              transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
            data-focusable
          >
            <ProgramShowcaseCard
              program={focusedProgram}
              apresentadores={apresentadores}
              variant={isFocusedOnAir ? "live" : "upcoming"}
              isActive={!isFocusedOnAir}
              radius={40}
              fallbackTitle={canal?.name}
              progressPct={isFocusedOnAir ? progPct : 0}
              liked={isFocusedOnAir ? programLiked : false}
              onToggleLike={isFocusedOnAir ? toggleProgramLike : undefined}
              onImageLoad={(url) => {
                if (!isFocusedOnAir) return;
                loadedLocutorUrlRef.current = url;
                markLocutorImageLoaded(url);
                setLocutorImgState("loaded");
              }}
            />
          </div>

          {/* Botão + centralizado abaixo do card NO AR */}
          <button
            onClick={() => setGradeOpen(true)}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-white/25 hover:bg-white/10 transition"
            style={{
              transform: karaokeEnabled ? "translateY(-32px)" : "translateY(0)",
              transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            aria-label="Ver grade completa de programação"
            title="Grade de programação"
            data-focusable
          >
            <Plus size={20} />
          </button>

          {/* Karaokê inline — desliza suavemente por baixo quando ativado */}
          <div
            style={{
              width: "100%",
              maxHeight: karaokeEnabled ? 360 : 0,
              opacity: karaokeEnabled ? 1 : 0,
              transform: karaokeEnabled ? "translateY(-16px)" : "translateY(24px)",
              transition:
                "max-height 600ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              overflow: "hidden",
              pointerEvents: karaokeEnabled ? "auto" : "none",
            }}
          >
            {karaokeEnabled && (
              <Suspense fallback={null}>
                <InlineKaraoke
                  enabled={karaokeEnabled}
                  artist={musicData?.artista}
                  title={musicData?.titulo}
                  duration={musicData?.duracao}
                  audioElement={audioRef.current}
                  onClose={() => setKaraokeEnabled(false)}

                />
              </Suspense>
            )}
          </div>
          </div>

          {/* UPCOMING PROGRAMS CAROUSEL — mesmo estilo do histórico, do lado direito */}
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeX = String(e.clientX);
              el.dataset.swipeAnchor = String(upcomingIndex);
              el.dataset.swipeActive = "1";
              try { el.setPointerCapture(e.pointerId); } catch {}
            }}
            onPointerMove={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              if (el.dataset.swipeActive !== "1") return;
              const startX = Number(el.dataset.swipeX || 0);
              const anchor = Number(el.dataset.swipeAnchor || 0);
              const dx = e.clientX - startX;
              const STEP = 90;
              const delta = Math.round(-dx / STEP);
              const next = Math.max(0, Math.min(upcomingMax, anchor + delta));
              if (next !== upcomingIndex) setUpcomingIndex(next);
            }}
            onPointerUp={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeActive = "0";
              try { el.releasePointerCapture(e.pointerId); } catch {}
            }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLDivElement).dataset.swipeActive = "0"; }}

            className="relative flex-1 h-[420px] touch-pan-y select-none cursor-grab active:cursor-grabbing"
            style={{ perspective: "1200px", ...sideEnterStyle("right") }}
            aria-label="Próximos programas — arraste ou use as setas para navegar"
          >
            {upcomingProgs.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrevUp}
                  disabled={upcomingIndex <= 0}
                  aria-label="Programa anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={goNextUp}
                  disabled={upcomingIndex >= upcomingMax}
                  aria-label="Próximo programa"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
            <div className="absolute inset-0 flex items-center justify-start pl-4">
              {upcomingProgs.length === 0 && Array.from({ length: 4 }).map((_, i) => {
                const depth = i;
                const scale = 1 - Math.min(depth, 5) * 0.055;
                const translateX = depth * 72;
                const opacity = Math.max(0, 0.9 - depth * 0.18);
                const size = i === 0 ? 280 : 240;
                return (
                  <div
                    key={`skeleton-up-${i}`}
                    className="absolute left-0 rounded-[32px] overflow-hidden animate-pulse"
                    style={{
                      width: size,
                      height: size,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity,
                      background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      zIndex: 20 - depth,
                    }}
                  />
                );
              })}
              {upcomingProgs.slice(0, UPCOMING_VISIBLE).map((p, i) => {
                const depth = i - upcomingIndex;
                const abs = Math.abs(depth);
                const scale = 1 - Math.min(abs, 5) * 0.055;
                const translateX = depth * 72;
                const opacity = depth < 0 ? 0 : depth === 0 ? 1 : Math.max(0, 0.9 - abs * 0.16);
                const blur = depth === 0 ? 0 : Math.min(abs * 1.4, 6);
                const isActive = depth === 0;
                const isFirst = i === 0;
                const cover = p?.thumb || p?.capa || null;
                const size = isActive ? 280 : 240;
                return (
                  <div
                    key={`up-${p?.id || i}`}
                    className="absolute left-0"
                    style={{
                      width: size,
                      height: size,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity,
                      filter: `blur(${blur}px)`,
                      zIndex: 20 - abs,
                      transition: "transform 500ms cubic-bezier(.22,1,.36,1), opacity 400ms, filter 400ms, width 400ms, height 400ms",
                    }}
                  >
                    <ProgramShowcaseCard
                      program={p}
                      apresentadores={apresentadores}
                      variant="upcoming"
                      isActive={isActive}
                      isFirst={isFirst}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </main>

      {/* ============== BOTTOM — TIMESHIFT + PLAY ============== */}
      {isVideoChannel && (
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
          style={{
            height: 200,
            background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0) 100%)",
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 450ms ease",
          }}
        />
      )}
      <footer
        className="absolute bottom-0 left-0 right-0 z-30 px-8 pb-6"
        style={isVideoChannel ? controlsStyle : undefined}
      >
        {/* Timeshift disponível para áudio E vídeo — usa videoRef quando isVideoChannel */}
        <>
        {/* live pill com rewind interativo por arraste (à direita) */}
        <div className="flex justify-end mb-2">
          <div className="relative group/live">
            <button
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const maxBack = Math.max(1, ts.back);
                const MAX_PX = 220;
                const startOffset = ts.offset;
                (e.currentTarget as any)._dragMoved = false;
                (e.currentTarget as any)._onMove = (ev: PointerEvent) => {
                  const dx = Math.min(0, ev.clientX - startX); // apenas para esquerda
                  if (Math.abs(dx) > 4) (e.currentTarget as any)._dragMoved = true;
                  const addBack = Math.min(maxBack, (-dx / MAX_PX) * maxBack);
                  const target = Math.max(0, Math.min(maxBack, startOffset + addBack));
                  setDragVal(TIMESHIFT_WINDOW - target);
                };
                window.addEventListener("pointermove", (e.currentTarget as any)._onMove);
              }}
              onPointerUp={(e) => {
                window.removeEventListener("pointermove", (e.currentTarget as any)._onMove);
                const moved = (e.currentTarget as any)._dragMoved;
                if (moved && dragVal != null) {
                  seekBySeconds(TIMESHIFT_WINDOW - dragVal);
                  setDragVal(null);
                } else {
                  setDragVal(null);
                  seekLive();
                }
              }}
              onPointerCancel={(e) => {
                window.removeEventListener("pointermove", (e.currentTarget as any)._onMove);
                setDragVal(null);
              }}
              className="group px-3 py-1 rounded-full text-[11px] bg-white/10 hover:bg-white/20 border border-white/10 flex items-center gap-1.5 transition-all duration-300 ease-out overflow-hidden cursor-ew-resize select-none touch-none"
              aria-label="Voltar ao vivo (arraste para voltar no tempo)"
            >
              <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${(dragVal != null || ts.offset > 1) ? "bg-white/40" : "bg-red-500 animate-pulse"}`} />
              {(() => {
                if (dragVal != null) {
                  const targetOffset = Math.max(0, TIMESHIFT_WINDOW - dragVal);
                  const mm = Math.floor(targetOffset / 60);
                  const ss = String(Math.round(targetOffset % 60)).padStart(2, "0");
                  const isLive = targetOffset < 1;
                  return (
                    <span key="drag" className="inline-flex items-center gap-1 animate-fade-in tabular-nums">
                      <span>ao vivo</span>
                      {!isLive && <span className="text-white/70">-{mm}:{ss}</span>}
                    </span>
                  );
                }

                return (
                  <span key={ts.offset > 1 ? "back" : "live"} className="inline-block animate-fade-in">
                    {ts.offset > 1 ? "voltar ao vivo" : "ao vivo"}
                  </span>
                );
              })()}
            </button>
            <div className="pointer-events-none absolute right-0 bottom-full mb-2 px-2 py-1 rounded-md bg-black/80 backdrop-blur text-[10px] text-white/90 whitespace-nowrap opacity-0 group-hover/live:opacity-100 transition-opacity duration-200 border border-white/10">
              {"<<"} arraste para voltar no tempo
            </div>
          </div>
        </div>

        {/* timeshift bar (janela fixa 30 min) */}
        {(() => {
          const bufferPct = Math.max(0, Math.min(100, (ts.back / TIMESHIFT_WINDOW) * 100));
          const bufferLeft = 100 - bufferPct; // buffer disponível cresce da direita (AO VIVO) para a esquerda
          const playheadPct = (1 - (dragVal != null ? TIMESHIFT_WINDOW - dragVal : ts.offset) / TIMESHIFT_WINDOW) * 100;
          const fiveMinPct = (1 - (5 * 60) / TIMESHIFT_WINDOW) * 100; // marcador -5min
          return (
        <div className="relative group/timeshift focus-within:scale-[1.01] transition-transform">
          <div
            className="relative h-1 rounded-full bg-white/[0.06] overflow-hidden transition-all duration-200 group-focus-within/timeshift:h-2 group-focus-within/timeshift:bg-white/[0.10] group-focus-within/timeshift:shadow-[0_0_0_2px_var(--nexo-accent,#00BFF0),0_0_14px_var(--nexo-accent,#00BFF0)]"
          >
            {/* Buffer disponível (janela de seek) */}
            <div
              className="absolute top-0 bottom-0 bg-white/20 transition-[left,width] duration-500"
              style={{ left: `${bufferLeft}%`, width: `${bufferPct}%` }}
              aria-hidden
            />
            {/* Playhead / progresso do seek */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/85 transition-all duration-500 group-focus-within/timeshift:bg-[var(--nexo-accent,#00BFF0)]"
              style={{ width: `${playheadPct}%` }}
            />
          </div>
          {/* Marcadores dos limites: -5min e AO VIVO */}
          <div className="pointer-events-none absolute inset-x-0 -top-1 h-4">
            <span
              className="absolute top-0 h-4 w-px bg-white/30"
              style={{ left: `${fiveMinPct}%` }}
              aria-hidden
            />
            <span className="absolute top-0 h-4 w-px bg-[var(--nexo-accent,#00BFF0)]/80 right-0" aria-hidden />
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
            data-tv-focusable
            data-tv-flat
            data-tv-scroll="center"
            data-tv-selected={ts.offset > 1 ? "true" : undefined}
          />
          <div className="mt-1 flex justify-between text-[10px] text-white/45">
            <span className="text-white/55">-5min</span>
            <span>
              {ts.offset > 1 ? `-${Math.floor(ts.offset / 60)}:${String(Math.round(ts.offset % 60)).padStart(2, "0")}` : "AO VIVO"}
            </span>
            <span>buffer disponível: {Math.floor(ts.back / 60)}:{String(Math.round(ts.back % 60)).padStart(2, "0")}</span>
          </div>
        </div>
          );
        })()}
        </>

        {/* play row */}
        <div className="mt-4 grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          {/* volume */}
          {(() => {
            const vol = muted ? 0 : volume;
            const expanded = volHover;
            return (
              <div
                className="relative flex items-center"
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
              >
                <div
                  className="flex items-center rounded-full backdrop-blur-md transition-all duration-300 ease-out"
                  style={{
                    background: expanded ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    paddingRight: expanded ? 14 : 0,
                    boxShadow: expanded ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
                  }}
                >
                  <button
                    onClick={() => onSetMuted(!muted)}
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition shrink-0"
                    data-tv-focusable
                    data-tv-scroll="center"
                    data-tv-selected={muted ? "true" : undefined}
                    aria-label={muted ? "Ativar som" : "Silenciar"}
                    title={muted ? "Ativar som" : "Silenciar"}
                  >
                    {muted || volume === 0
                      ? <VolumeX size={16} className="text-white/80" />
                      : <Volume2 size={16} className="text-white" />}
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300 ease-out"
                    style={{ width: expanded ? 132 : 0, opacity: expanded ? 1 : 0 }}
                  >
                    <div className="flex items-center gap-3 pl-1">
                      <SmoothVolumeSlider
                        value={vol}
                        onChange={(v) => { onSetVolume(v); if (v > 0 && muted) onSetMuted(false); }}
                      />
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}


          {/* play/pause central */}
          <button
            onClick={onTogglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-95 transition shadow-[0_10px_30px_rgba(255,255,255,0.15)]"
            aria-label={playing ? "Pausar" : "Reproduzir"}
            data-tv-focusable
            data-tv-scroll="center"
            data-tv-selected={playing ? "true" : undefined}
          >
            {buffering ? <ElegantLoader size={24} /> : playing ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-0.5" />}
          </button>

          {/* Help + logo */}
          <div className="flex items-center gap-3 justify-self-end">
            <PlayerSlugBadge slug={userSlug} radioName={empresaNome} radioUserId={radioUserId} />
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
              src={nexoPlayerLogo.url}
              alt="Nexo Player"
              className="h-6"
              style={{ opacity: 0.6 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />

          </div>
        </div>
      </footer>

      {/* Chat side panel */}
      {chatOpen && (
        <Suspense fallback={null}>
          <PlayerChat channelId={canal?.id || "default"} radioUserId={radioUserId} onClose={() => setChatOpen(false)} shopOpen={false} />
        </Suspense>
      )}

      {/* Karaoke agora é inline, dentro da coluna "a seguir" (ver <InlineKaraoke /> abaixo do botão +) */}


      {/* Grade */}
      {gradeOpen && (
        <Suspense fallback={<div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/85"><ElegantLoader size={40} /></div>}>
          <PlayerGradeDialog programas={programas} onClose={() => setGradeOpen(false)} />
        </Suspense>
      )}


      <style>{`
        @keyframes audioHistIn {
          0%   { transform: translateX(180px) scale(1.12) rotate(1.5deg); opacity: 0; filter: blur(10px) grayscale(0%) brightness(1.15); box-shadow: 0 40px 80px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.7), 0 0 60px rgba(255,255,255,0.35); }
          55%  { transform: translateX(-8px) scale(1.03) rotate(-0.3deg); opacity: 1;  filter: blur(1.5px) grayscale(0%) brightness(1.06); }
          100% { transform: translateX(0) scale(1) rotate(0deg);           opacity: 1;  filter: blur(0) grayscale(0%) brightness(1); box-shadow: 0 30px 60px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.55), 0 0 32px rgba(255,255,255,0.18); }
        }
      `}</style>
    </div>
  );
}
function VolumeEqBars({ volume, muted, playing }: { volume: number; muted: boolean; playing: boolean }) {
  // Nível efetivo (0..1): silencia quando mudo ou pausado
  const level = muted || !playing ? 0 : Math.min(1, Math.max(0, volume));
  // Amplitude mínima para não sumir totalmente quando ativo
  const amp = level <= 0 ? 0 : 0.25 + level * 0.75;
  // Velocidade da animação acompanha o volume: mais alto = mais rápido
  const dur = level <= 0 ? 0 : (1.15 - level * 0.55).toFixed(2);
  const barBase = "w-[2px] rounded-sm bg-gradient-to-t from-red-600 to-red-400 transition-[height,opacity] duration-200 ease-out";
  const heights = [40, 100, 65];
  const delays = [0, 150, 300];
  return (
    <span
      aria-hidden
      className="flex items-end gap-[2px] h-3"
      style={{ ["--vol" as any]: amp, opacity: level <= 0 ? 0.4 : 1 }}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className={barBase}
          style={{
            height: level <= 0 ? "18%" : `calc(${h}% * var(--vol))`,
            animation: level <= 0 ? "none" : `eqbar ${dur}s ease-in-out ${delays[i]}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Crossfade suave entre capas com monitoramento de FPS.
 * - Amostra o frame-rate durante a transição (rAF).
 * - Se detectar quedas persistentes (< 45 FPS em 2 transições) ou
 *   `prefers-reduced-motion`, degrada automaticamente para um fade
 *   simples (sem blur/scale) e menor duração.
 * - Estado global do módulo evita re-medir a cada montagem.
 */
type CrossfadeQuality = "high" | "low";
const crossfadePerf = {
  quality: "high" as CrossfadeQuality,
  badSamples: 0,
};

function detectReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { return false; }
}

/**
 * ProgramShowcaseCard — card unificado usado tanto para o programa NO AR
 * quanto para os próximos programas. Layout: foto do locutor centralizada
 * com fundo em degradê extraído das duas cores dominantes da foto.
 */
export function ProgramShowcaseCard({
  program,
  apresentadores,
  variant = "upcoming",
  isActive = true,
  isFirst = false,
  radius = 32,
  fallbackTitle,
  progressPct,
  liked,
  onToggleLike,
  onImageLoad,
}: {
  program: any;
  apresentadores: any[];
  variant?: "live" | "upcoming";
  isActive?: boolean;
  isFirst?: boolean;
  radius?: number;
  fallbackTitle?: string;
  progressPct?: number;
  liked?: boolean;
  onToggleLike?: () => void;
  onImageLoad?: (url: string) => void;
}) {
  const isLive = variant === "live";

  const apresentador = useMemo(() => {
    if (!program) return null;
    const ids: string[] = Array.isArray(program.apresentadores_ids) && program.apresentadores_ids.length
      ? program.apresentadores_ids
      : program.apresentador_id
        ? [program.apresentador_id]
        : [];
    for (const id of ids) {
      const a = apresentadores?.find((x) => x.id === id);
      if (a?.foto) return a;
    }
    // fallback: primeiro apresentador encontrado, mesmo sem foto
    for (const id of ids) {
      const a = apresentadores?.find((x) => x.id === id);
      if (a) return a;
    }
    return null;
  }, [program, apresentadores]);

  const foto: string | null =
    (apresentador?.foto && String(apresentador.foto).trim()) ||
    (program?.thumb && String(program.thumb).trim()) ||
    (program?.capa && String(program.capa).trim()) ||
    null;

  const palette = useCoverPalette(foto);
  const contrast = getPaletteContrast(palette);
  const gradient = palette
    ? `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`
    : "linear-gradient(135deg, #1f2937 0%, #0b0f1a 100%)";

  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">(
    foto ? "loading" : "error"
  );
  useEffect(() => { setImgState(foto ? "loading" : "error"); }, [foto]);

  const iniciais = useMemo(() => {
    const nome = apresentador?.nome || program?.nome || fallbackTitle || "";
    return (
      String(nome)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s: string) => s[0]?.toUpperCase() || "")
        .join("") || "•"
    );
  }, [apresentador, program, fallbackTitle]);

  const boxShadow = isLive
    ? "0 30px 80px rgba(0,0,0,0.7)"
    : isFirst
      ? "0 30px 60px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.45), 0 0 24px rgba(255,255,255,0.14)"
      : isActive
        ? "0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)"
        : "0 20px 40px rgba(0,0,0,0.5)";

  const avatarSize = isLive ? 96 : 64;
  const avatarPt = isLive ? 56 : 32;
  const titleClass = isLive
    ? "text-2xl font-bold leading-tight"
    : "text-sm font-bold leading-tight truncate";
  const subtitleClass = isLive ? "text-[12px] opacity-80 mt-0.5" : "text-[10px] uppercase tracking-widest text-white/80";
  const badgeLabel = isLive ? "no ar" : "a seguir";
  const showBadge = isLive || isFirst;

  const textColor = isLive ? (contrast?.textColor || "#fff") : "#fff";
  const textShadow = isLive ? contrast?.textShadow : "0 2px 8px rgba(0,0,0,0.6)";

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ borderRadius: radius, background: gradient, boxShadow }}
      data-focusable={isLive || undefined}
    >
      {/* foto locutor */}
      {foto && imgState !== "error" ? (
        <>
          <img
            src={foto}
            alt={apresentador?.nome || program?.nome || ""}
            ref={(node) => {
              // Se a imagem já está no cache do browser (preloader) o onLoad
              // pode nunca disparar — detecta via .complete no mount.
              if (node && node.complete && node.naturalWidth > 0) {
                if (imgState !== "loaded") setImgState("loaded");
                if (foto) onImageLoad?.(foto);
              }
            }}
            onLoad={() => {
              setImgState("loaded");
              if (foto) onImageLoad?.(foto);
            }}
            onError={() => setImgState("error")}
            className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500"
            style={{
              maskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
              opacity: imgState === "loaded" ? 0.95 : 0,
            }}
          />
          {imgState === "loading" && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{
                background:
                  "linear-gradient(110deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.04) 100%)",
                maskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
              }}
            />
          )}
        </>
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-start pointer-events-none gap-3"
          style={{ paddingTop: avatarPt }}
        >
          <div
            className="rounded-full flex items-center justify-center text-white/85 font-semibold border border-white/15 backdrop-blur-md"
            style={{
              width: avatarSize,
              height: avatarSize,
              fontSize: isLive ? 22 : 16,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            {iniciais}
          </div>
          {isLive && <Music2 size={60} className="text-white/10" strokeWidth={1} />}
        </div>
      )}

      {/* overlay para legibilidade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isLive
            ? "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.55) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* badge */}
      {showBadge && (
        isLive ? (
          <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-[11px] font-medium bg-black/55 backdrop-blur-md border border-white/10">
            {badgeLabel}
          </div>
        ) : (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-white/95 text-black font-semibold uppercase tracking-widest shadow-lg">
            {badgeLabel}
          </div>
        )
      )}

      {/* horário no canto (upcoming) */}
      {!isLive && (
        <div className="absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-md bg-black/60 text-white/85">
          {hhmm(program?.horario_inicio)}
        </div>
      )}

      {/* like (live) */}
      {isLive && onToggleLike && (
        <button
          onClick={onToggleLike}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-black/45 hover:bg-black/70 border border-white/10 transition"
          data-focusable
          aria-label={liked ? "Descurtir programa" : "Curtir programa"}
          aria-pressed={!!liked}
          title={liked ? "Você curtiu este programa" : "Curtir este programa"}
        >
          <Heart size={18} fill={liked ? "#ffffff" : "none"} stroke="#ffffff" />
        </button>
      )}

      {/* rodapé — infos do programa */}
      <div
        className={isLive ? "absolute bottom-4 left-5 right-5" : "absolute bottom-3 left-3 right-3"}
        style={{ color: textColor, textShadow }}
      >
        {isLive && <div className="text-[11px] uppercase tracking-widest opacity-80">no ar</div>}
        <div className={titleClass}>{program?.nome || fallbackTitle || "—"}</div>
        {isLive ? (
          <div className={subtitleClass}>
            {program ? `${hhmm(program.horario_inicio)}/${hhmm(program.horario_fim)}` : ""}
          </div>
        ) : (
          <div className={subtitleClass}>
            {hhmm(program?.horario_inicio)}/{hhmm(program?.horario_fim)}
          </div>
        )}
        {isLive && typeof progressPct === "number" && (
          <div className="mt-3 h-[3px] w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}



function NowCoverCrossfade({ capa, isActive }: { capa?: string | null; isActive: boolean }) {
  const [layers, setLayers] = useState<Array<{ id: number; url: string }>>(() =>
    capa ? [{ id: 0, url: capa }] : []
  );
  const [quality, setQuality] = useState<CrossfadeQuality>(() =>
    detectReducedMotion() ? "low" : crossfadePerf.quality
  );
  const seqRef = useRef(0);
  const lastUrlRef = useRef<string | null>(capa || null);
  const rafRef = useRef<number | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);

  // Duração ajustada pela qualidade
  const fadeMs = quality === "high" ? 900 : 380;

  useEffect(() => {
    const next = capa || null;
    if (next === lastUrlRef.current) return;
    lastUrlRef.current = next;
    if (!next) {
      setLayers([]);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = next;

    const measure = () => {
      if (quality === "low") return; // já degradado
      const start = performance.now();
      let frames = 0;
      let last = start;
      let longFrames = 0;
      const tick = (t: number) => {
        frames++;
        const dt = t - last;
        last = t;
        // Frame acima de ~22ms => abaixo de ~45fps
        if (dt > 22) longFrames++;
        if (t - start < fadeMs + 50) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          const elapsed = t - start;
          const fps = (frames / elapsed) * 1000;
          const dropRatio = longFrames / Math.max(1, frames);
          if (fps < 45 || dropRatio > 0.25) {
            crossfadePerf.badSamples += 1;
            if (crossfadePerf.badSamples >= 2 && crossfadePerf.quality !== "low") {
              crossfadePerf.quality = "low";
              setQuality("low");
              if (typeof console !== "undefined") {
                console.info(
                  `[NowCoverCrossfade] degradado para 'low' — fps=${fps.toFixed(1)}, drops=${(dropRatio * 100).toFixed(0)}%`
                );
              }
            }
          } else {
            crossfadePerf.badSamples = Math.max(0, crossfadePerf.badSamples - 1);
          }
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (cancelled) return;
      seqRef.current += 1;
      const id = seqRef.current;
      setLayers((prev) => [...prev.slice(-1), { id, url: next }]);
      if (cleanupTimerRef.current) window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = window.setTimeout(() => {
        setLayers((prev) => prev.filter((l) => l.id === id));
        cleanupTimerRef.current = null;
      }, fadeMs + 60);
      measure();
    };
    if ((img as any).decode) {
      (img as any).decode().then(start).catch(start);
    } else {
      img.onload = start;
      img.onerror = start;
    }
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [capa, quality, fadeMs]);

  // Cleanup na desmontagem
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (cleanupTimerRef.current) window.clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  if (layers.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(ellipse at 30% 20%, #2f2f38 0%, #0d0d12 70%)" }}>
        <Disc3 size={isActive ? 96 : 72} className="text-white/15" strokeWidth={1.2} />
      </div>
    );
  }

  const isLow = quality === "low";

  return (
    <>
      {layers.map((l, idx) => {
        const isTop = idx === layers.length - 1;
        const isFirst = layers.length === 1;
        const transition = isFirst
          ? "none"
          : isLow
            ? `opacity ${fadeMs}ms linear`
            : `opacity ${fadeMs}ms cubic-bezier(.4,0,.2,1), transform ${fadeMs + 200}ms cubic-bezier(.22,1,.36,1), filter ${fadeMs}ms cubic-bezier(.4,0,.2,1)`;
        return (
          <div
            key={l.id}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${l.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: isTop ? 1 : 0,
              transform: isLow ? undefined : (isTop ? "scale(1)" : "scale(1.04)"),
              filter: isLow ? undefined : (isTop ? "blur(0px)" : "blur(2px)"),
              transition,
              animation:
                isTop && !isFirst && !isLow
                  ? `nowCoverIn ${fadeMs}ms cubic-bezier(.22,1,.36,1) both`
                  : undefined,
              willChange: isLow ? "opacity" : "opacity, transform, filter",
            }}
          />
        );
      })}
      {!isLow && (
        <style>{`
          @keyframes nowCoverIn {
            0%   { opacity: 0; transform: scale(1.06); filter: blur(3px) brightness(1.1); }
            60%  { opacity: 1; }
            100% { opacity: 1; transform: scale(1); filter: blur(0) brightness(1); }
          }
        `}</style>
      )}
    </>
  );
}



function PillBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  const base =
    "px-3 h-7 rounded-full flex items-center gap-1.5 text-[11px] border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0";
  const activeCls =
    "bg-white/15 border-white/25 text-white hover:bg-white/20 hover:border-white/35 focus-visible:bg-white/20";
  const idleCls =
    "bg-white/6 border-white/10 text-white/75 hover:bg-white/12 hover:border-white/20 hover:text-white focus-visible:bg-white/12 focus-visible:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`${base} ${active ? activeCls : idleCls}`}
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

/* =========================================================================
   Interatividade — botão especial (borda animada) com submenu
   Contém: Chat, Karaoke e Enquete. Sinaliza quando há enquete ativa.
   ========================================================================= */
type ActivePoll = {
  id: string;
  pergunta: string;
  respostas: string[];
  horario_inicio: string;
  horario_fim: string;
};

function InteractivityMenu({
  userId,
  chatOpen,
  onToggleChat,
  karaokeEnabled,
  onToggleKaraoke,
  showKaraoke = true,
}: {
  userId: string | null;
  chatOpen: boolean;
  onToggleChat: () => void;
  karaokeEnabled: boolean;
  onToggleKaraoke: () => void;
  showKaraoke?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasNotif = !!activePoll && !alreadyVoted;

  // Busca enquete ativa (data = hoje, horário dentro do intervalo)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchActive = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const { data, error } = await supabase
          .from("enquetes_agendadas")
          .select("id,pergunta,resposta1,resposta2,resposta3,resposta4,horario_inicio,horario_fim")
          .eq("user_id", userId)
          .eq("data_enquete", today)
          .lte("horario_inicio", hhmm)
          .gte("horario_fim", hhmm)
          .order("horario_inicio", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || error) return;
        if (!data) { setActivePoll(null); return; }
        const respostas = [data.resposta1, data.resposta2, data.resposta3, data.resposta4].filter(Boolean) as string[];
        setActivePoll({
          id: data.id,
          pergunta: data.pergunta,
          respostas,
          horario_inicio: data.horario_inicio,
          horario_fim: data.horario_fim,
        });
        const votedKey = `nexo:poll:voted:${data.id}`;
        setAlreadyVoted(!!localStorage.getItem(votedKey));
      } catch { /* silencioso */ }
    };
    fetchActive();
    const id = window.setInterval(fetchActive, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [userId]);

  // Fecha submenu ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {/* Botão principal — icon-only com borda animada */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Interatividade"
        aria-expanded={open}
        data-focusable
        className="relative h-7 rounded-full flex items-center justify-center outline-none group overflow-hidden"
        style={{
          padding: 2,
          width: "28px",
          maxWidth: "28px",
          transition: "max-width 380ms cubic-bezier(0.22, 1, 0.36, 1), width 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.maxWidth = "168px"; e.currentTarget.style.width = "168px"; }}
        onMouseLeave={(e) => { e.currentTarget.style.maxWidth = "28px"; e.currentTarget.style.width = "28px"; }}
        onFocus={(e) => { e.currentTarget.style.maxWidth = "168px"; e.currentTarget.style.width = "168px"; }}
        onBlur={(e) => { e.currentTarget.style.maxWidth = "28px"; e.currentTarget.style.width = "28px"; }}
      >
        {/* borda animada (conic gradient girando) */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, #ff3355, #ffb63b, #7bd3ff, #b76bff, #ff3355)",
            animation: "interactSpin 3.6s linear infinite",
            filter: "saturate(1.15)",
          }}
        />
        {/* halo suave */}
        <span
          aria-hidden
          className="absolute -inset-[3px] rounded-full opacity-70 blur-[6px] group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(255,51,85,.5), rgba(255,182,59,.5), rgba(123,211,255,.5), rgba(183,107,255,.5), rgba(255,51,85,.5))",
            animation: "interactSpin 3.6s linear infinite",
          }}
        />
        {/* núcleo — expande no hover para revelar o texto */}
        <span
          className="relative z-10 h-full w-full rounded-full bg-[#0b0b10] flex items-center justify-center gap-0 px-0 group-hover:gap-1.5 group-hover:px-2.5 group-focus-visible:gap-1.5 group-focus-visible:px-2.5"
          style={{ transition: "padding 380ms cubic-bezier(0.22, 1, 0.36, 1), gap 380ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <Sparkles size={12} className="text-white shrink-0" strokeWidth={2.2} />
          <span
            className="text-[11px] font-medium text-white whitespace-nowrap overflow-hidden max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-focus-visible:max-w-[140px] group-focus-visible:opacity-100"
            style={{ transition: "max-width 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out 100ms" }}
          >
            Interatividade
          </span>
        </span>
        {/* badge de notificação (enquete ativa não votada) */}
        {hasNotif && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 z-20 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0b0b10]"
            style={{ boxShadow: "0 0 0 0 rgba(239,68,68,0.7)", animation: "interactPulse 1.6s ease-out infinite" }}
          />
        )}
      </button>


      {/* Submenu */}
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+8px)] z-50 min-w-[180px] p-1.5 rounded-xl border border-white/12 bg-black/85 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[fadeIn_140ms_ease-out]"
        >
          <MenuItem
            active={chatOpen}
            icon={<MessageSquare size={14} />}
            label="Chat"
            onClick={() => { onToggleChat(); setOpen(false); }}
          />
          {showKaraoke && (
          <MenuItem
            active={karaokeEnabled}
            icon={<Mic size={14} />}
            label="Karaokê"
            onClick={() => { onToggleKaraoke(); setOpen(false); }}
          />
          )}
          <MenuItem
            active={false}
            icon={<BarChart3 size={14} />}
            label="Enquete"
            hint={activePoll ? (alreadyVoted ? "respondida" : "ativa agora") : "sem enquete"}
            dot={hasNotif}
            disabled={!activePoll}
            onClick={() => { setPollOpen(true); setOpen(false); }}
          />
        </div>
      )}

      {/* Popup da enquete */}
      {pollOpen && activePoll && (
        <PollDialog
          poll={activePoll}
          alreadyVoted={alreadyVoted}
          previousVote={(() => {
            try {
              const raw = localStorage.getItem(`nexo:poll:voted:${activePoll.id}`);
              if (!raw) return null;
              const n = parseInt(raw, 10);
              return Number.isFinite(n) && n >= 0 ? n : null;
            } catch { return null; }
          })()}
          onClose={() => setPollOpen(false)}
          onVoted={(optionIndex) => {
            localStorage.setItem(`nexo:poll:voted:${activePoll.id}`, String(optionIndex));
            setAlreadyVoted(true);
          }}
        />

      )}

      <style>{`
        @keyframes interactSpin { to { transform: rotate(360deg); } }
        @keyframes interactPulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

function MenuItem({
  icon, label, hint, active, disabled, dot, onClick,
}: {
  icon: React.ReactNode; label: string; hint?: string;
  active?: boolean; disabled?: boolean; dot?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] transition text-left " +
        (disabled
          ? "text-white/35 cursor-not-allowed"
          : active
            ? "bg-white/12 text-white"
            : "text-white/85 hover:bg-white/10 hover:text-white")
      }
    >
      <span className="relative flex items-center justify-center w-5 h-5">
        {icon}
        {dot && (
          <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        )}
      </span>
      <span className="flex-1 leading-none">{label}</span>
      {hint && (
        <span className={"text-[10px] uppercase tracking-wider " + (dot ? "text-red-400" : "text-white/40")}>{hint}</span>
      )}
    </button>
  );
}

function PollDialog({
  poll, alreadyVoted, previousVote, onClose, onVoted,
}: {
  poll: ActivePoll;
  alreadyVoted: boolean;
  previousVote?: number | null;
  onClose: () => void;
  onVoted: (optionIndex: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(previousVote ?? null);
  const [submitted, setSubmitted] = useState(alreadyVoted);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Ativa o estado de entrada no próximo frame para disparar a transição CSS.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setVisible(false);
    window.setTimeout(() => onClose(), 220);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const submit = () => {
    if (selected == null) return;
    setSubmitted(true);
    onVoted(selected);
  };


  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 220ms ease-out",
      }}
    >


      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0e0e14]/95 shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden pointer-events-auto"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.94) translateY(8px)",
          transformOrigin: "center center",
          transition: "opacity 220ms ease-out, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "opacity, transform",
        }}
      >

        {/* Cabeçalho com faixa animada */}
        <div className="relative px-5 pt-5 pb-3">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{
              background: "linear-gradient(90deg, #ff3355, #ffb63b, #7bd3ff, #b76bff, #ff3355)",
              backgroundSize: "200% 100%",
              animation: "interactStripe 3s linear infinite",
            }}
          />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <BarChart3 size={11} /> Enquete ao vivo
              </div>
              <h3 className="mt-1.5 text-[16px] font-semibold text-white leading-snug">{poll.pergunta}</h3>
            </div>
            <button
              onClick={requestClose}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-white/6 hover:bg-white/15 border border-white/10 transition"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Opções */}
        <div className="px-5 pb-4 space-y-2">
          {poll.respostas.map((r, i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                disabled={submitted}
                onClick={() => setSelected(i)}
                className={
                  "w-full text-left px-3.5 py-2.5 rounded-xl border text-[13px] transition " +
                  (submitted
                    ? isSel
                      ? "border-white/40 bg-white/10 text-white"
                      : "border-white/8 bg-white/3 text-white/55"
                    : isSel
                      ? "border-white/45 bg-white/12 text-white"
                      : "border-white/10 bg-white/4 text-white/85 hover:bg-white/10 hover:border-white/25")
                }
              >
                <span className="inline-flex items-center gap-2">
                  <span className={
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold " +
                    (isSel ? "bg-white text-black" : "bg-white/10 text-white/70")
                  }>
                    {isSel ? <Check size={12} /> : String.fromCharCode(65 + i)}
                  </span>
                  {r}
                </span>
              </button>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <div className="text-[10px] text-white/45 uppercase tracking-wider">
            Ativa {poll.horario_inicio} – {poll.horario_fim}
          </div>
          {submitted ? (
            <div className="text-[12px] text-emerald-300 flex items-center gap-1.5">
              <Check size={14} /> Voto registrado
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={selected == null}
              className={
                "px-4 h-9 rounded-full text-[12px] font-semibold transition " +
                (selected == null
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-white text-black hover:bg-white/90")
              }
            >
              Enviar voto
            </button>
          )}
        </div>

        <style>{`
          @keyframes interactStripe { to { background-position: -200% 0; } }
        `}</style>
      </div>
    </div>,
    document.body
  );
}


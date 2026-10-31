import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Rewind, Heart, Plus, MessageSquare, Mic, ListMusic, HelpCircle, Play, Pause, VolumeX, Volume2, Radio, Disc3, Music2, Sparkles, BarChart3, X, Check, Maximize2, Minimize2, Loader2, Settings } from "lucide-react";
import { PlayerBackButton } from "@/components/player/PlayerBackButton";
import { supabase } from "@/integrations/supabase/client";
import nexoPlayerLogo from "@/assets/nexo-player-logo.png.asset.json";
import { WeatherIcon } from "@/components/WeatherIcons";
import { getMusicExceptions, matchesMusicException } from "@/lib/musicExceptions";

import { useCoverPalette, useCoverTriad, getPaletteContrast } from "@/lib/coverPalette";
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
import { playerSignOut } from "@/lib/playerSignOut";

const PlayerChat = lazyRetry(() => import("@/components/PlayerChat"));
const PlayerGradeDialog = lazyRetry(() => import("@/components/player/PlayerGradeDialog"));
const LyricsPopup = lazyRetry(() => import("@/components/player/LyricsPopup"));
const WatchProfilePopup = lazyRetry(() => import("@/components/player/WatchProfilePopup"));

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
  isCatalog?: boolean;
}

interface HistoryTrack {
  musica: string;
  artista: string;
  horario: string;
  programa?: string;
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
    isCatalog = false,
  } = props;

  const isYoutube = canal?.type === "video_youtube" || canal?.type === "youtube";
  const selectedVideoId = isCatalog ? (new URLSearchParams(window.location.search).get("vid")) : null;
  const isTvExperience = new URLSearchParams(window.location.search).get("tv") === "1";

  // ---- Pré-roll comercial para o streaming de áudio ----
  // Campanhas de áudio são independentes dos anúncios de vídeo e precisam ser
  // selecionadas diretamente no player antes do início da transmissão.
  // O pré-roll de áudio é executado pelo overlay do player (src/pages/Player.tsx).
  // Um segundo caminho aqui fazia o mesmo anúncio tocar duas vezes seguidas.


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
  const [controlsVisible, setControlsVisible] = useState<boolean>(() => !isTvExperience || isVideoChannel);
  useEffect(() => {
    if (!isVideoChannel) { setControlsVisible(!isTvExperience); return; }
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
  }, [isVideoChannel, isTvExperience]);

  useEffect(() => {
    if (!isTvExperience) return;
    const handleTvBack = (event: Event) => {
      event.preventDefault();
      if (!controlsVisible) setControlsVisible(true);
      else handleBackHome();
    };
    window.addEventListener("nexo:tv-back", handleTvBack as EventListener);
    return () => window.removeEventListener("nexo:tv-back", handleTvBack as EventListener);
  }, [isTvExperience, controlsVisible, handleBackHome]);

  // ---- Relógio (elegante, com segundos) ----
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const clockTime = useMemo(() => {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return { hh, mm, ss };
  }, [now]);

  // ---- Clima (temp + código WMO) do rádio atual ----
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  useEffect(() => {
    if (!radioUserId) return;
    let cancelled = false;
    let intervalId: number | undefined;

    const fetchWeather = async (lat?: number | null, lon?: number | null) => {
      setWeatherLoading(true);
      try {
        const { data } = await supabase.functions.invoke("fetch-weather", {
          body: {
            action: "forecast",
            lat: lat ?? null,
            lon: lon ?? null,
            user_id: radioUserId,
            forecast_days: 1,
          },
        });
        const c = (data as any)?.data?.current;
        if (!cancelled && c && typeof c.temperature_2m === "number") {
          setWeather({ temp: Math.round(c.temperature_2m), code: Number(c.weather_code) || 0 });
        }
      } catch {} finally {
        setWeatherLoading(false);
      }
    };

    (async () => {
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("weather_lat, weather_lon")
          .eq("user_id", radioUserId)
          .maybeSingle();
        if (typeof (settings as any)?.weather_lat === "number") lat = (settings as any).weather_lat;
        if (typeof (settings as any)?.weather_lon === "number") lon = (settings as any).weather_lon;
      } catch {}
      // Mesmo sem coordenadas locais (ouvinte sem permissão de leitura),
      // a edge function resolve as coordenadas da rádio pelo user_id.
      fetchWeather(lat, lon);
      intervalId = window.setInterval(() => fetchWeather(lat, lon), 5 * 60 * 1000);
    })();


    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [radioUserId]);


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
  const [djHudEnabled, setDjHudEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("nexohub_dj_hud") === "1";
    } catch {
      return false;
    }
  });
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
  useEffect(() => {
    try {
      localStorage.setItem("nexohub_dj_hud", djHudEnabled ? "1" : "0");
    } catch {}
  }, [djHudEnabled]);
  const djModeActive = !isVideoChannel && djModeOn;


  const [resolvedMusicCover, setResolvedMusicCover] = useState<string>(musicData?.capa || "");
  const [musicExceptionCapa, setMusicExceptionCapa] = useState<string | null>(null);
  const [musicExceptionArtist, setMusicExceptionArtist] = useState<string | null>(null);

  useEffect(() => {
    const ownerId = radioUserId || effectiveUserId;
    let cancelled = false;

    // Limpa imediatamente as imagens da faixa anterior enquanto a exceção atual é resolvida.
    setMusicExceptionCapa(null);
    setMusicExceptionArtist(null);

    if (!ownerId || !musicData?.titulo) return () => { cancelled = true; };

    getMusicExceptions(ownerId).then((excs) => {
      if (cancelled) return;
      const matched = matchesMusicException(excs, musicData.artista, musicData.titulo);
      setMusicExceptionCapa(matched?.capa_url || null);
      setMusicExceptionArtist(matched?.artista_url || null);
    });

    return () => { cancelled = true; };
  }, [musicData?.titulo, musicData?.artista, radioUserId, effectiveUserId]);

  // ---- Background dinâmico ----
  // Preferência: capa da música (Exceção -> Deezer/artista).
  // Fallback: paleta derivada da imagem do "NO AR" (foto do apresentador / capa do programa).
  const musicCover: string | null = musicExceptionCapa || musicData?.capa || resolvedMusicCover || null;
  const onAirImage: string | null = musicExceptionArtist || apresentador?.foto || currentProg?.thumb || currentProg?.capa || null;
  const musicPalette = useCoverPalette(musicCover);
  const onAirPalette = useCoverPalette(!musicCover ? onAirImage : null);
  const activePalette = musicCover ? musicPalette : onAirPalette;
  const djCoverTriad = useCoverTriad(musicCover || onAirImage);

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

  // ---- Imagem do artista (Deezer) intercalada com o gradiente a cada 15s ----
  const [artistBgImage, setArtistBgImage] = useState<string>("");
  useEffect(() => {
    // A imagem cadastrada na exceção tem prioridade sobre a busca automática.
    if (musicExceptionArtist) {
      setArtistBgImage(musicExceptionArtist);
      return;
    }

    const artista = String(musicData?.artista || "").trim();
    if (!artista) { setArtistBgImage(""); return; }
    const sync = getArtistImageSync(artista);
    if (sync) { setArtistBgImage(sync); return; }
    let cancelled = false;
    fetchArtistImageCached(artista).then((url) => {
      if (!cancelled) setArtistBgImage(url || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [musicData?.artista, musicExceptionArtist]);

  const [showArtistBg, setShowArtistBg] = useState(false);
  useEffect(() => {
    if (!artistBgImage) { setShowArtistBg(false); return; }
    if (isTvExperience) { setShowArtistBg(true); return; }
    setShowArtistBg(false);
    const id = setInterval(() => setShowArtistBg((v) => !v), 15000);
    return () => clearInterval(id);
  }, [artistBgImage, isTvExperience]);

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
      // Mantém a troca de faixa responsiva: caso o provedor externo demore,
      // usamos rapidamente os fallbacks já disponíveis em vez de segurar a capa anterior.
      const timeoutId = window.setTimeout(() => controller.abort(), 1200);
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
      programa: currentProg?.nome || "",
      capa: musicExceptionCapa || cover || musicData?.capa || undefined,
    };
  }, [musicData?.artista, musicData?.titulo, musicData?.horario, musicData?.capa, currentProg?.nome, musicExceptionCapa]);

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
    // Forçamos o recarregamento da capa sempre que o artista ou título mudar.
    // Se o XML enviar uma capa (musicData.capa), usamos como placeholder, 
    // mas o fetchCover (iTunes/Deezer) sempre tem prioridade e sobrescreve 
    // para garantir que a imagem corresponda à música atual, corrigindo o bug 
    // onde a capa ficava travada na música anterior.
    const cached = coverCacheRef.current.get(key);
    
    // Se temos no cache, usamos; se não, usamos o que veio no musicData (se vier)
    const initialCover = cached || musicData?.capa || "";
    setResolvedMusicCover(initialCover);
    if (initialCover) warmCover(initialCover);
    setHistory((prev) => ensureCurrentAtFront(prev, initialCover || undefined));

    // Busca a capa oficial (iTunes/Deezer) de forma assíncrona
    fetchCover(artista, musica).then((cover) => {
      if (cancelled) return;
      if (!cover) return;
      
      // Atualiza o estado e o histórico com a capa confirmada.
      // A comparação de prev === cover evita re-renders desnecessários se a capa for a mesma.
      setResolvedMusicCover((prev) => (prev === cover ? prev : cover));
      setHistory((prev) => ensureCurrentAtFront(prev, cover));
    });

    return () => { cancelled = true; };
  }, [musicData?.titulo, musicData?.artista, musicData?.capa, ensureCurrentAtFront]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!effectiveUserId) return;
      // Use a public edge function so listeners who aren't the station owner
      // (Google-authenticated players, guests) also see the FULL history —
      // otherwise RLS on musicas_tocadas returns 0 rows for them and the
      // "songs played" list only fills up with tracks that started AFTER
      // they opened the player.
      let data: any[] | null = null;
      let error: any = null;
      try {
        const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/public-music-history?user_id=${encodeURIComponent(effectiveUserId)}&limit=${HIST_MAX * 2}`;
        const resp = await fetch(url, {
          headers: {
            apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        const json = await resp.json();
        if (json?.ok && Array.isArray(json.items)) data = json.items;
        else error = json?.error || "empty";
      } catch (e) {
        error = e;
      }
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
  }, [musicData?.titulo, musicData?.artista, musicData?.capa, resolvedMusicCover, musicExceptionCapa, ensureCurrentAtFront]);


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
  const navDirRef = useRef<1 | -1>(1);
  const goPrevProg = () => { navDirRef.current = -1; setProgNavIndex((i) => Math.max(0, i - 1)); };
  const goNextProg = () => { navDirRef.current = 1; setProgNavIndex((i) => Math.min(progNavMax, i + 1)); };
  const handleProgramWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (programNavList.length <= 1) return;
    if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return;
    const dir = (e.deltaY + e.deltaX) > 0 ? 1 : -1;
    const next = Math.max(0, Math.min(progNavMax, progNavIndex + dir));
    if (next !== progNavIndex) {
      navDirRef.current = dir > 0 ? 1 : -1;
      setProgNavIndex(next);
    }
  };

  // ---- Crossfade entre cards ao navegar programas (sem flicker / sem atraso) ----
  const [progSwitching, setProgSwitching] = useState(false);
  const prevFocusRef = useRef<{ program: any; index: number; isOnAir: boolean }>({
    program: focusedProgram,
    index: progNavIndex,
    isOnAir: isFocusedOnAir,
  });
  const lastCommittedRef = useRef<{ program: any; index: number; isOnAir: boolean }>({
    program: focusedProgram,
    index: progNavIndex,
    isOnAir: isFocusedOnAir,
  });
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lastCommittedRef.current.program?.id === focusedProgram?.id) return;
    // Snapshot do último foco confirmado (garante rastreio correto em cliques rápidos)
    prevFocusRef.current = lastCommittedRef.current;
    lastCommittedRef.current = { program: focusedProgram, index: progNavIndex, isOnAir: isFocusedOnAir };
    setProgSwitching(true);
    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    switchTimerRef.current = setTimeout(() => {
      setProgSwitching(false);
      switchTimerRef.current = null;
    }, 220);
    return () => {
      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [focusedProgram, progNavIndex, isFocusedOnAir]);

  // ---- Swipe / drag no card do programa ----
  const [progSwipeDx, setProgSwipeDx] = useState(0);
  const [progSwiping, setProgSwiping] = useState(false);
  const progSwipeRef = useRef<{ id: number; x: number; y: number; locked: "x" | "y" | null } | null>(null);
  const SWIPE_THRESHOLD = 60;
  const onProgSwipeStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    progSwipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: null };
    setProgSwiping(true);
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
  };
  const onProgSwipeMove = (e: React.PointerEvent) => {
    const s = progSwipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (s.locked === "x") {
      const atStart = progNavIndex <= 0 && dx > 0;
      const atEnd = progNavIndex >= progNavMax && dx < 0;
      const resistance = atStart || atEnd ? 0.3 : 1;
      setProgSwipeDx(Math.max(-200, Math.min(200, dx * resistance)));
    }
  };
  const onProgSwipeEnd = (e: React.PointerEvent) => {
    const s = progSwipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = progSwipeDx;
    progSwipeRef.current = null;
    setProgSwiping(false);
    setProgSwipeDx(0);
    if (s.locked === "x") {
      if (dx <= -SWIPE_THRESHOLD) goNextProg();
      else if (dx >= SWIPE_THRESHOLD) goPrevProg();
    }
  };


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
  const TS_SNAP_MARKERS = [0, 900, 1800]; // -30:00, -15:00, AO VIVO
  const snapToMarkers = (val: number, threshold = 30) => {
    for (const m of TS_SNAP_MARKERS) {
      if (Math.abs(val - m) < threshold) return m;
    }
    return val;
  };
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

      {/* YouTube Catalog Background */}
      {isCatalog && selectedVideoId && (
        <div className="absolute inset-0 z-0">
          <iframe
            src={`https://www.youtube.com/embed/${selectedVideoId}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&rel=0&enablejsapi=1&origin=${window.location.origin}`}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
          />
          {/* Overlay to ensure controls visibility */}
          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
        </div>
      )}

      {/* Modo DJ — cobre o background com cores contrastantes piscando no ritmo */}
      {!isCatalog && (
        <DjModeLayer audioRef={audioRef} active={djModeActive} sensitivity={djSensitivity} coverPalette={activePalette} coverTriad={djCoverTriad} showHud={djHudEnabled} />
      )}

      {/* Background dinâmico da capa da música (crossfade elegante entre trocas) */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ opacity: (djModeActive || isCatalog) ? 0 : 1, transition: "opacity 300ms ease-out" }}
      >
        {bgLayers.map((l, idx) => (
          <BgFadeLayer key={l.id} gradient={l.g} initialOpacity={idx === 0 ? 1 : 0} />
        ))}
      </div>
      {/* Imagem do artista (Deezer) intercalada a cada 15s com movimento lento (Ken Burns) */}
      {artistBgImage && !djModeActive && !isCatalog && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ opacity: showArtistBg ? 1 : 0, transition: "opacity 1600ms ease-in-out" }}
          aria-hidden
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${artistBgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "saturate(1.1) brightness(0.85)",
              animation: "playerBgKenBurns 24s ease-in-out infinite",
              willChange: "transform",
            }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%)" }}
          />
        </div>
      )}
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
        className={`absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-8 pt-6 ${isTvExperience && !isVideoChannel ? "hidden" : ""}`}
        style={isVideoChannel ? controlsStyle : undefined}
      >
        {/* Channel switcher */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => navigateChannel(-1)}
              className={`${isTvExperience ? "hidden" : ""} w-9 h-6 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 transition`}
              aria-label="Canal anterior"
              data-focusable
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => navigateChannel(1)}
              className={`${isTvExperience ? "hidden" : ""} w-9 h-6 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 transition`}
              aria-label="Próximo canal"
              data-focusable
            >
              <ChevronDown size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Logo do canal — agora à esquerda do nome do canal */}
            {(canal?.background_url || canal?.logo_url) && (
              <div key={`logo-${canal.id}`} className="animate-slide-up-down">
                <img
                  src={canal.background_url || canal.logo_url}
                  alt=""
                  className="h-14 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
                />
              </div>
            )}

            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-widest text-white/50">canal</div>
              <div key={`name-${canal?.id}`} className="text-[1.2rem] font-semibold animate-slide-up-down">
                {canal?.name || "—"}
              </div>
              {currentProg && (
                <div key={`prog-${currentProg.id}`} className="text-[10px] text-white/60 mt-0.5 font-medium flex items-center gap-1.5 uppercase tracking-[0.05em] animate-slide-up-down">
                  <span className="text-white/80">{currentProg.nome}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="tabular-nums">
                    {hhmm(currentProg.horario_inicio)} — {hhmm(currentProg.horario_fim)}
                  </span>
                </div>
              )}
              {nextProg && (
                <div key={`next-prog-${nextProg.id}`} className="text-[9px] text-white/40 mt-0.5 font-medium flex items-center gap-1.5 uppercase tracking-[0.05em] animate-slide-up-down">
                  <span className="text-white/30 italic">A seguir:</span>
                  <span className="text-white/60">{nextProg.nome}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/10" />
                  <span className="tabular-nums opacity-80">
                    {hhmm(nextProg.horario_inicio)} — {hhmm(nextProg.horario_fim)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Área direita: clima + relógio + perfil */}
        <div className="flex items-center gap-4">
          {/* Clima (temperatura + ícone) */}
          {weather && (
            <div
              className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl transition-opacity ${weatherLoading ? "opacity-60" : "opacity-100"}`}
              title="Tempo agora"
            >
              <WeatherIcon code={weather.code} size={34} />
              {weatherLoading ? (
                <Loader2 size={20} className="animate-spin text-white/80" />
              ) : (
                <span className="text-white font-semibold text-[18px] leading-none tabular-nums">
                  {weather.temp}°
                </span>
              )}
            </div>
          )}

          {/* Relógio elegante com segundos */}
          <div
            className="flex items-baseline gap-1 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl"
            aria-label="Horário atual"
          >
            <span
              className="text-white font-light tabular-nums tracking-[0.02em] leading-none"
              style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: 28, fontVariantNumeric: "tabular-nums" }}
            >
              {clockTime.hh}
              <span className="opacity-60 mx-[2px]">:</span>
              {clockTime.mm}
            </span>
            <span
              className="text-white/60 font-light tabular-nums leading-none"
              style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: 16 }}
            >
              {clockTime.ss}
            </span>
          </div>


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
                      const dest = userSlug && !String(userSlug).startsWith(":") ? `/${userSlug}/player` : "/player";
                      await playerSignOut(signOut, dest);
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
      <main className={`absolute inset-0 flex items-center justify-center pt-28 pb-40 ${isVideoChannel ? "pointer-events-none z-[2]" : ""}`}>
        {isVideoChannel ? null : isTvExperience ? null : (
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
                // depth relativa ao activeIndex: 0 = destacada (na frente).
                // A capa "tocando agora" (i=0) também acompanha a navegação para
                // que o usuário possa deslizar pelas capas das músicas já tocadas
                // sem que ela fique travada na frente.
                const depth = i - activeIndex;
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
                // z-index acompanha proximidade do índice ativo: a capa focada
                // fica sempre por cima, permitindo navegar entre as capas.
                const zIndex = 30 - abs;
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
                    className={`absolute right-0 rounded-[32px] overflow-hidden group ${canRewind ? "cursor-pointer" : "cursor-default"}`}

                    style={{
                      width: isActive ? 280 : 240,
                      height: isActive ? 280 : 240,
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity: isActive ? 1 : (isExpired ? Math.max(0.35, opacity * 0.55) : opacity),
                      filter: `blur(${blur}px) grayscale(${isExpired ? Math.max(gray, 75) : gray}%)`,
                      background: "linear-gradient(180deg, rgba(25,25,28,0.92) 0%, rgba(12,12,14,0.96) 100%)",
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
                        ? "0 40px 100px -20px rgba(0,0,0,0.95)"
                        : isActive
                          ? "0 40px 100px -20px rgba(0,0,0,0.95)"
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
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "transparent" }}>
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
                        <div className="absolute top-3 right-3 flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full bg-gradient-to-r from-white/95 via-white to-white/95 text-black text-[10px] font-bold uppercase tracking-[0.18em] shadow-[0_4px_16px_rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.6)] ring-1 ring-black/5 backdrop-blur-xl">
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
            {/* Setas de navegação de programas — ACIMA do card */}
            {programNavList.length > 1 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); goPrevProg(); }}
                  disabled={progNavIndex <= 0}
                  aria-label="Programa anterior"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                  data-focusable
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-[10px] uppercase tracking-widest text-white/90 min-w-[64px] text-center select-none">
                  {isFocusedOnAir ? "no ar" : "a seguir"}
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); goNextProg(); }}
                  disabled={progNavIndex >= progNavMax}
                  aria-label="Próximo programa"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/80 border border-white/15 backdrop-blur-md text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                  data-focusable
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <div
              style={{
                width: 368,
                height: 384,
                position: "relative",
                overflow: "hidden",
                borderRadius: 40,
                transform: `translateY(0) translateX(${progSwipeDx}px) scale(1)`,
                transition: progSwiping ? "none" : "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                willChange: "transform",
                touchAction: "pan-y",
              }}
              onPointerDown={onProgSwipeStart}
              onPointerMove={onProgSwipeMove}
              onPointerUp={onProgSwipeEnd}
              onPointerCancel={onProgSwipeEnd}
              data-focusable
            >
              {/* Slide horizontal: capa lateral "entra" no box do meio */}
              <div className="absolute inset-0">
                {progSwitching && (
                  <div
                    className="absolute inset-0 z-10 prog-card-exit"
                    key={`exit-${prevFocusRef.current.program?.id ?? "none"}`}
                    style={{ ["--dir" as any]: navDirRef.current }}
                  >
                    <ProgramShowcaseCard
                      program={prevFocusRef.current.program}
                      apresentadores={apresentadores}
                      variant={prevFocusRef.current.isOnAir ? "live" : "upcoming"}
                      isActive={!prevFocusRef.current.isOnAir}
                      radius={40}
                      fallbackTitle={canal?.name}
                      progressPct={prevFocusRef.current.isOnAir ? progPct : 0}
                      liked={prevFocusRef.current.isOnAir ? programLiked : false}
                      onToggleLike={prevFocusRef.current.isOnAir ? toggleProgramLike : undefined}
                      hideBadge
                    />
                  </div>
                )}
                <div
                  key={`enter-${focusedProgram?.id || progNavIndex}`}
                  className="absolute inset-0 z-20 prog-card-enter"
                  style={{ ["--dir" as any]: navDirRef.current }}
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
                    hideBadge
                    onImageLoad={(url) => {
                      if (!isFocusedOnAir) return;
                      loadedLocutorUrlRef.current = url;
                      markLocutorImageLoaded(url);
                      setLocutorImgState("loaded");
                    }}
                  />
                </div>
              </div>
              <style>{`
                @keyframes progCardIn {
                  from { opacity: 0; transform: translateX(calc(var(--dir, 1) * 100%)); }
                  to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes progCardOut {
                  from { opacity: 1; transform: translateX(0); }
                  to   { opacity: 0; transform: translateX(calc(var(--dir, 1) * -100%)); }
                }
                .prog-card-enter { animation: progCardIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both; will-change: transform, opacity; }
                .prog-card-exit  { animation: progCardOut 320ms cubic-bezier(0.22, 1, 0.36, 1) both; will-change: transform, opacity; }
              `}</style>
            </div>


          {/* Botão + centralizado abaixo do card NO AR */}
          <button
            onClick={() => setGradeOpen(true)}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-white/25 hover:bg-white/10 transition"
            style={{
              transform: "translateY(0)",
              transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            aria-label="Ver grade completa de programação"
            title="Grade de programação"
            data-focusable
          >
            <Plus size={20} />
          </button>

          </div>

          {/* UPCOMING PROGRAMS CAROUSEL — mesmo estilo do histórico, do lado direito */}
          <div
            onWheel={handleProgramWheel}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeX = String(e.clientX);
              el.dataset.swipeAnchor = String(progNavIndex);
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
              const next = Math.max(0, Math.min(progNavMax, anchor + delta));
              if (next !== progNavIndex) {
                navDirRef.current = next > progNavIndex ? 1 : -1;
                setProgNavIndex(next);
              }
            }}
            onPointerUp={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.dataset.swipeActive = "0";
              try { el.releasePointerCapture(e.pointerId); } catch {}
            }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLDivElement).dataset.swipeActive = "0"; }}

            className="relative flex-1 h-[420px] touch-pan-y select-none cursor-grab active:cursor-grabbing"
            style={{ perspective: "1200px", ...sideEnterStyle("right") }}
            aria-label="Próximos programas — arraste para navegar"
          >
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
                const depth = i - progNavIndex;
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

      {isTvExperience && !isVideoChannel && (
        <div className="absolute left-10 bottom-10 z-30 flex items-center gap-5 max-w-[620px] pointer-events-none" aria-live="polite">
          {(musicCover || resolvedMusicCover || musicData?.capa) && (
            <img src={musicCover || resolvedMusicCover || musicData?.capa} alt="" className="w-24 h-24 object-cover shrink-0" />
          )}
          <div className="min-w-0 text-white" style={{ textShadow: "0 2px 16px rgba(0,0,0,.65)" }}>
            <div className="text-2xl font-semibold truncate">{musicData?.titulo || canal?.name || "Rádio ao vivo"}</div>
            <div className="text-lg text-white/75 truncate">{musicData?.artista || empresaNome || ""}</div>
          </div>
        </div>
      )}

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
        className={`absolute bottom-0 left-0 right-0 z-30 px-8 pb-6 ${isTvExperience ? "transition-opacity duration-300" : ""}`}
        style={isTvExperience || isVideoChannel ? controlsStyle : undefined}
      >
        {/* Timeshift — barra intuitiva de "voltar no tempo" (áudio + vídeo) */}
        {(() => {
          const currentOffset = dragVal != null ? TIMESHIFT_WINDOW - dragVal : ts.offset;
          const bufferPct = Math.max(0, Math.min(100, (ts.back / TIMESHIFT_WINDOW) * 100));
          const bufferLeft = 100 - bufferPct;
          const playheadPct = Math.max(0, Math.min(100, (1 - currentOffset / TIMESHIFT_WINDOW) * 100));
          const isLive = currentOffset < 2;
          const _offsetLabel = isLive
            ? "AO VIVO"
            : `-${Math.floor(currentOffset / 60)}:${String(Math.round(currentOffset % 60)).padStart(2, "0")}`;
          void _offsetLabel;
          return (
            <div className={isTvExperience ? "hidden" : "w-full"}>
              {/* Header: hint + return-to-live (só quando afastado do vivo) */}
              <div className="flex items-center justify-between mb-1.5 h-5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                  <Rewind size={11} className="opacity-70" />
                  <span>arraste para voltar no tempo</span>
                </div>
                {!isLive && (
                  <button
                    type="button"
                    onClick={() => { setDragVal(null); seekLive(); flashHint("ao vivo"); }}
                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/90 hover:bg-white text-black text-[10px] font-semibold uppercase tracking-[0.14em] shadow-[0_2px_10px_rgba(255,255,255,0.25)] animate-fade-in transition"
                    data-focusable
                    aria-label="Voltar para transmissão ao vivo"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                    <span>ao vivo</span>
                  </button>
                )}
              </div>

              {/* Barra */}
              <div className="relative group/timeshift">
                {/* trilho */}
                <div className="relative h-2 rounded-full bg-white/[0.08] overflow-visible transition-all duration-200 group-focus-within/timeshift:h-2.5 group-hover/timeshift:h-2.5">
                  {/* Buffer disponível (janela onde é possível voltar) */}
                  <div
                    className="absolute top-0 bottom-0 rounded-full bg-white/15 transition-[left,width] duration-500"
                    style={{ left: `${bufferLeft}%`, width: `${bufferPct}%` }}
                    aria-hidden
                  />
                  {/* Progresso do playhead: do playhead até o vivo (à direita) fica preenchido claro */}
                  <div
                    className="absolute top-0 bottom-0 rounded-full transition-[left,width] duration-500"
                    style={{
                      left: `${playheadPct}%`,
                      right: 0,
                      background: isLive
                        ? "linear-gradient(90deg, rgba(255,255,255,0.75), rgba(255,255,255,0.25))"
                        : "linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,255,255,0.30))",
                    }}
                    aria-hidden
                  />
                  {/* pontinho AO VIVO fixo à direita */}
                  <span
                    className={`absolute -right-0.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${isLive ? "bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.9)]" : "bg-white/40"}`}
                    aria-hidden
                  />
                  {/* Thumb (playhead) — ponto discreto, sem pílula de tempo */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none transition-[left] duration-500"
                    style={{ left: `${playheadPct}%` }}
                    aria-hidden
                  >
                    <div
                      className={`-translate-x-1/2 rounded-full bg-white border border-white/40 shadow-[0_2px_10px_rgba(255,255,255,0.25)] transition-all ${
                        dragVal != null ? "w-4 h-4 scale-110" : "w-3.5 h-3.5 group-hover/timeshift:scale-110"
                      }`}
                    />
                  </div>
                </div>

                {/* Range invisível cobre a área — permite clique/arraste em qualquer ponto */}
                <input
                  type="range"
                  min={0}
                  max={TIMESHIFT_WINDOW}
                  step={1}
                  value={dragVal ?? Math.round(TIMESHIFT_WINDOW - ts.offset)}
                  onChange={(e) => setDragVal(snapToMarkers(Number(e.target.value)))}
                  onMouseUp={commitDrag}
                  onTouchEnd={commitDrag}
                  onPointerUp={commitDrag}
                  onKeyUp={commitDrag}
                  className="absolute inset-x-0 -top-2 -bottom-2 w-full opacity-0 cursor-pointer"
                  aria-label="Voltar até 30 minutos na transmissão"
                  data-tv-focusable
                  data-tv-flat
                  data-tv-scroll="center"
                  data-tv-selected={ts.offset > 1 ? "true" : undefined}
                />
              </div>

              {/* Escala inferior */}
              <div className="mt-1.5 flex justify-between items-center text-[10px] text-white/40 tabular-nums">
                <span>-30:00</span>
                <span className="text-white/30">-15:00</span>
                <span className={isLive ? "text-white/90 font-semibold" : "text-white/60"}>AO VIVO</span>
              </div>
            </div>
          );
        })()}


        {/* control row */}
        <div className="mt-4 grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          {/* Left: voltar + volume */}
          <div className="flex items-center gap-2">
            <PlayerBackButton
              onClick={handleBackHome}
              aria-label="Voltar para Home"
              title="Voltar para Home"
            />

            {(() => {
              const vol = muted ? 0 : volume;
              const expanded = volHover;
              return (
                <div
                  className={`relative flex items-center ${isTvExperience ? "hidden" : ""}`}
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
                      className="w-16 h-16 rounded-full flex items-center justify-center hover:bg-white/10 transition shrink-0"
                      data-tv-focusable
                      data-tv-scroll="center"
                      data-tv-selected={muted ? "true" : undefined}
                      aria-label={muted ? "Ativar som" : "Silenciar"}
                      title={muted ? "Ativar som" : "Silenciar"}
                    >
                      {muted || volume === 0
                        ? <VolumeX size={22} className="text-white/80" />
                        : <Volume2 size={22} className="text-white" />}
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
          </div>

          {/* Center: play/pause + user identification below */}
          <div className="flex flex-col items-center gap-2">
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
            <div className="flex items-center gap-2 whitespace-nowrap">
              <PlayerSlugBadge slug={userSlug} radioName={empresaNome} radioUserId={radioUserId} />
              <div className="relative group">
                <button
                  className="w-5 h-5 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 transition"
                  aria-label="Ajuda"
                  data-focusable
                >
                  <HelpCircle size={11} />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition w-64 p-4 rounded-xl bg-black/95 border border-white/10 text-[11px] leading-relaxed text-white/85 shadow-2xl">
                  <div className="text-white font-semibold mb-2">Atalhos</div>
                  <div>Use as setas ← → ↑ ↓ para navegar entre os botões e cards, Enter para selecionar, Esc para voltar.</div>
                </div>
              </div>
              <img
                src={empresaLogo || nexoPlayerLogo.url}
                alt={empresaNome || "Rádio"}
                className="h-5"
                style={{ opacity: 0.55 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>

          {/* Right: DJ, fullscreen, músicas tocadas, interatividade */}
          <div className="flex items-center gap-2 justify-self-end">
            {/* DJ Mode button */}
            <div className={isTvExperience ? "hidden" : "relative"}>
                <button
                  type="button"
                  onClick={() => setDjModeOn((v) => !v)}
                  onContextMenu={(e) => { e.preventDefault(); setDjPanelOpen((v) => !v); }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all shrink-0 ${djModeActive ? "animate-pulse" : "hover:bg-white/12"}`}
                  style={
                    djModeActive
                      ? {
                          background: "linear-gradient(90deg, rgba(255,0,212,0.32), rgba(0,229,255,0.32))",
                          borderColor: "rgba(255,255,255,0.45)",
                          boxShadow: "0 0 18px rgba(255,0,212,0.5), 0 0 32px rgba(0,229,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.15)",
                        }
                      : {
                          background: "rgba(255,255,255,0.05)",
                          borderColor: "rgba(255,255,255,0.12)",
                        }
                  }
                  title={djModeActive ? "Modo DJ ligado — clique para desligar (clique direito: configurações)" : "Ligar Modo DJ (clique direito: configurações)"}
                  aria-pressed={djModeActive}
                  aria-label={djModeActive ? "Desligar Modo DJ" : "Ligar Modo DJ"}
                  data-focusable
                  data-active={djModeActive || undefined}
                >
                  <Disc3
                    size={24}
                    strokeWidth={2}
                    className="text-white transition-all duration-200"
                    style={{
                      opacity: djModeActive ? 1 : 0.55,
                    }}
                    aria-hidden
                  />
                </button>
                {/* Botão de settings sutil no canto */}
                <button
                  type="button"
                  onClick={() => setDjPanelOpen((v) => !v)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/85 transition"
                  aria-label="Configurações do Modo DJ"
                  title="Configurações do Modo DJ"
                >
                  <Settings size={11} />
                </button>
                {djPanelOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setDjPanelOpen(false)} />
                    <div
                      className="absolute right-0 bottom-[calc(100%+10px)] z-[61] w-[260px] rounded-2xl border border-white/10 bg-black/85 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.7)] p-3"
                      onClick={(e) => e.stopPropagation()}
                      role="dialog"
                      aria-label="Configurações do Modo DJ"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Disc3 size={14} className="text-white/70" />
                        <div className="text-[11px] uppercase tracking-[0.16em] text-white/60 font-medium flex-1">
                          Modo DJ
                        </div>
                      </div>
                      <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
                        <span className="text-[12px] text-white/85">HUD de BPM / temperatura</span>
                        <span
                          role="switch"
                          aria-checked={djHudEnabled}
                          onClick={() => setDjHudEnabled((v) => !v)}
                          className="relative inline-block w-9 h-5 rounded-full transition"
                          style={{
                            background: djHudEnabled ? "rgba(0,229,255,0.55)" : "rgba(255,255,255,0.15)",
                            border: "1px solid rgba(255,255,255,0.18)",
                          }}
                        >
                          <span
                            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                            style={{ left: djHudEnabled ? "18px" : "2px" }}
                          />
                        </span>
                      </label>
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] text-white/85">Sensibilidade</span>
                          <span className="text-[11px] text-white/50 tabular-nums">{Math.round(djSensitivity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={djSensitivity}
                          onChange={(e) => setDjSensitivity(parseFloat(e.target.value))}
                          className="w-full accent-white"
                          aria-label="Sensibilidade do Modo DJ"
                        />
                      </div>
                      <p className="mt-2 text-[10.5px] leading-snug text-white/45">
                        Dica: clique com o botão direito no ícone do disco para reabrir estas configurações.
                      </p>
                    </div>
                  </>
                )}
              </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              className={`${isTvExperience ? "hidden" : ""} w-16 h-16 rounded-full flex items-center justify-center border transition-all shrink-0 ${isFullscreen ? "" : "hover:bg-white/15"}`}
              style={
                isFullscreen
                  ? {
                      background: "rgba(255,255,255,0.22)",
                      borderColor: "rgba(255,255,255,0.45)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.18) inset, 0 0 14px rgba(255,255,255,0.18)",
                    }
                  : {
                      background: "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.12)",
                    }
              }
              aria-label={isFullscreen ? "Sair fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Sair fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen}
              data-focusable
              data-active={isFullscreen || undefined}
            >
              {isFullscreen ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
            </button>
            <div className={isTvExperience ? "hidden" : "relative"}>
              <button
                type="button"
                onClick={() => setPlayedListOpen((v) => !v)}
                className={`w-16 h-16 rounded-full flex items-center justify-center border transition shrink-0 ${playedListOpen ? "bg-white/20 border-white/30" : "bg-white/6 border-white/10 hover:bg-white/15"}`}
                aria-label="Músicas tocadas"
                title="Músicas tocadas"
                aria-expanded={playedListOpen}
                data-focusable
              >
                <ListMusic size={22} />
              </button>
              {playedListOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setPlayedListOpen(false)}
                  />
                  <div
                    className="absolute right-0 bottom-[calc(100%+10px)] z-[61] w-[420px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/85 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] p-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/10 mb-1 sticky top-0 bg-black/85 backdrop-blur-xl z-10">
                      <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center">
                        <ListMusic size={14} className="text-white/70" />
                      </div>
                      <div className="flex-1 text-[11px] uppercase tracking-[0.16em] text-white/60 font-medium">
                        Últimas {history.length} músicas
                      </div>
                      <PlayerBackButton
                        onClick={() => setPlayedListOpen(false)}
                        className="h-7 w-7"
                        iconSize={14}
                        aria-label="Voltar"
                      />
                    </div>
                    {history.length === 0 ? (
                      <div className="px-4 py-8 text-center text-[12px] text-white/50">
                        Nenhuma música registrada ainda.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {history.map((t, i) => (
                          <div
                            key={`${t.horario}-${i}`}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-white/20 hover:bg-white/[0.06] transition-all group"
                          >
                            <div className="flex flex-col items-center w-11 shrink-0">
                              <div className="text-[11px] font-semibold tabular-nums text-white/70">
                                {(t.horario || "").slice(0, 5)}
                              </div>
                              {i === 0 && (
                                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />
                              )}
                            </div>
                            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/8 border border-white/10 group-hover:border-white/25 transition">
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
                              <div className="text-[13px] text-white font-medium truncate leading-snug" title={t.musica}>
                                {t.musica}
                              </div>
                              <div className="text-[11px] uppercase tracking-[0.08em] text-white/55 truncate mt-0.5" title={t.artista}>
                                {t.artista}
                              </div>
                              {t.programa && (
                                <div className="text-[10.5px] text-white/40 truncate mt-0.5" title={t.programa}>
                                  no ar: {t.programa}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {!isCatalog && (
              <InteractivityMenu
                userId={effectiveUserId}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen(!chatOpen)}
                karaokeEnabled={karaokeEnabled}
                onToggleKaraoke={() => setKaraokeEnabled(!karaokeEnabled)}
                showKaraoke={true}
                isVideoChannel={isVideoChannel}
                controlsVisible={controlsVisible}
                isCatalog={isCatalog}
              />
            )}
          </div>
        </div>
      </footer>

      {/* Chat side panel */}
      {chatOpen && (
        <Suspense fallback={null}>
          <PlayerChat channelId={canal?.id || "default"} radioUserId={radioUserId} onClose={() => setChatOpen(false)} shopOpen={false} />
        </Suspense>
      )}

      {/* Letra da música — popup central com scroll */}
      {karaokeEnabled && (
        <Suspense fallback={null}>
          <LyricsPopup
            open={karaokeEnabled}
            artist={musicData?.artista}
            title={musicData?.titulo}
            duration={musicData?.duracao}
            onClose={() => setKaraokeEnabled(false)}
          />
        </Suspense>
      )}

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
  hideBadge = false,
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
  hideBadge?: boolean;
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
  const showBadge = !hideBadge && (isLive || isFirst);

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
  isVideoChannel = false,
  controlsVisible = true,
  isCatalog = false,
}: {
  userId: string | null;
  chatOpen: boolean;
  onToggleChat: () => void;
  karaokeEnabled: boolean;
  onToggleKaraoke: () => void;
  showKaraoke?: boolean;
  isVideoChannel?: boolean;
  controlsVisible?: boolean;
  isCatalog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [menuLayout, setMenuLayout] = useState<"centered" | "aligned">("aligned");
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasNotif = !!activePoll && !alreadyVoted;

  // Detecta layout pequeno/retrato para posicionar o menu sem cortar
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPortrait = vh > vw;
      setMenuLayout(vw < 768 || isPortrait ? "centered" : "aligned");
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Busca enquete ativa (data = hoje, horário dentro do intervalo)
  // Ouvintes não têm permissão de leitura direta na tabela, então usamos a
  // edge function pública como fonte principal e a query direta como fallback.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const applyPoll = (poll: ActivePoll | null) => {
      if (cancelled) return;
      setActivePoll(poll);
      if (poll) {
        setAlreadyVoted(!!localStorage.getItem(`nexo:poll:voted:${poll.id}`));
      }
    };

    const fetchActive = async () => {
      try {
        const { data: fnData } = await supabase.functions.invoke("public-enquete-ativa", {
          body: { user_id: userId },
        });
        if (cancelled) return;
        if (fnData?.ok) {
          const p = fnData.poll;
          applyPoll(
            p
              ? {
                  id: p.id,
                  pergunta: p.pergunta,
                  respostas: (p.respostas ?? []) as string[],
                  horario_inicio: p.horario_inicio,
                  horario_fim: p.horario_fim,
                }
              : null,
          );
          return;
        }
      } catch { /* segue para o fallback */ }

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
        if (!data) { applyPoll(null); return; }
        const respostas = [data.resposta1, data.resposta2, data.resposta3, data.resposta4].filter(Boolean) as string[];
        applyPoll({
          id: data.id,
          pergunta: data.pergunta,
          respostas,
          horario_inicio: data.horario_inicio,
          horario_fim: data.horario_fim,
        });
      } catch { /* silencioso */ }
    };
    fetchActive();
    const id = window.setInterval(fetchActive, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [userId]);

  // Fecha submenu ao clicar fora (incluindo o menu renderizado via portal)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Delay para fechar no mouseLeave para dar tempo do usuário mover o mouse
  const closeTimeoutRef = useRef<number | null>(null);
  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpen(true);
  };
  const handleMouseLeave = () => {
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 800); // 800ms de delay para não fechar instantaneamente
  };

  // Timer para o auto-show do botão de interatividade em canais de vídeo
  const [autoShowVisible, setAutoShowVisible] = useState(false);
  const autoShowTimeoutRef = useRef<number | null>(null);
  const initialShowTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isVideoChannel || isCatalog) {
      setAutoShowVisible(false);
      return;
    }

    // Só auto-mostra se os controles do player NÃO estiverem visíveis
    const shouldShow = !controlsVisible && !open;

    const hideAutoShow = () => {
      setAutoShowVisible(false);
      if (autoShowTimeoutRef.current) {
        window.clearTimeout(autoShowTimeoutRef.current);
        autoShowTimeoutRef.current = null;
      }
    };

    const showAutoShow = () => {
      if (!shouldShow) return;
      setAutoShowVisible(true);
      autoShowTimeoutRef.current = window.setTimeout(hideAutoShow, 15000); // Fica por 15 segundos
    };

    // 1. A cada 2 minutos (120s)
    const intervalId = window.setInterval(showAutoShow, 120000);

    // 2. Primeira vez após 10 segundos
    initialShowTimeoutRef.current = window.setTimeout(showAutoShow, 10000);

    return () => {
      window.clearInterval(intervalId);
      if (autoShowTimeoutRef.current) window.clearTimeout(autoShowTimeoutRef.current);
      if (initialShowTimeoutRef.current) window.clearTimeout(initialShowTimeoutRef.current);
    };
  }, [isVideoChannel, controlsVisible, open]);

  // Se o usuário interagir, fecha o autoShow
  useEffect(() => {
    if (open || controlsVisible) setAutoShowVisible(false);
  }, [open, controlsVisible]);

  return (
    <div ref={wrapRef} className="relative">
      {/* Botão principal — icon-only com borda animada */}
      <div 
        className={`relative flex items-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isVideoChannel && !controlsVisible && !open && !autoShowVisible
            ? "opacity-0 translate-y-8 pointer-events-none"
            : "opacity-100 translate-y-0 pointer-events-auto"
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Interatividade"
          aria-expanded={open}
          aria-pressed={open}
          data-focusable
          data-active={open || undefined}
          className="relative h-16 w-16 rounded-full flex items-center justify-center outline-none group overflow-hidden z-20"
          style={{ padding: 2 }}
        >
          {/* borda animada (conic gradient girando) */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, #ff3355, #ffb63b, #7bd3ff, #b76bff, #ff3355)",
              animation: "interactSpin 3.6s linear infinite",
              filter: "saturate(1.15)",
            }}
          />
          {/* halo suave */}
          <span
            aria-hidden
            className={`absolute -inset-[3px] rounded-full blur-[6px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-70"}`}
            style={{
              background: "conic-gradient(from 0deg, rgba(255,51,85,.5), rgba(255,182,59,.5), rgba(123,211,255,.5), rgba(183,107,255,.5), rgba(255,51,85,.5))",
              animation: "interactSpin 3.6s linear infinite",
            }}
          />
          {/* núcleo */}
          <span
            className="relative z-10 h-full w-full rounded-full flex items-center justify-center"
            style={{
              background: open ? "linear-gradient(135deg, #1a0b1f 0%, #0b0b10 60%)" : "#0b0b10",
              boxShadow: open ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : "none",
            }}
          >
            {open ? (
              <X size={24} className="text-white animate-in fade-in zoom-in duration-200" strokeWidth={2.5} />
            ) : (
              <Sparkles size={24} className="text-white animate-in fade-in zoom-in duration-200" strokeWidth={2.2} />
            )}
          </span>
          {hasNotif && !open && (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 z-30 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#0b0b10]"
              style={{ animation: "interactPulse 1.6s ease-out infinite" }}
            />
          )}
        </button>

        {/* Botões que surgem acima no mouseover */}
        <div 
          className={`absolute bottom-full left-0 right-0 mb-4 flex flex-col items-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-8 pointer-events-none"
          }`}
        >
          <button
            onClick={() => { setPollOpen(true); setOpen(false); }}
            disabled={!activePoll}
            className={`w-16 h-16 rounded-full flex items-center justify-center bg-black/80 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110 active:scale-95 ${!activePoll ? "opacity-40 grayscale" : ""}`}
            title="Enquete"
          >
            <BarChart3 size={24} />
            {hasNotif && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-black" />}
          </button>
          
          {showKaraoke && (
            <button
              onClick={() => { onToggleKaraoke(); setOpen(false); }}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-black/80 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110 active:scale-95"
              title="Letra"
            >
              <Mic size={24} />
            </button>
          )}
          
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleChat();
              setOpen(false);
            }}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-black/80 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110 active:scale-95"
            title="Chat"
          >
            <MessageSquare size={24} />
          </button>
        </div>
      </div>

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Encerra apenas o contexto do popup voltando ao menu anterior (onClose)
        // sem fechar outros contextos globais do player
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const submit = (idx: number) => {
    if (submitted) return;
    setSelected(idx);
    setSubmitted(true);
    onVoted(idx);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-8 pointer-events-none"
      style={{
        background: visible ? "rgba(0,0,0,0.5)" : "transparent",
        transition: "background 300ms ease",
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[420px] flex flex-col gap-6 pointer-events-auto animate-in fade-in zoom-in-95 duration-300"
        style={{
          padding: "32px",
          borderRadius: 40,
          background: "rgba(35,35,38,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.95)",
          transition: "opacity 300ms ease-out, transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/60 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/50">Participar da conversa</span>
            </div>
            <h3 className="text-white font-bold text-2xl leading-tight tracking-tight pr-4">
              {poll.pergunta}
            </h3>
          </div>
          <button
            onClick={requestClose}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {poll.respostas.map((opt, i) => {
            const isSelected = selected === i;
            return (
              <button
                key={i}
                onClick={() => submit(i)}
                disabled={submitted}
                className="w-full relative py-4 px-6 rounded-2xl text-left transition-all overflow-hidden group"
                style={{
                  background: isSelected
                    ? "rgba(255,255,255,1)"
                    : "rgba(255,255,255,0.06)",
                  border: isSelected
                    ? "1px solid rgba(255,255,255,1)"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isSelected ? "0 8px 24px -6px rgba(255,255,255,0.3)" : "none",
                }}
                data-focusable
              >
                <div className="flex items-center justify-between relative z-10">
                  <span
                    className="text-base font-semibold tracking-tight transition-colors"
                    style={{ color: isSelected ? "#000" : "rgba(255,255,255,0.9)" }}
                  >
                    {opt}
                  </span>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center animate-scale-in">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                {submitted && !isSelected && (
                  <div className="absolute inset-0 bg-white/5 opacity-50" />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[12px] text-white/40 text-center leading-relaxed font-medium">
          {submitted ? "Obrigado por participar!" : "Exibir informações do programa em tempo real ao lado do player quando eu selecionar um canal."}
        </p>
      </div>
    </div>,
    document.body
  );
}




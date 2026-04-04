import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import type HlsType from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { usePlayerColors } from "@/hooks/usePlayerColors";
import { useLocation, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  Volume1,
  Volume2,
  VolumeX,
  MessageSquare,
  Loader2,
  List,
  X,
  Captions,
  CaptionsOff,
  Mic,
  MicVocal,
  Heart,
  Home,
  Radio,
  Film,
  ShoppingBag,
  ShoppingCart,
  Settings2,
  PictureInPicture,
  Cast,
  LogOut,
} from "lucide-react";

const PlayerChat = lazy(() => import("@/components/PlayerChat"));
const AudioSpectrum = lazy(() => import("@/components/AudioSpectrum"));
const AudioDualCard = lazy(() => import("@/components/AudioDualCard"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
const KaraokeOverlay = lazy(() => import("@/components/KaraokeOverlay"));
import PlayerShopProduct from "@/components/player/PlayerShopProduct";
import PreRollOverlay from "@/components/PreRollOverlay";
import { saveMiniPlayerData, clearMiniPlayerData, unlockAndPrepareMiniAudio, destroyMiniAudio } from "@/components/player/MiniPlayerWidget";
import PlayerSkeleton from "@/components/skeletons/PlayerSkeleton";

import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";

// Dynamic HLS loader — cached after first import
let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) {
    hlsModule = await import("hls.js");
  }
  return hlsModule.default;
};

interface YoutubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface Canal {
  id: string;
  numero_canal: string;
  name: string;
  logo_url: string;
  url: string;
  type: string;
  active: boolean;
  cover_url: string;
  background_url: string;
  catalog_name?: string;
  estudio?: string;
}

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
  ativo: boolean;
  selo: string | null;
  estudio: string | null;
  variavel: boolean;
  data_variavel: string | null;
  capa: string | null;
  thumb: string | null;
  descricao: string | null;
  apresentador_id: string | null;
}

interface Apresentador {
  id: string;
  nome: string;
  foto: string | null;
  instagram: string | null;
}

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
  horario?: string;
}

interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  stock: number;
  program_id: string | null;
  payment_url: string | null;
}

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";
const MUSIC_SYNC_EVENT = "masterview:music-sync";

const DAY_MAP_SHORT: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
const DAY_MAP_FULL: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };

const matchesCampaignDay = (diasSemana: string[] | null | undefined, now: Date) => {
  if (!diasSemana || diasSemana.length === 0) return true;
  const todayShort = DAY_MAP_SHORT[now.getDay()];
  const todayFull = DAY_MAP_FULL[now.getDay()];
  return diasSemana.includes(todayShort) || diasSemana.includes(todayFull);
};

const filterCampaignsByType = (campaigns: any[] | null | undefined, now: Date, isMidroll: boolean) => {
  const todayStr = now.toISOString().slice(0, 10);
  return (campaigns || []).filter((p: any) => {
    if (!matchesCampaignDay(p.dias_semana, now)) return false;
    if (p.data_inicial && todayStr < p.data_inicial) return false;
    if (p.data_final && todayStr > p.data_final) return false;
    return Boolean(p.is_midroll) === isMidroll;
  });
};

const normalizeChannelNumber = (num?: string | null) => (num || "").replace(/\s+/g, "").toLowerCase();

const normalizeLivePlaylistUrl = (url: string, type: string) => {
  const isLiveMedia = type === "video_live" || type === "audio_live";
  if (!isLiveMedia || !url.includes(".m3u8")) return url;

  // Some providers rotate `chunklist_w*.m3u8`; forcing the stable master playlist
  // prevents stale chunklist locks and reduces green/pixelated live playback.
  return url.replace(/\/chunklist_w\d+\.m3u8(\?.*)?$/i, "/playlist.m3u8");
};

const resetMediaElement = (media: HTMLMediaElement | null) => {
  if (!media) return;
  try { media.pause(); } catch {}
  try { media.removeAttribute("src"); } catch {}
  try { media.srcObject = null; } catch {}
  try { media.load(); } catch {}
};

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const normalizeYoutubeVideoId = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (YOUTUBE_VIDEO_ID_RE.test(raw)) return raw;
  const match = raw.match(/[a-zA-Z0-9_-]{11}/);
  return match?.[0] || null;
};

const extractYoutubeVideoId = (input?: string | null) => {
  const raw = (input || "").trim();
  if (!raw) return null;
  const direct = normalizeYoutubeVideoId(raw);
  if (direct) return direct;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const byQuery = normalizeYoutubeVideoId(parsed.searchParams.get("v"));
    if (byQuery) return byQuery;

    if (host === "youtu.be") {
      return normalizeYoutubeVideoId(parsed.pathname.split("/").filter(Boolean)[0] || "");
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIdx = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
    if (markerIdx >= 0) {
      return normalizeYoutubeVideoId(parts[markerIdx + 1] || "");
    }
  } catch {
    // ignore and fallback below
  }

  return normalizeYoutubeVideoId(raw);
};

function getCurrentProgram(programas: Programa[]): Programa | null {
  const now = new Date();
  const todayShort = DAY_MAP_SHORT[now.getDay()];
  const todayFull = DAY_MAP_FULL[now.getDay()];
  const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

  return (
    programas.find((p) => {
      if (!p.ativo) return false;
      const dias = p.dias_semana || [];
      const inDay = dias.length === 0 || dias.includes(todayShort) || dias.includes(todayFull);
      return inDay && currentTime >= p.horario_inicio.slice(0, 5) && currentTime < p.horario_fim.slice(0, 5);
    }) || null
  );
}

function getNextProgram(programas: Programa[], current: Programa | null): Programa | null {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
  const todayShort = DAY_MAP_SHORT[now.getDay()];
  const todayFull = DAY_MAP_FULL[now.getDay()];

  const afterTime = current ? current.horario_fim.slice(0, 5) : currentTime;
  const todayNext = programas
    .filter((p) => p.ativo && p.horario_inicio.slice(0, 5) >= afterTime)
    .filter((p) => {
      const dias = p.dias_semana || [];
      return dias.length === 0 || dias.includes(todayShort) || dias.includes(todayFull);
    })
    .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));

  if (todayNext.length > 0) return todayNext[0];

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowShort = DAY_MAP_SHORT[tomorrow.getDay()];
  const tomorrowFull = DAY_MAP_FULL[tomorrow.getDay()];

  const tomorrowNext = programas
    .filter((p) => p.ativo)
    .filter((p) => {
      const dias = p.dias_semana || [];
      return dias.length === 0 || dias.includes(tomorrowShort) || dias.includes(tomorrowFull);
    })
    .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));

  return tomorrowNext[0] || null;
}

function getProgramProgress(prog: Programa | null): number {
  if (!prog) return 0;
  const now = new Date();
  const [sh, sm] = prog.horario_inicio.split(":").map(Number);
  const [eh, em] = prog.horario_fim.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin <= startMin) return 50;
  return Math.min(100, Math.max(0, ((nowMin - startMin) / (endMin - startMin)) * 100));
}

// Unified buffering hook for video/audio elements
function useBufferingDetection(videoRef: React.RefObject<HTMLVideoElement | null>, audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const elements = [video, audio].filter(Boolean) as HTMLMediaElement[];
    if (elements.length === 0) return;

    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    
    elements.forEach(el => {
      el.addEventListener("waiting", onWaiting);
      el.addEventListener("playing", onReady);
      el.addEventListener("canplay", onReady);
    });
    return () => {
      elements.forEach(el => {
        el.removeEventListener("waiting", onWaiting);
        el.removeEventListener("playing", onReady);
        el.removeEventListener("canplay", onReady);
      });
    };
  }, [videoRef, audioRef]);

  return { buffering, setBuffering };
}

// Conditional marquee: only scrolls when text overflows container
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        const containerW = containerRef.current.offsetWidth;
        const textW = textRef.current.scrollWidth;
        const isOverflow = textW > containerW + 2;
        setOverflow(isOverflow);
        if (isOverflow) {
          textRef.current.style.setProperty("--marquee-distance", `${containerW - textW}px`);
        }
      }
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="overflow-hidden mt-0.5" style={{ maxWidth: "100%" }}>
      <div ref={textRef} className={`whitespace-nowrap inline-block marquee-scroll ${className || ""}`} data-overflow={overflow}>
        {text}
      </div>
    </div>
  );
}

export default function PlayerPage() {
  usePageTitle("Player");
  useLayoutColors();
  const [playerColorUserId, setPlayerColorUserId] = useState<string | null>(null);
  usePlayerColors(playerColorUserId);
  const { userSlug } = useParams<{ userSlug?: string }>();
  const [searchParams] = useSearchParams();
  const requestedChannelId = searchParams.get("ch");
  const requestedVideoId = searchParams.get("vid");
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicMode = !!userSlug;
  const playerHomePath = useMemo(() => userSlug ? `/user/${userSlug}/nexohub/player?step=home` : "/user/nexohub/player?step=home", [userSlug]);
  const { user, loading: authLoading, signOut } = useAuth();
  const userId = user?.id ?? null;

  // Diagnostic logs — disabled in production
  // useEffect(() => { console.log("[PLAYER-DIAG] Auth/user state changed", { userId, authLoading }); }, [userId, authLoading]);

  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const publicBootstrapRef = useRef<{ slug: string | null; loaded: boolean }>({ slug: null, loaded: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const autoplayMutedRef = useRef(false);
  const [volume, setVolume] = useState(80);
  const volumeRef = useRef(80);
  const [volumeHover, setVolumeHover] = useState(false);
  const volumeHideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Iniciando...");
   const [barVisible, setBarVisible] = useState(true);
   const [backBtnVisible, setBackBtnVisible] = useState(false);
  const [pageFadeOut, setPageFadeOut] = useState(false);
  const [musicData, setMusicData] = useState<MusicData | null>(() => {
    // In public mode, don't initialize from localStorage (it belongs to the logged-in user)
    if (isPublicMode) return null;
    try {
      const stored = localStorage.getItem(MUSIC_DATA_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [youtubeVideos, setYoutubeVideos] = useState<YoutubeVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(true);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [whatsappPhone, setWhatsappPhone] = useState<string | null>(null);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);

  // Spectrum style preference
  const [spectrumStyle, setSpectrumStyle] = useState<import("@/components/AudioSpectrum").SpectrumStyle>(() => {
    try { return (localStorage.getItem("nexo_spectrum_style") as any) || "bars"; } catch { return "bars"; }
  });
  const handleSpectrumStyleChange = useCallback((s: import("@/components/AudioSpectrum").SpectrumStyle) => {
    setSpectrumStyle(s);
    localStorage.setItem("nexo_spectrum_style", s);
    // Persist to user_settings if logged in
    if (user) {
      void mergeUserDashboardItems(user.id, { spectrum_style: s }).catch(() => {});
    }
  }, [user]);

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

  // Load spectrum style preference from user_settings
  useEffect(() => {
    const effectiveId = isPublicMode ? publicUserId : (user?.id || publicUserId);
    if (!effectiveId) return;
    supabase.from("user_settings").select("dashboard_items, shopping_active").eq("user_id", effectiveId).maybeSingle().then(({ data }) => {
      const items = (data?.dashboard_items as any) || {};
      if (items.spectrum_style) {
        setSpectrumStyle(items.spectrum_style);
        localStorage.setItem("nexo_spectrum_style", items.spectrum_style);
      }
      if (data && typeof (data as any).shopping_active === "boolean") {
        setShopActive((data as any).shopping_active);
      }
    });
  }, [user, publicUserId]);


  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Closed Captions state — Web SpeechRecognition
  const [ccEnabled, setCcEnabled] = useState(false);
  const [ccText, setCcText] = useState("");
  const [ccLoading, setCcLoading] = useState(false);
  const ccRecognitionRef = useRef<any>(null);
  const ccIsListeningRef = useRef(false);
  const ccClearTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [channelNavDir, setChannelNavDir] = useState<1 | -1>(1);
  const [channelAnimKey, setChannelAnimKey] = useState(0);
  const [musicAnimKey, setMusicAnimKey] = useState(0);
  const prevMusicRef = useRef<string>("");

  const canal = canais[currentIndex] || null;
  const liveChannels = useMemo(
    () => canais.filter((c) => c.type === "audio_live" || c.type === "video_live"),
    [canais]
  );
  const isAudio = canal?.type === "audio_live" || canal?.type === "audio";
  const isYoutube = canal?.type === "youtube" || canal?.type === "catalog";
  const isCatalog = canal?.type === "catalog";
  const isVideo = canal?.type === "video" || canal?.type === "video_live";
  const isAutoplayChannel = useCallback((c?: Canal | null) => normalizeChannelNumber(c?.numero_canal) === "991-1", []);
  const autoPlayedRef = useRef(false);
  
  const is991Channel = normalizeChannelNumber(canal?.numero_canal) === "991-1" || normalizeChannelNumber(canal?.numero_canal) === "991-2" || isCatalog;

  const handleHomeClick = useCallback(() => {
    clearMiniPlayerData();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPageFadeOut(true);
    setTimeout(() => navigate(playerHomePath), 400);
  }, [playerHomePath, navigate]);

  // Record watch history when channel changes
  const watchHistoryRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canal || !userId || canal.id === watchHistoryRecordedRef.current) return;
    watchHistoryRecordedRef.current = canal.id;
    
    const recordHistory = async () => {
      const { error } = await supabase.from("watch_history").insert({
        user_id: userId,
        channel_id: canal.id,
        channel_name: canal.name,
        channel_cover_url: canal.cover_url || "",
        channel_logo_url: canal.logo_url || "",
        channel_type: canal.type,
      });
      if (error) {
        console.error("[WATCH-HISTORY] Insert error:", error);
      } else {
        console.log("[WATCH-HISTORY] Recorded:", canal.name);
      }
    };
    recordHistory();
  }, [canal?.id, userId]);

  // Shopping & Pre-Roll state
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopPopupDismissed, setShopPopupDismissed] = useState(true);
  const [shopActive, setShopActive] = useState(true);
  const [shopProductIndex, setShopProductIndex] = useState(0);
  const shopPopupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prerollUrl, setPrerollUrl] = useState<string | null>(null);
  const [prerollLinkUrl, setPrerollLinkUrl] = useState<string | null>(null);
  const [prerollMediaType, setPrerollMediaType] = useState<string>("video");
  const [prerollYoutubeUrl, setPrerollYoutubeUrl] = useState<string | null>(null);
  const [prerollBackgroundUrl, setPrerollBackgroundUrl] = useState<string | null>(null);
  const [prerollAspectRatio, setPrerollAspectRatio] = useState<string>("16:9");
  const [prerollVideoPosition, setPrerollVideoPosition] = useState<string>("center");
  const [prerollDone, setPrerollDone] = useState(!requestedChannelId); // Pre-roll enabled for catalog/deep-link channels
  const [prerollShowing, setPrerollShowing] = useState(false);
  const prerollVideoRef = useRef<HTMLVideoElement>(null);
  const prerollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmedPrerollChannelIdRef = useRef<string | null>(null);
  const warmupAbortRef = useRef<AbortController | null>(null);
  const isPrerollVisible = Boolean((prerollUrl || (prerollMediaType === "youtube" && prerollYoutubeUrl)) && (!prerollDone || prerollShowing));

  // Top bar auto-hide logic
  const [topBarVisible, setTopBarVisible] = useState(true);
  const topBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTopBarTimer = useCallback(() => {
    setTopBarVisible(true);
    if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current);
    topBarTimerRef.current = setTimeout(() => setTopBarVisible(false), 2000);
  }, []);

  useEffect(() => {
    if (playing && !isCatalog && !isYoutube) {
      resetTopBarTimer();
    }
    return () => { if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current); };
  }, [playing, isCatalog, isYoutube, resetTopBarTimer]);

  // Mid-roll state for YouTube
  const [midrollActive, setMidrollActive] = useState(false);
  const [midrollResumeTime, setMidrollResumeTime] = useState(0);
  const midrollTriggeredRef = useRef<Set<number>>(new Set());
  const [midrollPreroll, setMidrollPreroll] = useState<{ url: string; linkUrl: string | null; mediaType: string; youtubeUrl: string | null } | null>(null);
  const [midrollFading, setMidrollFading] = useState<"out" | "in" | null>(null);
  // Mid-roll queue: up to 3 consecutive ads
  const [midrollQueue, setMidrollQueue] = useState<{ url: string; linkUrl: string | null; mediaType: string; youtubeUrl: string | null }[]>([]);
  const [midrollIndex, setMidrollIndex] = useState(0);
  const [midrollTotal, setMidrollTotal] = useState(0);

  // Unified buffering detection
  const { buffering, setBuffering } = useBufferingDetection(videoRef, audioRef);
  const [streamStalled, setStreamStalled] = useState(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // HLS Quality selector state
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number; index: number }[]>([]);
  const [hlsCurrentLevel, setHlsCurrentLevel] = useState(-1); // -1 = auto
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);

  // Karaoke state
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [karaokeVisible, setKaraokeVisible] = useState(false);

  // SpeechRecognition-based CC: transcribes audio in real-time
  const startCCRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCcText("⚠️ Navegador não suporta reconhecimento de fala");
      setCcLoading(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript = event.results[i][0].transcript;
      }
      if (transcript) {
        setCcText(transcript);
        // Clear after 5s of no new results
        if (ccClearTimeoutRef.current) clearTimeout(ccClearTimeoutRef.current);
        ccClearTimeoutRef.current = setTimeout(() => setCcText(""), 5000);
      }
    };

    recognition.onend = () => {
      if (ccIsListeningRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setCcText("⚠️ Permissão de microfone negada");
        ccIsListeningRef.current = false;
        setCcEnabled(false);
        setCcLoading(false);
      } else if (event.error === "no-speech") {
        // Normal, will auto-restart via onend
      } else {
        console.warn("CC error:", event.error);
      }
    };

    ccRecognitionRef.current = recognition;
    ccIsListeningRef.current = true;
    setCcLoading(true);
    try {
      recognition.start();
      setCcLoading(false);
      setCcText("🎙️ Ouvindo...");
    } catch {
      setCcLoading(false);
    }
  }, []);

  const stopCCRecognition = useCallback(() => {
    ccIsListeningRef.current = false;
    ccRecognitionRef.current?.stop();
    ccRecognitionRef.current = null;
    setCcText("");
    if (ccClearTimeoutRef.current) clearTimeout(ccClearTimeoutRef.current);
  }, []);

  const toggleCC = useCallback(() => {
    if (ccEnabled) {
      setCcEnabled(false);
      stopCCRecognition();
    } else {
      setCcEnabled(true);
      startCCRecognition();
    }
  }, [ccEnabled, startCCRecognition, stopCCRecognition]);

  useEffect(() => { return () => { stopCCRecognition(); }; }, [stopCCRecognition]);

  // Music like state
  const [liked, setLiked] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number; delay: number }[]>([]);
  

  useEffect(() => {
    // Reset like state on every music change
    setLiked(false);
    const musicKey = `${musicData?.titulo}||${musicData?.artista}`;
    if (musicKey !== prevMusicRef.current) {
      prevMusicRef.current = musicKey;
      setMusicAnimKey(prev => prev + 1);
    }
  }, [musicData?.titulo, musicData?.artista]);

  const toggleLike = useCallback(async () => {
    if (!user || !musicData?.titulo || !musicData?.artista || liked) return;
    await supabase.from("music_likes").insert({ user_id: user.id, titulo: musicData.titulo, artista: musicData.artista, capa: musicData.capa || "" });
    setLiked(true);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 600);
    const hearts = Array.from({ length: 6 }, (_, i) => ({ id: Date.now() + i, x: Math.random() * 40 - 20, delay: Math.random() * 0.3 }));
    setFloatingHearts(hearts);
    setTimeout(() => setFloatingHearts([]), 1500);
  }, [user, musicData, liked]);

  // Fetch all initial data — 3 stages for fastest possible first paint
  useEffect(() => {
    let cancelled = false;
    const slug = userSlug ?? null;

    // PUBLIC MODE: fetch via edge function (bootstrap only once per slug)
    if (isPublicMode) {
      const alreadyBootstrapped = publicBootstrapRef.current.loaded && publicBootstrapRef.current.slug === slug;
      if (alreadyBootstrapped) {
        return () => { cancelled = true; };
      }

      if (!slug) {
        setCanais([]);
        setPrerollDone(true);
        setLoading(false);
        return () => { cancelled = true; };
      }

      publicBootstrapRef.current = { slug, loaded: false };
      setLoading(true);
      setLoadingStatus("Carregando canais...");

      supabase.functions.invoke("public-player-data", { body: { slug } })
        .then(({ data, error }) => {
          if (cancelled) return;
          publicBootstrapRef.current = { slug, loaded: true };

          if (error || !data) {
            setCanais([]);
            setPrerollDone(true);
            setLoading(false);
            return;
          }

          setPublicUserId(data.userId);
          setPlayerColorUserId(data.userId);
          setCanais(((data.channels || []) as Canal[]).filter(c => c.type !== "catalog" || c.id === requestedChannelId));
          setProgramas((data.programas || []) as Programa[]);
          setApresentadores((data.apresentadores || []) as Apresentador[]);
          setShopProducts(data.shopProducts || []);
          if (data.empresa?.telefone_participacao) setWhatsappPhone(data.empresa.telefone_participacao);
          if (data.empresa?.logo) setEmpresaLogo(data.empresa.logo);

          const now = new Date();
          const prerolls = filterCampaignsByType(data.prerolls || [], now, false);

          if (prerolls.length > 0 && !prerollDone) {
            const selected = prerolls[Math.floor(Math.random() * prerolls.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl(selected.link_url || null);
            setPrerollMediaType(selected.media_type || "video");
            setPrerollYoutubeUrl(selected.youtube_url || null);
            setPrerollBackgroundUrl((selected as any).background_url || null);
            setPrerollAspectRatio((selected as any).aspect_ratio || "16:9");
            setPrerollVideoPosition((selected as any).video_position || "center");
          } else {
            setPrerollDone(true);
          }

          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          publicBootstrapRef.current = { slug, loaded: true };
          setCanais([]);
          setPrerollDone(true);
          setLoading(false);
        });

      return () => { cancelled = true; };
    }

    // leaving public mode resets bootstrap guard
    publicBootstrapRef.current = { slug: null, loaded: false };

    // AUTHENTICATED MODE (original logic)
    if (authLoading) { setLoadingStatus("Autenticando..."); return; }
    if (!userId) { setCanais([]); setLoading(false); return; }

    const fetchAll = async () => {
      setLoading(true);
      setLoadingStatus("Carregando canais...");

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      try {
        // STAGE 1 — Critical: only channels + preroll (show UI ASAP)
        const [channelsRes, prerollRes] = await Promise.all([
          supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
          !prerollDone
            ? supabase.from("comercial_preroll").select("*").eq("user_id", userId).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true })
            : Promise.resolve({ data: null, error: null } as const),
        ]);
        if (cancelled) return;

        let canaisData = channelsRes.data as Canal[] | null;
        let channelsError = channelsRes.error;

        // No fallback to all channels — only show channels belonging to the authenticated user

        if (!channelsError && canaisData) {
          setCanais(canaisData.filter(c => c.type !== "catalog" || c.id === requestedChannelId));
        } else {
          setCanais([]);
        }

        if (!prerollDone && prerollRes.data && prerollRes.data.length > 0) {
          const matching = filterCampaignsByType(prerollRes.data || [], now, false);
          if (matching.length > 0) {
            const selected = matching[Math.floor(Math.random() * matching.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl((selected as any).link_url || null);
            setPrerollMediaType((selected as any).media_type || "video");
            setPrerollYoutubeUrl((selected as any).youtube_url || null);
            setPrerollBackgroundUrl((selected as any).background_url || null);
            setPrerollAspectRatio((selected as any).aspect_ratio || "16:9");
            setPrerollVideoPosition((selected as any).video_position || "center");
          } else {
            setPrerollDone(true);
          }
        } else if (!prerollDone) {
          setPrerollDone(true);
        }

        // UI is now visible — release loading gate
        setLoading(false);

        // STAGE 2 — Secondary: programas + apresentadores + empresa
        const [programasRes, apresentadoresRes, empresaRes] = await Promise.all([
          supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, thumb, descricao, apresentador_id").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%").order("horario_inicio"),
          supabase.from("apresentadores").select("id, nome, foto, instagram").eq("user_id", userId).eq("ativo", true),
          supabase.from("empresa_config").select("telefone_participacao, logo").eq("user_id", userId).maybeSingle(),
        ]);
        if (cancelled) return;

        const fetchedProgramas = (!programasRes.error && programasRes.data) ? programasRes.data as Programa[] : [];
        setProgramas(fetchedProgramas);
        if (!apresentadoresRes.error && apresentadoresRes.data) setApresentadores(apresentadoresRes.data as Apresentador[]);
        if (!empresaRes.error && empresaRes.data?.telefone_participacao) setWhatsappPhone(empresaRes.data.telefone_participacao);
        if (!empresaRes.error && empresaRes.data?.logo) setEmpresaLogo(empresaRes.data.logo);

        // STAGE 3 — Deferred: shop products
        const currentProg = getCurrentProgram(fetchedProgramas);
        let shopQuery = supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", userId).eq("active", true).gt("stock", 0);
        if (currentProg) {
          shopQuery = shopQuery.or(`program_id.eq.${currentProg.id},program_id.is.null`);
        } else {
          shopQuery = shopQuery.is("program_id", null);
        }
        const { data: shopData } = await shopQuery;
        if (!cancelled && shopData && shopData.length > 0) setShopProducts(shopData);
      } catch (error) {
        if (cancelled) return;
        setCanais([]);
        if (!prerollDone) setPrerollDone(true);
        setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [authLoading, isPublicMode, userId, userSlug]);

  // While pre-roll is visible, warm up channel 991-1 (or first audio channel) in background
  useEffect(() => {
    if (!isPrerollVisible || canais.length === 0) return;

    const target =
      canais.find((c) => isAutoplayChannel(c) && (c.type === "audio_live" || c.type === "audio")) ||
      canais.find((c) => c.type === "audio_live" || c.type === "audio");

    if (!target || warmedPrerollChannelIdRef.current === target.id) return;
    warmedPrerollChannelIdRef.current = target.id;

    warmupAbortRef.current?.abort();
    const controller = new AbortController();
    warmupAbortRef.current = controller;

    (async () => {
      try {
        if (target.url.includes(".m3u8")) {
          await getHls().catch(() => null);
        }
        const warmUrl = target.url.includes("?") ? `${target.url}&warmup=1` : `${target.url}?warmup=1`;
        await fetch(warmUrl, {
          method: "GET",
          cache: "no-store",
          mode: "no-cors",
          signal: controller.signal,
        }).catch(() => null);
      } catch {
        // warmup is best-effort only
      }
    })();

    return () => controller.abort();
  }, [canais, isAutoplayChannel, isPrerollVisible]);

  // Refresh shopping products periodically
  useEffect(() => {
    const ownerId = isPublicMode ? publicUserId : user?.id;
    if (!ownerId || programas.length === 0) return;
    const fetchShop = async () => {
      const currentProg = getCurrentProgram(programas);
      let query = supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", ownerId).eq("active", true).gt("stock", 0);
      if (currentProg) query = query.or(`program_id.eq.${currentProg.id},program_id.is.null`);
      else query = query.is("program_id", null);
      const { data } = await query;
      if (data) setShopProducts(data);
    };
    // In public mode, don't refresh via direct queries (RLS blocks it)
    if (isPublicMode) return;
    const interval = setInterval(fetchShop, 30000);
    return () => clearInterval(interval);
  }, [user, programas]);

  // Fetch YouTube playlist videos OR handle individual video URLs
  useEffect(() => {
    if (!isYoutube || !canal?.url) {
      setYoutubeVideos([]);
      setSelectedVideoId(null);
      return;
    }

    const playlistId = canal.url.match(/[?&]list=([a-zA-Z0-9_-]+)/)?.[1] || null;

    if (playlistId) {
      supabase.functions.invoke("youtube-playlist", { body: { playlistId } }).then(({ data }) => {
        if (!data?.videos) return;

        const sorted = [...data.videos]
          .map((video: any) => ({
            ...video,
            videoId: normalizeYoutubeVideoId(video.videoId),
          }))
          .filter((video: any) => !!video.videoId)
          .sort((a: any, b: any) => {
            if (a.published && b.published) return new Date(b.published).getTime() - new Date(a.published).getTime();
            return 0;
          });

        setYoutubeVideos(sorted as YoutubeVideo[]);

        const requestedId = normalizeYoutubeVideoId(requestedVideoId);
        if (requestedId && sorted.some((v: any) => v.videoId === requestedId)) {
          setSelectedVideoId(requestedId);
          setPlaying(true);
          setBuffering(false);
          setYtPlaying(true);
        }
      });
      return;
    }

    const videoId = extractYoutubeVideoId(canal.url);
    if (!videoId) {
      setYoutubeVideos([]);
      setSelectedVideoId(null);
      return;
    }

    setYoutubeVideos([
      {
        videoId,
        title: canal.name || "Vídeo",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      },
    ]);
    setSelectedVideoId(videoId);
    setPlaying(true);
    setBuffering(false);
    setYtPlaying(true);
  }, [canal?.url, isYoutube, requestedVideoId]);

  // Sync music data directly from XML
  const coverCacheRef = useRef<Record<string, string>>({});
  const noCoverCacheRef = useRef<Record<string, true>>({});
  // In public mode, always use publicUserId for music sync (never the logged-in user)
  const effectiveUserId = isPublicMode ? publicUserId : (user?.id || publicUserId);
  useEffect(() => {
    if (!effectiveUserId) return;

    const isPlaceholderTrack = (track: { titulo?: string; artista?: string }) => {
      const titulo = (track.titulo || "").trim().toLowerCase();
      const artista = (track.artista || "").trim().toLowerCase();
      return (titulo === "" || titulo === "sem título" || titulo === "sem titulo")
        && (artista === "" || artista === "desconhecido");
    };

    const broadcastMusicSync = (payload: MusicData) => {
      window.dispatchEvent(new CustomEvent<MusicData>(MUSIC_SYNC_EVENT, { detail: payload }));
    };

    // In public mode, don't read music from localStorage (it belongs to the logged-in user's dashboard)
    const syncFromStorage = () => {
      if (isPublicMode) return;
      try {
        const raw = localStorage.getItem(MUSIC_DATA_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Partial<MusicData>;
        const normalized: MusicData = {
          titulo: normalizeMusicText(parsed.titulo || "") || "Sem título",
          artista: normalizeMusicText(parsed.artista || "") || "Desconhecido",
          duracao: Number(parsed.duracao) > 0 ? Number(parsed.duracao) : 0,
          capa: parsed.capa || "",
          horario: parsed.horario || "",
        };

        setMusicData((prev) => {
          if (!prev) return normalized;
          if (
            prev.titulo === normalized.titulo
            && prev.artista === normalized.artista
            && prev.capa === normalized.capa
            && prev.duracao === normalized.duracao
            && (prev.horario || "") === (normalized.horario || "")
          ) {
            return prev;
          }
          return { ...prev, ...normalized };
        });
      } catch {
        // ignore invalid storage payload
      }
    };


    const parseXml = (xmlStr: string) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "application/xml");
        if (doc.querySelector("parsererror")) return null;
        const titulo = normalizeMusicText(doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título");
        const artista = normalizeMusicText(doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido");
        const duracaoStr = doc.querySelector("duracao")?.textContent || doc.querySelector("duration")?.textContent || "0";
        const capa = doc.querySelector("capa")?.textContent || doc.querySelector("cover")?.textContent || "";
        const horario = doc.querySelector("horario")?.textContent || "";
        let duracao = 0;
        if (duracaoStr.includes(":")) {
          const parts = duracaoStr.split(":").map(Number);
          if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
          else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else {
          duracao = parseFloat(duracaoStr) || 0;
          if (duracao > 600) duracao = duracao / 1000;
        }
        return { titulo, artista, duracao, capa, horario };
      } catch { return null; }
    };

    let cachedXmlUrl: string | null = null;
    let inFlight = false;
    let cancelled = false;
    let xmlFetchFails = 0;
    let directFetchOk: boolean | null = null;
    let fetchCycleCount = 0;
    let lockStartedAt = 0;
    let activeRequestId = 0;

    const fetchAndSync = async () => {
      if (cancelled) return;

      const nowMs = Date.now();
      const lockIsFresh = inFlight && nowMs - lockStartedAt < 3500;
      if (lockIsFresh) return;

      const requestId = ++activeRequestId;
      inFlight = true;
      lockStartedAt = nowMs;
      try {
        // Re-fetch XML URL if not cached or after repeated failures
        if (!cachedXmlUrl || xmlFetchFails > 3) {
          const { data: settings } = await supabase.from("user_settings").select("music_xml_url").eq("user_id", effectiveUserId).maybeSingle();
          cachedXmlUrl = settings?.music_xml_url || null;
          if (cachedXmlUrl) xmlFetchFails = 0;
        }
        if (!cachedXmlUrl || cancelled) return;

        // Reset direct fetch flag every 20 cycles to re-test CORS
        fetchCycleCount++;
        if (fetchCycleCount % 20 === 0) directFetchOk = null;

        let text = "";

        // Fast path: try direct fetch first (~200ms vs ~1-2s via edge)
        if (directFetchOk !== false) {
          try {
            const directRes = await fetch(cachedXmlUrl, {
              signal: AbortSignal.timeout(1500),
              cache: "no-store",
            });
            if (directRes.ok) {
              directFetchOk = true;
              text = await directRes.text();
            }
          } catch {
            if (directFetchOk === null) directFetchOk = false;
          }
        }

        // Fallback: edge function
        if (!text) {
          try {
            const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
              body: { url: cachedXmlUrl },
            });
            if (rssError || !rssData?.content) { xmlFetchFails++; return; }
            text = rssData.content;
            xmlFetchFails = 0;
          } catch { xmlFetchFails++; return; }
        }

        const data = parseXml(text);
        if (!data || cancelled) return;

        // Apply music data IMMEDIATELY, fetch cover in background
        setMusicData(prev => {
          const prevHasRealTrack = !!prev && !isPlaceholderTrack(prev);
          const incomingIsPlaceholder = isPlaceholderTrack(data);
          if (prevHasRealTrack && incomingIsPlaceholder) return prev;

          if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
            const next = { ...data };
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next));
            localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
            broadcastMusicSync(next);
            return next;
          }

          const hasMetaDiff = (data.capa && prev.capa !== data.capa)
            || (data.horario && prev.horario !== data.horario)
            || (data.duracao > 0 && prev.duracao !== data.duracao);

          if (hasMetaDiff) {
            const next = { ...prev, ...data, capa: data.capa || prev.capa };
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next));
            broadcastMusicSync(next);
            return next;
          }

          return prev;
        });

        // Non-blocking cover fetch
        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            const cover = coverCacheRef.current[cacheKey];
            setMusicData(prev => {
              if (prev && prev.titulo === data.titulo && prev.artista === data.artista && !prev.capa) {
                const next = { ...prev, capa: cover };
                localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next));
                broadcastMusicSync(next);
                return next;
              }
              return prev;
            });
          } else if (!noCoverCacheRef.current[cacheKey]) {
            (async () => {
              try {
                const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`, { signal: AbortSignal.timeout(5000) });
                const itunesData = await itunesRes.json();
                if (itunesData.results?.length > 0) {
                  const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                  if (cover) {
                    coverCacheRef.current[cacheKey] = cover;
                    setMusicData(prev => {
                      if (prev && prev.titulo === data.titulo && prev.artista === data.artista && !prev.capa) {
                        const next = { ...prev, capa: cover };
                        localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next));
                        broadcastMusicSync(next);
                        return next;
                      }
                      return prev;
                    });
                  } else noCoverCacheRef.current[cacheKey] = true;
                } else noCoverCacheRef.current[cacheKey] = true;
              } catch { noCoverCacheRef.current[cacheKey] = true; }
            })();
          }
        }
      } catch {}
      finally {
        if (requestId === activeRequestId) {
          inFlight = false;
        }
      }
    };

    syncFromStorage();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === MUSIC_DATA_KEY) syncFromStorage();
    };
    const onMusicSync = () => syncFromStorage();

    window.addEventListener("storage", onStorage);
    window.addEventListener(MUSIC_SYNC_EVENT, onMusicSync as EventListener);

    fetchAndSync(); // immediate first fetch
    const interval = setInterval(fetchAndSync, 1500);
    // Also poll localStorage frequently to catch updates from useGlobalMusicSync in same tab
    const storagePoll = setInterval(syncFromStorage, 800);

    // Resume sync immediately when page becomes visible again (e.g. after alt-tab in fullscreen)
    const onVisibility = () => { if (!document.hidden && !cancelled) fetchAndSync(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(storagePoll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_SYNC_EVENT, onMusicSync as EventListener);
    };
  }, [effectiveUserId]);

  // Play stream
  const playStream = useCallback(
    async (url: string, type: string, forceAutoplay?: boolean, userInitiated?: boolean) => {
      destroyMiniAudio();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      resetMediaElement(audioRef.current);
      resetMediaElement(videoRef.current);
      setHlsLevels([]);
      setHlsCurrentLevel(-1);
      setBuffering(true);
      setPlaying(false);
      setStreamStalled(false);

      const isAudioType = type === "audio_live" || type === "audio";
      const shouldResetAutoplayMute = Boolean(userInitiated && autoplayMutedRef.current && volumeRef.current > 0);

      if (shouldResetAutoplayMute) {
        autoplayMutedRef.current = false;
        mutedRef.current = false;
        setMuted(false);
      }

      const shouldStartMuted = shouldResetAutoplayMute
        ? false
        : mutedRef.current || volumeRef.current === 0;

      const handlePlayStarted = () => {
        if (!shouldStartMuted) autoplayMutedRef.current = false;
        setPlaying(true);
        setBuffering(false);
      };

      const handlePlayBlocked = (label: string, error: unknown) => {
        console.warn(label, error);
        // If play was blocked and we weren't muted, retry muted (autoplay policy)
        if (!shouldStartMuted && forceAutoplay) {
          console.log("Retrying playback muted due to autoplay policy...");
          autoplayMutedRef.current = true;
          mutedRef.current = true;
          setMuted(true);
          const media = isAudioType ? audioRef.current : videoRef.current;
          if (media) {
            media.muted = true;
            media.play().then(() => { setPlaying(true); setBuffering(false); }).catch(() => { setPlaying(false); setBuffering(false); });
          }
          return;
        }
        setPlaying(false);
        setBuffering(false);
      };

      const playLabel = isAudioType ? "Audio play blocked:" : "Video play blocked:";
      const requestPlay = (media: HTMLMediaElement) => {
        media.volume = volumeRef.current / 100;
        media.muted = shouldStartMuted;
        return media.play().then(handlePlayStarted).catch((e) => handlePlayBlocked(playLabel, e));
      };

      const normalizedUrl = normalizeLivePlaylistUrl(url, type);
      const useHls = normalizedUrl.includes(".m3u8");
      // Only add cache-busting for HLS playlists; Icecast/Shoutcast direct streams may reject query params
      const freshUrl = useHls
        ? (normalizedUrl.includes("?") ? `${normalizedUrl}&_t=${Date.now()}` : `${normalizedUrl}?_t=${Date.now()}`)
        : normalizedUrl;
      let Hls: typeof HlsType | null = null;
      if (useHls) Hls = await getHls();

      if (isAudioType) {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volumeRef.current / 100;
        audio.muted = shouldStartMuted;
        if (Hls && Hls.isSupported()) {
          let playRequested = false;
          const requestAudioPlay = () => {
            playRequested = true;
            void requestPlay(audio);
          };

          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferHole: 0.5,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            liveDurationInfinity: true,
            liveBackBufferLength: 20,
            fragLoadingMaxRetry: 8,
            fragLoadingMaxRetryTimeout: 15000,
            fragLoadingRetryDelay: 500,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            appendErrorMaxRetry: 5,
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.withCredentials = false;
            },
          });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(audio);
          if (userInitiated || forceAutoplay) requestAudioPlay();
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!playRequested || audio.paused) requestAudioPlay();
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("HLS fatal error on audio, recovering...", data.type);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else { hls.destroy(); hlsRef.current = null; setStreamStalled(true); setPlaying(false); }
            }
          });
        } else {
          // Direct Icecast/Shoutcast stream — native HTML5 audio
          audio.preload = "none";
          audio.src = freshUrl;
          audio.load();
          // Add error handler for reconnection on stream failures
          const onError = () => {
            console.warn("Native audio stream error, will retry...");
            setBuffering(true);
            setTimeout(() => {
              if (audio.error) {
                audio.src = normalizedUrl;
                audio.load();
                void requestPlay(audio);
              }
            }, 2000);
          };
          audio.addEventListener("error", onError, { once: true });
          void requestPlay(audio);
        }
      } else {
        const video = videoRef.current;
        if (!video) return;
        if (Hls && Hls.isSupported()) {
          let playRequested = false;
          const requestVideoPlay = () => {
            playRequested = true;
            void requestPlay(video);
          };

          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            capLevelToPlayerSize: false,
            startLevel: -1,
            autoStartLoad: true,
            maxBufferLength: 40,
            maxMaxBufferLength: 90,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.5,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            liveDurationInfinity: true,
            liveBackBufferLength: 30,
            abrEwmaDefaultEstimate: 3000000,
            abrBandWidthUpFactor: 0.7,
            abrBandWidthFactor: 0.95,
            fragLoadingMaxRetry: 10,
            fragLoadingMaxRetryTimeout: 20000,
            fragLoadingRetryDelay: 500,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            backBufferLength: 30,
            appendErrorMaxRetry: 5,
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.withCredentials = false;
            },
          });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(video);
          if (userInitiated || forceAutoplay) requestVideoPlay();
          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            if (data.levels && data.levels.length > 0) {
              const levels = data.levels.map((l: any, i: number) => ({
                height: l.height || 0,
                bitrate: l.bitrate || 0,
                index: i,
              }));
              setHlsLevels(levels);
              setHlsCurrentLevel(-1);
            }
            if (!playRequested || video.paused) requestVideoPlay();
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
          let mediaErrorRecoveries = 0;
          let networkRetries = 0;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) {
              if (data.details === "bufferStalledError" && video.readyState >= 2) {
                const buffered = video.buffered;
                if (buffered.length > 0) {
                  const end = buffered.end(buffered.length - 1);
                  if (end - video.currentTime > 2) {
                    console.log("Nudging video to buffered edge", { from: video.currentTime, to: end - 0.5 });
                    video.currentTime = end - 0.5;
                  }
                }
              }
              return;
            }
            console.warn("HLS fatal error:", data.type, data.details);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              networkRetries++;
              if (networkRetries <= 5) {
                console.log("HLS network recovery attempt", networkRetries);
                hls.startLoad();
              } else {
                console.warn("Too many network errors, full restart");
                hls.destroy();
                hlsRef.current = null;
                setTimeout(() => playStream(url, type), 1500);
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              mediaErrorRecoveries++;
              if (mediaErrorRecoveries <= 3) {
                hls.recoverMediaError();
              } else {
                console.warn("Too many media errors, restarting HLS");
                hls.destroy();
                hlsRef.current = null;
                setTimeout(() => playStream(url, type), 1500);
              }
            } else {
              hls.destroy();
              hlsRef.current = null;
              setStreamStalled(true);
              setPlaying(false);
            }
          });
        } else {
          video.src = freshUrl;
          video.load();
          void requestPlay(video);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isAudio) {
      const audio = audioRef.current;
      if (audio) audio.muted = true;
      resetMediaElement(audio);
    }

    if (!isVideo) {
      resetMediaElement(videoRef.current);
    }
  }, [canal?.id, isAudio, isVideo]);

  // Detect stream stall and auto-reconnect — conservative approach for live streams
  const streamStalledRef = useRef(false);
  useEffect(() => {
    if (!playing || !canal || canal.type === "youtube" || canal.type === "catalog") {
      setStreamStalled(false);
      streamStalledRef.current = false;
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      return;
    }
    const mediaEl = (canal.type === "audio_live" || canal.type === "audio") ? audioRef.current : videoRef.current;
    if (!mediaEl) return;

    const isAudioStream = canal.type === "audio_live" || canal.type === "audio";
    let reconnectAttempts = 0;
    const maxReconnects = isAudioStream ? 4 : 8;
    let lastTimeUpdate = Date.now();

    const hasBufferedMedia = () => {
      try {
        return mediaEl.readyState >= 2 || mediaEl.buffered.length > 0;
      } catch {
        return mediaEl.readyState >= 2;
      }
    };

    const markAlive = () => {
      lastTimeUpdate = Date.now();
      if (streamStalledRef.current) {
        setStreamStalled(false);
        streamStalledRef.current = false;
        reconnectAttempts = 0;
      }
    };

    const tryReconnect = () => {
      if (reconnectAttempts >= maxReconnects) return;
      reconnectAttempts++;
      setStreamStalled(true);
      streamStalledRef.current = true;
      // Audio: longer delays to avoid rapid stop/start cycles
      const baseDelay = isAudioStream ? 3000 : 1500;
      const delay = Math.min(baseDelay * reconnectAttempts, 12000);
      setTimeout(() => {
        if (canal) playStream(canal.url, canal.type);
      }, delay);
    };

    const onTimeUpdate = () => {
      markAlive();
    };

    const onProgress = () => {
      if (hasBufferedMedia()) markAlive();
    };

    const onPlaying = () => {
      markAlive();
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };

    const onError = () => {
      const threshold = isAudioStream ? 20000 : 10000;
      if (Date.now() - lastTimeUpdate > threshold) {
        tryReconnect();
      }
    };

    // Audio streams: check less frequently with higher threshold
    const checkInterval = isAudioStream ? 20000 : 10000;
    const stallThreshold = isAudioStream ? 45000 : 15000;
    const healthCheck = setInterval(() => {
      if (!playing || canal?.type === "youtube") return;
      if (document.hidden) { lastTimeUpdate = Date.now(); return; }
      if (isAudioStream && !mediaEl.paused && hasBufferedMedia()) {
        lastTimeUpdate = Date.now();
        return;
      }
      const elapsed = Date.now() - lastTimeUpdate;
      if (elapsed > stallThreshold) {
        console.warn("Stream health check: no data for", Math.round(elapsed / 1000), "s — reconnecting");
        tryReconnect();
      }
    }, checkInterval);

    const onVisible = () => { if (document.visibilityState === "visible") lastTimeUpdate = Date.now(); };
    document.addEventListener("visibilitychange", onVisible);

    mediaEl.addEventListener("timeupdate", onTimeUpdate);
    mediaEl.addEventListener("progress", onProgress);
    mediaEl.addEventListener("loadeddata", onProgress);
    mediaEl.addEventListener("canplay", onProgress);
    mediaEl.addEventListener("playing", onPlaying);
    mediaEl.addEventListener("error", onError);

    return () => {
      mediaEl.removeEventListener("timeupdate", onTimeUpdate);
      mediaEl.removeEventListener("progress", onProgress);
      mediaEl.removeEventListener("loadeddata", onProgress);
      mediaEl.removeEventListener("canplay", onProgress);
      mediaEl.removeEventListener("playing", onPlaying);
      mediaEl.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisible);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      clearInterval(healthCheck);
    };
  }, [playing, canal, playStream]);

  useEffect(() => {
    if (!prerollDone) return;
    if (autoPlayedRef.current || canais.length === 0 || playing) return;
    autoPlayedRef.current = true;

    // If a specific channel was requested via ?ch= query param, use it
    let startIndex = -1;
    if (requestedChannelId) {
      startIndex = canais.findIndex((c) => c.id === requestedChannelId);
    }
    if (startIndex < 0) {
      const preferredIndex = canais.findIndex((c) => isAutoplayChannel(c));
      startIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }
    const first = canais[startIndex];
    if (!first) return;

    setCurrentIndex(startIndex);
    if (first.type === "youtube" || first.type === "catalog") {
      setPlaying(true);
      setBuffering(false);
      setSelectedVideoId(null);
      setSidebarOpen(false);
    } else {
      setTimeout(() => playStream(first.url, first.type, true), 120);
    }
  }, [canais, playing, playStream, prerollDone, isAutoplayChannel, requestedChannelId]);

  // Recurring pre-roll every 15 minutes
  const fetchAndShowPreroll = useCallback(async () => {
    if (!user || prerollShowing || isYoutube) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true });

    if (data && data.length > 0) {
      const matching = filterCampaignsByType(data, now, false);
      if (matching.length > 0) {
        const selected = matching[Math.floor(Math.random() * matching.length)];
        setPrerollUrl(selected.video_url);
        setPrerollLinkUrl((selected as any).link_url || null);
        setPrerollMediaType((selected as any).media_type || "video");
        setPrerollYoutubeUrl((selected as any).youtube_url || null);
        setPrerollBackgroundUrl((selected as any).background_url || null);
        setPrerollAspectRatio((selected as any).aspect_ratio || "16:9");
        setPrerollVideoPosition((selected as any).video_position || "center");
        setPrerollShowing(true);
      }
    }
  }, [user, prerollShowing, isYoutube]);

  useEffect(() => {
    if (!prerollDone || !playing || isYoutube) return;
    prerollIntervalRef.current = setInterval(fetchAndShowPreroll, 15 * 60 * 1000);
    return () => { if (prerollIntervalRef.current) clearInterval(prerollIntervalRef.current); };
  }, [prerollDone, playing, isYoutube, fetchAndShowPreroll]);

  const handleQualityChange = useCallback((levelIndex: number) => {
    if (!hlsRef.current) return;
    if (levelIndex === -1) {
      hlsRef.current.currentLevel = -1; // auto
    } else {
      hlsRef.current.currentLevel = levelIndex;
    }
    setHlsCurrentLevel(levelIndex);
    setQualityMenuOpen(false);
  }, []);

  const handlePlayCanal = useCallback(() => {
    if (!canal) return;
    if (playing) {
      if (audioRef.current) audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
      setPlaying(false);
      return;
    }
    if (canal.type === "youtube") { setPlaying(true); setBuffering(false); return; }
    playStream(canal.url, canal.type, false, true);
  }, [canal, playing, playStream]);

  const navigateChannel = useCallback((dir: 1 | -1) => {
    if (liveChannels.length === 0) return;

    const currentLiveIndex = canal ? liveChannels.findIndex((c) => c.id === canal.id) : -1;
    const baseIndex = currentLiveIndex >= 0 ? currentLiveIndex : 0;
    const nextLiveIndex = (baseIndex + dir + liveChannels.length) % liveChannels.length;
    const nextChannel = liveChannels[nextLiveIndex];
    if (!nextChannel) return;

    const nextIndex = canais.findIndex((c) => c.id === nextChannel.id);
    if (nextIndex < 0) return;

    setChannelNavDir(dir);
    setChannelAnimKey(prev => prev + 1);
    setCurrentIndex(nextIndex);

    // Stop any playing audio/video when switching channels — full cleanup
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setHlsLevels([]);
    setHlsCurrentLevel(-1);

    if (nextChannel.type === "youtube") {
      setPlaying(true);
      setBuffering(false);
      setSelectedVideoId(null);
      setSidebarOpen(false);
    } else {
      void playStream(nextChannel.url, nextChannel.type, false, true);
    }
  }, [canal, canais, liveChannels, playStream]);

  // Fullscreen
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Auto-fullscreen and zoom fix for TV browsers
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const forceTV = new URLSearchParams(window.location.search).get("tv") === "1" || window.location.pathname.endsWith("/player/app");
    const isTV = forceTV
      || /smart-?tv|tizen|webos|netcast|hbbtv|viera|nettv|philipstv|roku|firetv|appletv|android.*tv|crkey/i.test(ua)
      || window.matchMedia("(display-mode: fullscreen)").matches
      || (screen.width >= 1280 && screen.height >= 720 && !("ontouchstart" in window) && window.innerWidth === screen.width);

    if (!isTV) return;

    // Force viewport to device width with scale 1
    const existingMeta = document.querySelector('meta[name="viewport"]');
    if (existingMeta) {
      existingMeta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    }

    // Reset any browser zoom by forcing the root element to fill exactly the screen
    const root = document.documentElement;
    const body = document.body;

    // Detect effective browser zoom: if devicePixelRatio is unusually high relative
    // to what we expect, or if outerWidth differs from innerWidth
    const applyTVFit = () => {
      const container = containerRef.current;
      if (!container) return;

      // Reset previous transforms
      root.style.zoom = "";
      container.style.transform = "";
      container.style.transformOrigin = "";
      container.style.width = "";
      container.style.height = "";
      container.style.overflow = "";

      // Check if content is overflowing (sign of zoom)
      const docWidth = root.scrollWidth;
      const docHeight = root.scrollHeight;
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;

      if (docWidth > winWidth + 2 || docHeight > winHeight + 2) {
        // Content overflows — scale it down to fit
        const scaleX = winWidth / docWidth;
        const scaleY = winHeight / docHeight;
        const scale = Math.min(scaleX, scaleY);
        root.style.zoom = `${scale * 100}%`;
      }

      // Also force the player container to be exactly viewport size
      container.style.width = "100vw";
      container.style.height = "100vh";
      container.style.overflow = "hidden";
    };

    // Apply on load and on resize
    applyTVFit();
    window.addEventListener("resize", applyTVFit);

    // Auto fullscreen
    if (containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    }

    return () => {
      root.style.zoom = "";
      if (containerRef.current) {
        containerRef.current.style.transform = "";
        containerRef.current.style.transformOrigin = "";
        containerRef.current.style.width = "";
        containerRef.current.style.height = "";
        containerRef.current.style.overflow = "";
      }
      window.removeEventListener("resize", applyTVFit);
    };
  }, [loading]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) { containerRef.current.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  };

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const newMuted = !prev;
      mutedRef.current = newMuted;
      if (!newMuted) autoplayMutedRef.current = false;
      if (videoRef.current) videoRef.current.muted = newMuted;
      if (audioRef.current) audioRef.current.muted = newMuted;
      return newMuted;
    });
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    volumeRef.current = val;
    const v = val / 100;
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = false; }
    if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
    if (val > 0) autoplayMutedRef.current = false;
    const newMuted = val === 0;
    setMuted(newMuted);
    mutedRef.current = newMuted;
  }, []);

  // Keep media elements in sync with muted/volume state
  useEffect(() => {
    if (videoRef.current) { videoRef.current.muted = muted; videoRef.current.volume = volume / 100; }
    if (audioRef.current) { audioRef.current.muted = muted; audioRef.current.volume = volume / 100; }
  }, [muted, volume]);

  // OSD volume indicator — shows briefly on mute/volume change
  const [volumeOsd, setVolumeOsd] = useState(false);
  const volumeOsdTimeout = useRef<ReturnType<typeof setTimeout>>();
  const showVolumeOsd = useCallback(() => {
    setVolumeOsd(true);
    clearTimeout(volumeOsdTimeout.current);
    volumeOsdTimeout.current = setTimeout(() => setVolumeOsd(false), 1200);
  }, []);

  // Wrap toggleMute and handleVolumeChange to trigger OSD
  const toggleMuteWithOsd = useCallback(() => { toggleMute(); showVolumeOsd(); }, [toggleMute, showVolumeOsd]);
  const handleVolumeChangeWithOsd = useCallback((val: number) => { handleVolumeChange(val); showVolumeOsd(); }, [handleVolumeChange, showVolumeOsd]);

  // Keyboard & TV Remote Control handler with spatial navigation (TV only for arrows)
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const forceTV = new URLSearchParams(window.location.search).get("tv") === "1" || window.location.pathname.endsWith("/player/app");
    const isTV = forceTV
      || /smart-?tv|tizen|webos|netcast|hbbtv|viera|nettv|philipstv|roku|firetv|appletv|android.*tv|crkey/i.test(ua)
      || window.matchMedia("(display-mode: fullscreen)").matches
      || (screen.width >= 1280 && screen.height >= 720 && !("ontouchstart" in window) && window.innerWidth === screen.width);

    const getFocusables = (): HTMLElement[] => {
      return Array.from(document.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), [tabindex="0"]'
      )).filter(el => el.offsetParent !== null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Spatial navigation with arrows — TV only
      if (isTV) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const focusables = getFocusables();
          if (focusables.length === 0) return;
          const currentIdx = focusables.indexOf(document.activeElement as HTMLElement);
          const next = currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1;
          focusables[next]?.focus();
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const focusables = getFocusables();
          if (focusables.length === 0) return;
          const currentIdx = focusables.indexOf(document.activeElement as HTMLElement);
          const next = currentIdx >= focusables.length - 1 ? 0 : currentIdx + 1;
          focusables[next]?.focus();
          return;
        }
        if (e.key === "Enter" || e.key === "Select" || e.key === " ") {
          const active = document.activeElement as HTMLElement;
          if (active && active !== document.body) {
            e.preventDefault();
            active.click();
          }
          return;
        }
      }

      // Desktop: arrow up/down change channels
      if (e.key === "ArrowUp") { e.preventDefault(); navigateChannel(-1); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); navigateChannel(1); return; }

      // Hardware keys — always active
      if (e.key === "ChannelUp") { e.preventDefault(); navigateChannel(-1); }
      else if (e.key === "ChannelDown") { e.preventDefault(); navigateChannel(1); }
      else if (e.key === "VolumeUp") {
        e.preventDefault();
        handleVolumeChangeWithOsd(Math.min(100, volume + 10));
      }
      else if (e.key === "VolumeDown") {
        e.preventDefault();
        handleVolumeChangeWithOsd(Math.max(0, volume - 10));
      }
      else if (e.key === "AudioVolumeMute") {
        e.preventDefault();
        toggleMuteWithOsd();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateChannel, volume, handleVolumeChangeWithOsd, toggleMuteWithOsd, handlePlayCanal]);

  const handleSelectVideo = useCallback((videoId: string) => {
    const normalizedId = normalizeYoutubeVideoId(videoId);
    if (!normalizedId) return;
    setSelectedVideoId(normalizedId);
    setPlaying(true);
    setBuffering(false);
    setSidebarOpen(false);
    setYtPlaying(true);
  }, []);

  // YouTube IFrame API: sync volume
  const ytPostMessage = useCallback((command: string, args: any[] = []) => {
    if (ytIframeRef.current?.contentWindow) {
      ytIframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: command, args }), "*");
    }
  }, []);

  useEffect(() => {
    if (!isYoutube || !selectedVideoId) return;
    // Unmute shortly after embed starts (it starts muted for autoplay compliance)
    const unmuteTimer = setTimeout(() => {
      ytPostMessage("unMute");
      ytPostMessage("setVolume", [volume]);
    }, 800);
    const syncTimer = setTimeout(() => {
      ytPostMessage("setVolume", [volume]);
      if (muted) ytPostMessage("mute");
      else ytPostMessage("unMute");
    }, 1500);
    return () => { clearTimeout(unmuteTimer); clearTimeout(syncTimer); };
  }, [volume, muted, isYoutube, selectedVideoId, ytPostMessage]);

  // Listen for YouTube player state messages to track currentTime/duration
  useEffect(() => {
    if (!isYoutube || !selectedVideoId) { setYtCurrentTime(0); setYtDuration(0); return; }
    const onMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.event === "infoDelivery" && data?.info) {
          if (typeof data.info.currentTime === "number") setYtCurrentTime(data.info.currentTime);
          if (typeof data.info.duration === "number") setYtDuration(data.info.duration);
        }
        // When iframe is ready, start listening and force HD quality
        if (data?.event === "onReady" || data?.event === "initialDelivery") {
          ytPostMessage("addEventListener", ["onStateChange"]);
          ytPostMessage("setPlaybackQuality", ["hd1080"]);
          ytPostMessage("setPlaybackQualityRange", [{ min: "hd1080", max: "highres" }]);
        }
      } catch {}
    };
    window.addEventListener("message", onMessage);

    // Send "listening" handshake so YouTube sends infoDelivery events
    const sendListening = () => {
      if (ytIframeRef.current?.contentWindow) {
        ytIframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
      }
    };
    // Retry a few times since iframe may not be ready immediately
    const t1 = setTimeout(sendListening, 500);
    const t2 = setTimeout(sendListening, 1500);
    const t3 = setTimeout(sendListening, 3000);

    return () => { window.removeEventListener("message", onMessage); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isYoutube, selectedVideoId, ytPostMessage]);

  const ytPrevVideo = useCallback(() => {
    if (youtubeVideos.length === 0) return;
    const idx = youtubeVideos.findIndex(v => v.videoId === selectedVideoId);
    const prev = idx > 0 ? idx - 1 : youtubeVideos.length - 1;
    handleSelectVideo(youtubeVideos[prev].videoId);
    setSidebarOpen(false);
  }, [youtubeVideos, selectedVideoId, handleSelectVideo]);

  const ytNextVideo = useCallback(() => {
    if (youtubeVideos.length === 0) return;
    const idx = youtubeVideos.findIndex(v => v.videoId === selectedVideoId);
    const next = idx < youtubeVideos.length - 1 ? idx + 1 : 0;
    handleSelectVideo(youtubeVideos[next].videoId);
    setSidebarOpen(false);
  }, [youtubeVideos, selectedVideoId, handleSelectVideo]);

  const ytTogglePlay = useCallback(() => {
    if (ytPlaying) { ytPostMessage("pauseVideo"); setYtPlaying(false); }
    else { ytPostMessage("playVideo"); setYtPlaying(true); }
  }, [ytPlaying, ytPostMessage]);

  const showVolume = () => { clearTimeout(volumeHideTimeout.current); setVolumeHover(true); };
  const hideVolume = () => { volumeHideTimeout.current = setTimeout(() => setVolumeHover(false), 600); };




  const showBar = () => { clearTimeout(hideTimeout.current); setBarVisible(true); };
  const hideBar = () => {
    if (isAudio) return;
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setBarVisible(false), 500);
  };

  useEffect(() => {
    clearTimeout(hideTimeout.current);
    if (isAudio) { setBarVisible(true); return; }
    hideTimeout.current = setTimeout(() => setBarVisible(false), 4000);
    return () => clearTimeout(hideTimeout.current);
  }, [isAudio, currentIndex]);

  // Prevent tab discard and resume playback on tab return
  useEffect(() => {
    // Web Lock API — prevents browser from discarding the tab while playing
    let lockPromise: Promise<void> | null = null;
    let releaseLock: (() => void) | null = null;

    if (playing && "locks" in navigator) {
      lockPromise = (navigator as any).locks.request(
        "player-keep-alive",
        { mode: "exclusive" },
        () => new Promise<void>((resolve) => { releaseLock = resolve; })
      );
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const media = isAudio ? audioRef.current : videoRef.current;
        if (media && media.paused && playing) {
          media.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (releaseLock) releaseLock();
    };
  }, [isAudio, playing]);

  // Destroy any lingering MiniPlayer audio & cleanup on unmount
  useEffect(() => {
    destroyMiniAudio();
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    };
  }, []);

  // Periodic clock tick to re-compute currentProg every 30s
  const [musicTick, setMusicTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClock(c => c + 1), 30000);
    return () => clearInterval(interval);
  }, []);
  // Fast tick for music progress bar (every 1s)
  useEffect(() => {
    if (!playing || isYoutube) return;
    const interval = setInterval(() => setMusicTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [playing, isYoutube]);

  // Filter programs by the current channel's estudio (if set)
  const filteredProgramas = useMemo(() => {
    if (!canal?.estudio) return programas;
    const filtered = programas.filter(p => p.estudio === canal.estudio);
    return filtered.length > 0 ? filtered : programas;
  }, [programas, canal?.estudio]);

  const currentProg = getCurrentProgram(filteredProgramas);
  const prevProgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentProg?.id !== prevProgIdRef.current) {
      prevProgIdRef.current = currentProg?.id || null;
      setShopProductIndex(0);
    }
  }, [currentProg?.id]);

  // Music recording is handled by the monitor-music edge function (cron job)
  // No client-side insertion needed

  const nextProg = getNextProgram(filteredProgramas, currentProg);
  const progress = getProgramProgress(currentProg);
  const currentPresenter = useMemo(() => {
    if (!currentProg?.apresentador_id) return null;
    return apresentadores.find(a => a.id === currentProg.apresentador_id) || null;
  }, [currentProg, apresentadores]);
  const nextPresenter = useMemo(() => {
    if (!nextProg?.apresentador_id) return null;
    return apresentadores.find(a => a.id === nextProg.apresentador_id) || null;
  }, [nextProg, apresentadores]);

  // For YouTube channels, show the current video title as "No Ar"
  const currentYtVideo = isYoutube && selectedVideoId ? youtubeVideos.find(v => v.videoId === selectedVideoId) : null;
  const nextYtVideo = useMemo(() => {
    if (!isYoutube || youtubeVideos.length === 0) return null;
    if (!selectedVideoId) return youtubeVideos[0] || null;
    const idx = youtubeVideos.findIndex(v => v.videoId === selectedVideoId);
    if (idx < 0 || idx >= youtubeVideos.length - 1) return youtubeVideos[0] || null;
    return youtubeVideos[idx + 1];
  }, [isYoutube, youtubeVideos, selectedVideoId]);

  // Line 1: Channel name | Line 2: Program name (blank when YouTube home)
  const channelLabel = canal?.name || "Sem canal";
  const isYtHome = isYoutube && !selectedVideoId;
  const programLabel = isYoutube
    ? (currentYtVideo ? currentYtVideo.title : "")
    : (currentProg ? currentProg.nome : "");

  // Format seconds to MM:SS
  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  const ytProgressPct = ytDuration > 0 ? (ytCurrentTime / ytDuration) * 100 : 0;

  // Mid-roll break points: divide video into 6 segments → 5 break points
  const midrollBreakPoints = useMemo(() => {
    if (!isYoutube || ytDuration < 60) return []; // skip for very short videos
    const points: number[] = [];
    for (let i = 1; i <= 5; i++) {
      points.push((ytDuration / 6) * i);
    }
    return points;
  }, [isYoutube, ytDuration]);

  // Reset mid-roll triggered set when video changes
  useEffect(() => {
    midrollTriggeredRef.current = new Set();
    setMidrollActive(false);
    setMidrollPreroll(null);
  }, [selectedVideoId]);

  // Monitor currentTime and trigger mid-roll at break points
  useEffect(() => {
    if (!isYoutube || !selectedVideoId || midrollActive || midrollBreakPoints.length === 0) return;
    for (const bp of midrollBreakPoints) {
      const bpIdx = Math.round(bp);
      if (midrollTriggeredRef.current.has(bpIdx)) continue;
      // Trigger within 2-second window
      if (Math.abs(ytCurrentTime - bp) < 2) {
        midrollTriggeredRef.current.add(bpIdx);
        setMidrollResumeTime(ytCurrentTime);
        // Start fade-out, then pause and show mid-roll after 2s
        setMidrollFading("out");
        // Gradually lower YouTube volume during fade-out
        ytPostMessage("setVolume", [50]);
        setTimeout(() => ytPostMessage("setVolume", [20]), 800);
        setTimeout(() => ytPostMessage("setVolume", [0]), 1500);
        setTimeout(() => {
          ytPostMessage("pauseVideo");
          setMidrollFading(null);
          setMidrollActive(true);
          // Fetch mid-rolls to show (prefer is_midroll=true, up to 3)
          (async () => {
            if (!user) return;
            const now = new Date();
            const ct = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", ct).gte("horario_fim", ct).order("priority", { ascending: true });
            if (data && data.length > 0) {
              const pool = filterCampaignsByType(data, now, true);
              if (pool.length > 0) {
                // Shuffle and pick up to 3
                const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
                const queue = shuffled.map((s: any) => ({
                  url: s.video_url,
                  linkUrl: s.link_url || null,
                  mediaType: s.media_type || "video",
                  youtubeUrl: s.youtube_url || null,
                }));
                setMidrollQueue(queue);
                setMidrollTotal(queue.length);
                setMidrollIndex(0);
                setMidrollPreroll(queue[0]);
                return;
              }
            }
            // No preroll found, resume immediately
            setMidrollActive(false);
            ytPostMessage("setVolume", [volume]);
            ytPostMessage("playVideo");
          })();
        }, 2000);
        break;
      }
    }
  }, [ytCurrentTime, isYoutube, selectedVideoId, midrollActive, midrollBreakPoints, user, ytPostMessage]);

  // Handle mid-roll end/skip — advance queue or resume video
  const handleMidrollEnd = useCallback(() => {
    const nextIdx = midrollIndex + 1;
    if (nextIdx < midrollQueue.length) {
      // Play next ad in queue
      setMidrollIndex(nextIdx);
      setMidrollPreroll(midrollQueue[nextIdx]);
      return;
    }
    // All ads done — resume video
    setMidrollActive(false);
    setMidrollPreroll(null);
    setMidrollQueue([]);
    setMidrollIndex(0);
    setMidrollTotal(0);
    ytPostMessage("seekTo", [midrollResumeTime, true]);
    ytPostMessage("setVolume", [0]);
    setTimeout(() => ytPostMessage("playVideo"), 100);
    // Fade-in: gradually restore video and volume over 2s
    setMidrollFading("in");
    setTimeout(() => ytPostMessage("setVolume", [Math.round(volume * 0.3)]), 400);
    setTimeout(() => ytPostMessage("setVolume", [Math.round(volume * 0.6)]), 1000);
    setTimeout(() => {
      ytPostMessage("setVolume", [volume]);
      setMidrollFading(null);
    }, 2000);
  }, [ytPostMessage, midrollResumeTime, volume, midrollIndex, midrollQueue]);

  const handleYtHome = useCallback(() => {
    if (selectedVideoId) {
      ytPostMessage("pauseVideo");
      setSelectedVideoId(null);
      setYtPlaying(false);
    }
  }, [selectedVideoId, ytPostMessage]);

  // Shopping products for current program
  const currentShopProducts = useMemo(() => {
    if (!currentProg) return shopProducts.filter(p => !p.program_id);
    return shopProducts.filter(p => !p.program_id || p.program_id === currentProg.id);
  }, [shopProducts, currentProg]);

  const showShopIcon = shopActive && currentShopProducts.length > 0;
  // playerHomePath is now defined earlier in the component
  const userDisplayName = profileName || user?.email?.split("@")[0] || "Visitante";

  // Shopping popup is manual-only via icon click

  const sidebarItems = useMemo(() => {
    if (is991Channel) {
      return [{ icon: Home, label: "Home", key: "home", action: handleHomeClick }];
    }
    return [
      { icon: Home, label: "Home", key: "home", action: handleHomeClick },
      { icon: Radio, label: "Streaming", key: "streaming", action: () => {} },
      { icon: Film, label: "Conteúdo", key: "content", action: () => {} },
      ...(user && shopActive ? [{ icon: ShoppingBag, label: "Loja", key: "shop", action: () => setShopOpen((o: boolean) => !o) }] : []),
    ];
  }, [handleHomeClick, user, is991Channel, shopActive]);

  if (loading) {
    return (
      <div className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default animate-fade-in">
        <div className="absolute inset-y-0 right-0 left-0">
          <PlayerSkeleton status={loadingStatus} />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default animate-fade-in">

      {/* Dynamic background: program thumb fills entire screen */}
      {(() => {
        const audioBgMode = getComputedStyle(document.documentElement).getPropertyValue("--player-live-audio-bg-mode").trim() || "cover";
        const useGradientBg = isAudio && audioBgMode === "gradient";
        const bgThumb = currentProg?.thumb || currentProg?.capa;
        if (!useGradientBg && bgThumb) {
          return (
            <>
              <img
                key={bgThumb}
                src={bgThumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-1000"
                style={{ opacity: 0.95, zIndex: 0 }}
              />
              {/* Accent color tint overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "hsla(var(--player-accent) / 0.25)", zIndex: 0, mixBlendMode: "multiply" }}
              />
            </>
          );
        }
        if (useGradientBg) {
          const c1 = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-color1").trim() || "#dc2626";
          const c2 = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-color2").trim() || "#000000";
          const gType = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-type").trim() || "radial";
          const gPos = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-position").trim() || "bottom";
          const gAngle = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-angle").trim() || "135";
          const gMid = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-midpoint").trim() || "62";
          const posMap: Record<string, string> = { "top-left": "at top left", "top": "at top center", "top-right": "at top right", "left": "at center left", "center": "at center", "right": "at center right", "bottom-left": "at bottom left", "bottom": "at bottom center", "bottom-right": "at bottom right" };
          const bg = gType === "linear"
            ? `linear-gradient(${gAngle}deg, ${c1} 0%, ${c2} ${gMid}%)`
            : `radial-gradient(ellipse ${posMap[gPos] || "at bottom center"}, ${c1} 0%, ${c2} ${gMid}%)`;
          return <div className="absolute inset-0 pointer-events-none" style={{ background: bg, zIndex: 0 }} />;
        }
        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 100%, hsla(var(--player-accent) / 0.15), transparent 70%), linear-gradient(to bottom, #0a0a0a, #000)",
              zIndex: 0,
            }}
          />
        );
      })()}

      {/* Content wrapper with fade transition */}
      <div className={`transition-opacity duration-400 ease-in-out ${pageFadeOut ? "opacity-0" : "opacity-100"}`}>

      {/* Catalog: Back button — top-left, styled like control bar */}
      {isCatalog && (
        <>
          {/* Top-left hover zone — only shows back button, NOT control bar */}
          <div
            className="absolute top-0 left-0 z-[61] w-48 h-20"
            onMouseEnter={() => setBackBtnVisible(true)}
            onMouseLeave={() => setBackBtnVisible(false)}
          >
            <div
              className="absolute top-4 left-5 transition-all duration-300 ease-out"
              style={{
                opacity: backBtnVisible || barVisible ? 1 : 0,
                transform: backBtnVisible || barVisible ? "translateY(0)" : "translateY(-12px)",
                pointerEvents: backBtnVisible || barVisible ? "auto" : "none",
              }}
            >
              <button
                onClick={() => {
                  setPageFadeOut(true);
                  const navState = (location.state ?? {}) as { fromPath?: string; fromCatalog?: string | null };
                  if (navState.fromPath) {
                    setTimeout(() => navigate(navState.fromPath), 300);
                    return;
                  }
                  const basePath = userSlug
                    ? `/user/${userSlug}/nexohub/player`
                    : "/user/nexohub/player";
                  const catalogName = navState.fromCatalog || canal?.catalog_name;
                  const catalogParam = catalogName ? `?catalog=${encodeURIComponent(catalogName)}` : "";
                  setTimeout(() => navigate(`${basePath}${catalogParam}`), 300);
                }}
                className="group flex items-center gap-2 pl-2.5 pr-4 py-2 rounded-full text-player-foreground/80 hover:text-player-foreground text-xs font-semibold tracking-wide transition-all duration-200 backdrop-blur-2xl border border-player-border hover:border-player-foreground/20 bg-player-surface hover:bg-player-surface-hover shadow-lg hover:shadow-xl"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-player-foreground/10 group-hover:bg-player-accent transition-colors duration-200">
                  <ChevronLeft size={13} className="group-hover:text-player-foreground transition-colors" />
                </span>
                Voltar
              </button>
            </div>
          </div>
        </>
      )}
      {/* Pre-Roll Overlay */}
      {((prerollUrl || (prerollMediaType === "youtube" && prerollYoutubeUrl)) && (!prerollDone || prerollShowing)) && (
        <PreRollOverlay
          prerollUrl={prerollUrl || ""}
          prerollVideoRef={prerollVideoRef}
          prerollLinkUrl={prerollLinkUrl}
          prerollMediaType={prerollMediaType}
          prerollYoutubeUrl={prerollYoutubeUrl}
          prerollBackgroundUrl={prerollBackgroundUrl}
          prerollAspectRatio={prerollAspectRatio}
          prerollVideoPosition={prerollVideoPosition}
          onSkip={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollLinkUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); setPrerollBackgroundUrl(null); setPrerollAspectRatio("16:9"); setPrerollVideoPosition("center"); }}
          onEnded={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); setPrerollBackgroundUrl(null); setPrerollAspectRatio("16:9"); setPrerollVideoPosition("center"); }}
        />
      )}

      {/* Mid-Roll Overlay — fullscreen centered */}
      {midrollActive && midrollPreroll && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: "#000" }}>
          {/* Counter badge */}
          {midrollTotal > 1 && (
            <div className="absolute top-4 right-4 z-[70] flex items-center gap-2">
              <span className="px-4 py-2 rounded-full text-sm font-bold" style={{ backgroundColor: "hsl(var(--player-accent, 0 72% 51%))", color: "#fff" }}>
                anúncio&nbsp;&nbsp;{midrollIndex + 1}/{midrollTotal}
              </span>
            </div>
          )}
          <PreRollOverlay
            prerollUrl={midrollPreroll.url}
            prerollVideoRef={prerollVideoRef}
            prerollLinkUrl={midrollPreroll.linkUrl}
            prerollMediaType={midrollPreroll.mediaType}
            prerollYoutubeUrl={midrollPreroll.youtubeUrl}
            onSkip={handleMidrollEnd}
            onEnded={handleMidrollEnd}
            hideSkip={isCatalog}
          />
        </div>
      )}

      {/* Shopping Panel — above control bar, right-aligned */}
      {shopOpen && (
        <div className="absolute left-0 right-0 z-40 mx-auto" style={{ bottom: "170px", width: "80%", paddingLeft: "8px", paddingRight: "8px" }}>
          <div className="ml-auto" style={{ maxWidth: "360px" }}>
            <div className="backdrop-blur-xl rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: "rgba(10,10,10,0.6)", boxShadow: "0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <PlayerShopProduct
                products={currentShopProducts}
                productIndex={shopProductIndex}
                setProductIndex={setShopProductIndex}
                onClose={() => setShopOpen(false)}
                variant="panel"
              />
            </div>
          </div>
        </div>
      )}


      {/* YouTube: Fullscreen background video iframe — proper aspect ratio */}
      {isYoutube && selectedVideoId && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <iframe
            ref={ytIframeRef}
            className="absolute pointer-events-none"
            style={{
              width: "100%", height: "100%", top: "0", left: "0", border: "none",
              transition: "opacity 2s ease-in-out",
              opacity: midrollFading === "out" ? 0 : 1,
            }}
            src={`https://www.youtube.com/embed/${selectedVideoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&enablejsapi=1&playsinline=1&iv_load_policy=3&disablekb=1&vq=hd1080&origin=${window.location.origin}`}
            allow="autoplay; encrypted-media"
          />
          {/* Transparent overlay to block YouTube controls on pause */}
          <div className="absolute inset-0 z-[1]" />
        </div>
      )}

      {/* YouTube: Thumbnail placeholder when no video selected */}
      {isYoutube && !selectedVideoId && (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${youtubeVideos.length > 0 ? youtubeVideos[0].thumbnail.replace('default.jpg','maxresdefault.jpg') : ''})`, backgroundColor: '#111' }}
        />
      )}

      {/* YouTube: Subtle bottom gradient only for control bar readability */}
      {isYoutube && (
        <div className="absolute inset-x-0 bottom-0 z-[1]" style={{ height: "200px", background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }} />
      )}

      {/* YouTube: Horizontal playlist — shown on home by default OR when sidebarOpen, hidden for single-video catalogs */}
      {isYoutube && youtubeVideos.length > 1 && (isYtHome || sidebarOpen) && (
        <div className="absolute left-0 right-0 z-[25] mx-auto" style={{ bottom: "155px", maxWidth: "1400px", paddingLeft: "20px", paddingRight: "20px" }}>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "transparent", border: "none", boxShadow: "none" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <span className="text-white text-sm font-bold flex items-center gap-2"><List size={16} /> Últimos Programas</span>
              <div className="flex items-center gap-3">
                {canal?.url && (
                  <a href={canal.url} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white/80 text-xs flex items-center gap-1.5 transition-colors">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="text-red-500"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff"/></svg>
                    veja todos os programas no youtube
                  </a>
                )}
                {!isYtHome && (
                  <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white transition-colors" title="Fechar"><X size={16} /></button>
                )}
              </div>
            </div>
            <div className="relative group">
              {/* Left arrow */}
              <button
                onClick={() => { const el = document.getElementById('yt-playlist-scroll'); if (el) el.scrollBy({ left: -400, behavior: 'smooth' }); }}
                onMouseEnter={() => { const el = document.getElementById('yt-playlist-scroll'); if (el) el.scrollBy({ left: -200, behavior: 'smooth' }); }}
                className="absolute left-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center bg-gradient-to-r from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white"
              >
                <ChevronUp size={20} className="rotate-[-90deg]" />
              </button>
              {/* Right arrow */}
              <button
                onClick={() => { const el = document.getElementById('yt-playlist-scroll'); if (el) el.scrollBy({ left: 400, behavior: 'smooth' }); }}
                onMouseEnter={() => { const el = document.getElementById('yt-playlist-scroll'); if (el) el.scrollBy({ left: 200, behavior: 'smooth' }); }}
                className="absolute right-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center bg-gradient-to-l from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white"
              >
                <ChevronDown size={20} className="rotate-[-90deg]" />
              </button>
              <div id="yt-playlist-scroll" className="flex gap-3 overflow-x-hidden px-4 py-3 scroll-smooth">
                {youtubeVideos.map((v) => (
                  <button key={v.videoId} onClick={() => handleSelectVideo(v.videoId)}
                    className={`flex flex-col shrink-0 rounded-lg overflow-hidden transition-all ${selectedVideoId === v.videoId ? "ring-2 ring-player-accent" : "hover:ring-1 hover:ring-white/30"}`}
                    style={{ width: "180px" }}
                  >
                    <div className="relative">
                      <img src={v.thumbnail} alt="" className="w-full h-[100px] object-cover" />
                      {selectedVideoId === v.videoId && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play size={20} className="text-white fill-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-white/5">
                      <div className="text-white text-[11px] font-semibold line-clamp-2 leading-tight">{v.title}</div>
                    </div>
                  </button>
                ))}
                {youtubeVideos.length === 0 && (
                  <div className="text-white/40 text-xs text-center py-6 w-full">Carregando programas...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video element */}
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-contain bg-black ${isAudio || isYoutube ? "hidden" : ""}`} muted={muted} playsInline autoPlay={false} />
      <audio ref={audioRef} muted={!isAudio || muted} preload="none" />

      {/* Volume OSD — centered overlay */}
      {volumeOsd && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none animate-in fade-in zoom-in-90 duration-200"
          style={{ animation: volumeOsd ? "fadeInScale 0.2s ease-out" : "none" }}>
          <div className="flex flex-col items-center gap-2 rounded-2xl px-6 py-5"
            style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", minWidth: "100px" }}>
            {muted ? <VolumeX size={32} className="text-white/90" /> : <Volume2 size={32} className="text-white/90" />}
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${muted ? 0 : volume}%`, backgroundColor: "hsl(var(--player-accent))" }} />
            </div>
            <span className="text-white/80 text-xs font-medium">{muted ? "Mudo" : `${volume}%`}</span>
          </div>
        </div>
      )}

      {/* Empresa logo on 991-1 */}
      {normalizeChannelNumber(canal?.numero_canal) === "991-1" && empresaLogo && playing && (
        <img
          src={empresaLogo}
          alt="Logo"
          className="absolute top-4 right-4 z-30 object-contain rounded-lg"
          style={{ width: 100, height: 100 }}
        />
      )}

      {/* Buffering overlay — hidden for catalog channels */}
      {streamStalled && playing && !isCatalog && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/60 gap-4">
          <Loader2 className="animate-spin" size={56} style={{ color: "#d30707" }} />
          <span className="text-white text-sm font-bold tracking-wide uppercase animate-pulse">Sintonizando canal...</span>
        </div>
      )}


      {/* Floating album cover — centered on screen for audio channels only */}
      {isAudio && playing && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
          <div
            key={`cover-wrap-${musicAnimKey}`}
            className="relative rounded-3xl overflow-hidden"
            style={{
              animation: "playerCoverIn 0.5s ease-out",
              boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px hsla(var(--player-accent) / 0.2)`,
              border: "2px solid hsla(var(--player-accent) / 0.5)",
              background: "rgba(0,0,0,0.4)",
              padding: "8px",
              width: "min(380px, 30vw)",
              height: "min(380px, 30vw)",
            }}
          >
            {musicData?.capa && musicData.titulo !== "Sem título" ? (
              <img
                src={musicData.capa}
                alt=""
                className="rounded-[20px] object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full rounded-[20px] flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <Radio size={48} style={{ color: "hsla(var(--player-accent) / 0.3)" }} />
              </div>
            )}
            {/* Heart icon top-right */}
            {musicData?.titulo && musicData.titulo !== "Sem título" && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleLike(); }}
                className="absolute top-5 right-5 pointer-events-auto transition-all hover:scale-110"
                style={{ zIndex: 5 }}
              >
                <Heart
                  size={24}
                  className="transition-colors drop-shadow-lg"
                  style={{
                    color: liked ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.7)",
                    fill: liked ? "hsl(var(--player-accent))" : "transparent",
                  }}
                />
              </button>
            )}
            {/* Music info bottom-left overlay */}
            {musicData?.titulo && musicData.titulo !== "Sem título" && (
              <div key={`music-overlay-${musicAnimKey}`} className="absolute bottom-6 left-6 right-6 pointer-events-none" style={{ animation: "playerFadeSlideIn 0.4s ease-out", zIndex: 5 }}>
                <span className="text-white/60 text-xs font-medium block mb-0.5">tocando:</span>
                <span className="text-white text-xl sm:text-2xl font-black italic leading-tight block truncate">{musicData.titulo}</span>
                <span className="text-white/80 text-sm sm:text-base font-bold block truncate">{musicData.artista && musicData.artista !== "Desconhecido" ? musicData.artista : ""}</span>
              </div>
            )}
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
              background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)",
            }} />
          </div>
        </div>
      )}

      {/* Top hover zone — triggers top bar visibility */}
      {!isCatalog && !isYoutube && !isPrerollVisible && !midrollActive && playing && (
        <div
          className="absolute top-0 left-0 right-0 z-[51] h-14 pointer-events-auto"
          style={{ pointerEvents: topBarVisible ? "none" : "auto" }}
          onMouseEnter={resetTopBarTimer}
        />
      )}

      {/* Top Header Bar — new layout: logo | channel nav | agora: program | right: a seguir */}
      {!isCatalog && !isYoutube && !isPrerollVisible && !midrollActive && playing && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex items-center gap-4 px-4 sm:px-8 py-3 sm:py-4 transition-all duration-500 ease-in-out"
           style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)",
            opacity: topBarVisible ? 1 : 0,
            pointerEvents: topBarVisible ? "auto" : "none",
            transform: topBarVisible ? "translateY(0)" : "translateY(-100%)",
          }}
          onMouseEnter={() => { setTopBarVisible(true); if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current); }}
          onMouseLeave={resetTopBarTimer}
        >
          {/* Logo da empresa */}
          {empresaLogo ? (
            <img
              src={empresaLogo}
              alt="Logo"
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-lg shrink-0 cursor-pointer"
              onClick={handleHomeClick}
            />
          ) : (
            <button
              onClick={handleHomeClick}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center shrink-0 transition-all hover:scale-105"
              style={{ background: "hsla(var(--player-accent) / 0.15)", border: "1px solid hsla(var(--player-accent) / 0.3)" }}
            >
              <Home size={20} style={{ color: "hsl(var(--player-accent))" }} />
            </button>
          )}

          {/* Channel number + nav arrows */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center gap-0">
              {liveChannels.length > 1 && (
                <button onClick={() => navigateChannel(-1)} className="hover:opacity-100 transition-colors p-0.5" style={{ color: "hsl(var(--player-accent))" }}><ChevronUp size={18} /></button>
              )}
              {liveChannels.length > 1 && (
                <button onClick={() => navigateChannel(1)} className="hover:opacity-100 transition-colors p-0.5" style={{ color: "hsl(var(--player-accent))" }}><ChevronDown size={18} /></button>
              )}
            </div>
            <span key={`chnum-${channelAnimKey}`} className="text-2xl sm:text-3xl font-black tabular-nums text-white/90" style={{ animation: `playerSlide${channelNavDir > 0 ? "Up" : "Down"} 0.35s ease-out` }}>
              #{canal?.numero_canal || "000"}
            </span>
          </div>

          {/* agora: program name + presenter */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs sm:text-sm font-black italic" style={{ color: "hsl(var(--player-accent))" }}>agora:</span>
            <span key={`noar-${currentProg?.nome}-${channelAnimKey}`} className="text-xl sm:text-2xl font-black text-white leading-tight truncate" style={{ animation: "playerFadeSlideIn 0.4s ease-out" }}>
              {currentProg?.nome || canal?.name || "—"}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mic size={12} style={{ color: "hsl(var(--player-accent))" }} />
              <span className="text-xs sm:text-sm font-bold text-white/70 truncate">{currentPresenter?.nome || ""}</span>
            </div>
          </div>

          {/* Right: a seguir */}
          {nextProg && (
            <div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto">
              <div className="flex flex-col items-end min-w-0">
                <span className="text-xs font-medium" style={{ color: "hsl(var(--player-accent))" }}>a seguir:</span>
                <span className="text-sm sm:text-base font-bold text-white leading-tight truncate max-w-[200px]">{nextProg.nome}</span>
              </div>
              {/* Next presenter avatar */}
              {nextPresenter?.foto ? (
                <img src={nextPresenter.foto} alt={nextPresenter.nome} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover" style={{ border: "2px solid hsl(var(--player-accent))" }} />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Karaoke overlay */}
      {karaokeEnabled && playing && (
        <Suspense fallback={null}>
          <KaraokeOverlay
            artist={musicData?.artista}
            title={musicData?.titulo}
            audioElement={audioRef.current}
            visible={karaokeEnabled}
            duration={musicData?.duracao}
            onLyricsNotFound={() => setKaraokeVisible(false)}
            onLyricsFound={() => setKaraokeVisible(true)}
          />
        </Suspense>
      )}

      {/* Idle state — only show if never played (no stream loaded) */}
      {!playing && !audioRef.current?.src && !videoRef.current?.src && !isYoutube && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10 px-4">
          {canal?.logo_url && <img src={canal.logo_url} alt={canal.name} className="w-20 h-20 sm:w-32 sm:h-32 object-contain mb-4 sm:mb-6 rounded-xl" />}
          <h1 className="text-white text-xl sm:text-3xl font-bold mb-2 text-center">{canal?.name || "Nenhum canal"}</h1>
          {canal && <p className="text-white/50 text-xs sm:text-sm mb-6 sm:mb-8">Canal {canal.numero_canal}</p>}
          {canal && (
            <button onClick={handlePlayCanal} className="flex items-center gap-2 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-bold text-base sm:text-lg transition-all" style={{ backgroundColor: "hsl(var(--player-accent))" }}>
              <Play size={18} fill="white" /> Assistir
            </button>
          )}
        </div>
      )}

      {/* Grade Dialog — lazy loaded */}
      {gradeOpen && (
        <Suspense fallback={
          <div className="absolute inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
            <Loader2 className="animate-spin" size={32} style={{ color: "#d30707" }} />
          </div>
        }>
          <PlayerGradeDialog programas={programas} onClose={() => setGradeOpen(false)} />
        </Suspense>
      )}

      {/* CC subtitle display */}
      <div
        className="absolute left-0 right-0 z-[30] flex justify-center pointer-events-none transition-all duration-500 ease-in-out"
        style={{ bottom: "160px", opacity: ccEnabled && ccText ? 1 : 0, transform: ccEnabled && ccText ? "translateY(0)" : "translateY(10px)" }}
      >
        <div className="px-6 py-3 rounded-lg max-w-3xl text-center overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <span className="text-white text-lg font-medium leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis block">{ccText}</span>
        </div>
      </div>

      {/* Bottom minimal controls — flat panel */}
      {!isCatalog && !isYoutube && !isPrerollVisible && !midrollActive && playing && (
        <div className="absolute left-0 right-0 bottom-0 z-50" style={{ height: "110px" }} onMouseEnter={showBar} onMouseLeave={hideBar}>
          <div
            className="absolute left-0 right-0 bottom-0 mx-auto px-5 sm:px-10 pb-5 pt-3 transition-all duration-400 ease-in-out"
            style={{ maxWidth: "1400px", opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(16px)", pointerEvents: barVisible ? "auto" : "none", background: `linear-gradient(0deg, var(--player-watch-music-bg, rgba(0,0,0,0.6)) 0%, transparent 100%)` }}
          >
            {/* New layout: Play circle | Scrubber | Circular icon buttons */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Play/Pause — large accent circle */}
              <button
                onClick={handlePlayCanal}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105"
                style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000", boxShadow: "0 0 20px hsla(var(--player-accent) / 0.4)" }}
                title={playing ? "Pausar" : "Reproduzir"}
              >
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
              </button>

              {/* Scrubber bar */}
              <div className="flex-1 min-w-0">
                {(() => {
                  void musicTick;
                  let musicElapsed = 0;
                  let musicTotal = musicData?.duracao || 0;
                  if (musicTotal > 0) {
                    if (musicData?.horario) {
                      const now = new Date();
                      const parts = musicData.horario.split(":").map(Number);
                      const startDate = new Date(now);
                      startDate.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
                      musicElapsed = Math.max(0, (now.getTime() - startDate.getTime()) / 1000);
                      if (musicElapsed > musicTotal) musicElapsed = musicTotal;
                    }
                    if (musicElapsed <= 0) {
                      const startStr = localStorage.getItem("masterview_music_start");
                      if (startStr) {
                        musicElapsed = Math.max(0, (Date.now() - parseInt(startStr, 10)) / 1000);
                        if (musicElapsed > musicTotal) musicElapsed = musicTotal;
                      }
                    }
                  }
                  const musicPct = musicTotal > 0 ? Math.min(100, (musicElapsed / musicTotal) * 100) : 0;
                  return (
                    <div className="w-full group cursor-pointer">
                      <div className="w-full h-[3px] rounded-full overflow-hidden group-hover:h-[5px] transition-all" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${musicPct}%`, backgroundColor: "hsl(var(--player-accent))", boxShadow: `0 0 8px hsla(var(--player-accent) / 0.5)` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Circular icon buttons — accent colored */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Volume */}
                <div className="relative" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
                  <button
                    onClick={toggleMuteWithOsd}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
                    style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}
                    title={muted ? "Ativar som" : "Desativar som"}
                  >
                    {muted ? <VolumeX size={18} /> : volume < 50 ? <Volume1 size={18} /> : <Volume2 size={18} />}
                  </button>
                  {volumeHover && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100] rounded-xl px-3 py-3 flex flex-col items-center gap-1.5 border border-white/10 shadow-xl" style={{ backgroundColor: "rgba(10,10,10,0.92)" }}>
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">Vol</span>
                      <input
                        type="range" min={0} max={100} value={volume}
                        onChange={(e) => handleVolumeChangeWithOsd(Number(e.target.value))}
                        className="h-[100px] appearance-none cursor-pointer"
                        style={{ writingMode: "vertical-lr", direction: "rtl", width: "6px", accentColor: "hsl(var(--player-accent))" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-[10px] font-bold text-white tabular-nums">{volume}%</span>
                    </div>
                  )}
                </div>

                {/* Chat */}
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
                  style={{ backgroundColor: chatOpen ? "hsl(var(--player-accent))" : "hsl(var(--player-accent))", color: "#000" }}
                  title="Chat ao Vivo"
                >
                  <MessageSquare size={18} />
                </button>

                {/* Shop */}
                {shopActive && (
                  <button
                    onClick={() => setShopOpen(!shopOpen)}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 relative"
                    style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}
                    title="Shopping ao Vivo"
                  >
                    <ShoppingCart size={18} />
                    {showShopIcon && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white border-2" style={{ borderColor: "hsl(var(--player-accent))" }} />}
                  </button>
                )}

                {/* Settings/Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all hover:scale-105"
                  style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}
                  title={fullscreen ? "Sair tela cheia" : "Tela cheia"}
                >
                  <Settings2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control bar for CATALOG channels — keep original behavior */}
      {isCatalog && !isPrerollVisible && !midrollActive && (
      <div className="absolute left-0 right-0 bottom-0 z-50" style={{ height: "140px" }} onMouseEnter={showBar} onMouseLeave={hideBar}
        onClick={() => setBarVisible(v => !v)}
      >
        <div className="absolute left-0 right-0 bottom-2 sm:bottom-5 mx-auto transition-all duration-400 ease-in-out"
          style={{ width: "80%", paddingLeft: "8px", paddingRight: "8px", opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(20px)", pointerEvents: barVisible ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 sm:gap-0 rounded-2xl border border-white/8 px-2 sm:px-5 py-2 sm:py-3" style={{ backgroundColor: "var(--player-watch-bottombar-bg, rgba(0, 0, 0, 0.6))" }}>

           {/* Channel logo + Catalog controls */}
           <div className="flex items-center gap-2 sm:gap-3 sm:pr-5 sm:border-r border-white/10 shrink-0">
            {canal?.background_url && canal.background_url.trim() !== "" ? (
              <img src={canal.background_url} alt="" className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-contain" />
            ) : canal?.logo_url && canal.logo_url.trim() !== "" ? (
              <img src={canal.logo_url} alt="" className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-contain" />
            ) : (
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg bg-white/10 flex items-center justify-center text-white text-sm sm:text-lg font-bold">{canal?.numero_canal || "?"}</div>
            )}

            {selectedVideoId && (
              <div className="flex items-center gap-1">
                <button onClick={ytPrevVideo} className="text-white/60 hover:text-white transition-colors rounded-md p-1" title="Vídeo anterior"><SkipBack size={15} /></button>
                <button onClick={ytTogglePlay} className="w-8 h-8 rounded-full border-2 border-player-accent flex items-center justify-center transition-all hover:bg-player-accent/20" title={ytPlaying ? "Pausar" : "Reproduzir"}>
                  {ytPlaying ? <Pause size={14} className="text-player-accent" /> : <Play size={14} className="text-player-accent fill-player-accent" />}
                </button>
                <button onClick={ytNextVideo} className="text-white/60 hover:text-white transition-colors rounded-md p-1" title="Próximo vídeo"><SkipForward size={15} /></button>
              </div>
            )}
            {!selectedVideoId && (
              <button onClick={handlePlayCanal} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-player-accent flex items-center justify-center transition-all hover:bg-player-accent/20" title="Reproduzir">
                <Play size={14} className="text-player-accent fill-player-accent" />
              </button>
            )}
          </div>

          {/* Program Info */}
          <div className="hidden sm:block px-5 min-w-0" style={{ flex: "0 1 450px" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--player-watch-topbar-accent, hsl(var(--player-accent)))" }}>No Ar:</span>
            <MarqueeText className="text-lg font-bold leading-tight" text={channelLabel} />
            {programLabel && (
              <MarqueeText className="text-white/60 text-sm leading-tight" text={programLabel} />
            )}
            {selectedVideoId ? (
              <div className="w-full mt-2 group cursor-pointer relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const seekTime = pct * ytDuration;
                  ytPostMessage("seekTo", [seekTime, true]);
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const time = pct * ytDuration;
                  const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement;
                  if (tooltip) {
                    tooltip.style.left = `${pct * 100}%`;
                    tooltip.style.opacity = "1";
                    tooltip.textContent = fmtTime(time);
                  }
                }}
                onMouseLeave={(e) => {
                  const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "0";
                }}
              >
                <div data-seek-tooltip className="absolute -top-6 text-[10px] font-bold text-white bg-black/90 px-1.5 py-0.5 rounded pointer-events-none -translate-x-1/2 opacity-0 transition-opacity z-10 whitespace-nowrap" />
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden group-hover:h-3 transition-all relative">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }} />
                </div>
                {midrollBreakPoints.map((bp, i) => (
                  <div
                    key={i}
                    className="absolute top-0 w-[6px] rounded-full bg-white"
                    style={{
                      left: `${(bp / ytDuration) * 100}%`,
                      height: "100%",
                      minHeight: "4px",
                      transform: "translateX(-50%)",
                      opacity: 0.9,
                    }}
                    title={`Intervalo ${i + 1} — ${fmtTime(bp)}`}
                  />
                ))}
              </div>
            ) : null}
            {selectedVideoId ? (
              <span className="text-[10px] mt-1 inline-block" style={{ color: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }}>
                {fmtTime(ytCurrentTime)} - {fmtTime(ytDuration)}
              </span>
            ) : null}
          </div>

          {/* Progress bar on mobile */}
          <div className="sm:hidden w-full">
            {selectedVideoId ? (
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }} />
              </div>
            ) : null}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 px-1 sm:px-3 sm:border-l border-player-border shrink-0 flex-wrap justify-center sm:justify-start">
            {/* Volume */}
            <div className="relative flex items-center" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
              <button
                onClick={toggleMuteWithOsd}
                className="inline-flex items-center gap-1.5 rounded-lg border border-player-border px-2.5 py-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-player-accent hover:opacity-80"
                style={{ background: "var(--layout-button-bg)", color: "var(--layout-button-text)" }}
                title={muted ? "Ativar som" : "Desativar som"}
              >
                {muted ? <VolumeX size={15} /> : volume < 50 ? <Volume1 size={15} /> : <Volume2 size={15} />}
                <span className="text-[10px] font-bold min-w-[28px] text-center tabular-nums">{muted ? "0%" : `${volume}%`}</span>
              </button>
              {volumeHover && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100] rounded-xl px-3 py-3 flex flex-col items-center gap-1.5 bg-player-bg/95 border border-player-border shadow-xl">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-player-muted-foreground">Vol</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => handleVolumeChangeWithOsd(Number(e.target.value))}
                    className="h-[100px] appearance-none cursor-pointer"
                    style={{ writingMode: "vertical-lr", direction: "rtl", width: "6px", accentColor: "hsl(var(--player-accent))" }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-[10px] font-bold text-player-foreground tabular-nums">{volume}%</span>
                </div>
              )}
            </div>

            <div className="hidden sm:block w-px h-5 bg-player-border" />

            {/* Playback controls */}
            <div className="flex items-center gap-0.5 rounded-lg border border-player-border bg-player-surface/60 px-1 py-0.5">
              <button onClick={toggleFullscreen} className="text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1.5" title={fullscreen ? "Sair tela cheia" : "Tela cheia"}>
                {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
              </button>
              <button
                onClick={() => { const v = videoRef.current || audioRef.current; if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); else if (v && "requestPictureInPicture" in v) (v as HTMLVideoElement).requestPictureInPicture().catch(() => {}); }}
                className="hidden sm:inline-flex text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1.5"
                title="Picture-in-Picture"
              >
                <PictureInPicture size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* YouTube non-catalog control bar — kept for YouTube channels */}
      {isYoutube && !isCatalog && !isPrerollVisible && !midrollActive && (
      <div className="absolute left-0 right-0 bottom-0 z-50" style={{ height: "140px" }} onMouseEnter={showBar} onMouseLeave={hideBar}
        onClick={() => setBarVisible(v => !v)}
      >
        <div className="absolute left-0 right-0 bottom-2 sm:bottom-5 mx-auto transition-all duration-400 ease-in-out"
          style={{ width: "80%", paddingLeft: "8px", paddingRight: "8px", opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(20px)", pointerEvents: barVisible ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 sm:gap-0 rounded-2xl border border-white/8 px-2 sm:px-5 py-2 sm:py-3" style={{ backgroundColor: "var(--player-watch-bottombar-bg, rgba(0, 0, 0, 0.6))" }}>
           <div className="flex items-center gap-2 sm:gap-3 sm:pr-5 sm:border-r border-white/10 shrink-0">
            {canal?.background_url && canal.background_url.trim() !== "" ? (
              <img src={canal.background_url} alt="" className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-contain" />
            ) : canal?.logo_url && canal.logo_url.trim() !== "" ? (
              <img src={canal.logo_url} alt="" className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-contain" />
            ) : (
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg bg-white/10 flex items-center justify-center text-white text-sm sm:text-lg font-bold">{canal?.numero_canal || "?"}</div>
            )}
            <div className="flex-1 min-w-0 sm:hidden">
               <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--player-watch-topbar-accent, hsl(var(--player-accent)))" }}>No Ar:</span>
               <MarqueeText className="text-sm font-bold leading-tight" text={channelLabel} />
            </div>
          </div>

          <div className="hidden sm:block px-5 min-w-0" style={{ flex: "0 1 450px" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--player-watch-topbar-accent, hsl(var(--player-accent)))" }}>No Ar:</span>
            <MarqueeText className="text-lg font-bold leading-tight" text={channelLabel} />
            {programLabel && <MarqueeText className="text-white/60 text-sm leading-tight" text={programLabel} />}
            {selectedVideoId ? (
              <div className="w-full mt-2 group cursor-pointer relative"
                onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; ytPostMessage("seekTo", [pct * ytDuration, true]); }}
                onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement; if (tooltip) { tooltip.style.left = `${pct * 100}%`; tooltip.style.opacity = "1"; tooltip.textContent = fmtTime(pct * ytDuration); } }}
                onMouseLeave={(e) => { const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement; if (tooltip) tooltip.style.opacity = "0"; }}
              >
                <div data-seek-tooltip className="absolute -top-6 text-[10px] font-bold text-white bg-black/90 px-1.5 py-0.5 rounded pointer-events-none -translate-x-1/2 opacity-0 transition-opacity z-10 whitespace-nowrap" />
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden group-hover:h-3 transition-all relative">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }} />
                </div>
              </div>
            ) : null}
            {selectedVideoId ? (
              <span className="text-[10px] mt-1 inline-block" style={{ color: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }}>{fmtTime(ytCurrentTime)} - {fmtTime(ytDuration)}</span>
            ) : null}
          </div>

          <div className="sm:hidden w-full">
            {selectedVideoId ? (
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "var(--player-watch-scrubber, hsl(var(--player-accent)))" }} />
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 px-1 sm:px-3 sm:border-l border-player-border shrink-0 flex-wrap justify-center sm:justify-start">
            <button onClick={handleHomeClick} className="rounded-lg border border-player-border p-1.5 transition-all hover:opacity-80" style={{ background: "var(--layout-button-bg)", color: "var(--layout-button-text)" }} title="Voltar ao Hub"><Home size={15} /></button>
            <div className="relative flex items-center" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
              <button onClick={toggleMuteWithOsd} className="inline-flex items-center gap-1.5 rounded-lg border border-player-border px-2.5 py-1.5 transition-all hover:opacity-80" style={{ background: "var(--layout-button-bg)", color: "var(--layout-button-text)" }} title={muted ? "Ativar som" : "Desativar som"}>
                {muted ? <VolumeX size={15} /> : volume < 50 ? <Volume1 size={15} /> : <Volume2 size={15} />}
                <span className="text-[10px] font-bold min-w-[28px] text-center tabular-nums">{muted ? "0%" : `${volume}%`}</span>
              </button>
              {volumeHover && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100] rounded-xl px-3 py-3 flex flex-col items-center gap-1.5 bg-player-bg/95 border border-player-border shadow-2xl backdrop-blur-sm">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-player-muted-foreground">Vol</span>
                  <input type="range" min={0} max={100} value={volume} onChange={(e) => handleVolumeChangeWithOsd(Number(e.target.value))} className="h-[100px] appearance-none cursor-pointer" style={{ writingMode: "vertical-lr", direction: "rtl", width: "6px", accentColor: "hsl(var(--player-accent))" }} onClick={(e) => e.stopPropagation()} />
                  <span className="text-[10px] font-bold text-player-foreground tabular-nums">{volume}%</span>
                </div>
              )}
            </div>
            <div className="hidden sm:block w-px h-5 bg-player-border" />
            <div className="flex items-center gap-0.5 rounded-lg border border-player-border bg-player-surface/60 px-1 py-0.5">
              <button onClick={handleYtHome} className={`rounded-md w-7 h-7 flex items-center justify-center transition-all ${!selectedVideoId ? "bg-player-accent text-player-foreground" : "text-player-muted-foreground hover:text-player-foreground"}`} title="Início do canal"><Home size={12} /></button>
              {selectedVideoId && (
                <>
                  <button onClick={ytPrevVideo} className="text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1"><SkipBack size={13} /></button>
                  <button onClick={ytTogglePlay} className="text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1.5">{ytPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}</button>
                  <button onClick={ytNextVideo} className="text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1"><SkipForward size={13} /></button>
                </>
              )}
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`rounded-md w-7 h-7 flex items-center justify-center transition-all ${sidebarOpen ? "bg-player-accent text-player-foreground" : "text-player-muted-foreground hover:text-player-foreground"}`} title={sidebarOpen ? "Fechar Playlist" : "Abrir Playlist"}><List size={12} /></button>
              <button onClick={toggleFullscreen} className="text-player-muted-foreground hover:text-player-foreground transition-colors rounded-md p-1.5">{fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}</button>
            </div>
          </div>
        </div>
      </div>
      </div>
      )}

      {chatOpen && (
        <Suspense fallback={<div className="fixed z-[55] w-[290px] rounded-2xl border border-white/10 flex items-center justify-center" style={{ backgroundColor: "rgba(10,10,10,0.95)", bottom: shopOpen ? "460px" : "165px", right: "20px", height: "400px" }}><Loader2 className="animate-spin text-white" size={24} /></div>}>
          <PlayerChat channelId={canal?.id || "default"} onClose={() => setChatOpen(false)} shopOpen={shopOpen} />
        </Suspense>
      )}

      {/* Floating heart animation keyframes */}
      <style>{`
        @keyframes slideDownIn {
          0% { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatHeart {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-60px) scale(0.5); }
        }
        @keyframes marqueeScroll {
          0%, 20% { transform: translateX(0); }
          80% { transform: translateX(var(--marquee-distance, 0px)); }
          95%, 100% { transform: translateX(0); }
        }
        .marquee-scroll[data-overflow="true"] {
          animation: marqueeScroll 8s ease-in-out infinite;
        }
        .marquee-scroll[data-overflow="false"] {
          animation: none;
        }
        @keyframes playerSlideUp {
          0% { opacity: 0; transform: translateY(100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes playerSlideDown {
          0% { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes playerFadeSlideIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes playerCoverIn {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      </div>

    </div>
  );
}

import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import type HlsType from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useParams } from "react-router-dom";
import {
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
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
  ShoppingCart,
  Settings2,
} from "lucide-react";

const PlayerChat = lazy(() => import("@/components/PlayerChat"));
const AudioSpectrum = lazy(() => import("@/components/AudioSpectrum"));
const AudioDualCard = lazy(() => import("@/components/AudioDualCard"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
const KaraokeOverlay = lazy(() => import("@/components/KaraokeOverlay"));
import PlayerShopProduct from "@/components/player/PlayerShopProduct";
import PreRollOverlay from "@/components/PreRollOverlay";
import PlayerSkeleton from "@/components/skeletons/PlayerSkeleton";

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

const DAY_MAP_SHORT: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
const DAY_MAP_FULL: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };

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
    const elements = [videoRef.current, audioRef.current].filter(Boolean) as HTMLMediaElement[];
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
  }, []);

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
  const { userSlug } = useParams<{ userSlug?: string }>();
  const isPublicMode = !!userSlug;
  const { user, loading: authLoading } = useAuth();
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [volumeHover, setVolumeHover] = useState(false);
  const volumeHideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Iniciando...");
  const [barVisible, setBarVisible] = useState(true);
  const [musicData, setMusicData] = useState<MusicData | null>(() => {
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

  // YouTube video progress tracking
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

  const canal = canais[currentIndex] || null;
  const isAudio = canal?.type === "audio_live" || canal?.type === "audio";
  const isYoutube = canal?.type === "youtube";
  const isVideo = canal?.type === "video";
  const autoPlayedRef = useRef(false);

  // Shopping & Pre-Roll state
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopPopupDismissed, setShopPopupDismissed] = useState(true);
  const [shopProductIndex, setShopProductIndex] = useState(0);
  const shopPopupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prerollUrl, setPrerollUrl] = useState<string | null>(null);
  const [prerollLinkUrl, setPrerollLinkUrl] = useState<string | null>(null);
  const [prerollMediaType, setPrerollMediaType] = useState<string>("video");
  const [prerollYoutubeUrl, setPrerollYoutubeUrl] = useState<string | null>(null);
  const [prerollDone, setPrerollDone] = useState(false);
  const [prerollShowing, setPrerollShowing] = useState(false);
  const prerollVideoRef = useRef<HTMLVideoElement>(null);
  const prerollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mid-roll state for YouTube
  const [midrollActive, setMidrollActive] = useState(false);
  const [midrollResumeTime, setMidrollResumeTime] = useState(0);
  const midrollTriggeredRef = useRef<Set<number>>(new Set());
  const [midrollPreroll, setMidrollPreroll] = useState<{ url: string; linkUrl: string | null; mediaType: string; youtubeUrl: string | null } | null>(null);

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
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    // Reset immediately on music change
    setLiked(false);
    setLikeCount(0);
    
    if (!user || !musicData?.titulo || !musicData?.artista) {
      return;
    }
    const check = async () => {
      const [{ data: myLike }, { count }] = await Promise.all([
        supabase.from("music_likes").select("id").eq("user_id", user.id).eq("titulo", musicData.titulo).eq("artista", musicData.artista).limit(1),
        supabase.from("music_likes").select("*", { count: "exact", head: true }).eq("titulo", musicData.titulo).eq("artista", musicData.artista),
      ]);
      setLiked(!!(myLike && myLike.length > 0));
      setLikeCount(count ?? 0);
    };
    check();
  }, [user, musicData?.titulo, musicData?.artista]);

  const toggleLike = useCallback(async () => {
    if (!user || !musicData?.titulo || !musicData?.artista) return;
    await supabase.from("music_likes").insert({ user_id: user.id, titulo: musicData.titulo, artista: musicData.artista, capa: musicData.capa || "" });
    setLiked(true);
    setLikeCount((c) => c + 1);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 600);
    const hearts = Array.from({ length: 6 }, (_, i) => ({ id: Date.now() + i, x: Math.random() * 40 - 20, delay: Math.random() * 0.3 }));
    setFloatingHearts(hearts);
    setTimeout(() => setFloatingHearts([]), 1500);
  }, [user, musicData]);

  // Fetch all initial data — 3 stages for fastest possible first paint
  useEffect(() => {
    let cancelled = false;

    // PUBLIC MODE: fetch via edge function
    if (isPublicMode) {
      setLoading(true);
      setLoadingStatus("Carregando canais...");

      supabase.functions.invoke("public-player-data", { body: { slug: userSlug } })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error || !data) {
            setCanais([]);
            setPrerollDone(true);
            setLoading(false);
            return;
          }
          setPublicUserId(data.userId);
          setCanais((data.channels || []) as Canal[]);
          setProgramas((data.programas || []) as Programa[]);
          setApresentadores((data.apresentadores || []) as Apresentador[]);
          setShopProducts(data.shopProducts || []);

          // Handle prerolls
          const now = new Date();
          const today = DAY_MAP_FULL[now.getDay()];
          const todayStr = now.toISOString().slice(0, 10);
          const prerolls = (data.prerolls || []).filter((p: any) => {
            if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(today)) return false;
            if (p.data_inicial && todayStr < p.data_inicial) return false;
            if (p.data_final && todayStr > p.data_final) return false;
            return true;
          });
          if (prerolls.length > 0 && !prerollDone) {
            const selected = prerolls[Math.floor(Math.random() * prerolls.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl(selected.link_url || null);
            setPrerollMediaType(selected.media_type || "video");
            setPrerollYoutubeUrl(selected.youtube_url || null);
          } else {
            setPrerollDone(true);
          }
          setLoading(false);
        });
      return () => { cancelled = true; };
    }

    // AUTHENTICATED MODE (original logic)
    if (authLoading) { setLoadingStatus("Autenticando..."); return; }
    if (!user) { setCanais([]); setLoading(false); return; }

    const fetchAll = async () => {
      setLoading(true);
      setLoadingStatus("Carregando canais...");

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = DAY_MAP_FULL[now.getDay()];

      try {
        // STAGE 1 — Critical: only channels + preroll (show UI ASAP)
        const [channelsRes, prerollRes] = await Promise.all([
          supabase.from("streaming_channels").select("*").eq("user_id", user.id).eq("active", true).order("numero_canal"),
          !prerollDone
            ? supabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true })
            : Promise.resolve({ data: null, error: null } as const),
        ]);
        if (cancelled) return;

        if (!channelsRes.error && channelsRes.data) {
          setCanais(channelsRes.data as Canal[]);
        } else {
          setCanais([]);
        }

        if (!prerollDone && prerollRes.data && prerollRes.data.length > 0) {
          const todayStr = now.toISOString().slice(0, 10);
          const matching = prerollRes.data.filter((p: any) => {
            if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(today)) return false;
            if (p.data_inicial && todayStr < p.data_inicial) return false;
            if (p.data_final && todayStr > p.data_final) return false;
            return true;
          });
          if (matching.length > 0) {
            const selected = matching[Math.floor(Math.random() * matching.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl((selected as any).link_url || null);
            setPrerollMediaType((selected as any).media_type || "video");
            setPrerollYoutubeUrl((selected as any).youtube_url || null);
          } else {
            setPrerollDone(true);
          }
        } else if (!prerollDone) {
          setPrerollDone(true);
        }

        // UI is now visible — release loading gate
        setLoading(false);

        // STAGE 2 — Secondary: programas + apresentadores
        const [programasRes, apresentadoresRes] = await Promise.all([
          supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, descricao, apresentador_id").eq("user_id", user.id).eq("ativo", true).order("horario_inicio"),
          supabase.from("apresentadores").select("id, nome, foto, instagram").eq("user_id", user.id).eq("ativo", true),
        ]);
        if (cancelled) return;

        const fetchedProgramas = (!programasRes.error && programasRes.data) ? programasRes.data as Programa[] : [];
        setProgramas(fetchedProgramas);
        if (!apresentadoresRes.error && apresentadoresRes.data) setApresentadores(apresentadoresRes.data as Apresentador[]);

        // STAGE 3 — Deferred: shop products
        const currentProg = getCurrentProgram(fetchedProgramas);
        let shopQuery = supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", user.id).eq("active", true).gt("stock", 0);
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
  }, [user, authLoading, isPublicMode, userSlug]);

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

  // Fetch YouTube playlist videos
  useEffect(() => {
    if (!isYoutube || !canal?.url) { setYoutubeVideos([]); setSelectedVideoId(null); return; }
    const match = canal.url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (!match) return;
    supabase.functions.invoke("youtube-playlist", { body: { playlistId: match[1] } }).then(({ data }) => {
      if (data?.videos) setYoutubeVideos(data.videos);
    });
  }, [canal?.url, isYoutube]);

  // Sync music data directly from XML
  const coverCacheRef = useRef<Record<string, string>>({});
  const noCoverCacheRef = useRef<Record<string, true>>({});
  useEffect(() => {
    if (!user) return;

    const parseXml = (xmlStr: string) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "application/xml");
        if (doc.querySelector("parsererror")) return null;
        const titulo = doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título";
        const artista = doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido";
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

    const fetchAndSync = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        if (!cachedXmlUrl) {
          const { data: settings } = await supabase.from("user_settings").select("music_xml_url").eq("user_id", user.id).maybeSingle();
          cachedXmlUrl = settings?.music_xml_url || null;
        }
        if (!cachedXmlUrl || cancelled) return;

        // Use edge function instead of unreliable allorigins proxy
        let text = "";
        try {
          const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
            body: { url: cachedXmlUrl },
          });
          if (rssError || !rssData?.content) return;
          text = rssData.content;
        } catch { return; }

        const data = parseXml(text);
        if (!data || cancelled) return;

        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            data.capa = coverCacheRef.current[cacheKey];
          } else if (!noCoverCacheRef.current[cacheKey]) {
            try {
              const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
              const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
              const itunesData = await itunesRes.json();
              if (itunesData.results?.length > 0) {
                const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                if (cover) { data.capa = cover; coverCacheRef.current[cacheKey] = cover; }
                else noCoverCacheRef.current[cacheKey] = true;
              } else noCoverCacheRef.current[cacheKey] = true;
            } catch { noCoverCacheRef.current[cacheKey] = true; }
          }
        }

        setMusicData(prev => {
          if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
            localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
            return { ...data };
          }
          if (prev && data.capa && prev.capa !== data.capa) {
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
            return { ...prev, capa: data.capa };
          }
          return prev;
        });
      } catch {}
      finally { inFlight = false; }
    };

    fetchAndSync(); // immediate first fetch
    const interval = setInterval(fetchAndSync, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // Play stream
  const playStream = useCallback(
    async (url: string, type: string) => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      setBuffering(true);

      const freshUrl = url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      const useHls = url.includes(".m3u8");
      let Hls: typeof HlsType | null = null;
      if (useHls) Hls = await getHls();

      if (type === "audio_live" || type === "audio") {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volume / 100;
        audio.muted = muted;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { audio.play().then(() => setBuffering(false)).catch((e) => console.warn("Audio play blocked:", e)); });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("HLS fatal error on audio, recovering...", data.type);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else { hls.destroy(); hlsRef.current = null; setStreamStalled(true); }
            }
          });
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = freshUrl;
          audio.play().catch((e) => console.warn("Audio play blocked:", e));
        } else {
          audio.src = freshUrl;
          audio.play().catch((e) => console.warn("Audio play blocked:", e));
        }
      } else {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
        const video = videoRef.current;
        if (!video) return;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            capLevelToPlayerSize: false,
            startLevel: -1,
            autoStartLoad: true,
            // Moderate buffer — too large causes bufferAppendError
            maxBufferLength: 20,
            maxMaxBufferLength: 40,
            maxBufferSize: 30 * 1000 * 1000,
            maxBufferHole: 0.5,
            // ABR tuning
            abrEwmaDefaultEstimate: 3000000,
            abrBandWidthUpFactor: 0.7,
            abrBandWidthFactor: 0.95,
            // Fragment loading retry
            fragLoadingMaxRetry: 4,
            fragLoadingMaxRetryTimeout: 8000,
            fragLoadingRetryDelay: 1000,
            manifestLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            // Back buffer cleanup
            backBufferLength: 15,
            // Append error retry
            appendErrorMaxRetry: 5,
          });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            if (data.levels && data.levels.length > 0) {
              const levels = data.levels.map((l: any, i: number) => ({
                height: l.height || 0,
                bitrate: l.bitrate || 0,
                index: i,
              }));
              setHlsLevels(levels);
              setHlsCurrentLevel(-1);
              if (data.levels.length > 1) {
                hls.currentLevel = data.levels.length - 1;
                setHlsCurrentLevel(data.levels.length - 1);
              }
            }
            video.play().then(() => setBuffering(false)).catch(() => {});
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
          let mediaErrorRecoveries = 0;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("HLS fatal error:", data.type, data.details);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                mediaErrorRecoveries++;
                if (mediaErrorRecoveries <= 2) {
                  hls.recoverMediaError();
                } else {
                  // Too many media errors — full restart
                  console.warn("Too many media errors, restarting HLS");
                  hls.destroy();
                  hlsRef.current = null;
                  setTimeout(() => {
                    if (canal) playStream(canal.url, canal.type);
                  }, 2000);
                }
              } else {
                hls.destroy();
                hlsRef.current = null;
                setStreamStalled(true);
              }
            }
          });
        } else {
          video.src = freshUrl;
          video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
        }
      }
      setPlaying(true);
    },
    []
  );

  // Detect stream stall and auto-reconnect — conservative approach for live streams
  useEffect(() => {
    if (!playing || !canal || canal.type === "youtube") {
      setStreamStalled(false);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      return;
    }
    const mediaEl = (canal.type === "audio_live" || canal.type === "audio") ? audioRef.current : videoRef.current;
    if (!mediaEl) return;

    let reconnectAttempts = 0;
    const maxReconnects = 5;
    let lastTimeUpdate = Date.now();

    const tryReconnect = () => {
      if (reconnectAttempts >= maxReconnects) return;
      reconnectAttempts++;
      setStreamStalled(true);
      setTimeout(() => {
        if (canal) playStream(canal.url, canal.type);
      }, 3000 * reconnectAttempts);
    };

    const onTimeUpdate = () => {
      lastTimeUpdate = Date.now();
      if (streamStalled) {
        setStreamStalled(false);
        reconnectAttempts = 0;
      }
    };

    const onPlaying = () => {
      lastTimeUpdate = Date.now();
      setStreamStalled(false);
      reconnectAttempts = 0;
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };

    const onError = () => {
      // Only reconnect if no timeupdate for 10s (real failure, not transient)
      if (Date.now() - lastTimeUpdate > 10000) {
        tryReconnect();
      }
    };

    // Health check: only reconnect if no timeupdate for 15+ seconds (real dead stream)
    const healthCheck = setInterval(() => {
      if (!playing || canal?.type === "youtube") return;
      const elapsed = Date.now() - lastTimeUpdate;
      if (elapsed > 15000) {
        console.warn("Stream health check: no data for", Math.round(elapsed / 1000), "s — reconnecting");
        tryReconnect();
      }
    }, 10000);

    mediaEl.addEventListener("timeupdate", onTimeUpdate);
    mediaEl.addEventListener("playing", onPlaying);
    mediaEl.addEventListener("error", onError);

    return () => {
      mediaEl.removeEventListener("timeupdate", onTimeUpdate);
      mediaEl.removeEventListener("playing", onPlaying);
      mediaEl.removeEventListener("error", onError);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      clearInterval(healthCheck);
    };
  }, [playing, canal, playStream, streamStalled]);

  useEffect(() => {
    if (!prerollDone) return;
    if (autoPlayedRef.current || canais.length === 0 || playing) return;
    autoPlayedRef.current = true;
    const first = canais[0];
    if (!first) return;
    setCurrentIndex(0);
    if (first.type === "youtube") { setPlaying(true); setBuffering(false); setSelectedVideoId(null); setSidebarOpen(false); }
    else setTimeout(() => playStream(first.url, first.type), 200);
  }, [canais, playing, playStream, prerollDone]);

  // Recurring pre-roll every 15 minutes
  const fetchAndShowPreroll = useCallback(async () => {
    if (!user || prerollShowing) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][now.getDay()];

    const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true });

    if (data && data.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const matching = data.filter((p: any) => {
        if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(today)) return false;
        if (p.data_inicial && todayStr < p.data_inicial) return false;
        if (p.data_final && todayStr > p.data_final) return false;
        return true;
      });
      if (matching.length > 0) {
        const selected = matching[Math.floor(Math.random() * matching.length)];
        setPrerollUrl(selected.video_url);
        setPrerollLinkUrl((selected as any).link_url || null);
        setPrerollMediaType((selected as any).media_type || "video");
        setPrerollYoutubeUrl((selected as any).youtube_url || null);
        setPrerollShowing(true);
      }
    }
  }, [user, prerollShowing]);

  useEffect(() => {
    if (!prerollDone || !playing) return;
    prerollIntervalRef.current = setInterval(fetchAndShowPreroll, 15 * 60 * 1000);
    return () => { if (prerollIntervalRef.current) clearInterval(prerollIntervalRef.current); };
  }, [prerollDone, playing, fetchAndShowPreroll]);

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

  const handlePlayCanal = () => {
    if (!canal) return;
    if (playing) {
      // Pause
      if (audioRef.current) audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
      setPlaying(false);
      return;
    }
    if (canal.type === "youtube") { setPlaying(true); setBuffering(false); return; }
    playStream(canal.url, canal.type);
  };

  const navigateChannel = useCallback((dir: 1 | -1) => {
    if (canais.length === 0) return;
    const next = (currentIndex + dir + canais.length) % canais.length;
    setCurrentIndex(next);
    const c = canais[next];
    if (!c) return;
    // Stop any playing audio/video when switching channels — full cleanup
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setHlsLevels([]);
    setHlsCurrentLevel(-1);
    if (c.type === "youtube") {
      setPlaying(true);
      setBuffering(false);
      setSelectedVideoId(null);
      setSidebarOpen(false);
    } else if (playing) {
      setTimeout(() => playStream(c.url, c.type), 100);
    }
  }, [canais, currentIndex, playing, playStream]);

  // Fullscreen
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Auto-fullscreen for TV browsers (Smart TV, Tizen, webOS, etc.)
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTV = /smart-?tv|tizen|webos|netcast|hbbtv|viera|nettv|philipstv|roku|firetv|appletv|android.*tv|crkey/i.test(ua)
      || window.matchMedia("(display-mode: fullscreen)").matches
      || (screen.width >= 1280 && screen.height >= 720 && !("ontouchstart" in window) && window.innerWidth === screen.width);
    if (isTV && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    }
  }, [loading]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) { containerRef.current.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  };

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const newMuted = !prev;
      if (videoRef.current) videoRef.current.muted = newMuted;
      if (audioRef.current) audioRef.current.muted = newMuted;
      return newMuted;
    });
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    const v = val / 100;
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = false; }
    if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
    setMuted(val === 0);
  }, []);

  // Keyboard & TV Remote Control handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ChannelUp") { e.preventDefault(); navigateChannel(-1); }
      else if (e.key === "ArrowDown" || e.key === "ChannelDown") { e.preventDefault(); navigateChannel(1); }
      else if (e.key === "VolumeUp" || e.key === "ArrowRight") {
        e.preventDefault();
        handleVolumeChange(Math.min(100, volume + 10));
      }
      else if (e.key === "VolumeDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        handleVolumeChange(Math.max(0, volume - 10));
      }
      else if (e.key === "Enter" || e.key === "Select") {
        e.preventDefault();
        handlePlayCanal();
      }
      else if (e.key === "AudioVolumeMute") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateChannel, volume, handleVolumeChange, toggleMute, handlePlayCanal]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
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
    const timer = setTimeout(() => {
      ytPostMessage("setVolume", [volume]);
      if (muted) ytPostMessage("mute");
      else ytPostMessage("unMute");
    }, 1500);
    return () => clearTimeout(timer);
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

  // Cleanup on unmount
  useEffect(() => { return () => { if (hlsRef.current) hlsRef.current.destroy(); }; }, []);

  // Periodic clock tick to re-compute currentProg every 10s
  useEffect(() => {
    const interval = setInterval(() => setClock(c => c + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const currentProg = getCurrentProgram(programas);
  const prevProgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentProg?.id !== prevProgIdRef.current) {
      prevProgIdRef.current = currentProg?.id || null;
      setShopProductIndex(0);
    }
  }, [currentProg?.id]);

  const nextProg = getNextProgram(programas, currentProg);
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
        // Pause YouTube and show mid-roll
        ytPostMessage("pauseVideo");
        setMidrollResumeTime(ytCurrentTime);
        setMidrollActive(true);
        // Fetch a preroll to show
        (async () => {
          if (!user) return;
          const now = new Date();
          const ct = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const today = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][now.getDay()];
          const todayStr = now.toISOString().slice(0, 10);
          const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", ct).gte("horario_fim", ct).order("priority", { ascending: true });
          if (data && data.length > 0) {
            const matching = data.filter((p: any) => {
              if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(today)) return false;
              if (p.data_inicial && todayStr < p.data_inicial) return false;
              if (p.data_final && todayStr > p.data_final) return false;
              return true;
            });
            if (matching.length > 0) {
              const selected = matching[Math.floor(Math.random() * matching.length)];
              setMidrollPreroll({
                url: selected.video_url,
                linkUrl: (selected as any).link_url || null,
                mediaType: (selected as any).media_type || "video",
                youtubeUrl: (selected as any).youtube_url || null,
              });
              return;
            }
          }
          // No preroll found, resume immediately
          setMidrollActive(false);
          ytPostMessage("playVideo");
        })();
        break;
      }
    }
  }, [ytCurrentTime, isYoutube, selectedVideoId, midrollActive, midrollBreakPoints, user, ytPostMessage]);

  // Handle mid-roll end/skip
  const handleMidrollEnd = useCallback(() => {
    setMidrollActive(false);
    setMidrollPreroll(null);
    ytPostMessage("seekTo", [midrollResumeTime, true]);
    setTimeout(() => ytPostMessage("playVideo"), 300);
  }, [ytPostMessage, midrollResumeTime]);

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

  const showShopIcon = currentShopProducts.length > 0;

  // Shopping popup is manual-only via icon click

  if (loading) {
    return <PlayerSkeleton status={loadingStatus} />;
  }

  return (
    <div ref={containerRef} className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default">
      {/* Pre-Roll Overlay */}
      {((prerollUrl || (prerollMediaType === "youtube" && prerollYoutubeUrl)) && (!prerollDone || prerollShowing)) && (
        <PreRollOverlay
          prerollUrl={prerollUrl || ""}
          prerollVideoRef={prerollVideoRef}
          prerollLinkUrl={prerollLinkUrl}
          prerollMediaType={prerollMediaType}
          prerollYoutubeUrl={prerollYoutubeUrl}
          onSkip={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollLinkUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); }}
          onEnded={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); }}
        />
      )}

      {/* Mid-Roll Overlay */}
      {midrollActive && midrollPreroll && (
        <PreRollOverlay
          prerollUrl={midrollPreroll.url}
          prerollVideoRef={prerollVideoRef}
          prerollLinkUrl={midrollPreroll.linkUrl}
          prerollMediaType={midrollPreroll.mediaType}
          prerollYoutubeUrl={midrollPreroll.youtubeUrl}
          onSkip={handleMidrollEnd}
          onEnded={handleMidrollEnd}
        />
      )}

      {/* Shopping Panel — above control bar, right-aligned */}
      {shopOpen && (
        <div className="absolute left-0 right-0 z-40 mx-auto" style={{ bottom: "155px", maxWidth: "1400px", paddingLeft: "20px", paddingRight: "20px" }}>
          <div className="ml-auto" style={{ maxWidth: "340px" }}>
            <div className="bg-black/90 backdrop-blur-md border border-white/15 rounded-2xl p-5 shadow-2xl">
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

      {/* Background image for audio channels */}
      {isAudio && canal?.cover_url && (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700" style={{ backgroundImage: `url(${canal.cover_url})` }} />
      )}

      {/* YouTube: Fullscreen background video iframe — proper aspect ratio */}
      {isYoutube && selectedVideoId && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <iframe
            ref={ytIframeRef}
            className="absolute pointer-events-none"
            style={{ width: "100%", height: "100%", top: "0", left: "0", border: "none" }}
            src={`https://www.youtube.com/embed/${selectedVideoId}?autoplay=1&mute=0&controls=0&loop=1&playlist=${selectedVideoId}&showinfo=0&rel=0&modestbranding=1&enablejsapi=1&vq=hd1080&origin=${window.location.origin}`}
            allow="autoplay; encrypted-media"
          />
          {/* Transparent overlay to block YouTube controls on pause */}
          <div className="absolute inset-0 z-[1]" />
        </div>
      )}

      {/* YouTube: Thumbnail placeholder when no video selected */}
      {isYoutube && !selectedVideoId && (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${canal?.cover_url || canal?.background_url || (youtubeVideos.length > 0 ? youtubeVideos[0].thumbnail.replace('default.jpg','maxresdefault.jpg') : '')})`, backgroundColor: '#111' }}
        />
      )}

      {/* YouTube: Subtle bottom gradient only for control bar readability */}
      {isYoutube && (
        <div className="absolute inset-x-0 bottom-0 z-[1]" style={{ height: "200px", background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }} />
      )}

      {/* YouTube: Horizontal playlist — shown on home by default OR when sidebarOpen */}
      {isYoutube && (isYtHome || sidebarOpen) && (
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
                    className={`flex flex-col shrink-0 rounded-lg overflow-hidden transition-all ${selectedVideoId === v.videoId ? "ring-2 ring-[#e60000]" : "hover:ring-1 hover:ring-white/30"}`}
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
      <audio ref={audioRef} muted={muted} />

      {/* Buffering overlay */}
      {streamStalled && playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/60 gap-4">
          <Loader2 className="animate-spin" size={56} style={{ color: "#d30707" }} />
          <span className="text-white text-sm font-bold tracking-wide uppercase animate-pulse">Sintonizando canal...</span>
        </div>
      )}

      {/* Audio channel: dual card layout */}
      {isAudio && playing && (
        <Suspense fallback={null}>
          <AudioDualCard
            presenterName={currentPresenter?.nome}
            presenterInstagram={currentPresenter?.instagram}
            presenterPhoto={currentPresenter?.foto}
            musicTitle={musicData?.titulo}
            musicArtist={musicData?.artista}
            musicCover={musicData?.capa}
            channelLogo={canal?.logo_url}
            channelThumb={canal?.cover_url}
            liked={liked}
            onToggleLike={toggleLike}
            audioElement={audioRef.current}
          />
        </Suspense>
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
          />
        </Suspense>
      )}

      {/* Idle state */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10 px-4">
          {canal?.logo_url && <img src={canal.logo_url} alt={canal.name} className="w-20 h-20 sm:w-32 sm:h-32 object-contain mb-4 sm:mb-6 rounded-xl" />}
          <h1 className="text-white text-xl sm:text-3xl font-bold mb-2 text-center">{canal?.name || "Nenhum canal"}</h1>
          {canal && <p className="text-white/50 text-xs sm:text-sm mb-6 sm:mb-8">Canal {canal.numero_canal}</p>}
          {canal && (
            <button onClick={handlePlayCanal} className="flex items-center gap-2 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-bold text-base sm:text-lg transition-all" style={{ backgroundColor: "#e60000" }}>
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

      {/* Control bar hover zone */}
      <div className="absolute left-0 right-0 bottom-0 z-30" style={{ height: "140px" }} onMouseEnter={showBar} onMouseLeave={hideBar}
        onClick={() => setBarVisible(v => !v)}
      >
        <div className="absolute left-0 right-0 bottom-2 sm:bottom-5 mx-auto transition-all duration-400 ease-in-out"
          style={{ maxWidth: "1400px", width: "100%", paddingLeft: "8px", paddingRight: "8px", opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(20px)", pointerEvents: barVisible ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 rounded-2xl border border-white/10 px-3 sm:px-5 py-2 sm:py-3" style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}>

          {/* Row 1 on mobile: Channel + Play + Volume */}
          <div className="flex items-center gap-2 sm:gap-3 sm:pr-5 sm:border-r border-white/10 shrink-0">
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <button onClick={() => navigateChannel(-1)} className="text-white/60 hover:text-white hover:bg-[#e60000] rounded px-1.5 py-1 sm:px-2 sm:py-2 transition-all" title="Canal anterior"><ChevronUp size={14} /></button>
              <div className="text-white text-[10px] sm:text-xs font-bold py-0.5">
                {(() => {
                  const num = canal?.numero_canal || "--";
                  const dashIdx = num.indexOf("-");
                  if (dashIdx < 0) return num;
                  return <>{num.slice(0, dashIdx)} <sup className="text-[8px] sm:text-[9px]" style={{ color: "#e60000" }}>{num.slice(dashIdx + 1)}</sup></>;
                })()}
              </div>
              <button onClick={() => navigateChannel(1)} className="text-white/60 hover:text-white hover:bg-[#e60000] rounded px-1.5 py-1 sm:px-2 sm:py-2 transition-all" title="Próximo canal"><ChevronDown size={14} /></button>
            </div>
            {canal?.logo_url ? (
              <img src={canal.logo_url} alt="" className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-contain" />
            ) : (
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg bg-white/10 flex items-center justify-center text-white text-sm sm:text-lg font-bold">{canal?.numero_canal || "?"}</div>
            )}
            <button onClick={handlePlayCanal} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-[#e60000] flex items-center justify-center transition-all hover:bg-[#e60000]/20" title={playing ? "Pausar" : "Reproduzir"}>
              {playing ? <Pause size={14} color="#e60000" /> : <Play size={14} color="#e60000" fill="#e60000" />}
            </button>

            {/* Program info inline on mobile */}
            <div className="flex-1 min-w-0 sm:hidden">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#e60000" }}>No Ar:</span>
              <MarqueeText className="text-white text-sm font-bold leading-tight" text={channelLabel} />
              {!isYoutube && musicData?.titulo && (
                <MarqueeText className="text-white/50 text-[10px]" text={`♫ ${musicData.titulo} — ${musicData.artista}`} />
              )}
            </div>
          </div>

          {/* Program Info — desktop only as separate section */}
          <div className="hidden sm:block px-5 min-w-0" style={{ flex: "0 1 450px" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#e60000" }}>No Ar:</span>
            <MarqueeText className="text-white text-lg font-bold leading-tight" text={channelLabel} />
            {programLabel && (
              <MarqueeText className="text-white/60 text-sm leading-tight" text={programLabel} />
            )}
            {!isYoutube && musicData?.titulo && (
              <MarqueeText className="text-white/50 text-xs" text={`♫ ${musicData.titulo} — ${musicData.artista}`} />
            )}
            {isYoutube && selectedVideoId ? (
              <div className="w-full mt-2 group cursor-pointer relative" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const seekTime = pct * ytDuration;
                ytPostMessage("seekTo", [seekTime, true]);
              }}>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden group-hover:h-2 transition-all relative">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "#e60000" }} />
                </div>
                {midrollBreakPoints.map((bp, i) => (
                  <div
                    key={i}
                    className="absolute top-0 w-[3px] rounded-full bg-white"
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
            ) : (
              <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, backgroundColor: "#e60000" }} />
              </div>
            )}
            {isYoutube && selectedVideoId ? (
              <span className="text-[10px] mt-1 inline-block" style={{ color: "#e60000" }}>
                {fmtTime(ytCurrentTime)} - {fmtTime(ytDuration)}
              </span>
            ) : (
              <span className="text-[10px] mt-1 inline-block" style={{ color: "#e60000" }}>
                {currentProg ? `${currentProg.horario_inicio.slice(0, 5)} - ${currentProg.horario_fim.slice(0, 5)}` : "--:-- - --:--"}
              </span>
            )}
          </div>

          {/* Progress bar on mobile */}
          <div className="sm:hidden w-full">
            {isYoutube && selectedVideoId ? (
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${ytProgressPct}%`, backgroundColor: "#e60000" }} />
              </div>
            ) : (
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, backgroundColor: "#e60000" }} />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 px-1 sm:px-3 sm:border-l border-white/10 shrink-0 flex-wrap justify-center sm:justify-start">
            {(isAudio || isVideo) && musicData?.titulo && (
              <div className="relative flex items-center gap-1">
                <button onClick={toggleLike} className={`p-1 sm:p-1.5 rounded transition-all ${likeAnimating ? "scale-125" : "scale-100"}`}
                  title={liked ? "Descurtir música" : "Curtiu essa música?"} style={{ transition: "transform 0.3s ease" }}>
                  <Heart size={16} fill={liked ? "#ed0808" : "none"} color={liked ? "#ed0808" : "rgba(255,255,255,0.6)"} className="transition-colors" />
                </button>
                {likeCount > 0 && <span className="text-[10px] sm:text-[11px] font-bold text-white/60">{likeCount}</span>}
                {floatingHearts.map((h) => (
                  <Heart key={h.id} size={12 + Math.random() * 6} fill="#ed0808" color="#ed0808" className="absolute pointer-events-none"
                    style={{ left: `calc(50% + ${h.x}px)`, bottom: "100%", opacity: 0, animation: `floatHeart 1.2s ease-out ${h.delay}s forwards` }} />
                ))}
              </div>
            )}
            {/* Karaoke toggle — only for audio channels with music */}
            {(isAudio || isVideo) && musicData?.titulo && musicData.titulo !== "Sem título" && (
              <button onClick={() => setKaraokeEnabled(!karaokeEnabled)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1 border ${karaokeEnabled ? "bg-[#a10a0b] text-white border-[#a10a0b] shadow-[0_0_8px_rgba(161,10,11,0.5)]" : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20 hover:text-white"}`}
                title={karaokeEnabled ? "Desativar Karaoke" : "Ativar Karaoke"}>
                <MicVocal size={12} /> <span className="hidden sm:inline">Karaoke</span>
              </button>
            )}
            {/* Quality Selector — only for HLS video streams */}
            {isVideo && hlsLevels.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setQualityMenuOpen(!qualityMenuOpen)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1 border ${qualityMenuOpen ? "bg-[#ed0808] text-white border-[#ed0808]" : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20 hover:text-white"}`}
                  title="Qualidade do vídeo"
                >
                  <Settings2 size={12} />
                  {hlsCurrentLevel === -1 ? "Auto" : `${hlsLevels.find(l => l.index === hlsCurrentLevel)?.height || "?"}p`}
                </button>
                {qualityMenuOpen && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-lg overflow-hidden shadow-xl" style={{ backgroundColor: "rgba(0,0,0,0.95)", border: "1px solid rgba(255,255,255,0.15)", minWidth: "120px" }}>
                    <button
                      onClick={() => handleQualityChange(-1)}
                      className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${hlsCurrentLevel === -1 ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                      style={hlsCurrentLevel === -1 ? { backgroundColor: "#e60000" } : {}}
                    >
                      Auto
                    </button>
                    {[...hlsLevels].sort((a, b) => b.height - a.height).map((level) => (
                      <button
                        key={level.index}
                        onClick={() => handleQualityChange(level.index)}
                        className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors ${hlsCurrentLevel === level.index ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                        style={hlsCurrentLevel === level.index ? { backgroundColor: "#e60000" } : {}}
                      >
                        {level.height}p {level.bitrate ? `(${(level.bitrate / 1000000).toFixed(1)}Mbps)` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isYoutube && (
              <button onClick={handleYtHome}
                className="hover:bg-white/20 rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-all"
                style={!selectedVideoId ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                title="Início do canal">
                <Home size={12} />
              </button>
            )}
            {isYoutube && selectedVideoId && (
              <>
                <button onClick={ytPrevVideo} className="text-white/70 hover:text-white transition-colors" title="Vídeo anterior">
                  <SkipBack size={14} />
                </button>
                <button onClick={ytTogglePlay} className="text-white/70 hover:text-white transition-colors" title={ytPlaying ? "Pausar" : "Reproduzir"}>
                  {ytPlaying ? <Pause size={14} /> : <Play size={14} fill="white" />}
                </button>
                <button onClick={ytNextVideo} className="text-white/70 hover:text-white transition-colors" title="Próximo vídeo">
                  <SkipForward size={14} />
                </button>
              </>
            )}
            {isYoutube && (
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-white/20 rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-all"
                style={sidebarOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                title={sidebarOpen ? "Fechar Playlist" : "Abrir Playlist"}>
                <List size={12} />
              </button>
            )}
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors" title={fullscreen ? "Sair tela cheia" : "Tela cheia"}>
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button onClick={() => setShopOpen(!shopOpen)}
              className="hover:bg-white/20 rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-all relative"
              style={shopOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              title="Shopping ao Vivo">
              <ShoppingCart size={12} />
              {showShopIcon && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full animate-pulse" style={{ backgroundColor: "#e60000" }} />}
            </button>
            <button onClick={() => setChatOpen(!chatOpen)}
              className="hover:bg-white/20 rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-all"
              style={chatOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              title="Chat ao Vivo">
              <MessageSquare size={12} />
            </button>
            <div className="relative" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
              <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors" title={muted ? "Ativar som" : "Desativar som"}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              {volumeHover && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/95 rounded-lg px-3 py-4 flex flex-col items-center" style={{ height: "140px", width: "40px" }}>
                  <input type="range" min={0} max={100} value={volume} onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="h-full appearance-none cursor-pointer"
                    style={{ writingMode: "vertical-lr", direction: "rtl", width: "6px", accentColor: "#e60000" }}
                    onClick={(e) => e.stopPropagation()} />
                  <span className="text-white/60 text-[9px] mt-1">{volume}</span>
                </div>
              )}
            </div>
          </div>

          {/* Next / Schedule — hidden on mobile */}
          <div className="hidden md:flex pl-3 border-l border-white/10 flex-1 min-w-0 items-stretch gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase" style={{ color: "#e60000" }}>A seguir:</span>
              <div className="text-white text-sm truncate">
                {isYoutube ? (nextYtVideo?.title || "Sem vídeo") : (nextProg?.nome || "Sem programação")}
              </div>
              {!isYoutube && (
                <span className="text-[10px]" style={{ color: "#e60000" }}>
                  {nextProg ? `${nextProg.horario_inicio} - ${nextProg.horario_fim}` : "--:-- - --:--"}
                </span>
              )}
              <div className="mt-1">
                <button onClick={() => setGradeOpen(true)}
                  className="flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all"
                  style={{ backgroundColor: "#e60000", border: "1px solid transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#ed0808"; e.currentTarget.style.backgroundColor = "#000"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.backgroundColor = "#e60000"; }}
                >
                  + Grade
                </button>
              </div>
            </div>
            {!isYoutube && nextPresenter?.foto && (
              <div className="relative shrink-0 self-end group" style={{ width: "120px" }}>
                <img src={nextPresenter.foto} alt={nextPresenter.nome} title={nextPresenter.nome} className="absolute right-0 object-contain object-bottom" style={{ bottom: "-24px", height: "280px", width: "auto", maxWidth: "160px" }} />
                <span className="absolute left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ top: "-20px" }}>
                  {nextPresenter.nome}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {chatOpen && (
        <Suspense fallback={<div className="fixed z-[55] w-[290px] rounded-2xl border border-white/10 flex items-center justify-center" style={{ backgroundColor: "rgba(10,10,10,0.95)", bottom: shopOpen ? "460px" : "165px", right: "20px", height: "400px" }}><Loader2 className="animate-spin text-white" size={24} /></div>}>
          <PlayerChat channelId={canal?.id || "default"} onClose={() => setChatOpen(false)} shopOpen={shopOpen} />
        </Suspense>
      )}

      {/* Floating heart animation keyframes */}
      <style>{`
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
      `}</style>
    </div>
  );
}

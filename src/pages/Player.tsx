import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import type HlsType from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ChevronUp,
  ChevronDown,
  Play,
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
  Heart,
  ShoppingCart,
} from "lucide-react";

const PlayerChat = lazy(() => import("@/components/PlayerChat"));
const AudioSpectrum = lazy(() => import("@/components/AudioSpectrum"));
const PlayerGradeDialog = lazy(() => import("@/components/player/PlayerGradeDialog"));
import PlayerShopProduct from "@/components/player/PlayerShopProduct";
import PreRollOverlay from "@/components/PreRollOverlay";

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

export default function PlayerPage() {
  const { user, loading: authLoading } = useAuth();
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Closed Captions state
  const [ccEnabled, setCcEnabled] = useState(false);
  const [ccText, setCcText] = useState("");
  const ccLyricsRef = useRef<{ time: number; text: string }[]>([]);
  const ccTimerRef = useRef<ReturnType<typeof setInterval>>();
  const ccCurrentSongRef = useRef<string>("");
  const ccMusicStartRef = useRef<number>(0);

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
  const [prerollDone, setPrerollDone] = useState(false);
  const [prerollShowing, setPrerollShowing] = useState(false);
  const prerollVideoRef = useRef<HTMLVideoElement>(null);
  const prerollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unified buffering detection
  const { buffering, setBuffering } = useBufferingDetection(videoRef, audioRef);

  // Parse LRC format
  const parseLRC = useCallback((lrc: string): { time: number; text: string }[] => {
    const lines: { time: number; text: string }[] = [];
    for (const line of lrc.split("\n")) {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const ms = parseInt(match[3].padEnd(3, "0"));
        const time = mins * 60 + secs + ms / 1000;
        const text = match[4].trim();
        if (text) lines.push({ time, text });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }, []);

  // Fetch lyrics when CC is enabled and music changes
  useEffect(() => {
    if (!ccEnabled || !musicData?.artista || !musicData?.titulo) return;

    const songKey = `${musicData.artista}-${musicData.titulo}`;
    if (songKey === ccCurrentSongRef.current) return;
    ccCurrentSongRef.current = songKey;
    ccLyricsRef.current = [];
    setCcText("");

    const calcMusicStartTimestamp = (): number => {
      if (musicData.horario) {
        const parts = musicData.horario.split(":").map(Number);
        if (parts.length >= 2) {
          const now = new Date();
          const songStart = new Date(now);
          songStart.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
          if (songStart.getTime() > Date.now() + 60000) songStart.setDate(songStart.getDate() - 1);
          return songStart.getTime();
        }
      }
      return Date.now();
    };
    const isAudioStream = canal?.type === "audio_live" || canal?.type === "audio";
    const ccDelay = isAudioStream ? 18000 : -18000;
    ccMusicStartRef.current = calcMusicStartTimestamp() + ccDelay;

    const fetchLyrics = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-lyrics", {
          body: { artist: musicData.artista, title: musicData.titulo, duration: musicData.duracao || undefined },
        });
        if (error || !data?.success) {
          setCcText("");
          ccLyricsRef.current = [];
          return;
        }
        if (data.syncedLyrics) {
          ccLyricsRef.current = parseLRC(data.syncedLyrics);
        } else if (data.plainLyrics) {
          const plainLines = data.plainLyrics.split("\n").filter((l: string) => l.trim());
          const totalDuration = musicData.duracao || 180;
          const interval = totalDuration / plainLines.length;
          ccLyricsRef.current = plainLines.map((text: string, i: number) => ({ time: i * interval, text }));
        }
      } catch {}
    };
    fetchLyrics();
  }, [ccEnabled, musicData?.artista, musicData?.titulo, parseLRC, canal?.type]);

  // Timer to update current lyric line
  useEffect(() => {
    if (!ccEnabled) {
      if (ccTimerRef.current) clearInterval(ccTimerRef.current);
      return;
    }
    ccTimerRef.current = setInterval(() => {
      const lyrics = ccLyricsRef.current;
      if (!lyrics.length) return;
      const elapsed = (Date.now() - ccMusicStartRef.current) / 1000;
      let currentLine = "";
      for (let i = lyrics.length - 1; i >= 0; i--) {
        if (elapsed >= lyrics[i].time) { currentLine = lyrics[i].text; break; }
      }
      setCcText(currentLine);
    }, 200);
    return () => { if (ccTimerRef.current) clearInterval(ccTimerRef.current); };
  }, [ccEnabled]);

  const toggleCC = useCallback(() => {
    if (ccEnabled) {
      setCcEnabled(false);
      setCcText("");
      ccLyricsRef.current = [];
      ccCurrentSongRef.current = "";
      if (ccTimerRef.current) clearInterval(ccTimerRef.current);
    } else {
      setCcEnabled(true);
      ccCurrentSongRef.current = "";
    }
  }, [ccEnabled]);

  useEffect(() => { return () => { if (ccTimerRef.current) clearInterval(ccTimerRef.current); }; }, []);

  // Music like state
  const [liked, setLiked] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number; delay: number }[]>([]);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    if (!user || !musicData?.titulo || !musicData?.artista) {
      setLiked(false);
      setLikeCount(0);
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
          const matching = prerollRes.data.filter((p: any) => {
            if (!p.dias_semana || p.dias_semana.length === 0) return true;
            return p.dias_semana.includes(today);
          });
          if (matching.length > 0) {
            const selected = matching[Math.floor(Math.random() * matching.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl((selected as any).link_url || null);
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
  }, [user, authLoading]);

  // Refresh shopping products periodically
  useEffect(() => {
    if (!user || programas.length === 0) return;
    const fetchShop = async () => {
      const currentProg = getCurrentProgram(programas);
      let query = supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", user.id).eq("active", true).gt("stock", 0);
      if (currentProg) query = query.or(`program_id.eq.${currentProg.id},program_id.is.null`);
      else query = query.is("program_id", null);
      const { data } = await query;
      if (data) setShopProducts(data);
    };
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

        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cachedXmlUrl)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        let text = "";
        try {
          const res = await fetch(proxyUrl, { cache: "no-store", signal: controller.signal });
          if (!res.ok) return;
          text = await res.text();
        } finally {
          clearTimeout(timeout);
        }

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
          if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista || prev.capa !== data.capa) {
            localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
            return { ...data };
          }
          return prev;
        });
      } catch {}
      finally { inFlight = false; }
    };

    const initialDelay = setTimeout(fetchAndSync, 2000);
    const interval = setInterval(fetchAndSync, 10000);
    return () => { cancelled = true; clearTimeout(initialDelay); clearInterval(interval); };
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
              else { hls.destroy(); hlsRef.current = null; }
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
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(freshUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().then(() => setBuffering(false)).catch(() => {}); });
          hls.on(Hls.Events.FRAG_BUFFERED, () => setBuffering(false));
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else { hls.destroy(); hlsRef.current = null; }
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

  // Auto-play first channel after preroll
  useEffect(() => {
    if (!prerollDone) return;
    if (autoPlayedRef.current || canais.length === 0 || playing) return;
    autoPlayedRef.current = true;
    const first = canais[0];
    if (!first) return;
    setCurrentIndex(0);
    if (first.type === "youtube") { setPlaying(true); setBuffering(false); }
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
      const matching = data.filter((p: any) => !p.dias_semana || p.dias_semana.length === 0 || p.dias_semana.includes(today));
      if (matching.length > 0) {
        const selected = matching[Math.floor(Math.random() * matching.length)];
        setPrerollUrl(selected.video_url);
        setPrerollLinkUrl((selected as any).link_url || null);
        setPrerollShowing(true);
      }
    }
  }, [user, prerollShowing]);

  useEffect(() => {
    if (!prerollDone || !playing) return;
    prerollIntervalRef.current = setInterval(fetchAndShowPreroll, 15 * 60 * 1000);
    return () => { if (prerollIntervalRef.current) clearInterval(prerollIntervalRef.current); };
  }, [prerollDone, playing, fetchAndShowPreroll]);

  const handlePlayCanal = () => {
    if (!canal) return;
    if (canal.type === "youtube") { setPlaying(true); setBuffering(false); return; }
    playStream(canal.url, canal.type);
  };

  const navigateChannel = useCallback((dir: 1 | -1) => {
    if (canais.length === 0) return;
    const next = (currentIndex + dir + canais.length) % canais.length;
    setCurrentIndex(next);
    if (playing) setTimeout(() => { const c = canais[next]; if (c) playStream(c.url, c.type); }, 100);
  }, [canais, currentIndex, playing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); navigateChannel(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); navigateChannel(1); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateChannel]);

  // Fullscreen
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) { containerRef.current.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
    if (audioRef.current) audioRef.current.muted = newMuted;
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    const v = val / 100;
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = false; }
    if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
    setMuted(val === 0);
  };

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId(videoId);
    setPlaying(true);
    setBuffering(false);
    setSidebarOpen(false);
  }, []);

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

  const noArLabel = canal
    ? isAudio
      ? currentProg ? currentProg.nome : canal.name
      : currentProg ? `${canal.name} - ${currentProg.nome}` : canal.name
    : "Sem programação";

  // Shopping products for current program
  const currentShopProducts = useMemo(() => {
    if (!currentProg) return shopProducts.filter(p => !p.program_id);
    return shopProducts.filter(p => !p.program_id || p.program_id === currentProg.id);
  }, [shopProducts, currentProg]);

  const showShopIcon = currentShopProducts.length > 0;

  // Shopping popup is manual-only via icon click

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin" size={48} style={{ color: "#d30707" }} />
        <p className="text-white/60 text-sm animate-pulse">{loadingStatus}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default">
      {/* Pre-Roll Overlay */}
      {prerollUrl && (!prerollDone || prerollShowing) && (
        <PreRollOverlay
          prerollUrl={prerollUrl}
          prerollVideoRef={prerollVideoRef}
          prerollLinkUrl={prerollLinkUrl}
          onSkip={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollLinkUrl(null); }}
          onEnded={() => { setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); }}
        />
      )}

      {/* Shopping Panel — above control bar, right-aligned */}
      {shopOpen && (
        <div className="absolute left-0 right-0 z-40 mx-auto" style={{ bottom: "130px", maxWidth: "1400px", paddingLeft: "20px", paddingRight: "20px" }}>
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
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <iframe
            className="absolute"
            style={{ width: "115%", height: "115%", top: "50%", left: "50%", transform: "translate(-50%, -50%)", border: "none" }}
            src={`https://www.youtube.com/embed/${selectedVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${selectedVideoId}&showinfo=0&rel=0&modestbranding=1`}
            allow="autoplay; encrypted-media"
          />
        </div>
      )}

      {/* YouTube: Thumbnail placeholder when no video selected */}
      {isYoutube && !selectedVideoId && (canal?.cover_url || canal?.background_url) && (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${canal.cover_url || canal.background_url})` }}
        />
      )}

      {/* YouTube: Dark gradient overlay */}
      {isYoutube && (
        <div className="absolute inset-0 z-[1]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%)" }} />
      )}

      {/* YouTube: Horizontal playlist above controls */}
      {isYoutube && sidebarOpen && (
        <div className="absolute left-0 right-0 z-[25] mx-auto" style={{ bottom: "130px", maxWidth: "1400px", paddingLeft: "20px", paddingRight: "20px" }}>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(20, 20, 20, 0.95)", border: "1px solid rgba(255, 0, 0, 0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <span className="text-white text-sm font-bold flex items-center gap-2"><List size={16} /> Playlist</span>
              <div className="flex items-center gap-3">
                <span className="text-white/40 text-xs">{youtubeVideos.length} vídeos</span>
                <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white transition-colors" title="Minimizar"><X size={16} /></button>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
              {youtubeVideos.map((v, i) => (
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
                <div className="text-white/40 text-xs text-center py-6 w-full">Carregando playlist...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video element */}
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-contain bg-black ${isAudio || isYoutube ? "hidden" : ""}`} muted={muted} playsInline autoPlay={false} />
      <audio ref={audioRef} muted={muted} />

      {/* Buffering overlay */}
      {buffering && playing && !isYoutube && !isAudio && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <Loader2 className="animate-spin" size={56} style={{ color: "#d30707" }} />
        </div>
      )}

      {/* Audio channel: presenter bg + music cover + info */}
      {isAudio && playing && (
        <div className="absolute inset-0 z-10">
          <Suspense fallback={null}>
            <AudioSpectrum audioElement={audioRef.current} />
          </Suspense>
          {currentPresenter?.foto && (
            <div className="absolute inset-0 flex items-end z-[3]" style={{ left: "-250px" }}>
              <div className="relative h-[92%]">
                <img src={currentPresenter.foto} alt={currentPresenter.nome} className="h-full object-contain object-bottom animate-fade-in" style={{ animationDuration: "1s" }} />
              </div>
            </div>
          )}
          <div className="absolute inset-0 flex items-center z-20" style={{ paddingLeft: "350px" }}>
            <div className="flex flex-col items-center">
              <div className="relative w-64 h-64 mb-6">
                {musicData?.capa ? (
                  <img key={musicData.capa} src={musicData.capa} alt={musicData.titulo} className="absolute inset-0 w-full h-full rounded-2xl object-cover shadow-2xl animate-fade-in" style={{ animationDuration: "0.7s" }} />
                ) : canal?.logo_url ? (
                  <img src={canal.logo_url} alt={canal.name} className="absolute inset-0 w-48 h-48 m-auto rounded-2xl object-contain animate-fade-in" style={{ animationDuration: "0.7s" }} />
                ) : null}
              </div>
              {musicData && (
                <div key={`${musicData.titulo}-${musicData.artista}`} className="text-center animate-fade-in" style={{ animationDuration: "0.7s" }}>
                  <div className="text-white text-2xl font-bold drop-shadow-lg">{musicData.titulo}</div>
                  <div className="text-white/70 text-lg mt-1 drop-shadow-lg">{musicData.artista}</div>
                  {currentPresenter && (
                    <div className="mt-2 flex flex-col items-center gap-0.5">
                      <span className="text-white/60 text-sm font-semibold drop-shadow-lg flex items-center gap-1.5">
                        <Mic size={12} />{currentPresenter.nome}
                      </span>
                      {currentPresenter.instagram && (
                        <a href={`https://instagram.com/${currentPresenter.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-white/40 text-xs hover:text-white/70 transition-colors drop-shadow-lg">
                          @{currentPresenter.instagram.replace(/^@/, "")}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Idle state */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-10">
          {canal?.logo_url && <img src={canal.logo_url} alt={canal.name} className="w-32 h-32 object-contain mb-6 rounded-xl" />}
          <h1 className="text-white text-3xl font-bold mb-2">{canal?.name || "Nenhum canal"}</h1>
          {canal && <p className="text-white/50 text-sm mb-8">Canal {canal.numero_canal}</p>}
          {canal && (
            <button onClick={handlePlayCanal} className="flex items-center gap-2 text-white px-8 py-3 rounded-full font-bold text-lg transition-all" style={{ backgroundColor: "#e60000" }}>
              <Play size={20} fill="white" /> Assistir
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
        <div className="px-6 py-3 rounded-lg max-w-3xl text-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <span className="text-white text-lg font-medium leading-relaxed">{ccText}</span>
        </div>
      </div>

      {/* Control bar hover zone */}
      <div className="absolute left-0 right-0 bottom-0 z-30" style={{ height: "140px" }} onMouseEnter={showBar} onMouseLeave={hideBar}>
        <div className="absolute left-0 right-0 bottom-5 mx-auto transition-all duration-400 ease-in-out"
          style={{ maxWidth: "1400px", width: "100%", paddingLeft: "20px", paddingRight: "20px", opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(20px)", pointerEvents: barVisible ? "auto" : "none" }}
        >
        <div className="flex items-center gap-0 rounded-2xl border border-white/10 px-5 py-3" style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}>
          {/* Channel Info */}
          <div className="flex items-center gap-3 pr-5 border-r border-white/10 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <button onClick={() => navigateChannel(-1)} className="text-white/60 hover:text-white transition-colors" title="Use teclado tecla para cima"><ChevronUp size={16} /></button>
              {canal?.logo_url ? (
                <img src={canal.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white text-xs font-bold">{canal?.numero_canal || "?"}</div>
              )}
              <button onClick={() => navigateChannel(1)} className="text-white/60 hover:text-white transition-colors" title="Use teclado seta para baixo"><ChevronDown size={16} /></button>
            </div>
            <div className="text-center">
              <div className="text-white text-xs font-bold">{canal?.numero_canal || "--"}</div>
              <button onClick={handlePlayCanal}
                className="mt-1 flex items-center gap-1 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full transition-all hover:!bg-black"
                style={{ backgroundColor: "#e60000", border: "1px solid transparent" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#ed0808"; e.currentTarget.style.backgroundColor = "#000"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.backgroundColor = "#e60000"; }}
              >
                <Play size={10} fill="white" /> Play Canal
              </button>
            </div>
          </div>

          {/* Program Info */}
          <div className="flex-1 px-5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#e60000" }}>No Ar:</span>
            <div className="text-white text-lg font-bold truncate leading-tight mt-0.5">{noArLabel}</div>
            {currentProg && (
              <div className="text-white/50 text-xs mt-0.5 truncate">
                {currentProg.nome} • {currentProg.horario_inicio.slice(0, 5)} - {currentProg.horario_fim.slice(0, 5)}
                {musicData?.titulo && <span className="ml-2 text-white/70">♫ {musicData.titulo} — {musicData.artista}</span>}
              </div>
            )}
            {!currentProg && musicData?.titulo && (
              <div className="text-white/50 text-xs mt-0.5 truncate">♫ {musicData.titulo} — {musicData.artista}</div>
            )}
            <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, backgroundColor: "#e60000" }} />
            </div>
            <span className="text-[10px] mt-1 inline-block" style={{ color: "#e60000" }}>
              {currentProg ? `${currentProg.horario_inicio.slice(0, 5)} - ${currentProg.horario_fim.slice(0, 5)}` : "--:-- - --:--"}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 px-5 border-l border-white/10 shrink-0">
            {isAudio && musicData?.titulo && (
              <div className="relative flex items-center gap-1.5">
                <button onClick={toggleLike} className={`p-1.5 rounded transition-all ${likeAnimating ? "scale-125" : "scale-100"}`}
                  title={liked ? "Descurtir música" : "Curtiu essa música?"} style={{ transition: "transform 0.3s ease" }}>
                  <Heart size={18} fill={liked ? "#ed0808" : "none"} color={liked ? "#ed0808" : "rgba(255,255,255,0.6)"} className="transition-colors" />
                </button>
                {likeCount > 0 && <span className="text-[11px] font-bold text-white/60">{likeCount}</span>}
                {floatingHearts.map((h) => (
                  <Heart key={h.id} size={12 + Math.random() * 6} fill="#ed0808" color="#ed0808" className="absolute pointer-events-none"
                    style={{ left: `calc(50% + ${h.x}px)`, bottom: "100%", opacity: 0, animation: `floatHeart 1.2s ease-out ${h.delay}s forwards` }} />
                ))}
              </div>
            )}
            <button onClick={toggleCC}
              className={`px-3 py-1.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 border ${ccEnabled ? "bg-[#ed0808] text-white border-[#ed0808] shadow-[0_0_8px_rgba(237,8,8,0.5)]" : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20 hover:text-white"}`}
              title={ccEnabled ? "Desativar Closed Captions" : "Ativar Closed Captions"}>
              {ccEnabled ? <CaptionsOff size={14} /> : <Captions size={14} />} CC
            </button>
            {isYoutube && (
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-all"
                style={sidebarOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                title={sidebarOpen ? "Fechar Playlist" : "Abrir Playlist"}>
                <List size={14} />
              </button>
            )}
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors" title={fullscreen ? "Sair tela cheia" : "Tela cheia"}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
            <button onClick={() => setShopOpen(!shopOpen)}
              className="hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-all relative"
              style={shopOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              title="Shopping ao Vivo">
              <ShoppingCart size={14} />
              {showShopIcon && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "#e60000" }} />}
            </button>
            <button onClick={() => setChatOpen(!chatOpen)}
              className="hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-all"
              style={chatOpen ? { backgroundColor: "#d30707", color: "#fff" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              title="Chat ao Vivo">
              <MessageSquare size={14} />
            </button>
            <div className="relative" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
              <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors" title={muted ? "Ativar som" : "Desativar som"}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
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

          {/* Next / Schedule */}
          <div className="pl-5 border-l border-white/10 shrink-0">
            <span className="text-[10px] font-bold uppercase" style={{ color: "#e60000" }}>A seguir:</span>
            <div className="text-white text-sm truncate max-w-[180px]">{nextProg?.nome || "Sem programação"}</div>
            <span className="text-[10px]" style={{ color: "#e60000" }}>
              {nextProg ? `${nextProg.horario_inicio} - ${nextProg.horario_fim}` : "--:-- - --:--"}
            </span>
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
        </div>
      </div>
      </div>

      {chatOpen && (
        <Suspense fallback={<div className="fixed z-[55] w-[290px] rounded-2xl border border-white/10 flex items-center justify-center" style={{ backgroundColor: "rgba(10,10,10,0.95)", bottom: "110px", right: "80px", height: "700px" }}><Loader2 className="animate-spin text-white" size={24} /></div>}>
          <PlayerChat channelId={canal?.id || "default"} onClose={() => setChatOpen(false)} />
        </Suspense>
      )}

      {/* Floating heart animation keyframes */}
      <style>{`
        @keyframes floatHeart {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-60px) scale(0.5); }
        }
      `}</style>
    </div>
  );
}

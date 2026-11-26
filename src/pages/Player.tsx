import { useTvNowPlaying, registerTvSyncClock, readTvHlsClock } from "@/components/player/tv/tvNowPlaying";
// NEXO_V716_POSITIVA_VIDEO
// NEXO_V7_13_CONTINUOUS_AUDIO
import { createLiveMediaRecovery } from "@/lib/liveMediaRecovery";
import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import { OttFrame } from "@/components/player/tv/OttFrame";
import { stopTvAudio, getTvAudioMedia, retainTvAudio, tvRadioVolume, setTvRadioStandby } from "@/components/player/tv/tvAudio";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { toast } from "sonner";
import type HlsType from "hls.js";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { fetchStationDatabaseData } from "@/lib/stationDatabaseService";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { playerSignOut } from "@/lib/playerSignOut";
import { usePageTitle, usePublicHead } from "@/hooks/usePageTitle";
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
  ListMusic,
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
  Plus,
  Instagram,
  Phone,
} from "lucide-react";

import ElegantLoader from "@/components/player/ElegantLoader";
const PlayerChat = lazyRetry(() => import("@/components/PlayerChat"));
const AudioSpectrum = lazyRetry(() => import("@/components/AudioSpectrum"));
const AudioDualCard = lazyRetry(() => import("@/components/AudioDualCard"));
const PlayerGradeDialog = lazyRetry(() => import("@/components/player/PlayerGradeDialog"));
const KaraokeOverlay = lazyRetry(() => import("@/components/KaraokeOverlay"));
const WatchProfilePopup = lazyRetry(() => import("@/components/player/WatchProfilePopup"));
import PlayerShopProduct from "@/components/player/PlayerShopProduct";
import {useTvCommercialPlayback,TvCommercialPlayback,isSmartBreak,markTvCommercialHome} from "@/components/player/tv/TvCommercialPlayback";
import PreRollOverlay from "@/components/PreRollOverlay";
import { saveMiniPlayerData, clearMiniPlayerData, unlockAndPrepareMiniAudio, destroyMiniAudio } from "@/components/player/MiniPlayerWidget";
import PlayerSkeleton from "@/components/skeletons/PlayerSkeleton";
import PlayerLoadingOverlay from "@/components/player/PlayerLoadingOverlay";
import PlayerSyncLoader from "@/components/player/PlayerSyncLoader";

import AudioPlayerScreen from "@/pages/player/AudioPlayerScreen";

import { normalizeMusicText } from "@/lib/textEncoding";
import { normalizeTvMusicText, decodeTvMusicXml } from "@/lib/tvMusicEncoding";
import { tvWatchProfile } from "@/lib/tvWatchProfile";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { emitProfileChanged, onProfileChanged } from "@/lib/profileSync";
import { fetchPlayerListenerProfile } from "@/lib/playerListenerProfile";

function toTitleCase(str: string): string {
  return str.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Dynamic HLS loader — cached after first import
let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) {
    hlsModule = await import("hls.js");
  }
  return (hlsModule as any)?.default || hlsModule;
};

// Nexo Smart Buffer: bounded, per-player HLS segment cache; no extra database reads.
function createSmartBuffer() {
  type Entry = { bytes: ArrayBuffer; at: number };
  const cache = new Map<string, Entry>();
  let controller: AbortController | null = null;
  let generation = 0;
  const maxBytes = 6 * 1024 * 1024;
  const ttl = 12000;
  const prune = () => {
    for (const [key, value] of cache) if (Date.now() - value.at > ttl) cache.delete(key);
    let size = [...cache.values()].reduce((sum, value) => sum + value.bytes.byteLength, 0);
    for (const [key, value] of cache) { if (size <= maxBytes) break; size -= value.bytes.byteLength; cache.delete(key); }
  };
  const cancel = (clear = false) => { generation++; controller?.abort(); controller = null; if (clear) cache.clear(); };
  const warm = async (targets: {url:string; seconds:number}[]) => {
    cancel(); prune();
    const token = generation;
    const abort = new AbortController(); controller = abort;
    const timeout = setTimeout(() => abort.abort(), 6500);
    const read = async (url:string) => {
      const res = await fetch(url, {signal:abort.signal, credentials:"omit", cache:"no-cache"});
      if (!res.ok) throw new Error("playlist unavailable");
      return {text:await res.text(), url:res.url || url};
    };
    try {
      for (const target of targets) {
        if (abort.signal.aborted || token !== generation) break;
        try {
          let playlist = await read(target.url);
          const lines = playlist.text.split(/\r?\n/);
          const variants = lines.flatMap((line,i) => line.startsWith("#EXT-X-STREAM-INF:") && lines[i+1] && !lines[i+1].startsWith("#") ? [{url:new URL(lines[i+1].trim(),playlist.url).href,rate:Number(/(?:^|,)BANDWIDTH=(\d+)/.exec(line.slice(18))?.[1] || 0)}] : []);
          if (variants.length) playlist = await read(variants.sort((a,b)=>Math.abs(a.rate-900000)-Math.abs(b.rate-900000))[0].url);
          // Skip special layouts and byte-range requests; ordinary HLS can reuse exact full segments.
          if (!playlist.text.startsWith("#EXTM3U") || /#EXT-X-(BYTERANGE|MAP|PART|KEY):/.test(playlist.text)) continue;
          const mediaLines = playlist.text.split(/\r?\n/);
          const segments = mediaLines.flatMap((line,i) => {
            if (!line.startsWith("#EXTINF:")) return [];
            const next = mediaLines[i+1]?.trim(); const duration = Number.parseFloat(line.slice(8));
            return next && !next.startsWith("#") && duration > 0 ? [{url:new URL(next,playlist.url).href,duration}] : [];
          });
          // Near the usual 3-segment live sync position, not the newest incomplete edge.
          let seconds = 0;
          for (const segment of segments.slice(Math.max(0,segments.length-3))) {
            if (seconds >= target.seconds || abort.signal.aborted || token !== generation) break;
            if (!cache.has(segment.url)) {
              const response = await fetch(segment.url,{signal:abort.signal,credentials:"omit"});
              if (!response.ok || !response.body) break;
              const reader = response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
              while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>maxBytes){await reader.cancel();break;} chunks.push(value); }
              if(size>maxBytes || !size || token!==generation || abort.signal.aborted) break;
              const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
              cache.set(segment.url,{bytes:bytes.buffer,at:Date.now()}); prune();
            }
            seconds += segment.duration;
          }
        } catch { /* optional warmup never interrupts playback */ }
      }
    } finally { clearTimeout(timeout); if(controller===abort)controller=null; }
  };
  const loader = (Hls:any): any => {
    const Base = Hls.DefaultConfig.loader;
    return class extends Base {
      private cachedTimer: ReturnType<typeof setTimeout> | undefined;
      load(context:any, config:any, callbacks:any) {
        prune();
        const hit = !context.rangeStart && !context.rangeEnd && context.responseType === "arraybuffer" ? cache.get(context.url) : undefined;
        if (!hit) return super.load(context,config,callbacks);
        cache.delete(context.url);
        this.context=context;
        const now=performance.now();
        this.stats.loading.start=now-Math.max(50,hit.bytes.byteLength*8/900); this.stats.loading.first=this.stats.loading.start; this.stats.loading.end=now;
        this.stats.loaded=hit.bytes.byteLength; this.stats.total=hit.bytes.byteLength;
        this.cachedTimer=setTimeout(()=>callbacks.onSuccess({url:context.url,data:hit.bytes},this.stats,context,null),0);
      }
      abort(){clearTimeout(this.cachedTimer);super.abort();}
      destroy(){clearTimeout(this.cachedTimer);super.destroy();}
    };
  };
  return {warm,cancel,loader};
}

// Same bounded HLS cache survives Home -> Watch. No second decoder is started.
const tvSharedSmartBuffer = createSmartBuffer();
export const cancelTvHomeBuffer = () => tvSharedSmartBuffer.cancel();
export const warmTvHomeBuffer = (channels: {url?:string;type:string}[]) => {
 const network=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string;downlink?:number}}).connection;
 if(document.hidden || network?.saveData || /2g|3g/i.test(network?.effectiveType||"") || (network?.downlink!==undefined && network.downlink<3))return Promise.resolve();
 const video=channels.find(c=>c.type==="video_live"&&c.url&&/\.m3u8(?:[?#]|$)/i.test(c.url));
 return video?.url ? tvSharedSmartBuffer.warm([{url:normalizeLivePlaylistUrl(video.url,video.type),seconds:5}]) : Promise.resolve();
};

interface YoutubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface Canal {
  id: string;
  user_id?: string;
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
  tipo_programa?: string | null;
  capa: string | null;
  thumb: string | null;
  descricao: string | null;
  classificacao_etaria?: string | null;
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

const campaignHasVideoPlacement = (campaign: any, isMidroll: boolean) => {
  const canais = Array.isArray(campaign.ads_canais) ? campaign.ads_canais as string[] : [];

  // Campanhas legadas, criadas antes dos posicionamentos, continuam compatíveis.
  if (canais.length === 0) return Boolean(campaign.is_midroll) === isMidroll;

  const videoPlacement = canais.find((canal) => canal.toLowerCase().startsWith("vídeo"));
  if (!videoPlacement) return false;

  const placement = videoPlacement.toLowerCase();
  if (placement.includes("break")) return false;
  return isMidroll ? placement.includes("midroll") || placement.includes("mid-roll") : !placement.includes("midroll") && !placement.includes("mid-roll");
};

const campaignHasAudioPlacement = (campaign: any) => {
  const canais = Array.isArray(campaign.ads_canais) ? campaign.ads_canais as string[] : [];
  return canais.some((canal) => canal.toLowerCase().startsWith("áudio"));
};

const filterCampaignsByType = (campaigns: any[] | null | undefined, now: Date, isMidroll: boolean, isAudioPreroll = false) => {
  const todayStr = now.toISOString().slice(0, 10);
  return (campaigns || []).filter((p: any) => {
    if (!matchesCampaignDay(p.dias_semana, now)) return false;
    if (p.data_inicial && todayStr < p.data_inicial) return false;
    if (p.data_final && todayStr > p.data_final) return false;
    return isAudioPreroll ? campaignHasAudioPlacement(p) : campaignHasVideoPlacement(p, isMidroll);
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
  const { userSlug } = useParams<{ userSlug?: string }>();
  const [playerColorUserId, setPlayerColorUserId] = useState<string | null>(null);
  usePlayerColors(playerColorUserId, userSlug);
  const [searchParams] = useSearchParams();
  const requestedChannelId = searchParams.get("ch");
  const requestedVideoId = searchParams.get("vid");
  const isTop10Mode = searchParams.get("top10") === "1";
  const navigate = useNavigate();
  const location = useLocation();
  // NEXO_LOADING_UNICO_V1: dados da Home chegam pela navegacao, sem novo splash.
  const tvBootstrap = isPlayerOtt()
    ? (location.state as { tvBootstrap?: {
        channels: Canal[]; programs: Programa[]; presenters: Apresentador[];
        ownerUserId?: string | null; radioName?: string | null;
        logoUrl?: string | null; nowPlaying?: { musica: string; artista: string; capa?: string } | null;
      } } | null)?.tvBootstrap
    : undefined;
  const hasTvBootstrap = !!tvBootstrap?.channels?.length;
  const isWatchRoute = location.pathname.includes("/player/watch") || searchParams.get("step") === "watch";
  const isPublicMode = !!userSlug && !userSlug.startsWith(":");
  usePublicHead(isPublicMode ? userSlug : null, "Player");
  const playerHomePath = useMemo(() => {
    const query = new URLSearchParams({ step: "home" });
    const fromPath = (location.state as { fromPath?: string } | null)?.fromPath;
    const previous = new URLSearchParams(fromPath?.split("?")[1] || "");
    if (searchParams.get("tv") === "1" || previous.get("tv") === "1") query.set("tv", "1");
    if (searchParams.get("tvGuest") === "1" || previous.get("tvGuest") === "1") query.set("tvGuest", "1");
    return `${userSlug ? `/${userSlug}/player` : "/player"}?${query}`;
  }, [userSlug, searchParams, location.state]);
  const playerWelcomePath = useMemo(() => userSlug ? `/${userSlug}/player` : "/player", [userSlug]);
  const clearHomeSkipFlag = useCallback(() => {
    try { window.localStorage.removeItem(`player-step-home:${userSlug || "root"}`); } catch {}
  }, [userSlug]);
  const handleEditProfile = useCallback(() => {
    clearHomeSkipFlag();
    emitProfileChanged({ reason: "edit" });
    navigate(`${playerWelcomePath}?edit=1`);
  }, [clearHomeSkipFlag, navigate, playerWelcomePath]);
  const tvProfileNavigation = useRef<() => void>(()=>{});
  const handleSwitchProfile = useCallback(() => {
    clearHomeSkipFlag();
    emitProfileChanged({ reason: "switch" });
    if (isPlayerOtt()) {
      tvProfileNavigation.current();
      return;
    }
    navigate(playerWelcomePath);
  }, [clearHomeSkipFlag, navigate, playerWelcomePath]);
  const { user: authUser, loading: authLoading } = usePlayerAuth();
  const tvProfile = isPlayerOtt() ? tvWatchProfile(authUser, userSlug) : null;
  const user = tvProfile ? tvProfile.user : authUser;
  const userId = user?.id ?? null;
  const hadPlayerSessionRef = useRef(false);

  // Se uma sessão ativa expirar ou for encerrada enquanto o ouvinte está no
  // player/watch, volte ao acesso do Player em vez de continuar como visitante.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      hadPlayerSessionRef.current = true;
      return;
    }
    if (!hadPlayerSessionRef.current) return;
    hadPlayerSessionRef.current = false;
    clearHomeSkipFlag();
    const slug = userSlug && !userSlug.startsWith(":") ? userSlug : null;
    const isTvPairingFlow = searchParams.get("tv") === "1";
    const destination = isTvPairingFlow
      ? (slug ? `/${slug}/player/tv` : "/player/tv")
      : `${playerWelcomePath}`;
    navigate(destination, { replace: true });
  }, [authLoading, user, userSlug, searchParams, clearHomeSkipFlag, playerWelcomePath, navigate]);

  // Top 10 playlist from navigation state
  const top10Playlist = (location.state as any)?.top10Playlist as { videoId: string; title: string; thumbnail: string; artist: string }[] | undefined;
  const top10OwnerUserId = (location.state as any)?.ownerUserId as string | undefined;

  // Diagnostic logs — disabled in production
  // useEffect(() => { console.log("[PLAYER-DIAG] Auth/user state changed", { userId, authLoading }); }, [userId, authLoading]);

  const [publicUserId, setPublicUserId] = useState<string | null>(tvBootstrap?.ownerUserId || null);
  const publicBootstrapRef = useRef<{ slug: string | null; loaded: boolean }>({ slug: null, loaded: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tvAudioAdoptedRef = useRef(false);
  const hlsRef = useRef<HlsType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stationCanais, setCanais] = useState<Canal[]>(() => hasTvBootstrap ? tvBootstrap!.channels : []);
  // Virtual channel only for the Positiva TV watch route; never written to the database.
  const canais = useMemo(() => {
    if (!isPlayerOtt() || !isWatchRoute || !/^(positiva|positivafm)$/i.test(userSlug || "")) return stationCanais;
    const main = stationCanais.find(c => c.type === "video_live" && c.active !== false && !!c.url && !/cast|podcast/i.test(c.name));
    if (!main) return stationCanais;
    const cast = { ...main, id: "nexo-positiva-twitch", name: "Positiva Cast", url: "https://youtu.be/uPeZ68nIPUY", numero_canal: "2" };
    const oldCast = stationCanais.findIndex(c => c.type === "video_live" && /cast|podcast/i.test(c.name));
    return oldCast >= 0 ? stationCanais.map((c,i)=>i===oldCast?cast:c) : [...stationCanais,cast];
  }, [stationCanais, userSlug, isWatchRoute]);
  const autoPlayedRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!hasTvBootstrap || !requestedChannelId) return 0;
    return canais.findIndex(channel => channel.id === requestedChannelId);
  });
  const [programas, setProgramas] = useState<Programa[]>(() => tvBootstrap?.programs || []);
  const [playing, setPlaying] = useState(false);
  const tvUserPausedRef = useRef(false);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("player:lastMuted") === "1"; } catch { return false; }
  });
  const mutedRef = useRef<boolean>((() => {
    try { return localStorage.getItem("player:lastMuted") === "1"; } catch { return false; }
  })());
  const autoplayMutedRef = useRef(false);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("player:lastVolume");
      const n = saved != null ? Number(saved) : NaN;
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 80;
    } catch { return 80; }
  });
  const volumeRef = useRef<number>(volume);
  const [volumeHover, setVolumeHover] = useState(false);
  const volumeHideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(!hasTvBootstrap || (!!requestedChannelId && !canais.some(c=>c.id===requestedChannelId)));
  const [bootstrapRetry,setBootstrapRetry]=useState(0);
  const [streamLoading, setStreamLoading] = useState(false);
  
  // Update streamLoading based on URL params to handle direct navigation
  useEffect(() => {
    const ch = searchParams.get("ch");
    const vid = searchParams.get("vid");
    const top10 = searchParams.get("top10") === "1";
    const isWatch = location.pathname.includes("/watch") || searchParams.get("step") === "watch";
    
    if (isWatch && (ch || vid || top10)) {
      setStreamLoading(true);
    }
  }, [location.pathname, searchParams]);
  const [loadingStatus, setLoadingStatus] = useState("Iniciando...");
   const [barVisible, setBarVisible] = useState(true);
   const [backBtnVisible, setBackBtnVisible] = useState(false);
  const [pageFadeOut, setPageFadeOut] = useState(false);
  const [musicData, setMusicData] = useState<MusicData | null>(() => {
    // In public mode, don't initialize from localStorage (it belongs to the logged-in user)
    if (isPublicMode) {
      return tvBootstrap?.nowPlaying ? {
        titulo: tvBootstrap.nowPlaying.musica,
        artista: tvBootstrap.nowPlaying.artista,
        capa: tvBootstrap.nowPlaying.capa || "",
        duracao: 0,
      } : null;
    }
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
  const [presenterMenuOpen, setPresenterMenuOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>(() => tvBootstrap?.presenters || []);
  const [whatsappPhone, setWhatsappPhone] = useState<string | null>(null);
  const [commercialPhone,setCommercialPhone]=useState<string|null>(null);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(tvBootstrap?.logoUrl || null);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [watchProfileOpen, setWatchProfileOpen] = useState(false);
  const [empresaNome, setEmpresaNome] = useState<string | null>(tvBootstrap?.radioName || null);
  const [artistBgUrl, setArtistBgUrl] = useState<string | null>(null);
  const artistBgCacheRef = useRef<Record<string, string>>({});
  const profileRadioUserId = isPublicMode ? publicUserId : (user?.id || publicUserId);


  // Spectrum style preference
  const [spectrumStyle, setSpectrumStyle] = useState<import("@/components/AudioSpectrum").SpectrumStyle>(() => {
    try { return (localStorage.getItem("nexo_spectrum_style") as any) || "bars"; } catch { return "bars"; }
  });
  const handleSpectrumStyleChange = useCallback((s: import("@/components/AudioSpectrum").SpectrumStyle) => {
    setSpectrumStyle(s);
    try { localStorage.setItem("nexo_spectrum_style", s); } catch {}
    // Persist to user_settings if logged in
    if (user) {
      void mergeUserDashboardItems(user.id, { spectrum_style: s }).catch(() => {});
    }
  }, [user]);

  const refreshProfileFromDb = useCallback(async () => {
    if (!user || !profileRadioUserId) return;
    const data = await fetchPlayerListenerProfile(user, profileRadioUserId);
    if (data.nome) setProfileName(data.nome);
    if (data.avatar_url) setProfileAvatar(data.avatar_url);
  }, [user, profileRadioUserId]);

  useEffect(() => { void refreshProfileFromDb(); }, [refreshProfileFromDb]);

  // Sincroniza nome/avatar em qualquer aba/tela do player sem recarregar.
  useEffect(() => {
    return onProfileChanged((detail) => {
      if (detail.radioUserId && profileRadioUserId && detail.radioUserId !== profileRadioUserId) return;
      if (detail.nome != null) setProfileName(detail.nome);
      if (detail.avatar_url != null) setProfileAvatar(detail.avatar_url);
      if (detail.reason === "switch" || detail.reason === "edit") {
        void refreshProfileFromDb();
      }
    });
  }, [profileRadioUserId, refreshProfileFromDb]);

  // Load spectrum style preference from user_settings
  useEffect(() => {
    const effectiveId = isPublicMode ? publicUserId : (user?.id || publicUserId);
    if (!effectiveId) return;
    playerSupabase.from("user_settings").select("dashboard_items, shopping_active").eq("user_id", effectiveId).maybeSingle().then(({ data }) => {
      const items = (data?.dashboard_items as any) || {};
      if (items.spectrum_style) {
        setSpectrumStyle(items.spectrum_style);
        try { localStorage.setItem("nexo_spectrum_style", items.spectrum_style); } catch {}
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
  const adsEntryChannel = loading ? null : (!autoPlayedRef.current && requestedChannelId ? canais.find(c=>c.id===requestedChannelId) || null : canal);
  const adsEntryAudio = adsEntryChannel?.type === "audio_live" || adsEntryChannel?.type === "audio";
  const adsStudioPrograms = adsEntryChannel?.estudio ? programas.filter(p=>p.estudio===adsEntryChannel.estudio) : programas;
  const adsProgramId = getCurrentProgram(adsStudioPrograms.length?adsStudioPrograms:programas)?.id;
  const tvCommercial = useTvCommercialPlayback({enabled:isPlayerOtt()&&isWatchRoute&&!!adsEntryChannel&&adsEntryChannel.id!=="nexo-positiva-twitch"&&["audio_live","audio","video_live","video"].includes(adsEntryChannel.type),radioId:profileRadioUserId,channelKey:adsEntryChannel?.id,programId:adsProgramId,audio:adsEntryAudio,breakActive:isSmartBreak(musicData?.titulo,musicData?.artista),paused:tvUserPausedRef.current,trackChannel:isPlayerOtt()&&isWatchRoute&&!!adsEntryChannel&&["audio_live","audio","video_live","video","video_youtube","youtube"].includes(adsEntryChannel.type)});
  const tvPrerollGate = isPlayerOtt() && isWatchRoute && Boolean(adsEntryChannel && adsEntryChannel.id!=="nexo-positiva-twitch" && ["audio_live","audio","video_live","video"].includes(adsEntryChannel.type)) && (tvCommercial.checking || tvCommercial.run?.kind === "preroll");
  const tvAdsBlocked=tvCommercial.blocked;
  const tvAudioWarmRef=useRef<{channel:string;audio:boolean;phase:"warming"|"fading";session:number;frame?:number}|null>(null);
  const tvAdsBlockedRef=useRef(false);tvAdsBlockedRef.current=tvAdsBlocked;
  const tvDigitalPrerollRef=useRef(false);
  if(tvCommercial.run?.kind==="preroll")tvDigitalPrerollRef.current=true;

  const isYoutube = canal?.type === "video_youtube" || canal?.type === "youtube";
  const isCatalog = canal?.type === "catalog" || (!canal && requestedVideoId && !isTop10Mode);
  const isVideo = canal?.type === "video" || canal?.type === "video_live" || isCatalog;

  // Fetch artist background image from Deezer
  const isBreakTrack = musicData?.titulo?.toLowerCase() === "break" || musicData?.artista?.toLowerCase() === "break" || musicData?.artista?.toLowerCase() === "vinhetas" || musicData?.titulo?.toLowerCase() === "hora certa" || musicData?.artista?.toLowerCase() === "hora certa";
  const [prevArtistBgUrl, setPrevArtistBgUrl] = useState<string | null>(null);
  const [artistBgReady, setArtistBgReady] = useState(false);
  useEffect(() => {
    if (artistBgUrl) setPrevArtistBgUrl(artistBgUrl);
  }, [artistBgUrl]);
  useEffect(() => {
    if (isBreakTrack) { setArtistBgUrl(null); setArtistBgReady(false); return; }
    const artist = musicData?.artista;
    if (!artist || artist === "Desconhecido" || !isAudio) { setArtistBgUrl(null); setArtistBgReady(false); return; }
    const cacheKey = artist.toLowerCase();
    if (artistBgCacheRef.current[cacheKey]) {
      setArtistBgReady(false);
      setArtistBgUrl(artistBgCacheRef.current[cacheKey]);
      return;
    }
    // Don't clear previous background — keep it visible while loading
    setArtistBgReady(false);
    let cancelled = false;
    (async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        const { data, error } = await playerSupabase.functions.invoke("fetch-artist-image", {
          body: { artist },
        }).finally(() => clearTimeout(timeout));
        if (cancelled) return;
        if (error || !data?.ok || !data?.url) { setArtistBgUrl(null); return; }
        artistBgCacheRef.current[cacheKey] = data.url;
        setArtistBgUrl(data.url);
      } catch { if (!cancelled) setArtistBgUrl(null); }
    })();
    return () => { cancelled = true; };
  }, [musicData?.artista, isAudio, isBreakTrack]);
  const isAutoplayChannel = useCallback((c?: Canal | null) => normalizeChannelNumber(c?.numero_canal) === "991-1", []);

  
  const is991Channel = normalizeChannelNumber(canal?.numero_canal) === "991-1" || normalizeChannelNumber(canal?.numero_canal) === "991-2" || isCatalog;

  const handleHomeClick = useCallback((destination?: unknown) => {
    const tv = isPlayerOtt();
    if(tv)markTvCommercialHome(profileRadioUserId);
    const keepRadio = Boolean(tv && !tvAdsBlockedRef.current && !tvAudioWarmRef.current && isAudio && audioRef.current && (audioRef.current.currentSrc || audioRef.current.src || hlsRef.current));
    if (keepRadio && audioRef.current) {
      // Entrega o proprio elemento e o engine HLS ao controlador permanente da Home.
      retainTvAudio(audioRef.current, hlsRef.current, tvUserPausedRef.current,
        canal?.url, profileRadioUserId || empresaNome || undefined);
      hlsRef.current = null; // O controlador passou a ser o dono do HLS.
    }
    if (tv) {
      tvUserPausedRef.current = true;
      playbackSessionRef.current++;
    }
    clearMiniPlayerData();
    setStreamRequested(false);
    setPlaying(false);
    // Fully destroy HLS first to prevent recovery handlers from restarting audio
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
    // Full media reset — pause, remove src, and call load() to abort any pending network requests
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    if (audioRef.current && !keepRadio) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    destroyMiniAudio();
    if (tv) {
      setTvRadioStandby(false);
      navigate(typeof destination === "string" ? destination : playerHomePath, {state:{tvInternal:true}});
      return;
    }
    setPageFadeOut(true);
    setTimeout(() => navigate(playerHomePath), 400);
  }, [playerHomePath, navigate, isAudio, canal?.url, profileRadioUserId, empresaNome]);

  tvProfileNavigation.current = () => handleHomeClick(`${playerWelcomePath}?${isPlayerTvApp() ? "tv=1&" : ""}step=profiles${searchParams.get("tvGuest") === "1" ? "&tvGuest=1" : ""}`);

  // Record watch history when channel changes
  const watchHistoryRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canal || !userId || !profileRadioUserId || canal.id === watchHistoryRecordedRef.current) return;
    watchHistoryRecordedRef.current = canal.id;

    // Persist last audio channel for auto-resume on PlayerHome "OUVIR"
    if (canal.type === "audio_live" || canal.type === "audio") {
      try { localStorage.setItem(`nexo_last_audio_channel_${profileRadioUserId}`, canal.id); } catch {}
    }

    // Ao entrar em um canal de áudio, força o volume inicial em 40%
    if (!isPlayerOtt() && (canal.type === "audio_live" || canal.type === "audio")) {
      handleVolumeChange(40);
    }

    
    const recordHistory = async () => {
      const { error } = await playerSupabase.from("watch_history").insert({
        user_id: userId,
        channel_id: canal.id,
        channel_name: canal.name,
        channel_cover_url: canal.cover_url || "",
        channel_logo_url: canal.logo_url || "",
        channel_type: canal.type,
        radio_user_id: profileRadioUserId,
      });
      if (error) {
        console.error("[WATCH-HISTORY] Insert error:", error);
      } else {
        console.log("[WATCH-HISTORY] Recorded:", canal.name);
      }
    };
    recordHistory();
  }, [canal?.id, userId, profileRadioUserId]);

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
  // O anúncio de abertura é exibido somente dentro da tela /player/watch.
  // Assim, escolher um canal não inicia a campanha antes de entrar no player.
  const [prerollDone, setPrerollDone] = useState(!(isWatchRoute && requestedChannelId));
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
    // Audio channels: top bar stays visible always
    if (isAudio) return;
    topBarTimerRef.current = setTimeout(() => setTopBarVisible(false), 2000);
  }, [isAudio]);

  useEffect(() => {
    if (playing && (isCatalog || (!isYoutube))) {
      if (isAudio) {
        setTopBarVisible(true);
        if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current);
      } else {
        resetTopBarTimer();
      }
    }
    return () => { if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current); };
  }, [playing, isCatalog, isYoutube, isAudio, resetTopBarTimer]);

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

  // Top 10 inter-clip transitions: play the full clip, then show mid-roll between clips with fade-in/out
  const [top10Fading, setTop10Fading] = useState<"out" | "in" | null>(null);
  const [top10InterPreroll, setTop10InterPreroll] = useState(false); // showing inter-clip preroll
  const top10PendingNextRef = useRef<string | null>(null);
  // Queue of next clip ids — only drained AFTER the current mid-roll finishes
  // so we never cut from one song to the next without the ad fully playing.
  const top10QueueRef = useRef<string[]>([]);
  const top10FadeTriggeredRef = useRef(false);
  const top10AdvanceStartedRef = useRef(false);
  const top10AdvanceRef = useRef<(() => void) | null>(null);
  // Readiness gate: while a transition is awaiting the next clip's media to load,
  // we keep a black hold overlay up so the previous clip never cuts to a blank
  // or unbuffered new clip. Cleared when the iframe reports duration > 0.
  const awaitingNextClipReadyRef = useRef<string | null>(null);
  const [transitionHold, setTransitionHold] = useState(false);

  // Unified buffering detection
  const { buffering, setBuffering } = useBufferingDetection(videoRef, audioRef);
  const handleTvAudioAdopt = useCallback((hls: HlsType | null, _userPaused: boolean) => {
    // OttAudioHost foi montado: nao chamar playStream novamente para esta mesma radio.
    hlsRef.current = hls;
    if(tvAdsBlockedRef.current){audioRef.current?.pause();return;}
    // Entering the live audio channel requests playback, even if Home was paused.
    tvUserPausedRef.current = false;
    tvAudioAdoptedRef.current = true;
    autoPlayedRef.current = true;
    setStreamRequested(true);
    setPlaying(!!audioRef.current && !audioRef.current.paused);
    setPrerollDone(true);
    setBuffering(false);
    setStreamLoading(false);
    const resume = () => {
      const media = audioRef.current;
      if (!tvUserPausedRef.current && media?.paused) void media.play().then(() => { if (!tvUserPausedRef.current) setPlaying(true); }).catch(error => {
        if (error?.name === "NotAllowedError") setTvPlaybackBlocked(true);
      });
    };
    queueMicrotask(resume);
  }, [setBuffering]);
  const [streamStalled, setStreamStalled] = useState(false);
  const [tvPlaybackBlocked, setTvPlaybackBlocked] = useState(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamRequested, setStreamRequested] = useState(false);
  const connectRetryRef = useRef<{ chId: string | null; n: number }>({ chId: null, n: 0 });
  const playbackSessionRef = useRef(0);
  // TV video recovery is scoped to the current playback session.
  const tvVideoFatalRef = useRef<number | null>(null);
  const [smartBuffer] = useState(()=>isPlayerOtt()?tvSharedSmartBuffer:createSmartBuffer());

  const stopAllPlayback = useCallback((clearChannelState = false) => {
    smartBuffer.cancel(clearChannelState && !isPlayerOtt());
    playbackSessionRef.current += 1;
    if(tvAudioWarmRef.current?.frame)cancelAnimationFrame(tvAudioWarmRef.current.frame);
    tvAudioWarmRef.current=null;
    destroyMiniAudio();
    clearMiniPlayerData();
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (warmupAbortRef.current) {
      try { warmupAbortRef.current.abort(); } catch {}
      warmupAbortRef.current = null;
    }
    resetMediaElement(audioRef.current);
    resetMediaElement(videoRef.current);
    setPlaying(false);
    setBuffering(false);
    setStreamRequested(false);
    setStreamStalled(false);
    setHlsLevels([]);
    setHlsCurrentLevel(-1);
    connectRetryRef.current = { chId: null, n: 0 };
    if (clearChannelState) {
      setCanais([]);
      setCurrentIndex(0);
      setYoutubeVideos([]);
      setSelectedVideoId(null);
      setProgramas([]);
      setApresentadores([]);
      setShopProducts([]);
      setMusicData(null);
      setArtistBgUrl(null);
      setPublicUserId(null);
      setPlayerColorUserId(null);
      setEmpresaLogo(null);
      setEmpresaNome(null);
      setWhatsappPhone(null);setCommercialPhone(null);
    }
  }, []);

  // NEXO_LOADING_UNICO_V1: evitar limpar os dados transferidos da Home no mount.
  const activePublicSlugRef = useRef<string | null>(hasTvBootstrap && isPublicMode && userSlug
    ? userSlug.toLowerCase().trim() : null);
  useEffect(() => {
    const slug = isPublicMode && userSlug && !userSlug.startsWith(":") ? userSlug.toLowerCase().trim() : null;
    if (activePublicSlugRef.current === slug) return;
    activePublicSlugRef.current = slug;
    publicBootstrapRef.current = { slug: null, loaded: false };
    autoPlayedRef.current = false;
    warmedPrerollChannelIdRef.current = null;
    setPrerollDone(!(isWatchRoute && requestedChannelId));
    stopAllPlayback(true);
  }, [isPublicMode, isWatchRoute, requestedChannelId, stopAllPlayback, userSlug]);

  // HLS Quality selector state
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number; index: number }[]>([]);
  const [hlsCurrentLevel, setHlsCurrentLevel] = useState(-1); // -1 = auto
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);

  // Karaoke state
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [karaokeVisible, setKaraokeVisible] = useState(false);

  // Playlist popup state
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [recentTracks, setRecentTracks] = useState<{ musica: string; artista: string; horario: string; programa: string }[]>([]);
  const playlistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const playlistOwnerId = isPublicMode ? publicUserId : user?.id;
    if (!playlistOpen || !playlistOwnerId) return;
    (async () => {
      const [{ data }, { getMusicExceptions, filterOutMusicExceptions }] = await Promise.all([
        playerSupabase.from("musicas_tocadas").select("musica, artista, horario, programa").eq("user_id", playlistOwnerId)
          .order("created_at", { ascending: false }).limit(40),
        import("@/lib/musicExceptions"),
      ]);
      if (!data) return;
      const excs = await getMusicExceptions(playlistOwnerId);
      setRecentTracks(filterOutMusicExceptions(excs, data).slice(0, 20));
    })();
  }, [isPublicMode, playlistOpen, publicUserId, user?.id]);

  // Close playlist on outside click
  useEffect(() => {
    if (!playlistOpen) return;
    const handler = (e: MouseEvent) => {
      if (playlistRef.current && !playlistRef.current.contains(e.target as Node)) setPlaylistOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playlistOpen]);

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
  const [likedSongKeys, setLikedSongKeys] = useState<Set<string>>(() => new Set());
  const savingLikes = useRef(new Set<string>());
  const likedTitle = musicData?.titulo?.trim();
  const likedArtist = musicData?.artista?.trim();
  const songLikeKey = userId && profileRadioUserId && likedTitle && likedArtist
    ? JSON.stringify([userId, profileRadioUserId, likedTitle, likedArtist])
    : null;
  const liked = songLikeKey !== null && likedSongKeys.has(songLikeKey);
  const rememberLike = useCallback((key: string) => {
    setLikedSongKeys(keys => keys.has(key) ? keys : new Set(keys).add(key));
  }, []);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number; delay: number }[]>([]);
  

  useEffect(() => {
    const musicKey = `${musicData?.titulo}||${musicData?.artista}`;
    if (musicKey !== prevMusicRef.current) {
      prevMusicRef.current = musicKey;
      setMusicAnimKey(prev => prev + 1);
    }
  }, [musicData?.titulo, musicData?.artista]);

  useEffect(() => {
    if (liked || !songLikeKey || !userId || !profileRadioUserId || !likedTitle || !likedArtist) return;
    let cancelled = false;
    void playerSupabase.from("music_likes").select("id")
      .eq("user_id", userId).eq("radio_user_id", profileRadioUserId)
      .eq("titulo", likedTitle).eq("artista", likedArtist).limit(1)
      .then(({ data }) => {
        if (!cancelled && data?.length) rememberLike(songLikeKey);
      });
    return () => { cancelled = true; };
  }, [liked, songLikeKey, userId, profileRadioUserId, likedTitle, likedArtist, rememberLike]);

  const toggleLike = useCallback(async () => {
    if (!user) {
      toast.info("Entre com sua conta para salvar músicas curtidas.");
      return false;
    }
    if (!profileRadioUserId || !songLikeKey || !likedTitle || !likedArtist || liked || savingLikes.current.has(songLikeKey)) return false;
    savingLikes.current.add(songLikeKey);
    // NEXO_V7_2_LIKE_DB: a funcao RPC antiga nao esta publicada; usar tabela existente e RLS do proprio ouvinte.
    try {
      const { data: existing, error: lookupError } = await playerSupabase.from("music_likes").select("id")
        .eq("user_id", user.id).eq("radio_user_id", profileRadioUserId)
        .eq("titulo", likedTitle).eq("artista", likedArtist).limit(1);
      if (lookupError) throw lookupError;
      if (existing?.length) { rememberLike(songLikeKey); return false; }
      const { error: insertError } = await playerSupabase.from("music_likes").insert({
        user_id: user.id, radio_user_id: profileRadioUserId,
        titulo: likedTitle, musica: likedTitle, artista: likedArtist, capa: musicData?.capa || null,
      });
      if (insertError) throw insertError;
      rememberLike(songLikeKey);
    } catch (error) {
      console.warn("[Nexo Player] Falha ao registrar curtida:", error);
      toast.error("Não foi possível salvar a curtida. Confira a sessão e tente novamente.");
      return false;
    } finally {
      savingLikes.current.delete(songLikeKey);
    }

    emitProfileChanged({ userId: user.id, radioUserId: profileRadioUserId });
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 600);
    const hearts = Array.from({ length: 6 }, (_, i) => ({ id: Date.now() + i, x: Math.random() * 40 - 20, delay: Math.random() * 0.3 }));
    setFloatingHearts(hearts);
    setTimeout(() => setFloatingHearts([]), 1500);

    // Fire-and-forget: pre-cache YouTube search for this song
    const query = `${likedArtist} ${likedTitle}`;
    playerSupabase.functions.invoke("youtube-search", { body: { queries: [query] } }).then(({ data }) => {
      if (data?.results?.[0]?.videoId) {
        playerSupabase.from("music_likes_youtube_cache" as any).upsert({
          user_id: user.id,
          artista: likedArtist,
          titulo: likedTitle,
          video_id: data.results[0].videoId,
          thumbnail: data.results[0].thumbnail || "",
        }, { onConflict: "user_id,artista,titulo" }).then(() => {});
      }
    }).catch(() => {});
    return true;
  }, [user, profileRadioUserId, songLikeKey, likedTitle, likedArtist, musicData?.capa, liked, rememberLike]);

  // Fetch all initial data — 3 stages for fastest possible first paint
  useEffect(() => {
    let cancelled = false;
    const slug = userSlug && !userSlug.startsWith(":") ? userSlug : null;

    // Skip fetch if Top 10 mode — playlist comes from navigation state
    if (isTop10Mode) return;
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
      if (!hasTvBootstrap) setLoading(true);
      setLoadingStatus("Carregando canais...");

      playerSupabase.functions.invoke("public-player-data", { body: { slug } })
        .then(async ({ data, error }) => {
          if (cancelled) return;
          publicBootstrapRef.current = { slug, loaded: true };

          if (error || !data || data.error || !Array.isArray(data.channels) || !data.channels.length) {
            if (!hasTvBootstrap && isPlayerOtt() && bootstrapRetry<2) { publicBootstrapRef.current={slug,loaded:false}; setTimeout(()=>{if(!cancelled)setBootstrapRetry(v=>v+1)},700); return; }
            if (!hasTvBootstrap) setCanais([]);
            setPrerollDone(true);
            setLoading(false);
            return;
          }

          const ownerId = typeof data.userId === "string" ? data.userId : null;
          setPublicUserId(ownerId);
          setPlayerColorUserId(ownerId);
          const ownerChannels = ((data.channels || []) as Canal[])
            .filter((c) => !ownerId || !c.user_id || c.user_id === ownerId)
            .filter(c => c.type !== "catalog" || c.id === requestedChannelId);
          setCanais(ownerChannels);
          if(!autoPlayedRef.current && requestedChannelId){const requested=ownerChannels.findIndex(c=>c.id===requestedChannelId);if(requested>=0)setCurrentIndex(requested);else if(requestedChannelId!=="nexo-positiva-twitch")setCurrentIndex(-1)}
          setProgramas((data.programas || []) as Programa[]);
          setApresentadores((data.apresentadores || []) as Apresentador[]);
          setShopProducts(data.shopProducts || []);
          if (data.empresa?.telefone_participacao) setWhatsappPhone(data.empresa.telefone_participacao);
          setCommercialPhone(data.empresa?.telefone_comercial||null);
          if (data.empresa?.logo) setEmpresaLogo(data.empresa.logo);
          if (data.empresa?.nome) setEmpresaNome(data.empresa.nome);
          if (data.musicData?.titulo && data.musicData.titulo !== "Sem título" && !isPlayerOtt()) {
            setMusicData({
              titulo: data.musicData.titulo,
              artista: data.musicData.artista || "Desconhecido",
              capa: data.musicData.capa || "",
              duracao: Number(data.musicData.duracao) > 0 ? Number(data.musicData.duracao) : 0,
              horario: data.musicData.horario || "",
            });
            if (data.musicStartTime) {
              try { localStorage.setItem(MUSIC_START_KEY, String(data.musicStartTime)); } catch {}
            }
          }

          const now = new Date();
          const initialChannel = requestedChannelId
            ? ownerChannels.find((channel) => channel.id === requestedChannelId)
            : ownerChannels.find((channel) => isAutoplayChannel(channel) && (channel.type === "audio_live" || channel.type === "audio")) || ownerChannels[0];
          const prerolls = isWatchRoute && !isPlayerOtt()
            ? filterCampaignsByType(
                data.prerolls || [],
                now,
                false,
                initialChannel?.type === "audio_live" || initialChannel?.type === "audio",
              )
            : [];

          if (prerolls.length > 0 && !prerollDone && !tvAudioAdoptedRef.current && !tvDigitalPrerollRef.current) {
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
          if (!hasTvBootstrap && isPlayerOtt() && bootstrapRetry<2) { publicBootstrapRef.current={slug,loaded:false}; setTimeout(()=>{if(!cancelled)setBootstrapRetry(v=>v+1)},700); return; }
          if (!hasTvBootstrap) setCanais([]);
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
        // STAGE 1 — Critical: all data in a single parallel burst for faster hydration
        const [channelsRes, prerollRes, programasRes, apresentadoresRes, empresaRes] = await Promise.all([
          playerSupabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
          isWatchRoute && !isPlayerOtt() && !prerollDone
            ? playerSupabase.from("comercial_preroll").select("*").eq("user_id", userId).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true })
            : Promise.resolve({ data: null, error: null } as const),
          playerSupabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, tipo_programa, capa, thumb, descricao, classificacao_etaria, apresentador_id, apresentadores_ids").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%").order("horario_inicio"),
          playerSupabase.from("apresentadores").select("id, nome, foto, instagram").eq("user_id", userId).eq("ativo", true),
          playerSupabase.from("empresa_config").select("telefone_participacao, telefone_comercial, logo, nome").eq("user_id", userId).maybeSingle(),
        ]);

        if (cancelled) return;

        // Hydrate all critical states at once
        let canaisData = channelsRes.data as Canal[] | null;
        if (!canaisData || canaisData.length === 0) {
          const stationData = await fetchStationDatabaseData(userId);
          if (stationData?.channels && stationData.channels.length > 0) {
            canaisData = stationData.channels as Canal[];
          }
        }
        if (canaisData) {
          setCanais(canaisData.filter(c => c.type !== "catalog" || c.id === requestedChannelId));
        }

        if (isWatchRoute && !isPlayerOtt() && !prerollDone && prerollRes.data && prerollRes.data.length > 0) {
          const initialChannel = requestedChannelId
            ? canaisData?.find((channel) => channel.id === requestedChannelId)
            : canaisData?.find((channel) => isAutoplayChannel(channel) && (channel.type === "audio_live" || channel.type === "audio")) || canaisData?.[0];
          const matching = filterCampaignsByType(
            prerollRes.data || [],
            now,
            false,
            initialChannel?.type === "audio_live" || initialChannel?.type === "audio",
          );
          if (matching.length > 0) {
            const selected = matching[Math.floor(Math.random() * matching.length)];
            setPrerollUrl(selected.video_url);
            setPrerollLinkUrl((selected as any).link_url || null);
            setPrerollMediaType(selected.media_type || "video");
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

        const fetchedProgramas = (!programasRes.error && programasRes.data) ? programasRes.data as Programa[] : [];
        setProgramas(fetchedProgramas);
        if (!apresentadoresRes.error && apresentadoresRes.data) setApresentadores(apresentadoresRes.data as Apresentador[]);
        if (!empresaRes.error && empresaRes.data?.telefone_participacao) setWhatsappPhone(empresaRes.data.telefone_participacao);
        if(!empresaRes.error)setCommercialPhone(empresaRes.data?.telefone_comercial||null);
        if (!empresaRes.error && empresaRes.data?.logo) setEmpresaLogo(empresaRes.data.logo);
        if (!empresaRes.error && empresaRes.data?.nome) setEmpresaNome(empresaRes.data.nome);

        // UI is now visible — release loading gate
        setLoading(false);

        // STAGE 2 — Deferred: shop products
        const currentProg = getCurrentProgram(fetchedProgramas);
        let shopQuery = playerSupabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", userId).eq("active", true).gt("stock", 0);
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
  }, [authLoading, isPublicMode, userId, userSlug, bootstrapRetry]);

  // Top 10 mode: inject virtual catalog channel with playlist
  useEffect(() => {
    if (!isTop10Mode || !top10Playlist || top10Playlist.length === 0) return;

    const virtualChannel: Canal = {
      id: "__top10__",
      numero_canal: "",
      name: "Meu Top 10",
      logo_url: "",
      url: `https://www.youtube.com/playlist?list=top10`,
      type: "catalog",
      active: true,
      cover_url: "",
      background_url: "",
    };

    setCanais([virtualChannel]);
    setCurrentIndex(0);

    // Set YouTube videos from playlist
    setYoutubeVideos(top10Playlist.map(v => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
    })));

    // Auto-select requested video
    if (requestedVideoId) {
      setSelectedVideoId(requestedVideoId);
      setPlaying(true);
      setBuffering(false);
      setYtPlaying(true);
    } else {
      setSelectedVideoId(top10Playlist[0].videoId);
      setPlaying(true);
      setBuffering(false);
      setYtPlaying(true);
    }

    setPrerollDone(true);
    setLoading(false);
  }, [isTop10Mode, top10Playlist]);

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
      let query = playerSupabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", ownerId).eq("active", true).gt("stock", 0);
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
    // Skip if Top 10 mode — playlist is already set from navigation state
    if (isTop10Mode) return;

    if (!isYoutube || !canal?.url) {
      setYoutubeVideos([]);
      setSelectedVideoId(null);
      return;
    }

    const playlistId = canal.url.match(/[?&]list=([a-zA-Z0-9_-]+)/)?.[1] || null;

    if (playlistId) {
      playerSupabase.functions.invoke("youtube-playlist", { body: { playlistId } }).then(({ data }) => {
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
  }, [canal?.url, isYoutube, requestedVideoId, isTop10Mode]);

  // Sync music data directly from XML
  const coverCacheRef = useRef<Record<string, string>>({});
  const noCoverCacheRef = useRef<Record<string, true>>({});
  // In public mode, always use publicUserId for music sync (never the logged-in user)
  const effectiveUserId = isPublicMode ? publicUserId : (user?.id || publicUserId);
  useEffect(() => {
    if (!isPlayerOtt() || !isPublicMode || !isWatchRoute || !userSlug) return;
    // A mounted watch route takes precedence over the Home audio controller.
    return registerTvSyncClock(userSlug, () => {
      if (tvAdsBlockedRef.current || tvAudioWarmRef.current || !canal ||
          !["audio_live", "video_live"].includes(canal.type) || isYoutube) return null;
      return readTvHlsClock(hlsRef.current, isAudio ? audioRef.current : videoRef.current);
    });
  }, [userSlug, isPublicMode, isWatchRoute, canal?.id, canal?.type, isAudio, isYoutube]);
  const tvTrack = useTvNowPlaying(userSlug, publicUserId, isPlayerOtt() && isPublicMode);
  useEffect(() => { if (isPlayerOtt() && isPublicMode && tvTrack) setMusicData(tvTrack); }, [tvTrack, isPublicMode]);
  useEffect(() => {
    if (isPlayerOtt() && isPublicMode) return;
    const isPlaceholderTrack = (track: { titulo?: string; artista?: string }) => {
      const titulo = (track.titulo || "").trim().toLowerCase();
      const artista = (track.artista || "").trim().toLowerCase();
      return (titulo === "" || titulo === "sem título" || titulo === "sem titulo")
        && (artista === "" || artista === "desconhecido");
    };

    const broadcastMusicSync = (payload: MusicData) => {
      window.dispatchEvent(new CustomEvent<MusicData>(MUSIC_SYNC_EVENT, { detail: payload }));
    };

    if (isPublicMode) {
      if (!userSlug || userSlug.startsWith(":")) return;

      let cancelled = false;
      let inFlight = false;
      let tvRequestSequence = 0;
      let lastRealtimeMusic = "";
      const applyPublicMusic = (incoming: Partial<MusicData> | null | undefined, musicStartTime?: number | null) => {
        if (!incoming) return;

        const normalized: MusicData = {
          titulo: (isPlayerOtt() ? normalizeTvMusicText : normalizeMusicText)(incoming.titulo || "") || "Sem título",
          artista: (isPlayerOtt() ? normalizeTvMusicText : normalizeMusicText)(incoming.artista || "") || "Desconhecido",
          duracao: Number(incoming.duracao) > 0 ? Number(incoming.duracao) : 0,
          capa: incoming.capa || "",
          horario: incoming.horario || "",
        };

        if (typeof musicStartTime === "number" && musicStartTime > 0) {
          try { localStorage.setItem(MUSIC_START_KEY, String(musicStartTime)); } catch {}
        }

        setMusicData((prev) => {
          const prevHasRealTrack = !!prev && !isPlaceholderTrack(prev);
          const incomingIsPlaceholder = isPlaceholderTrack(normalized);
          if (prevHasRealTrack && incomingIsPlaceholder) return prev;

          if (isPlayerOtt() && prev) {
            const matches=(damaged:string,good:string)=>{const a=Array.from(damaged.toUpperCase()),b=Array.from(good.toUpperCase());return a.length===b.length&&a.every((c,i)=>c==="�"||c===b[i]);};
            if(matches(normalized.titulo,prev.titulo)&&matches(normalized.artista,prev.artista)) {
              if(normalized.titulo.includes("�")&&!prev.titulo.includes("�")) normalized.titulo=prev.titulo;
              if(normalized.artista.includes("�")&&!prev.artista.includes("�")) normalized.artista=prev.artista;
            }
          }
          const songChanged = !prev || prev.titulo !== normalized.titulo || prev.artista !== normalized.artista;
          if (songChanged) {
            if (!(typeof musicStartTime === "number" && musicStartTime > 0)) {
              try { localStorage.setItem(MUSIC_START_KEY, Date.now().toString()); } catch {}
            }
            return normalized;
          }

          const hasMetaDiff = (normalized.capa && prev.capa !== normalized.capa)
            || (normalized.horario && prev.horario !== normalized.horario)
            || (normalized.duracao > 0 && prev.duracao !== normalized.duracao);

          if (hasMetaDiff) {
            return { ...prev, ...normalized, capa: normalized.capa || prev.capa };
          }

          return prev;
        });
      };

      // FIX (capa travada): protege o polling contra deadlocks silenciosos.
      // Antes: se `playerSupabase.functions.invoke` travasse por rede lenta ou por erro
      // sem rejeitar, `inFlight` ficava `true` para sempre e nenhuma nova música
      // era buscada — o player ficava com a mesma capa "tocando agora" por horas.
      // Agora usamos AbortController+timeout, um watchdog global e forçamos
      // refresh em focus/online.
      let inFlightSince = 0;
      let lastSuccessAt = Date.now();
      let rawXmlUrl: string | null = null;
      let lastRawAttempt = 0;
      const FETCH_TIMEOUT_MS = 6000;

      const fetchPublicMusic = async () => {
        if (cancelled) return;
        // Se o lock está preso há mais de FETCH_TIMEOUT_MS, libera à força.
        if (inFlight && Date.now() - inFlightSince < FETCH_TIMEOUT_MS) return;
        inFlight = true;
        const requestSequence = ++tvRequestSequence;
        inFlightSince = Date.now();
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const { data, error } = await Promise.race([playerSupabase.functions.invoke("public-player-data", {
            body: { slug: userSlug, section: "now_playing" }, signal: controller.signal,
          }), new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("music timeout")), {once:true}))]);
          // Aborta manualmente se o timeout disparou
          if (controller.signal.aborted) return;
          if (cancelled || error || !data) return;

          if (publicUserId && typeof data.userId === "string" && data.userId !== publicUserId) return;
          const incoming = (data.musicData?.titulo ? data.musicData : null) || (data.musica
            ? {
                titulo: data.musica,
                artista: data.artista || "Desconhecido",
                capa: data.capa || "",
                duracao: Number(data.duracao) > 0 ? Number(data.duracao) : 0,
                horario: data.horario || "",
              }
            : null);

          if (isPlayerOtt() && incoming && /�/.test(`${incoming.titulo || ""} ${incoming.artista || ""}`) && Date.now()-lastRawAttempt>10000) {
            lastRawAttempt=Date.now();
            try {
              const owner=publicUserId || data.userId;
              if (!rawXmlUrl && owner) {
                const {data: settings}=await playerSupabase.from("user_settings").select("music_xml_url").eq("user_id",owner).maybeSingle();
                rawXmlUrl=settings?.music_xml_url || null;
              }
              if(rawXmlUrl) {
                const response=await fetch(rawXmlUrl,{cache:"no-store",signal:AbortSignal.timeout(1800)});
                if(response.ok){
                  const xml=new DOMParser().parseFromString(decodeTvMusicXml(await response.arrayBuffer(),response.headers.get("content-type")||""),"application/xml");
                  const title=xml.querySelector("nome_musica,musica_atual,titulo,title")?.textContent?.trim();
                  const artist=xml.querySelector("interprete,nome_interprete,artista_atual,artista,artist")?.textContent?.trim();
                  const matches=(damaged:string,good:string)=>{const a=Array.from(damaged.toUpperCase()), b=Array.from(good.toUpperCase());return a.length===b.length&&a.every((c,i)=>c==="�"||c===b[i]);};
                  if(title&&artist&&!/�/.test(title+artist)&&matches(incoming.titulo||"",title)&&matches(incoming.artista||"",artist)){incoming.titulo=title;incoming.artista=artist;}
                }
              }
            } catch { /* original XML may be unavailable to a public listener */ }
          }
          if(cancelled || controller.signal.aborted || (isPlayerOtt() && requestSequence !== tvRequestSequence)) return;
          applyPublicMusic(incoming, typeof data.musicStartTime === "number" ? data.musicStartTime : null);
          lastSuccessAt = Date.now();
        } catch {
        } finally {
          window.clearTimeout(timeoutId);
          if (requestSequence === tvRequestSequence) inFlight = false;
        }
      };

      fetchPublicMusic();
      const interval = setInterval(() => { if (!document.hidden) void fetchPublicMusic(); }, isPlayerOtt() ? 2000 : 3000); // Fallback polling every 3s (Realtime is primary)
      // Watchdog: se ninguém teve sucesso há >30s e a aba está visível,
      // força uma nova tentativa (mesmo que `inFlight` esteja preso).
      const watchdog = setInterval(() => {
        if (cancelled) return;
        if (document.hidden) return;
        if (Date.now() - lastSuccessAt > 30000) {
          inFlight = false;
          fetchPublicMusic();
        }
      }, 15000);
      const onVisibility = () => { if (!document.hidden && !cancelled) fetchPublicMusic(); };
      const onFocus = () => { if (!cancelled) fetchPublicMusic(); };
      const onOnline = () => { if (!cancelled) fetchPublicMusic(); };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onFocus);
      window.addEventListener("online", onOnline);

      // Realtime subscription on user_settings for instant music updates
      let realtimeChannel: ReturnType<typeof playerSupabase.channel> | null = null;
      if (publicUserId) {
        realtimeChannel = playerSupabase
          .channel(`public-music-${publicUserId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "user_settings", filter: `user_id=eq.${publicUserId}` },
            (payload) => {
              if (cancelled) return;
              const items = (payload.new as any)?.dashboard_items;
              if (items && typeof items === "object") {
                const m = items.musicData || items.music;
                if (isPlayerOtt() && typeof items.music_current_title === "string" && items.music_current_title.trim()) {
                  const snapshot = {titulo:items.music_current_title, artista:items.music_current_artist || "", capa:items.music_current_cover || ""};
                  const signature = JSON.stringify(snapshot);
                  if (signature === lastRealtimeMusic) return;
                  lastRealtimeMusic = signature;
                  ++tvRequestSequence; inFlight = false;
                  applyPublicMusic(snapshot, typeof items.music_start_time === "number" ? items.music_start_time : null);
                } else if (m && !isPlayerOtt()) applyPublicMusic(m, typeof m.startTime === "number" ? m.startTime : null);
              }
              // Polling covers unrelated dashboard updates.
              if (!isPlayerOtt() || typeof items?.music_current_title === "string") fetchPublicMusic();
            }
          )
          .subscribe();
      }

      return () => {
        cancelled = true;
        clearInterval(interval);
        clearInterval(watchdog);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("online", onOnline);
        if (realtimeChannel) playerSupabase.removeChannel(realtimeChannel);
      };
    }

    if (!effectiveUserId) return;

    const syncFromStorage = () => {
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
      const lockIsFresh = inFlight && nowMs - lockStartedAt < 2000;
      if (lockIsFresh) return;

      const requestId = ++activeRequestId;
      inFlight = true;
      lockStartedAt = nowMs;
      try {
        if (!cachedXmlUrl || xmlFetchFails > 3) {
          const { data: settings } = await playerSupabase.from("user_settings").select("music_xml_url").eq("user_id", effectiveUserId).maybeSingle();
          cachedXmlUrl = settings?.music_xml_url || null;
          if (cachedXmlUrl) xmlFetchFails = 0;
        }
        if (!cachedXmlUrl || cancelled) return;

        fetchCycleCount++;
        if (fetchCycleCount % 20 === 0) directFetchOk = null;

        let text = "";

        if (directFetchOk !== false) {
          try {
            const directRes = await fetch(cachedXmlUrl, {
              signal: AbortSignal.timeout(1200),
              cache: "no-store",
            });
            if (directRes.ok) {
              directFetchOk = true;
              if (isPlayerOtt()) {
                const bytes = await directRes.arrayBuffer();
                text = decodeTvMusicXml(bytes, directRes.headers.get("content-type") || "");
              } else text = await directRes.text();
            }
          } catch {
            if (directFetchOk === null) directFetchOk = false;
          }
        }

        if (!text) {
          try {
            const { data: rssData, error: rssError } = await playerSupabase.functions.invoke("fetch-rss", {
              body: { url: cachedXmlUrl },
            });
            if (rssError || !rssData?.content) { xmlFetchFails++; return; }
            text = rssData.content;
            xmlFetchFails = 0;
          } catch { xmlFetchFails++; return; }
        }

        const data = parseXml(text);
        if (!data || cancelled) return;

        setMusicData(prev => {
          const prevHasRealTrack = !!prev && !isPlaceholderTrack(prev);
          const incomingIsPlaceholder = isPlaceholderTrack(data);
          if (prevHasRealTrack && incomingIsPlaceholder) return prev;

          if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
            const next = { ...data };
            try {
              localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next));
              localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
            } catch {}
            broadcastMusicSync(next);
            return next;
          }

          const hasMetaDiff = (data.capa && prev.capa !== data.capa)
            || (data.horario && prev.horario !== data.horario)
            || (data.duracao > 0 && prev.duracao !== data.duracao);

          if (hasMetaDiff) {
            const next = { ...prev, ...data, capa: data.capa || prev.capa };
            try { localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next)); } catch {}
            broadcastMusicSync(next);
            return next;
          }

          return prev;
        });

        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            const cover = coverCacheRef.current[cacheKey];
            setMusicData(prev => {
              if (prev && prev.titulo === data.titulo && prev.artista === data.artista && !prev.capa) {
                const next = { ...prev, capa: cover };
                try { localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next)); } catch {}
                broadcastMusicSync(next);
                return next;
              }
              return prev;
            });
          } else if (!noCoverCacheRef.current[cacheKey]) {
            (async () => {
              try {
                const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`, { signal: AbortSignal.timeout(4000) });
                const itunesData = await itunesRes.json();
                if (itunesData.results?.length > 0) {
                  const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                  if (cover) {
                    coverCacheRef.current[cacheKey] = cover;
                    setMusicData(prev => {
                      if (prev && prev.titulo === data.titulo && prev.artista === data.artista && !prev.capa) {
                        const next = { ...prev, capa: cover };
                        try { localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(next)); } catch {}
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

    fetchAndSync();
    const interval = setInterval(fetchAndSync, 1500);
    const storagePoll = setInterval(syncFromStorage, 800);

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
  }, [effectiveUserId, isPublicMode, userSlug]);

  // Play stream
  const playStream = useCallback(
    async (url: string, type: string, forceAutoplay?: boolean, userInitiated?: boolean, commercialWarmup = false) => {
      if(isPlayerOtt()&&tvAdsBlockedRef.current&&!commercialWarmup)return;
      if(!commercialWarmup && tvAudioWarmRef.current?.phase==="fading" && !userInitiated)return;
      if (isPlayerOtt()) {
        const adopted = audioRef.current;
        if (!userInitiated && tvAudioAdoptedRef.current && (type === "audio_live" || type === "audio") && adopted && adopted.dataset.tvResumeUrl === url && !adopted.error && !adopted.paused && adopted.readyState >= 2) {
          setPlaying(true); setBuffering(false); return;
        }
        if(type === "audio_live" || type === "audio")stopTvAudio(); else setTvRadioStandby(true);
        setTvPlaybackBlocked(false);
      }
      smartBuffer.cancel();
      const sessionId = ++playbackSessionRef.current;
      tvVideoFatalRef.current = null;
      if(commercialWarmup&&tvAudioWarmRef.current)tvAudioWarmRef.current.session=sessionId;
      else if(tvAudioWarmRef.current){if(tvAudioWarmRef.current.frame)cancelAnimationFrame(tvAudioWarmRef.current.frame);tvAudioWarmRef.current=null;}
      destroyMiniAudio();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      resetMediaElement(audioRef.current);
      resetMediaElement(videoRef.current);
      setHlsLevels([]);
      setHlsCurrentLevel(-1);
      setBuffering(true);
      setPlaying(false);
      setStreamStalled(false);
      setStreamRequested(true);

      if (isPlayerOtt() && (url === "https://www.twitch.tv/posicast" || url === "https://youtu.be/uPeZ68nIPUY")) {
        setBuffering(false); setStreamLoading(false); setPlaying(false); return;
      }
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
        if (playbackSessionRef.current !== sessionId) return;
        if (!shouldStartMuted) autoplayMutedRef.current = false;
        
        // Safety timeout to ensure loading screen stays for at least 3s total from start
        setTimeout(() => {
          if (playbackSessionRef.current !== sessionId || (isPlayerOtt() && tvUserPausedRef.current)) return;
          setStreamLoading(false);
          setPlaying(true);
          setBuffering(false);
        }, isPlayerOtt() ? 0 : 1500); // play() has already resolved
      };

      const handlePlayBlocked = (label: string, error: unknown) => {
        if (playbackSessionRef.current !== sessionId) return;
        console.warn(label, error);
        if (isPlayerOtt() && error instanceof DOMException && error.name === "NotAllowedError") setTvPlaybackBlocked(true);
        // If play was blocked and we weren't muted, retry muted (autoplay policy)
        if ((!isPlayerOtt() || !isAudioType) && !shouldStartMuted && forceAutoplay && error instanceof DOMException && error.name === "NotAllowedError") {
          console.log("Retrying playback muted due to autoplay policy...");
          autoplayMutedRef.current = true;
          mutedRef.current = true;
          setMuted(true);
          const media = isAudioType ? audioRef.current : videoRef.current;
          if (media) {
            media.muted = true;
            media.play().then(() => {
              setTvPlaybackBlocked(false);
              if (playbackSessionRef.current !== sessionId) return;
      setStreamLoading(false);
      setPlaying(true);
              setBuffering(false);
            }).catch(() => {
              if (playbackSessionRef.current !== sessionId) return;
              setPlaying(false);
              setBuffering(false);
            });
          }
          return;
        }
        setPlaying(false);
        setBuffering(false);
      };

      const playLabel = isAudioType ? "Audio play blocked:" : "Video play blocked:";
      const fadeInMedia = (media: HTMLMediaElement) => {
        if (tvAudioWarmRef.current?.session===sessionId) return;
        if (media.muted) return;
        const rawTarget = Math.max(0, Math.min(1, volumeRef.current / 100));
        const target = isAudioType && isPlayerOtt() ? tvRadioVolume(rawTarget) : rawTarget;
        if (target <= 0) return;
        if (isAudioType || isPlayerOtt()) {
          try { media.volume = target; } catch {}
          return;
        }
        const duration = 900;
        const start = performance.now();
        media.volume = 0;
        const step = (now: number) => {
          if (playbackSessionRef.current !== sessionId) return;
          const t = Math.min(1, (now - start) / duration);
          try { media.volume = target * t; } catch {}
          if (t < 1) requestAnimationFrame(step);
          else { try { media.volume = target; } catch {} }
        };
        requestAnimationFrame(step);
      };
      const requestPlay = (media: HTMLMediaElement) => {
        media.muted = shouldStartMuted || (tvAudioWarmRef.current?.session===sessionId && tvAudioWarmRef.current?.phase==="warming");
        if (tvAudioWarmRef.current?.session===sessionId && tvAudioWarmRef.current?.phase==="warming") media.volume=0;
        else if (!(tvAudioWarmRef.current?.session===sessionId && tvAudioWarmRef.current?.phase==="fading")) media.volume = (shouldStartMuted || isAudioType || isPlayerOtt()) ? (isAudioType && isPlayerOtt() ? tvRadioVolume(volumeRef.current / 100) : Math.max(0,Math.min(1,volumeRef.current / 100))) : 0;
        return media.play().then(() => {
          fadeInMedia(media);
          if (isAudioType && !shouldStartMuted && !commercialWarmup) {
            const targetVolume = isPlayerOtt() ? tvRadioVolume(volumeRef.current / 100) : Math.max(0, Math.min(1, volumeRef.current / 100));
            window.setTimeout(() => {
              if (playbackSessionRef.current !== sessionId) return;
              if (media.paused || media.muted) return;
              if (media.volume < Math.max(0.05, targetVolume * 0.5)) {
                try { media.volume = targetVolume; } catch {}
              }
            }, 1200);
          }
          handlePlayStarted();
        }).catch((e) => handlePlayBlocked(playLabel, e));
      };

      const normalizedUrl = normalizeLivePlaylistUrl(url, type);
      const useHls = normalizedUrl.includes(".m3u8");
      // Only add cache-busting for HLS playlists; Icecast/Shoutcast direct streams may reject query params
      const freshUrl = useHls
        ? (normalizedUrl.includes("?") ? `${normalizedUrl}&_t=${Date.now()}` : `${normalizedUrl}?_t=${Date.now()}`)
        : normalizedUrl;
      let Hls: typeof HlsType | null = null;
      if (useHls) {
        try { Hls = await getHls(); }
        catch (error) {
          if (!isPlayerOtt() || isAudioType) throw error;
          if (playbackSessionRef.current === sessionId) {
            tvVideoFatalRef.current = sessionId;
            setStreamStalled(true); setBuffering(true); setPlaying(false);
          }
          return;
        }
      }
      if (playbackSessionRef.current !== sessionId) return;

      if (isAudioType) {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = isPlayerOtt() ? tvRadioVolume(volumeRef.current / 100) : volumeRef.current / 100;
        audio.muted = shouldStartMuted || tvAudioWarmRef.current?.phase==="warming";
        if(tvAudioWarmRef.current?.phase==="fading")audio.volume=0;
        if (Hls && Hls.isSupported()) {
          let playRequested = false;
          const requestAudioPlay = () => {
            playRequested = true;
            void requestPlay(audio);
          };

          const hls = new Hls({
            ...(isPlayerOtt() ? { fLoader: smartBuffer.loader(Hls) } : {}),
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: isPlayerOtt() ? 30 : 60,
            maxMaxBufferLength: isPlayerOtt() ? 60 : 120,
            maxBufferHole: 0.5,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            liveDurationInfinity: true,
            // Timeshift: manter 30 min (1800s) de áudio para trás no buffer
            backBufferLength: isPlayerOtt() ? 20 : 1800,
            liveBackBufferLength: isPlayerOtt() ? 20 : 1800,
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
          if (!isPlayerOtt() && (userInitiated || forceAutoplay)) requestAudioPlay();
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (playbackSessionRef.current !== sessionId) return;
            if ((!isPlayerOtt() || !tvUserPausedRef.current) && (!playRequested || audio.paused)) requestAudioPlay();
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            if (playbackSessionRef.current === sessionId) setBuffering(false);
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (playbackSessionRef.current !== sessionId) return;
            if (data.fatal) {
              if (isPlayerOtt() && (tvUserPausedRef.current || (tvAdsBlockedRef.current && !commercialWarmup))) return;
              console.warn("HLS fatal error on audio, recovering...", data.type);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else { hls.destroy(); hlsRef.current = null; setStreamStalled(true); setPlaying(false); }
            }
          });
        } else {
          // Direct Icecast/Shoutcast stream — native HTML5 audio
          audio.preload = isPlayerOtt() ? "auto" : "none";
          audio.src = freshUrl;
          audio.load();
          // Add error handler for reconnection on stream failures
          const onError = () => {
            if (playbackSessionRef.current !== sessionId) return;
            console.warn("Native audio stream error, will retry...");
            setBuffering(true);
            setTimeout(() => {
              if (playbackSessionRef.current === sessionId && audio.error && (!isPlayerOtt() || (!tvUserPausedRef.current && !tvAdsBlockedRef.current && !tvAudioWarmRef.current))) {
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
        if (!video) { if (isPlayerOtt()) setStreamRequested(false); return; }
        if (Hls && Hls.isSupported()) {
          let playRequested = false;
          const requestVideoPlay = () => {
            if (playbackSessionRef.current !== sessionId || (isPlayerOtt() && (tvUserPausedRef.current || (tvAdsBlockedRef.current && !commercialWarmup)))) return;
            playRequested = true;
            void requestPlay(video);
          };

          const hls = new Hls({
            ...(isPlayerOtt() ? { fLoader: smartBuffer.loader(Hls) } : {}),
            enableWorker: true,
            lowLatencyMode: false,
            capLevelToPlayerSize: isPlayerOtt(),
            startLevel: -1,
            autoStartLoad: true,
            maxBufferLength: isPlayerOtt() ? 25 : 40,
            maxMaxBufferLength: isPlayerOtt() ? 45 : 90,
            maxBufferSize: (isPlayerOtt() ? 24 : 60) * 1000 * 1000,
            maxBufferHole: 0.5,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            liveDurationInfinity: true,
            liveBackBufferLength: 30,
            abrEwmaDefaultEstimate: isPlayerOtt() ? 900000 : 3000000,
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
          if (!isPlayerOtt() && (userInitiated || forceAutoplay)) requestVideoPlay();
          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            if (playbackSessionRef.current !== sessionId) return;
            if (data.levels && data.levels.length > 0) {
              const levels = data.levels.map((l: any, i: number) => ({
                height: l.height || 0,
                bitrate: l.bitrate || 0,
                index: i,
              }));
              setHlsLevels(levels);
              setHlsCurrentLevel(-1);
            }
            if ((!isPlayerOtt() || !tvUserPausedRef.current) && (!playRequested || video.paused)) requestVideoPlay();
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            if (playbackSessionRef.current === sessionId) setBuffering(false);
          });
          let mediaErrorRecoveries = 0;
          let networkRetries = 0;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (playbackSessionRef.current !== sessionId || (isPlayerOtt() && hlsRef.current !== hls)) return;
            if (isPlayerOtt() && (tvUserPausedRef.current || (tvAdsBlockedRef.current && !commercialWarmup))) return;
            if (!data.fatal) {
              if (isPlayerOtt()) return; // HLS handles buffer holes; do not jump to the live edge.
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
            if (isPlayerOtt()) {
              // HLS already exhausted its internal retries before a fatal error.
              // Give it one in-place recovery, then hand off to the single video watchdog.
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ === 0) {
                try { hls.startLoad(); return; } catch {}
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErrorRecoveries++ === 0) {
                try { hls.recoverMediaError(); return; } catch {}
              }
              tvVideoFatalRef.current = sessionId;
              if (hlsRef.current === hls) hlsRef.current = null;
              try { hls.destroy(); } catch {}
              resetMediaElement(video);
              setStreamStalled(true); setBuffering(true); setPlaying(false);
              return;
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              networkRetries++;
              if (networkRetries <= 5) {
                console.log("HLS network recovery attempt", networkRetries);
                hls.startLoad();
              } else {
                console.warn("Too many network errors, full restart");
                hls.destroy();
                hlsRef.current = null;
                setTimeout(() => {
                  if (playbackSessionRef.current === sessionId && !isPlayerOtt()) playStream(url, type);
                }, 1500);
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              mediaErrorRecoveries++;
              if (mediaErrorRecoveries <= 3) {
                hls.recoverMediaError();
              } else {
                console.warn("Too many media errors, restarting HLS");
                hls.destroy();
                hlsRef.current = null;
                setTimeout(() => {
                  if (playbackSessionRef.current === sessionId && !isPlayerOtt()) playStream(url, type);
                }, 1500);
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

  // Warm only while the active stream is healthy. Never compete with ads or startup.
  useEffect(() => {
    if (!isPlayerOtt() || !isWatchRoute || !playing || buffering || streamStalled || tvAdsBlocked || !canal) {
      smartBuffer.cancel(); return;
    }
    const network = (navigator as Navigator & {connection?: {saveData?:boolean;effectiveType?:string;downlink?:number}}).connection;
    const healthy = () => !network?.saveData && !/2g|3g/i.test(network?.effectiveType || "") && (network?.downlink === undefined || network.downlink >= 3);
    const targets = liveChannels.filter(c=>c.id!==canal.id && /\.m3u8(?:[?#]|$)/i.test(c.url)).slice(0,2).map((c,i)=>({url:normalizeLivePlaylistUrl(c.url,c.type),seconds:isAudio&&c.type==="video_live"&&i===0?5:3}));
    if (!targets.length) return;
    const tick=()=>{if(!document.hidden && healthy() && !tvAdsBlockedRef.current && !tvUserPausedRef.current && !tvAudioWarmRef.current) void smartBuffer.warm(targets);else smartBuffer.cancel();};
    const first=setTimeout(tick,2000); const interval=setInterval(tick,10000);
    return ()=>{clearTimeout(first);clearInterval(interval);smartBuffer.cancel();};
  }, [isWatchRoute, playing, buffering, streamStalled, tvAdsBlocked, canal?.id, liveChannels, isAudio, smartBuffer]);
  useEffect(()=>()=>smartBuffer.cancel(!isPlayerOtt()),[smartBuffer]);

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
    if (isPlayerOtt()) return;
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
    if (!prerollDone || tvAdsBlocked) return;
    if (autoPlayedRef.current || canais.length === 0 || playing || (isPlayerOtt() && loading)) return;
    autoPlayedRef.current = true;

    // If a specific channel was requested via ?ch= query param, use it
    let startIndex = -1;
    if (requestedChannelId) {
      startIndex = canais.findIndex((c) => c.id === requestedChannelId);
    }
    if (startIndex < 0 && requestedChannelId && isPlayerOtt()) { autoPlayedRef.current=false; return; }
    if (startIndex < 0) {
      const preferredIndex = canais.findIndex((c) => isAutoplayChannel(c));
      startIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }
    if (isPlayerOtt() && canais[startIndex]?.id === "nexo-positiva-twitch") {
      const main = canais.findIndex(c => c.type === "video_live" && c.id !== "nexo-positiva-twitch");
      if (main >= 0) startIndex = main;
    }
    const first = canais[startIndex];
    if (!first) return;

    setCurrentIndex(startIndex);
    if (first.type === "youtube" || first.type === "catalog") {
      setStreamRequested(false);
      setPlaying(true);
      setBuffering(false);
      setSelectedVideoId(null);
      setSidebarOpen(false);
    } else {
      const pendingSession = playbackSessionRef.current;
      const waitForTvMedia = isPlayerOtt();
      const needsAudio = first.type === "audio_live" || first.type === "audio";
      const deadline = performance.now() + 15000;
      const startWhenReady = () => {
        if (playbackSessionRef.current !== pendingSession) return;
        // The Fire TV may still be loading the lazy watch screen and its refs.
        if (waitForTvMedia && !(needsAudio ? audioRef.current : videoRef.current)) {
          if (performance.now() < deadline) setTimeout(startWhenReady, 100);
          else autoPlayedRef.current=false;
          return;
        }
        if (waitForTvMedia && (tvUserPausedRef.current || (needsAudio && tvAudioAdoptedRef.current))) return;
        void playStream(first.url, first.type, true);
      };
      setTimeout(startWhenReady, 120);
    }
  }, [canais, playing, playStream, prerollDone, isAutoplayChannel, requestedChannelId, loading,tvAdsBlocked]);

  // TV entry safety net: verify the actual media after the lazy watch screen mounts.
  // The normal autoplay and channel-switch paths have priority; never start a second stream.
  useEffect(() => {
    if (tvAdsBlocked || !isPlayerOtt() || !isWatchRoute || loading || !prerollDone || isPrerollVisible || !canal?.url || canal.id === "nexo-positiva-twitch" || !["audio_live", "audio", "video_live", "video"].includes(canal.type) || streamRequested || tvPlaybackBlocked) return;
    const session = playbackSessionRef.current;
    const deadline = Date.now() + 25000;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const check = () => {
      if (cancelled || playbackSessionRef.current !== session || tvUserPausedRef.current) return;
      const media = isAudio ? audioRef.current : videoRef.current;
      if (!media) { if (Date.now() < deadline) timer = setTimeout(check, 250); return; }
      if (!media.paused && !media.ended && !media.error && media.readyState>=2 && (media.currentSrc || media.getAttribute("src"))) {
        setStreamRequested(true); setPlaying(true); return;
      }
      if (media.currentSrc || media.getAttribute("src")) {
        if (!media.error && !media.ended) {
          void media.play().then(() => {
            if (!cancelled && playbackSessionRef.current === session && !tvUserPausedRef.current) { setStreamRequested(true); setPlaying(true); }
          }).catch(error => {
            if (cancelled || playbackSessionRef.current !== session || tvUserPausedRef.current || tvAdsBlockedRef.current) return;
            if (error?.name === "NotAllowedError") setTvPlaybackBlocked(true);
            else void playStream(canal.url, canal.type, true);
          });
          return;
        }
      }
      void playStream(canal.url, canal.type, true);
    };
    timer = setTimeout(check, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isWatchRoute, loading, prerollDone, isPrerollVisible, canal?.id, canal?.url, canal?.type, isAudio, streamRequested, tvPlaybackBlocked, playStream,tvAdsBlocked]);

  // Safety net: if stream was requested but playing never became true, auto-retry once
  useEffect(() => {
    if (isPlayerOtt() || !canal || isYoutube || isCatalog || playing || !streamRequested) return;
    if (connectRetryRef.current.chId !== canal.id) {
      connectRetryRef.current = { chId: canal.id, n: 0 };
    }
    const timer = setTimeout(() => {
      if (playing || !canal || connectRetryRef.current.chId !== canal.id) return;
      if (connectRetryRef.current.n >= 2) return;
      connectRetryRef.current.n += 1;
      console.warn("[PLAYER] Auto-retry stream for", canal.name, "attempt", connectRetryRef.current.n);
      void playStream(canal.url, canal.type, true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [canal, isCatalog, isYoutube, playStream, playing, streamRequested]);

  // Recurring pre-roll every 15 minutes
  const fetchAndShowPreroll = useCallback(async () => {
    if (isPlayerOtt() || tvAdsBlockedRef.current || !user || prerollShowing || isYoutube) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const { data } = await playerSupabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true });

    if (data && data.length > 0) {
      const matching = filterCampaignsByType(data, now, false, isAudio);
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
  }, [user, prerollShowing, isYoutube, isAudio]);

  useEffect(() => {
    if (isPlayerOtt() || !prerollDone || !playing || isYoutube) return;
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
    if (tvAdsBlockedRef.current || !canal) return;
    const media = canal.type === "audio_live" || canal.type === "audio" ? audioRef.current : videoRef.current;
    const isTvStream = isPlayerOtt() && canal.type !== "youtube" && media;
    if (isTvStream ? !media.paused && !media.ended : playing) {
      tvUserPausedRef.current = true;
      if (audioRef.current) audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
      setPlaying(false);
      return;
    }
    tvUserPausedRef.current = false;
    setTvPlaybackBlocked(false);
    if (canal.type === "youtube") { setPlaying(true); setBuffering(false); return; }
    if (isPlayerOtt() && ["audio_live", "audio", "video_live", "video"].includes(canal.type) && media && (media.currentSrc || media.src) && !media.error) {
      // Retomar o mesmo fluxo, sem criar outro audio nem reiniciar o buffering.
      void media.play().then(() => { setPlaying(true); setBuffering(false); }).catch((error) => { setPlaying(false); if (error?.name === "NotAllowedError") setTvPlaybackBlocked(true); });
      return;
    }
    playStream(canal.url, canal.type, false, true);
  }, [canal, playing, playStream]);

  const tvReconnectRef = useRef(playStream); tvReconnectRef.current = playStream;
  useEffect(() => {
    if (tvAdsBlocked || !isPlayerOtt() || !isWatchRoute || !prerollDone || isPrerollVisible || !streamRequested || !canal || canal.id === "nexo-positiva-twitch" || !["audio_live", "audio", "video_live", "video"].includes(canal.type)) return;
    if (!isAudio) {
      // One watchdog per selected TV video. No new ads or channel navigation on retry.
      let session = playbackSessionRef.current;
      let lastTime = -1, lastProgress = Date.now(), lastRetry = 0, attempts = 0;
      let healthySince = 0;
      const tick = () => {
        const now = Date.now();
        if (document.hidden || tvAdsBlockedRef.current || tvAudioWarmRef.current || tvUserPausedRef.current || tvPlaybackBlocked) {
          lastProgress = now; healthySince = 0; lastTime = -1; return;
        }
        if (session !== playbackSessionRef.current) {
          session = playbackSessionRef.current; lastTime = -1; lastProgress = now; healthySince = 0;
        }
        const video = videoRef.current;
        if (!video) return;
        const fatal = tvVideoFatalRef.current === session || Boolean(video.error || video.ended);
        const progressing = !fatal && !video.paused && video.readyState >= 2 && video.currentTime > 0 && lastTime >= 0 && video.currentTime > lastTime + 0.01;
        lastTime = video.currentTime;
        if (progressing) {
          lastProgress = now;
          if (!healthySince) healthySince = now;
          if (now - healthySince >= 5000) attempts = 0;
          setStreamStalled(false); setBuffering(false); setPlaying(true); setStreamLoading(false);
          return;
        }
        healthySince = 0;
        const backoff = Math.min(2000 * 2 ** Math.min(attempts, 4), 30000);
        if ((!fatal && now - lastProgress < 12000) || now - lastRetry < backoff) return;
        lastRetry = now; lastProgress = now; attempts++;
        setStreamStalled(true); setBuffering(true);
        void tvReconnectRef.current(canal.url, canal.type, true).catch(() => {});
      };
      const timer = window.setInterval(tick, 1000);
      return () => window.clearInterval(timer);
    }
    const recovery = createLiveMediaRecovery({
      startupGraceMs:20000,
      stallGraceMs:18000,
      recoverMissingSource:true,
      media: () => isAudio ? audioRef.current : videoRef.current,
      wanted: () => !tvAdsBlockedRef.current && !tvAudioWarmRef.current && !tvUserPausedRef.current && !tvPlaybackBlocked,
      reconnect: () => tvReconnectRef.current(canal.url, canal.type, false),
    });
    return () => recovery.stop();
  }, [canal?.id, canal?.url, canal?.type, isAudio, tvPlaybackBlocked, isWatchRoute, prerollDone, isPrerollVisible, streamRequested,tvAdsBlocked]);

  const navigateChannel = useCallback((dir: 1 | -1, targetVideoId?: string) => {
    if (liveChannels.length === 0) return;

    const navigationChannels = isPlayerOtt() ? liveChannels.filter(c => c.id !== "nexo-positiva-twitch") : liveChannels;
    if (!navigationChannels.length) return;
    const currentLiveIndex = canal ? navigationChannels.findIndex(c => c.id === canal.id || (canal.id === "nexo-positiva-twitch" && c.type === "video_live")) : -1;
    const baseIndex = currentLiveIndex >= 0 ? currentLiveIndex : 0;
    const nextLiveIndex = (baseIndex + dir + navigationChannels.length) % navigationChannels.length;
    const nextChannel = targetVideoId ? liveChannels.find((c) => String(c.id) === targetVideoId && (c.type === "video_live" || c.type === "audio_live" || c.type === "audio")) : navigationChannels[nextLiveIndex];
    if (!nextChannel || (targetVideoId && String(nextChannel.id) === String(canal?.id))) return;

    const nextIndex = canais.findIndex((c) => c.id === nextChannel.id);
    if (nextIndex < 0) return;

    setChannelNavDir(dir);
    setChannelAnimKey(prev => prev + 1);
    setCurrentIndex(nextIndex);
    playbackSessionRef.current++;
    tvUserPausedRef.current = false;
    setStreamRequested(false);

    // Stop any playing audio/video when switching channels — full cleanup
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setHlsLevels([]);
    setHlsCurrentLevel(-1);

    if (nextChannel.id === "nexo-positiva-twitch") {
      setPlaying(false); setBuffering(false); setStreamLoading(false); return;
    }
    if (nextChannel.type === "youtube") {
      setPlaying(true);
      setBuffering(false);
      setSelectedVideoId(null);
      setSidebarOpen(false);
    } else {
      if (isPlayerOtt()) {
        const session = playbackSessionRef.current;
        const deadline = performance.now() + 15000;
        const start = () => {
          if (session !== playbackSessionRef.current) return;
          const media = nextChannel.type === "audio_live" || nextChannel.type === "audio" ? audioRef.current : videoRef.current;
          if (!media) { if (performance.now() < deadline) setTimeout(start, 100); return; }
          tvAudioAdoptedRef.current = false;
          void playStream(nextChannel.url, nextChannel.type, true, true);
        };
        setTimeout(start, 120);
      } else void playStream(nextChannel.url, nextChannel.type, false, true);
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

  const setPlayerMuted = useCallback((newMuted: boolean) => {
    mutedRef.current = newMuted;
    if (!newMuted) autoplayMutedRef.current = false;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted || (tvAudioWarmRef.current?.audio===false && tvAudioWarmRef.current.phase==="warming");
    if (audioRef.current) audioRef.current.muted = newMuted || tvAudioWarmRef.current?.phase==="warming";
    try { localStorage.setItem("player:lastMuted", newMuted ? "1" : "0"); } catch {}
  }, []);

  const toggleMute = useCallback(() => {
    setPlayerMuted(!mutedRef.current);
  }, [setPlayerMuted]);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    volumeRef.current = val;
    try { localStorage.setItem("player:lastVolume", String(val)); } catch {}
    const v = val / 100;
    const newMuted = val === 0;
    mutedRef.current = newMuted;
    if (val > 0) autoplayMutedRef.current = false;
    if (videoRef.current && tvAudioWarmRef.current?.audio!==false) { videoRef.current.volume = v; videoRef.current.muted = newMuted; }
    if (audioRef.current && !tvAudioWarmRef.current) { audioRef.current.volume = isPlayerOtt() ? tvRadioVolume(v) : v; audioRef.current.muted = newMuted; }
    setMuted(newMuted);
    try { localStorage.setItem("player:lastMuted", newMuted ? "1" : "0"); } catch {}
  }, []);

  // Keep media elements in sync with muted/volume state
  useEffect(() => {
    if (videoRef.current && tvAudioWarmRef.current?.audio!==false) { videoRef.current.muted = muted; videoRef.current.volume = volume / 100; }
    if (audioRef.current && !tvAudioWarmRef.current) { audioRef.current.muted = muted; audioRef.current.volume = isPlayerOtt() ? tvRadioVolume(volume / 100) : volume / 100; }
  }, [muted, volume]);

  // Safety net for live audio: autoplay retries and DJ/fade effects can leave
  // the element playing with volume 0. Restore the intended volume on media
  // readiness/playback events without forcing mute state on video channels.
  useEffect(() => {
    if (!isAudio) return;
    const audio = audioRef.current;
    if (!audio) return;

    const restoreAudibleVolume = () => {
      if(tvAudioWarmRef.current){if(tvAudioWarmRef.current.phase==="warming"&&!audio.muted)audio.muted=true;return;}
      const target = isPlayerOtt() ? tvRadioVolume(volumeRef.current / 100) : Math.max(0, Math.min(1, volumeRef.current / 100));
      const shouldMute = mutedRef.current || target <= 0;
      try { audio.muted = shouldMute; } catch {}
      if (!shouldMute && audio.volume < Math.max(0.05, target * 0.5)) {
        try { audio.volume = target; } catch {}
      }
    };

    restoreAudibleVolume();
    audio.addEventListener("play", restoreAudibleVolume);
    audio.addEventListener("playing", restoreAudibleVolume);
    audio.addEventListener("canplay", restoreAudibleVolume);
    audio.addEventListener("volumechange", restoreAudibleVolume);
    return () => {
      audio.removeEventListener("play", restoreAudibleVolume);
      audio.removeEventListener("playing", restoreAudibleVolume);
      audio.removeEventListener("canplay", restoreAudibleVolume);
      audio.removeEventListener("volumechange", restoreAudibleVolume);
    };
  }, [canal?.id, isAudio]);

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
      if (e.key === "ChannelUp" || e.keyCode === 166) { e.preventDefault(); navigateChannel(-1); }
      else if (e.key === "ChannelDown" || e.keyCode === 167) { e.preventDefault(); navigateChannel(1); }
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

  // Drain the Top 10 queue with a readiness gate: keep a black hold overlay
  // visible until the new YouTube iframe reports a real duration (>0), which
  // means the media is loaded and ready to start. This prevents cutting from
  // one clip to a blank/unbuffered next clip.
  const drainTop10QueueWithGate = useCallback(() => {
    const nextQueued = top10QueueRef.current.shift() || top10PendingNextRef.current;
    if (!nextQueued) return;
    top10PendingNextRef.current = null;
    awaitingNextClipReadyRef.current = nextQueued;
    setTransitionHold(true);
    // Reset duration ref so the gate only lifts when fresh metadata arrives
    ytDurationRef.current = 0;
    ytCurrentTimeRef.current = 0;
    handleSelectVideo(nextQueued);
    // Safety: never hold the gate for more than 6s
    setTimeout(() => {
      if (awaitingNextClipReadyRef.current === nextQueued) {
        awaitingNextClipReadyRef.current = null;
        setTransitionHold(false);
      }
    }, 6000);
  }, [handleSelectVideo]);

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

  // Ref for auto-advance (avoids declaration order issue with ytNextVideo)
  const ytNextVideoRef = useRef<() => void>(() => {});

  // Track latest currentTime/duration in refs so the message handler can
  // validate the natural end of a clip without re-binding on every tick.
  const ytCurrentTimeRef = useRef(0);
  const ytDurationRef = useRef(0);
  useEffect(() => { ytCurrentTimeRef.current = ytCurrentTime; }, [ytCurrentTime]);
  useEffect(() => { ytDurationRef.current = ytDuration; }, [ytDuration]);

  // Listen for YouTube player state messages to track currentTime/duration
  useEffect(() => {
    if (!isYoutube || !selectedVideoId) { setYtCurrentTime(0); setYtDuration(0); return; }
    const onMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.event === "infoDelivery" && data?.info) {
          if (typeof data.info.currentTime === "number") setYtCurrentTime(data.info.currentTime);
          if (typeof data.info.duration === "number") setYtDuration(data.info.duration);
          // Readiness gate: if we are awaiting the next clip's media to load,
          // lift the hold overlay only when a real duration (>0) is reported.
          const reportedDuration = typeof data.info.duration === "number" ? data.info.duration : 0;
          if (awaitingNextClipReadyRef.current && reportedDuration > 0) {
            awaitingNextClipReadyRef.current = null;
            setTransitionHold(false);
          }
          // playerState 0 = ENDED — but YouTube sometimes fires it spuriously
          // (e.g. while the source is still loading or during quality switch),
          // which would skip clips at ~7 s. Validate against current/duration.
          if (typeof data.info.playerState === "number" && data.info.playerState === 0) {
            const dur = ytDurationRef.current;
            const cur = ytCurrentTimeRef.current;
            const reachedEnd = dur > 0 && cur > 0 && cur >= dur - 1.5;

            if (!reachedEnd) {
              // Spurious ENDED — ask YouTube for fresh metadata and ignore.
              console.log("[player] ignoring spurious ENDED", { cur, dur });
              ytPostMessage("getDuration");
              ytPostMessage("getCurrentTime");
              return;
            }

            if (isTop10Mode) {
              // Top 10: advance only after the real natural end of the clip.
              top10FadeTriggeredRef.current = true;
              top10AdvanceRef.current?.();
            } else {
              ytNextVideoRef.current();
            }
          }
        }
        // When iframe is ready, start listening and force HD quality
        if (data?.event === "onReady" || data?.event === "initialDelivery") {
          ytPostMessage("addEventListener", ["onStateChange"]);
          ytPostMessage("setPlaybackQuality", ["hd1080"]);
          ytPostMessage("setPlaybackQualityRange", [{ min: "hd1080", max: "highres" }]);
          // Prime duration so the ENDED guard above has something to compare to.
          ytPostMessage("getDuration");
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

  // Keep ref in sync for auto-advance
  useEffect(() => { ytNextVideoRef.current = ytNextVideo; }, [ytNextVideo]);

  const ytTogglePlay = useCallback(() => {
    if (ytPlaying) { ytPostMessage("pauseVideo"); setYtPlaying(false); }
    else { ytPostMessage("playVideo"); setYtPlaying(true); }
  }, [ytPlaying, ytPostMessage]);

  const showVolume = () => { clearTimeout(volumeHideTimeout.current); setVolumeHover(true); };
  const hideVolume = () => { volumeHideTimeout.current = setTimeout(() => setVolumeHover(false), 600); };




  const showBar = () => { clearTimeout(hideTimeout.current); setBarVisible(true); resetTopBarTimer(); };
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
        if (media && media.paused && playing && !tvAdsBlockedRef.current) {
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
  useLayoutEffect(() => {
    // A Home pode estar tocando a radio; OttAudioHost assume a MESMA conexao.
    destroyMiniAudio();
    return () => {
      playbackSessionRef.current++;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
      if (audioRef.current && audioRef.current !== getTvAudioMedia()) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    };
  }, []);

  // Periodic clock tick to re-compute currentProg every 30s
  const [musicTick, setMusicTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClock(c => c + 1), 30000);
    return () => clearInterval(interval);
  }, []);
  // Fast tick for music progress bar (every 1s) — always tick when musicData has duration
  useEffect(() => {
    if (isYoutube) return;
    if (!playing && !(musicData && musicData.duracao > 0)) return;
    if (isPlayerOtt()) return;
    const interval = setInterval(() => setMusicTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [playing, isYoutube, musicData?.duracao]);

  // Filter programs by the current channel's estudio (if set)
  const filteredProgramas = useMemo(() => {
    if (!canal?.estudio) return programas;
    const filtered = programas.filter(p => p.estudio === canal.estudio);
    return filtered.length > 0 ? filtered : programas;
  }, [programas, canal?.estudio]);

  const currentProg = getCurrentProgram(filteredProgramas);
  useLayoutEffect(()=>{
    if(!tvAdsBlocked)return;
    stopAllPlayback();tvAudioAdoptedRef.current=false;
  },[tvAdsBlocked,canal?.id,stopAllPlayback]);
  useEffect(()=>{
    if(tvCommercial.run?.kind!=="preroll")return;
    setPrerollDone(true);setPrerollShowing(false);setPrerollUrl(null);setPrerollYoutubeUrl(null);
  },[tvCommercial.run?.kind]);

  // Warm the existing live element: audio 10s, video 15s, while the spot plays.
  useEffect(()=>{
    const el=videoRef.current;
    if(!el||isAudio||tvCommercial.run?.kind!=="preroll")return;
    const enforce=()=>{const warm=tvAudioWarmRef.current;if(warm?.audio===false&&warm.phase==="warming"){if(!el.muted)el.muted=true;}};
    el.addEventListener("volumechange",enforce);
    return()=>el.removeEventListener("volumechange",enforce);
  },[isAudio,canal?.id,tvCommercial.run?.kind]);
  const warmCommercialStream = useCallback(() => {
    const el=isAudio?audioRef.current:videoRef.current;
    if(tvCommercial.run?.kind!=="preroll" || !canal?.url || !el || tvAudioWarmRef.current)return;
    tvAudioWarmRef.current={channel:canal.id,audio:isAudio,phase:"warming",session:0};
    el.muted=true;el.volume=0;
    tvUserPausedRef.current=false;
    autoPlayedRef.current=true;
    void playStream(canal.url,canal.type,true,false,true).catch(()=>{});
  },[isAudio,tvCommercial.run?.kind,canal?.id,canal?.url,canal?.type,playStream]);
  useLayoutEffect(()=>{
    const warm=tvAudioWarmRef.current;
    if(!warm)return;
    if(warm.audio!==isAudio||warm.channel!==canal?.id|| (tvAdsBlocked&&tvCommercial.run?.kind!=="preroll")){
      stopAllPlayback();autoPlayedRef.current=false;return;
    }
    if(tvAdsBlocked||warm.phase!=="warming")return;
    const el=warm.audio?audioRef.current:videoRef.current;
    if(!el||el.error||warm.session!==playbackSessionRef.current){stopAllPlayback();autoPlayedRef.current=false;return;}
    warm.phase="fading";
    el.volume=0;el.muted=mutedRef.current||volumeRef.current===0;
    let start:number|null=null;
    const deadline=performance.now()+12000;
    const step=(now:number)=>{
      if(tvAudioWarmRef.current!==warm||playbackSessionRef.current!==warm.session)return;
      if(tvUserPausedRef.current){tvAudioWarmRef.current=null;el.volume=warm.audio?tvRadioVolume(volumeRef.current/100):volumeRef.current/100;return;}
      if(el.error || (!warm.audio && tvVideoFatalRef.current===warm.session) || (start===null&&now>deadline) || (!warm.audio && now>deadline+1500)){autoPlayedRef.current=false;stopAllPlayback();return;}
      if(el.paused||el.readyState<2){warm.frame=requestAnimationFrame(step);return;}
      if(start===null)start=now;
      const t=Math.min(1,(now-start)/1500);
      el.muted=mutedRef.current||volumeRef.current===0;
      el.volume=(warm.audio?tvRadioVolume(volumeRef.current/100):volumeRef.current/100)*t;
      if(t<1)warm.frame=requestAnimationFrame(step);else{tvAudioWarmRef.current=null;setPlaying(true);setBuffering(false);}
    };
    warm.frame=requestAnimationFrame(step);
  },[tvAdsBlocked,tvCommercial.run?.kind,canal?.id,isAudio,stopAllPlayback]);
  useEffect(()=>()=>{const warm=tvAudioWarmRef.current;if(warm?.frame)cancelAnimationFrame(warm.frame);tvAudioWarmRef.current=null;},[]);

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
    if (!isYoutube || ytDuration < 60 || isTop10Mode) return []; // skip for very short videos and Top 10 playlist
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
    // Reset Top 10 fade state for new clip
    top10FadeTriggeredRef.current = false;
    top10AdvanceStartedRef.current = false;
    if (isTop10Mode) {
      setTop10Fading("in"); // Fade-in new clip over 1.5s
      setTimeout(() => setTop10Fading(null), 1600);
    }
  }, [selectedVideoId]);

  // Top 10: build inter-clip advance routine (mid-roll between songs, with black-fade fallback)
  const runTop10InterClip = useCallback(() => {
    if (top10AdvanceStartedRef.current) return;
    top10AdvanceStartedRef.current = true;
    ytPostMessage("pauseVideo");
    const idx = youtubeVideos.findIndex(v => v.videoId === selectedVideoId);
    const next = idx < youtubeVideos.length - 1 ? idx + 1 : 0;
    const nextId = youtubeVideos[next]?.videoId;
    if (!nextId) return;
    // Enqueue the next clip — it will be played AFTER the mid-roll/black fade ends.
    top10PendingNextRef.current = nextId;
    top10QueueRef.current = [nextId];

    const advanceFallback = () => {
      // Brief black fade between songs when no preroll campaign is configured
      setTop10InterPreroll(true);
      setPrerollUrl(null);
      setPrerollMediaType("video");
      setTop10Fading("out");
      setTimeout(() => {
        setTop10InterPreroll(false);
        setTop10Fading(null);
        drainTop10QueueWithGate();
      }, 1200);
    };

    (async () => {
      try {
        const ownerId = top10OwnerUserId || effectiveUserId;
        const validSlug = userSlug && !userSlug.startsWith(":") ? userSlug : null;
        if (ownerId || (isPublicMode && validSlug)) {
          const now = new Date();
          const ct = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const { data } = isPublicMode && validSlug
            ? await playerSupabase.functions.invoke("public-player-data", { body: { slug: validSlug, section: "active_midrolls" } })
            : await playerSupabase.from("comercial_preroll").select("*").eq("user_id", ownerId).eq("active", true).lte("horario_inicio", ct).gte("horario_fim", ct).order("priority", { ascending: true });
          const campaigns = isPublicMode && validSlug ? (data?.prerolls || []) : data;
          if (campaigns && campaigns.length > 0) {
            const pool = filterCampaignsByType(campaigns, now, true);
            if (pool.length > 0) {
              const selected = pool[Math.floor(Math.random() * pool.length)];
              setPrerollUrl(selected.video_url);
              setPrerollLinkUrl((selected as any).link_url || null);
              setPrerollMediaType((selected as any).media_type || "video");
              setPrerollYoutubeUrl((selected as any).youtube_url || null);
              setPrerollBackgroundUrl((selected as any).background_url || null);
              setPrerollAspectRatio((selected as any).aspect_ratio || "16:9");
              setPrerollVideoPosition((selected as any).video_position || "center");
              setTop10InterPreroll(true);
              setPrerollShowing(true);
              // The queued clip will play in onEnded/onSkip below.
              return;
            }
          }
        }
      } catch (e) {
        console.warn("[top10] preroll fetch failed", e);
      }
      advanceFallback();
    })();
  }, [ytPostMessage, youtubeVideos, selectedVideoId, top10OwnerUserId, effectiveUserId, isPublicMode, userSlug, drainTop10QueueWithGate]);

  // Keep ref in sync so playerState=0 fallback can call latest advance
  useEffect(() => { top10AdvanceRef.current = runTop10InterClip; }, [runTop10InterClip]);

  // Top 10: do not cut songs early; only fade during the natural ended event.
  useEffect(() => {
    if (!isTop10Mode || !isYoutube || !selectedVideoId || ytDuration < 1) return;
    if (top10FadeTriggeredRef.current) return;
    const timeRemaining = ytDuration - ytCurrentTime;
    if (timeRemaining <= 0.6 && timeRemaining >= 0) {
      top10FadeTriggeredRef.current = true;
      setTop10Fading("out");
      ytPostMessage("setVolume", [0]);
    }
  }, [ytCurrentTime, ytDuration, isTop10Mode, isYoutube, selectedVideoId, ytPostMessage]);

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
        // Fast fade-out (~500ms) — black overlay also fades in via midrollFading
        setMidrollFading("out");
        ytPostMessage("setVolume", [30]);
        setTimeout(() => ytPostMessage("setVolume", [0]), 250);
        setTimeout(() => {
          ytPostMessage("pauseVideo");
          setMidrollActive(true);
          // Keep fading="out" so the black overlay stays opaque until the ad mounts
          // Fetch mid-rolls to show (prefer is_midroll=true, up to 3)
          (async () => {
            if (!user) return;
            const now = new Date();
            const ct = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            const { data } = await playerSupabase.from("comercial_preroll").select("*").eq("user_id", user.id).eq("active", true).lte("horario_inicio", ct).gte("horario_fim", ct).order("priority", { ascending: true });
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
                // Clear fading state once the ad is mounted
                setTimeout(() => setMidrollFading(null), 50);
                return;
              }
            }
            // No preroll found, resume immediately
            setMidrollActive(false);
            setMidrollFading(null);
            ytPostMessage("setVolume", [volume]);
            ytPostMessage("playVideo");
          })();
        }, 550);
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
    // All ads done — resume video FROM exact resume time
    const resumeAt = Math.max(1, midrollResumeTime);
    setMidrollPreroll(null);
    setMidrollQueue([]);
    setMidrollIndex(0);
    setMidrollTotal(0);
    // Pre-seek with mute, allow YT to buffer the correct position before unhiding
    ytPostMessage("setVolume", [0]);
    ytPostMessage("seekTo", [resumeAt, true]);
    ytPostMessage("playVideo");
    // Re-seek after a short delay to defeat the YT "restart from 0" race
    setTimeout(() => {
      ytPostMessage("seekTo", [resumeAt, true]);
      ytPostMessage("playVideo");
    }, 350);
    // Only remove the black overlay AFTER the video is actually playing the right frame
    setTimeout(() => {
      setMidrollActive(false);
      setMidrollFading("in");
    }, 500);
    // Fade-in volume (~1s)
    setTimeout(() => ytPostMessage("setVolume", [Math.round(volume * 0.4)]), 700);
    setTimeout(() => ytPostMessage("setVolume", [Math.round(volume * 0.7)]), 1100);
    setTimeout(() => {
      ytPostMessage("setVolume", [volume]);
      setMidrollFading(null);
    }, 1500);
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
  const userDisplayName = tvProfile?.name || profileName || user?.email?.split("@")[0] || "Visitante";

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

  // NEXO_LOADING_UNICO_V1: nenhum splash de tela inteira entre Home e Ouvir/Assistir.
  const tvConnectionView = (
    <OttFrame className="ott-media-connecting">
      <div className="ott-media-connecting-content" role="status">
        <span>CONEXÃO AO VIVO</span>
        <h1>Conectando à rádio</h1>
        <p>A tela do player será aberta assim que os canais estiverem disponíveis.</p>
        <button type="button" onClick={handleHomeClick}>Voltar à Home</button>
      </div>
    </OttFrame>
  );
  if (loading) return isPlayerOtt() ? tvConnectionView : <PlayerSyncLoader />;
  if (isPlayerOtt() && !canal && !isTop10Mode) {
    return <OttFrame className="ott-media-connecting">
      <div className="ott-media-connecting-content" role="alert">
        <h1>Canal indisponível</h1>
        <p>Não foi possível carregar este canal.</p>
        <button type="button" onClick={()=>{publicBootstrapRef.current={slug:null,loaded:false};setLoading(true);setBootstrapRetry(v=>v+1)}}>Tentar novamente</button>
        <button type="button" onClick={handleHomeClick}>Voltar à Home</button>
      </div>
    </OttFrame>;
  }


  // ===== New Apple-TV player screen (for audio and video channels) =====
  if (canal && (isAudio || isVideo) && (!isYoutube || isCatalog)) {
    return (
      <Suspense fallback={isPlayerOtt() ? tvConnectionView : <PlayerSyncLoader />}>
        <div className="relative min-h-screen" style={tvPrerollGate ? {backgroundColor:"#000"} : undefined}>
        <div aria-hidden={tvPrerollGate || undefined} ref={node=>{node?.toggleAttribute("inert",tvPrerollGate);}} style={tvPrerollGate ? {visibility:"hidden",pointerEvents:"none"} : undefined}>
        <AudioPlayerScreen
          audioRef={audioRef}
          onTvAudioAdopt={handleTvAudioAdopt}
          tvPlaybackBlocked={tvPlaybackBlocked}
          tvUserPaused={tvUserPausedRef.current}
          tvStreamRequested={streamRequested && prerollDone && !tvAdsBlocked}
          commercialPlayback={tvAdsBlocked}
          videoRef={videoRef}
          canal={canal}
          canais={canais}
          liveChannels={liveChannels}
          navigateChannel={navigateChannel}
          programas={programas}
          currentProg={currentProg}
          nextProg={nextProg}
          apresentadores={apresentadores}
          musicData={musicData}
          playing={playing}
          muted={muted}
          volume={volume}
          buffering={buffering}
          onTogglePlay={handlePlayCanal}
          onSetMuted={setPlayerMuted}
          onSetVolume={handleVolumeChange}
          liked={liked}
          onToggleLike={toggleLike}
          chatOpen={chatOpen}
          setChatOpen={setChatOpen}
          gradeOpen={gradeOpen}
          setGradeOpen={setGradeOpen}
          karaokeEnabled={karaokeEnabled}
          setKaraokeEnabled={setKaraokeEnabled}
          watchProfileOpen={watchProfileOpen}
          setWatchProfileOpen={setWatchProfileOpen}
          empresaLogo={empresaLogo}
          empresaNome={empresaNome}
          user={user}
          profileAvatar={tvProfile ? tvProfile.avatar : profileAvatar}
          userDisplayName={userDisplayName}
          userEmail={user?.email ?? null}
          effectiveUserId={effectiveUserId}
          isPublicMode={isPublicMode}
          userSlug={userSlug}
          onBackHome={handleHomeClick}
          onEditProfile={handleEditProfile}
          onSwitchProfile={handleSwitchProfile}
          radioUserId={profileRadioUserId}
          onAvatarChange={(url) => { setProfileAvatar(url); emitProfileChanged({ userId: user?.id ?? null, radioUserId: profileRadioUserId, avatar_url: url, reason: "avatar" }); }}
          isVideoChannel={isVideo}
          isCatalog={isCatalog}
        />
        </div>
        {tvPrerollGate && !tvCommercial.run && <div role="status" aria-label="Preparando reprodução" style={{position:"fixed",inset:0,background:"#000",zIndex:99,display:"grid",placeItems:"center"}}><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" /></div>}
        {tvCommercial.run && <TvCommercialPlayback key={`${tvCommercial.run.key}:${tvCommercial.run.kind}:${tvCommercial.run.serial}`} run={tvCommercial.run} audio={adsEntryAudio} onStarted={tvCommercial.started} muted={muted} volume={volume} onFinish={tvCommercial.finish} onBack={handleHomeClick} onWarmStream={warmCommercialStream} commercialPhone={commercialPhone} breakDuration={tvTrack?.duracao} breakStartedAt={tvTrack?.startedAt}/>}
        {isPrerollVisible && !tvAdsBlocked && (
          <div className="fixed inset-0 z-[100] bg-black">
            <PreRollOverlay
              prerollUrl={prerollUrl || ""}
              prerollVideoRef={prerollVideoRef}
              prerollLinkUrl={prerollLinkUrl}
              prerollMediaType={prerollMediaType}
              prerollYoutubeUrl={prerollYoutubeUrl}
              prerollBackgroundUrl={prerollBackgroundUrl}
              prerollAspectRatio={prerollAspectRatio}
              prerollVideoPosition={prerollVideoPosition}
              onSkip={() => {
                setPrerollDone(true);
                setPrerollShowing(false);
                setPrerollUrl(null);
                setPrerollLinkUrl(null);
                setPrerollMediaType("video");
                setPrerollYoutubeUrl(null);
                setPrerollBackgroundUrl(null);
                setPrerollAspectRatio("16:9");
                setPrerollVideoPosition("center");
              }}
              onEnded={() => {
                setPrerollDone(true);
                setPrerollShowing(false);
                setPrerollUrl(null);
                setPrerollLinkUrl(null);
                setPrerollMediaType("video");
                setPrerollYoutubeUrl(null);
                setPrerollBackgroundUrl(null);
                setPrerollAspectRatio("16:9");
                setPrerollVideoPosition("center");
              }}
              fullscreen
            />
          </div>
        )}
        </div>
      </Suspense>
    );
  }

  return (
    <div ref={containerRef} className={`relative h-screen w-screen bg-black overflow-hidden select-none cursor-default nexo-player-container ${pageFadeOut ? 'opacity-0 scale-95 transition-all duration-700' : 'opacity-100 scale-100'}`}>
      {!isPlayerOtt() && <PlayerLoadingOverlay
        isLoading={loading || streamLoading}
        minDurationMs={3000}
      />}

      {/* Dynamic background: gradient from user colors for audio, thumb for video/catalog */}
      {(() => {
        const bgThumb = currentProg?.thumb || currentProg?.capa;
        // Audio channels always use gradient background (no thumb)
        if (isAudio) {
          const c1 = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-color1").trim() || "hsl(var(--player-accent))";
          const c2 = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-color2").trim() || "#000000";
          const gType = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-type").trim() || "radial";
          const gPos = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-position").trim() || "bottom";
          const gAngle = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-angle").trim() || "135";
          const gMid = getComputedStyle(document.documentElement).getPropertyValue("--player-audio-gradient-midpoint").trim() || "62";
          const posMap: Record<string, string> = { "top-left": "at top left", "top": "at top center", "top-right": "at top right", "left": "at center left", "center": "at center", "right": "at center right", "bottom-left": "at bottom left", "bottom": "at bottom center", "bottom-right": "at bottom right" };
          const bg = gType === "linear"
            ? `linear-gradient(${gAngle}deg, ${c1} 0%, ${c2} ${gMid}%)`
            : `radial-gradient(ellipse ${posMap[gPos] || "at bottom center"}, ${c1} 0%, ${c2} ${gMid}%)`;
          return (
            <>
              {/* Artist background image from Deezer — crossfade */}
              {prevArtistBgUrl && prevArtistBgUrl !== artistBgUrl && (
                <img
                   src={prevArtistBgUrl}
                   alt=""
                   className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                   style={{ opacity: artistBgReady ? 0 : 0.55, zIndex: 0, transition: "opacity 1.2s ease-in-out" }}
                />
              )}
              {artistBgUrl && (
                <img
                   src={artistBgUrl}
                   alt=""
                   className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                   style={{ opacity: artistBgReady ? 0.55 : 0, zIndex: 0, transition: "opacity 1.2s ease-in-out" }}
                   onLoad={() => setArtistBgReady(true)}
                   onError={() => setArtistBgUrl(null)}
                />
              )}
              {/* Gradient overlay — stronger when artist image present for readability */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: artistBgUrl ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.6) 100%)" : bg, zIndex: 0, opacity: 1 }} />
              {/* Accent glow — top-right corner */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: 0, right: 0, width: "50%", height: "60%",
                  background: "radial-gradient(ellipse at 100% 0%, hsla(var(--player-accent) / 0.18), transparent 70%)",
                  zIndex: 0,
                }}
              />
            </>
          );
        }
        // Non-audio channels: use thumb if available
        if (bgThumb) {
          return (
            <>
              <img
                key={bgThumb}
                src={bgThumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-1000"
                style={{ opacity: 0.95, zIndex: 0 }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "hsla(var(--player-accent) / 0.25)", zIndex: 0, mixBlendMode: "multiply" }}
              />
            </>
          );
        }
        return (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(to bottom, #0a0a0a, #000)",
                zIndex: 0,
              }}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                top: 0, right: 0, width: "50%", height: "60%",
                background: "radial-gradient(ellipse at 100% 0%, hsla(var(--player-accent) / 0.18), transparent 70%)",
                zIndex: 0,
              }}
            />
          </>
        );
      })()}

      {/* Content wrapper with fade transition */}
      <div className={`transition-opacity duration-400 ease-in-out ${pageFadeOut ? "opacity-0" : "opacity-100"}`}>

      {/* Fallback overlay: shown when stream requested but not yet playing */}
      {(() => {
        const hasMedia = Boolean(audioRef.current?.src) || Boolean(videoRef.current?.src);
        const show = Boolean(canal) && !playing && !isYoutube && !isCatalog && (streamRequested || buffering || streamStalled || !hasMedia);
        if (!show) return null;
        const title = streamStalled ? "Reconectando canal..." : buffering ? "Conectando..." : "Toque para ouvir";
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 px-4">
            <div className="w-full max-w-sm rounded-3xl px-6 py-7 text-center backdrop-blur-2xl" style={{ backgroundColor: "rgba(8,8,8,0.55)", border: "1px solid hsla(var(--player-accent) / 0.22)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>
              {canal?.logo_url ? (
                <img src={canal.logo_url} alt={canal.name} className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl" />
              ) : (
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center text-2xl font-black text-white/90" style={{ background: "hsla(var(--player-accent) / 0.2)" }}>{canal?.numero_canal || "?"}</div>
              )}
              <h1 className="text-white text-xl font-semibold">{canal?.name || "Canal"}</h1>
              {canal?.numero_canal && <p className="text-white/55 text-xs mt-1">Canal {canal.numero_canal}</p>}
              <div className="mt-4 flex items-center justify-center gap-2 text-white/90">
                {(buffering || streamStalled) && <Loader2 className="animate-spin" size={18} />}
                <span className="text-sm font-medium">{title}</span>
              </div>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button onClick={handleHomeClick} className="px-4 py-2 rounded-full text-sm text-white/85 transition-opacity hover:opacity-100" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>Voltar</button>
                <button onClick={handlePlayCanal} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-transform hover:scale-[1.02]" style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}>
                  <Play size={16} fill="currentColor" /> {isAudio ? "Ouvir" : "Assistir"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          onSkip={() => {
            const wasTop10Inter = top10InterPreroll;
            setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollLinkUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); setPrerollBackgroundUrl(null); setPrerollAspectRatio("16:9"); setPrerollVideoPosition("center");
            setTop10InterPreroll(false);
            if (wasTop10Inter) {
              setTop10Fading(null);
              drainTop10QueueWithGate();
            }
          }}
          onEnded={() => {
            const wasTop10Inter = top10InterPreroll;
            setPrerollDone(true); setPrerollShowing(false); setPrerollUrl(null); setPrerollMediaType("video"); setPrerollYoutubeUrl(null); setPrerollBackgroundUrl(null); setPrerollAspectRatio("16:9"); setPrerollVideoPosition("center");
            setTop10InterPreroll(false);
            if (wasTop10Inter) {
              setTop10Fading(null);
              drainTop10QueueWithGate();
            }
          }}
        />
      )}

      {/* Readiness gate hold: black overlay shown while the next clip's iframe
          is still loading. Lifted automatically when YouTube reports duration > 0
          (or after a 6s safety timeout). */}
      {transitionHold && (
        <div
          className="absolute inset-0 z-[60] pointer-events-none"
          style={{ backgroundColor: "#000", opacity: 1, transition: "opacity 300ms ease" }}
        />
      )}

      {/* Mid-Roll Black Backdrop — fades in BEFORE the ad mounts so the program bg never bleeds through */}
      {(midrollFading || midrollActive) && (
        <div
          className="absolute inset-0 z-[55] pointer-events-none"
          style={{
            backgroundColor: "#000",
            opacity: midrollFading === "out" || midrollActive ? 1 : 0,
            transition: "opacity 0.4s ease-out",
          }}
        />
      )}

      {/* Mid-Roll Overlay — fullscreen centered */}
      {midrollActive && midrollPreroll && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center animate-fade-in" style={{ backgroundColor: "#000" }}>
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
            fullscreen
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
              transition: midrollFading || midrollActive
                ? "opacity 0.4s ease-out"
                : top10Fading === "in" ? "opacity 1.5s ease-in" : top10Fading === "out" ? "opacity 3s ease-out" : "opacity 2s ease-in-out",
              opacity: midrollFading === "out" || midrollActive || top10Fading === "out" ? 0 : 1,
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
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-contain bg-black ${isAudio || (isYoutube && !isCatalog) ? "hidden" : ""}`} muted={muted} playsInline autoPlay={false} src={isCatalog && requestedVideoId ? `https://www.youtube.com/embed/${requestedVideoId}` : undefined} />
      <audio ref={audioRef} muted={!isAudio || muted} preload="auto" />

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


      {/* Buffering overlay — hidden for catalog channels */}
      {streamStalled && playing && !isCatalog && !streamLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/60 gap-4">
          <ElegantLoader size={56} />
          <span className="text-white text-sm font-bold tracking-wide uppercase animate-pulse">Sintonizando canal...</span>
        </div>
      )}


      {/* Floating presenter photo — centered on screen for audio channels only */}
      {isAudio && playing && (
        <div className={`absolute inset-0 z-[2] flex items-center pointer-events-none transition-all duration-700 ease-out ${artistBgUrl ? "justify-start pl-[5%]" : "justify-center"}`}>
          <div className="relative flex items-center justify-center">
            {/* Vinyl disc — half visible behind presenter on the right */}
            {musicData?.titulo && musicData.titulo !== "Sem título" && !isBreakTrack && (
              <div
                key={`vinyl-${musicAnimKey}`}
                className="absolute"
                style={{
                  width: "min(380px, 30vw)",
                  height: "min(380px, 30vw)",
                  left: "calc(50% + 5%)",
                  animation: "vinylReveal 1.2s ease-in-out",
                  zIndex: 0,
                }}
              >
                <div
                  className="w-full h-full rounded-full"
                  style={{ animation: "vinylSpin 4s linear infinite" }}
                >
                  <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, #1a1a1a 30%, #0d0d0d 60%, #222 61%, #0d0d0d 62%, #1a1a1a 80%, #111 100%)" }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {musicData?.capa ? (
                      <img src={musicData.capa} alt="" className="rounded-full object-cover" style={{ width: "40%", height: "40%", border: "3px solid #333" }} />
                    ) : (
                      <div className="rounded-full" style={{ width: "40%", height: "40%", border: "3px solid #333", background: "radial-gradient(circle, #333 0%, #1a1a1a 100%)" }} />
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full" style={{ background: "repeating-radial-gradient(circle, transparent 0px, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)" }} />
                  <div className="absolute rounded-full" style={{ width: "8%", height: "8%", top: "46%", left: "46%", background: "#000", border: "2px solid #333" }} />
                </div>
              </div>
            )}

            {/* Presenter photo card */}
            <div
              key={`cover-wrap-${musicAnimKey}`}
              className="relative rounded-3xl overflow-hidden"
              style={{
                animation: "playerCoverIn 0.5s ease-out",
                boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px hsla(var(--player-accent) / 0.2)`,
                border: "2px solid hsla(var(--player-accent) / 0.5)",
                background: "linear-gradient(135deg, hsl(var(--player-accent)), rgba(0,0,0,0.8))",
                padding: "8px",
                width: "min(380px, 30vw)",
                height: "min(380px, 30vw)",
                zIndex: 1,
              }}
            >
              {currentPresenter?.foto ? (
                <img
                  src={currentPresenter.foto}
                  alt={currentPresenter.nome || ""}
                  className="rounded-[20px] object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full rounded-[20px] flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                  <Mic size={48} style={{ color: "hsla(var(--player-accent) / 0.3)" }} />
                </div>
              )}
              {/* Presenter name top-left */}
              {currentPresenter?.nome && (
                <div className="absolute top-4 left-4 flex flex-col items-start gap-1" style={{ zIndex: 10 }}>
                  <div className="flex items-center gap-1.5 pointer-events-none">
                    <Mic size={14} className="text-white drop-shadow-lg" />
                    <span className="text-white text-xs font-semibold drop-shadow-lg">{currentPresenter.nome}</span>
                  </div>
                  {/* + button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setPresenterMenuOpen(v => !v); }}
                    className="pointer-events-auto w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      backgroundColor: presenterMenuOpen ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.15)",
                      backdropFilter: "blur(8px)",
                    }}
                    title="Mais opções"
                  >
                    <Plus size={14} className="text-white" style={{ transform: presenterMenuOpen ? "rotate(45deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {/* Submenu */}
                  {presenterMenuOpen && (
                    <div
                      className="mt-1 rounded-xl overflow-hidden animate-fade-in"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.85)",
                        backdropFilter: "blur(16px)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        minWidth: 180,
                      }}
                    >
                      {whatsappPhone && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`https://wa.me/${whatsappPhone.replace(/\D/g, "")}`, "_blank");
                            setPresenterMenuOpen(false);
                          }}
                          className="pointer-events-auto w-full flex items-center gap-2.5 px-3 py-2.5 text-white/90 hover:bg-white/10 transition-colors text-xs"
                        >
                          <Phone size={14} style={{ color: "hsl(var(--player-accent))" }} />
                          <span>Manda seu Zap</span>
                        </button>
                      )}
                      {currentPresenter.instagram && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const ig = currentPresenter.instagram!.replace("@", "");
                            window.open(`https://instagram.com/${ig}`, "_blank");
                            setPresenterMenuOpen(false);
                          }}
                          className="pointer-events-auto w-full flex items-center gap-2.5 px-3 py-2.5 text-white/90 hover:bg-white/10 transition-colors text-xs"
                        >
                          <Instagram size={14} style={{ color: "hsl(var(--player-accent))" }} />
                          <span>Siga {currentPresenter.nome}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChatOpen(true);
                          setPresenterMenuOpen(false);
                        }}
                        className="pointer-events-auto w-full flex items-center gap-2.5 px-3 py-2.5 text-white/90 hover:bg-white/10 transition-colors text-xs"
                      >
                        <MessageSquare size={14} style={{ color: "hsl(var(--player-accent))" }} />
                        <span>Fale aqui no Chat</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {empresaLogo && (
                <img
                  src={empresaLogo}
                  alt="Logo"
                  className="absolute top-3 right-3 object-contain rounded-lg drop-shadow-lg pointer-events-none"
                  style={{ width: 48, height: 48, zIndex: 5 }}
                />
              )}
              {/* Heart icon bottom-right */}
              {musicData?.titulo && musicData.titulo !== "Sem título" && (
                <div className="absolute bottom-5 right-5" style={{ zIndex: 5 }}>
                  {/* Floating hearts explosion */}
                  {floatingHearts.map((h) => (
                    <Heart
                      key={h.id}
                      size={12}
                      className="absolute pointer-events-none"
                      style={{
                        color: "hsl(var(--player-accent))",
                        fill: "hsl(var(--player-accent))",
                        animation: `heartFloat 0.8s ease-out ${h.delay}s forwards`,
                        left: `calc(50% + ${h.x}px)`,
                        bottom: 0,
                        opacity: 0,
                      }}
                    />
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(); }}
                    className="pointer-events-auto transition-all hover:scale-110"
                  >
                    <Heart
                      size={24}
                      className={`drop-shadow-lg ${likeAnimating ? "animate-ping" : ""}`}
                      style={{
                        color: liked ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.9)",
                        fill: liked ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.9)",
                        transition: "color 0.3s, fill 0.3s",
                      }}
                    />
                  </button>
                </div>
              )}
            {/* Music info bottom-left overlay */}
            {musicData?.titulo && musicData.titulo !== "Sem título" && (
              <div key={`music-overlay-${musicAnimKey}`} className="absolute bottom-6 left-6 right-6 pointer-events-none" style={{ zIndex: 5 }}>
                <span className="uppercase tracking-[0.25em] text-white/50 text-[9px] font-light block mb-0.5 leading-none" style={{ fontFamily: "'Poppins', sans-serif", animation: "playerFadeSlideIn 0.5s ease-out both" }}>♫ tocando agora</span>
                <span className="text-white text-sm sm:text-base font-bold leading-tight block truncate tracking-wide" style={{ fontFamily: "'Poppins', sans-serif", textShadow: "0 2px 12px rgba(0,0,0,0.4)", animation: "playerFadeSlideIn 0.5s ease-out 0.1s both" }}>{toTitleCase(musicData.titulo)}</span>
                <span className="text-white/70 text-[11px] sm:text-xs font-light block truncate leading-tight tracking-wider" style={{ fontFamily: "'Poppins', sans-serif", animation: "playerFadeSlideIn 0.5s ease-out 0.2s both" }}>{musicData.artista && musicData.artista !== "Desconhecido" ? toTitleCase(musicData.artista) : ""}</span>
              </div>
            )}
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
              background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)",
            }} />
           </div>
          </div>
        </div>
      )}

      {/* Top hover zone — triggers top bar visibility */}
      {(isCatalog || !isYoutube) && !isPrerollVisible && !midrollActive && playing && (
        <div
          className="absolute top-0 left-0 right-0 z-[51] h-14 pointer-events-auto"
          style={{ pointerEvents: topBarVisible ? "none" : "auto" }}
          onMouseEnter={() => { resetTopBarTimer(); showBar(); }}
        />
      )}

      {/* Top Header Bar — new layout: logo | channel nav | agora: program | right: a seguir */}
      {(isCatalog || !isYoutube) && !isPrerollVisible && !midrollActive && playing && (
        <div
          className="absolute top-0 left-0 right-0 z-50 flex items-center gap-4 px-4 sm:px-8 py-3 sm:py-4 transition-all duration-500 ease-in-out"
           style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
            opacity: topBarVisible ? 1 : 0,
            pointerEvents: topBarVisible ? "auto" : "none",
            transform: topBarVisible ? "translateY(0)" : "translateY(-100%)",
          }}
          onMouseEnter={() => { setTopBarVisible(true); if (topBarTimerRef.current) clearTimeout(topBarTimerRef.current); showBar(); }}
          onMouseLeave={() => { resetTopBarTimer(); hideBar(); }}
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

          {/* Channel number + nav arrows (hide for catalog) */}
          {!isCatalog && (
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
          )}

          {/* agora: program name + presenter */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-normal" style={{ color: "hsl(var(--player-accent))" }}>{isCatalog ? "assistindo:" : "agora:"}</span>
            <span key={`noar-${currentProg?.nome}-${channelAnimKey}`} className="text-xl sm:text-2xl font-black text-white leading-tight truncate" style={{ animation: "playerFadeSlideIn 0.4s ease-out" }}>
              {isCatalog ? (channelLabel || canal?.name || "—") : (currentProg?.nome || canal?.name || "—")}
            </span>
            {!isCatalog && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mic size={12} style={{ color: "hsl(var(--player-accent))" }} />
              <span className="text-xs sm:text-sm font-normal text-white/70 truncate">{currentPresenter?.nome || ""}</span>
            </div>
            )}
            {isCatalog && programLabel && (
              <span className="text-xs sm:text-sm font-normal text-white/60 truncate mt-0.5">{programLabel}</span>
            )}
          </div>

          {/* Right: a seguir (hide for catalog) */}
          {!isCatalog && nextProg && (
            <div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto">
              <div className="flex flex-col items-end min-w-0">
                <span className="text-xs font-medium" style={{ color: "hsl(var(--player-accent))" }}>a seguir:</span>
                <span className="text-sm sm:text-base font-bold text-white leading-tight truncate max-w-[200px]">{nextProg.nome}</span>
              </div>
              {nextPresenter?.foto ? (
                <img src={nextPresenter.foto} alt={nextPresenter.nome} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover" style={{ backgroundColor: "hsl(var(--player-accent) / 0.3)" }} />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000" }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
              )}
            </div>
          )}

          {/* User avatar — far right */}
          {user && (
            <div className={`shrink-0 relative ${!isCatalog && nextProg ? "" : "ml-auto"}`}>
              <button
                onClick={() => setWatchProfileOpen(v => !v)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden object-cover border-2 cursor-pointer transition-transform duration-200 hover:scale-110"
                style={{ borderColor: "hsla(var(--player-accent) / 0.5)" }}
              >
                <img
                  src={profileAvatar || "/avatars/usr-default.png"}
                  alt=""
                  className="w-full h-full object-contain"
                />
              </button>
              {watchProfileOpen && (
                <Suspense fallback={null}>
                  <WatchProfilePopup
                    userId={user.id}
                    userName={userDisplayName}
                    userEmail={user?.email ?? null}
                    avatarUrl={profileAvatar}
                    radioUserId={profileRadioUserId}
                    radioName={empresaNome || undefined}
                    onClose={() => setWatchProfileOpen(false)}
                    onEditProfile={handleEditProfile}
                    onSwitchProfile={handleSwitchProfile}
                    onAvatarChange={(url) => { setProfileAvatar(url); emitProfileChanged({ userId: user?.id ?? null, radioUserId: profileRadioUserId, avatar_url: url, reason: "avatar" }); }}
                    onLogout={async () => {
                      const dest = userSlug && !userSlug.startsWith(":") ? `/${userSlug}/player` : "/player";
                      await playerSignOut(dest);
                    }}

                  />
                </Suspense>
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

      {/* Grade Dialog — lazy loaded */}
      {gradeOpen && (
        <Suspense fallback={
          <div className="absolute inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
            <ElegantLoader size={40} />
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
      {(isCatalog || !isYoutube) && !isPrerollVisible && !midrollActive && playing && (
        <div className="absolute left-0 right-0 bottom-0 z-50" style={{ height: "110px" }} onMouseEnter={showBar} onMouseLeave={hideBar}>
          <div
            className="absolute left-0 right-0 bottom-0 px-5 sm:px-10 pb-5 pt-3 transition-all duration-400 ease-in-out"
            style={{ opacity: barVisible ? 1 : 0, transform: barVisible ? "translateY(0)" : "translateY(16px)", pointerEvents: barVisible ? "auto" : "none", background: `linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)` }}
          >
            {/* New layout: Play circle | Time | Scrubber | Time | Icon buttons */}
            <div className="flex items-center gap-3 sm:gap-5">
              {/* Back button — round, same size as play */}
              <button
                onClick={isCatalog ? () => {
                  setPageFadeOut(true);
                  const navState = (location.state ?? {}) as { fromPath?: string; fromCatalog?: string | null };
                  if (navState.fromPath) { setTimeout(() => navigate(navState.fromPath!), 300); return; }
                  const basePath = userSlug ? `/user/${userSlug}/nexohub/player` : "/user/nexohub/player";
                  const catalogName = navState.fromCatalog || canal?.catalog_name;
                  const catalogParam = catalogName ? `?catalog=${encodeURIComponent(catalogName)}` : "";
                  setTimeout(() => navigate(`${basePath}${catalogParam}`), 300);
                } : handleHomeClick}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 hover:border-2 hover:border-white/80"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
                title="Voltar"
              >
                <ChevronLeft size={22} />
              </button>

              {/* Previous track (Top 10 playlist) */}
              {isTop10Mode && youtubeVideos.length > 1 && (
                <button onClick={ytPrevVideo} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 hover:border-2 hover:border-white/80" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }} title="Clipe anterior">
                  <SkipBack size={16} />
                </button>
              )}

              {/* -10s (catalog only) */}
              {isCatalog && selectedVideoId && (
                <button onClick={() => ytPostMessage("seekTo", [Math.max(0, ytCurrentTime - 10), true])} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 hover:border-2 hover:border-white/80" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }} title="Retroceder 10s">
                  <span className="text-[10px] font-bold">-10</span>
                </button>
              )}

              {/* Play/Pause — large accent circle */}
              <button
                onClick={isCatalog ? ytTogglePlay : handlePlayCanal}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105"
                style={{ backgroundColor: "hsl(var(--player-accent))", color: "#000", boxShadow: "0 0 20px hsla(var(--player-accent) / 0.4)" }}
                title={(isCatalog ? ytPlaying : playing) ? "Pausar" : "Reproduzir"}
              >
                {(isCatalog ? ytPlaying : playing) ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
              </button>

              {/* +10s (catalog only) */}
              {isCatalog && selectedVideoId && (
                <button onClick={() => ytPostMessage("seekTo", [Math.min(ytDuration, ytCurrentTime + 10), true])} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 hover:border-2 hover:border-white/80" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }} title="Avançar 10s">
                  <span className="text-[10px] font-bold">+10</span>
                </button>
              )}

              {/* Next track (Top 10 playlist) */}
              {isTop10Mode && youtubeVideos.length > 1 && (
                <button onClick={ytNextVideo} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 hover:border-2 hover:border-white/80" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }} title="Próximo clipe">
                  <SkipForward size={16} />
                </button>
              )}

              {/* Elapsed time + Scrubber + Total time */}
              {isCatalog ? (
                /* YouTube VOD scrubber with midroll markers */
                <div className="flex-1 min-w-0 flex items-center gap-2.5">
                  <span className="text-[11px] tabular-nums text-white/60 shrink-0 w-9 text-right">{fmtTime(ytCurrentTime)}</span>
                  <div className="flex-1 min-w-0 group cursor-pointer relative"
                    onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; ytPostMessage("seekTo", [pct * ytDuration, true]); }}
                    onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); const time = pct * ytDuration; const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement; if (tooltip) { tooltip.style.left = `${pct * 100}%`; tooltip.style.opacity = "1"; tooltip.textContent = fmtTime(time); } }}
                    onMouseLeave={(e) => { const tooltip = e.currentTarget.querySelector("[data-seek-tooltip]") as HTMLElement; if (tooltip) tooltip.style.opacity = "0"; }}
                  >
                    <div data-seek-tooltip className="absolute -top-6 text-[10px] font-bold text-white bg-black/90 px-1.5 py-0.5 rounded pointer-events-none -translate-x-1/2 opacity-0 transition-opacity z-10 whitespace-nowrap" />
                    <div className="w-full h-[4px] rounded-full overflow-visible group-hover:h-[7px] transition-all relative" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                      {/* Filled portion with animated shimmer */}
                      <div
                        className="h-full rounded-full transition-[width] duration-300 relative overflow-hidden"
                        style={{
                          width: `${ytProgressPct}%`,
                          background: `linear-gradient(90deg, hsl(var(--player-accent)) 0%, hsl(var(--player-accent) / 0.85) 100%)`,
                          boxShadow: `0 0 10px hsla(var(--player-accent) / 0.6), 0 0 4px hsla(var(--player-accent) / 0.8)`,
                        }}
                      >
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                            animation: "playerProgressShimmer 2s linear infinite",
                            backgroundSize: "200% 100%",
                          }}
                        />
                      </div>
                      {/* Drag handle dot at progress tip */}
                      <div
                        className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                        style={{
                          left: `${ytProgressPct}%`,
                          backgroundColor: "hsl(var(--player-accent))",
                          boxShadow: "0 0 8px hsla(var(--player-accent) / 0.9), 0 0 0 2px rgba(255,255,255,0.95)",
                        }}
                      />
                    </div>
                    {midrollBreakPoints.map((bp, i) => {
                      const passed = ytCurrentTime >= bp;
                      return (
                        <div
                          key={i}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                          style={{
                            left: `${(bp / ytDuration) * 100}%`,
                            width: passed ? "8px" : "10px",
                            height: passed ? "8px" : "10px",
                            backgroundColor: passed ? "rgba(255,255,255,0.5)" : "#facc15",
                            boxShadow: passed
                              ? "0 0 0 2px rgba(0,0,0,0.5)"
                              : "0 0 0 2px rgba(0,0,0,0.7), 0 0 8px rgba(250,204,21,0.8)",
                            animation: passed ? undefined : "playerMidrollPulse 1.8s ease-in-out infinite",
                          }}
                          title={`Intervalo comercial ${i + 1} — ${fmtTime(bp)}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] tabular-nums text-white/60 shrink-0 w-9">{fmtTime(ytDuration)}</span>
                </div>
              ) : (
              (() => {
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
                const fmtMusicTime = (s: number) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; };
                return (
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span className="text-[11px] tabular-nums text-white/60 shrink-0 w-9 text-right">{musicTotal > 0 ? fmtMusicTime(musicElapsed) : "0:00"}</span>
                    <div className="flex-1 min-w-0 group cursor-pointer">
                      <div className="w-full h-[3px] rounded-full overflow-hidden group-hover:h-[5px] transition-all" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${musicPct}%`, backgroundColor: "hsl(var(--player-accent))", boxShadow: `0 0 8px hsla(var(--player-accent) / 0.5)` }} />
                      </div>
                    </div>
                    <span className="text-[11px] tabular-nums text-white/60 shrink-0 w-9">{musicTotal > 0 ? fmtMusicTime(musicTotal) : "0:00"}</span>
                  </div>
                );
              })()
              )}

              {/* Icon buttons — white outlined style */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Volume */}
                <div className="relative" onMouseEnter={showVolume} onMouseLeave={hideVolume}>
                  <button
                    onClick={toggleMuteWithOsd}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 border-2 border-transparent hover:border-white/70"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
                    title={muted ? "Ativar som" : "Desativar som"}
                  >
                    {muted ? <VolumeX size={16} /> : volume < 50 ? <Volume1 size={16} /> : <Volume2 size={16} />}
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
                {!isCatalog && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setChatOpen((open) => !open);
                  }}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 border-2 hover:border-white/70"
                  style={{ backgroundColor: chatOpen ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.08)", color: chatOpen ? "#000" : "#fff", borderColor: chatOpen ? "hsl(var(--player-accent))" : "transparent" }}
                  title="Chat ao Vivo"
                >
                  <MessageSquare size={16} />
                </button>
                )}

                {/* Shop */}
                {shopActive && !isCatalog && (
                  <button
                    onClick={() => setShopOpen(!shopOpen)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 relative border-2 hover:border-white/70"
                    style={{ backgroundColor: shopOpen ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.08)", color: shopOpen ? "#000" : "#fff", borderColor: shopOpen ? "hsl(var(--player-accent))" : "transparent" }}
                    title="Shopping ao Vivo"
                  >
                    <ShoppingCart size={16} />
                    {showShopIcon && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white border-2" style={{ borderColor: "hsl(var(--player-accent))" }} />}
                  </button>
                )}

                {/* Karaoke */}
                {!isCatalog && (
                <button
                  onClick={() => setKaraokeEnabled(!karaokeEnabled)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 border-2 hover:border-white/70"
                  style={{ backgroundColor: karaokeEnabled ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.08)", color: karaokeEnabled ? "#000" : "#fff", borderColor: karaokeEnabled ? "hsl(var(--player-accent))" : "transparent" }}
                  title={karaokeEnabled ? "Desativar Karaokê" : "Karaokê"}
                >
                  <MicVocal size={16} />
                </button>
                )}

                {/* Playlist - últimas tocadas */}
                {!isCatalog && (
                <div className="relative" ref={playlistRef}>
                  <button
                    onClick={() => setPlaylistOpen(!playlistOpen)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 border-2 hover:border-white/70"
                    style={{ backgroundColor: playlistOpen ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.08)", color: playlistOpen ? "#000" : "#fff", borderColor: playlistOpen ? "hsl(var(--player-accent))" : "transparent" }}
                    title="Últimas tocadas"
                  >
                    <ListMusic size={16} />
                  </button>
                  {playlistOpen && (
                    <div
                      className="absolute bottom-full right-0 mb-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-white/10 shadow-2xl animate-fade-in"
                      style={{ background: "var(--player-watch-music-bg, rgba(0,0,0,0.85))", animationDuration: "0.2s" }}
                    >
                      <div className="sticky top-0 px-3 py-2 border-b border-white/10 flex items-center gap-2" style={{ background: "var(--player-watch-music-bg, rgba(0,0,0,0.85))" }}>
                        <ListMusic size={14} style={{ color: "hsl(var(--player-accent))" }} />
                        <span className="text-white/80 text-xs font-semibold">Últimas Tocadas</span>
                      </div>
                      {recentTracks.length === 0 ? (
                        <p className="text-white/40 text-xs text-center py-6">Nenhuma música registrada</p>
                      ) : (
                        <div className="py-1">
                          {recentTracks.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors">
                              <span className="text-white/30 text-[10px] tabular-nums w-7 text-right shrink-0">{t.horario?.slice(0, 5)}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-white/90 text-xs truncate">{t.musica}</p>
                                <p className="text-white/40 text-[10px] truncate">{t.artista}</p>
                                {t.programa && <p className="text-white/25 text-[8px] truncate">{t.programa}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}

                {/* PiP (catalog) */}
                {isCatalog && (
                  <button
                    onClick={() => { const v = videoRef.current || audioRef.current; if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); else if (v && "requestPictureInPicture" in v) (v as HTMLVideoElement).requestPictureInPicture().catch(() => {}); }}
                    className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-full items-center justify-center transition-all hover:scale-105 border-2 border-transparent hover:border-white/70"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
                    title="Picture-in-Picture"
                  >
                    <PictureInPicture size={16} />
                  </button>
                )}

                {/* Cast / Transmitir — only available for VIDEO channels, transmits media stream only */}
                {isVideo && (
                  <button
                    onClick={async () => {
                      const v = videoRef.current as any;
                      const a = audioRef.current as any;
                      const media = v || a;
                      const tag = media?.tagName?.toLowerCase();
                      const meta = {
                        isVideo,
                        isAudio: !!a && !v,
                        isCatalog,
                        mediaTag: tag,
                        hasMedia: !!media,
                        currentSrc: media?.currentSrc,
                        readyState: media?.readyState,
                        networkState: media?.networkState,
                        paused: media?.paused,
                        hasRemote: !!media?.remote,
                        remoteState: media?.remote?.state,
                        disableRemote: media?.disableRemotePlayback,
                        secure: window.isSecureContext,
                        ua: navigator.userAgent,
                      };
                      console.info("[cast] click", meta);

                      if (!media) {
                        console.warn("[cast] aborted: no media element");
                        toast.info("Inicie a reprodução antes de transmitir.");
                        return;
                      }
                      if (!media.currentSrc && !media.src) {
                        console.warn("[cast] aborted: no media source");
                        toast.info("Inicie a reprodução antes de transmitir.");
                        return;
                      }

                      // Ensure remote playback is enabled
                      try { media.disableRemotePlayback = false; } catch {}
                      media.removeAttribute?.("disableRemotePlayback");

                      // Wait for media readiness (HAVE_FUTURE_DATA = 3) — important for HLS/MSE
                      if (media.readyState < 3) {
                        console.info("[cast] media not ready, waiting for canplay…", { readyState: media.readyState });
                        try { media.play?.().catch(() => {}); } catch {}
                        await new Promise<void>((resolve) => {
                          let done = false;
                          const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
                          const cleanup = () => {
                            media.removeEventListener("canplay", finish);
                            media.removeEventListener("loadeddata", finish);
                            clearTimeout(timer);
                          };
                          const timer = setTimeout(() => {
                            console.warn("[cast] readiness wait timed out (3s) — proceeding anyway", { readyState: media.readyState });
                            finish();
                          }, 3000);
                          media.addEventListener("canplay", finish, { once: true });
                          media.addEventListener("loadeddata", finish, { once: true });
                        });
                        console.info("[cast] media now ready", { readyState: media.readyState });
                      }

                      // 1) Standard Remote Playback API (Chrome/Edge)
                      if (media.remote && typeof media.remote.prompt === "function") {
                        console.info("[cast] strategy=remote.prompt");
                        try {
                          await media.remote.prompt();
                          console.info("[cast] remote.prompt resolved");
                          return;
                        } catch (err: any) {
                          console.warn("[cast] remote.prompt failed", { name: err?.name, message: err?.message });
                          if (err?.name === "NotFoundError") {
                            toast.info("Nenhum dispositivo de transmissão encontrado nesta rede.");
                            return;
                          }
                          if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
                            return;
                          }
                          // fall through
                        }
                      } else {
                        console.warn("[cast] remote API unavailable on element");
                      }

                      // 2) Safari / AirPlay
                      if (typeof media.webkitShowPlaybackTargetPicker === "function") {
                        console.info("[cast] strategy=airplay");
                        try { media.webkitShowPlaybackTargetPicker(); return; } catch (e: any) { console.warn("[cast] airplay failed", { name: e?.name, message: e?.message }); }
                      }

                      // 3) Presentation API fallback (Chromecast via media URL)
                      try {
                        const PR = (window as any).PresentationRequest;
                        if (PR && media.currentSrc) {
                          console.info("[cast] strategy=presentation", { url: media.currentSrc });
                          const req = new PR([media.currentSrc]);
                          await req.start();
                          return;
                        }
                        console.warn("[cast] presentation unavailable", { hasPR: !!PR, hasSrc: !!media.currentSrc });
                      } catch (e: any) {
                        console.warn("[cast] presentation failed", { name: e?.name, message: e?.message });
                      }

                      console.error("[cast] all strategies exhausted");
                      toast.info("Transmissão indisponível. Verifique se há um dispositivo Chromecast na rede e use o Google Chrome.");
                    }}
                    className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-full items-center justify-center transition-all hover:scale-105 border-2 border-transparent hover:border-white/70"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
                    title="Transmitir mídia"
                  >
                    <Cast size={16} />
                  </button>
                )}

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 border-2 border-transparent hover:border-white/70"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
                  title={fullscreen ? "Sair tela cheia" : "Tela cheia"}
                >
                  {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Old catalog control bar removed — now uses unified bottom controls above */}
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
        <Suspense fallback={<div className="fixed z-[55] w-[290px] rounded-2xl border border-white/10 flex items-center justify-center" style={{ backgroundColor: "rgba(10,10,10,0.95)", bottom: shopOpen ? "460px" : "165px", right: "20px", height: "400px" }}><ElegantLoader size={32} /></div>}>
          <PlayerChat channelId={canal?.id || "default"} radioUserId={profileRadioUserId} onClose={() => setChatOpen(false)} shopOpen={shopOpen} />
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

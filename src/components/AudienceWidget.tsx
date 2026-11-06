import { DateInput } from "@/components/ui/date-input";
import { useEffect, useState, useRef, useMemo } from "react";
import { Users, Radio, MonitorPlay, Facebook, Instagram, Youtube, Globe, Settings, FileBarChart, Loader2, Calendar as CalendarIcon, Trophy, X, TrendingUp, TrendingDown, Minus, Bell, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ReferenceArea, Label as ChartLabel } from "recharts";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  dataUserId?: string;
  heightPx?: number;
}

interface SocialCounts {
  youtube: number | null;
  instagram: number | null;
  facebook: number | null;
}

interface StreamSource {
  url: string;
  xpath: string;
}

interface SourcesConfig {
  instagram: string;
  facebook: string;
  youtube: string;
  audio_stream_api_url: string;
  audio_stream_xpath: string;
  video_stream_api_url: string;
  video_stream_xpath: string;
  audio_extras: StreamSource[];
  video_extras: StreamSource[];
  youtube_api_key: string;
  youtube_channel_id: string;
}


const ROTATE_MS = 3000;
// Redes sociais: 5x por dia (a cada ~4h48m)
const REFETCH_MS = Math.round((24 * 60 * 60 * 1000) / 5);
const LISTENERS_MS = 30 * 1000; // 30s for stream listeners
const SITE_MS = 30 * 1000; // 30s for site realtime users
const VIDEO_MS = 30 * 1000; // 30s for video viewers
const YT_LIVE_MS = 8 * 1000; // 8s for YouTube Live viewers refresh

// Client-side cache of audience counts keyed by URL(+xpath). Serves stale value
// instantly on remount / route change so the widget never shows a spinner when
// a recent count is already known. TTL matches the poll interval.
type AudCache = { value: number | null; expires: number };
const audCache = new Map<string, AudCache>();
const audKey = (kind: "a" | "v", url: string, xpath?: string | null) =>
  `${kind}\u0000${url}\u0000${xpath ?? ""}`;
function getAudCache(key: string): number | null | undefined {
  const hit = audCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) { audCache.delete(key); return undefined; }
  return hit.value;
}
function setAudCache(key: string, value: number | null, ttlMs: number) {
  audCache.set(key, { value, expires: Date.now() + ttlMs });
}

// Extract a numeric value from XML or JSON text using a simple slash-separated
// path (leading //, /, or bare "a/b/c"). Returns null if not found or not numeric.
function extractByPath(text: string, rawPath: string): number | null {
  const path = rawPath.replace(/^\/+/, "").split("/").map((s) => s.trim()).filter(Boolean);
  if (path.length === 0) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      let cur: any = JSON.parse(trimmed);
      for (const key of path) {
        if (cur == null) return null;
        if (Array.isArray(cur)) cur = cur[0];
        cur = cur?.[key];
      }
      if (Array.isArray(cur)) cur = cur[0];
      const n = typeof cur === "string" ? parseInt(cur, 10) : Number(cur);
      return Number.isFinite(n) ? n : null;
    } catch { /* fall through */ }
  }
  let scope = trimmed;
  for (const tag of path) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = scope.match(re);
    if (!m) return null;
    scope = m[1];
  }
  const inner = scope.replace(/<[^>]+>/g, "").trim();
  const n = parseInt(inner, 10);
  return Number.isFinite(n) ? n : null;
}


export default function AudienceWidget({ dataUserId, heightPx }: Props) {
  const [social, setSocial] = useState<SocialCounts>({ youtube: null, instagram: null, facebook: null });
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [youtubeLiveCount, setYoutubeLiveCount] = useState<number | null>(null);
  const isYoutubeLiveActiveRef = useRef(false);

  const [streamingCount, setStreamingCount] = useState<number | null>(null);
  const [siteCount, setSiteCount] = useState<number | null>(null);
  const [rotIdx, setRotIdx] = useState(0);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [loadingStreaming, setLoadingStreaming] = useState(true);
  const [loadingSite, setLoadingSite] = useState(true);
  const socialUrlsRef = useRef<{ youtube?: string; instagram?: string; facebook?: string }>({});
  const videoApiUrlRef = useRef<string | null>(null);

  // Config popup state
  const [configOpen, setConfigOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [sources, setSources] = useState<SourcesConfig>({
    instagram: "",
    facebook: "",
    youtube: "",
    audio_stream_api_url: "",
    audio_stream_xpath: "",
    video_stream_api_url: "",
    video_stream_xpath: "",
    audio_extras: [],
    video_extras: [],
    youtube_api_key: "",
    youtube_channel_id: "",
  });

  const initialSourcesRef = useRef<SourcesConfig | null>(null);
  const [audioXPathError, setAudioXPathError] = useState<string | null>(null);
  const [videoXPathError, setVideoXPathError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [probing, setProbing] = useState<"audio" | "video" | null>(null);
  const [audioSuggestions, setAudioSuggestions] = useState<Array<{ xpath: string; value: number }>>([]);
  const [videoSuggestions, setVideoSuggestions] = useState<Array<{ xpath: string; value: number }>>([]);
  const [probeError, setProbeError] = useState<string | null>(null);
  // Show/hide XPath field per source row. Key: -1 = primary, >=0 = extras[idx].
  const [audioXpOpen, setAudioXpOpen] = useState<Record<number, boolean>>({});
  const [videoXpOpen, setVideoXpOpen] = useState<Record<number, boolean>>({});

  // Refs to keep latest counts for the periodic history logger
  const streamingRef = useRef<number | null>(null);
  const videoRef = useRef<number | null>(null);
  const youtubeRef = useRef<number | null>(null);
  useEffect(() => { streamingRef.current = streamingCount; }, [streamingCount]);
  useEffect(() => { videoRef.current = videoCount; }, [videoCount]);
  useEffect(() => { youtubeRef.current = youtubeLiveCount; }, [youtubeLiveCount]);

  // Delta de seguidores (vs último valor conhecido, persistido em localStorage)
  const [socialDelta, setSocialDelta] = useState<{ youtube: number | null; instagram: number | null; facebook: number | null }>({ youtube: null, instagram: null, facebook: null });

  // Pico do dia (áudio/vídeo) — carregado do histórico + atualizado ao vivo
  const [audioPeak, setAudioPeak] = useState<number | null>(null);
  const [videoPeak, setVideoPeak] = useState<number | null>(null);

  // Atualiza deltas quando novos valores sociais chegam
  useEffect(() => {
    if (!dataUserId) return;
    (Object.keys(social) as Array<keyof SocialCounts>).forEach((key) => {
      const v = social[key];
      if (typeof v !== "number") return;
      const storageKey = `audience:social:${dataUserId}:${key}`;
      try {
        const prevRaw = localStorage.getItem(storageKey);
        const prev = prevRaw !== null ? parseInt(prevRaw, 10) : NaN;
        if (Number.isFinite(prev)) {
          setSocialDelta((d) => ({ ...d, [key]: v - prev }));
        }
        localStorage.setItem(storageKey, String(v));
      } catch { /* ignore */ }
    });
  }, [social, dataUserId]);

  // Carrega picos do dia a partir do histórico
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const load = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("audio, video")
        .eq("user_id", dataUserId as any)
        .gte("created_at", start.toISOString());
      if (cancelled || !data) return;
      let pa = 0, pv = 0;
      for (const r of data as any[]) {
        if ((r.audio ?? 0) > pa) pa = r.audio;
        if ((r.video ?? 0) > pv) pv = r.video;
      }
      setAudioPeak(pa);
      setVideoPeak(pv);
    };
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [dataUserId]);

  // Alertas de pico do dia (persistidos por dia em localStorage)
  interface PeakAlert { id: string; type: "audio" | "video"; value: number; at: string; }
  const [alerts, setAlerts] = useState<PeakAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("audience:peakAlerts:enabled") !== "0"; } catch { return true; }
  });
  const toggleAlertsEnabled = (v: boolean) => {
    setAlertsEnabled(v);
    try { localStorage.setItem("audience:peakAlerts:enabled", v ? "1" : "0"); } catch { /* ignore */ }
  };
  const peaksInitializedRef = useRef(false);
  const alertsStorageKey = dataUserId ? `audience:peakAlerts:${dataUserId}:${todayInBrasilia()}` : null;

  // Marca inicialização de picos após primeira carga do DB
  useEffect(() => {
    if (audioPeak !== null && videoPeak !== null && !peaksInitializedRef.current) {
      peaksInitializedRef.current = true;
    }
  }, [audioPeak, videoPeak]);

  // Carrega alertas persistidos do dia
  useEffect(() => {
    if (!alertsStorageKey) return;
    try {
      const raw = localStorage.getItem(alertsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PeakAlert[];
        setAlerts(parsed);
      }
    } catch { /* ignore */ }
  }, [alertsStorageKey]);

  const pushAlert = (type: "audio" | "video", value: number) => {
    if (!alertsEnabled) return;
    const alert: PeakAlert = {
      id: `${type}-${Date.now()}`,
      type,
      value,
      at: new Date().toISOString(),
    };
    setAlerts((prev) => {
      const next = [alert, ...prev].slice(0, 4);
      try { if (alertsStorageKey) localStorage.setItem(alertsStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setUnread((u) => u + 1);
    toast.success(
      type === "audio" ? "🎙️ Novo pico de áudio!" : "📺 Novo pico de vídeo!",
      {
        description: `${value.toLocaleString("pt-BR")} ${type === "audio" ? "ouvintes" : "espectadores"} simultâneos — recorde do dia.`,
        duration: 8000,
      }
    );
  };

  // Compara ao vivo — se contagem atual passar do pico, alerta e atualiza
  useEffect(() => {
    if (typeof streamingCount !== "number") return;
    setAudioPeak((p) => {
      if (p === null) return streamingCount;
      if (streamingCount > p && peaksInitializedRef.current && streamingCount > 0) {
        pushAlert("audio", streamingCount);
        return streamingCount;
      }
      return p;
    });
  }, [streamingCount]);
  useEffect(() => {
    if (typeof videoCount !== "number") return;
    setVideoPeak((p) => {
      if (p === null) return videoCount;
      if (videoCount > p && peaksInitializedRef.current && videoCount > 0) {
        pushAlert("video", videoCount);
        return videoCount;
      }
      return p;
    });
  }, [videoCount]);









  // Fetch social follower counts via edge function (which also handles RLS-safe
  // lookup of empresa_config URLs and manual overrides using service role).
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;

    const fetchAll = async () => {
      try {
        // Try direct config read first (works for owner/sub-user/admin) so we can
        // populate the rotation labels immediately.
        const { data } = await supabase
          .from("empresa_config")
          .select("youtube, instagram, facebook, video_stream_api_url, audio_stream_api_url, audio_stream_xpath, video_stream_xpath, youtube_api_key, youtube_channel_id, audio_sources, video_sources")
          .eq("user_id", dataUserId as any)
          .maybeSingle();
        if (!cancelled && data) {
          socialUrlsRef.current = {
            youtube: (data as any).youtube || undefined,
            instagram: (data as any).instagram || undefined,
            facebook: (data as any).facebook || undefined,
          };
          videoApiUrlRef.current = (data as any).video_stream_api_url || null;

          const asList = Array.isArray((data as any).audio_sources) ? (data as any).audio_sources : [];
          const vsList = Array.isArray((data as any).video_sources) ? (data as any).video_sources : [];
          const normList = (arr: any[]): StreamSource[] =>
            arr
              .map((x) => ({ url: String(x?.url ?? "").trim(), xpath: String(x?.xpath ?? "").trim() }))
              .filter((x) => x.url.length > 0);
          const audioAll = normList(asList);
          const videoAll = normList(vsList);
          // Primary comes from legacy columns; if empty, seed from first jsonb entry.
          const primaryAudioUrl = ((data as any).audio_stream_api_url || audioAll[0]?.url || "") as string;
          const primaryAudioXp = ((data as any).audio_stream_xpath || audioAll[0]?.xpath || "") as string;
          const primaryVideoUrl = ((data as any).video_stream_api_url || videoAll[0]?.url || "") as string;
          const primaryVideoXp = ((data as any).video_stream_xpath || videoAll[0]?.xpath || "") as string;
          // Extras = jsonb entries whose URL differs from primary.
          const audioExtras = audioAll.filter((x) => x.url && x.url !== primaryAudioUrl);
          const videoExtras = videoAll.filter((x) => x.url && x.url !== primaryVideoUrl);

          const s: SourcesConfig = {
            instagram: (data as any).instagram || "",
            facebook: (data as any).facebook || "",
            youtube: (data as any).youtube || "",
            audio_stream_api_url: primaryAudioUrl,
            audio_stream_xpath: primaryAudioXp,
            video_stream_api_url: primaryVideoUrl,
            video_stream_xpath: primaryVideoXp,
            audio_extras: audioExtras,
            video_extras: videoExtras,
            youtube_api_key: (data as any).youtube_api_key || "",
            youtube_channel_id: (data as any).youtube_channel_id || "",
          };
          setSources(s);
        }

        try {
          const { data: resp } = await supabase.functions.invoke("fetch-social-followers", {
            body: { userId: dataUserId },
          });
          if (cancelled) return;
          if (resp && (resp as any).ok) {
            const r = resp as any;
            // Edge function returns URLs it looked up (helpful when RLS blocked us).
            if (r.urls) {
              socialUrlsRef.current = {
                youtube: r.urls.youtube || socialUrlsRef.current.youtube,
                instagram: r.urls.instagram || socialUrlsRef.current.instagram,
                facebook: r.urls.facebook || socialUrlsRef.current.facebook,
              };
            }
            setSocial({
              youtube: (() => { const y = r.youtube ?? null; youtubeRef.current = y; return y; })(),
              instagram: r.instagram ?? null,
              facebook: r.facebook ?? null,
            });
          }
        } catch (e) {
          console.warn("fetch-social-followers failed", e);
        }
      } finally {
        if (!cancelled) {
          setLoadingSocial(false);
          setLoadingConfig(false);
        }
      }
    };


    fetchAll();
    const iv = setInterval(fetchAll, REFETCH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId]);

  // Poll audio stream stats. Sums the primary URL plus each extra source
  // configured. When any of them returns a number, the widget shows the sum.
  const audioSourcesKey = JSON.stringify(
    [
      { url: sources.audio_stream_api_url?.trim(), xpath: sources.audio_stream_xpath?.trim() },
      ...sources.audio_extras.map((e) => ({ url: e.url?.trim(), xpath: e.xpath?.trim() })),
    ].filter((x) => x.url),
  );
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const list: Array<{ url: string; xpath: string }> = [];
    const pUrl = sources.audio_stream_api_url?.trim();
    if (pUrl) list.push({ url: pUrl, xpath: sources.audio_stream_xpath?.trim() || "" });
    for (const e of sources.audio_extras) {
      const u = e.url?.trim();
      if (u) list.push({ url: u, xpath: e.xpath?.trim() || "" });
    }
    if (list.length === 0) {
      setStreamingCount(null);
      setLoadingStreaming(false);
      return;
    }
    const tick = async () => {
      const results = await Promise.all(
        list.map(async ({ url, xpath }) => {
          const ck = audKey("a", url, xpath);
          const body: Record<string, unknown> = { userId: dataUserId, urls: [url] };
          if (xpath) body.xpath = xpath;
          try {
            const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
            const raw = (data as any)?.ok ? (data as any).listeners : null;
            const n = typeof raw === "number" ? raw : null;
            setAudCache(ck, n, LISTENERS_MS);
            return n;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const anyOk = results.some((n) => n !== null);
      const total = results.reduce((a, n) => a + (n ?? 0), 0);
      setStreamingCount(anyOk ? total : null);
      setLoadingStreaming(false);
    };
    tick();
    const iv = setInterval(tick, LISTENERS_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId, audioSourcesKey]);




  // Poll GA4 Realtime API for site visitors.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase.functions.invoke("player-heartbeat", {
        body: { userId: dataUserId, count: true },
      });
      if (cancelled) return;
      if (data && (data as any).ok) {
        const n = (data as any).activeUsers;
        setSiteCount(typeof n === "number" ? n : null);
      }
      setLoadingSite(false);
    };
    tick();
    const iv = setInterval(tick, SITE_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId]);

  // Poll video streaming stats via edge function.
  // Primary call may run without a URL (edge function will still return YouTube
  // Live viewers from empresa_config). Each extra source runs its own call and
  // the widget shows the sum of all numeric results.
  const videoSourcesKey = JSON.stringify(
    [
      { url: sources.video_stream_api_url?.trim(), xpath: sources.video_stream_xpath?.trim() },
      ...sources.video_extras.map((e) => ({ url: e.url?.trim(), xpath: e.xpath?.trim() })),
    ],
  );
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const primaryUrl = sources.video_stream_api_url?.trim() || "";
    const primaryXp = sources.video_stream_xpath?.trim() || "";
    const extras = sources.video_extras
      .map((e) => ({ url: e.url?.trim() || "", xpath: e.xpath?.trim() || "" }))
      .filter((x) => x.url);

    const tick = async () => {
      // Primary call (always runs — enables YouTube Live viewers via config).
      const primary: { viewers: number | null; youtubeLive: number | null } = await (async () => {
        const body: Record<string, unknown> = { userId: dataUserId };
        if (primaryUrl) body.urls = [primaryUrl];
        if (primaryXp) body.xpath = primaryXp;
        try {
          const { data } = await supabase.functions.invoke("count-video-viewers", { body });
          const d = data as any;
          if (!d?.ok) return { viewers: null, youtubeLive: null };
          return {
            viewers: typeof d.viewers === "number" ? d.viewers : null,
            youtubeLive: typeof d.youtubeLive === "number" ? d.youtubeLive : null,
          };
        } catch { return { viewers: null, youtubeLive: null }; }
      })();
      const extraCalls = extras.map(({ url, xpath }) => (async () => {
        const body: Record<string, unknown> = { userId: dataUserId, urls: [url] };
        if (xpath) body.xpath = xpath;
        try {
          const { data } = await supabase.functions.invoke("count-video-viewers", { body });
          const raw = (data as any)?.ok ? (data as any).viewers : null;
          return typeof raw === "number" ? raw : null;
        } catch { return null; }
      })());
      const extraResults = await Promise.all(extraCalls);
      if (cancelled) return;
      const all = [primary.viewers, ...extraResults];
      const anyOk = all.some((n) => n !== null);
      const total = all.reduce((a, n) => a + (n ?? 0), 0);
      setVideoCount(anyOk ? total : null);
      // Não sobrescreve com null (erro/quota) — mantém último valor conhecido.
      if (typeof primary.youtubeLive === "number") setYoutubeLiveCount(primary.youtubeLive);
      setLoadingVideo(false);
    };
    tick();
    const iv = setInterval(tick, VIDEO_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId, videoSourcesKey]);

  // Fast YouTube Live viewers refresh (every few seconds) — independent from the
  // 30s full video poll so the "Live YouTube" card feels real-time.
  // Detecta o fim da live: quando a API do YouTube responde 0 (não há transmissão
  // ao vivo no momento) por duas leituras consecutivas, ocultamos o card. Erros
  // (null) não derrubam o valor exibido.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    let zeroStreak = 0;
    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke("count-video-viewers", {
          body: { userId: dataUserId, youtubeOnly: true, youtubeChannelId: sources.youtube_channel_id },
        });
        const d = data as any;
        if (cancelled || !d?.ok) return;
        const v = d.youtubeLive;
        if (typeof v !== "number") return;
        if (v > 0) {
          zeroStreak = 0;
          setYoutubeLiveCount(v);
          isYoutubeLiveActiveRef.current = true;
        } else {
          zeroStreak += 1;
          if (zeroStreak >= 2) {
            setYoutubeLiveCount(0);
            isYoutubeLiveActiveRef.current = false;
          }
        }
      } catch { /* ignore */ }
    };
    const iv = setInterval(tick, YT_LIVE_MS);
    tick();
    return () => { cancelled = true; clearInterval(iv); };
  }, [dataUserId]);




  // Log audiência a cada 5 minutos para o relatório histórico
  useEffect(() => {
    if (!dataUserId) return;
    const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const logNow = async () => {
      const audio = streamingRef.current ?? 0;
      const video = videoRef.current ?? 0;
      const youtube = isYoutubeLiveActiveRef.current ? (youtubeRef.current ?? 0) : 0;
      if (audio === 0 && video === 0 && youtube === 0) return;
      // Descobre programa atual
      const now = new Date();
      const dia = DIAS[now.getDay()];
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      let programa: string | null = null;
      try {
        const { data: progs } = await supabase
          .from("programas")
          .select("nome, dias_semana, horario_inicio, horario_fim, ativo")
          .eq("user_id", dataUserId as any);
        const onAir = (progs || []).find((p: any) => {
          if (p.ativo === false) return false;
          const dias: string[] = Array.isArray(p.dias_semana) ? p.dias_semana : [];
          if (!dias.includes(dia)) return false;
          return hhmm >= String(p.horario_inicio).slice(0, 5) && hhmm < String(p.horario_fim).slice(0, 5);
        });
        programa = onAir?.nome || null;
      } catch { /* ignore */ }
      await supabase.from("audiencia_historico").insert({
        user_id: dataUserId,
        programa,
        audio,
        video,
        youtube,
      } as any);
    };
    // primeiro log após 30s (para dar tempo dos contadores)
    const first = setTimeout(logNow, 30 * 1000);
    const iv = setInterval(logNow, 15 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [dataUserId]);

  // Rotate social display every 3s (only across configured networks)
  useEffect(() => {
    const iv = setInterval(() => setRotIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(iv);
  }, []);


  const socialTotal = (social.youtube || 0) + (social.instagram || 0) + (social.facebook || 0);

  const viewersNow = (streamingCount || 0) + (videoCount || 0) + (isYoutubeLiveActiveRef.current ? (youtubeLiveCount || 0) : 0);

  const bg = "#d9ff65";
  const dark = "#0A2540";

  // Rotation list — only networks that have a URL or channel configured
  const rotation: {
    key: "youtube" | "instagram" | "facebook";
    label: string;
    icon: React.ReactNode;
    value: number | null;
  }[] = [];
  if (socialUrlsRef.current.youtube || sources.youtube)
    rotation.push({
      key: "youtube",
      label: "YouTube (Inscritos)",
      icon: <Youtube size={14} />,
      value: social.youtube,
    });
  if (socialUrlsRef.current.instagram || sources.instagram)
    rotation.push({
      key: "instagram",
      label: "Instagram",
      icon: <Instagram size={14} />,
      value: social.instagram,
    });
  if (socialUrlsRef.current.facebook || sources.facebook)
    rotation.push({
      key: "facebook",
      label: "Facebook",
      icon: <Facebook size={14} />,
      value: social.facebook,
    });

  const current =
    rotation.length > 0 ? rotation[rotIdx % rotation.length] : null;

  const persistIfChanged = async () => {
    if (!dataUserId) return;
    const initial = initialSourcesRef.current;
    if (!initial) return;
    const extrasKey = (arr: StreamSource[]) =>
      JSON.stringify(arr.map((e) => ({ url: e.url.trim(), xpath: e.xpath.trim() })));
    const changed =
      initial.instagram !== sources.instagram ||
      initial.facebook !== sources.facebook ||
      initial.youtube !== sources.youtube ||
      initial.audio_stream_api_url !== sources.audio_stream_api_url ||
      initial.audio_stream_xpath !== sources.audio_stream_xpath ||
      initial.video_stream_api_url !== sources.video_stream_api_url ||
      initial.video_stream_xpath !== sources.video_stream_xpath ||
      extrasKey(initial.audio_extras) !== extrasKey(sources.audio_extras) ||
      extrasKey(initial.video_extras) !== extrasKey(sources.video_extras) ||
      initial.youtube_api_key !== sources.youtube_api_key ||
      initial.youtube_channel_id !== sources.youtube_channel_id;
    if (!changed) return;

    const buildList = (primaryUrl: string, primaryXp: string, extras: StreamSource[]) => {
      const list: StreamSource[] = [];
      if (primaryUrl.trim()) list.push({ url: primaryUrl.trim(), xpath: primaryXp.trim() });
      for (const e of extras) {
        const u = e.url.trim();
        if (u) list.push({ url: u, xpath: e.xpath.trim() });
      }
      return list;
    };
    const audioList = buildList(sources.audio_stream_api_url, sources.audio_stream_xpath, sources.audio_extras);
    const videoList = buildList(sources.video_stream_api_url, sources.video_stream_xpath, sources.video_extras);

    const payload = {
      user_id: dataUserId,
      instagram: sources.instagram.trim() || null,
      facebook: sources.facebook.trim() || null,
      youtube: sources.youtube.trim() || null,
      audio_stream_api_url: sources.audio_stream_api_url.trim() || null,
      audio_stream_xpath: sources.audio_stream_xpath.trim() || null,
      video_stream_api_url: sources.video_stream_api_url.trim() || null,
      video_stream_xpath: sources.video_stream_xpath.trim() || null,
      audio_sources: audioList,
      video_sources: videoList,
      youtube_api_key: sources.youtube_api_key.trim() || null,
      youtube_channel_id: sources.youtube_channel_id.trim() || null,
    };

    await supabase
      .from("empresa_config")
      .upsert(payload as any, { onConflict: "user_id" });
    // Update refs so live pollers pick up new URLs immediately.
    socialUrlsRef.current = {
      youtube: payload.youtube || undefined,
      instagram: payload.instagram || undefined,
      facebook: payload.facebook || undefined,
    };
    videoApiUrlRef.current = payload.video_stream_api_url || null;
    initialSourcesRef.current = { ...sources };
  };

  const validateXPaths = async (): Promise<boolean> => {
    setAudioXPathError(null);
    setVideoXPathError(null);
    const aUrl = sources.audio_stream_api_url.trim();
    const aXp = sources.audio_stream_xpath.trim();
    const vUrl = sources.video_stream_api_url.trim();
    const vXp = sources.video_stream_xpath.trim();
    if (!aXp && !vXp) return true;
    setValidating(true);
    let ok = true;
    try {
      if (aUrl && aXp) {
        try {
          const { data } = await supabase.functions.invoke("count-stream-listeners", {
            body: { userId: dataUserId, urls: [aUrl], xpath: aXp },
          });
          const n = (data as any)?.listeners;
          if (typeof n !== "number") {
            setAudioXPathError("XPath inválido: nenhum valor numérico encontrado no Source Audio.");
            ok = false;
          }
        } catch {
          setAudioXPathError("Não foi possível validar o XPath do Source Audio.");
          ok = false;
        }
      } else if (aXp && !aUrl) {
        setAudioXPathError("Informe a URL do Source Audio para validar o XPath.");
        ok = false;
      }

      if (vUrl && vXp) {
        try {
          const r = await fetch(vUrl, { cache: "no-store" });
          const text = await r.text();
          const n = extractByPath(text, vXp);
          if (typeof n !== "number") {
            setVideoXPathError("XPath inválido: nenhum valor numérico encontrado no Source Video.");
            ok = false;
          }
        } catch {
          setVideoXPathError("Não foi possível acessar a URL do Source Video para validar o XPath.");
          ok = false;
        }
      } else if (vXp && !vUrl) {
        setVideoXPathError("Informe a URL do Source Video para validar o XPath.");
        ok = false;
      }
    } finally {
      setValidating(false);
    }
    return ok;
  };

  const probeXPath = async (kind: "audio" | "video") => {
    const url = (kind === "audio" ? sources.audio_stream_api_url : sources.video_stream_api_url).trim();
    setProbeError(null);
    if (kind === "audio") setAudioSuggestions([]);
    else setVideoSuggestions([]);
    if (!url) {
      setProbeError("Informe a URL antes de detectar o XPath.");
      return;
    }
    setProbing(kind);
    try {
      const { data, error } = await supabase.functions.invoke("probe-stream-xpath", { body: { url } });
      if (error || !data || !(data as any).ok) {
        setProbeError("Não foi possível analisar a resposta do servidor.");
        return;
      }
      const list = ((data as any).suggestions || []) as Array<{ xpath: string; value: number }>;
      if (list.length === 0) {
        setProbeError("Nenhum campo numérico plausível de audiência encontrado.");
        return;
      }
      if (kind === "audio") {
        setAudioSuggestions(list);
        // Auto-fill with the best suggestion
        setSources((s) => ({ ...s, audio_stream_xpath: list[0].xpath }));
        setAudioXPathError(null);
      } else {
        setVideoSuggestions(list);
        setSources((s) => ({ ...s, video_stream_xpath: list[0].xpath }));
        setVideoXPathError(null);
      }
    } catch {
      setProbeError("Falha ao consultar o servidor.");
    } finally {
      setProbing(null);
    }
  };






  return (
    <div
      className="rounded-3xl flex flex-col p-5 w-full h-full relative"
      style={{
        background: bg,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        borderRadius: 24,
      }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          onClick={() => { setAlertsOpen(true); setUnread(0); }}
          aria-label="Alertas de pico"
          title={unread > 0 ? `${unread} novo(s) pico(s) do dia` : "Alertas de pico do dia"}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative"
          style={{ background: alerts.length > 0 ? "rgba(198,240,60,0.85)" : "rgba(10,37,64,0.12)", color: dark }}
        >
          <Bell size={14} className={unread > 0 ? "animate-pulse" : ""} />
          {unread > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black"
              style={{ background: "#DC2626", color: "#fff", boxShadow: "0 0 0 2px #d9ff65" }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <button
          onClick={() => setReportOpen(true)}
          aria-label="Relatório de audiência"
          title="Relatório de audiência"
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
          style={{ background: "rgba(10,37,64,0.12)", color: dark }}
        >
          <FileBarChart size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: dark }}
          >
            <Users size={16} style={{ color: bg }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-[9px] font-bold uppercase truncate"
              style={{ color: dark, opacity: 0.6, letterSpacing: 1.2 }}
            >
              Inscritos (Redes Sociais)
            </span>
            {loadingConfig || loadingSocial ? (
              <Skeleton width={72} height={18} dark={dark} />
            ) : (
              <span
                className="text-xl font-black leading-none"
                style={{ color: dark }}
              >
                {socialTotal.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: dark }}
          >
            <Users size={16} style={{ color: bg }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-[9px] font-bold uppercase truncate"
              style={{ color: dark, opacity: 0.6, letterSpacing: 1.2 }}
            >
              Total Audiência
            </span>
            {loadingStreaming || loadingVideo ? (
              <Skeleton width={72} height={18} dark={dark} />
            ) : (
              <span
                className="text-xl font-black leading-none"
                style={{ color: dark }}
              >
                {viewersNow.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: dark }}
          >
            <Globe size={16} style={{ color: bg }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-[9px] font-bold uppercase truncate"
              style={{ color: dark, opacity: 0.6, letterSpacing: 1.2 }}
            >
              No Site
            </span>
            {loadingSite ? (
              <Skeleton width={72} height={18} dark={dark} />
            ) : siteCount !== null && siteCount > 0 ? (
              <span
                className="text-xl font-black leading-none"
                style={{ color: dark }}
              >
                {siteCount.toLocaleString("pt-BR")}
              </span>
            ) : (
              <span
                className="text-xl font-black leading-none opacity-60"
                style={{ color: dark }}
              >
                -
              </span>
            )}
          </div>
        </div>
      </div>


      <div 
        className={`grid gap-2 flex-1 min-h-0 ${
          (youtubeLiveCount ?? 0) > 0 ? "grid-cols-4" : "grid-cols-3"
        }`}
      >
        <StatCell
          icon={current ? current.icon : <Users size={14} />}
          label={current ? current.label : "Redes sociais"}
          value={current ? current.value : null}
          loading={loadingConfig || loadingSocial}
          dark={dark}
          rotationKey={current ? `${current.key}-${rotIdx}` : "empty"}
          badge={current ? <DeltaBadge delta={socialDelta[current.key]} dark={dark} loading={loadingConfig || loadingSocial} /> : null}
        />
        <StatCell
          icon={<Radio size={14} />}
          label="Áudio Streaming"
          value={streamingCount}
          loading={loadingStreaming && streamingCount === null}
          dark={dark}
          badge={<PeakBadge peak={audioPeak} dark={dark} loading={false} />}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Vídeo Streaming"
          value={videoCount}
          loading={loadingVideo && videoCount === null}
          dark={dark}
          badge={<PeakBadge peak={videoPeak} dark={dark} loading={false} />}
        />
        {(youtubeLiveCount ?? 0) > 0 && (
          <StatCell
            icon={<Youtube size={14} />}
            label="YouTube Live"
            value={youtubeLiveCount}
            loading={loadingVideo && youtubeLiveCount === null}
            dark={dark}
          />
        )}
      </div>

      <Dialog
        open={configOpen}
        onOpenChange={async (open) => {
          if (!open) {
            const ok = await validateXPaths();
            if (!ok) {
              // Keep dialog open when validation fails
              return;
            }
            await persistIfChanged();
          }
          setConfigOpen(open);
        }}
      >
        <DialogContent
          className="max-w-xl w-[95vw] p-0 overflow-hidden max-h-[90vh] flex flex-col"
          style={{ background: "#F4FBFD", borderRadius: 28, border: "none", fontFamily: "Montserrat, sans-serif" }}
        >
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #00BFF0 0%, #00A9D6 100%)", padding: "20px 24px" }}>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.22)" }}>
                  <Settings size={20} color="#fff" />
                </div>
                <div className="flex flex-col">
                  <DialogTitle className="text-base font-black uppercase tracking-wider text-white">
                    Fontes da Audiência
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-white/85">
                    Configure de onde vêm seus números. Validado ao salvar.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-5 py-5 flex flex-col gap-5">
            {/* Redes sociais */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-[2px] flex-1" style={{ background: "linear-gradient(90deg, #00BFF0, transparent)" }} />
                <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#0A2540", opacity: 0.7 }}>
                  Redes sociais
                </span>
                <div className="h-[2px] flex-1" style={{ background: "linear-gradient(90deg, transparent, #00BFF0)" }} />
              </div>
              <SourceField
                icon={<Instagram size={14} />}
                label="Instagram"
                placeholder="https://instagram.com/seu_perfil"
                value={sources.instagram}
                onChange={(v) => setSources((s) => ({ ...s, instagram: v }))}
              />
              <SourceField
                icon={<Facebook size={14} />}
                label="Facebook"
                placeholder="https://facebook.com/sua_pagina"
                value={sources.facebook}
                onChange={(v) => setSources((s) => ({ ...s, facebook: v }))}
              />
              <SourceField
                icon={<Youtube size={14} />}
                label="YouTube"
                placeholder="https://youtube.com/@seu_canal"
                value={sources.youtube}
                onChange={(v) => setSources((s) => ({ ...s, youtube: v }))}
              />
            </section>

            {/* Streaming Áudio */}
            <section
              className="flex flex-col gap-3 rounded-2xl p-4"
              style={{ background: "#fff", border: "1px solid rgba(0,191,240,0.25)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#00BFF0" }}>
                  <Radio size={14} color="#fff" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#0A2540" }}>
                    Streaming de áudio
                  </span>
                  <span className="text-[10px]" style={{ color: "#0A2540", opacity: 0.55 }}>
                    URL do XML do servidor + caminho do campo de ouvintes.
                  </span>
                </div>
              </div>
              <StreamSourceRow
                kind="audio"
                index={-1}
                url={sources.audio_stream_api_url}
                xpath={sources.audio_stream_xpath}
                showXpath={!!sources.audio_stream_xpath || audioXpOpen[-1]}
                onUrlChange={(v) => setSources((s) => ({ ...s, audio_stream_api_url: v }))}
                onXpathChange={(v) => { setSources((s) => ({ ...s, audio_stream_xpath: v })); setAudioXPathError(null); }}
                onToggleXpath={() => setAudioXpOpen((o) => ({ ...o, [-1]: !o[-1] }))}
                onAddExtra={() =>
                  setSources((s) => ({ ...s, audio_extras: [...s.audio_extras, { url: "", xpath: "" }] }))
                }
                xpathError={audioXPathError}
                probing={probing === "audio"}
                onProbe={() => probeXPath("audio")}
                suggestions={audioSuggestions}
                onPickSuggestion={(xp) => { setSources((s) => ({ ...s, audio_stream_xpath: xp })); setAudioXPathError(null); }}
              />
              {sources.audio_extras.map((extra, i) => (
                <StreamSourceRow
                  key={`ax-${i}`}
                  kind="audio"
                  index={i}
                  isExtra
                  url={extra.url}
                  xpath={extra.xpath}
                  showXpath={!!extra.xpath || audioXpOpen[i]}
                  onUrlChange={(v) =>
                    setSources((s) => {
                      const next = [...s.audio_extras];
                      next[i] = { ...next[i], url: v };
                      return { ...s, audio_extras: next };
                    })
                  }
                  onXpathChange={(v) =>
                    setSources((s) => {
                      const next = [...s.audio_extras];
                      next[i] = { ...next[i], xpath: v };
                      return { ...s, audio_extras: next };
                    })
                  }
                  onToggleXpath={() => setAudioXpOpen((o) => ({ ...o, [i]: !o[i] }))}
                  onRemove={() =>
                    setSources((s) => ({
                      ...s,
                      audio_extras: s.audio_extras.filter((_, j) => j !== i),
                    }))
                  }
                />
              ))}
            </section>

            {/* Streaming Vídeo */}
            <section
              className="flex flex-col gap-3 rounded-2xl p-4"
              style={{ background: "#fff", border: "1px solid rgba(10,37,64,0.15)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#0A2540" }}>
                  <MonitorPlay size={14} color="#fff" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#0A2540" }}>
                    Streaming de vídeo
                  </span>
                  <span className="text-[10px]" style={{ color: "#0A2540", opacity: 0.55 }}>
                    URL do XML do servidor + caminho do campo de espectadores.
                  </span>
                </div>
              </div>
              <StreamSourceRow
                kind="video"
                index={-1}
                url={sources.video_stream_api_url}
                xpath={sources.video_stream_xpath}
                showXpath={!!sources.video_stream_xpath || videoXpOpen[-1]}
                onUrlChange={(v) => setSources((s) => ({ ...s, video_stream_api_url: v }))}
                onXpathChange={(v) => { setSources((s) => ({ ...s, video_stream_xpath: v })); setVideoXPathError(null); }}
                onToggleXpath={() => setVideoXpOpen((o) => ({ ...o, [-1]: !o[-1] }))}
                onAddExtra={() =>
                  setSources((s) => ({ ...s, video_extras: [...s.video_extras, { url: "", xpath: "" }] }))
                }
                xpathError={videoXPathError}
                probing={probing === "video"}
                onProbe={() => probeXPath("video")}
                suggestions={videoSuggestions}
                onPickSuggestion={(xp) => { setSources((s) => ({ ...s, video_stream_xpath: xp })); setVideoXPathError(null); }}
              />
              {sources.video_extras.map((extra, i) => (
                <StreamSourceRow
                  key={`vx-${i}`}
                  kind="video"
                  index={i}
                  isExtra
                  url={extra.url}
                  xpath={extra.xpath}
                  showXpath={!!extra.xpath || videoXpOpen[i]}
                  onUrlChange={(v) =>
                    setSources((s) => {
                      const next = [...s.video_extras];
                      next[i] = { ...next[i], url: v };
                      return { ...s, video_extras: next };
                    })
                  }
                  onXpathChange={(v) =>
                    setSources((s) => {
                      const next = [...s.video_extras];
                      next[i] = { ...next[i], xpath: v };
                      return { ...s, video_extras: next };
                    })
                  }
                  onToggleXpath={() => setVideoXpOpen((o) => ({ ...o, [i]: !o[i] }))}
                  onRemove={() =>
                    setSources((s) => ({
                      ...s,
                      video_extras: s.video_extras.filter((_, j) => j !== i),
                    }))
                  }
                />
              ))}
              <div className="mt-1 pt-3" style={{ borderTop: "1px dashed rgba(10,37,64,0.15)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Youtube size={14} color="#FF0000" />
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#0A2540" }}>
                    YouTube Live · API oficial
                  </span>
                </div>
                <SourceField
                  label="YouTube Data API v3 · API Key"
                  placeholder="AIzaSy... (Google Cloud Console)"
                  value={sources.youtube_api_key}
                  onChange={(v) => setSources((s) => ({ ...s, youtube_api_key: v }))}
                  helperText="Obrigatório para ler a audiência ao vivo do canal informado em 'YouTube' (Redes sociais). Crie em console.cloud.google.com → APIs → YouTube Data API v3."
                />
                <div className="mt-2">
                  <SourceField
                    label="ID do canal (Channel ID)"
                    placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                    value={sources.youtube_channel_id}
                    onChange={(v) => setSources((s) => ({ ...s, youtube_channel_id: v }))}
                    helperText="Opcional, mas recomendado. Cole o Channel ID (começa com 'UC…') encontrado em youtube.com/account_advanced. Evita falha na detecção quando a URL usa @handle."
                  />
                </div>
              </div>
            </section>

            {probeError && (
              <span className="text-[11px] font-semibold px-3 py-2 rounded-lg text-center" style={{ color: "#E11D48", background: "rgba(225,29,72,0.08)" }}>
                {probeError}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ background: "#fff", borderTop: "1px solid rgba(0,191,240,0.2)" }}>
            <button
              type="button"
              onClick={() => setConfigOpen(false)}
              className="px-5 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-full transition-colors"
              style={{ background: "rgba(10,37,64,0.08)", color: "#0A2540", fontFamily: "Montserrat, sans-serif" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={validating}
              onClick={async () => {
                const ok = await validateXPaths();
                if (!ok) return;
                await persistIfChanged();
                setConfigOpen(false);
              }}
              className="px-6 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-full transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "#C6F03C", color: "#0A2540", fontFamily: "Montserrat, sans-serif", boxShadow: "0 4px 14px rgba(198,240,60,0.4)" }}
            >
              {validating ? "Validando..." : "Salvar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>


      <AudienceReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        userId={dataUserId}
      />

      {/* Alertas de pico */}
      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent
          className="max-w-md w-[95vw] p-0 overflow-hidden"
          style={{ background: "#D6F4FB", borderRadius: 28, border: "none", fontFamily: "Montserrat, sans-serif" }}
        >
          <div style={{ background: "linear-gradient(135deg, #00BFF0 0%, #00A9D6 100%)", padding: "20px 24px" }}>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                  <Bell size={20} color="#fff" />
                </div>
                <div className="flex flex-col">
                  <DialogTitle className="text-lg font-black uppercase tracking-wider text-white">
                    Alertas de Pico
                  </DialogTitle>
                  <DialogDescription className="text-xs text-white/85">
                    Novos recordes de audiência do dia.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Switch ligar/desligar alertas */}
          <div className="mx-4 mt-4 rounded-2xl p-3 flex items-center justify-between" style={{ background: "#fff", border: "1px solid rgba(0,191,240,0.35)" }}>
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: dark }}>
                Notificações de pico
              </span>
              <span className="text-[10px] font-semibold" style={{ color: dark, opacity: 0.55 }}>
                {alertsEnabled ? "Você receberá alertas de novos recordes." : "Alertas desligados — nenhum novo pico será registrado."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={alertsEnabled}
              onClick={() => toggleAlertsEnabled(!alertsEnabled)}
              className="relative inline-flex items-center rounded-full transition-colors shrink-0"
              style={{
                width: 44,
                height: 24,
                background: alertsEnabled ? "#00BFF0" : "rgba(10,37,64,0.2)",
              }}
            >
              <span
                className="inline-block rounded-full bg-white shadow transition-transform"
                style={{
                  width: 18,
                  height: 18,
                  transform: alertsEnabled ? "translateX(23px)" : "translateX(3px)",
                }}
              />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-auto">
            {alerts.length === 0 && (
              <div className="text-center py-10 text-xs font-semibold" style={{ color: dark, opacity: 0.55 }}>
                {alertsEnabled ? "Nenhum novo pico registrado hoje." : "Alertas desligados."}
                <br />
                <span className="text-[10px]">
                  {alertsEnabled
                    ? "Você será notificado quando a audiência bater um recorde."
                    : "Ative acima para voltar a receber notificações."}
                </span>
              </div>
            )}
            {alerts.slice(0, 4).map((a) => {
              const isAudio = a.type === "audio";
              const time = new Date(a.at);
              const hhmm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
              return (
                <div
                  key={a.id}
                  className="rounded-2xl p-3 flex items-center gap-3"
                  style={{
                    background: "#fff",
                    border: `2px solid ${isAudio ? "#00BFF0" : "#0A2540"}`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: isAudio ? "#00BFF0" : "#0A2540", color: "#fff" }}
                  >
                    {isAudio ? <Radio size={16} /> : <MonitorPlay size={16} />}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: dark, opacity: 0.6 }}>
                      Pico de {isAudio ? "áudio" : "vídeo"} · {hhmm}
                    </span>
                    <span className="text-xl font-black leading-tight" style={{ color: dark }}>
                      {a.value.toLocaleString("pt-BR")} {isAudio ? "ouvintes" : "espectadores"}
                    </span>
                  </div>
                  <Trophy size={18} style={{ color: "#C6F03C" }} />
                </div>
              );
            })}
          </div>

          {alerts.length > 0 && (
            <div className="px-4 py-3 flex items-center justify-between border-t" style={{ borderColor: "rgba(0,191,240,0.25)" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dark, opacity: 0.55 }}>
                {alerts.length} alerta{alerts.length > 1 ? "s" : ""} hoje
              </span>
              <button
                type="button"
                onClick={() => {
                  setAlerts([]);
                  setUnread(0);
                  try { if (alertsStorageKey) localStorage.removeItem(alertsStorageKey); } catch { /* ignore */ }
                }}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full"
                style={{ background: "rgba(10,37,64,0.1)", color: dark }}
              >
                Limpar
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>


    </div>
  );
}

/* ==================== REPORT DIALOG ==================== */
interface HistRow {
  id: string;
  created_at: string;
  programa: string | null;
  audio: number;
  video: number;
  youtube: number;
}
function AudienceReportDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
}) {
  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";
  const DARK = "#0A2540";
  const BG = "#D6F4FB";
  const AUDIO_COLOR = "#00BFF0";
  const VIDEO_COLOR = "#0A2540";
  const todayStr = () => todayInBrasilia();
  const [date, setDate] = useState<string>(todayStr());
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"day" | "trend">("day");
  const [trendRows, setTrendRows] = useState<Array<{ day: string; audio: number; video: number; peakAudio: number; peakVideo: number }>>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [programaFilter, setProgramaFilter] = useState<string>("__ALL__");
  const [programOptions, setProgramOptions] = useState<string[]>([]);
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90 | 180>(30);
  const [totalsPeriod, setTotalsPeriod] = useState<{ audio: number; video: number; youtube: number; peakAudio: number; peakVideo: number; samples: number; avgAudio: number; avgVideo: number } | null>(null);
  const [yesterdayYt, setYesterdayYt] = useState<{ peak: number; avg: number; sum: number; has: boolean; dateLabel: string } | null>(null);

  // Totais no período selecionado (por fonte), respeita filtro de programa
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const load = async () => {
      const start = new Date();
      start.setDate(start.getDate() - periodDays);
      start.setHours(0, 0, 0, 0);
      let q = supabase
        .from("audiencia_historico")
        .select("audio, video, youtube, programa, created_at")
        .eq("user_id", userId as any)
        .gte("created_at", start.toISOString());
      if (programaFilter !== "__ALL__") q = q.eq("programa", programaFilter);
      const { data } = await q;
      if (cancelled) return;
      const rows = (data as any[]) || [];
      let a = 0, v = 0, pa = 0, pv = 0;
      // YouTube: acumular apenas dos programas que efetivamente foram AO VIVO no YouTube.
      // Regra: para cada sessão (dia + programa) com youtube > 0, contabilizamos o PICO
      // simultâneo de espectadores. Isso evita somar amostras do canal sem live e
      // reflete "views durante a live" por programa.
      const ytSessions = new Map<string, number>(); // key: `${YYYY-MM-DD}|${programa}` -> peak
      for (const r of rows) {
        const ra = r.audio || 0, rv = r.video || 0, ry = r.youtube || 0;
        a += ra; v += rv;
        if (ra > pa) pa = ra;
        if (rv > pv) pv = rv;
        if (ry > 0) {
          const d = new Date(r.created_at);
          const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const k = `${dayKey}|${r.programa || "__SEM__"}`;
          const prev = ytSessions.get(k) || 0;
          if (ry > prev) ytSessions.set(k, ry);
        }
      }
      const y = Array.from(ytSessions.values()).reduce((s, val) => s + val, 0);
      const n = Math.max(1, rows.length);
      setTotalsPeriod({
        audio: a, video: v, youtube: y, peakAudio: pa, peakVideo: pv, samples: rows.length,
        avgAudio: Math.round(a / n), avgVideo: Math.round(v / n),
      });
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId, programaFilter, periodDays]);


  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("id, created_at, programa, audio, video, youtube")
        .eq("user_id", userId as any)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows(((data as any[]) || []).map((r) => ({ ...r, youtube: r.youtube || 0 })) as HistRow[]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId, date]);

  // Carrega YouTube do dia anterior (para comparação lado a lado)
  useEffect(() => {
    if (!open || !userId) { setYesterdayYt(null); return; }
    let cancelled = false;
    const load = async () => {
      const base = new Date(`${date}T00:00:00`);
      const prev = new Date(base);
      prev.setDate(prev.getDate() - 1);
      const y = prev.getFullYear();
      const m = String(prev.getMonth() + 1).padStart(2, "0");
      const d = String(prev.getDate()).padStart(2, "0");
      const startIso = new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
      const endIso = new Date(`${y}-${m}-${d}T23:59:59.999`).toISOString();
      let q = supabase
        .from("audiencia_historico")
        .select("youtube, programa")
        .eq("user_id", userId as any)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      const { data } = await q;
      if (cancelled) return;
      const filtered = ((data as any[]) || []).filter((r) =>
        programaFilter === "__ALL__" ? true : (r.programa || "") === programaFilter
      );
      const yts = filtered.map((r) => Number(r.youtube || 0));
      const sum = yts.reduce((s, v) => s + v, 0);
      const peak = yts.reduce((m, v) => (v > m ? v : m), 0);
      const avg = yts.length ? Math.round(sum / yts.length) : 0;
      setYesterdayYt({ peak, avg, sum, has: sum > 0, dateLabel: `${d}/${m}` });
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId, date, programaFilter]);



  // Carrega lista de programas com registro nos últimos 6 meses
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const load = async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("programa")
        .eq("user_id", userId as any)
        .not("programa", "is", null)
        .gte("created_at", start.toISOString());
      if (cancelled) return;
      const set = new Set<string>();
      for (const r of (data as any[]) || []) {
        if (r.programa) set.add(r.programa as string);
      }
      setProgramOptions(Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR")));
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId]);

  // Carrega tendência dos últimos 6 meses (agregado por dia)
  useEffect(() => {
    if (!open || !userId || view !== "trend") return;
    let cancelled = false;
    const load = async () => {
      setTrendLoading(true);
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("created_at, audio, video, programa")
        .eq("user_id", userId as any)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const filtered = (data as any[] || []).filter((r) =>
        programaFilter === "__ALL__" ? true : (r.programa || "") === programaFilter
      );
      const buckets = new Map<string, { audio: number; video: number; count: number; peakAudio: number; peakVideo: number }>();
      for (const r of filtered) {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const b = buckets.get(key) || { audio: 0, video: 0, count: 0, peakAudio: 0, peakVideo: 0 };
        b.audio += r.audio || 0;
        b.video += r.video || 0;
        b.count += 1;
        if ((r.audio || 0) > b.peakAudio) b.peakAudio = r.audio || 0;
        if ((r.video || 0) > b.peakVideo) b.peakVideo = r.video || 0;
        buckets.set(key, b);
      }
      const arr = Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, b]) => ({
          day,
          audio: Math.round(b.audio / Math.max(1, b.count)),
          video: Math.round(b.video / Math.max(1, b.count)),
          peakAudio: b.peakAudio,
          peakVideo: b.peakVideo,
        }));
      setTrendRows(arr);
      setTrendLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId, view, programaFilter]);

  // Aplica filtro de programa às linhas do dia
  const filteredRows = useMemo(() => {
    if (programaFilter === "__ALL__") return rows;
    return rows.filter((r) => (r.programa || "") === programaFilter);
  }, [rows, programaFilter]);

  const stats = useMemo(() => {
    if (filteredRows.length === 0) return null;
    const peakAudio = filteredRows.reduce((m, r) => (r.audio > m.audio ? r : m), filteredRows[0]);
    const peakVideo = filteredRows.reduce((m, r) => (r.video > m.video ? r : m), filteredRows[0]);
    // Regra: YouTube só conta quando youtube > 0 (Live ao vivo)
    const liveRows = filteredRows.filter((r) => (r.youtube || 0) > 0);
    const peakYoutube: HistRow = liveRows.length 
      ? liveRows.reduce((m, r) => (r.youtube > m.youtube ? r : m), liveRows[0])
      : { 
          id: 'placeholder', 
          created_at: filteredRows[0].created_at, 
          audio: 0, 
          video: 0, 
          youtube: 0, 
          programa: null 
        };
    
    const peakTotal = filteredRows.reduce((m, r) => {
      const curYt = (r.youtube || 0);
      const mYt = (m.youtube || 0);
      const curTotal = r.audio + r.video + curYt;
      const mTotal = m.audio + m.video + mYt;
      return curTotal > mTotal ? r : m;
    }, filteredRows[0]);

    const avgAudio = Math.round(filteredRows.reduce((s, r) => s + r.audio, 0) / filteredRows.length);
    const avgVideo = Math.round(filteredRows.reduce((s, r) => s + r.video, 0) / filteredRows.length);
    
    const avgYoutube = liveRows.length
      ? Math.round(liveRows.reduce((s, r) => s + (r.youtube || 0), 0) / liveRows.length)
      : 0;
    
    // Total "views durante a live" = soma dos picos por programa que teve live no dia.
    const peakByProg = new Map<string, number>();
    for (const r of liveRows) {
      const key = r.programa || "__SEM__";
      const prev = peakByProg.get(key) || 0;
      if ((r.youtube || 0) > prev) peakByProg.set(key, r.youtube || 0);
    }
    const sumYoutube = Array.from(peakByProg.values()).reduce((s, v) => s + v, 0);
    const hasYoutube = sumYoutube > 0;
    
    const liveTimes = liveRows.map((r) => new Date(r.created_at).getTime());
    const liveStart = liveTimes.length ? new Date(Math.min(...liveTimes)) : null;
    const liveEnd = liveTimes.length ? new Date(Math.max(...liveTimes)) : null;
    
    return { peakAudio, peakVideo, peakYoutube, peakTotal, avgAudio, avgVideo, avgYoutube, sumYoutube, hasYoutube, liveStart, liveEnd, liveProgramsCount: peakByProg.size };
  }, [filteredRows]);


  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const periodLabel = periodDays === 180 ? "6 meses" : `${periodDays} dias`;
  const programaLabel = programaFilter === "__ALL__" ? "Todos os programas" : programaFilter;
  const safeSlug = (s: string) => s.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "sem_programa";
  const exportFilenameBase = (kind: "CSV" | "PDF") => {
    const end = new Date(`${date}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - periodDays);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `audiencia_${safeSlug(programaLabel)}_${iso(start)}_a_${iso(end)}_${kind}`;
  };

  const exportCSV = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push(`Relatório de Audiência`);
    lines.push(`Data;${fmtDate(new Date(`${date}T00:00:00`).toISOString())}`);
    lines.push(`Programa;${programaLabel}`);
    lines.push(`Período (totais);Últimos ${periodLabel}`);
    lines.push("");
    if (totalsPeriod) {
      lines.push(`Resumo do período;Áudio;Vídeo;Total`);
      lines.push([`Pico`, totalsPeriod.peakAudio, totalsPeriod.peakVideo, totalsPeriod.peakAudio + totalsPeriod.peakVideo].map(esc).join(";"));
      lines.push([`Média`, totalsPeriod.avgAudio, totalsPeriod.avgVideo, totalsPeriod.avgAudio + totalsPeriod.avgVideo].map(esc).join(";"));
      lines.push([`Soma`, totalsPeriod.audio, totalsPeriod.video, totalsPeriod.audio + totalsPeriod.video].map(esc).join(";"));
      lines.push(`Registros;${totalsPeriod.samples}`);
      lines.push("");
    }
    lines.push(`Registros do dia`);
    lines.push([`Data`, `Hora`, `Programa`, `Rádio`, `TV`, `YouTube`, `Total`].map(esc).join(";"));
    for (const r of filteredRows) {
      const yt = r.youtube || 0;
      lines.push([fmtDate(r.created_at), fmtTime(r.created_at), r.programa || "", r.audio, r.video, yt, (r.audio || 0) + (r.video || 0) + yt].map(esc).join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilenameBase("CSV")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = 40;
    doc.setFillColor(0, 191, 240);
    doc.rect(0, 0, W, 60, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Relatório de Audiência", 32, 38);
    y = 90;
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Data: ${fmtDate(new Date(`${date}T00:00:00`).toISOString())}`, 32, y); y += 14;
    doc.text(`Programa: ${programaLabel}`, 32, y); y += 14;
    doc.text(`Período dos totais: últimos ${periodLabel}`, 32, y); y += 20;

    if (totalsPeriod) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Resumo · últimos ${periodLabel}`, 32, y); y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const rows: [string, string, string, string][] = [
        ["", "Áudio", "Vídeo", "Total"],
        ["Pico", String(totalsPeriod.peakAudio), String(totalsPeriod.peakVideo), String(totalsPeriod.peakAudio + totalsPeriod.peakVideo)],
        ["Média", String(totalsPeriod.avgAudio), String(totalsPeriod.avgVideo), String(totalsPeriod.avgAudio + totalsPeriod.avgVideo)],
        ["Soma", String(totalsPeriod.audio), String(totalsPeriod.video), String(totalsPeriod.audio + totalsPeriod.video)],
      ];
      const colX = [32, 200, 300, 400];
      for (const [i, row] of rows.entries()) {
        if (i === 0) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
        row.forEach((c, j) => doc.text(c, colX[j], y));
        y += 14;
      }
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Registros no período: ${totalsPeriod.samples}`, 32, y); y += 16;
      doc.setTextColor(30, 41, 59);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Registros do dia (${filteredRows.length})`, 32, y); y += 14;

    const headers = ["Hora", "Programa", "Rádio", "TV", "YouTube", "Total"];
    const cols = [32, 90, 300, 360, 410, 480];
    doc.setFontSize(9);
    doc.setFillColor(240, 249, 255);
    doc.rect(28, y - 10, W - 56, 16, "F");
    headers.forEach((h, i) => doc.text(h, cols[i], y));
    y += 14;
    doc.setFont("helvetica", "normal");
    for (const r of filteredRows) {
      if (y > H - 40) { doc.addPage(); y = 50; }
      const yt = r.youtube || 0;
      const cells = [fmtTime(r.created_at), (r.programa || "").slice(0, 34), String(r.audio), String(r.video), String(yt), String((r.audio || 0) + (r.video || 0) + yt)];
      cells.forEach((c, i) => doc.text(c, cols[i], y));
      y += 12;
    }

    doc.save(`${exportFilenameBase("PDF")}.pdf`);
    toast.success("PDF exportado");
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl w-[98vw] sm:w-[96vw] p-0 overflow-hidden top-[80px] translate-y-0 data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4"
        style={{ background: BG, border: "none", fontFamily: "Montserrat, sans-serif", display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", maxHeight: "calc(100vh - 100px)", borderRadius: "clamp(16px, 3vw, 28px)" }}
      >
        <div style={{ background: `linear-gradient(135deg, ${CYAN} 0%, #00A9D6 100%)`, padding: "clamp(12px, 2.2vw, 20px) clamp(14px, 2.5vw, 24px)" }}>
          <DialogHeader>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
                <FileBarChart size={18} color="#fff" />
              </div>
              <div className="flex flex-col min-w-0">
                <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-wider text-white truncate">
                  Relatório de Audiência
                </DialogTitle>
                <DialogDescription className="text-[10px] sm:text-xs text-white/85">
                  Histórico consolidado de áudio e vídeo por programa.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-3 sm:p-5 flex flex-col gap-2 sm:gap-3 flex-1 min-h-0 overflow-y-auto">

          {/* Barra unificada: Tabs · Data · Hoje · Filtro de programa */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 p-1 rounded-full" style={{ background: "#fff", border: `2px solid ${CYAN}` }}>
              <button
                type="button"
                onClick={() => setView("day")}
                className="text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-full transition-all"
                style={{
                  background: view === "day" ? CYAN : "transparent",
                  color: view === "day" ? "#fff" : DARK,
                }}
              >
                Dia
              </button>
              <button
                type="button"
                onClick={() => setView("trend")}
                className="text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-full transition-all"
                style={{
                  background: view === "trend" ? CYAN : "transparent",
                  color: view === "trend" ? "#fff" : DARK,
                }}
              >
                6 Meses · Tendência
              </button>
            </div>

            {view === "day" && (
              <>
                <div className="flex items-center gap-2 rounded-full px-4 py-1.5" style={{ background: "#fff", border: `2px solid ${CYAN}` }}>
                  <CalendarIcon size={14} style={{ color: CYAN }} />
                  <DateInput
                                      value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-xs font-bold outline-none bg-transparent"
                    style={{ color: DARK, fontFamily: "Montserrat, sans-serif" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDate(todayStr())}
                  className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03]"
                  style={{ background: LIME, color: DARK }}
                >
                  Hoje
                </button>
              </>
            )}

            <span className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: DARK, opacity: 0.6 }}>
              Programa
            </span>
            <div className="relative">
              <select
                value={programaFilter}
                onChange={(e) => setProgramaFilter(e.target.value)}
                className="appearance-none text-xs font-bold outline-none pl-4 pr-9 py-1.5 rounded-full cursor-pointer"
                style={{
                  background: "#fff",
                  border: `2px solid ${CYAN}`,
                  color: DARK,
                  fontFamily: "Montserrat, sans-serif",
                  minWidth: 220,
                }}
              >
                <option value="__ALL__">Todos os programas</option>
                {programOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black" style={{ color: CYAN }}>▼</span>
            </div>
            {programaFilter !== "__ALL__" && (
              <button
                type="button"
                onClick={() => setProgramaFilter("__ALL__")}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03] inline-flex items-center gap-1"
                style={{ background: `${DARK}12`, color: DARK }}
              >
                <X size={10} /> Limpar
              </button>
            )}

            {/* Pico do dia — ao lado do combo Programa */}
            {view === "day" && stats && (
              <div className="ml-auto flex items-center gap-2 rounded-full px-4 py-1.5" style={{ background: DARK, color: "#fff" }}>
                <Trophy size={14} style={{ color: LIME }} />
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Pico do dia</span>
                <span className="text-sm font-black tabular-nums">{(stats.peakTotal.audio + stats.peakTotal.video + (stats.peakTotal.youtube || 0)).toLocaleString("pt-BR")}</span>
                <span className="text-[10px] opacity-70">às {fmtTime(stats.peakTotal.created_at)}</span>
              </div>
            )}

            {/* Exportar */}
            <div className={`${view === "day" && stats ? "" : "ml-auto"} flex items-center gap-1.5`}>
              <button
                type="button"
                onClick={exportCSV}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03] inline-flex items-center gap-1.5"
                style={{ background: "#fff", border: `2px solid ${CYAN}`, color: DARK }}
                title="Exportar CSV com os filtros aplicados"
              >
                <Download size={12} style={{ color: CYAN }} /> CSV
              </button>
              <button
                type="button"
                onClick={exportPDF}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03] inline-flex items-center gap-1.5"
                style={{ background: CYAN, color: "#fff" }}
                title="Exportar PDF com os filtros aplicados"
              >
                <FileText size={12} /> PDF
              </button>
            </div>
          </div>


          {/* Totais no período · por fonte + Pico do dia (lado a lado) */}
          {totalsPeriod && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3 flex-shrink-0">
              {/* Relatório em tempo real (totais por fonte no período) */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                <div className="flex items-center justify-between gap-3 px-4 py-2 flex-wrap" style={{ background: `linear-gradient(90deg, ${CYAN}22, transparent)` }}>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: DARK }}>
                    Relatório em tempo real · últimos {periodDays === 180 ? "6 meses" : `${periodDays} dias`} · por fonte
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: "#fff", border: `2px solid ${CYAN}` }}>
                      {([30, 60, 90, 180] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setPeriodDays(d)}
                          className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full transition-all"
                          style={{
                            background: periodDays === d ? CYAN : "transparent",
                            color: periodDays === d ? "#fff" : DARK,
                          }}
                        >
                          {d === 180 ? "6M" : `${d}d`}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: DARK, opacity: 0.55 }}>
                      {totalsPeriod.samples.toLocaleString("pt-BR")} registros
                    </span>
                  </div>
                </div>
                {(() => {
                  const tp = totalsPeriod;
                  const totalAll = tp.audio + tp.video + tp.youtube;
                  const pct = (n: number) => (totalAll > 0 ? Math.round((n / totalAll) * 1000) / 10 : 0);
                  const pctRadio = pct(tp.audio);
                  const pctTv = pct(tp.video);
                  const pctYt = pct(tp.youtube);
                  const hasYt = tp.youtube > 0;
                  return (
                    <>
                      {(() => {
                        const Cell = ({ label, icon, color, value, share, sublabel }: { label: string; icon: React.ReactNode; color: string; value: number; share: number; sublabel?: string }) => (
                          <div className="p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-1.5" style={{ color }}>
                              {icon}
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.6 }}>{label}</span>
                            </div>
                            <span className="text-2xl font-black leading-none tabular-nums" style={{ color }}>
                              {value.toLocaleString("pt-BR")}
                            </span>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold" style={{ color: DARK, opacity: 0.5 }}>{sublabel || "total no período"}</span>
                              <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>{share}%</span>
                            </div>
                          </div>
                        );
                        return (
                          <div className={`grid ${hasYt ? "grid-cols-4" : "grid-cols-3"} divide-x`} style={{ borderColor: `${CYAN}33` }}>
                            <Cell label="Rádio" icon={<Radio size={13} />} color={AUDIO_COLOR} value={tp.audio} share={pctRadio} />
                            <Cell label="TV" icon={<MonitorPlay size={13} />} color={VIDEO_COLOR} value={tp.video} share={pctTv} />
                            {hasYt && (
                              <Cell label="YouTube · lives" icon={<Youtube size={13} />} color="#FF0000" value={tp.youtube} share={pctYt} sublabel="soma dos picos por programa em live" />
                            )}
                        <div className="p-4 flex flex-col gap-2" style={{ background: `${LIME}22` }}>
                          <div className="flex items-center gap-1.5" style={{ color: DARK }}>
                            <Trophy size={13} />
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ opacity: 0.6 }}>Total impressões</span>
                          </div>
                          <span className="text-2xl font-black leading-none tabular-nums" style={{ color: DARK }}>
                            {totalAll.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[9px] font-bold" style={{ color: DARK, opacity: 0.55 }}>soma Rádio + TV{hasYt ? " + YouTube" : ""}</span>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Comparação · share % por fonte */}
                      <div className="px-4 pt-3 pb-4" style={{ borderTop: `1px solid ${CYAN}22` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.6 }}>Comparação · participação (%)</span>
                          <span className="text-[9px] font-bold" style={{ color: DARK, opacity: 0.5 }}>100% = total impressões</span>
                        </div>
                        <div className="flex h-3 w-full rounded-full overflow-hidden" style={{ background: `${DARK}0d` }}>
                          {totalAll > 0 && (
                            <>
                              <div style={{ width: `${pctRadio}%`, background: AUDIO_COLOR }} title={`Rádio ${pctRadio}%`} />
                              <div style={{ width: `${pctTv}%`, background: VIDEO_COLOR }} title={`TV ${pctTv}%`} />
                              {hasYt && <div style={{ width: `${pctYt}%`, background: "#FF0000" }} title={`YouTube ${pctYt}%`} />}
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] font-bold" style={{ color: DARK }}>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: AUDIO_COLOR }} />Rádio · {pctRadio}%</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: VIDEO_COLOR }} />TV · {pctTv}%</span>
                          {hasYt && <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "#FF0000" }} />YouTube · {pctYt}%</span>}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Pico do dia — áudio & vídeo com média */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                <div className="px-4 py-2" style={{ background: `linear-gradient(90deg, ${LIME}55, transparent)` }}>
                  <span className="text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5" style={{ color: DARK }}>
                    <Trophy size={12} style={{ color: DARK }} /> Pico do dia
                  </span>
                </div>
                <div className="grid grid-cols-2 divide-x" style={{ borderColor: `${CYAN}33` }}>
                  <div className="p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1" style={{ color: AUDIO_COLOR }}>
                      <Radio size={11} />
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.6 }}>Áudio</span>
                    </div>
                    <span className="text-xl font-black leading-none tabular-nums" style={{ color: AUDIO_COLOR }}>
                      {totalsPeriod.peakAudio.toLocaleString("pt-BR")}
                    </span>
                    <div className="flex items-center justify-between pt-1 border-t mt-1" style={{ borderColor: `${AUDIO_COLOR}22` }}>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>Média</span>
                      <span className="text-xs font-black tabular-nums" style={{ color: DARK }}>{totalsPeriod.avgAudio.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1" style={{ color: VIDEO_COLOR }}>
                      <MonitorPlay size={11} />
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.6 }}>Vídeo</span>
                    </div>
                    <span className="text-xl font-black leading-none tabular-nums" style={{ color: VIDEO_COLOR }}>
                      {totalsPeriod.peakVideo.toLocaleString("pt-BR")}
                    </span>
                    <div className="flex items-center justify-between pt-1 border-t mt-1" style={{ borderColor: `${VIDEO_COLOR}22` }}>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>Média</span>
                      <span className="text-xs font-black tabular-nums" style={{ color: DARK }}>{totalsPeriod.avgVideo.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "day" && (
            <>
              {stats?.hasYoutube && (
                <div className="rounded-2xl p-3 flex items-center gap-3 mb-1" style={{ background: "linear-gradient(135deg, #FFF5F5 0%, #FFE8E8 100%)", border: `1px solid #FF000033` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FF0000" }}>
                    <span className="text-white text-[10px] font-black tracking-widest">LIVE</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#B91C1C", opacity: 0.75 }}>Live YouTube · desempenho do dia</div>
                    <div className="text-xs font-bold" style={{ color: DARK, opacity: 0.7 }}>
                      Pico às <span style={{ color: "#FF0000" }}>{fmtTime(stats.peakYoutube.created_at)}</span>
                      {stats.peakYoutube.programa && <> · {stats.peakYoutube.programa}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>Pico</div>
                      <div className="text-lg font-black tabular-nums" style={{ color: "#FF0000" }}>{(stats.peakYoutube.youtube || 0).toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>Média</div>
                      <div className="text-lg font-black tabular-nums" style={{ color: DARK }}>{stats.avgYoutube.toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>Views · soma</div>
                      <div className="text-lg font-black tabular-nums" style={{ color: DARK }}>{stats.sumYoutube.toLocaleString("pt-BR")}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparação Live YouTube · Hoje vs Ontem */}
              {(stats?.hasYoutube || yesterdayYt?.has) && (() => {
                const todayPeak = stats?.hasYoutube ? (stats.peakYoutube.youtube || 0) : 0;
                const todayAvg = stats?.avgYoutube || 0;
                const todaySum = stats?.sumYoutube || 0;
                const yPeak = yesterdayYt?.peak || 0;
                const yAvg = yesterdayYt?.avg || 0;
                const ySum = yesterdayYt?.sum || 0;
                const delta = (a: number, b: number) => {
                  if (b === 0) return a > 0 ? { pct: 100, up: true } : { pct: 0, up: null as any };
                  const diff = ((a - b) / b) * 100;
                  return { pct: Math.abs(Math.round(diff)), up: diff >= 0 };
                };
                const dPeak = delta(todayPeak, yPeak);
                const dAvg = delta(todayAvg, yAvg);
                const dSum = delta(todaySum, ySum);
                const Cell = ({ label, today, yesterday, d }: { label: string; today: number; yesterday: number; d: { pct: number; up: boolean | null } }) => (
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.55 }}>{label}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: "#FF0000", opacity: 0.75 }}>Hoje</span>
                        <span className="text-lg font-black tabular-nums leading-tight" style={{ color: "#FF0000" }}>{today.toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.5 }}>Ontem</span>
                        <span className="text-lg font-black tabular-nums leading-tight" style={{ color: DARK, opacity: 0.75 }}>{yesterday.toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                    {d.up !== null && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-black tabular-nums self-start px-1.5 py-0.5 rounded-full"
                        style={{
                          background: d.up ? "#DCFCE7" : "#FEE2E2",
                          color: d.up ? "#166534" : "#991B1B",
                        }}>
                        {d.up ? "▲" : "▼"} {d.pct}%
                      </div>
                    )}
                  </div>
                );
                return (
                  <div className="rounded-2xl overflow-hidden mb-1" style={{ background: "#fff", border: `1px solid #FF000033` }}>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #FFE8E8 0%, transparent 100%)" }}>
                      <span className="text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5" style={{ color: "#B91C1C" }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#FF0000" }} />
                        Live YouTube · Hoje vs Ontem
                      </span>
                      {yesterdayYt?.dateLabel && (
                        <span className="text-[9px] font-bold" style={{ color: DARK, opacity: 0.55 }}>Ontem = {yesterdayYt.dateLabel}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 divide-x" style={{ borderColor: "#FF000022" }}>
                      <Cell label="Pico" today={todayPeak} yesterday={yPeak} d={dPeak} />
                      <Cell label="Média" today={todayAvg} yesterday={yAvg} d={dAvg} />
                      <Cell label="Soma · views" today={todaySum} yesterday={ySum} d={dSum} />
                    </div>
                  </div>
                );
              })()}



              {/* Gráfico + Tabela lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-[420px]">
                {/* Mini gráfico intra-dia (áudio vs vídeo por hora) */}
                <div className="lg:col-span-2 rounded-2xl p-3 pt-4 flex flex-col min-h-0" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                  <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-2 flex items-center justify-between" style={{ color: DARK }}>
                    <span style={{ opacity: 0.7 }}>Curva do dia · Rádio · TV · YouTube</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: AUDIO_COLOR }} />Rádio</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: VIDEO_COLOR }} />TV</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "#FF0000" }} />YouTube</span>
                    </span>
                  </div>
                  <div className="flex-1 min-h-[180px]">
                    {filteredRows.length > 0 ? (() => {
                      const chartData = [...filteredRows].reverse().map((r) => ({ time: fmtTime(r.created_at), audio: r.audio, video: r.video, youtube: r.youtube || 0 }));
                      // Identifica todas as "faixas" contínuas de live no YouTube para sombrear no gráfico.
                      const liveBands: { start: string; end: string; total: number }[] = [];
                      let bandStart: number | null = null;
                      let bandSum = 0;
                      for (let i = 0; i < chartData.length; i++) {
                        const isLive = chartData[i].youtube > 0;
                        if (isLive && bandStart === null) { bandStart = i; bandSum = chartData[i].youtube; }
                        else if (isLive) { bandSum += chartData[i].youtube; }
                        if ((!isLive || i === chartData.length - 1) && bandStart !== null) {
                          const endIdx = isLive ? i : i - 1;
                          liveBands.push({ start: chartData[bandStart].time, end: chartData[endIdx].time, total: bandSum });
                          bandStart = null; bandSum = 0;
                        }
                      }
                      return (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gAudio" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={AUDIO_COLOR} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={AUDIO_COLOR} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gVideo" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={VIDEO_COLOR} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={VIDEO_COLOR} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gYoutube" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#FF0000" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#FF0000" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#00BFF033" />
                          <XAxis dataKey="time" tick={{ fill: DARK, fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: DARK, fontSize: 9 }} width={38} />
                          <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${CYAN}`, borderRadius: 12, fontSize: 12 }} />
                          {liveBands.map((b, idx) => (
                            <ReferenceArea key={idx} x1={b.start} x2={b.end} strokeOpacity={0} fill="#FF0000" fillOpacity={0.06} ifOverflow="extendDomain">
                              <ChartLabel value={`LIVE · ${b.total.toLocaleString("pt-BR")} views`} position="insideTop" fill="#B91C1C" fontSize={9} fontWeight={700} />
                            </ReferenceArea>
                          ))}
                          <Area type="monotone" dataKey="audio" stroke={AUDIO_COLOR} strokeWidth={2} fill="url(#gAudio)" name="Rádio" />
                          <Area type="monotone" dataKey="video" stroke={VIDEO_COLOR} strokeWidth={2} fill="url(#gVideo)" name="TV" />
                          <Area type="monotone" dataKey="youtube" stroke="#FF0000" strokeWidth={2} fill="url(#gYoutube)" name="YouTube" />
                        </AreaChart>
                      </ResponsiveContainer>
                      );
                    })() : (
                      <div className="h-full flex items-center justify-center text-[11px] font-semibold" style={{ color: DARK, opacity: 0.4 }}>
                        Sem dados para plotar
                      </div>
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="lg:col-span-3 rounded-2xl overflow-hidden flex flex-col min-h-0" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                      <thead className="sticky top-0 z-10">
                        <tr style={{ background: `linear-gradient(180deg, ${CYAN} 0%, #00A9D6 100%)`, color: "#fff" }}>
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest">Hora</th>
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest">Programa</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest">Rádio</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest">TV</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest">YouTube</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr><td colSpan={6} className="py-10 text-center">
                            <Loader2 className="inline-block animate-spin" size={20} style={{ color: CYAN }} />
                          </td></tr>
                        )}
                        {!loading && filteredRows.length === 0 && (
                          <tr><td colSpan={6} className="py-10 text-center text-xs font-semibold" style={{ color: DARK, opacity: 0.55 }}>
                            Nenhum registro encontrado para essa data.
                          </td></tr>
                        )}
                        {!loading && filteredRows.map((r, i) => {
                          const isPeak = stats && r.id === stats.peakTotal.id;
                          const yt = r.youtube || 0;
                          const total = (r.audio || 0) + (r.video || 0) + yt;
                          return (
                            <tr key={r.id} style={{
                              background: isPeak ? `${LIME}44` : (i % 2 === 0 ? "#fff" : "#F4FBFD"),
                              borderLeft: isPeak ? `4px solid ${LIME}` : "4px solid transparent",
                            }}>
                              <td className="px-3 py-2 text-xs font-mono font-bold whitespace-nowrap" style={{ color: CYAN }}>
                                {fmtTime(r.created_at)}
                                {isPeak && <Trophy size={11} className="inline-block ml-1" style={{ color: DARK }} />}
                              </td>
                              <td className="px-3 py-2 text-xs font-bold" style={{ color: DARK, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.programa || ""}>
                                {r.programa || <span style={{ opacity: 0.4, fontWeight: 500 }}>— sem programa —</span>}
                              </td>
                              <td className="px-3 py-2 text-xs font-black text-right tabular-nums" style={{ color: AUDIO_COLOR }}>{r.audio.toLocaleString("pt-BR")}</td>
                              <td className="px-3 py-2 text-xs font-black text-right tabular-nums" style={{ color: VIDEO_COLOR }}>{r.video.toLocaleString("pt-BR")}</td>
                              <td className="px-3 py-2 text-xs font-black text-right tabular-nums" style={{ color: yt > 0 ? "#FF0000" : DARK, opacity: yt > 0 ? 1 : 0.35 }}>{yt.toLocaleString("pt-BR")}</td>
                              <td className="px-3 py-2 text-xs font-black text-right tabular-nums" style={{ color: DARK }}>{total.toLocaleString("pt-BR")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between" style={{ background: BG, color: DARK }}>
                    <span>{filteredRows.length} registros</span>
                    <span>Registro a cada 15 min · retenção de 6 meses</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "trend" && (
            <TrendPanel
              loading={trendLoading}
              data={trendRows}
              cyan={CYAN}
              lime={LIME}
              dark={DARK}
              bg={BG}
              audioColor={AUDIO_COLOR}
              videoColor={VIDEO_COLOR}
            />
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, time, icon, cyan, dark }: { label: string; value: number; time?: string; icon: React.ReactNode; cyan: string; dark: string }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: "#fff", border: `1px solid ${cyan}` }}>
      <div className="flex items-center gap-1.5" style={{ color: cyan }}>
        {icon}
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: dark, opacity: 0.6 }}>{label}</span>
      </div>
      <span className="text-2xl font-black leading-none" style={{ color: dark }}>{value.toLocaleString("pt-BR")}</span>
      {time && <span className="text-[9px] font-bold" style={{ color: dark, opacity: 0.55 }}>às {time}</span>}
    </div>
  );
}


function SourceField({
  icon,
  label,
  placeholder,
  value,
  onChange,
  error,
  actionLabel,
  onAction,
  actionDisabled,
  suggestions,
  onPickSuggestion,
  helperText,
}: {
  icon?: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  suggestions?: Array<{ xpath: string; value: number }>;
  onPickSuggestion?: (xpath: string) => void;
  helperText?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#0A2540", opacity: 0.7 }}>
        {icon && <span style={{ color: "#00BFF0" }}>{icon}</span>}
        {label}
      </span>

      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2.5 text-sm outline-none transition-all"
          style={{
            background: "#fff",
            border: `2px solid ${error ? "#E11D48" : "#00BFF0"}`,
            borderRadius: 999,
            color: "#0A2540",
            fontFamily: "Montserrat, sans-serif",
            paddingRight: actionLabel ? 130 : undefined,
          }}
        />
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-full transition-transform hover:scale-[1.03] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "#00BFF0", color: "#fff", fontFamily: "Montserrat, sans-serif" }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {helperText && !error && (
        <span className="text-[10px] px-3" style={{ color: "#0A2540", opacity: 0.55 }}>
          {helperText}
        </span>
      )}
      {error && (
        <span className="text-[10px] font-semibold px-3" style={{ color: "#E11D48" }}>
          {error}
        </span>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-col gap-1 mt-1 px-1">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#0A2540", opacity: 0.55 }}>
            Sugestões encontradas
          </span>
          {suggestions.map((s) => {
            const isActive = s.xpath === value;
            return (
              <button
                key={s.xpath}
                type="button"
                onClick={() => onPickSuggestion?.(s.xpath)}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-full text-[11px] transition-all hover:scale-[1.01] text-left"
                style={{
                  background: isActive ? "#C6F03C" : "#fff",
                  border: `1.5px solid ${isActive ? "#8FBB1F" : "#00BFF0"}`,
                  color: "#0A2540",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                <span className="font-mono truncate">{s.xpath}</span>
                <span className="font-black shrink-0" style={{ color: "#00BFF0" }}>{s.value}</span>
              </button>
            );
          })}
        </div>
      )}
    </label>
  );
}

function StreamSourceRow({
  kind,
  index,
  isExtra,
  url,
  xpath,
  showXpath,
  onUrlChange,
  onXpathChange,
  onToggleXpath,
  onAddExtra,
  onRemove,
  xpathError,
  probing,
  onProbe,
  suggestions,
  onPickSuggestion,
}: {
  kind: "audio" | "video";
  index: number;
  isExtra?: boolean;
  url: string;
  xpath: string;
  showXpath: boolean;
  onUrlChange: (v: string) => void;
  onXpathChange: (v: string) => void;
  onToggleXpath: () => void;
  onAddExtra?: () => void;
  onRemove?: () => void;
  xpathError?: string | null;
  probing?: boolean;
  onProbe?: () => void;
  suggestions?: Array<{ xpath: string; value: number }>;
  onPickSuggestion?: (xpath: string) => void;
}) {
  const isAudio = kind === "audio";
  const label = isExtra
    ? `Fonte adicional #${(index ?? 0) + 1}`
    : "URL do stream";
  const xpathLabel = isAudio
    ? "XPath do nódulo de ouvintes"
    : "XPath do nódulo de espectadores";
  const xpathPh = isAudio
    ? "//SHOUTCASTSERVER/CURRENTLISTENERS"
    : "//info/espectadores_conectados";
  const urlPh = isAudio
    ? "https://seu-servidor:8000/stream"
    : "https://video.logicahost.com.br/api/...";
  return (
    <div
      className={isExtra ? "flex flex-col gap-2 rounded-xl p-3" : "flex flex-col gap-2"}
      style={isExtra ? { background: "rgba(0,191,240,0.06)", border: "1px dashed rgba(0,191,240,0.35)" } : undefined}
    >
      <SourceField
        label={label}
        placeholder={urlPh}
        value={url}
        onChange={onUrlChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleXpath}
          className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03]"
          style={{
            background: showXpath ? "#0A2540" : "transparent",
            border: `1.5px solid ${showXpath ? "#0A2540" : "#00BFF0"}`,
            color: showXpath ? "#fff" : "#0A2540",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          {showXpath ? "− Ocultar XPath" : "+ Inserir XPath"}
        </button>
        {onAddExtra && (
          <button
            type="button"
            onClick={onAddExtra}
            className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03]"
            style={{
              background: "#C6F03C",
              border: "1.5px solid #8FBB1F",
              color: "#0A2540",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            + Adicionar outra fonte
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-transform hover:scale-[1.03]"
            style={{
              background: "transparent",
              border: "1.5px solid #E11D48",
              color: "#E11D48",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Remover
          </button>
        )}
      </div>
      {showXpath && (
        <SourceField
          label={xpathLabel}
          placeholder={xpathPh}
          value={xpath}
          onChange={onXpathChange}
          error={xpathError}
          actionLabel={onProbe ? (probing ? "Analisando..." : "Sugerir XPath") : undefined}
          onAction={onProbe}
          actionDisabled={probing}
          suggestions={suggestions}
          onPickSuggestion={onPickSuggestion}
          helperText={
            isAudio
              ? "Detecta automaticamente o campo com o número de ouvintes."
              : "Detecta automaticamente o campo com o número de espectadores."
          }
        />
      )}
    </div>
  );
}



function Skeleton({ width, height, dark, className }: { width: number | string; height: number; dark: string; className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse ${className || "rounded-md"}`}
      style={{
        width,
        height,
        background: `${dark}22`,
      }}
    />
  );
}

function StatCell({
  icon,
  label,
  value,
  loading,
  dark,
  rotationKey,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  loading?: boolean;
  dark: string;
  rotationKey?: string;
  badge?: React.ReactNode;
}) {
  const display =
    value === null ? "-" : value.toLocaleString("pt-BR");
  return (
    <div
      className="rounded-2xl flex flex-col items-start justify-between p-3 min-w-0 relative"
      style={{ background: "rgba(255,255,255,0.35)" }}
    >
      {badge && (
        <div className="absolute top-1.5 right-1.5 z-10">{badge}</div>
      )}
      <div style={{ color: dark, opacity: 0.75 }}>{icon}</div>
      <div key={rotationKey} className="flex flex-col min-w-0 w-full animate-fade-in">
        {loading ? (
          <span className="inline-flex items-center gap-1.5" style={{ color: dark }}>
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ opacity: 0.65 }}>Carregando</span>
          </span>
        ) : (
          <span
            className="text-2xl font-black leading-none truncate"
            style={{ color: dark }}
          >
            {display}
          </span>
        )}
        <span
          className="text-[9px] font-semibold uppercase mt-1 truncate"
          style={{ color: dark, opacity: 0.6, letterSpacing: 1 }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

function DeltaBadge({ delta, dark, loading }: { delta: number | null; dark: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded-full px-1.5 py-0.5" style={{ background: `${dark}33` }}>
        <Skeleton width={38} height={10} dark={dark} className="rounded-full" />
      </div>
    );
  }
  if (delta === null || delta === undefined) return null;
  const up = delta > 0;
  const down = delta < 0;
  const zero = delta === 0;
  const bg = up ? "#16A34A" : down ? "#DC2626" : `${dark}33`;
  const color = zero ? dark : "#fff";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const label = zero ? "0" : `${up ? "+" : ""}${delta.toLocaleString("pt-BR")}`;
  return (
    <div
      className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
      title={up ? "Ganhou seguidores" : down ? "Perdeu seguidores" : "Sem variação"}
      style={{ background: bg, color, fontSize: 9, fontWeight: 900, lineHeight: 1 }}
    >
      <Icon size={9} strokeWidth={3} />
      <span>{label}</span>
    </div>
  );
}

function PeakBadge({ peak, dark, loading }: { peak: number | null; dark: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded-full px-1.5 py-0.5" style={{ background: `${dark}33` }}>
        <Skeleton width={32} height={10} dark={dark} className="rounded-full" />
      </div>
    );
  }
  if (peak === null || peak <= 0) return null;
  return (
    <div
      className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
      title="Pico de audiência do dia"
      style={{ background: dark, color: "#C6F03C", fontSize: 9, fontWeight: 900, lineHeight: 1 }}
    >
      <Trophy size={9} strokeWidth={3} />
      <span>{peak.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function TrendPanel({
  loading,
  data,
  cyan,
  lime,
  dark,
  bg,
  audioColor,
  videoColor,
}: {
  loading: boolean;
  data: Array<{ day: string; audio: number; video: number; peakAudio?: number; peakVideo?: number }>;
  cyan: string;
  lime: string;
  dark: string;
  bg: string;
  audioColor: string;
  videoColor: string;
}) {
  const totals = useMemo(() => {
    const tAudio = data.reduce((s, r) => s + r.audio, 0);
    const tVideo = data.reduce((s, r) => s + r.video, 0);
    const peakAudio = data.reduce((m, r) => ((r.peakAudio ?? r.audio) > m ? (r.peakAudio ?? r.audio) : m), 0);
    const peakVideo = data.reduce((m, r) => ((r.peakVideo ?? r.video) > m ? (r.peakVideo ?? r.video) : m), 0);
    const avgAudio = data.length ? Math.round(tAudio / data.length) : 0;
    const avgVideo = data.length ? Math.round(tVideo / data.length) : 0;
    const dominance = tAudio + tVideo > 0
      ? Math.round((tAudio / (tAudio + tVideo)) * 100)
      : 0;
    return { tAudio, tVideo, peakAudio, peakVideo, avgAudio, avgVideo, dominance };
  }, [data]);

  // Agrupa por mês para o gráfico de barras comparativo
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; audio: number; video: number; count: number }>();
    for (const r of data) {
      const key = r.day.slice(0, 7); // YYYY-MM
      const b = map.get(key) || { month: key, audio: 0, video: 0, count: 0 };
      b.audio += r.audio;
      b.video += r.video;
      b.count += 1;
      map.set(key, b);
    }
    const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => {
        const [y, m] = b.month.split("-");
        return {
          month: `${MESES[parseInt(m, 10) - 1]}/${y.slice(2)}`,
          audio: Math.round(b.audio / Math.max(1, b.count)),
          video: Math.round(b.video / Math.max(1, b.count)),
        };
      });
  }, [data]);

  const fmtDay = (day: string) => {
    const [, m, d] = day.split("-");
    return `${d}/${m}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: cyan }}>
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center text-xs font-semibold" style={{ background: "#fff", color: dark, opacity: 0.6, border: `1px solid ${cyan}` }}>
        Ainda não há histórico suficiente para gerar a tendência dos últimos 6 meses.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-auto pr-1" style={{ maxHeight: "60vh" }}>
      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        <MiniStat label="Pico Rádio · 6m" value={totals.peakAudio} icon={<Radio size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Pico TV · 6m" value={totals.peakVideo} icon={<MonitorPlay size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Média Rádio" value={totals.avgAudio} icon={<Radio size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Média TV" value={totals.avgVideo} icon={<MonitorPlay size={14} />} cyan={cyan} dark={dark} />
      </div>

      {/* Dominância */}
      <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: "#fff", border: `1px solid ${cyan}` }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: dark, opacity: 0.6 }}>Composição da audiência (6 meses)</span>
          <span className="text-[10px] font-bold" style={{ color: dark, opacity: 0.6 }}>
            <span style={{ color: audioColor, fontWeight: 900 }}>{totals.dominance}%</span> áudio · <span style={{ color: videoColor, fontWeight: 900 }}>{100 - totals.dominance}%</span> vídeo
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex" style={{ background: `${cyan}22` }}>
          <div style={{ width: `${totals.dominance}%`, background: audioColor }} />
          <div style={{ width: `${100 - totals.dominance}%`, background: videoColor }} />
        </div>
      </div>

      {/* Tendência diária */}
      <div className="rounded-2xl p-3 pt-4" style={{ background: "#fff", border: `1px solid ${cyan}` }}>
        <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-2" style={{ color: dark, opacity: 0.7 }}>
          Tendência diária · Rádio vs TV
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.map((r) => ({ day: fmtDay(r.day), audio: r.audio, video: r.video }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={`${cyan}33`} />
            <XAxis dataKey="day" tick={{ fill: dark, fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fill: dark, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${cyan}`, borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            <Line type="monotone" dataKey="audio" stroke={audioColor} strokeWidth={2.5} dot={false} name="Áudio" />
            <Line type="monotone" dataKey="video" stroke={videoColor} strokeWidth={2.5} dot={false} name="Vídeo" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Comparação mensal */}
      <div className="rounded-2xl p-3 pt-4" style={{ background: "#fff", border: `1px solid ${cyan}` }}>
        <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-2" style={{ color: dark, opacity: 0.7 }}>
          Comparação mensal · Média por mês
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke={`${cyan}33`} />
            <XAxis dataKey="month" tick={{ fill: dark, fontSize: 10 }} />
            <YAxis tick={{ fill: dark, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${cyan}`, borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            <Bar dataKey="audio" fill={audioColor} name="Áudio" radius={[6, 6, 0, 0]} />
            <Bar dataKey="video" fill={videoColor} name="Vídeo" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: dark, opacity: 0.55 }}>
        Baseado em registros a cada 15 min · retenção de 6 meses
      </div>
    </div>
  );
}


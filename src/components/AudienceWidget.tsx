import { useEffect, useState, useRef, useMemo } from "react";
import { Users, Radio, MonitorPlay, Facebook, Instagram, Youtube, Globe, Settings, FileBarChart, Loader2, Calendar as CalendarIcon, Trophy, X, TrendingUp, TrendingDown, Minus, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";

interface Props {
  dataUserId?: string;
  heightPx?: number;
}

interface SocialCounts {
  youtube: number | null;
  instagram: number | null;
  facebook: number | null;
}

interface SourcesConfig {
  instagram: string;
  facebook: string;
  youtube: string;
  audio_stream_api_url: string;
  audio_stream_xpath: string;
  video_stream_api_url: string;
  video_stream_xpath: string;

}


const ROTATE_MS = 3000;
// Redes sociais: 5x por dia (a cada ~4h48m)
const REFETCH_MS = Math.round((24 * 60 * 60 * 1000) / 5);
const LISTENERS_MS = 30 * 1000; // 30s for stream listeners
const SITE_MS = 30 * 1000; // 30s for site realtime users
const VIDEO_MS = 30 * 1000; // 30s for video viewers

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

  });

  const initialSourcesRef = useRef<SourcesConfig | null>(null);
  const [audioXPathError, setAudioXPathError] = useState<string | null>(null);
  const [videoXPathError, setVideoXPathError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [probing, setProbing] = useState<"audio" | "video" | null>(null);
  const [audioSuggestions, setAudioSuggestions] = useState<Array<{ xpath: string; value: number }>>([]);
  const [videoSuggestions, setVideoSuggestions] = useState<Array<{ xpath: string; value: number }>>([]);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Refs to keep latest counts for the periodic history logger
  const streamingRef = useRef<number | null>(null);
  const videoRef = useRef<number | null>(null);
  useEffect(() => { streamingRef.current = streamingCount; }, [streamingCount]);
  useEffect(() => { videoRef.current = videoCount; }, [videoCount]);

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
  const peaksInitializedRef = useRef(false);
  const alertsStorageKey = dataUserId ? `audience:peakAlerts:${dataUserId}:${new Date().toISOString().slice(0, 10)}` : null;

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
    const alert: PeakAlert = {
      id: `${type}-${Date.now()}`,
      type,
      value,
      at: new Date().toISOString(),
    };
    setAlerts((prev) => {
      const next = [alert, ...prev].slice(0, 20);
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
      // Try direct config read first (works for owner/sub-user/admin) so we can
      // populate the rotation labels immediately.
      const { data } = await supabase
        .from("empresa_config")
        .select("youtube, instagram, facebook, video_stream_api_url, audio_stream_api_url, audio_stream_xpath, video_stream_xpath")
        .eq("user_id", dataUserId as any)
        .maybeSingle();
      if (!cancelled && data) {
        socialUrlsRef.current = {
          youtube: (data as any).youtube || undefined,
          instagram: (data as any).instagram || undefined,
          facebook: (data as any).facebook || undefined,
        };
        videoApiUrlRef.current = (data as any).video_stream_api_url || null;
        const s: SourcesConfig = {
          instagram: (data as any).instagram || "",
          facebook: (data as any).facebook || "",
          youtube: (data as any).youtube || "",
          audio_stream_api_url: (data as any).audio_stream_api_url || "",
          audio_stream_xpath: (data as any).audio_stream_xpath || "",
          video_stream_api_url: (data as any).video_stream_api_url || "",
          video_stream_xpath: (data as any).video_stream_xpath || "",
        };


        setSources(s);
      }
      if (!cancelled) setLoadingConfig(false);

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
          youtube: r.youtube ?? null,
          instagram: r.instagram ?? null,
          facebook: r.facebook ?? null,
        });
      }
      setLoadingSocial(false);
      setLoadingConfig(false);
    };

    fetchAll();
    const iv = setInterval(fetchAll, REFETCH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId]);

  // Poll audio stream stats using the URL (and optionally the XPath) configured
  // in the popup. If no XPath is provided, the edge function tries to detect a
  // common listeners tag/field automatically.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const overrideUrl = sources.audio_stream_api_url?.trim();
    const xpath = sources.audio_stream_xpath?.trim();
    if (!overrideUrl) {
      setStreamingCount(null);
      setLoadingStreaming(false);
      return;
    }
    const tick = async () => {
      const body: Record<string, unknown> = { userId: dataUserId, urls: [overrideUrl] };
      if (xpath) body.xpath = xpath;
      const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
      if (cancelled) return;
      if (data && (data as any).ok) {
        const n = (data as any).listeners;
        setStreamingCount(typeof n === "number" ? n : null);
      } else {
        setStreamingCount(null);
      }
      setLoadingStreaming(false);
    };
    tick();
    const iv = setInterval(tick, LISTENERS_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId, sources.audio_stream_api_url, sources.audio_stream_xpath]);




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

  // Poll video streaming stats using ONLY the URL + XPath configured in the popup.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const url = sources.video_stream_api_url?.trim();
    const xpath = sources.video_stream_xpath?.trim();
    if (!url || !xpath) {
      setVideoCount(null);
      setLoadingVideo(false);
      return;
    }
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const text = (await r.text()).trim();
        const count = extractByPath(text, xpath);
        if (!cancelled) setVideoCount(typeof count === "number" ? count : null);
      } catch {
        if (!cancelled) setVideoCount(null);
      }
      if (!cancelled) setLoadingVideo(false);
    };
    tick();
    const iv = setInterval(tick, VIDEO_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId, sources.video_stream_api_url, sources.video_stream_xpath]);

  // Log audiência a cada 5 minutos para o relatório histórico
  useEffect(() => {
    if (!dataUserId) return;
    const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const logNow = async () => {
      const audio = streamingRef.current ?? 0;
      const video = videoRef.current ?? 0;
      if (audio === 0 && video === 0) return;
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


  const socialTotal =
    (social.youtube || 0) + (social.instagram || 0) + (social.facebook || 0);
  const viewersNow = (streamingCount || 0) + (videoCount || 0);
  const bg = "#d9ff65";
  const dark = "#0A2540";


  // Rotation list — only networks that have a URL configured
  const rotation: {
    key: "youtube" | "instagram" | "facebook";
    label: string;
    icon: React.ReactNode;
    value: number | null;
  }[] = [];
  if (socialUrlsRef.current.youtube)
    rotation.push({ key: "youtube", label: "YouTube", icon: <Youtube size={14} />, value: social.youtube });
  if (socialUrlsRef.current.instagram)
    rotation.push({ key: "instagram", label: "Instagram", icon: <Instagram size={14} />, value: social.instagram });
  if (socialUrlsRef.current.facebook)
    rotation.push({ key: "facebook", label: "Facebook", icon: <Facebook size={14} />, value: social.facebook });

  const current =
    rotation.length > 0 ? rotation[rotIdx % rotation.length] : null;

  const openConfig = () => {
    initialSourcesRef.current = { ...sources };
    setConfigOpen(true);
  };

  const persistIfChanged = async () => {
    if (!dataUserId) return;
    const initial = initialSourcesRef.current;
    if (!initial) return;
    const changed =
      initial.instagram !== sources.instagram ||
      initial.facebook !== sources.facebook ||
      initial.youtube !== sources.youtube ||
      initial.audio_stream_api_url !== sources.audio_stream_api_url ||
      initial.audio_stream_xpath !== sources.audio_stream_xpath ||
      initial.video_stream_api_url !== sources.video_stream_api_url ||
      initial.video_stream_xpath !== sources.video_stream_xpath;
    if (!changed) return;

    const payload = {
      user_id: dataUserId,
      instagram: sources.instagram.trim() || null,
      facebook: sources.facebook.trim() || null,
      youtube: sources.youtube.trim() || null,
      audio_stream_api_url: sources.audio_stream_api_url.trim() || null,
      audio_stream_xpath: sources.audio_stream_xpath.trim() || null,
      video_stream_api_url: sources.video_stream_api_url.trim() || null,
      video_stream_xpath: sources.video_stream_xpath.trim() || null,
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
        <button
          onClick={openConfig}
          aria-label="Configurar fontes"
          title="Configurar fontes"
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
          style={{ background: "rgba(10,37,64,0.12)", color: dark }}
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 pr-10">
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
              Total de seguidores
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
            <Radio size={16} style={{ color: bg }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-[9px] font-bold uppercase truncate"
              style={{ color: dark, opacity: 0.6, letterSpacing: 1.2 }}
            >
              Espectadores agora
            </span>
            {(loadingStreaming && streamingCount === null) || (loadingVideo && videoCount === null) ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: dark }}>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ opacity: 0.65 }}>Carregando</span>
              </span>
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
      </div>


      <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
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
          label="Streaming de áudio"
          value={streamingCount}
          loading={loadingStreaming && streamingCount === null}
          dark={dark}
          badge={<PeakBadge peak={audioPeak} dark={dark} loading={audioPeak === null} />}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Streaming de vídeo"
          value={videoCount}
          loading={loadingVideo && videoCount === null}
          dark={dark}
          badge={<PeakBadge peak={videoPeak} dark={dark} loading={videoPeak === null} />}
        />
        <StatCell
          icon={<Globe size={14} />}
          label="Conectados no Player"
          value={siteCount}
          loading={loadingSite && siteCount === null}
          dark={dark}
        />

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
        <DialogContent className="max-w-lg" style={{ background: "#D6F4FB", borderRadius: 28, border: "none", fontFamily: "Montserrat, sans-serif" }}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#00BFF0" }}>
                <Settings size={18} color="#fff" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-base font-black uppercase tracking-wider" style={{ color: "#0A2540" }}>
                  Fontes da Audiência
                </DialogTitle>
                <DialogDescription className="text-xs" style={{ color: "#0A2540", opacity: 0.6 }}>
                  Validado ao salvar.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-2">
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
            <SourceField
              icon={<Radio size={14} />}
              label="Source Audio"
              placeholder="https://seu-servidor:8000/stream"
              value={sources.audio_stream_api_url}
              onChange={(v) => setSources((s) => ({ ...s, audio_stream_api_url: v }))}
            />
            <SourceField
              label="XPath (nódulo XML do Source Audio)"
              placeholder="//SHOUTCASTSERVER/CURRENTLISTENERS"
              value={sources.audio_stream_xpath}
              onChange={(v) => { setSources((s) => ({ ...s, audio_stream_xpath: v })); setAudioXPathError(null); }}
              error={audioXPathError}
              actionLabel={probing === "audio" ? "Analisando..." : "Sugerir XPath"}
              onAction={() => probeXPath("audio")}
              actionDisabled={probing !== null}
              suggestions={audioSuggestions}
              onPickSuggestion={(xp) => { setSources((s) => ({ ...s, audio_stream_xpath: xp })); setAudioXPathError(null); }}
              helperText="Clique em Sugerir XPath para detectar automaticamente o campo com o número de ouvintes."
            />
            <SourceField
              icon={<MonitorPlay size={14} />}
              label="Source Video"
              placeholder="https://video.logicahost.com.br/api/..."
              value={sources.video_stream_api_url}
              onChange={(v) => setSources((s) => ({ ...s, video_stream_api_url: v }))}
            />
            <SourceField
              label="XPath (nódulo XML do Source Video)"
              placeholder="//info/espectadores_conectados"
              value={sources.video_stream_xpath}
              onChange={(v) => { setSources((s) => ({ ...s, video_stream_xpath: v })); setVideoXPathError(null); }}
              error={videoXPathError}
              actionLabel={probing === "video" ? "Analisando..." : "Sugerir XPath"}
              onAction={() => probeXPath("video")}
              actionDisabled={probing !== null}
              suggestions={videoSuggestions}
              onPickSuggestion={(xp) => { setSources((s) => ({ ...s, video_stream_xpath: xp })); setVideoXPathError(null); }}
              helperText="Clique em Sugerir XPath para detectar automaticamente o campo com o número de espectadores."
            />
            {probeError && (
              <span className="text-[10px] font-semibold px-3" style={{ color: "#E11D48" }}>{probeError}</span>
            )}


            <button
              type="button"
              disabled={validating}
              onClick={async () => {
                const ok = await validateXPaths();
                if (!ok) return;
                await persistIfChanged();
                setConfigOpen(false);
              }}
              className="mt-2 w-full py-3 text-sm font-black uppercase tracking-wider rounded-full transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
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

          <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-auto">
            {alerts.length === 0 && (
              <div className="text-center py-10 text-xs font-semibold" style={{ color: dark, opacity: 0.55 }}>
                Nenhum novo pico registrado hoje.
                <br />
                <span className="text-[10px]">Você será notificado quando a audiência bater um recorde.</span>
              </div>
            )}
            {alerts.map((a) => {
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
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(todayStr());
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"day" | "trend">("day");
  const [trendRows, setTrendRows] = useState<Array<{ day: string; audio: number; video: number; peakAudio: number; peakVideo: number }>>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [programaFilter, setProgramaFilter] = useState<string>("__ALL__");
  const [programOptions, setProgramOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("id, created_at, programa, audio, video")
        .eq("user_id", userId as any)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows((data as any as HistRow[]) || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, userId, date]);

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
    const peakTotal = filteredRows.reduce((m, r) => ((r.audio + r.video) > (m.audio + m.video) ? r : m), filteredRows[0]);
    const avgAudio = Math.round(filteredRows.reduce((s, r) => s + r.audio, 0) / filteredRows.length);
    const avgVideo = Math.round(filteredRows.reduce((s, r) => s + r.video, 0) / filteredRows.length);
    return { peakAudio, peakVideo, peakTotal, avgAudio, avgVideo };
  }, [filteredRows]);


  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[95vw] p-0 overflow-hidden"
        style={{ background: BG, borderRadius: 28, border: "none", fontFamily: "Montserrat, sans-serif" }}
      >
        <div style={{ background: `linear-gradient(135deg, ${CYAN} 0%, #00A9D6 100%)`, padding: "20px 24px" }}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                <FileBarChart size={20} color="#fff" />
              </div>
              <div className="flex flex-col">
                <DialogTitle className="text-lg font-black uppercase tracking-wider text-white">
                  Relatório de Audiência
                </DialogTitle>
                <DialogDescription className="text-xs text-white/85">
                  Histórico consolidado de áudio e vídeo por programa.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-hidden">
          {/* Tabs Dia / 6 Meses */}
          <div className="flex items-center gap-2 p-1 rounded-full self-start" style={{ background: "#fff", border: `2px solid ${CYAN}` }}>
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

          {/* Filtro de programa (aplica a Dia e 6 Meses) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: DARK, opacity: 0.6 }}>
              Programa
            </span>
            <div className="relative">
              <select
                value={programaFilter}
                onChange={(e) => setProgramaFilter(e.target.value)}
                className="appearance-none text-xs font-bold outline-none pl-4 pr-9 py-2 rounded-full cursor-pointer"
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
            <span className="text-[10px] font-bold" style={{ color: DARK, opacity: 0.5 }}>
              {programaFilter === "__ALL__"
                ? "Estatísticas somam todos os registros"
                : `Picos e médias apenas de "${programaFilter}"`}
            </span>
          </div>


          {view === "day" && (
            <>
              {/* Filtro + Highlights */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: "#fff", border: `2px solid ${CYAN}` }}>
                  <CalendarIcon size={14} style={{ color: CYAN }} />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-sm font-bold outline-none bg-transparent"
                    style={{ color: DARK, fontFamily: "Montserrat, sans-serif" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDate(todayStr())}
                  className="text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-full transition-transform hover:scale-[1.03]"
                  style={{ background: LIME, color: DARK }}
                >
                  Hoje
                </button>
                <div className="flex-1" />
                {stats && (
                  <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: DARK, color: "#fff" }}>
                    <Trophy size={14} style={{ color: LIME }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Pico do dia</span>
                    <span className="text-sm font-black">{(stats.peakTotal.audio + stats.peakTotal.video).toLocaleString("pt-BR")}</span>
                    <span className="text-[10px] opacity-70">às {fmtTime(stats.peakTotal.created_at)}</span>
                  </div>
                )}
              </div>

              {/* Stat cards */}
              {stats && (
                <div className="grid grid-cols-4 gap-3">
                  <MiniStat label="Pico Áudio" value={stats.peakAudio.audio} time={fmtTime(stats.peakAudio.created_at)} icon={<Radio size={14} />} cyan={CYAN} dark={DARK} />
                  <MiniStat label="Pico Vídeo" value={stats.peakVideo.video} time={fmtTime(stats.peakVideo.created_at)} icon={<MonitorPlay size={14} />} cyan={CYAN} dark={DARK} />
                  <MiniStat label="Média Áudio" value={stats.avgAudio} icon={<Radio size={14} />} cyan={CYAN} dark={DARK} />
                  <MiniStat label="Média Vídeo" value={stats.avgVideo} icon={<MonitorPlay size={14} />} cyan={CYAN} dark={DARK} />
                </div>
              )}

              {/* Mini gráfico intra-dia (áudio vs vídeo por hora) */}
              {filteredRows.length > 0 && (
                <div className="rounded-2xl p-3 pt-4" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                  <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-2" style={{ color: DARK, opacity: 0.7 }}>
                    Curva do dia · Áudio vs Vídeo
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={[...filteredRows].reverse().map((r) => ({ time: fmtTime(r.created_at), audio: r.audio, video: r.video }))}>
                      <defs>
                        <linearGradient id="gAudio" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={AUDIO_COLOR} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={AUDIO_COLOR} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gVideo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={VIDEO_COLOR} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={VIDEO_COLOR} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00BFF033" />
                      <XAxis dataKey="time" tick={{ fill: DARK, fontSize: 10 }} />
                      <YAxis tick={{ fill: DARK, fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${CYAN}`, borderRadius: 12, fontSize: 12 }} />
                      <Area type="monotone" dataKey="audio" stroke={AUDIO_COLOR} strokeWidth={2} fill="url(#gAudio)" name="Áudio" />
                      <Area type="monotone" dataKey="video" stroke={VIDEO_COLOR} strokeWidth={2} fill="url(#gVideo)" name="Vídeo" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table */}
              <div className="rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col" style={{ background: "#fff", border: `1px solid ${CYAN}` }}>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: `linear-gradient(180deg, ${CYAN} 0%, #00A9D6 100%)`, color: "#fff" }}>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Data</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Hora</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Programa</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Áudio</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Vídeo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr><td colSpan={5} className="py-10 text-center">
                          <Loader2 className="inline-block animate-spin" size={20} style={{ color: CYAN }} />
                        </td></tr>
                      )}
                      {!loading && filteredRows.length === 0 && (
                        <tr><td colSpan={5} className="py-10 text-center text-xs font-semibold" style={{ color: DARK, opacity: 0.55 }}>
                          Nenhum registro encontrado para essa data.
                        </td></tr>
                      )}
                      {!loading && filteredRows.map((r, i) => {
                        const isPeak = stats && r.id === stats.peakTotal.id;
                        return (
                          <tr key={r.id} style={{
                            background: isPeak ? `${LIME}44` : (i % 2 === 0 ? "#fff" : "#F4FBFD"),
                            borderLeft: isPeak ? `4px solid ${LIME}` : "4px solid transparent",
                          }}>
                            <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: DARK }}>{fmtDate(r.created_at)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono font-bold" style={{ color: CYAN }}>{fmtTime(r.created_at)}</td>
                            <td className="px-4 py-2.5 text-xs font-bold" style={{ color: DARK }}>
                              {r.programa || <span style={{ opacity: 0.4, fontWeight: 500 }}>— sem programa —</span>}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-black text-right" style={{ color: DARK }}>{r.audio.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2.5 text-xs font-black text-right" style={{ color: DARK }}>{r.video.toLocaleString("pt-BR")}</td>
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
    value === null ? "..." : value.toLocaleString("pt-BR");
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
        <MiniStat label="Pico Áudio · 6m" value={totals.peakAudio} icon={<Radio size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Pico Vídeo · 6m" value={totals.peakVideo} icon={<MonitorPlay size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Média Áudio" value={totals.avgAudio} icon={<Radio size={14} />} cyan={cyan} dark={dark} />
        <MiniStat label="Média Vídeo" value={totals.avgVideo} icon={<MonitorPlay size={14} />} cyan={cyan} dark={dark} />
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
          Tendência diária · Áudio vs Vídeo
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


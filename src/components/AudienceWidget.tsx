import { useEffect, useState, useRef } from "react";
import { Users, Radio, MonitorPlay, Facebook, Instagram, Youtube, Globe, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

  // Poll Icecast/Shoutcast stats for live audio listener count.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;
    const tick = async () => {
      const overrideUrl = sources.audio_stream_api_url?.trim();
      const xpath = sources.audio_stream_xpath?.trim();
      const body: Record<string, unknown> = { userId: dataUserId };
      if (overrideUrl) body.urls = [overrideUrl];
      if (xpath) body.xpath = xpath;
      const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
      if (cancelled) return;
      if (data && (data as any).ok) {
        const n = (data as any).listeners;
        setStreamingCount(typeof n === "number" ? n : null);
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

  // Poll Logicahost video streaming API for connected viewers.
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;



    const tick = async () => {
      const url =
        (sources.video_stream_api_url?.trim() ||
          videoApiUrlRef.current ||
          "https://video.logicahost.com.br/api/V1RJeFIyRXlSbGhQV0dScFRUQTFkMXBGWkhOTmJHeFlWMjVSUFE9PStS");
      const xpath = sources.video_stream_xpath?.trim();
      try {
        const r = await fetch(url, { cache: "no-store" });
        const text = (await r.text()).trim();
        let count: number | null = null;

        // If XPath configured, use it directly (works for XML or JSON path).
        if (xpath) {
          count = extractByPath(text, xpath);
        } else if (text.startsWith("{") || text.startsWith("[") || text === "false" || text === "true" || text === "null") {
          try {
            const j = JSON.parse(text);
            if (j === false || j === null) {
              count = 0;
            } else if (typeof j === "number") {
              count = j;
            } else if (j && typeof j === "object") {
              const raw =
                (j as any).espectadores_conectados ??
                (j as any).espectadores ??
                (j as any).viewers ??
                (j as any).connected ??
                (j as any).count ??
                (j as any).info?.espectadores_conectados;
              const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
              count = typeof n === "number" && !Number.isNaN(n) ? n : null;
            }
          } catch { count = null; }
        } else {
          const m = text.match(/<espectadores_conectados>\s*(\d+)\s*<\/espectadores_conectados>/i);
          count = m ? parseInt(m[1], 10) : null;
        }

        if (!cancelled) setVideoCount(count);
      } catch {
        if (!cancelled) setVideoCount(null);
      }
      if (!cancelled) setLoadingVideo(false);
    };
    // Delay first tick slightly so empresa_config load has a chance to populate ref.
    const t0 = setTimeout(tick, 800);
    const iv = setInterval(tick, VIDEO_MS);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearInterval(iv);

    };
  }, [dataUserId, sources.video_stream_api_url, sources.video_stream_xpath]);


  // Rotate social display every 3s (only across configured networks)
  useEffect(() => {
    const iv = setInterval(() => setRotIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(iv);
  }, []);

  const socialTotal =
    (social.youtube || 0) + (social.instagram || 0) + (social.facebook || 0);
  const total = socialTotal + (videoCount || 0) + (streamingCount || 0) + (siteCount || 0);
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




  return (
    <div
      className="rounded-3xl flex flex-col p-5 w-full h-full relative"
      style={{
        background: bg,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        borderRadius: 24,
      }}
    >
      <button
        onClick={openConfig}
        aria-label="Configurar fontes"
        title="Configurar fontes"
        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
        style={{ background: "rgba(10,37,64,0.12)", color: dark }}
      >
        <Settings size={14} />
      </button>

      <div className="flex items-center gap-2 mb-3 pr-10">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: dark }}
        >
          <Users size={16} style={{ color: bg }} />
        </div>
        <div className="flex flex-col">
          <span
            className="text-[9px] font-bold uppercase"
            style={{ color: dark, opacity: 0.6, letterSpacing: 1.5 }}
          >
            Audiência Online
          </span>
          {loadingConfig ? (
            <Skeleton width={72} height={18} dark={dark} />
          ) : (
            <span
              className="text-xl font-black leading-none"
              style={{ color: dark }}
            >
              {total.toLocaleString("pt-BR")}
            </span>
          )}
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
        />
        <StatCell
          icon={<Radio size={14} />}
          label="Streaming de áudio"
          value={streamingCount}
          loading={loadingStreaming && streamingCount === null}
          dark={dark}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Streaming de vídeo"
          value={videoCount}
          loading={loadingVideo && videoCount === null}
          dark={dark}
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
            />

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


    </div>
  );
}

function SourceField({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#0A2540", opacity: 0.7 }}>
        {icon && <span style={{ color: "#00BFF0" }}>{icon}</span>}
        {label}
      </span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 text-sm outline-none transition-all"
        style={{
          background: "#fff",
          border: "2px solid #00BFF0",
          borderRadius: 999,
          color: "#0A2540",
          fontFamily: "Montserrat, sans-serif",
        }}
      />
    </label>
  );
}

function Skeleton({ width, height, dark }: { width: number | string; height: number; dark: string }) {
  return (
    <span
      className="inline-block rounded-md animate-pulse"
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  loading?: boolean;
  dark: string;
  rotationKey?: string;
}) {
  const display =
    value === null ? "..." : value.toLocaleString("pt-BR");
  return (
    <div
      className="rounded-2xl flex flex-col items-start justify-between p-3 min-w-0"
      style={{ background: "rgba(255,255,255,0.35)" }}
    >
      <div style={{ color: dark, opacity: 0.75 }}>{icon}</div>
      <div key={rotationKey} className="flex flex-col min-w-0 w-full animate-fade-in">
        {loading ? (
          <Skeleton width="70%" height={22} dark={dark} />
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

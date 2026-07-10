import { useEffect, useState, useRef } from "react";
import { Users, Radio, MonitorPlay, Facebook, Instagram, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  dataUserId?: string;
  heightPx?: number;
}

interface SocialCounts {
  youtube: number | null;
  instagram: number | null;
  facebook: number | null;
}

const ROTATE_MS = 3000;
const REFETCH_MS = 5 * 60 * 1000; // 5 min for social
const LISTENERS_MS = 30 * 1000; // 30s for stream listeners

export default function AudienceWidget({ dataUserId, heightPx }: Props) {
  const [social, setSocial] = useState<SocialCounts>({ youtube: null, instagram: null, facebook: null });
  const [playerCount] = useState<number>(0);
  const [streamingCount, setStreamingCount] = useState<number | null>(null);
  const [rotIdx, setRotIdx] = useState(0);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const [loadingPlayer] = useState(true);
  const [loadingStreaming, setLoadingStreaming] = useState(true);
  const socialUrlsRef = useRef<{ youtube?: string; instagram?: string; facebook?: string }>({});


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
        .select("youtube, instagram, facebook")
        .eq("user_id", dataUserId as any)
        .maybeSingle();
      if (!cancelled && data) {
        socialUrlsRef.current = {
          youtube: (data as any).youtube || undefined,
          instagram: (data as any).instagram || undefined,
          facebook: (data as any).facebook || undefined,
        };
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
      const { data } = await supabase.functions.invoke("count-stream-listeners", {
        body: { userId: dataUserId },
      });
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
  }, [dataUserId]);



  // Rotate social display every 3s (only across configured networks)
  useEffect(() => {
    const iv = setInterval(() => setRotIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(iv);
  }, []);

  const socialTotal =
    (social.youtube || 0) + (social.instagram || 0) + (social.facebook || 0);
  const total = socialTotal + playerCount + streamingCount;
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

  return (
    <div
      className="rounded-3xl flex flex-col p-5 w-full h-full"
      style={{
        background: bg,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        borderRadius: 24,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
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

      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
        <StatCell
          icon={current ? current.icon : <Users size={14} />}
          label={current ? current.label : "Redes sociais"}
          value={current ? current.value : null}
          loading={loadingConfig || loadingSocial}
          dark={dark}
          rotationKey={current ? `${current.key}-${rotIdx}` : "empty"}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Player"
          value={playerCount}
          loading={loadingPlayer && playerCount === 0}
          dark={dark}
        />
        <StatCell
          icon={<Radio size={14} />}
          label="Streaming"
          value={streamingCount}
          loading={loadingStreaming && streamingCount === 0}
          dark={dark}
        />
      </div>
    </div>
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
    value === null ? "—" : value.toLocaleString("pt-BR");
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

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
const REFETCH_MS = 5 * 60 * 1000; // 5 min

export default function AudienceWidget({ dataUserId, heightPx }: Props) {
  const [social, setSocial] = useState<SocialCounts>({ youtube: null, instagram: null, facebook: null });
  const [playerCount] = useState<number>(0);
  const [streamingCount] = useState<number>(0);
  const [rotIdx, setRotIdx] = useState(0);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const [loadingPlayer] = useState(true);
  const [loadingStreaming] = useState(true);
  const socialUrlsRef = useRef<{ youtube?: string; instagram?: string; facebook?: string }>({});

  // Fetch empresa social URLs + follower counts
  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("empresa_config")
        .select("youtube, instagram, facebook, youtube_subs, instagram_subs, facebook_subs")
        .eq("user_id", dataUserId as any)
        .maybeSingle();
      if (cancelled) return;
      setLoadingConfig(false);
      if (!data) {
        setLoadingSocial(false);
        return;
      }
      const d = data as any;
      const urls = {
        youtube: d.youtube || undefined,
        instagram: d.instagram || undefined,
        facebook: d.facebook || undefined,
      };
      socialUrlsRef.current = urls;
      // Seed with manual overrides so numbers show immediately.
      setSocial({
        youtube: d.youtube_subs != null ? Number(d.youtube_subs) : null,
        instagram: d.instagram_subs != null ? Number(d.instagram_subs) : null,
        facebook: d.facebook_subs != null ? Number(d.facebook_subs) : null,
      });
      const manual = {
        youtube: d.youtube_subs != null ? Number(d.youtube_subs) : null,
        instagram: d.instagram_subs != null ? Number(d.instagram_subs) : null,
        facebook: d.facebook_subs != null ? Number(d.facebook_subs) : null,
      };
      if (!urls.youtube && !urls.instagram && !urls.facebook) {
        setLoadingSocial(false);
        return;
      }
      await fetchCounts(urls, manual);
    };

    const fetchCounts = async (
      urls: typeof socialUrlsRef.current,
      manual: SocialCounts,
    ) => {
      if (!urls.youtube && !urls.instagram && !urls.facebook) {
        setLoadingSocial(false);
        return;
      }
      const { data } = await supabase.functions.invoke("fetch-social-followers", {
        body: urls,
      });
      if (cancelled) return;
      if (data && (data as any).ok) {
        // Manual override wins over scraped value.
        setSocial({
          youtube: manual.youtube ?? ((data as any).youtube ?? null),
          instagram: manual.instagram ?? ((data as any).instagram ?? null),
          facebook: manual.facebook ?? ((data as any).facebook ?? null),
        });
      }
      setLoadingSocial(false);
    };

    load();
    const iv = setInterval(async () => {
      const { data: d2 } = await supabase
        .from("empresa_config")
        .select("youtube_subs, instagram_subs, facebook_subs")
        .eq("user_id", dataUserId as any)
        .maybeSingle();
      const manual: SocialCounts = {
        youtube: d2 && (d2 as any).youtube_subs != null ? Number((d2 as any).youtube_subs) : null,
        instagram: d2 && (d2 as any).instagram_subs != null ? Number((d2 as any).instagram_subs) : null,
        facebook: d2 && (d2 as any).facebook_subs != null ? Number((d2 as any).facebook_subs) : null,
      };
      fetchCounts(socialUrlsRef.current, manual);
    }, REFETCH_MS);
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
          <span
            className="text-xl font-black leading-none"
            style={{ color: dark }}
          >
            {total.toLocaleString("pt-BR")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
        <StatCell
          icon={current ? current.icon : <Users size={14} />}
          label={current ? current.label : "Redes sociais"}
          value={current ? current.value : null}
          dark={dark}
          rotationKey={current ? `${current.key}-${rotIdx}` : "empty"}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Player"
          value={playerCount}
          dark={dark}
        />
        <StatCell
          icon={<Radio size={14} />}
          label="Streaming"
          value={streamingCount}
          dark={dark}
        />
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  dark,
  rotationKey,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
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
        <span
          className="text-2xl font-black leading-none truncate"
          style={{ color: dark }}
        >
          {display}
        </span>
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

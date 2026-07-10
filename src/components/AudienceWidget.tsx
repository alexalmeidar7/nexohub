import { useEffect, useState } from "react";
import { Users, Radio, MonitorPlay, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  dataUserId?: string;
  heightPx: number;
}

interface Stats {
  social: number;
  player: number;
  streaming: number;
}

/**
 * Audience widget shown next to the player widget in Home.
 * Displays real-time counts of online audience across channels.
 * Data sources are best-effort placeholders where live tracking is not
 * yet wired (social/streaming); player watchers derive from watch_history
 * activity in the last 5 minutes.
 */
export default function AudienceWidget({ dataUserId, heightPx }: Props) {
  const [stats, setStats] = useState<Stats>({ social: 0, player: 0, streaming: 0 });

  useEffect(() => {
    if (!dataUserId) return;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        // Player watchers: distinct users seen in watch_history in last 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: watches } = await supabase
          .from("watch_history")
          .select("user_id, viewer_session_id")
          .eq("channel_owner_id", dataUserId as any)
          .gte("last_seen_at", fiveMinAgo as any);
        const playerCount = new Set(
          (watches || []).map((w: any) => w.viewer_session_id || w.user_id).filter(Boolean)
        ).size;

        if (!cancelled) {
          setStats({
            social: 0,
            player: playerCount,
            streaming: 0,
          });
        }
      } catch {
        // Table columns may vary; keep zeros silently.
      }
    };

    fetchStats();
    const iv = setInterval(fetchStats, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [dataUserId]);

  const total = stats.social + stats.player + stats.streaming;
  const bg = "#d9ff65";
  const dark = "#0A2540";

  return (
    <div
      className="rounded-3xl flex flex-col p-5"
      style={{
        background: bg,
        height: `${heightPx}px`,
        maxHeight: `${heightPx}px`,
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
          icon={<Share2 size={14} />}
          label="Redes sociais"
          value={stats.social}
          dark={dark}
        />
        <StatCell
          icon={<MonitorPlay size={14} />}
          label="Player"
          value={stats.player}
          dark={dark}
        />
        <StatCell
          icon={<Radio size={14} />}
          label="Streaming"
          value={stats.streaming}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  dark: string;
}) {
  return (
    <div
      className="rounded-2xl flex flex-col items-start justify-between p-3 min-w-0"
      style={{ background: "rgba(255,255,255,0.35)" }}
    >
      <div style={{ color: dark, opacity: 0.75 }}>{icon}</div>
      <div className="flex flex-col min-w-0 w-full">
        <span
          className="text-2xl font-black leading-none truncate"
          style={{ color: dark }}
        >
          {value.toLocaleString("pt-BR")}
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

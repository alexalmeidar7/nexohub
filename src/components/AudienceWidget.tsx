import { useEffect, useState } from "react";
import { Users, Radio, MonitorPlay, Share2 } from "lucide-react";

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
 * Displays real-time counts of online audience.
 * Live tracking sources not yet wired — starts at 0; will hook to
 * realtime presence and streaming metrics in a follow-up.
 */
export default function AudienceWidget({ dataUserId, heightPx }: Props) {
  const [stats] = useState<Stats>({ social: 0, player: 0, streaming: 0 });

  useEffect(() => {
    // Placeholder: hook up real listeners (Supabase presence,
    // streaming server metrics, social APIs) in the next iteration.
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

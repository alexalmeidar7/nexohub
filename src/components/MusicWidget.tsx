import { useState, useEffect, useRef } from "react";
import { Disc3 } from "lucide-react";
import { getMusicData } from "@/lib/musicData";
import { musicDataKey } from "@/lib/musicStorageKeys";
import { useAuth } from "@/hooks/useAuth";

function formatRelative(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

export default function MusicWidget() {
  const { user } = useAuth();
  const [music, setMusic] = useState<ReturnType<typeof getMusicData>>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [, force] = useState(0);
  const lastRawRef = useRef<string | null>(null);

  useEffect(() => {
    const dataKey = musicDataKey(user?.id);
    const update = () => {
      const next = getMusicData(user?.id);
      if (dataKey) {
        const raw = localStorage.getItem(dataKey);
        if (raw !== lastRawRef.current) {
          lastRawRef.current = raw;
          if (raw) setLastUpdate(Date.now());
        }
      }
      setMusic(next);
    };
    update();
    const interval = setInterval(update, 1000);
    const tick = setInterval(() => force((n) => n + 1), 10000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [user?.id]);

  const synced = !!music && !music.finished;
  const statusLabel = synced ? "Sincronizado" : "Aguardando";
  const statusColor = synced ? "#16a34a" : "#d97706";
  const relative = lastUpdate ? formatRelative(Date.now() - lastUpdate) : "—";

  const StatusBar = (
    <div className="flex items-center justify-between text-[10px] text-gray-700/80 mt-3 pt-2 border-t border-black/10">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            animation: synced ? "pulse 2s ease-in-out infinite" : undefined,
          }}
        />
        <span className="font-medium">{statusLabel}</span>
      </span>
      <span className="tabular-nums">Atualizado {relative}</span>
    </div>
  );

  if (!music) {
    return (
      <div className="rounded-xl p-5" style={{ backgroundColor: "#aea4ee" }}>
        <div className="flex items-center gap-2 mb-2">
          <Disc3 size={16} className="text-gray-600" />
          <span className="font-semibold text-gray-600 text-sm">Tocando</span>
        </div>
        <p className="text-gray-500 text-xs">Nenhuma música tocando.</p>
        {StatusBar}
      </div>
    );
  }

  const { music: m } = music;

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "#aea4ee" }}>
      <div className="flex items-center gap-2 mb-3">
        <Disc3 size={16} className="text-gray-700 animate-spin" style={{ animationDuration: "3s" }} />
      </div>
      <div className="flex gap-3">
        {m.capa ? (
          <img src={m.capa} alt="Capa" className="w-14 h-14 rounded-lg object-cover border border-gray-300" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white/50 border border-gray-300 flex items-center justify-center">
            <Disc3 size={24} className="text-gray-400 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
        )}
        <div className="flex-1 space-y-1 min-w-0">
          <p className="font-bold text-gray-800 truncate">{m.titulo}</p>
          <p className="text-gray-500 text-xs truncate">{m.artista}</p>
        </div>
      </div>
      {StatusBar}
    </div>
  );
}

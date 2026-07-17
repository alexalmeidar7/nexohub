import { Loader2 } from "lucide-react";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";

const ACCENT = "#d9ff65";

function ElegantLoader() {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.08)",
        borderTopColor: ACCENT,
        borderRightColor: ACCENT,
        animation: "route-elegant-spin 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        boxShadow: `0 0 24px ${ACCENT}22`,
      }}
    >
      <style>{`@keyframes route-elegant-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function RouteProgress() {
  const isPlayerRoute =
    typeof window !== "undefined" && /\/player(\/|$)/.test(window.location.pathname);

  if (isPlayerRoute) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden" style={{ backgroundColor: "#131519" }}>
        <video
          src={splashVideoAsset.url}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          playsInline
          preload="auto"
        />
        <div
          className="absolute inset-x-0 bottom-0 flex items-end justify-center"
          style={{ paddingBottom: "12vh" }}
        >
          <ElegantLoader />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#131519" }}
    >
      <Loader2 className="animate-spin" size={48} style={{ color: ACCENT }} />
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
        Carregando...
      </p>
    </div>
  );
}


import { Loader2 } from "lucide-react";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";

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
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: "translateY(50px)" }}
        >
          <Loader2 className="animate-spin" size={48} style={{ color: "#d9ff65" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#131519" }}
    >
      <Loader2 className="animate-spin" size={48} style={{ color: "#d9ff65" }} />
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
        Carregando...
      </p>
    </div>
  );
}

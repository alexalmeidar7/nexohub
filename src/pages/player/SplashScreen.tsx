import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface SplashScreenProps {
  logoUrl?: string | null;
  channelName?: string;
  onFinish: () => void;
}

export default function SplashScreen({ logoUrl, channelName, onFinish }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 2200);
    const finish = setTimeout(onFinish, 2800);
    return () => { clearTimeout(timer); clearTimeout(finish); };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-player transition-opacity duration-600 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ background: "var(--player-glow)" }}
    >
      <div className="mb-16">
        {logoUrl ? (
          <img src={logoUrl} alt={channelName || "Logo"} className="h-28 w-auto object-contain drop-shadow-lg" />
        ) : (
          <div className="h-28 w-28 rounded-full bg-player-muted flex items-center justify-center">
            <span className="text-player-muted-foreground text-4xl font-bold">P</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-player-accent" />
        <p className="text-player-muted-foreground text-sm font-normal tracking-wide">
          carregando {channelName || "Positiva Play"}
        </p>
      </div>
    </div>
  );
}

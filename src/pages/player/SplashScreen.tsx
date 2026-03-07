import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface SplashScreenProps {
  logoUrl?: string | null;
  channelName?: string;
  onFinish: () => void;
}

export default function SplashScreen({ logoUrl, channelName, onFinish }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [showLogo, setShowLogo] = useState(false);

  useEffect(() => {
    const logoTimer = setTimeout(() => setShowLogo(true), 200);
    const timer = setTimeout(() => setFadeOut(true), 2500);
    const finish = setTimeout(onFinish, 3100);
    return () => { clearTimeout(logoTimer); clearTimeout(timer); clearTimeout(finish); };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-player transition-opacity duration-600 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ background: "var(--player-glow)" }}
    >
      <div
        className={`mb-16 transition-all duration-700 ease-out ${
          showLogo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
      >
        {logoUrl ? (
          <img src={logoUrl} alt={channelName || "Logo"} className="h-42 w-auto object-contain drop-shadow-lg" />
        ) : (
          <div className="h-42 w-42 rounded-full bg-player-muted flex items-center justify-center">
            <span className="text-player-muted-foreground text-5xl font-bold">P</span>
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

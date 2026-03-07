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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-600 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{
        background: "radial-gradient(ellipse at 50% 90%, rgba(180,20,20,0.25) 0%, #000 70%)",
      }}
    >
      {/* Logo */}
      <div className="mb-16">
        {logoUrl ? (
          <img src={logoUrl} alt={channelName || "Logo"} className="h-28 w-auto object-contain drop-shadow-lg" />
        ) : (
          <div className="h-28 w-28 rounded-full bg-white/10 flex items-center justify-center">
            <span className="text-white/40 text-4xl font-bold">P</span>
          </div>
        )}
      </div>

      {/* Spinner + text */}
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        <p className="text-white/60 text-sm font-normal tracking-wide">
          carregando {channelName || "Positiva Play"}
        </p>
      </div>
    </div>
  );
}

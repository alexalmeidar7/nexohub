import { useEffect, useState, RefObject } from "react";

const SKIP_DELAY = 5;

interface Props {
  prerollUrl: string;
  prerollVideoRef: RefObject<HTMLVideoElement>;
  prerollLinkUrl: string | null;
  onSkip: () => void;
  onEnded: () => void;
}

export default function PreRollOverlay({ prerollUrl, prerollVideoRef, prerollLinkUrl, onSkip, onEnded }: Props) {
  const [countdown, setCountdown] = useState(SKIP_DELAY);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const canSkip = countdown <= 0;

  return (
    <div className="absolute inset-0 z-[100] bg-black flex items-center justify-center">
      <video
        ref={prerollVideoRef}
        src={prerollUrl}
        autoPlay
        className="w-full h-full object-contain"
        onEnded={onEnded}
      />
      <button
        onClick={canSkip ? onSkip : undefined}
        className={`absolute top-6 right-6 px-4 py-2 rounded-lg text-sm font-bold transition-all backdrop-blur-sm ${
          canSkip
            ? "bg-white/20 hover:bg-white/30 text-white cursor-pointer"
            : "bg-white/10 text-white/50 cursor-not-allowed"
        }`}
        disabled={!canSkip}
      >
        {canSkip ? "Pular Anúncio ›" : `Pular em ${countdown}s`}
      </button>
      {prerollLinkUrl && (
        <a
          href={prerollLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-10 right-6 bg-[#d30707] hover:bg-[#b00606] text-white px-6 py-3 rounded-lg text-sm font-bold transition-all shadow-lg"
        >
          Clique Aqui ›
        </a>
      )}
    </div>
  );
}

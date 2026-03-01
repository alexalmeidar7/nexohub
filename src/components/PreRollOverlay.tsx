import { useEffect, useState, RefObject } from "react";
import { QRCodeSVG } from "qrcode.react";

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
    <div className="absolute inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden">
      {/* Video — full screen */}
      <video
        ref={prerollVideoRef}
        src={prerollUrl}
        autoPlay
        className="w-full h-full object-contain"
        onEnded={onEnded}
      />

      {/* QR Code overlay — bottom-left on top of video */}
      {prerollLinkUrl && (
        <div className="absolute bottom-10 left-6 z-10 flex items-end gap-4">
          <div className="bg-white rounded-xl p-3 shadow-2xl">
            <QRCodeSVG
              value={prerollLinkUrl}
              size={120}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <div className="flex flex-col gap-2 mb-1">
            <span className="text-white text-xs font-bold uppercase tracking-wider drop-shadow-lg">
              Aponte a câmera
            </span>
            <a
              href={prerollLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#d30707] hover:bg-[#b00606] text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg text-center"
            >
              Saiba Mais ›
            </a>
          </div>
        </div>
      )}

      {/* Skip button — bottom-right */}
      <div className="absolute bottom-10 right-6 z-10">
        <button
          onClick={canSkip ? onSkip : undefined}
          className={`px-4 py-3 rounded-lg text-sm font-bold transition-all backdrop-blur-sm ${
            canSkip
              ? "bg-white/20 hover:bg-white/30 text-white cursor-pointer"
              : "bg-white/10 text-white/50 cursor-not-allowed"
          }`}
          disabled={!canSkip}
        >
          {canSkip ? "Pular Anúncio ›" : `Pular em ${countdown}s`}
        </button>
      </div>
    </div>
  );
}

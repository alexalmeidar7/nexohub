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
    <div className="absolute inset-0 z-[100] bg-black flex">
      {/* Video area */}
      <div className={`relative ${prerollLinkUrl ? "flex-1" : "w-full"} h-full`}>
        <video
          ref={prerollVideoRef}
          src={prerollUrl}
          autoPlay
          className="w-full h-full object-contain"
          onEnded={onEnded}
        />
      </div>

      {/* QR Code sidebar */}
      {prerollLinkUrl && (
        <div className="w-[280px] shrink-0 bg-white flex flex-col items-center justify-center gap-5 px-6">
          <span className="text-black text-sm font-bold uppercase tracking-wider text-center">
            Aponte a câmera
          </span>
          <div className="p-3 bg-white rounded-xl shadow-lg border border-gray-200">
            <QRCodeSVG
              value={prerollLinkUrl}
              size={180}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
          <a
            href={prerollLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#d30707] hover:bg-[#b00606] text-white px-6 py-3 rounded-lg text-sm font-bold transition-all shadow-lg w-full text-center"
          >
            Saiba Mais ›
          </a>
        </div>
      )}

      {/* Skip button */}
      <div className="absolute bottom-10 right-6 flex items-center gap-3">
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

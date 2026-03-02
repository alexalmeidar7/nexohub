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
      <div className="flex items-center justify-center gap-6 w-full h-full px-12 py-10">
        {/* Video container — rounded, left side */}
        <div className="relative flex-1 h-full max-h-[80vh] rounded-2xl overflow-hidden border border-white/10" style={{ backgroundColor: "#1a1a1a" }}>
          <video
            ref={prerollVideoRef}
            src={prerollUrl}
            autoPlay
            className="w-full h-full object-contain"
            onEnded={onEnded}
          />
          {/* Skip button — bottom-left inside video */}
          <div className="absolute bottom-6 left-6 z-10">
            <button
              onClick={canSkip ? onSkip : undefined}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wide transition-all ${
                canSkip
                  ? "bg-[#d30707] hover:bg-[#b00606] text-white cursor-pointer"
                  : "bg-[#d30707]/80 text-white/80 cursor-not-allowed"
              }`}
              disabled={!canSkip}
            >
              Pular Anúncio{!canSkip && <span className="ml-1">{countdown}s</span>}
              {canSkip && <span>›</span>}
            </button>
          </div>
        </div>

        {/* QR Code card — right side, outside video */}
        {prerollLinkUrl && (
          <div className="shrink-0 flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ width: "200px" }}>
            {/* White section with QR */}
            <div className="bg-white flex flex-col items-center px-6 pt-8 pb-5">
              <QRCodeSVG
                value={prerollLinkUrl}
                size={140}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
              <p className="text-black text-sm font-bold mt-4 text-center leading-tight">
                escaneie<br />o qr code
              </p>
            </div>
            {/* Red section with CTA */}
            <a
              href={prerollLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#d30707] hover:bg-[#b00606] text-white text-center py-4 px-4 font-bold text-sm transition-all"
            >
              ou clique aqui
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

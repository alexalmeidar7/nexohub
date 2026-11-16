import type { ReactNode } from "react";
import PlayerClockWeather from "@/components/player/PlayerClockWeather";

interface PlayerBrandCornerProps {
  radioUserId?: string | null;
  logoUrl?: string | null;
  logoAlt?: string;
  onLogoError?: () => void;
  className?: string;
  children?: ReactNode;
}

/** Cabeçalho de marca compartilhado: previsão, relógio, conteúdo central e logo. */
export default function PlayerBrandCorner({
  radioUserId,
  logoUrl,
  logoAlt = "Emissora",
  onLogoError,
  className = "",
  children,
}: PlayerBrandCornerProps) {
  return (
    <div className={`flex shrink-0 items-center gap-2 sm:gap-4 ${className}`}>
      <PlayerClockWeather radioUserId={radioUserId} compact />
      {children}
      {logoUrl && (
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center sm:h-[56px] sm:w-[56px] md:h-[76px] md:w-[76px]">
          <img src={logoUrl} alt={logoAlt} onError={onLogoError} className="h-full w-full object-contain drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}

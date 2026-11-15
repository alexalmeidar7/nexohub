import { useId } from "react";

interface CenarioWeatherGlassIconProps {
  code: number;
  size?: number;
  className?: string;
}

interface CenarioWeatherMetricIconProps {
  type: "humidity" | "rain";
  size?: string;
}

export function CenarioWeatherMetricIcon({ type, size = "1.6cqh" }: CenarioWeatherMetricIconProps) {
  const id = useId().replace(/:/g, "");
  const isHumidity = type === "humidity";

  return (
    <svg
      width={size}
      height={size}
      viewBox={isHumidity ? "0 0 40 40" : "0 0 48 40"}
      aria-label={isHumidity ? "Umidade" : "Chuva"}
      role="img"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0, overflow: "visible", filter: "drop-shadow(0 1px 2px rgba(0,65,130,.38))" }}
    >
      <defs>
        <linearGradient id={`${id}-metric-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F2FDFF" />
          <stop offset="0.32" stopColor="#A9E8FF" />
          <stop offset="0.72" stopColor="#43B7F2" />
          <stop offset="1" stopColor="#1681C8" />
        </linearGradient>
        <linearGradient id={`${id}-metric-cloud`} x1="0" y1="0" x2="0.4" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#DDF4FF" />
          <stop offset="1" stopColor="#8CC9E9" />
        </linearGradient>
        <filter id={`${id}-metric-shadow`} x="-40%" y="-40%" width="180%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
          <feOffset dy="1.5" />
          <feComponentTransfer><feFuncA type="linear" slope="0.32" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {isHumidity ? (
        <g filter={`url(#${id}-metric-shadow)`}>
          <path d="M20 3C20 3 7 19 7 26A13 13 0 0 0 33 26C33 19 20 3 20 3Z" fill={`url(#${id}-metric-glass)`} stroke="#E8FBFF" strokeWidth="1.5" />
          <path d="M15 19C16.5 15.5 18.5 12.8 20 11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeOpacity=".88" />
          <ellipse cx="14" cy="27" rx="2.8" ry="4.2" transform="rotate(28 14 27)" fill="white" fillOpacity=".42" />
          <path d="M14 34C18 37 24 37 28 33" stroke="#DFF9FF" strokeWidth="1.2" strokeLinecap="round" strokeOpacity=".82" />
        </g>
      ) : (
        <g filter={`url(#${id}-metric-shadow)`}>
          <path d="M11 23C6 23 3 20 3 16C3 12 6 9 11 9C13 4 17 2 22 2C28 2 32 6 33 11C39 11 44 14 44 19C44 22 41 24 37 24H11Z" fill={`url(#${id}-metric-cloud)`} stroke="#F2FCFF" strokeWidth="1.3" />
          <path d="M12 14C15 8 23 6 29 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".86" />
          <path d="M14 28C14 28 11 32 11 34A3 3 0 0 0 17 34C17 32 14 28 14 28Z" fill={`url(#${id}-metric-glass)`} stroke="#E9FCFF" strokeWidth=".8" />
          <path d="M29 27C29 27 26 31 26 33A3 3 0 0 0 32 33C32 31 29 27 29 27Z" fill={`url(#${id}-metric-glass)`} stroke="#E9FCFF" strokeWidth=".8" />
        </g>
      )}
    </svg>
  );
}

export default function CenarioWeatherGlassIcon({ code, size = 160, className }: CenarioWeatherGlassIconProps) {
  const id = useId().replace(/:/g, "");
  const isThunder = code >= 95;
  const isSnow = code >= 71 && code <= 77;
  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const isFog = code === 45 || code === 48;
  const isPartlyCloudy = code === 1 || code === 2;
  const isSunny = code === 0;
  const showCloud = !isSunny;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={isThunder ? "Tempestade" : isSnow ? "Neve" : isRain ? "Chuva" : isFog ? "Neblina" : isSunny ? "Ensolarado" : isPartlyCloudy ? "Parcialmente nublado" : "Nublado"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`${id}-sun`} cx="34%" cy="26%" r="80%">
          <stop stopColor="#FFFBE5" />
          <stop offset="0.28" stopColor="#FFE98A" />
          <stop offset="0.68" stopColor="#FFC64D" />
          <stop offset="1" stopColor="#E99B27" />
        </radialGradient>
        <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFFBEA" />
          <stop offset="0.5" stopColor="#FFD875" />
          <stop offset="1" stopColor="#ECA52E" />
        </linearGradient>
        <linearGradient id={`${id}-cloud`} x1="0.18" y1="0.1" x2="0.84" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.36" stopColor="#EAF6FF" />
          <stop offset="0.74" stopColor="#A8D8F2" />
          <stop offset="1" stopColor="#6EADD4" />
        </linearGradient>
        <linearGradient id={`${id}-cloud-edge`} x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor="#FFFFFF" stopOpacity="0.94" />
          <stop offset="0.48" stopColor="#DAF1FF" stopOpacity="0.45" />
          <stop offset="1" stopColor="#70B9E8" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`${id}-rain`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop stopColor="#F0FCFF" />
          <stop offset="0.32" stopColor="#8BE2FF" />
          <stop offset="0.72" stopColor="#36A9EB" />
          <stop offset="1" stopColor="#1471C2" />
        </linearGradient>
        <linearGradient id={`${id}-bolt`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFFFD9" />
          <stop offset="0.35" stopColor="#FFE56A" />
          <stop offset="1" stopColor="#F39B17" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
          <feOffset dy="6" />
          <feComponentTransfer><feFuncA type="linear" slope="0.3" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <path id={`${id}-cloud-shape`} d="M49 137C28 137 16 123 16 105C16 88 29 75 47 73C53 50 73 35 98 35C123 35 143 51 149 74C171 75 187 91 187 111C187 126 176 137 157 137H49Z" />
      </defs>

      <style>{`
        @keyframes scenarioGlassFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes scenarioGlassRayGlow { 0%,100% { opacity: .82; } 50% { opacity: 1; } }
        @keyframes scenarioGlassDropFall { 0%,100% { transform: translateY(0); opacity: .82; } 50% { transform: translateY(4px); opacity: 1; } }
        .scenario-glass-float { animation: scenarioGlassFloat 4s ease-in-out infinite; }
        .scenario-glass-rays { animation: scenarioGlassRayGlow 3s ease-in-out infinite; }
        .scenario-glass-drop-a { animation: scenarioGlassDropFall 1.8s ease-in-out infinite; }
        .scenario-glass-drop-b { animation: scenarioGlassDropFall 2.1s ease-in-out .35s infinite; }
        .scenario-glass-drop-c { animation: scenarioGlassDropFall 1.9s ease-in-out .7s infinite; }
      `}</style>

      {(isSunny || isPartlyCloudy) && (
        <g className="scenario-glass-rays" transform={isPartlyCloudy ? "translate(22 -18) scale(.78)" : undefined}>
          <g stroke={`url(#${id}-ray)`} strokeWidth="9" strokeLinecap="round" filter={`url(#${id}-shadow)`}>
            <path d="M100 13V27" /><path d="M100 13V27" transform="rotate(45 100 100)" />
            <path d="M100 13V27" transform="rotate(90 100 100)" /><path d="M100 13V27" transform="rotate(135 100 100)" />
            <path d="M100 13V27" transform="rotate(180 100 100)" /><path d="M100 13V27" transform="rotate(225 100 100)" />
            <path d="M100 13V27" transform="rotate(270 100 100)" /><path d="M100 13V27" transform="rotate(315 100 100)" />
          </g>
          <circle cx="100" cy="100" r="39" fill={`url(#${id}-sun)`} stroke="#FFF5CE" strokeOpacity=".9" strokeWidth="3" filter={`url(#${id}-shadow)`} />
          <ellipse cx="86" cy="82" rx="20" ry="9" transform="rotate(-35 86 82)" fill="white" fillOpacity=".45" />
          <ellipse cx="112" cy="112" rx="26" ry="15" transform="rotate(-35 112 112)" fill="#FFF9E8" fillOpacity=".14" />
        </g>
      )}

      {showCloud && (
        <g className="scenario-glass-float" transform={isPartlyCloudy ? "translate(-5 28) scale(.9)" : isRain || isThunder || isSnow || isFog ? "translate(0 14)" : undefined}>
          <use href={`#${id}-cloud-shape`} fill={`url(#${id}-cloud)`} stroke={`url(#${id}-cloud-edge)`} strokeWidth="4" filter={`url(#${id}-shadow)`} />
          <path d="M42 96C48 78 65 69 82 69C100 69 114 79 120 94" stroke="white" strokeOpacity=".76" strokeWidth="5" strokeLinecap="round" />
          <path d="M38 119C70 131 127 131 164 117" stroke="white" strokeOpacity=".32" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="73" cy="83" rx="17" ry="6" transform="rotate(-30 73 83)" fill="white" fillOpacity=".32" />
        </g>
      )}

      {isFog && <g stroke="#EAF8FF" strokeWidth="7" strokeLinecap="round" opacity=".8"><path d="M27 150H167" /><path d="M45 164H151" opacity=".62" /></g>}

      {isRain && <g fill={`url(#${id}-rain)`} stroke="#D8F6FF" strokeOpacity=".8" strokeWidth="2" filter={`url(#${id}-shadow)`}>
        <path className="scenario-glass-drop-a" d="M56 151C56 151 44 169 44 177A12 12 0 0 0 68 177C68 169 56 151 56 151Z" />
        <path className="scenario-glass-drop-b" d="M101 153C101 153 89 171 89 179A12 12 0 0 0 113 179C113 171 101 153 101 153Z" />
        <path className="scenario-glass-drop-c" d="M146 151C146 151 134 169 134 177A12 12 0 0 0 158 177C158 169 146 151 146 151Z" />
      </g>}

      {isThunder && <g filter={`url(#${id}-glow)`}>
        <path d="M104 123L78 164H98L88 193L128 145H106L119 123Z" fill={`url(#${id}-bolt)`} stroke="#FFF6C4" strokeWidth="3" strokeLinejoin="round" />
        <path d="M98 160L105 150" stroke="white" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
      </g>}

      {isSnow && <g fill="#EAFBFF" stroke="#B9E9FF" strokeWidth="1.5" filter={`url(#${id}-glow)`}>
        <circle cx="58" cy="164" r="6" /><circle cx="101" cy="174" r="6" /><circle cx="145" cy="161" r="6" />
        <path d="M58 153V175M47 164H69M101 163V185M90 174H112M145 150V172M134 161H156" stroke="#EAFBFF" strokeWidth="2.5" />
      </g>}
    </svg>
  );
}

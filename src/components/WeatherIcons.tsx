import React from "react";

/**
 * Weather icons — sempre servidos como PNG (URL termina em .png)
 *
 * Os PNGs são gerados/atualizados pela edge function `update-weather-xml`
 * e armazenados no bucket público `xml-files/weather-icons/`.
 * Caminho: weather-icons/weather-icon-static-{code}-{d|n}.png
 *
 * A animação (glow + leve flutuação) é aplicada via CSS no wrapper, mantendo
 * a experiência viva mesmo sendo uma imagem estática.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "";

// WMO codes suportados (mesmos usados pela função de update)
const SUPPORTED_CODES = [0, 1, 2, 3, 45, 48, 51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99];

function closestCode(code: number): number {
  return SUPPORTED_CODES.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
}

function isNightNow(): boolean {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}

export function getWeatherIconPng(code: number, forceDay = false): string {
  const c = closestCode(code);
  const suffix = forceDay ? "d" : isNightNow() ? "n" : "d";
  // URL pública direta do Storage — sempre termina em .png (compatível com vMix)
  return `${SUPABASE_URL}/storage/v1/object/public/xml-files/weather-icons/weather-icon-static-${c}-${suffix}.png`;
}

// Injeta keyframes uma única vez
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-weather-icons", "true");
  style.textContent = `
    @keyframes weather-icon-float {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-4%) scale(1.03); }
    }
    @keyframes weather-icon-glow {
      0%, 100% { filter: drop-shadow(0 4px 10px rgba(255,255,255,0.15)) drop-shadow(0 0 14px rgba(255,220,120,0.25)); }
      50% { filter: drop-shadow(0 6px 18px rgba(255,255,255,0.35)) drop-shadow(0 0 24px rgba(255,220,120,0.55)); }
    }
    .weather-icon-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .weather-icon-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      animation: weather-icon-float 5s ease-in-out infinite, weather-icon-glow 3.5s ease-in-out infinite;
      will-change: transform, filter, opacity;
      transition: opacity 500ms ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

interface WeatherIconProps {
  code: number;
  size?: number;
  forceDay?: boolean;
  className?: string;
}

export function WeatherIcon({ code, size = 48, forceDay = false, className }: WeatherIconProps) {
  ensureStyles();
  const url = getWeatherIconPng(code, forceDay);

  // Duas camadas alternadas: A e B. Ao mudar a URL, pré-carregamos a nova
  // camada e só invertemos o "front" quando o load termina — sem piscar.
  const [layers, setLayers] = React.useState<{ a: string; b: string; front: "a" | "b" }>(() => ({
    a: url,
    b: "",
    front: "a",
  }));
  const currentFrontUrl = layers.front === "a" ? layers.a : layers.b;

  React.useEffect(() => {
    if (url === currentFrontUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setLayers((prev) => (prev.front === "a"
        ? { ...prev, b: url, front: "b" }
        : { ...prev, a: url, front: "a" }));
    };
    img.onerror = () => {
      if (cancelled) return;
      // Mesmo com erro, alterna para tentar exibir (fallback do onError abaixo)
      setLayers((prev) => (prev.front === "a"
        ? { ...prev, b: url, front: "b" }
        : { ...prev, a: url, front: "a" }));
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [url, currentFrontUrl]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
  };

  return (
    <div className={`weather-icon-wrap ${className || ""}`} style={{ width: size, height: size }}>
      {layers.a && (
        <img
          key={`a-${layers.a}`}
          src={layers.a}
          alt=""
          className="weather-icon-layer"
          draggable={false}
          style={{ opacity: layers.front === "a" ? 1 : 0 }}
          onError={handleError}
        />
      )}
      {layers.b && (
        <img
          key={`b-${layers.b}`}
          src={layers.b}
          alt=""
          className="weather-icon-layer"
          draggable={false}
          style={{ opacity: layers.front === "b" ? 1 : 0 }}
          onError={handleError}
        />
      )}
    </div>
  );
}

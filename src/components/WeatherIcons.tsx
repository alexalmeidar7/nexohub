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
    .weather-icon-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      animation: weather-icon-float 5s ease-in-out infinite, weather-icon-glow 3.5s ease-in-out infinite;
      will-change: transform, filter;
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
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={url}
        alt=""
        className="weather-icon-img"
        draggable={false}
        onError={(e) => {
          // Fallback silencioso: esconde caso o ícone ainda não tenha sido gerado
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useAlbumColors } from "@/hooks/useAlbumColors";

interface GradientState {
  color1: string;
  color2: string;
}

const DEFAULT: GradientState = { color1: "#0055ff", color2: "#7c3aed" };

/**
 * Full-screen fluid ambient gradient background that reacts to the currently
 * playing song's album art colors. Renders at z-index 0 at the app shell level,
 * filling the entire viewport behind the frosted glass header and persisting across all pages.
 */
export default function HomeGradientBackground() {
  const [artUrl, setArtUrl] = useState<string | null>(() => {
    return (window as any)?.__lastPlayerMusicState?.displayArt || null;
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if ((window as any)?.__lastPlayerMusicState?.displayArt) {
      setArtUrl((window as any).__lastPlayerMusicState.displayArt);
    }
    const onMusic = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.displayArt !== undefined) setArtUrl(d.displayArt || null);
    };
    window.addEventListener("player:music", onMusic as EventListener);
    return () => {
      window.removeEventListener("player:music", onMusic as EventListener);
    };
  }, []);

  const colors = useAlbumColors(artUrl);

  const [current, setCurrent] = useState<GradientState>(DEFAULT);
  const [target, setTarget] = useState<GradientState>(DEFAULT);
  const [fading, setFading] = useState(false);
  const [prevOpacity, setPrevOpacity] = useState(0);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    const next: GradientState = { color1: colors[0], color2: colors[1] };
    if (next.color1 === current.color1 && next.color2 === current.color2) return;
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setTarget(next);
    setFading(true);
    setPrevOpacity(1);
    requestAnimationFrame(() => requestAnimationFrame(() => setPrevOpacity(0)));
    fadeTimer.current = window.setTimeout(() => {
      setCurrent(next);
      setFading(false);
      setPrevOpacity(0);
    }, 1800);
  }, [colors[0], colors[1]]);

  if (!mounted) return null;

  const renderMesh = (c1: string, c2: string) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: "#060a17",
        backgroundImage: `
          radial-gradient(circle at 14% 12%, ${c1}66 0%, ${c1}3d 26%, ${c1}18 52%, transparent 75%),
          radial-gradient(circle at 86% 88%, ${c2}5e 0%, ${c2}33 26%, ${c2}14 52%, transparent 75%),
          radial-gradient(circle at 70% 18%, ${c1}44 0%, ${c2}28 36%, transparent 70%),
          radial-gradient(circle at 28% 82%, ${c2}40 0%, ${c1}22 36%, transparent 70%),
          linear-gradient(135deg, ${c1}26 0%, #060917 42%, #030611 72%, ${c2}24 100%)
        `,
        transform: "translateZ(0)",
      }}
    />
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        backgroundColor: "#030611",
      }}
    >
      {/* Active / Target Gradient Mesh */}
      <div style={{ position: "absolute", inset: 0, transform: "translateZ(0)" }}>
        {renderMesh(target.color1, target.color2)}
      </div>

      {/* Fading Out Previous Gradient Mesh for Smooth Song Crossfades */}
      {fading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: prevOpacity,
            transition: "opacity 1.8s cubic-bezier(0.4,0,0.2,1)",
            willChange: "opacity",
            transform: "translateZ(0)",
          }}
        >
          {renderMesh(current.color1, current.color2)}
        </div>
      )}
    </div>
  );
}

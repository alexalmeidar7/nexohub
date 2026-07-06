import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Global top-of-viewport loading bar shown on route changes and on manual
 * page switches (fired via `window.dispatchEvent(new Event("app:page-change"))`).
 */
export default function RouteProgress() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const trigger = () => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 700);
  };

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => trigger();
    window.addEventListener("app:page-change", handler);
    return () => {
      window.removeEventListener("app:page-change", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-label="Carregando"
      role="progressbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "transparent",
        zIndex: 10000,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "40%",
          background: "linear-gradient(90deg, transparent, #268ffa, transparent)",
          animation: "lov-route-progress 0.9s ease-in-out infinite",
          boxShadow: "0 0 8px rgba(38,143,250,0.6)",
        }}
      />
      <style>{`@keyframes lov-route-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  );
}

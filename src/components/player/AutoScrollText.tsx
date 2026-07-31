import { useEffect, useRef, useState } from "react";

/**
 * Texto com:
 * - animação de saída/entrada quando o conteúdo muda
 * - marquee automático quando o texto não cabe: desliza até o fim,
 *   espera 2s, volta deslizando para o início e espera 2s.
 */
export default function AutoScrollText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [shown, setShown] = useState(text);
  const [entering, setEntering] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);
  const [scrollDur, setScrollDur] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReduced(mq.matches);
    upd();
    mq.addEventListener?.("change", upd);
    return () => mq.removeEventListener?.("change", upd);
  }, []);

  // Troca de conteúdo: sai e entra
  useEffect(() => {
    if (text === shown) return;
    if (reduced) {
      setShown(text);
      return;
    }
    setLeaving(true);
    const t1 = setTimeout(() => {
      setShown(text);
      setLeaving(false);
      setEntering(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
    }, 260);
    return () => clearTimeout(t1);
  }, [text, shown, reduced]);

  // Mede overflow para o marquee
  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const inner = innerRef.current;
      if (!wrap || !inner) return;
      const over = inner.scrollWidth - wrap.clientWidth;
      if (over > 4 && !reduced) {
        setOffset(over + 2);
        setScrollDur(Math.max(2.5, (over + 2) / 30));
      } else {
        setOffset(0);
      }
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => ro?.disconnect();
  }, [shown, reduced]);

  const total = offset ? scrollDur * 2 + 4 : 0;
  const animName = `nexoMarquee${Math.round(offset)}`;

  return (
    <span
      ref={wrapRef}
      className={className}
      style={{ display: "block", overflow: "hidden", whiteSpace: "nowrap", ...style }}
    >
      {offset > 0 && (
        <style>{`
          @keyframes ${animName} {
            0%, ${((2 / total) * 100).toFixed(2)}% { transform: translateX(0); }
            ${(((2 + scrollDur) / total) * 100).toFixed(2)}%, ${(((4 + scrollDur) / total) * 100).toFixed(2)}% { transform: translateX(-${offset}px); }
            ${(((4 + scrollDur * 2) / total) * 100).toFixed(2)}%, 100% { transform: translateX(0); }
          }
        `}</style>
      )}
      <span
        ref={innerRef}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          opacity: leaving || entering ? 0 : 1,
          transform: leaving
            ? "translateY(-6px)"
            : entering
              ? "translateY(8px)"
              : undefined,
          transition: reduced ? "none" : "opacity 0.26s ease, transform 0.26s ease",
          animation:
            offset > 0 && !leaving && !entering
              ? `${animName} ${total}s ease-in-out infinite`
              : undefined,
        }}
      >
        {shown}
      </span>
    </span>
  );
}

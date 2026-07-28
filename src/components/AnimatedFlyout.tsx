import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** duração do fade/slide em ms (padrão 220) */
  duration?: number;
}

/**
 * Wrapper com animação suave de abrir/fechar.
 * - Mantém o elemento montado durante o exit (fade+slide+scale) e desmonta ao final.
 */
export function AnimatedFlyout({
  open,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  duration = 220,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (timeoutRef.current) { window.clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setMounted(true);
      // dispara transição no próximo frame para partir do estado inicial
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timeoutRef.current = window.setTimeout(() => setMounted(false), duration);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, duration]);

  if (!mounted) return null;

  return (
    <div
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0) scale(1)" : "translateX(-8px) scale(0.98)",
        transformOrigin: "left center",
        transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        willChange: "opacity, transform",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

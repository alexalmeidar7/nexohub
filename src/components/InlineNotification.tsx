import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface NotifyDetail {
  text: string;
  variant?: "info" | "success" | "error" | "warning";
}

interface Props {
  /** Mantido por compatibilidade — hoje o comportamento é sempre "fixed" centralizado no topo. */
  mode?: "inline" | "fixed";
}

const PALETTE: Record<
  NonNullable<NotifyDetail["variant"]>,
  { bg: string; fg: string; shadow: string; Icon: typeof Bell }
> = {
  info: {
    bg: "#0055ff",
    fg: "#ffffff",
    shadow: "0 8px 24px rgba(0,85,255,0.40)",
    Icon: Bell,
  },
  success: {
    bg: "#0055ff",
    fg: "#ffffff",
    shadow: "0 8px 24px rgba(0,85,255,0.40)",
    Icon: Bell,
  },
  warning: {
    bg: "#0055ff",
    fg: "#ffffff",
    shadow: "0 8px 24px rgba(0,85,255,0.40)",
    Icon: Bell,
  },
  error: {
    bg: "#0055ff",
    fg: "#ffffff",
    shadow: "0 8px 24px rgba(0,85,255,0.40)",
    Icon: Bell,
  },
};

export default function InlineNotification(_props: Props) {
  const [msg, setMsg] = useState<NotifyDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onNotify(e: Event) {
      const d = (e as CustomEvent<NotifyDetail>).detail;
      if (!d?.text) return;
      if (document.body.classList.contains("nexo-status-chip-on")) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setMsg(d);
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), 3800);
    }
    window.addEventListener("nexo-notify", onNotify);
    return () => {
      window.removeEventListener("nexo-notify", onNotify);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!msg || typeof document === "undefined") return null;

  const variant = msg.variant || "info";
  const { bg, fg, shadow, Icon } = PALETTE[variant] || PALETTE.info;

  const container: React.CSSProperties = {
    position: "fixed",
    top: 89,
    left: "50%",
    transform: `translateX(-50%) translateY(${visible ? "0" : "-10px"}) scale(${visible ? 1 : 0.96})`,
    // Acima de qualquer popup (Radix Dialog usa 50, Sonner ~9999). Usamos o teto de 32-bit int.
    zIndex: 2147483000,
    opacity: visible ? 1 : 0,
    transition:
      "opacity 220ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
    pointerEvents: visible ? "auto" : "none",
    display: "flex",
    justifyContent: "center",
    maxWidth: "min(92vw, 560px)",
    width: "max-content",
  };

  const pill: React.CSSProperties = {
    background: bg,
    color: fg,
    borderRadius: 9999,
    padding: "8px 20px",
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    fontFamily: "'Montserrat', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.2,
    boxShadow: shadow,
    border: "1px solid rgba(255, 255, 255, 0.2)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
    cursor: "pointer",
  };

  return createPortal(
    <div style={container} role="status" aria-live="polite">
      <div
        onClick={() => setVisible(false)}
        style={pill}
        title={msg.text}
      >
        <Icon size={15} strokeWidth={2.4} color="#ffffff" className="shrink-0 text-white" />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 480,
            color: "#ffffff",
          }}
        >
          {msg.text}
        </span>
      </div>
    </div>,
    document.body,
  );
}

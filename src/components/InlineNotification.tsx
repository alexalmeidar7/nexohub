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
    bg: "#00BFF0",
    fg: "#001420",
    shadow: "0 10px 30px rgba(0,191,240,0.35)",
    Icon: Bell,
  },
  success: {
    bg: "#C6F03C",
    fg: "#0c1400",
    shadow: "0 10px 30px rgba(198,240,60,0.4)",
    Icon: CheckCircle2,
  },
  warning: {
    bg: "#FFB020",
    fg: "#1a0e00",
    shadow: "0 10px 30px rgba(255,176,32,0.38)",
    Icon: AlertTriangle,
  },
  error: {
    bg: "#FF4D6D",
    fg: "#1a0006",
    shadow: "0 10px 30px rgba(255,77,109,0.4)",
    Icon: XCircle,
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
  const { bg, fg, shadow, Icon } = PALETTE[variant];

  const container: React.CSSProperties = {
    position: "fixed",
    top: 18,
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
    padding: "10px 18px",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontFamily: "'Montserrat', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.2,
    boxShadow: shadow,
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
        <Icon size={15} strokeWidth={2.4} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 480,
          }}
        >
          {msg.text}
        </span>
      </div>
    </div>,
    document.body,
  );
}

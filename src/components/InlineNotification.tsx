import { useEffect, useState, useRef } from "react";
import { Bell } from "lucide-react";

interface NotifyDetail {
  text: string;
  variant?: "info" | "success" | "error" | "warning";
}

interface Props {
  /** "inline" = inserido em fluxo (ex: header Dashboard). "fixed" = posição fixa fallback. */
  mode?: "inline" | "fixed";
}

const BG = "#a5d121";
const FG = "#0c0d0d";

// Contagem global de instâncias inline montadas — quando > 0, as fixed se ocultam.
const inlineMountedRef = { count: 0, listeners: new Set<() => void>() };
function setInlineDelta(delta: number) {
  inlineMountedRef.count += delta;
  inlineMountedRef.listeners.forEach((l) => l());
}

export default function InlineNotification({ mode = "inline" }: Props) {
  const [msg, setMsg] = useState<NotifyDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hiddenByInline, setHiddenByInline] = useState(false);

  // Registrar/deregistrar instâncias inline
  useEffect(() => {
    if (mode === "inline") {
      setInlineDelta(1);
      return () => setInlineDelta(-1);
    }
    // Fixed observa inline count
    const update = () => setHiddenByInline(inlineMountedRef.count > 0);
    update();
    inlineMountedRef.listeners.add(update);
    return () => {
      inlineMountedRef.listeners.delete(update);
    };
  }, [mode]);

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
    return () => window.removeEventListener("nexo-notify", onNotify);
  }, []);

  if (!msg) return null;
  if (mode === "fixed" && hiddenByInline) return null;

  const base: React.CSSProperties = {
    background: BG,
    color: FG,
    borderRadius: 9999,
    padding: "8px 16px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    maxWidth: 420,
    boxShadow: "0 6px 20px rgba(165,209,33,0.35)",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.96)",
    transition: "opacity 220ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
    pointerEvents: visible ? "auto" : "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const fixedStyle: React.CSSProperties =
    mode === "fixed"
      ? { position: "fixed", top: 20, right: 24, zIndex: 60 }
      : {};

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setVisible(false)}
      style={{ ...base, ...fixedStyle }}
      title={msg.text}
    >
      <Bell size={14} strokeWidth={2.4} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 360,
        }}
      >
        {msg.text}
      </span>
    </div>
  );
}

import { createRoot, type Root } from "react-dom/client";
import { useEffect, useState } from "react";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const DARK = "#0A2540";
const BG = "#D6F4FB";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

function ConfirmModal({
  options,
  onResolve,
}: {
  options: ConfirmOptions;
  onResolve: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (v: boolean) => {
    setOpen(false);
    setTimeout(() => onResolve(v), 180);
  };

  const confirmBg = options.destructive ? "#E11D48" : CYAN;

  return (
    <div
      onClick={() => close(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483001,
        background: "rgba(10, 37, 64, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        opacity: open ? 1 : 0,
        transition: "opacity 180ms ease",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 24,
          width: "100%",
          maxWidth: 440,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(10,37,64,0.25)",
          border: `1px solid ${CYAN}33`,
          transform: open ? "scale(1) translateY(0)" : "scale(0.96) translateY(-8px)",
          transition: "transform 180ms ease",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${CYAN} 0%, #00A9D6 100%)`,
            padding: "18px 22px",
            color: "#fff",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {options.title || "Confirmação"}
          </div>
        </div>
        <div style={{ padding: "22px", background: BG }}>
          <p style={{ color: DARK, fontSize: 14, lineHeight: 1.5, margin: 0, fontWeight: 600 }}>
            {options.message}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "14px 18px",
            background: "#fff",
            borderTop: `1px solid ${CYAN}22`,
          }}
        >
          <button
            type="button"
            onClick={() => close(false)}
            style={{
              padding: "9px 18px",
              borderRadius: 999,
              border: `2px solid ${CYAN}`,
              background: "#fff",
              color: DARK,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            {options.cancelLabel || "Cancelar"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            style={{
              padding: "9px 20px",
              borderRadius: 999,
              border: "none",
              background: confirmBg,
              color: options.destructive ? "#fff" : DARK,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
              boxShadow: options.destructive
                ? "0 4px 14px rgba(225,29,72,0.35)"
                : `0 4px 14px ${CYAN}55`,
            }}
          >
            {options.confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === "string" ? { message: input } : input;

  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(false);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    const cleanup = (v: boolean) => {
      try {
        root?.unmount();
      } catch {
        /* noop */
      }
      root = null;
      if (host.parentNode) host.parentNode.removeChild(host);
      resolve(v);
    };

    root.render(<ConfirmModal options={opts} onResolve={cleanup} />);
  });
}

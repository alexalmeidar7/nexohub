import { createRoot, type Root } from "react-dom/client";
import { useEffect, useState } from "react";

const CYAN = "#00BFF0";
const DARK = "#0A2540";
const BG = "#D6F4FB";

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
}

function PromptModal({
  options,
  onResolve,
}: {
  options: PromptOptions;
  onResolve: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(options.defaultValue || "");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = (v: string | null) => {
    setOpen(false);
    setTimeout(() => onResolve(v), 180);
  };

  const canSubmit = !options.required || value.trim().length > 0;
  const confirmBg = options.destructive ? "#E11D48" : CYAN;

  return (
    <div
      onClick={() => close(null)}
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
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close(null);
          if (e.key === "Enter" && !options.multiline && canSubmit) close(value);
        }}
        style={{
          background: "#fff",
          borderRadius: 24,
          width: "100%",
          maxWidth: 460,
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
            {options.title || "Informe"}
          </div>
        </div>
        <div style={{ padding: "22px", background: BG, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: DARK, fontSize: 14, lineHeight: 1.5, margin: 0, fontWeight: 600 }}>
            {options.message}
          </p>
          {options.multiline ? (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options.placeholder}
              maxLength={options.maxLength}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `2px solid ${CYAN}55`,
                background: "#fff",
                color: DARK,
                fontSize: 14,
                fontFamily: "Montserrat, sans-serif",
                resize: "vertical",
                outline: "none",
              }}
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options.placeholder}
              maxLength={options.maxLength}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `2px solid ${CYAN}55`,
                background: "#fff",
                color: DARK,
                fontSize: 14,
                fontFamily: "Montserrat, sans-serif",
                outline: "none",
              }}
            />
          )}
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
            onClick={() => close(null)}
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
            disabled={!canSubmit}
            onClick={() => canSubmit && close(value)}
            style={{
              padding: "9px 20px",
              borderRadius: 999,
              border: "none",
              background: canSubmit ? confirmBg : "#94a3b8",
              color: options.destructive ? "#fff" : DARK,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: canSubmit ? "pointer" : "not-allowed",
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

export function promptDialog(input: string | PromptOptions): Promise<string | null> {
  const opts: PromptOptions = typeof input === "string" ? { message: input } : input;

  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    const cleanup = (v: string | null) => {
      try {
        root?.unmount();
      } catch {
        /* noop */
      }
      root = null;
      if (host.parentNode) host.parentNode.removeChild(host);
      resolve(v);
    };

    root.render(<PromptModal options={opts} onResolve={cleanup} />);
  });
}

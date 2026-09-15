import { createRoot, type Root } from "react-dom/client";
import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, HelpCircle, X, CheckCircle2 } from "lucide-react";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: "trash" | "alert" | "info" | "check";
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

  const isDestructive = options.destructive !== false && (
    options.destructive === true ||
    (options.title || "").toLowerCase().includes("apagar") ||
    (options.title || "").toLowerCase().includes("excluir") ||
    (options.title || "").toLowerCase().includes("remover") ||
    (options.confirmLabel || "").toLowerCase().includes("apagar") ||
    (options.confirmLabel || "").toLowerCase().includes("excluir") ||
    (options.confirmLabel || "").toLowerCase().includes("remover")
  );

  return (
    <div
      onClick={() => close(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483001,
        background: "rgba(0, 33, 50, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        opacity: open ? 1 : 0,
        transition: "opacity 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 24,
          width: "100%",
          maxWidth: 460,
          overflow: "hidden",
          boxShadow: "0 24px 60px -12px rgba(0, 33, 50, 0.28)",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          transform: open ? "scale(1) translateY(0)" : "scale(0.95) translateY(-10px)",
          transition: "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px 16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isDestructive ? "rgba(225, 29, 72, 0.10)" : "rgba(0, 85, 255, 0.10)",
                color: isDestructive ? "#e11d48" : "#0055ff",
                border: isDestructive ? "1px solid rgba(225, 29, 72, 0.20)" : "1px solid rgba(0, 85, 255, 0.20)",
                flexShrink: 0,
              }}
            >
              {isDestructive ? (
                <Trash2 style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
              ) : options.icon === "check" ? (
                <CheckCircle2 style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
              ) : (
                <HelpCircle style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#002132",
                  lineHeight: 1.2,
                }}
              >
                {options.title || (isDestructive ? "Confirmar Exclusão" : "Confirmação")}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  fontWeight: 500,
                  marginTop: 2,
                }}
              >
                Esta ação requer a sua confirmação
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => close(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 150ms ease",
            }}
            title="Fechar"
          >
            <X style={{ width: 15, height: 15, strokeWidth: 2.5 }} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", background: "#ffffff" }}>
          <p
            style={{
              color: "#334155",
              fontSize: 13,
              lineHeight: 1.6,
              margin: 0,
              fontWeight: 600,
            }}
          >
            {options.message}
          </p>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "16px 24px",
            background: "#f8fafc",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <button
            type="button"
            onClick={() => close(false)}
            style={{
              height: 40,
              padding: "0 20px",
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 150ms ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            {options.cancelLabel || "Cancelar"}
          </button>

          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            style={{
              height: 40,
              padding: "0 24px",
              borderRadius: 999,
              border: "none",
              background: isDestructive ? "#e11d48" : "#0055ff",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "all 150ms ease",
              boxShadow: isDestructive
                ? "0 4px 16px rgba(225, 29, 72, 0.35)"
                : "0 4px 16px rgba(0, 85, 255, 0.30)",
            }}
          >
            {options.confirmLabel || (isDestructive ? "Apagar" : "Confirmar")}
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

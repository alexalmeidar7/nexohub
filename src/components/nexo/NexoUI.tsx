import React, { CSSProperties, ReactNode } from "react";

// Nexo Form Design System — reference: OuvintesPage (Cadastro do Ouvinte)
// Aplicar em todas as telas que devem seguir o padrão "cadastro do ouvinte".
export const NEXO = {
  CYAN: "#00BFF0",
  LIME: "#C6F03C",
  CARD_BG: "#D6F4FB",
  DARK: "#0A2540",
  WHITE: "#FFFFFF",
  SOFT: "#F1FAFD",
  MUTED: "#64748B",
  FONT: "'Montserrat', sans-serif",
};

export const pillInput: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: NEXO.WHITE,
  border: `2px solid ${NEXO.CYAN}`,
  padding: "0 20px",
  fontFamily: NEXO.FONT,
  fontSize: 13,
  color: NEXO.DARK,
  outline: "none",
};

export const pillSelect: CSSProperties = {
  ...pillInput,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2300BFF0' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 18px center",
  paddingRight: 44,
};

export const pillTextarea: CSSProperties = {
  ...pillInput,
  height: "auto",
  minHeight: 100,
  borderRadius: 22,
  padding: "14px 20px",
  lineHeight: 1.5,
  resize: "vertical",
};

export const labelStyle: CSSProperties = {
  fontFamily: NEXO.FONT,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: NEXO.DARK,
  marginBottom: 8,
  display: "block",
};

export function NexoField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function NexoCard({
  title,
  right,
  children,
  padding,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  padding?: string;
}) {
  return (
    <section
      style={{
        background: NEXO.CARD_BG,
        borderRadius: 28,
        padding: padding ?? "28px 32px 32px",
        boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        fontFamily: NEXO.FONT,
      }}
    >
      {(title || right) && (
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          {title && (
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 2,
                color: NEXO.DARK,
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function NexoBadge({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "lime" | "dark" }) {
  const border = tone === "lime" ? NEXO.LIME : tone === "dark" ? NEXO.DARK : NEXO.CYAN;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: NEXO.DARK,
        background: NEXO.WHITE,
        padding: "6px 16px",
        borderRadius: 999,
        border: `2px solid ${border}`,
        letterSpacing: 1,
        textTransform: "uppercase",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonStyle = (v: ButtonVariant): CSSProperties => {
  const base: CSSProperties = {
    height: 44,
    padding: "0 22px",
    borderRadius: 999,
    fontFamily: NEXO.FONT,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    border: "2px solid transparent",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  };
  if (v === "primary")
    return { ...base, background: NEXO.LIME, color: NEXO.DARK, boxShadow: "0 4px 14px rgba(198,240,60,0.35)" };
  if (v === "secondary")
    return { ...base, background: NEXO.WHITE, border: `2px solid ${NEXO.CYAN}`, color: NEXO.DARK };
  if (v === "danger")
    return { ...base, background: NEXO.WHITE, border: "2px solid #ef4444", color: "#ef4444" };
  return { ...base, background: "transparent", color: NEXO.DARK };
};

export function NexoButton({
  variant = "primary",
  children,
  onClick,
  type = "button",
  disabled,
  style,
  title,
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...buttonStyle(variant), opacity: disabled ? 0.55 : 1, ...style }}
    >
      {children}
    </button>
  );
}

export function NexoPage({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8 animate-fade-in" style={{ fontFamily: NEXO.FONT }}>
      {children}
    </div>
  );
}

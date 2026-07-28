import React from "react";
import { Code2 } from "lucide-react";

interface XmlSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
}

/**
 * Container padrão para blocos de XML (visual Nexo cyan/lime).
 * Deve ser posicionada como ÚLTIMA seção de cada página.
 */
export default function XmlSection({ title, count, children }: XmlSectionProps) {
  const childArray = React.Children.toArray(children).filter(Boolean);
  const resolvedCount = typeof count === "number" ? count : childArray.length;

  if (childArray.length === 0) return null;

  return (
    <section
      className="nexo-scope w-full"
      style={{
        marginTop: 24,
        borderRadius: 20,
        background: "#D6F4FB",
        border: "1.5px solid #00BFF0",
        padding: "18px 20px",
        fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
      }}
    >
      <header
        className="flex items-center gap-2"
        style={{ marginBottom: 12 }}
      >
        <Code2 size={16} style={{ color: "#00BFF0" }} strokeWidth={2.5} />
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#00BFF0",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {resolvedCount > 0 && (
          <span
            aria-label={`${resolvedCount} XML disponíveis`}
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              border: "1.5px solid #00BFF0",
              color: "#00BFF0",
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
              background: "transparent",
            }}
          >
            {resolvedCount}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

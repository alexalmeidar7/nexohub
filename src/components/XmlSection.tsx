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
        borderRadius: 24,
        background: "#ffffff",
        border: "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        padding: "20px 24px",
        fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
      }}
    >
      <header
        className="flex items-center gap-2.5"
        style={{ marginBottom: 14 }}
      >
        <div className="w-8 h-8 rounded-full bg-[#0055ff]/10 flex items-center justify-center">
          <Code2 size={16} className="text-[#0055ff]" strokeWidth={2.5} />
        </div>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#002132",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {resolvedCount > 0 && (
          <span
            aria-label={`${resolvedCount} XML disponíveis`}
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: "#0055ff",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
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

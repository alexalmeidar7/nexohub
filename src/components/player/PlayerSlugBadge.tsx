import React from "react";

interface PlayerSlugBadgeProps {
  slug?: string | null;
  radioName?: string | null;
  radioUserId?: string | null;
}

/**
 * Debug/verification chip — mostra userSlug + nome da rádio de forma discreta.
 * Renderiza inline; o container pai (flex items-center) o alinha verticalmente
 * ao centro do botão de ajuda "?".
 */
export default function PlayerSlugBadge({ slug, radioName, radioUserId }: PlayerSlugBadgeProps) {
  const shownSlug = slug && slug !== ":userSlug" ? slug : "—";
  const shownName = radioName?.trim() || "—";
  const shortId = radioUserId ? `${radioUserId.slice(0, 6)}…` : null;

  return (
    <div
      className="pointer-events-none select-none flex items-center gap-1.5 text-[10px] leading-none"
      style={{
        fontFamily: "'Lufga', 'Inter', system-ui, sans-serif",
        color: "rgba(255,255,255,0.55)",
        letterSpacing: "0.01em",
      }}
    >
      <span
        className="inline-block w-1 h-1 rounded-full"
        style={{ background: "#22d3ee", boxShadow: "0 0 4px rgba(34,211,238,0.7)" }}
      />
      <span style={{ opacity: 0.55 }}>{shownSlug}</span>
      <span style={{ opacity: 0.25 }}>·</span>
      <span style={{ opacity: 0.75 }}>{shownName}</span>
      {shortId && (
        <>
          <span style={{ opacity: 0.25 }}>·</span>
          <span style={{ opacity: 0.4, fontVariantNumeric: "tabular-nums" }}>{shortId}</span>
        </>
      )}
    </div>
  );
}

import React from "react";

interface PlayerSlugBadgeProps {
  slug?: string | null;
  radioName?: string | null;
  radioUserId?: string | null;
}

/**
 * Debug/verification badge — shows current userSlug and radio name
 * so it's easy to visually confirm which station the Player is bound to.
 * Fixed bottom-left, low-profile glassmorphism.
 */
export default function PlayerSlugBadge({ slug, radioName, radioUserId }: PlayerSlugBadgeProps) {
  const shownSlug = slug && slug !== ":userSlug" ? slug : "—";
  const shownName = radioName?.trim() || "—";
  const shortId = radioUserId ? `${radioUserId.slice(0, 8)}…` : null;

  return (
    <div
      className="fixed bottom-3 left-3 z-[9999] pointer-events-none select-none"
      style={{
        fontFamily: "'Lufga', 'Inter', system-ui, sans-serif",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] leading-none"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }}
        />
        <span style={{ opacity: 0.65 }}>slug</span>
        <span style={{ fontWeight: 600 }}>{shownSlug}</span>
        <span style={{ opacity: 0.35 }}>·</span>
        <span style={{ opacity: 0.65 }}>rádio</span>
        <span style={{ fontWeight: 600 }}>{shownName}</span>
        {shortId && (
          <>
            <span style={{ opacity: 0.35 }}>·</span>
            <span style={{ opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>{shortId}</span>
          </>
        )}
      </div>
    </div>
  );
}

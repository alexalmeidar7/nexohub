import { useRef, useState, useCallback } from "react";
import { Lock, Unlock } from "lucide-react";

export interface ElementPosition {
  x: number; // percentage 0-100+
  y: number; // percentage 0-100+
  scale: number; // 1 = default
  locked?: boolean;
}

export const defaultPositions: Record<string, ElementPosition> = {
  clock:          { x: 3, y: 8, scale: 1 },
  sponsor:        { x: 70, y: 2, scale: 1 },
  vinyl:          { x: 50, y: 30, scale: 1 },
  presenterPhoto: { x: 0, y: 100, scale: 1 },
  presenterInfo:  { x: 2, y: 90, scale: 1 },
  programLogo:    { x: 95, y: 75, scale: 1 },
  programNext:    { x: 95, y: 88, scale: 1 },
  // legacy keys kept for backward compat
  presenter:      { x: 0, y: 100, scale: 1 },
  program:        { x: 95, y: 80, scale: 1 },
};

const ELEMENT_LABELS: Record<string, string> = {
  clock: "Relógio",
  sponsor: "Patrocinador",
  vinyl: "Vinil",
  presenterPhoto: "Foto Locutor",
  presenterInfo: "Nome Locutor",
  programLogo: "Logo Programa",
  programNext: "A Seguir",
};

interface Props {
  id: string;
  position: ElementPosition;
  onMove: (id: string, pos: ElementPosition) => void;
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
}

export default function DraggableElement({ id, position, onMove, children, containerRef, style, className, anchor = "top-left" }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const isLocked = position.locked === true;

  const toAbsStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      zIndex: hovered || dragging.current ? 50 : 10,
      cursor: isLocked ? "default" : "grab",
      transform: `scale(${position.scale})`,
      transformOrigin: anchor === "top-right" ? "top right" : anchor === "bottom-right" ? "bottom right" : anchor === "bottom-left" ? "bottom left" : anchor === "center" ? "center" : "top left",
      outline: isLocked ? "1px dashed rgba(239,68,68,0.25)" : hovered ? "2px dashed rgba(255,255,255,0.4)" : "none",
      outlineOffset: 4,
      transition: dragging.current ? "none" : "outline 0.2s",
      pointerEvents: isLocked ? "none" : "auto",
    };
    if (anchor === "top-left" || anchor === "center") {
      base.left = `${position.x}%`;
      base.top = `${position.y}%`;
    } else if (anchor === "top-right") {
      base.right = `${100 - position.x}%`;
      base.top = `${position.y}%`;
    } else if (anchor === "bottom-left") {
      base.left = `${position.x}%`;
      base.bottom = `${100 - position.y}%`;
    } else if (anchor === "bottom-right") {
      base.right = `${100 - position.x}%`;
      base.bottom = `${100 - position.y}%`;
    }
    return base;
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPos.current = { x: position.x, y: position.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((ev.clientX - startMouse.current.x) / rect.width) * 100;
      const dy = ((ev.clientY - startMouse.current.y) / rect.height) * 100;
      // Allow values beyond 0-100 so elements can go past edges / behind sidebar
      const nx = Math.max(-20, Math.min(120, startPos.current.x + dx));
      const ny = Math.max(-20, Math.min(120, startPos.current.y + dy));
      onMove(id, { ...position, x: nx, y: ny });
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [id, position, onMove, containerRef, isLocked]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.3, Math.min(3, position.scale + delta));
    onMove(id, { ...position, scale: newScale });
  }, [id, position, onMove, isLocked]);

  const toggleLock = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMove(id, { ...position, locked: !isLocked });
  }, [id, position, onMove, isLocked]);

  const label = ELEMENT_LABELS[id] || id;

  return (
    <div
      ref={elRef}
      onMouseDown={onMouseDown}
      onWheel={onWheel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{ ...toAbsStyle(), ...style }}
    >
      {children}
      {hovered && !isLocked && (
        <div style={{
          position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 7, padding: "2px 6px",
          borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span>{label}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ opacity: 0.6 }}>{Math.round(position.scale * 100)}%</span>
        </div>
      )}
      {/* Lock/unlock button — always visible on hover, pointer-events auto even when locked */}
      {hovered && (
        <div
          onClick={toggleLock}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: "absolute", top: -12, right: -12,
            width: 18, height: 18, borderRadius: "50%",
            background: isLocked ? "rgba(239,68,68,0.85)" : "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", pointerEvents: "auto", zIndex: 100,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {isLocked ? <Lock size={9} color="#fff" /> : <Unlock size={9} color="#fff" />}
        </div>
      )}
      {/* Locked indicator — small icon always visible */}
      {isLocked && !hovered && (
        <div style={{
          position: "absolute", top: -6, right: -6,
          width: 12, height: 12, borderRadius: "50%",
          background: "rgba(239,68,68,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <Lock size={7} color="#fff" />
        </div>
      )}
    </div>
  );
}

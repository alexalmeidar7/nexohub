import { useRef, useState, useCallback, useEffect } from "react";

export interface ElementPosition {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number; // 1 = default
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

interface Props {
  id: string;
  position: ElementPosition;
  onMove: (id: string, pos: ElementPosition) => void;
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
  /** anchor: which edge the element sticks to. Default "top-left" */
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
}

export default function DraggableElement({ id, position, onMove, children, containerRef, style, className, anchor = "top-left" }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const toAbsStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      zIndex: hovered || dragging.current ? 50 : 10,
      cursor: "grab",
      transform: `scale(${position.scale})`,
      transformOrigin: anchor === "top-right" ? "top right" : anchor === "bottom-right" ? "bottom right" : anchor === "bottom-left" ? "bottom left" : anchor === "center" ? "center" : "top left",
      outline: hovered ? "2px dashed rgba(255,255,255,0.4)" : "none",
      outlineOffset: 4,
      transition: dragging.current ? "none" : "outline 0.2s",
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
      const nx = Math.max(0, Math.min(100, startPos.current.x + dx));
      const ny = Math.max(0, Math.min(100, startPos.current.y + dy));
      onMove(id, { ...position, x: nx, y: ny });
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [id, position, onMove, containerRef]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.3, Math.min(3, position.scale + delta));
    onMove(id, { ...position, scale: newScale });
  }, [id, position, onMove]);

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
      {hovered && (
        <div style={{
          position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 8, padding: "1px 6px",
          borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
        }}>
          Arraste · Scroll p/ escala ({Math.round(position.scale * 100)}%)
        </div>
      )}
    </div>
  );
}

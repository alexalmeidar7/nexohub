import { useState, useEffect, useRef } from "react";
import type React from "react";
import { Minus, X } from "lucide-react";

interface HouseMixWindowProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  children: React.ReactNode;
  bodyClassName?: string;
  wide?: boolean;
}

export default function HouseMixWindow({
  title,
  isOpen,
  onClose,
  onMinimize,
  children,
  bodyClassName,
  wide = false,
}: HouseMixWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPosX: 0,
    initialPosY: 0,
  });

  // Calculate initial centered position on mount or when window becomes open
  useEffect(() => {
    if (!isOpen) return;

    const calcDefaultPos = () => {
      const winWidth = Math.min(1240, window.innerWidth * 0.94);
      const defaultX = Math.max(10, (window.innerWidth - winWidth) / 2);
      const defaultY = 138; // sits comfortably below the HouseMix header & date pill
      setPosition((prev) => prev ?? { x: defaultX, y: defaultY });
    };

    calcDefaultPos();
    window.addEventListener("resize", calcDefaultPos);
    return () => window.removeEventListener("resize", calcDefaultPos);
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Exclude button clicks from initiating drag
    if ((e.target as HTMLElement).closest("button")) return;

    const headerEl = e.currentTarget;
    headerEl.setPointerCapture(e.pointerId);

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: position?.x ?? 0,
      initialPosY: position?.y ?? 0,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDragging) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    const newX = dragRef.current.initialPosX + deltaX;
    const newY = dragRef.current.initialPosY + deltaY;

    const winWidth = windowRef.current?.offsetWidth || 1240;
    const minX = -winWidth + 120;
    const maxX = window.innerWidth - 120;
    const minY = 60; // keep below top bar
    const maxY = Math.max(60, window.innerHeight - 80);

    setPosition({
      x: Math.min(Math.max(newX, minX), maxX),
      y: Math.min(Math.max(newY, minY), maxY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      dragRef.current.isDragging = false;
      setIsDragging(false);
    }
  };

  return (
    <div
      ref={windowRef}
      className={`fixed z-40 flex flex-col w-[94vw] ${wide ? "max-w-none" : "max-w-[1240px]"} h-[calc(100vh-250px)] max-h-[740px] min-h-[440px] rounded-2xl border-2 border-[#0055ff] bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.55),0_0_30px_rgba(0,85,255,0.2)] overflow-hidden transition-shadow ${
        isDragging ? "shadow-[0_30px_70px_-10px_rgba(0,0,0,0.65),0_0_40px_rgba(0,85,255,0.35)]" : ""
      }`}
      style={{
        display: isOpen ? "flex" : "none",
        left: position ? `${position.x}px` : "50%",
        top: position ? `${position.y}px` : "138px",
        transform: position ? "none" : "translateX(-50%)",
      }}
    >
      {/* Blue Title Bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-11 bg-[#0055ff] px-4 flex items-center justify-between select-none cursor-grab active:cursor-grabbing shrink-0 touch-none"
      >
        {/* Left: Dot + Title */}
        <div className="flex items-center gap-2.5 min-w-0 pr-4">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0 shadow-[0_0_6px_#38bdf8]" />
          <span className="text-white text-[12px] font-bold uppercase tracking-wider truncate">
            {title}
          </span>
        </div>

        {/* Right: Window Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Minimize Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="w-6 h-6 rounded-[5px] flex items-center justify-center border border-white/70 hover:border-white hover:bg-white/20 text-white transition-all cursor-pointer active:scale-95"
            title="Minimizar"
            aria-label="Minimizar janela"
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-6 h-6 rounded-[5px] flex items-center justify-center border border-white/70 hover:border-red-400 hover:bg-red-600 text-white transition-all cursor-pointer active:scale-95"
            title="Fechar"
            aria-label="Fechar janela"
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Window Body (scrollable with custom blue scrollbar) */}
      <div className={bodyClassName || "flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 custom-housemix-scrollbar bg-[#f8fafc]"}>
        {children}
      </div>
    </div>
  );
}

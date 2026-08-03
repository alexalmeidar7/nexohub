import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { Music, User, Loader2, Check, Globe, FolderOpen, Clock, Upload, Monitor, ChevronDown, ChevronUp, AlertTriangle, Circle, Sparkles, X, Settings, Minus, Maximize2 } from "lucide-react";
const InfoMusicSection = lazy(() => import("./InfoMusicSection"));
import InfoMusicSourceSelector from "./InfoMusicSourceSelector";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findCurrentProgram } from "./OnAirWidget";
import { getApresentadores } from "./ApresentadorForm";
import { normalizeMusicText } from "@/lib/textEncoding";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { useCoverPalette, getPaletteContrast } from "@/lib/coverPalette";
import { matchesMusicException } from "@/lib/musicExceptions";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

interface MusicaNoArProps {
  effectiveUserId?: string | null;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose?: () => void;
}

import { getMusicData } from "@/lib/musicData";
export { getMusicData } from "@/lib/musicData";

export default function MusicaNoAr({ effectiveUserId, minimized, onMinimize, onRestore, onClose }: MusicaNoArProps) {
  const { user } = useAuth();
  const dataUserId = effectiveUserId || user?.id || null;
  const [music, setMusic] = useState<MusicData | null>(null);
  const [position, setPosition] = useState({ x: 18, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  useEffect(() => {
    if (!dataUserId) return;
    const poll = async () => {
      const d = await getMusicData(dataUserId);
      if (d && d.music) {
        setMusic({ 
          titulo: d.music.titulo, 
          artista: d.music.artista, 
          duracao: d.music.duracao || 0, 
          capa: d.music.capa || "" 
        });
      }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [dataUserId]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!minimized) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (minimized) {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "fixed", 
          left: position.x, 
          bottom: position.y, 
          zIndex: 60,
          display: "flex", alignItems: "center", gap: 6,
          background: DARK, borderRadius: 999, padding: "4px 6px 4px 4px",
          boxShadow: "0 12px 30px rgba(10,37,64,0.45)", fontFamily: FONT,
          border: `2px solid ${CYAN}`,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          transition: isDragging ? "none" : "all 0.2s ease-out",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: "transparent", color: "#fff", border: "none", borderRadius: 999,
            padding: "6px 10px", fontFamily: FONT, fontWeight: 800, fontSize: 12,
            textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer",
          }}
        >
          <Music size={14} color={CYAN} /> {music?.titulo || "Música no Ar"} <Maximize2 size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 999,
            width: 22, height: 22, color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600">
            <Music size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Música no Ar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onMinimize}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            <Minus size={20} />
          </button>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl border border-slate-200 p-0 shadow-sm overflow-hidden space-y-4">
        <div className="p-5 border-b border-slate-100">
          <InfoMusicSourceSelector />
        </div>
        <Suspense fallback={<div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-cyan-500" /></div>}>
          <InfoMusicSection />
        </Suspense>
      </div>
    </div>
  );
}
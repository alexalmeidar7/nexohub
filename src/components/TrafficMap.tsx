import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, MapPin } from "lucide-react";

interface TrafficMapProps {
  lat: number;
  lon: number;
  zoom: number;
  interactive?: boolean;
  onMove?: (lat: number, lon: number, zoom: number) => void;
  onPointMove?: (id: string, lat: number, lon: number) => void;
  points?: { id: string, lat: number, lng: number }[];
  activePointId?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundCoord = (value: number) => Math.round(value * 10000) / 10000;

export default function TrafficMap({ lat, lon, zoom, interactive = false, onMove, onPointMove, points = [], activePointId, className, style }: TrafficMapProps) {
  const [view, setView] = useState(() => ({
    lat: roundCoord(clamp(lat, -85, 85)),
    lon: roundCoord(clamp(lon, -180, 180)),
    zoom: clamp(Math.round(zoom), 3, 15),
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragPointId, setDragPointId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [lastViewChange, setLastViewChange] = useState(0);

  useEffect(() => {
    const next = {
      lat: roundCoord(clamp(lat, -85, 85)),
      lon: roundCoord(clamp(lon, -180, 180)),
      zoom: clamp(Math.round(zoom), 3, 15),
    };

    setView((prev) => {
      if (prev.lat === next.lat && prev.lon === next.lon && prev.zoom === next.zoom) {
        return prev;
      }
      setIsNavigating(true);
      setLastViewChange(Date.now());
      return next;
    });
  }, [lat, lon, zoom]);

  // Monitor when navigation finishes
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => {
      if (Date.now() - lastViewChange >= 1000) {
        setIsNavigating(false);
      }
    }, 1100);
    return () => clearTimeout(timer);
  }, [isNavigating, lastViewChange]);

  const panStep = useMemo(() => {
    return Math.max(0.0035, 1.35 / Math.pow(2, Math.max(view.zoom - 3, 0) / 1.9));
  }, [view.zoom]);

  const iframeZoom = useMemo(() => clamp(Math.round(view.zoom + 4), 5, 17), [view.zoom]);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      zoom: String(iframeZoom),
      lat: String(view.lat),
      lon: String(view.lon),
      ct: "livemap",
    });

    return `https://embed.waze.com/iframe?${params.toString()}`;
  }, [iframeZoom, view.lat, view.lon]);

  const updateView = (next: { lat: number; lon: number; zoom: number }) => {
    const normalized = {
      lat: roundCoord(clamp(next.lat, -85, 85)),
      lon: roundCoord(clamp(next.lon, -180, 180)),
      zoom: clamp(Math.round(next.zoom), 3, 15),
    };

    setView(normalized);
    onMove?.(normalized.lat, normalized.lon, normalized.zoom);
  };

  const handlePan = (latDelta: number, lonDelta: number) => {
    updateView({
      lat: view.lat + latDelta * panStep,
      lon: view.lon + lonDelta * panStep,
      zoom: view.zoom,
    });
  };

  const handleZoom = (delta: number) => {
    updateView({
      lat: view.lat,
      lon: view.lon,
      zoom: view.zoom + delta,
    });
  };

  return (
    <div 
      className={className} 
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}
      onMouseUp={() => {
        setIsDragging(false);
        setDragPointId(null);
      }}
      onMouseLeave={() => {
        setIsDragging(false);
        setDragPointId(null);
      }}
      onMouseMove={(e) => {
        if (!isDragging || !interactive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        // When dragging the center point (no point ID)
        if (!dragPointId) {
          // Normal panning logic is already handled by buttons
          return;
        }

        // Approximation for moving points on the map
        // Waze iframe doesn't let us know exactly where we click, 
        // but we can estimate based on the center and zoom
        const latDelta = (y - 0.5) * -panStep * 2;
        const lonDelta = (x - 0.5) * panStep * 2;
        
        if (onPointMove) {
          onPointMove(dragPointId, view.lat + latDelta, view.lon + lonDelta);
        }
      }}
    >
      <iframe
        key={`${view.lat}-${view.lon}-${iframeZoom}`}
        src={iframeSrc}
        title="Mapa de trânsito"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "inherit",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
      {interactive && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ zIndex: 5 }}
        >
          {isNavigating && (
            <div className="absolute top-[30%] bg-background/80 backdrop-blur-sm px-4 py-1.5 rounded-full border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground animate-pulse shadow-lg">
              Navegando...
            </div>
          )}
          <div className={`text-[var(--layout-accent-color, #3b82f6)] ${!dragPointId && !isNavigating ? 'animate-bounce' : ''}`}>
            <MapPin size={32} strokeWidth={3} fill="white" />
          </div>
        </div>
      )}

      {/* Render interactive markers for the points */}
      {interactive && points.map(p => {
        // Simple projection: approximate position relative to center
        // This is not mathematically perfect for all zoom levels but works for UI feedback
        const latDiff = p.lat - view.lat;
        const lonDiff = p.lng - view.lon;
        
        // Scale diffs to pixels based on current zoom
        // This scale factor is an approximation
        const scale = Math.pow(2, view.zoom) * 0.01;
        const top = 50 - (latDiff * scale * 100);
        const left = 50 + (lonDiff * scale * 100);

        // Only show if within view bounds
        if (top < 0 || top > 100 || left < 0 || left > 100) return null;

        const isActive = activePointId === p.id;

        return (
          <div
            key={p.id}
            className={`absolute cursor-move group transition-all duration-300 ${isActive ? 'scale-110' : ''}`}
            style={{ 
              top: `${top}%`, 
              left: `${left}%`, 
              zIndex: (dragPointId === p.id || isActive) ? 30 : 10,
              transform: "translate(-50%, -100%)",
              pointerEvents: "auto"
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDragging(true);
              setDragPointId(p.id);
            }}
          >
            <div className="flex flex-col items-center relative">
              {isActive && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-[var(--layout-accent-color)]/20 rounded-full animate-ping pointer-events-none" />
              )}
              <div className="bg-white px-2 py-0.5 rounded shadow text-[10px] font-bold mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Arraste para mover
              </div>
              <MapPin 
                size={isActive ? 32 : 24} 
                className={dragPointId === p.id ? "text-red-500" : isActive ? "text-[var(--layout-accent-color)]" : "text-[var(--layout-accent-color)]/70"} 
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
                fill={isActive ? "white" : "rgba(255,255,255,0.7)"}
              />
            </div>
          </div>
        );
      })}

      {interactive && (
        <>
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/85 p-2 text-foreground shadow-2xl backdrop-blur-sm">
              <div />
              <button type="button" onClick={() => handlePan(1, 0)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Mover mapa para cima">
                <ChevronUp size={18} />
              </button>
              <div />

              <button type="button" onClick={() => handlePan(0, -1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Mover mapa para a esquerda">
                <ChevronLeft size={18} />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Move
              </div>
              <button type="button" onClick={() => handlePan(0, 1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Mover mapa para a direita">
                <ChevronRight size={18} />
              </button>

              <div />
              <button type="button" onClick={() => handlePan(-1, 0)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Mover mapa para baixo">
                <ChevronDown size={18} />
              </button>
              <div />
            </div>

            <div className="flex items-center justify-end gap-2 rounded-2xl border border-border bg-background/85 p-2 text-foreground shadow-2xl backdrop-blur-sm">
              <button type="button" onClick={() => handleZoom(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Diminuir zoom">
                <Minus size={18} />
              </button>
              <div className="min-w-14 text-center text-xs font-semibold text-muted-foreground">Zoom {view.zoom}</div>
              <button type="button" onClick={() => handleZoom(1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted" aria-label="Aumentar zoom">
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 z-10 rounded-full border border-border bg-background/85 px-3 py-1.5 text-[10px] font-medium tracking-[0.15em] text-muted-foreground shadow-lg backdrop-blur-sm">
            {view.lat.toFixed(4)}, {view.lon.toFixed(4)}
          </div>
        </>
      )}
    </div>
  );
}

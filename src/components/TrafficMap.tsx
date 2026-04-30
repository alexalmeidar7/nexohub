import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, MapPin } from "lucide-react";

interface TrafficMapProps {
  lat: number;
  lon: number;
  zoom: number;
  interactive?: boolean;
  onMove?: (lat: number, lon: number, zoom: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundCoord = (value: number) => Math.round(value * 10000) / 10000;

export default function TrafficMap({ lat, lon, zoom, interactive = false, onMove, className, style }: TrafficMapProps) {
  const [view, setView] = useState(() => ({
    lat: roundCoord(clamp(lat, -85, 85)),
    lon: roundCoord(clamp(lon, -180, 180)),
    zoom: clamp(Math.round(zoom), 3, 15),
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragPointId, setDragPointId] = useState<string | null>(null);

  useEffect(() => {
    setView((prev) => {
      const next = {
        lat: roundCoord(clamp(lat, -85, 85)),
        lon: roundCoord(clamp(lon, -180, 180)),
        zoom: clamp(Math.round(zoom), 3, 15),
      };

      if (prev.lat === next.lat && prev.lon === next.lon && prev.zoom === next.zoom) {
        return prev;
      }

      return next;
    });
  }, [lat, lon, zoom]);

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
      onMouseMove={(e) => {
        if (!isDragging || !interactive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        // Approximation for dragging markers on a map is complex with iframe, 
        // but for now we allow manual coordinate entry and panning.
        // As Waze iframe doesn't support easy coordinate extraction on click,
        // we'll keep the pan/zoom controls as the primary interaction.
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
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 5 }}
        >
          <div className="text-[var(--layout-accent-color, #3b82f6)] animate-bounce">
            <MapPin size={32} strokeWidth={3} fill="white" />
          </div>
        </div>
      )}

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

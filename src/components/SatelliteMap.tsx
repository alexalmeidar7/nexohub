import { useEffect, useRef, useState } from "react";

interface SatelliteMapProps {
  lat: number;
  lon: number;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onMove?: (lat: number, lon: number, zoom: number) => void;
  interactive?: boolean;
  showControls?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundCoord = (value: number) => Math.round(value * 10000) / 10000;

export default function SatelliteMap({ 
  lat, 
  lon, 
  zoom = 6, 
  onZoomChange, 
  onMove,
  interactive = false,
  showControls = false, 
  className, 
  style 
}: SatelliteMapProps) {
  const [view, setView] = useState(() => ({
    lat: roundCoord(clamp(lat, -85, 85)),
    lon: roundCoord(clamp(lon, -180, 180)),
    zoom: clamp(Math.round(zoom), 3, 15),
  }));

  const [debouncedView, setDebouncedView] = useState(view);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = {
      lat: roundCoord(clamp(lat, -85, 85)),
      lon: roundCoord(clamp(lon, -180, 180)),
      zoom: clamp(Math.round(zoom), 3, 15),
    };

    setView(prev => {
      if (prev.lat === next.lat && prev.lon === next.lon && prev.zoom === next.zoom) {
        return prev;
      }
      return next;
    });
  }, [lat, lon, zoom]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedView(view);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [view]);

  const panStep = Math.max(0.0035, 1.35 / Math.pow(2, Math.max(view.zoom - 3, 0) / 1.9));

  const updateView = (next: { lat: number; lon: number; zoom: number }) => {
    const normalized = {
      lat: roundCoord(clamp(next.lat, -85, 85)),
      lon: roundCoord(clamp(next.lon, -180, 180)),
      zoom: clamp(Math.round(next.zoom), 3, 15),
    };

    setView(normalized);
    onMove?.(normalized.lat, normalized.lon, normalized.zoom);
    if (normalized.zoom !== view.zoom) {
      onZoomChange?.(normalized.zoom);
    }
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

  const windyUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=${debouncedView.zoom}&overlay=satellite&product=satellite&level=surface&lat=${debouncedView.lat}&lon=${debouncedView.lon}&detailLat=${debouncedView.lat}&detailLon=${debouncedView.lon}&marker=true&message=false&calendar=now&pressure=false&type=map&menu=false&detail=false&autoplay=true`;

  return (
    <div className="relative" style={{ width: "100%", height: "100%", ...style }}>
      <iframe
        key={`sat-${debouncedView.zoom}-${debouncedView.lat.toFixed(2)}-${debouncedView.lon.toFixed(2)}`}
        src={windyUrl}
        className={className}
        style={{ 
          width: "100%", 
          height: "100%", 
          border: "none", 
          borderRadius: "inherit",
          pointerEvents: interactive ? "none" : "auto" // If interactive is true, we want our own buttons to handle it
        }}
        title="Mapa Satélite Meteorológico"
        allowFullScreen
      />
      
      {(showControls || interactive) && (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
          {interactive && (
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/20 bg-black/60 p-2 text-white shadow-2xl backdrop-blur-sm">
              <div />
              <button type="button" onClick={() => handlePan(1, 0)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
                <ChevronUp size={18} />
              </button>
              <div />

              <button type="button" onClick={() => handlePan(0, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
                <ChevronLeft size={18} />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[10px] font-semibold uppercase tracking-widest text-white/60">
                Pan
              </div>
              <button type="button" onClick={() => handlePan(0, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
                <ChevronRight size={18} />
              </button>

              <div />
              <button type="button" onClick={() => handlePan(-1, 0)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
                <ChevronDown size={18} />
              </button>
              <div />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 rounded-2xl border border-border/20 bg-black/60 p-2 text-white shadow-2xl backdrop-blur-sm">
            <button type="button" onClick={() => handleZoom(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
              <Minus size={18} />
            </button>
            <div className="min-w-10 text-center text-xs font-semibold text-white/80">Z{view.zoom}</div>
            <button type="button" onClick={() => handleZoom(1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
              <Plus size={18} />
            </button>
          </div>
        </div>
      )}

      {interactive && (
        <div className="absolute bottom-4 left-4 z-10 rounded-full border border-border/20 bg-black/60 px-3 py-1.5 text-[10px] font-medium tracking-widest text-white/60 shadow-lg backdrop-blur-sm">
          {view.lat.toFixed(4)}, {view.lon.toFixed(4)}
        </div>
      )}
    </div>
  );
}

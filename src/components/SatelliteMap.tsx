import { useEffect, useRef, useState } from "react";

interface SatelliteMapProps {
  lat: number;
  lon: number;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showControls?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function SatelliteMap({ lat, lon, zoom = 6, onZoomChange, showControls = false, className, style }: SatelliteMapProps) {
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [debouncedZoom, setDebouncedZoom] = useState(zoom);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentZoom(zoom);
    setDebouncedZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedZoom(currentZoom);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [currentZoom]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(3, Math.min(15, currentZoom + delta));
    setCurrentZoom(newZoom);
    onZoomChange?.(newZoom);
  };

  const windyUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=${debouncedZoom}&overlay=satellite&product=satellite&level=surface&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&marker=true&message=false&calendar=now&pressure=false&type=map&menu=false&detail=false&autoplay=true`;

  return (
    <div className="relative" style={{ width: "100%", height: "100%", ...style }}>
      <iframe
        key={`sat-${debouncedZoom}-${lat.toFixed(2)}-${lon.toFixed(2)}`}
        src={windyUrl}
        className={className}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: "inherit" }}
        title="Mapa Satélite Meteorológico"
        allowFullScreen
      />
      {showControls && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-50">
          <button
            onClick={() => handleZoom(1)}
            className="w-9 h-9 rounded-lg bg-black/60 backdrop-blur text-white flex items-center justify-center text-lg font-bold hover:bg-black/80 transition"
          >+</button>
          <button
            onClick={() => handleZoom(-1)}
            className="w-9 h-9 rounded-lg bg-black/60 backdrop-blur text-white flex items-center justify-center text-lg font-bold hover:bg-black/80 transition"
          >−</button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface SatelliteMapProps {
  lat: number;
  lon: number;
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function SatelliteMap({ lat, lon, zoom = 6, className, style }: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if ((el as any)._leaflet_id) {
      try { (el as any)._leaflet_id = undefined; } catch {}
    }

    let map: L.Map;
    try {
      map = L.map(el, {
        center: [lat, lon],
        zoom,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        attributionControl: false,
      });
    } catch {
      return;
    }

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    ).addTo(map);

    mapRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);

    return () => {
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.setView([lat, lon], zoom, { animate: true, duration: 0.5 }); } catch {}
  }, [lat, lon, zoom]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}

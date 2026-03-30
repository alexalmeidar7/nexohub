import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TrafficMapProps {
  lat: number;
  lon: number;
  zoom: number;
  interactive?: boolean;
  onMove?: (lat: number, lon: number, zoom: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function TrafficMap({ lat, lon, zoom, interactive = false, onMove, className, style }: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const skipNextView = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Prevent double-init
    if ((el as any)._leaflet_id) {
      try { (el as any)._leaflet_id = undefined; } catch {}
    }

    let map: L.Map;
    try {
      map = L.map(el, {
        center: [lat, lon],
        zoom,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        attributionControl: false,
      });
    } catch {
      return;
    }

    // Base map tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Google traffic overlay
    L.tileLayer(
      "https://mt0.google.com/vt/lyrs=h,traffic&x={x}&y={y}&z={z}",
      { maxZoom: 19, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;

    if (interactive && onMove) {
      map.on("moveend", () => {
        skipNextView.current = true;
        const c = map.getCenter();
        onMove(parseFloat(c.lat.toFixed(4)), parseFloat(c.lng.toFixed(4)), map.getZoom());
      });
    }

    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);

    return () => {
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (skipNextView.current) {
      skipNextView.current = false;
      return;
    }

    try {
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      if (
        Math.abs(currentCenter.lat - lat) > 0.0001 ||
        Math.abs(currentCenter.lng - lon) > 0.0001 ||
        currentZoom !== zoom
      ) {
        map.setView([lat, lon], zoom, { animate: true, duration: 0.5 });
      }
    } catch {}
  }, [lat, lon, zoom]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}

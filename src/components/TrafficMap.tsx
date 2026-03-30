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

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
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

    // OpenStreetMap tile layer with traffic-style colours
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    if (interactive && onMove) {
      map.on("moveend", () => {
        skipNextView.current = true;
        const c = map.getCenter();
        onMove(parseFloat(c.lat.toFixed(4)), parseFloat(c.lng.toFixed(4)), map.getZoom());
      });
    }

    // Fix tile sizing after initial render
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Sync external prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (skipNextView.current) {
      skipNextView.current = false;
      return;
    }

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    if (
      Math.abs(currentCenter.lat - lat) > 0.0001 ||
      Math.abs(currentCenter.lng - lon) > 0.0001 ||
      currentZoom !== zoom
    ) {
      map.setView([lat, lon], zoom, { animate: true, duration: 0.5 });
    }
  }, [lat, lon, zoom]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}

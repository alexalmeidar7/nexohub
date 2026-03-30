/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback, useState } from "react";
import { Cloud, Radio } from "lucide-react";

declare global {
  interface Window {
    google: any;
  }
}

const GOOGLE_MAPS_API_KEY = "AIzaSyAFjw2CYxl40aDop1SsYTNC8sCrdsoR-5o";

interface SatelliteMapProps {
  lat: number;
  lon: number;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showControls?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  if (scriptLoaded && window.google?.maps) return Promise.resolve();
  return new Promise((resolve) => {
    if (scriptLoading) {
      loadCallbacks.push(resolve);
      return;
    }
    scriptLoading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=visualization`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptLoading = false;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SatelliteMap({ lat, lon, zoom = 6, onZoomChange, showControls = false, className, style }: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [radarTime, setRadarTime] = useState<string | null>(null);
  const [cloudTime, setCloudTime] = useState<string | null>(null);

  const initMap = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    await loadGoogleMaps();
    const gm = window.google?.maps;
    if (!gm) return;

    if (mapRef.current) {
      mapRef.current = null;
      el.innerHTML = "";
    }

    const map = new gm.Map(el, {
      center: { lat, lng: lon },
      zoom,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      gestureHandling: "greedy",
      keyboardShortcuts: false,
    });

    // Weather layer attempt
    try {
      const vis = gm.visualization;
      if (vis?.WeatherLayer) {
        new vis.WeatherLayer().setMap(map);
      }
    } catch {}

    // RainViewer radar + satellite cloud overlay
    try {
      const rvRes = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const rvData = await rvRes.json();

      // Satellite/infrared cloud layer
      if (rvData?.satellite?.infrared?.length) {
        const latestSat = rvData.satellite.infrared[rvData.satellite.infrared.length - 1];
        setCloudTime(formatTime(latestSat.time));
        const cloudOverlay = new gm.ImageMapType({
          getTileUrl: (coord: any, z: number) =>
            `https://tilecache.rainviewer.com${latestSat.path}/256/${z}/${coord.x}/${coord.y}/1/1_1.png`,
          tileSize: new gm.Size(256, 256),
          opacity: 0.6,
          name: "Clouds",
        });
        map.overlayMapTypes.push(cloudOverlay);
      }

      // Radar precipitation layer
      if (rvData?.radar?.past?.length) {
        const latest = rvData.radar.past[rvData.radar.past.length - 1];
        setRadarTime(formatTime(latest.time));
        const radarOverlay = new gm.ImageMapType({
          getTileUrl: (coord: any, z: number) =>
            `https://tilecache.rainviewer.com${latest.path}/256/${z}/${coord.x}/${coord.y}/6/1_1.png`,
          tileSize: new gm.Size(256, 256),
          opacity: 0.65,
          name: "Radar",
        });
        map.overlayMapTypes.push(radarOverlay);
      }
    } catch {}

    mapRef.current = map;
  }, [lat, lon, zoom]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const newZoom = Math.max(2, Math.min(20, (map.getZoom() || zoom) + delta));
    map.setZoom(newZoom);
    onZoomChange?.(newZoom);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.panTo({ lat, lng: lon });
      map.setZoom(zoom);
    } catch {}
  }, [lat, lon, zoom]);

  return (
    <div className="relative" style={{ width: "100%", height: "100%", ...style }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%" }}
      />
      {/* Timestamp indicator */}
      {(radarTime || cloudTime) && (
        <div
          className="absolute top-3 left-3 z-50 flex flex-col gap-1"
          style={{ pointerEvents: "none" }}
        >
          {cloudTime && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <Cloud size={12} style={{ color: "#93c5fd" }} />
              <span className="text-[10px] font-medium" style={{ color: "#93c5fd" }}>Nuvens</span>
              <span className="text-[10px] font-mono font-bold text-white">{cloudTime}</span>
            </div>
          )}
          {radarTime && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <Radio size={12} style={{ color: "#4ade80" }} />
              <span className="text-[10px] font-medium" style={{ color: "#4ade80" }}>Radar</span>
              <span className="text-[10px] font-mono font-bold text-white">{radarTime}</span>
            </div>
          )}
        </div>
      )}
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

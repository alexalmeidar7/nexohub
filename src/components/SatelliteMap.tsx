import { useEffect, useRef, useCallback } from "react";

const GOOGLE_MAPS_API_KEY = "AIzaSyAFjw2CYxl40aDop1SsYTNC8sCrdsoR-5o";

interface SatelliteMapProps {
  lat: number;
  lon: number;
  zoom?: number;
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
      resolve(); // resolve anyway to avoid hanging
    };
    document.head.appendChild(script);
  });
}

export default function SatelliteMap({ lat, lon, zoom = 6, className, style }: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const initMap = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    await loadGoogleMaps();
    if (!window.google?.maps) return;

    // Destroy previous map
    if (mapRef.current) {
      mapRef.current = null;
      el.innerHTML = "";
    }

    const map = new google.maps.Map(el, {
      center: { lat, lng: lon },
      zoom,
      mapTypeId: "hybrid", // satellite with labels
      disableDefaultUI: true,
      gestureHandling: "none",
      keyboardShortcuts: false,
    });

    // Add weather/cloud layer
    try {
      const cloudLayer = new (google.maps as any).visualization?.WeatherLayer?.();
      if (cloudLayer) cloudLayer.setMap(map);
    } catch {
      // WeatherLayer may not be available, add cloud overlay via tile
    }

    // Add RainViewer radar overlay as a fallback weather layer
    try {
      const rvRes = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const rvData = await rvRes.json();
      if (rvData?.radar?.past?.length) {
        const latest = rvData.radar.past[rvData.radar.past.length - 1];
        const radarOverlay = new google.maps.ImageMapType({
          getTileUrl: (coord, z) =>
            `https://tilecache.rainviewer.com${latest.path}/256/${z}/${coord.x}/${coord.y}/2/1_1.png`,
          tileSize: new google.maps.Size(256, 256),
          opacity: 0.55,
          name: "Radar",
        });
        map.overlayMapTypes.push(radarOverlay);
      }
    } catch {
      /* silent */
    }

    mapRef.current = map;
  }, [lat, lon, zoom]);

  useEffect(() => {
    initMap();
    return () => {
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.panTo({ lat, lng: lon });
      map.setZoom(zoom);
    } catch {}
  }, [lat, lon, zoom]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", ...style }}
    />
  );
}

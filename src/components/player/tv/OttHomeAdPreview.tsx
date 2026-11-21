import { useEffect, useRef } from "react";
export const HOME_AD_DURATION_MS = 15_000;
export const HOME_AD_GAP_MS = 90_000;
export const HOME_AD_FADE_MS = 800;
export function isLocalHomeAdPreview() {
  return import.meta.env.DEV && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /(?:^|\/)positivafm(?:\/|$)/i.test(location.pathname);
}
export default function OttHomeAdPreview({ onActive, src = "/artifacts/local-commercial/hotpark-v2.webm" }: { onActive: (active: boolean) => void; src?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = video.current; if (!media) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const start = async () => {
      try {
        media.currentTime = 0; await media.play();
        if (stopped) return;
        onActive(true);
        timer = setTimeout(() => {
          onActive(false);
          timer = setTimeout(() => {
            media.pause();
            timer = setTimeout(() => void start(), HOME_AD_GAP_MS);
          }, HOME_AD_FADE_MS);
        }, HOME_AD_DURATION_MS);
      } catch { if (!stopped) onActive(false); }
    };
    void start();
    return () => { stopped = true; clearTimeout(timer); media.pause(); onActive(false); };
  }, [src, onActive]);
  return <video ref={video} className="ott-home-commercial" src={src} muted loop playsInline preload="auto" aria-hidden="true" />;
}

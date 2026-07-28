import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { prefetchSplashVideo } from "@/pages/player/useSplashVideoCache";

/**
 * Fires the splash-video prefetch as soon as the router lands on any
 * `/player` route (including `/:userSlug/player`). This runs in parallel
 * with the lazy chunk download for <PlayerHub />, so by the time <SplashScreen />
 * mounts the video blob is usually already cached and starts instantly.
 */
const PLAYER_ROUTE = /^\/(?:[^/]+\/)?player(?:\/|$)/;

export default function PlayerSplashPrefetch() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (PLAYER_ROUTE.test(pathname)) {
      // Fire and forget — deduped inside the module.
      prefetchSplashVideo().catch(() => {});
    }
  }, [pathname]);
  return null;
}
